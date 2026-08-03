// Tap-game engine: the single source of truth for game state.
//
// A ChangeNotifier, matching how SoloSession already works in this project —
// no new state-management package is introduced. The widget layer listens and
// renders; it never mutates state directly.
//
// Responsibilities, in order of importance:
//   1. Count taps that pass the anti-cheat guard, and only those.
//   2. Advance levels using the configured curve.
//   3. Persist progress locally so closing the app loses nothing.
//   4. Batch-report to the server and defer to the server's answer.
import 'dart:async';

import 'package:flutter/foundation.dart';

import 'tap_config.dart';
import 'tap_day.dart';
import 'tap_guard.dart';
import 'tap_storage.dart';
import 'tap_sync.dart';

/// Emitted for one-shot UI reactions (sound, haptics, confetti).
enum TapEvent {
  tap,
  rejected,
  levelUp,
  skinChanged,
  gameCompleted,

  /// The player just used up the last of today's level allowance.
  ///
  /// Distinct from the steady `dailyCapReached` state so the celebration/
  /// explanation fires once rather than on every subsequent tap.
  dailyCapHit,
}

class TapEngine extends ChangeNotifier {
  TapEngine({
    required this.config,
    required TapStorage storage,
    TapSync? sync,
  })  : _storage = storage,
        _sync = sync {
    _guard = TapGuard(config: config);
  }

  final TapGameConfig config;
  final TapStorage _storage;
  final TapSync? _sync;

  late final TapGuard _guard;

  /// Monotonic clock. Immune to the user changing the device clock, which a
  /// DateTime-based rate limiter would not be.
  final Stopwatch _clock = Stopwatch();

  Timer? _flushTimer;
  Timer? _saveDebounce;

  TapProgress _progress = const TapProgress();
  bool _loaded = false;
  bool _syncing = false;
  bool _disposed = false;

  // Taps accumulated since the last successful flush.
  int _batchTaps = 0;
  int _batchFlagged = 0;
  int _batchStartMs = 0;

  /// Last one-shot event, consumed by the view.
  TapEvent? _lastEvent;
  int _eventSerial = 0;

  String? _notice;

  // ── public read-only surface ─────────────────────────────────────────────

  bool get loaded => _loaded;
  int get level => _progress.level;
  int get taps => _progress.taps;
  int get totalTaps => _progress.totalTaps;
  int get pendingTaps => _progress.pendingTaps;
  int get flaggedTaps => _progress.flaggedTaps;

  int get requiredTaps => config.requiredTaps(_progress.level);
  String get skin => config.skinForLevel(_progress.level);
  int get skinIndex => config.skinIndexForLevel(_progress.level);
  int get currentRate => _guard.currentRate;
  bool get nearRateLimit => _guard.nearLimit;
  bool get isComplete => _progress.level > config.levelCount;

  // ── daily cap ────────────────────────────────────────────────────────────

  /// Levels cleared today, with the day checked.
  ///
  /// A stored count whose day is not today is worth zero. Checking here
  /// rather than at midnight means no timer has to fire while the app is
  /// backgrounded — the reset simply *is* true the next time anyone asks.
  int get levelsToday =>
      _progress.levelsDay == tehranDay() ? _progress.levelsToday : 0;

  /// How many more levels the player may clear today.
  int get levelsLeftToday =>
      (config.levelsPerDay - levelsToday).clamp(0, config.levelsPerDay);

  /// True while the player has run out of levels for today. Taps still
  /// register — they count toward the lifetime total and the leaderboard —
  /// but the level bar stops one tap short.
  bool get dailyCapReached => !isComplete && levelsLeftToday <= 0;

  /// Time until the allowance refills, for an honest countdown.
  Duration get untilReset => untilTehranMidnight();

  /// 0..1 progress within the current level.
  double get levelProgress {
    if (isComplete) return 1;
    final need = requiredTaps;
    if (need <= 0) return 1;
    return (_progress.taps / need).clamp(0.0, 1.0);
  }

  int get tapsRemaining =>
      isComplete ? 0 : (requiredTaps - _progress.taps).clamp(0, 1 << 30);

  /// Levels until the character changes; null when no more skins remain.
  /// Levels remaining until the character changes; null when no further skin
  /// is reachable.
  ///
  /// Derived by SEARCHING for the next level whose skin differs, rather than
  /// recomputing the boundary arithmetic by hand. That keeps this in lockstep
  /// with [TapGameConfig.skinIndexForLevel] — the previous version duplicated
  /// the formula and silently disagreed with it after the boundary was fixed.
  int? get levelsUntilNextSkin {
    if (isComplete) return null;
    for (var lv = _progress.level + 1; lv <= config.levelCount; lv++) {
      if (config.skinIndexForLevel(lv) != skinIndex) {
        return lv - _progress.level;
      }
    }
    return null;
  }

