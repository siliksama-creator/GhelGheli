// Shared chrome for every game screen: header, versus bar, status banners
// and the end-of-game panel. Each individual board only supplies its grid.
import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import 'game_audio.dart';
import 'game_session.dart';
import 'versus_bar.dart';

class GameScaffold extends StatelessWidget {
  const GameScaffold({
    super.key,
    required this.session,
    required this.api,
    required this.title,
    required this.accent,
    required this.symbols,
    required this.onBack,
    required this.boardBuilder,
    this.scoreboard,
  });

  final GameSession session;
  final ApiClient api;
  final String title;
  final Color accent;
  final Map<String, String> symbols; // 'X' -> '❌'
  final VoidCallback onBack;
  final WidgetBuilder boardBuilder;
  final Widget? scoreboard;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.md, Gaps.md, Gaps.xs),
          child: Column(
            children: [
              Row(
                children: [
                  IconButton(
                    onPressed: () {
                      session.leave();
                      onBack();
                    },
                    icon: const Icon(Icons.arrow_back_rounded),
                    tooltip: 'بازگشت',
                  ),
                  Expanded(
                    child: Text(title,
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w800)),
                  ),
                  if (session.vsBot && session.phase == GamePhase.playing)
                    _Chip(label: 'با ربات', color: accent),
                  const _SoundToggle(),
                ],
              ),
              Gaps.vSm,
              Expanded(child: _body(context, theme)),
            ],
          ),
        );
      },
    );
  }

  Widget _body(BuildContext context, ThemeData theme) {
    if (session.error != null) {
      return _Centered(
        icon: Icons.wifi_off_rounded,
        title: session.error!,
        action: FilledButton.icon(
          onPressed: session.join,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('تلاش دوباره'),
        ),
      );
    }

    switch (session.phase) {
      case GamePhase.idle:
        return _Centered(
          icon: Icons.sports_esports_rounded,
          title: 'آماده‌ای شروع کنیم؟',
          subtitle: 'اگر حریفی پیدا نشود، با ربات بازی می‌کنی.',
          action: FilledButton.icon(
            onPressed: session.join,
            style: FilledButton.styleFrom(
              backgroundColor: accent,
              minimumSize: const Size(220, 52),
            ),
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('شروع بازی'),
          ),
        );

      case GamePhase.waiting:
        return _Centered(
          icon: Icons.search_rounded,
          title: 'در حال جستجوی حریف...',
          subtitle: 'تا ۱۰ ثانیه دیگر با ربات شروع می‌کنیم.',
          spinner: true,
          action: OutlinedButton.icon(
            onPressed: session.leave,
            icon: const Icon(Icons.close_rounded),
            label: const Text('لغو'),
          ),
        );

      case GamePhase.playing:
      case GamePhase.over:
        return SingleChildScrollView(
          child: Column(
            children: [
              VersusBar(
                  session: session,
                  api: api,
                  symbols: symbols,
                  accent: accent),
              Gaps.vSm,
              if (scoreboard != null) ...[scoreboard!, Gaps.vSm],
              _TurnBanner(session: session, accent: accent),
              if (session.timedOutSymbol != null &&
                  session.phase == GamePhase.playing) ...[
                Gaps.vXxs,
                Text(
                  session.timedOutSymbol == session.mySymbol
                      ? 'وقت شما تمام شد؛ یک حرکت خودکار انجام شد'
                      : 'وقت حریف تمام شد',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFFEF4444),
                      fontWeight: FontWeight.w700),
                ),
              ],
              Gaps.vSm,
              boardBuilder(context),
              Gaps.vMd,
              if (session.phase == GamePhase.over)
                _ResultPanel(session: session, accent: accent)
              else
                OutlinedButton.icon(
                  onPressed: session.leave,
                  icon: const Icon(Icons.flag_outlined),
                  label: const Text('خروج از بازی'),
                ),
              Gaps.vMd,
            ],
          ),
        );
    }
  }
}

class _TurnBanner extends StatelessWidget {
  const _TurnBanner({required this.session, required this.accent});
  final GameSession session;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    if (session.phase != GamePhase.playing) return const SizedBox.shrink();
    final mine = session.myTurn;
    final theme = Theme.of(context);
    return AnimatedContainer(
      duration: Motion.fast,
      padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.xs),
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        color: (mine ? accent : theme.colorScheme.outline)
            .withValues(alpha: 0.14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(mine ? Icons.touch_app_rounded : Icons.hourglass_top_rounded,
              size: 16, color: mine ? accent : theme.colorScheme.outline),
          Gaps.hXs,
          Text(
            mine ? 'نوبت شماست' : 'نوبت حریف...',
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: mine ? accent : theme.colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultPanel extends StatelessWidget {
  const _ResultPanel({required this.session, required this.accent});
  final GameSession session;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final won = session.iWon;
    final draw = session.winner == 'DRAW';
    return AppCard(
      child: Column(
        children: [
          Text(
            won ? '🏆' : (draw ? '🤝' : '💪'),
            style: const TextStyle(fontSize: 40),
          ),
          Gaps.vXs,
          Text(session.resultText,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: won ? accent : theme.colorScheme.onSurface,
              )),
          Gaps.vMd,
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: session.join,
                  style: FilledButton.styleFrom(backgroundColor: accent),
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('بازی دوباره'),
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: OutlinedButton(
                  onPressed: session.leave,
                  child: const Text('پایان'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Centered extends StatelessWidget {
  const _Centered({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.spinner = false,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;
  final bool spinner;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Gaps.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (spinner)
              const CircularProgressIndicator()
            else
              Icon(icon, size: 56, color: theme.colorScheme.outline),
            Gaps.vMd,
            Text(title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            if (subtitle != null) ...[
              Gaps.vXxs,
              Text(subtitle!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall),
            ],
            if (action != null) ...[Gaps.vLg, action!],
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: Corners.rPill,
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Text('🤖', style: TextStyle(fontSize: 12)),
        Gaps.hXxs,
        Text(label,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: color, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

/// Mute button. Lives in the game header so players can silence SFX
/// instantly without digging through settings.
class _SoundToggle extends StatefulWidget {
  const _SoundToggle();

  @override
  State<_SoundToggle> createState() => _SoundToggleState();
}

class _SoundToggleState extends State<_SoundToggle> {
  @override
  Widget build(BuildContext context) {
    final on = GameAudio.instance.enabled;
    return IconButton(
      tooltip: on ? 'قطع صدا' : 'وصل صدا',
      icon: Icon(on ? Icons.volume_up_rounded : Icons.volume_off_rounded),
      onPressed: () async {
        await GameAudio.instance.setEnabled(!on);
        if (mounted) setState(() {});
      },
    );
  }
}
