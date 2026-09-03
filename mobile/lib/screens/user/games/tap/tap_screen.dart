// Tap game screen — the only widget that knows about layout.
//
// State lives in TapEngine (a ChangeNotifier, matching SoloSession elsewhere
// in this app); this file listens and paints. Follows the same
// `{Game}Screen(api, onBack)` contract as the other games so the hub can
// launch it identically.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../api_client.dart';
import '../../../../theme/tokens.dart';
import '../../../../widgets/avatar_image.dart';
import 'tap_character.dart';
import 'tap_config.dart';
import 'tap_day.dart';
import 'tap_engine.dart';
import 'tap_storage.dart';
import 'tap_sync.dart';
import '../../../../core/app_config.dart';

class TapGameScreen extends StatefulWidget {
  const TapGameScreen({
    super.key,
    required this.api,
    required this.onBack,
    this.config = const TapGameConfig(),
  });

  final ApiClient api;
  final VoidCallback onBack;
  final TapGameConfig config;

  @override
  State<TapGameScreen> createState() => _TapGameScreenState();
}

class _TapGameScreenState extends State<TapGameScreen>
    with WidgetsBindingObserver {
  static const Color _accent = Color(0xFF84CC16);

  // ── بوتِ دومرحله‌ای با منحنیِ زندهٔ ادمین (دورِ ۳۳) ──────────────────────
  //
  // خواستهٔ مالک: «هر تغییر ادمین بدون نیاز به بروزرسانی کامل اپلیکیشن
  // اندروید باید اعمال بشه». تا امروز منحنی (تعداد لول، جمعِ امتیاز، شیب،
  // سقفِ روزانه) داخلِ APK هاردکد بود؛ حالا صفحه قبل از ساختِ موتور آن
  // را از /api/config می‌خواند و روی پیش‌فرضِ تاریخی مرج می‌کند.
  //
  // چرا قبل از موتور و نه بعدش: config در TapEngine نهایی (final) است و
  // کلِ حساب‌های موتور — سطح، سقفِ روزانه، پوست‌ها — با همان ساخته
  // می‌شود. عوض‌کردنِ وسطِ بازی یعنی ریختنِ پیشرفتِ محلی روی منحنیِ
  // دیگری؛ سرور بلافاصله پس از init اصلاح می‌کند ولی ساختنِ موتور با
  // منحنیِ درست از همان لحظه یعنی هیچ اصلاحی لازم نمی‌شود.
  //
  // سقفِ انتظار ۲.۵ ثانیه است: آفلاین یا کند، بازی با اعدادِ پیش‌فرض
  // باز می‌شود و همان‌طور بازی می‌کند (سرور بعداً هنگامِ sync اصلاح
  // می‌کند — همان قراردادِ همیشگیِ «سرور منبعِ حقیقت است»).
  late final TapEngine _engine;
  bool _engineCreated = false;
  bool _booting = true;
  final GlobalKey<TapCharacterState> _characterKey =
      GlobalKey<TapCharacterState>();

  int _seenEventSerial = 0;

  // Tap intentionally has no audio. Rapid sound-effect playback was the only
  // native resource opened on every accepted tap and could saturate the
  // phone audio stack during a long session. Other games keep their audio;
  // this screen never imports or initializes GameAudio.
  //
  // Haptics are retained as lightweight feedback, but are capped at 8/s.
  // Milestone haptics are rare and are never throttled.
  final Stopwatch _hapticClock = Stopwatch()..start();
  static const Duration _tapHapticMinGap = Duration(milliseconds: 125);

  // ═══════════════════════════════════════════════════════════════════════
  // چرا شمارنده‌ها ValueNotifier شدند و نه setState
  // ═══════════════════════════════════════════════════════════════════════
  //
  // گزارش مالک: «بازی ضربه‌زن به شدت سرعت موبایل رو پایین میاره بعد
  // مدتی».
  //
  // علت: هر ضربه `setState` روی کلِ `_TapGameScreenState` صدا می‌زد. یعنی در
  // هر فریم **تمامِ** درخت دوباره ساخته می‌شد:
  //
  //   • `_Header` با شش ویجتِ متنی و `_DailyDots`
  //   • `_ProgressPanel` با `TweenAnimationBuilder`
  //   • و مهم‌تر از همه `TapCharacter` — که خودش تصویرِ شخصیت،
  //     `AnimatedBuilder`، `CustomPaint`ِ شناورها و یک `Stack` دارد.
  //
  // `TapCharacter` بهینه است و **نیازی به بازسازی ندارد**: کلِ انیمیشنش
  // با کنترلرهای داخلیِ خودش اجرا می‌شود. ولی چون والد دوباره ساخته
  // می‌شد، فلاتر مجبور بود کلِ آن زیردرخت را هم دوباره بسازد و تطبیق
  // دهد. با ۱۲ ضربه بر ثانیه یعنی ۱۲ بار در ثانیه کارِ کاملاً بی‌فایده.
  //
  // «بعد مدتی» هم توضیح دارد: فشارِ مداومِ ساختِ ویجت، GC را وادار به
  // اجرای مکرر می‌کند و گوشی گرم و کند می‌شود.
  //
  // حالا فقط دو تکهٔ کوچک — هدر و پنلِ پیشرفت — به تغییرات گوش می‌دهند.
  // بقیهٔ درخت، از جمله `TapCharacter`، **اصلاً بازسازی نمی‌شود**.
  //
  //  `_uiTick` عمداً یک شمارنده است و نه خودِ داده: موتور منبعِ حقیقت
  //    است و این فقط می‌گوید «چیزی عوض شد، دوباره بخوان».
  final ValueNotifier<int> _uiTick = ValueNotifier<int>(0);

  /// وضعیت‌هایی که **ساختار** صفحه را عوض می‌کنند (نه فقط عدد).
  ///
  /// این‌ها نادرند (چند بار در کلِ بازی) ولی وقتی اتفاق می‌افتند کلِ
  /// صفحه باید عوض شود — مثلاً شخصیت جای خودش را به «سهمیهٔ امروز تمام
  /// شد» می‌دهد. برای این‌ها `setState` درست است.
  bool _lastComplete = false;
  bool _lastCapReached = false;
  String? _lastSkin;
  String? _lastNotice;

  // ── سکهٔ لول‌آپ جلوی چشمِ کاربر (خواستهٔ مالک) ──
  int _seenCoinsSerial = 0;
  int? _coinsToast;
  int? _coinsTotal;
  Timer? _coinsToastTimer;

  /// اقتصادِ بازی‌ها از /api/config — سکهٔ هر لول و درصدِ انتقالِ سکه.
  Map<String, dynamic>? _economy;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  Future<void> _boot() async {
    var cfg = widget.config;
    Map<String, dynamic>? economy;
    try {
      final res = await widget.api
          .get('/api/config')
          .timeout(const Duration(milliseconds: 2500));
      if (res is Map) {
        // این صفحه هم `/api/config` را خودش می‌گیرد؛ همان بدنه را به منبع
        // می‌دهیم تا «منبعِ یکتا» شعارِ معماری نماند: بیِ این خط، متنِ
        // زندهٔ این صفحه تا باری که home_shell config را می‌گیرد (یا تا
        // بازگشت از پس‌زمینه) کهنه می‌ماند — یعنی کاربر عددِ امروز را در
        // جدول می‌بیند و جملهٔ دیروز را در توضیح. برای تستِ «۲۰ تغییرِ
        // پنل» بدترین حالت همین است: پنل کار می‌کند ولی نصفِ صفحه نه.
        AppConfig.instance.apply(res);
        final m = Map<String, dynamic>.from(res);
        if (m['economy'] is Map) {
          economy = Map<String, dynamic>.from(m['economy']);
        }
        // ── منحنی از تنظیماتِ ادمین ──
        final curve = economy?['tapCurve'];
        if (curve is Map) {
          cfg = cfg.copyWith(
            levelCount: (curve['levelCount'] as num?)?.toInt(),
            totalPoints: (curve['totalPoints'] as num?)?.toInt(),
            growthFactor: (curve['growthFactor'] as num?)?.toDouble(),
            levelsPerDay: (curve['levelsPerDay'] as num?)?.toInt(),
          );
        }
      }
    } catch (_) {
      // آفلاین/کند — همان مسیرِ پیش‌فرض؛ سرور بعداً اصلاح می‌کند.
    }
    if (!mounted) return;
    setState(() => _economy = economy);
    _engine = TapEngine(
      config: cfg,
      storage: TapStorage(),
      sync: TapSync(api: widget.api),
    )..addListener(_onEngineChanged);
    _engineCreated = true;
    unawaited(_engine.init());
    if (mounted) setState(() => _booting = false);
  }



  @override
  void dispose() {
    // Must be cancelled: a pending rebuild firing after dispose would call
    // setState on a defunct State.
    _rebuildTimer?.cancel();
    _coinsToastTimer?.cancel();
    _hapticClock.stop();
    _uiTick.dispose();
    WidgetsBinding.instance.removeObserver(this);
    // با بوتِ دومرحله‌ای ممکن است کاربر قبل از ساخته‌شدنِ موتور خارج شود؛
    // دست‌زدن به فیلدِ lateِ مقدارنگرفته خودش کرش است.
    if (_engineCreated) {
      _engine.removeListener(_onEngineChanged);
      _engine.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Banking taps before the OS can kill us is what makes "close the app and
    // come back" lossless.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _engine.flushNow();
    }
  }

  void _onEngineChanged() {
    if (!mounted) return;

    // Coalesce rebuilds to one per frame.
    //
    // The engine notifies on every tap, and at the 12/s ceiling a player who
    // is hammering also generates a notification for every REJECTED tap —
    // taps that change nothing on screen. Each one triggered a full subtree
    // rebuild including the progress bar's TweenAnimationBuilder. Marking
    // dirty at most once per frame keeps the UI identical while cutting the
    // work to what the display can actually show.
    if (_engine.eventSerial != _seenEventSerial) {
      _seenEventSerial = _engine.eventSerial;
      switch (_engine.lastEvent) {
        case TapEvent.tap:
          if (_hapticClock.elapsed >= _tapHapticMinGap) {
            _hapticClock
              ..reset()
              ..start();
            HapticFeedback.selectionClick();
          }
          break;
        case TapEvent.levelUp:
          HapticFeedback.mediumImpact();
          _characterKey.currentState?.pulse();
          _showLevelUpDialog(_engine.level);
          break;
        case TapEvent.skinChanged:
          HapticFeedback.heavyImpact();
          _showSkinDialog();
          break;
        case TapEvent.gameCompleted:
          HapticFeedback.heavyImpact();
          break;
        case TapEvent.dailyCapHit:
          // Fires once, on the level-up that spends the last of today's
          // allowance — not on every tap afterwards.
          HapticFeedback.heavyImpact();
          break;
        case TapEvent.rejected:
        case null:
          break;
      }
    }
    // ── سکهٔ لول‌های تأییدشده: نشانِ شناور «+N سکه» ──
    if (_engine.coinsEarnedSerial != _seenCoinsSerial) {
      _seenCoinsSerial = _engine.coinsEarnedSerial;
      if (_engine.coinsEarnedLastBatch > 0) {
        setState(() {
          _coinsToast = _engine.coinsEarnedLastBatch;
          _coinsTotal = _engine.coinsTotalLastBatch;
        });
        _coinsToastTimer?.cancel();
        _coinsToastTimer =
            Timer(const Duration(milliseconds: 2600), () {
          if (!mounted) return;
          setState(() => _coinsToast = null);
        });
      }
    }

    _scheduleRebuild();
  }

  Timer? _rebuildTimer;

  void _scheduleRebuild() {
    if (_rebuildTimer?.isActive ?? false) return;
    // A short timer rather than addPostFrameCallback: the post-frame callback
    // only runs when a frame is already scheduled, and if the last tap of a
    // burst arrives while the tree happens to be idle the rebuild would never
    // fire and the counter would freeze until the next tap. A 16ms timer is
    // one frame at 60Hz and always runs.
    _rebuildTimer = Timer(const Duration(milliseconds: 16), () {
      if (!mounted) return;
      // ── مسیرِ داغ: فقط شمارنده‌ها ──
      // ۹۹.۹٪ تیک‌ها فقط عدد را عوض می‌کنند. یک افزایشِ ValueNotifier
      // دو ویجتِ کوچک را بازمی‌سازد، نه کلِ صفحه را.
      _uiTick.value++;

      // ── مسیرِ سرد: تغییرِ ساختاری ──
      // فقط وقتی چیزی عوض شده که **چیدمان** را عوض می‌کند.
      final complete = _engine.isComplete;
      final capped = _engine.dailyCapReached;
      final skin = _engine.skin;
      final notice = _engine.notice;
      if (complete != _lastComplete ||
          capped != _lastCapReached ||
          skin != _lastSkin ||
          notice != _lastNotice) {
        _lastComplete = complete;
        _lastCapReached = capped;
        _lastSkin = skin;
        _lastNotice = notice;
        setState(() {});
      }
    });
  }

  void _showLevelUpDialog(int newLevel) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.transparent,
        child: _LevelUpDialogContent(level: newLevel, accent: _accent),
      ),
    );
  }

  void _showSkinDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => const Dialog(
        backgroundColor: Colors.transparent,
        child: _SkinUnlockedDialogContent(),
      ),
    );
  }

  bool _handleTap(TapDownDetails _) => _engine.tap();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_booting || !_engineCreated || !_engine.loaded) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        // ── تنها دو تکه‌ای که هر ضربه بازسازی می‌شوند ──
        // بقیهٔ این درخت — و مهم‌تر از همه `TapCharacter` — دست‌نخورده
        // می‌ماند. توضیحِ کامل کنار تعریفِ `_uiTick`.
        ValueListenableBuilder<int>(
          valueListenable: _uiTick,
          builder: (_, __, ___) => _Header(
            onBack: () {
              _engine.flushNow();
              widget.onBack();
            },
            level: _engine.level,
            levelCount: _engine.config.levelCount,
            points: _engine.pointsEarned,
            levelsLeftToday: _engine.levelsLeftToday,
            levelsPerDay: _engine.config.levelsPerDay,
            isComplete: _engine.isComplete,
            accent: _accent,
          ),
        ),
        Gaps.vSm,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Gaps.lg),
          child: ValueListenableBuilder<int>(
            valueListenable: _uiTick,
            builder: (_, __, ___) => _ProgressPanel(
              engine: _engine,
              accent: _accent,
            ),
          ),
        ),
        // ── راهنمای سکه: «هر لول N سکه» — عدد از تنظیماتِ ادمین می‌آید ──
        Padding(
          padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.xxs, Gaps.lg, 0),
          child: _CoinGuide(accent: _accent, economy: _economy),
        ),
        // ── نشانِ شناورِ سکهٔ لول‌آپ ──
        if (_coinsToast != null) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.xs, Gaps.lg, 0),
            child: _CoinToast(coins: _coinsToast!, total: _coinsTotal),
          ),
        ],
        Expanded(
          // دورِ ۳۳: مهرِ سرور (isFinished) هم مثل عبورِ محلی از لولِ آخر
          // (isComplete) صفحهٔ پایان را می‌آورد — جمعِ امتیاز و سکه از
          // خودِ سرور، و پیامِ «تا ریستِ مدیر قفل».
          //
          // لیدربورد top-10 + رتبهٔ واقعیِ خودِ بازیکن، inline کنار کاراکتر
          // (نه شیت جدا) — خواستهٔ مالک برای کاهش side-scroll/تب اضافه.
          child: _engine.isFinished
              ? _CompletionView(
                  points: _engine.pointsAwardedTotal > 0
                      ? _engine.pointsAwardedTotal
                      : _engine.pointsEarned,
                  coins: _engine.coinsAwardedTotal,
                  accent: _accent,
                  skin: _engine.config
                      .skinForLevel(_engine.config.levelCount),
                )
              : _engine.dailyCapReached
                  ? _DailyCapView(
                      accent: _accent,
                      levelsPerDay: _engine.config.levelsPerDay,
                      level: _engine.level,
                      skin: _engine.skin,
                    )
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(
                          Gaps.sm, Gaps.xs, Gaps.sm, Gaps.xs),
                      child: LayoutBuilder(builder: (context, c) {
                        final sideBySide = c.maxWidth >= 340;
                        final character = Center(
                          child: TapCharacter(
                            key: _characterKey,
                            skin: _engine.skin,
                            accent: _accent,
                            onTap: _handleTap,
                          ),
                        );
                        final board = _TapInlineLeaderboard(api: widget.api);
                        if (!sideBySide) {
                          return Column(
                            children: [
                              Expanded(flex: 3, child: character),
                              const SizedBox(height: 6),
                              SizedBox(height: 168, child: board),
                            ],
                          );
                        }
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(flex: 5, child: character),
                            const SizedBox(width: 8),
                            SizedBox(
                              width: (c.maxWidth * 0.38).clamp(132.0, 200.0),
                              child: board,
                            ),
                          ],
                        );
                      }),
                    ),
        ),
        if (_engine.notice != null)
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.lg, vertical: Gaps.xxs),
            child: _NoticeBar(text: _engine.notice!),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.xxs, Gaps.lg, Gaps.lg),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.touch_app_rounded,
                  size: 16,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
              Gaps.hXxs,
              Flexible(
                child: ValueListenableBuilder<int>(
                  valueListenable: _uiTick,
                  builder: (_, __, ___) => Text(
                  _engine.isFinished
                      ? 'همهٔ ${faNum(_engine.config.levelCount)} لول تمام شد!'
                      : _engine.dailyCapReached
                          ? 'سهمیهٔ امروز تمام شد'
                          : 'ضربه بزن — ${faNum(_engine.pointsToNextLevel)} امتیاز تا لول بعد',
                  // The uncapped string is the longest in the app's smallest
                  // text style; on a 320px screen with a five-digit
                  // requirement it overflowed the row.
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.onBack,
    required this.level,
    required this.levelCount,
    required this.points,
    required this.levelsLeftToday,
    required this.levelsPerDay,
    required this.isComplete,
    required this.accent,
  });

  final VoidCallback onBack;
  final int level;
  final int levelCount;
  final int points;
  final int levelsLeftToday;
  final int levelsPerDay;
  final bool isComplete;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shown = level > levelCount ? levelCount : level;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Gaps.xs, Gaps.xs, Gaps.lg, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_forward_rounded),
            tooltip: 'بازگشت',
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ضربه‌زن',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                Text(
                  'لول ${faNum(shown)} از ${faNum(levelCount)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
          ),
          // Today's remaining levels, as dots. Shown BEFORE the cap is hit,
          // not only after — a limit the player discovers by hitting it is a
          // bug report; one they can see coming is a rule.
          if (!isComplete) ...[
            _DailyDots(
              left: levelsLeftToday,
              total: levelsPerDay,
              accent: accent,
            ),
            Gaps.hXs,
          ],
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.sm, vertical: Gaps.xxs),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.14),
              borderRadius: Corners.rPill,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.bolt_rounded, size: 16, color: accent),
                Gaps.hXxs,
                Text(
                  faNum(points),
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: accent,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Today's level allowance, as filled/empty dots.
///
/// Dots rather than "۲/۳" because the count is small and glanceable: three
/// shapes read instantly where a fraction has to be parsed, and it fits in
/// the header without competing with the level number beside it.
class _DailyDots extends StatelessWidget {
  const _DailyDots({
    required this.left,
    required this.total,
    required this.accent,
  });

  final int left;
  final int total;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final dim = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2);
    return Semantics(
      // Screen readers get the number; the dots are decoration to them.
      label: 'امروز $left لول از $total باقی مانده',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < total; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < left ? accent : dim,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Shown instead of the character once today's levels are used up.
///
/// A live countdown, because "فردا برگرد" ("come back tomorrow") at 23:50 is
/// misleading by eleven hours in the wrong direction, and at 00:10 it is
/// misleading by a whole day. The timer ticks once a minute — a second-by-
/// second countdown on a screen the player is about to leave is a frame
/// callback per second for information nobody is reading.
class _DailyCapView extends StatefulWidget {
  const _DailyCapView({
    required this.accent,
    required this.levelsPerDay,
    required this.level,
    required this.skin,
  });

  final Color accent;
  final int levelsPerDay;
  final int level;
  final String skin;

  @override
  State<_DailyCapView> createState() => _DailyCapViewState();
}

class _DailyCapViewState extends State<_DailyCapView> {
  Timer? _tick;
  late Duration _left;

  @override
  void initState() {
    super.initState();
    _left = untilTehranMidnight();
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      setState(() => _left = untilTehranMidnight());
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(Gaps.xl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // The character is still here, just resting — dimmed and small.
          // Removing it entirely made the screen look like an error page.
          Opacity(
            opacity: 0.35,
            child: Image.asset(
              widget.skin,
              height: 150,
              fit: BoxFit.contain,
              // Dimmed and at 150px; a small decode is more than enough.
              cacheWidth: 220,
              errorBuilder: (_, __, ___) =>
                  Icon(Icons.bedtime_rounded, size: 72, color: widget.accent),
            ),
          ),
          Gaps.vLg,
          Icon(Icons.bedtime_rounded, size: 44, color: theme.colorScheme.outline),
          Gaps.vXs,
          Text(
            'سهمیهٔ امروز تمام شد',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: widget.accent,
            ),
          ),
          Gaps.vXxs,
          Text(
            'هر روز ${faNum(widget.levelsPerDay)} لول می‌توانی بالا بروی.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
            ),
          ),
          Gaps.vSm,
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.md, vertical: Gaps.xs),
            decoration: BoxDecoration(
              color: widget.accent.withValues(alpha: 0.12),
              borderRadius: Corners.rPill,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.schedule_rounded, size: 16, color: widget.accent),
                Gaps.hXxs,
                Text(
                  'باز شدن تا ${formatCountdown(_left)} دیگر',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: widget.accent,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressPanel extends StatelessWidget {
  const _ProgressPanel({required this.engine, required this.accent});

  final TapEngine engine;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final untilSkin = engine.levelsUntilNextSkin;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            // "۴۵ / ۲۳۹ امتیاز" — the unit is spelled out because the owner
            // wants this screen to talk about points, and a bare pair of
            // numbers next to a progress bar is ambiguous.
            //
            // The number pair stays a single LTR run: inside the app's RTL
            // directionality the bidi algorithm reorders the values around
            // the slash, so "۱۵ / ۱۰۰" reads back as "۱۰۰ / ۱۵". The word
            // after it is a separate RTL Text so it is not dragged into the
            // same run.
            Text(
              '${faNum(engine.taps)} / ${faNum(engine.requiredTaps)}',
              textDirection: TextDirection.ltr,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: accent,
              ),
            ),
            Gaps.hXxs,
            Text(
              'امتیاز',
              style: theme.textTheme.labelSmall?.copyWith(
                color: accent.withValues(alpha: 0.75),
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            if (untilSkin != null)
              Text(
                '${faNum(untilSkin)} لول تا شخصیت بعدی',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
          ],
        ),
        Gaps.vXxs,
        ClipRRect(
          borderRadius: Corners.rPill,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: engine.levelProgress),
            duration: Motion.fast,
            curve: Motion.standard,
            builder: (context, value, _) => LinearProgressIndicator(
              value: value,
              minHeight: 12,
              backgroundColor:
                  theme.colorScheme.onSurface.withValues(alpha: 0.08),
              valueColor: AlwaysStoppedAnimation(accent),
            ),
          ),
        ),
        Gaps.vXxs,
        // Live rate readout doubles as a fairness signal: the player can see
        // exactly why taps stop counting when they go too fast.
        Row(
          children: [
            Icon(
              Icons.speed_rounded,
              size: 13,
              color: engine.nearRateLimit
                  ? const Color(0xFFF59E0B)
                  : theme.colorScheme.onSurface.withValues(alpha: 0.4),
            ),
            Gaps.hXxs,
            Text(
              '${faNum(engine.currentRate)} ضربه بر ثانیه',
              style: theme.textTheme.labelSmall?.copyWith(
                color: engine.nearRateLimit
                    ? const Color(0xFFF59E0B)
                    : theme.colorScheme.onSurface.withValues(alpha: 0.4),
                fontWeight:
                    engine.nearRateLimit ? FontWeight.w800 : FontWeight.w500,
              ),
            ),
            const Spacer(),
            if (engine.pendingTaps > 0)
              Text(
                'در حال ثبت: ${faNum(engine.pendingTaps)}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _NoticeBar extends StatelessWidget {
  const _NoticeBar({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xs),
      decoration: BoxDecoration(
        color: const Color(0xFFF59E0B).withValues(alpha: 0.14),
        borderRadius: Corners.rMd,
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded,
              size: 16, color: Color(0xFFF59E0B)),
          Gaps.hXs,
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: const Color(0xFFF59E0B),
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// راهنمای سکهٔ ضربه‌زن — عددها از تنظیماتِ ادمین (بدونِ آپدیتِ اپ).
class _CoinGuide extends StatelessWidget {
  const _CoinGuide({required this.accent, this.economy});
  final Color accent;
  final Map<String, dynamic>? economy;

  @override
  Widget build(BuildContext context) {
    final perLevel =
        num.tryParse('${economy?['tapCoinsPerLevel'] ?? ''}')?.toInt() ?? 5;
    final pct =
        num.tryParse('${economy?['coinCarryoverPercent'] ?? ''}')?.toInt() ?? 10;
    final pctText = pct == 0
        ? 'انتقالِ سکه به لیگِ بعدی صفر است'
        : '${faNum(pct)}٪ از سکه به لیگِ بعدی منتقل می‌شود';
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 7, 12, 7),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.10),
        borderRadius: Corners.rMd,
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.monetization_on_rounded, size: 16, color: Color(0xFFFFD166)),
          Gaps.hXs,
          Expanded(
            child: Text(
              'هر لول ${faNum(perLevel)} سکه می‌دهد — همان لحظه به موجودی‌ات اضافه می‌شود. '
              'سکه مبنای جایزهٔ لیگ است؛ بعد از پایانِ لیگ صفر می‌شود و $pctText.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: const Color(0xFFFDE68A),
                    fontWeight: FontWeight.w700,
                    height: 1.5,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// نشانِ شناورِ «+N سکه» بعد از لول‌آپ (خواستهٔ مالک).
/// ── جشنِ سکهٔ لول‌آپ (دورِ ۳۳) ──────────────────────────────────────────
///
/// خواستهٔ مالک: «وقتی کاربر لول آپ می‌شه باید ۵ سکهٔ دریافتی بصورتِ
/// انیمیشنی جذاب نشون داده بشه». نسخهٔ قبلی یک چیپِ ساکن بود؛ حالا:
/// سکهٔ طلایی با چرخشِ سه‌بعدی (rotateY مثل سکهٔ واقعی) و پاپِ فنری،
/// هشت جرقه که به اطراف می‌پرند، و عددِ «+N» که با تأخیرِ کوتاه می‌ترکد.
/// همه با یک AnimationController — بدون ایموجی، مطابقِ سلیقهٔ مالک.
class _CoinToast extends StatefulWidget {
  const _CoinToast({required this.coins, this.total});
  final int coins;
  final int? total;

  @override
  State<_CoinToast> createState() => _CoinToastState();
}

class _CoinToastState extends State<_CoinToast>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // سکه: ۰→۰.۴۵ چرخشِ + پاپ؛ بعدرتر حالتِ شناورِ آرام.
    final coinT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0, 0.45, curve: Curves.easeOutBack),
    );
    final floatT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.45, 1, curve: Curves.easeInOut),
    );
    final numT = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.12, 0.5, curve: Curves.easeOutBack),
    );

    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x2EFFD166), Color(0x1AF59E0B)]),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0x73FFD166)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x38FFB42C),
              blurRadius: 26,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 64,
              height: 64,
              child: AnimatedBuilder(
                animation: _controller,
                builder: (_, __) {
                  final spin = (1 - coinT.value) * 3.4; // از چرخش به ثابت
                  final dy = (1 - floatT.value) * 6;
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      // جرقه‌ها: هشت پرتو که با پیشرفتِ انیمیشن دور می‌شوند.
                      for (var i = 0; i < 8; i++)
                        () {
                          final angle = i * 45.0 * math.pi / 180;
                          final dist = 10 + coinT.value * 22;
                          final op = (1 - _controller.value).clamp(0.0, 1.0);
                          return Transform.translate(
                            offset: Offset(
                              math.cos(angle) * dist,
                              math.sin(angle) * dist - dy,
                            ),
                            child: Opacity(
                              opacity: op * 0.9,
                              child: Container(
                                width: 5,
                                height: 5,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: RadialGradient(colors: [
                                    const Color(0xFFFFE9AD),
                                    const Color(0xFFFFC53D)
                                        .withValues(alpha: 0),
                                  ]),
                                ),
                              ),
                            ),
                          );
                        }(),
                      Transform.translate(
                        offset: Offset(0, -dy),
                        child: Transform(
                          alignment: Alignment.center,
                          transform: Matrix4.identity()
                            ..setEntry(3, 2, 0.002)
                            ..rotateY(spin)
                            ..scaleByDouble(0.5 + coinT.value * 0.5,
                                0.5 + coinT.value * 0.5, 1.0, 1.0),
                          child: Image.asset(
                            'assets/pass/icon_coin.webp',
                            width: 46,
                            height: 46,
                            errorBuilder: (_, __, ___) => const Icon(
                                Icons.monetization_on_rounded,
                                size: 46,
                                color: Color(0xFFFFD166)),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 6),
            // عددِ «+N» با ترکیدنِ فنری.
            ScaleTransition(
              scale: numT,
              child: Text(
                '+${faNum(widget.coins)} سکه',
                style: const TextStyle(
                  color: Color(0xFFFFD166),
                  fontWeight: FontWeight.w900,
                  fontSize: 19,
                  shadows: [
                    Shadow(color: Color(0x66FFC53D), blurRadius: 14),
                  ],
                ),
              ),
            ),
            if (widget.total != null)
              Text(
                'موجودی: ${faNum(widget.total!)}',
                style: const TextStyle(
                  color: Color(0xFFEAD9A8),
                  fontWeight: FontWeight.w700,
                  fontSize: 11.5,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CompletionView extends StatelessWidget {
  const _CompletionView({
    required this.points,
    required this.accent,
    required this.skin,
    this.coins,
  });

  final int points;

  /// جمعِ سکهٔ کسب‌شده از ضربه‌زن — از دفترِ سرور؛ null یعنی هنوز
  /// synced نشده (مثلاً آفلاین) و آنگاه چیزی نشان نمی‌دهیم تا دروغ
  /// نگوییم.
  final int? coins;
  final Color accent;
  final String skin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(Gaps.xl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Expanded(
            child: Image.asset(
              skin,
              fit: BoxFit.contain,
              cacheWidth: 600,
              errorBuilder: (_, __, ___) =>
                  const Icon(Icons.emoji_events_rounded, size: 90, color: Color(0xFFFFD166)),
            ),
          ),
          Gaps.vLg,
          Icon(Icons.emoji_events_rounded, size: 56, color: theme.colorScheme.primary),
          Gaps.vXs,
          Text(
            'تبریک! بازی ضربه‌زن را کامل تمام کردی',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w900, color: accent),
          ),
          Gaps.vSm,
          // ── دو کارتِ جمعِ واقعی (دورِ ۳۳) ──
          // خواستهٔ مالک: «تمامی امتیازات و همینطور سکه نمایش داده بشه».
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _FinishStat(
                icon: Icons.stars_rounded,
                color: accent,
                value: faNum(points),
                label: 'امتیاز از ضربه‌زن',
              ),
              const SizedBox(width: 10),
              if (coins != null)
                _FinishStat(
                  icon: Icons.monetization_on_rounded,
                  color: const Color(0xFFFFD166),
                  value: faNum(coins!),
                  label: 'سکهٔ کسب‌شده',
                ),
            ],
          ),
          Gaps.vSm,
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              borderRadius: Corners.rPill,
              color: Colors.white.withValues(alpha: 0.06),
              border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline_rounded,
                    size: 15, color: theme.colorScheme.outline),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'تا زمانی که مدیر بازی را ریست نکند نمی‌توانی دوباره بازی کنی',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// یک عددِ درشت با زیرنویس — تکهٔ صفحهٔ پایانِ ضربه‌زن.
class _FinishStat extends StatelessWidget {
  const _FinishStat({
    required this.icon,
    required this.color,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final Color color;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: color.withValues(alpha: 0.10),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 17, color: color),
              const SizedBox(width: 5),
              Text(value,
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900, color: color)),
            ],
          ),
          const SizedBox(height: 2),
          Text(label, style: theme.textTheme.labelSmall),
        ],
      ),
    );
  }
}

