// Tap game screen — the only widget that knows about layout.
//
// State lives in TapEngine (a ChangeNotifier, matching SoloSession elsewhere
// in this app); this file listens and paints. Follows the same
// `{Game}Screen(api, onBack)` contract as the other games so the hub can
// launch it identically.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../api_client.dart';
import '../../../../theme/tokens.dart';
import '../game_audio.dart';
import 'tap_character.dart';
import 'tap_config.dart';
import 'tap_day.dart';
import 'tap_engine.dart';
import 'tap_storage.dart';
import 'tap_sync.dart';

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

  late final TapEngine _engine;
  final GlobalKey<TapCharacterState> _characterKey =
      GlobalKey<TapCharacterState>();

  int _seenEventSerial = 0;

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
  // ⚠️ `_uiTick` عمداً یک شمارنده است و نه خودِ داده: موتور منبعِ حقیقت
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _engine = TapEngine(
      config: widget.config,
      storage: TapStorage(),
      sync: TapSync(api: widget.api),
    )..addListener(_onEngineChanged);
    _engine.init();
  }

  @override
  void dispose() {
    // Must be cancelled: a pending rebuild firing after dispose would call
    // setState on a defunct State.
    _rebuildTimer?.cancel();
    _uiTick.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _engine.removeListener(_onEngineChanged);
    _engine.dispose();
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
          GameAudio.instance.play(Sfx.tap, volume: 0.55);
          HapticFeedback.selectionClick();
          break;
        case TapEvent.levelUp:
          GameAudio.instance.play(Sfx.matchFound);
          HapticFeedback.mediumImpact();
          _characterKey.currentState?.pulse();
          _showLevelUpDialog(_engine.level);
          break;
        case TapEvent.skinChanged:
          GameAudio.instance.play(Sfx.win);
          HapticFeedback.heavyImpact();
          _showSkinDialog();
          break;
        case TapEvent.gameCompleted:
          GameAudio.instance.play(Sfx.win);
          HapticFeedback.heavyImpact();
          break;
        case TapEvent.dailyCapHit:
          // Fires once, on the level-up that spends the last of today's
          // allowance — not on every tap afterwards. The panel below carries
          // the standing explanation; this is the moment it arrives.
          GameAudio.instance.play(Sfx.win);
          HapticFeedback.heavyImpact();
          break;
        case TapEvent.rejected:
        case null:
          break;
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

    if (!_engine.loaded) {
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
            levelCount: widget.config.levelCount,
            points: _engine.pointsEarned,
            levelsLeftToday: _engine.levelsLeftToday,
            levelsPerDay: widget.config.levelsPerDay,
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
        Expanded(
          child: _engine.isComplete
              ? _CompletionView(
                  points: _engine.pointsEarned,
                  accent: _accent,
                  skin: widget.config
                      .skinForLevel(widget.config.levelCount),
                )
              : _engine.dailyCapReached
                  // The character is REPLACED, not merely disabled. Leaving a
                  // tappable character that silently does nothing is the
                  // worst version of a limit: the player assumes the game is
                  // broken. It also means the whole animation stack —
                  // ticker, painter, cross-fade — is torn down for the rest
                  // of the day instead of idling on screen.
                  ? _DailyCapView(
                      accent: _accent,
                      levelsPerDay: widget.config.levelsPerDay,
                      level: _engine.level,
                      skin: _engine.skin,
                    )
                  : Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: Gaps.xl, vertical: Gaps.md),
                      child: Center(
                        child: TapCharacter(
                          key: _characterKey,
                          skin: _engine.skin,
                          accent: _accent,
                          onTap: _handleTap,
                        ),
                      ),
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
                  _engine.isComplete
                      ? 'همهٔ ${faNum(widget.config.levelCount)} لول تمام شد!'
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
                  const Text('😴', style: TextStyle(fontSize: 72)),
            ),
          ),
          Gaps.vLg,
          Text('😴', style: theme.textTheme.headlineMedium),
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

class _CompletionView extends StatelessWidget {
  const _CompletionView({
    required this.points,
    required this.accent,
    required this.skin,
  });

  final int points;
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
                  const Text('🏆', style: TextStyle(fontSize: 90)),
            ),
          ),
          Gaps.vLg,
          Text('🏆', style: theme.textTheme.displaySmall),
          Gaps.vXs,
          Text(
            'تبریک! همهٔ لول‌ها را تمام کردی',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w900, color: accent),
          ),
          Gaps.vXxs,
          Text(
            'مجموع امتیاز: ${faNum(points)}',
            style: theme.textTheme.bodyMedium,
          ),
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
                const Text('🎉', style: TextStyle(fontSize: 64)),
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
                      'ادامه بازی 💪',
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
                  child: const Text('👑', style: TextStyle(fontSize: 72)),
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
                      'ایول! دمت گرم 🔥',
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
