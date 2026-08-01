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
import 'tap_guard.dart';
import 'tap_storage.dart';
import 'tap_sync.dart';

/// Emitted for one-shot UI reactions (sound, haptics, confetti).
enum TapEvent { tap, rejected, levelUp, skinChanged, gameCompleted }

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
  int? get levelsUntilNextSkin {
    if (isComplete) return null;
    final nextBoundary =
        ((_progress.level - 1) ~/ config.levelsPerSkin + 1) * config.levelsPerSkin;
    if (nextBoundary >= config.levelCount) return null;
    if (config.skinIndexForLevel(nextBoundary + 1) == skinIndex) return null;
    return nextBoundary + 1 - _progress.level;
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
    // Reconcile with the server on entry: another device may be ahead.
    unawaited(_flush(force: true));
  }

  void _startFlushTimer() {
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(config.flushInterval, (_) => _flush());
  }

  // ── gameplay ─────────────────────────────────────────────────────────────

  /// Registers one tap. Returns true when it counted.
  bool tap() {
    if (!_loaded || isComplete) return false;

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

    // `while`, not `if`: a huge offline batch could clear several levels.
    while (next.level <= config.levelCount &&
        next.taps >= config.requiredTaps(next.level)) {
      final cost = config.requiredTaps(next.level);
      next = next.copyWith(level: next.level + 1, taps: next.taps - cost);
      leveledUp = true;
    }

    _progress = next;

    if (leveledUp) {
      _emit(TapEvent.levelUp);
      if (config.skinIndexForLevel(_progress.level) != previousSkin) {
        _emit(TapEvent.skinChanged);
      }
      if (isComplete) _emit(TapEvent.gameCompleted);
      // A level boundary is a natural, cheap moment to checkpoint.
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

  Future<void> _flush({bool force = false}) async {
    final sync = _sync;
    if (sync == null) return;
    if (_syncing) return;
    if (!force && _batchTaps <= 0 && _batchFlagged <= 0) return;
    if (_batchTaps <= 0 && _batchFlagged <= 0) return;

    _syncing = true;
    final sentTaps = _batchTaps;
    final sentFlagged = _batchFlagged;
    final nowMs = _clock.elapsedMilliseconds;
    final elapsed = nowMs - _batchStartMs;

    // Reset the accumulator BEFORE awaiting so taps landing during the round
    // trip belong to the next batch instead of being double-counted.
    _batchTaps = 0;
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
          if (sl != _progress.level || (st - _progress.taps).abs() > 5) {
            _progress = _progress.copyWith(
              level: sl,
              taps: st.clamp(0, config.requiredTaps(sl)),
              totalTaps: result.serverTotalTaps ?? _progress.totalTaps,
            );
          }
        }
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
