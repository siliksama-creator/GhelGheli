// Sound effects for the games.
//
// Deliberately fire-and-forget: audio must NEVER break gameplay, so every
// call is wrapped and failures are swallowed (an emulator with no audio
// device, a revoked permission, a codec hiccup...). The mute preference is
// persisted so it survives app restarts.
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ═══════════════════════════════════════════════════════════════════════
/// چرا «تمرکزِ صوتی» را دستی روی `none` می‌گذاریم
/// ═══════════════════════════════════════════════════════════════════════
///
/// این ریشهٔ باگِ «صدا وسطِ دوئل قطع می‌شود» بود.
///
/// پیش‌فرضِ audioplayers روی اندروید `AndroidAudioFocus.gain` است، یعنی
/// «من تنها منبعِ صدای دستگاهم». آن پیش‌فرض برای یک اپِ پخشِ موسیقی درست
/// است، ولی ما همزمان دو چیز پخش می‌کنیم: موزیکِ لوپِ دوئل و افکت‌های
/// کوتاه. با آن پیش‌فرض، این اتفاق در هر برخورد می‌افتد:
///
///   ۱. `play(duelLock)` → `maybeRequestAudioFocus()` → سیستم تمرکز را
///      از دارندهٔ فعلی (خودِ `_musicPlayer`) می‌گیرد و به آن LOSS می‌دهد؛
///      `onLoss` داخلِ پکیج موزیک را `pause()` می‌کند.
///   ۲. کلیپ تمام می‌شود → `onCompletion()` → چون `releaseMode != LOOP`
///      متد `stop()` صدا می‌خورد → `focusManager.handleStop()` →
///      `abandonAudioFocusRequest()`.
///
/// یعنی هر افکت، تمرکز را از موزیک می‌قاپد و هنگام تمام‌شدن رهایش
/// می‌کند — و موزیک دیگر خودش برنمی‌گردد. در یک مسابقهٔ پنج‌راندی ۱۱ نقطهٔ
/// پخش داریم (بدون شمردنِ تیک‌های ثانیه‌شمار که هر ثانیه یکی‌اند)، پس
/// عملاً همان اوایلِ کار موزیک خاموش می‌شد.
///
/// `AndroidAudioFocus.none` یعنی «اصلاً درخواستِ تمرکز نده، صدایت را با
/// بقیه مخلوط کن». آن‌وقت افکت‌ها و موزیکِ خودمان روی هم می‌نشینند و هیچ
/// کدام دیگری را قطع نمی‌کند. سودِ جانبی: موزیکی که کاربر در اپِ دیگری
/// گوش می‌دهد را هم قطع نمی‌کنیم — که همان چیزی است که کامنتِ
/// «Never let game SFX hijack music the user is playing elsewhere» ادعا
/// می‌کرد ولی `PlayerMode.lowLatency` هرگز انجامش نمی‌داد.
///
/// نکته: این تنظیم سراسری است و باید **پیش از** ساختِ هر پخش‌کننده اعمال
/// شود، وگرنه پخش‌کننده‌های ازپیش‌ساخته با متنِ قدیمی می‌مانند.
final AudioContext _mixWithOthers = AudioContextConfig(
  focus: AudioContextConfigFocus.mixWithOthers,
).build();

enum Sfx {
  move('move.mp3'),
  moveOpponent('move_opponent.mp3'),
  drop('drop.mp3'),
  flip('flip.mp3'),
  matchFound('match_found.mp3'),
  yourTurn('your_turn.mp3'),
  tick('tick.mp3'),
  tickUrgent('tick_urgent.mp3'),
  timeout('timeout.mp3'),
  win('win.mp3'),
  lose('lose.mp3'),
  draw('draw.mp3'),
  tap('tap.mp3'),
  duelLock('duel_lock.mp3'),
  duelIntro('duel_intro.mp3'),
  duelRoundWin('duel_round_win.mp3'),
  duelRoundLose('duel_round_lose.mp3'),
  duelRoundDraw('duel_round_draw.mp3'),
  duelPoints('duel_points.mp3'),
  duelFinalDraw('duel_final_draw.mp3'),
  duelVictory('duel_victory.mp3'),
  duelDefeat('duel_defeat.mp3'),
  // ── صندوق کارت: زنگ‌های نرمِ جعبه‌موسیقی (جدا از افکت‌های دوئل) ──
  boxShake('box_shake.mp3'),
  boxOpen('box_open.mp3'),
  cardNormal('card_normal.mp3'),
  cardSilver('card_silver.mp3'),
  cardGold('card_gold.mp3'),
  cardPremium('card_premium.mp3'),
  cardLegend('card_legend.mp3');