class _LevelUpDialogContent extends StatefulWidget {
  final int level;
  final Color accent;
  const _LevelUpDialogContent({required this.level, required this.accent});

  @override
  State<_LevelUpDialogContent> createState() => _LevelUpDialogContentState();
}

class _LevelUpDialogContentState extends State<_LevelUpDialogContent> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;
  late final Animation<double> _rotate;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3500),
    )..repeat();

    _scale = Tween<double>(begin: 0.2, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.4, curve: Curves.elasticOut)),
    );
    _rotate = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Container(
        padding: const EdgeInsets.all(Gaps.lg),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: const LinearGradient(
            colors: [Color(0xFF1E1B4B), Color(0xFF090514)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          border: Border.all(color: widget.accent, width: 2),
          boxShadow: [
            BoxShadow(
              color: widget.accent.withValues(alpha: 0.45),
              blurRadius: 24,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned(
              width: 220,
              height: 220,
              child: RotationTransition(
                turns: _rotate,
                child: CustomPaint(
                  painter: _SunburstPainter(color: widget.accent.withValues(alpha: 0.15)),
                ),
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // تصویرِ لول‌آپ به‌جای ایموجی (بستهٔ ۲۰۲۶ بازی‌ها).
                Image.asset(
                  'assets/games/levelup_badge.webp',
                  width: 88,
                  height: 88,
                  fit: BoxFit.contain,
                  cacheWidth: 176,
                  errorBuilder: (_, __, ___) =>
                      Icon(Icons.celebration_rounded, size: 64, color: widget.accent),
                ),
                Gaps.vSm,
                Text(
                  'تبریک! لول آپ شدی',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: widget.accent,
                  ),
                ),
                Gaps.vXs,
                Text(
                  'شما به لول ${faNum(widget.level)} رسیدی!',
                  style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold),
                ),
                Gaps.vMd,
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context),
                    style: FilledButton.styleFrom(backgroundColor: widget.accent),
                    child: const Text(
                      'ادامه بازی',
                      style: TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SkinUnlockedDialogContent extends StatefulWidget {
  const _SkinUnlockedDialogContent();

  @override
  State<_SkinUnlockedDialogContent> createState() => _SkinUnlockedDialogContentState();
}

class _SkinUnlockedDialogContentState extends State<_SkinUnlockedDialogContent> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;
  late final Animation<double> _rotate;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4000),
    )..repeat();

    _scale = Tween<double>(begin: 0.1, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.45, curve: Curves.elasticOut)),
    );
    _rotate = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
    _pulse = Tween<double>(begin: 0.92, end: 1.08).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.45, 1.0, curve: Curves.bounceIn)),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Container(
        padding: const EdgeInsets.all(Gaps.lg),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: const LinearGradient(
            colors: [Color(0xFF581C87), Color(0xFF0F052D)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          border: Border.all(color: Colors.amber, width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.amber.withValues(alpha: 0.45),
              blurRadius: 28,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned(
              width: 240,
              height: 240,
              child: RotationTransition(
                turns: _rotate,
                child: const CustomPaint(
                  painter: _SunburstPainter(color: Color(0x22FFD36B)),
                ),
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ScaleTransition(
                  scale: _pulse,
                  child: Image.asset(
                    'assets/games/skin_unlock.webp',
                    width: 96,
                    height: 96,
                    fit: BoxFit.contain,
                    cacheWidth: 192,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.workspace_premium_rounded, size: 72, color: Colors.amber),
                  ),
                ),
                Gaps.vSm,
                const Text(
                  'شخصیت جدید باز شد!',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: Colors.amber,
                  ),
                ),
                Gaps.vXs,
                const Text(
                  'یک بازیکن کلکسیونی فوتبالی جدید به جمع شما پیوست!',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: Colors.white70, fontWeight: FontWeight.bold),
                ),
                Gaps.vMd,
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context),
                    style: FilledButton.styleFrom(backgroundColor: Colors.amber),
                    child: const Text(
                      'ایول! دمت گرم',
                      style: TextStyle(
                        color: Color(0xFF3A2A00),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SunburstPainter extends CustomPainter {
  final Color color;
  const _SunburstPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.max(size.width, size.height);
    const rays = 16;
    const angleWidth = (math.pi * 2) / (rays * 2);

    for (var i = 0; i < rays; i++) {
      final startAngle = i * (math.pi * 2) / rays;
      final path = Path()
        ..moveTo(center.dx, center.dy)
        ..lineTo(center.dx + radius * math.cos(startAngle), center.dy + radius * math.sin(startAngle))
        ..lineTo(center.dx + radius * math.cos(startAngle + angleWidth), center.dy + radius * math.sin(startAngle + angleWidth))
        ..close();
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// لیدربورد inline کنار کاراکتر — top-10 + رتبهٔ واقعی خودت اگر خارج ۱۰.
/// API: GET /api/games/tap/leaderboard → {entries, me, limit}
class _TapInlineLeaderboard extends StatefulWidget {
  const _TapInlineLeaderboard({required this.api});
  final ApiClient api;

  @override
  State<_TapInlineLeaderboard> createState() => _TapInlineLeaderboardState();
}

class _TapInlineLeaderboardState extends State<_TapInlineLeaderboard> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final raw = await widget.api.get('/api/games/tap/leaderboard?limit=10');
    if (raw is Map<String, dynamic>) return raw;
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return <String, dynamic>{'entries': const [], 'me': null, 'limit': 10};
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.045),
        borderRadius: Corners.rMd,
        border: Border.all(color: Colors.white12),
      ),
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.emoji_events_rounded,
                  size: 14, color: Color(0xFFFBBF24)),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  'رتبه‌بندی',
                  style: theme.textTheme.labelLarge
                      ?.copyWith(fontWeight: FontWeight.w900, fontSize: 12),
                ),
              ),
              InkWell(
                onTap: () => setState(() => _future = _load()),
                borderRadius: BorderRadius.circular(99),
                child: const Padding(
                  padding: EdgeInsets.all(2),
                  child: Icon(Icons.refresh_rounded, size: 14, color: Colors.white54),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(
                    child: SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  );
                }
                if (snap.hasError) {
                  return Center(
                    child: Text(
                      apiError(snap.error ?? 'خطا'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 10, color: Colors.white60),
                    ),
                  );
                }
                final data = snap.data ?? const {};
                final entries = (data['entries'] as List?) ?? const [];
                final me = data['me'] is Map
                    ? Map<String, dynamic>.from(data['me'] as Map)
                    : null;
                if (entries.isEmpty && me == null) {
                  return const Center(
                    child: Text(
                      'هنوز کسی نیست\nاولین باش!',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 10.5, color: Colors.white54),
                    ),
                  );
                }
                final showMe = me != null && me['inTop'] != true;
                return Column(
                  children: [
                    Expanded(
                      child: ListView.builder(
                        padding: EdgeInsets.zero,
                        itemCount: entries.length,
                        itemBuilder: (_, i) {
                          final e = Map<String, dynamic>.from(entries[i] as Map);
                          return _TapLbRow(
                            rank: (e['rank'] as num?)?.toInt() ?? (i + 1),
                            nickname: '${e['nickname'] ?? 'بازیکن'}',
                            taps: (e['totalTaps'] as num?)?.toInt() ?? 0,
                            avatarKey: e['profileAvatarKey'],
                            imageUrl: e['profileImageUrl'],
                            highlight: false,
                            dense: true,
                          );
                        },
                      ),
                    ),
                    if (showMe) ...[
                      const Divider(height: 8, color: Colors.white12),
                      _TapLbRow(
                        rank: (me['rank'] as num?)?.toInt() ?? 0,
                        nickname: '${me['nickname'] ?? 'تو'}',
                        taps: (me['totalTaps'] as num?)?.toInt() ?? 0,
                        avatarKey: me['profileAvatarKey'],
                        imageUrl: me['profileImageUrl'],
                        highlight: true,
                        dense: true,
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TapLbRow extends StatelessWidget {
  const _TapLbRow({
    required this.rank,
    required this.nickname,
    required this.taps,
    required this.dense,
    required this.highlight,
    this.avatarKey,
    this.imageUrl,
  });

  final int rank;
  final String nickname;
  final int taps;
  final bool dense;
  final bool highlight;
  final dynamic avatarKey;
  final dynamic imageUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.only(bottom: dense ? 3 : 6),
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 4 : 8,
        vertical: dense ? 3 : 6,
      ),
      decoration: BoxDecoration(
        color: highlight
            ? const Color(0xFF22E7A6).withValues(alpha: 0.12)
            : Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: highlight ? const Color(0xFF22E7A6).withValues(alpha: 0.35) : Colors.transparent,
        ),
      ),
      child: Row(
        children: [
          _RankBadge(rank: rank),
          const SizedBox(width: 4),
          AvatarImage(
            keyName: avatarKey,
            imageUrl: imageUrl,
            radius: dense ? 10 : 14,
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              nickname,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: dense ? 10 : 12,
                fontWeight: FontWeight.w800,
                color: highlight ? const Color(0xFF22E7A6) : Colors.white,
              ),
            ),
          ),
          Text(
            faNum(taps),
            style: TextStyle(
              fontSize: dense ? 9.5 : 11,
              fontWeight: FontWeight.w900,
              color: const Color(0xFFFBBF24),
            ),
          ),
        ],
      ),
    );
  }
}

/// نشانِ رتبه — سه نفرِ اول مدالِ رنگی می‌گیرند (آینهٔ مدال‌های CSS در وب).
class _RankBadge extends StatelessWidget {
  const _RankBadge({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    final (color, textColor) = switch (rank) {
      1 => (const Color(0xFFF59E0B), const Color(0xFF2B1A02)),
      2 => (const Color(0xFF94A3B8), const Color(0xFF0F172A)),
      3 => (const Color(0xFFB45309), Colors.white),
      _ => (Colors.transparent, Colors.white70),
    };
    return Container(
      width: 24,
      height: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: rank > 3 ? Border.all(color: Colors.white24) : null,
      ),
      child: Text(
        faNum(rank),
        style: TextStyle(
            fontSize: 11, fontWeight: FontWeight.w900, color: textColor),
      ),
    );
  }
}