  TapEvent? get lastEvent => _lastEvent;
  int get eventSerial => _eventSerial;
  String? get notice => _notice;

  // ── lifecycle ────────────────────────────────────────────────────────────

  Future<void> init() async {
    _progress = await _storage.load();
    // Defend against a hand-edited prefs file claiming level 9999.
    if (_progress.level > config.levelCount + 1) {
      _progress = _progress.copyWith(level: config.levelCount + 1);
    }
    _loaded = true;
    _clock.start();
    _batchStartMs = _clock.elapsedMilliseconds;
    _startFlushTimer();
    _safeNotify();
    // Reconcile with the server on entry: another device may be ahead, and
    // the daily allowance is shared between them.
    //
    // This used to be `_flush(force: true)`, which never sent anything on
    // entry because the batch is empty — see TapSync.fetch() for why that
    // silently did nothing for the life of the feature.
    unawaited(_reconcile());
  }

  /// Pulls the server's view once, on entry.
  Future<void> _reconcile() async {
    final sync = _sync;
    if (sync == null) return;
    final result = await sync.fetch();
    if (result == null || _disposed) return;

    final sl = result.serverLevel;
    final st = result.serverLevelTaps;
    if (sl != null && st != null && sl >= 1) {
      final safeLevel =
          sl > config.levelCount + 1 ? config.levelCount + 1 : sl;
      // Only move FORWARD. A device that played offline is legitimately
      // ahead of the server until its taps are flushed; adopting the
      // server's lower number would delete that progress before it was
      // ever sent.
      final ahead = safeLevel > _progress.level ||
          (safeLevel == _progress.level && st > _progress.taps);
      if (ahead) {
        _progress = _progress.copyWith(
          level: safeLevel,
          taps: st.clamp(0, config.requiredTaps(safeLevel)),
          totalTaps: result.serverTotalTaps ?? _progress.totalTaps,
        );
      }
    }
    // The allowance is adopted unconditionally (well, by the stricter-of-two
    // rule inside): unlike level progress, spending it elsewhere is not
    // something local play can undo.
    _adoptDailyAllowance(result);
    await _persist(immediate: true);
    _safeNotify();
  }

  void _startFlushTimer() {
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(config.flushInterval, (_) {
      // Nothing to send once the cap is reached — taps are refused outright,
      // so the batch can only be empty. `_flush` would return immediately
      // anyway; skipping it means the timer's callback is the only thing
      // running on a screen the player may leave open for a long time.
      if (dailyCapReached && _batchTaps <= 0 && _batchFlagged <= 0) return;
      _flush();
    });
  }

  // ── gameplay ─────────────────────────────────────────────────────────────