  const Sfx(this.file);
  final String file;
}

/// موزیک باید با کوچک‌شدنِ اپ ساکت شود و با بازگشت ادامه یابد.
///
/// بدونِ این، خروجِ موقت از اپ (یک تماس، یک نوتیفیکیشن، فشردنِ دکمهٔ
/// خانه) موزیکِ دوئل را پشتِ سرِ کاربر روشن نگه می‌داشت. `dispose` صفحه
/// این را نمی‌گرفت، چون رفتن به پس‌زمینه صفحه را dispose نمی‌کند.
///
/// چرا کلاسِ جدا و نه `with WidgetsBindingObserver` روی خودِ `GameAudio`:
/// همان دلیلِ `MemoryGuard` — آن اینترفیس بین نسخه‌های فلاتر عضو تازه
/// می‌گیرد و پیاده‌سازیِ مستقیمش در هر ارتقا بیلد را می‌شکند.
class _AudioLifecycle with WidgetsBindingObserver {
  _AudioLifecycle(this._audio);

  final GameAudio _audio;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _audio._resumeMusicIfWanted();
    } else {
      _audio._suspendMusic();
    }
  }
}

class GameAudio {
  GameAudio._();
  static final GameAudio instance = GameAudio._();

  static const _prefsKey = 'game_sound_enabled';
  // A small pool: overlapping short clips (e.g. a tick landing on a move)
  // would otherwise cut each other off on a single player.
  static const _poolSize = 3;

  final List<AudioPlayer> _pool = [];
  final AudioPlayer _musicPlayer = AudioPlayer();
  // پخش‌کنندهٔ جدا برای صدای لرزشِ صندوق — با loop روی فایلِ مخصوص،
  // دقیقاً هم‌زمان با انیمیشن شروع و با stopShake قطع می‌شود.
  final AudioPlayer _shakePlayer = AudioPlayer();
  int _next = 0;
  bool _enabled = true;
  bool _ready = false;
  bool _duelMusicRequested = false;
  bool _duelMusicPlaying = false;
  _AudioLifecycle? _lifecycle;

  bool get enabled => _enabled;

  Future<void> load() async {
    // متنِ سراسری باید پیش از ساختِ هر پخش‌کننده اعمال شود — توضیح کامل
    // بالای `_mixWithOthers`. بدونِ این، افکت‌ها موزیکِ دوئل را قطع می‌کنند.
    try {
      await AudioPlayer.global.setAudioContext(_mixWithOthers);
    } catch (e) {
      debugPrint('audio context failed: $e');
    }
    if (_lifecycle == null) {
      _lifecycle = _AudioLifecycle(this);
      WidgetsBinding.instance.addObserver(_lifecycle!);
    }
    try {
      final sp = await SharedPreferences.getInstance();
      _enabled = sp.getBool(_prefsKey) ?? true;
    } catch (_) {
      _enabled = true;
    }
  }

