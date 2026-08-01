// Tap game screen — the only widget that knows about layout.
//
// State lives in TapEngine (a ChangeNotifier, matching SoloSession elsewhere
// in this app); this file listens and paints. Follows the same
// `{Game}Screen(api, onBack)` contract as the other games so the hub can
// launch it identically.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../api_client.dart';
import '../../../../theme/tokens.dart';
import '../game_audio.dart';
import 'tap_character.dart';
import 'tap_config.dart';
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
          break;
        case TapEvent.skinChanged:
          GameAudio.instance.play(Sfx.win);
          HapticFeedback.heavyImpact();
          _showSkinToast();
          break;
        case TapEvent.gameCompleted:
          GameAudio.instance.play(Sfx.win);
          HapticFeedback.heavyImpact();
          break;
        case TapEvent.rejected:
        case null:
          break;
      }
    }
    setState(() {});
  }

  void _showSkinToast() {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.hideCurrentSnackBar();
    messenger?.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: _accent,
        duration: const Duration(seconds: 2),
        content: Text(
          'شخصیت جدید باز شد! 🎉',
          style: TextStyle(
            color: Colors.black.withValues(alpha: 0.85),
            fontWeight: FontWeight.w800,
          ),
        ),
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
        _Header(
          onBack: () {
            _engine.flushNow();
            widget.onBack();
          },
          level: _engine.level,
          levelCount: widget.config.levelCount,
          totalTaps: _engine.totalTaps,
          accent: _accent,
        ),
        Gaps.vSm,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Gaps.lg),
          child: _ProgressPanel(
            engine: _engine,
            accent: _accent,
          ),
        ),
        Expanded(
          child: _engine.isComplete
              ? _CompletionView(
                  totalTaps: _engine.totalTaps,
                  accent: _accent,
                  skin: widget.config
                      .skinForLevel(widget.config.levelCount),
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
              Text(
                _engine.isComplete
                    ? 'همهٔ ۵۰ لول تمام شد!'
                    : 'روی شخصیت ضربه بزن — ${faNum(_engine.tapsRemaining)} ضربه تا لول بعد',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
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
    required this.totalTaps,
    required this.accent,
  });

  final VoidCallback onBack;
  final int level;
  final int levelCount;
  final int totalTaps;
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
                  faNum(totalTaps),
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
            Text(
              '${faNum(engine.taps)} / ${faNum(engine.requiredTaps)}',
              // The pair is a single LTR expression. Inside the app's RTL
              // directionality the bidi algorithm reorders the numbers around
              // the slash, so "۱۵ / ۱۰۰" reads back as "۱۰۰ / ۱۵" — spotted on
              // the live web build, and this widget has the same shape.
              textDirection: TextDirection.ltr,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: accent,
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
    required this.totalTaps,
    required this.accent,
    required this.skin,
  });

  final int totalTaps;
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
            'مجموع ضربه‌ها: ${faNum(totalTaps)}',
            style: theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}