  /// Registers one tap. Returns true when it counted.
  bool tap() {
    if (!_loaded || isComplete) return false;

    // DAILY CAP — refuse before the guard, not after.
    //
    // The screen replaces the character with a locked panel at this point, so
    // in practice nothing calls through. The check stays because a queued
    // gesture can arrive in the same frame the cap is reached, and because
    // "the UI hides it" is not a rule — this is.
    //
    // Refusing here rather than counting-but-not-advancing is deliberate and
    // matches what the owner asked for: the game is locked, not throttled.
    // It also means a capped player generates no batches at all, so the
    // screen costs nothing while it sits there.
    if (dailyCapReached) return false;

    final nowMs = _clock.elapsedMilliseconds;
    final verdict = _guard.register(nowMs);

    if (verdict != TapVerdict.accepted) {
      _batchFlagged++;
      _progress = _progress.copyWith(flaggedTaps: _progress.flaggedTaps + 1);
      _notice = verdict == TapVerdict.rateLimited
          ? 'یواش‌تر! سرعت ضربه‌ها بیش از حد مجاز است'
          : null;
      _emit(TapEvent.rejected);
      return false;
    }

    _notice = null;
    _batchTaps++;

    var next = _progress.copyWith(
      taps: _progress.taps + 1,
      totalTaps: _progress.totalTaps + 1,
      pendingTaps: _progress.pendingTaps + 1,
    );

    final previousSkin = config.skinIndexForLevel(next.level);
    var leveledUp = false;
    var justCapped = false;

    // The allowance is read once, before the loop. Reading `levelsLeftToday`
    // inside it would consult `_progress`, which the loop is mutating, and
    // the day string would be recomputed on every iteration.
    final today = tehranDay();
    var left = levelsLeftToday;

    // `while`, not `if`: a huge offline batch could clear several levels.
    //
    // Bounded by levelCount iterations. requiredTaps can no longer return a
    // non-positive number, but a zero-cost level would make this spin
    // forever and freeze the app — a guard here costs nothing and turns a
    // hang into a harmless no-op.
    var guard = 0;
    while (next.level <= config.levelCount &&
        next.taps >= config.requiredTaps(next.level) &&
        guard++ < config.levelCount) {
      final cost = config.requiredTaps(next.level);
      if (cost <= 0) break;
      if (left <= 0) {
        // Out of levels for today. DISCARD the surplus rather than banking
        // it — banking would mean the player wakes up tomorrow with three
        // levels already cleared, turning the cap into a queue.
        //
        // Clamp, do not set: `min` leaves an honest counter alone and only
        // bites when a batch genuinely overshot. Setting it to cost-1 would
        // park the bar at 99% every single day, which reads as "one tap
        // away" for the whole evening. The server's advance() clamps the
        // same way, so the next sync agrees.
        final t = next.taps < cost - 1 ? next.taps : cost - 1;
        next = next.copyWith(taps: t);
        justCapped = true;
        break;
      }
      next = next.copyWith(level: next.level + 1, taps: next.taps - cost);
      leveledUp = true;
      left--;
    }

    if (leveledUp) {
      // Write the count and the day together — a count without the day it
      // belongs to is what makes a stale counter look current.
      next = next.copyWith(
        levelsToday: config.levelsPerDay - left,
        levelsDay: today,
      );
    }

    _progress = next;

    if (leveledUp) {
      _emit(TapEvent.levelUp);
      if (config.skinIndexForLevel(_progress.level) != previousSkin) {
        _emit(TapEvent.skinChanged);
      }
      if (isComplete) _emit(TapEvent.gameCompleted);
      if (dailyCapReached) _emit(TapEvent.dailyCapHit);
      // A level boundary is a natural, cheap moment to checkpoint.
      unawaited(_flush(force: true));
      unawaited(_persist(immediate: true));
    } else if (justCapped) {
      // Reached the wall without gaining a level (the allowance was already
      // spent when this tap landed). Still worth a checkpoint and a flush so
      // the server sees the same picture.
      _emit(TapEvent.dailyCapHit);
      unawaited(_flush(force: true));
      unawaited(_persist(immediate: true));
    } else {
      _emit(TapEvent.tap);
      _persistDebounced();
      if (_batchTaps >= config.maxBatchTaps) unawaited(_flush());
    }

    return true;
  }

  void _emit(TapEvent event) {
    _lastEvent = event;
    _eventSerial++;
    _safeNotify();
  }

  // ── persistence ──────────────────────────────────────────────────────────