  Future<void> setEnabled(bool v) async {
    _enabled = v;
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setBool(_prefsKey, v);
    } catch (_) {/* preference is cosmetic; ignore storage failures */}
    if (!v) {
      await stopAll();
    } else if (_duelMusicRequested) {
      startDuelMusic();
    }
  }

  void _init() {
    if (_ready) return;
    _ready = true;
    for (var i = 0; i < _poolSize; i++) {
      final p = AudioPlayer()..setReleaseMode(ReleaseMode.stop);
      p.setPlayerMode(PlayerMode.lowLatency);
      // متن را روی خودِ پخش‌کننده هم می‌گذاریم، نه فقط سراسری: `load()`
      // در main.dart بدون await صدا زده می‌شود، پس اگر کاربر خیلی سریع
      // وارد بازی شود ممکن است پخش‌کننده زودتر از تنظیمِ سراسری ساخته
      // شود. این خط آن مسابقه را بی‌اثر می‌کند.
      p.setAudioContext(_mixWithOthers).catchError((Object e) {
        debugPrint('sfx context failed: $e');
      });
      _pool.add(p);
    }
  }

  /// Plays a clip. Safe to call from anywhere, never throws, never awaits
  /// the actual playback.
  void play(Sfx sfx, {double volume = 1.0}) {
    if (!_enabled) return;
    try {
      _init();
      final player = _pool[_next % _pool.length];
      _next++;
      player
        ..setVolume(volume.clamp(0.0, 1.0))
        ..play(AssetSource('sfx/${sfx.file}')).catchError((Object e) {
          debugPrint('sfx ${sfx.file} failed: $e');
        });
    } catch (e) {
      debugPrint('sfx error: $e');
    }
  }

  /// Starts the original card-duel soundtrack at a restrained level. The
  /// request survives a temporary mute, so unmuting during a duel resumes it.
  void startDuelMusic() {
    _duelMusicRequested = true;
    if (!_enabled || _duelMusicPlaying) return;
    _duelMusicPlaying = true;
    () async {
      try {
        // همان دلیلِ بالا: موزیک هم نباید تمرکزِ صوتی بگیرد، وگرنه خودش
        // با اولین افکت تمرکز را از دست می‌دهد و پکیج pause‌اش می‌کند.
        await _musicPlayer.setAudioContext(_mixWithOthers);
        await _musicPlayer.setReleaseMode(ReleaseMode.loop);
        await _musicPlayer.setVolume(0.20);
        await _musicPlayer.play(AssetSource('sfx/duel_music.mp3'));
      } catch (e) {
        _duelMusicPlaying = false;
        debugPrint('duel music failed: $e');
      }
    }();
  }

  /// صدای لرزشِ صندوق — loop تا وقتی stopShake صدا زده شود.
  void playShake() {
    if (!_enabled) return;
    try {
      () async {
        await _shakePlayer.stop();
        await _shakePlayer.setReleaseMode(ReleaseMode.loop);
        await _shakePlayer.setVolume(0.55);
        await _shakePlayer.play(AssetSource('sfx/box_shake.mp3'));
      }();
    } catch (e) {
      debugPrint('shake sfx failed: $e');
    }
  }

  Future<void> stopShake() async {
    try {
      await _shakePlayer.stop();
    } catch (_) {/* ignore */}
  }

  Future<void> stopDuelMusic() async {
    _duelMusicRequested = false;
    _duelMusicPlaying = false;
    try {
      await _musicPlayer.stop();
    } catch (_) {/* ignore */}
  }

  /// اپ کوچک شد: موزیک را نگه دار ولی «درخواست» را پاک نکن، تا موقعِ
  /// برگشت بدانیم باید ادامه دهیم. از `pause` استفاده می‌کنیم نه `stop`
  /// تا از همان‌جا ادامه یابد و صحنه پرش نداشته باشد.
  void _suspendMusic() {
    if (!_duelMusicPlaying) return;
    _musicPlayer.pause().catchError((Object e) {
      debugPrint('duel music pause failed: $e');
    });
  }

  void _resumeMusicIfWanted() {
    if (!_enabled || !_duelMusicRequested || !_duelMusicPlaying) return;
    _musicPlayer.resume().catchError((Object e) {
      debugPrint('duel music resume failed: $e');
    });
  }

  Future<void> stopAll() async {
    _duelMusicPlaying = false;
    try {
      await _musicPlayer.stop();
    } catch (_) {/* ignore */}
    for (final p in _pool) {
      try {
        await p.stop();
      } catch (_) {/* ignore */}
    }
  }

  Future<void> dispose() async {
    _duelMusicRequested = false;
    _duelMusicPlaying = false;
    if (_lifecycle != null) {
      WidgetsBinding.instance.removeObserver(_lifecycle!);
      _lifecycle = null;
    }
    try {
      await _musicPlayer.dispose();
      await _shakePlayer.dispose();
    } catch (_) {/* ignore */}
    for (final p in _pool) {
      try {
        await p.dispose();
      } catch (_) {/* ignore */}
    }
    _pool.clear();
    _ready = false;
  }
}