  /// Disk writes are debounced: a 10-taps-per-second player would otherwise
  /// hammer SharedPreferences continuously for no benefit.
  void _persistDebounced() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(const Duration(milliseconds: 600), () {
      unawaited(_persist());
    });
  }

  Future<void> _persist({bool immediate = false}) async {
    if (immediate) _saveDebounce?.cancel();
    await _storage.save(_progress);
  }

  // ── server sync ──────────────────────────────────────────────────────────

  /// How many taps a window of [elapsedMs] can plausibly contain.
  ///
  /// Mirrors `plausibleCeiling()` in backend/src/services/tapGameService.js
  /// but uses the CLIENT's stricter rate, so a batch we send is always
  /// comfortably inside what the server will accept. Kept slightly
  /// conservative on purpose: the cost of under-sending is a few seconds of
  /// delay, the cost of over-sending is the player losing taps.
  int _affordableTaps(int elapsedMs) {
    const burstAllowance = 20;
    final byRate = (elapsedMs / 1000.0) * config.maxTapsPerSecond;
    return byRate.ceil() + burstAllowance;
  }

  Future<void> _flush({bool force = false}) async {
    final sync = _sync;
    if (sync == null) return;
    if (_syncing) return;
    if (!force && _batchTaps <= 0 && _batchFlagged <= 0) return;
    if (_batchTaps <= 0 && _batchFlagged <= 0) return;

    _syncing = true;
    final nowMs = _clock.elapsedMilliseconds;
    final elapsed = nowMs - _batchStartMs;

    // CAP THE BATCH TO WHAT ITS OWN WINDOW CAN JUSTIFY.
    //
    // The server rejects any batch whose tap count exceeds what a human hand
    // could produce in the reported window. Two legitimate situations used to
    // trip that and BURN the player's taps:
    //
    //   * `maxBatchTaps` fires back-to-back flushes. The second one carries a
    //     full 400 taps but its window is only the few milliseconds since the
    //     previous flush, so it looks impossible.
    //   * A level-up forces an immediate flush right after a timed one.
    //
    // Sending only what the window supports and KEEPING the remainder for the
    // next flush fixes both: nothing is lost, and an attacker gains nothing
    // because the server still enforces the same ceiling independently.
    final affordable = _affordableTaps(elapsed);
    final sentTaps = _batchTaps <= affordable ? _batchTaps : affordable;
    final sentFlagged = _batchFlagged;

    if (sentTaps <= 0 && sentFlagged <= 0) {
      // Nothing can be justified yet — wait for the window to grow.
      _syncing = false;
      return;
    }

    // Reset the accumulator BEFORE awaiting so taps landing during the round
    // trip belong to the next batch instead of being double-counted. Any
    // remainder above the cap is carried forward, never dropped.
    _batchTaps -= sentTaps;
    _batchFlagged = 0;
    _batchStartMs = nowMs;

    try {
      final result = await sync.flush(TapBatch(
        taps: sentTaps,
        flagged: sentFlagged,
        elapsedMs: elapsed <= 0 ? 1 : elapsed,
        level: _progress.level,
        levelTaps: _progress.taps,
        sequence: sync.nextSequence(),
      ));

      if (result == null) return;

      if (result.ok) {
        _progress = _progress.copyWith(
          pendingTaps:
              (_progress.pendingTaps - sentTaps).clamp(0, 1 << 40),
        );

        // The server is authoritative. If it disagrees, adopt its numbers
        // rather than letting a tampered client drift ahead.
        final sl = result.serverLevel;
        final st = result.serverLevelTaps;
        if (sl != null && st != null && sl >= 1) {
          // CLAMP THE UPPER BOUND TOO.
          //
          // init() guards the value loaded from disk, but nothing guarded the
          // value the SERVER sends — and the engine adopts it verbatim. A
          // level beyond levelCount+1 used to flow straight into the tap
          // curve, which then overflowed and threw on every rebuild. That is
          // the crash the owner saw "after a while": it needs a sync to
          // happen first, so it never shows up immediately.
          //
          // levelCount+1 is the legitimate "finished" sentinel, so that is
          // the ceiling.
          final safeLevel = sl > config.levelCount + 1
              ? config.levelCount + 1
              : sl;
          if (safeLevel != _progress.level ||
              (st - _progress.taps).abs() > 5) {
            _progress = _progress.copyWith(
              level: safeLevel,
              taps: st.clamp(0, config.requiredTaps(safeLevel)),
              totalTaps: result.serverTotalTaps ?? _progress.totalTaps,
            );
          }
        }
        _adoptDailyAllowance(result);
        await _persist(immediate: true);
        _safeNotify();
      } else if (result.rejected) {
        // Burned deliberately: re-queuing a batch the server called
        // implausible would just retry the cheat forever.
        _progress = _progress.copyWith(
          pendingTaps: (_progress.pendingTaps - sentTaps).clamp(0, 1 << 40),
        );
        _notice = result.message ?? 'ضربه‌های غیرعادی نادیده گرفته شد';
        await _persist(immediate: true);
        _safeNotify();
      } else {
        // Network failure — put them back so the next flush retries.
        _batchTaps += sentTaps;
        _batchFlagged += sentFlagged;
      }
    } finally {
      _syncing = false;
    }
  }

  /// Takes the server's word for how much of today's allowance is left.
  ///
  /// STRICTER OF THE TWO, never the looser. The server sees every device on
  /// the account, so its count can only be higher than ours; but a response
  /// can also arrive out of order (a slow batch landing after a fast one), so
  /// blindly adopting it could hand back an allowance that was just spent.
  /// Taking the minimum is correct in both directions and cannot be gamed.
  void _adoptDailyAllowance(TapSyncResult result) {
    final left = result.levelsLeftToday;
    if (left == null) return; // old server, or nothing reported
    final serverUsed =
        (config.levelsPerDay - left).clamp(0, config.levelsPerDay);
    if (serverUsed <= levelsToday) return;
    _progress = _progress.copyWith(
      levelsToday: serverUsed,
      levelsDay: tehranDay(),
    );
  }

  /// Flush on the way out (backgrounding, leaving the screen).
  Future<void> flushNow() => _flush(force: true);

  // ── admin/debug ──────────────────────────────────────────────────────────

  Future<void> resetProgress() async {
    _progress = const TapProgress();
    _guard.reset();
    _batchTaps = 0;
    _batchFlagged = 0;
    _batchStartMs = _clock.elapsedMilliseconds;
    await _storage.clear();
    _safeNotify();
  }

  void _safeNotify() {
    if (_disposed) return;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _flushTimer?.cancel();
    _saveDebounce?.cancel();
    // Best-effort final save; the future is intentionally not awaited because
    // dispose() cannot be async.
    unawaited(_storage.save(_progress));
    _clock.stop();
    super.dispose();
  }
}
