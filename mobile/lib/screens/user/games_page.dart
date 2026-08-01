// Games hub. Each board lives in its own file under ./games/ so this screen
// stays a thin launcher rather than growing every time a game is added.
import 'package:flutter/material.dart';
import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import 'games/connect4_board.dart';
import 'games/reversi_board.dart';
import 'games/memory_board.dart';
import 'games/tap/tap_screen.dart';

class _GameEntry {
  const _GameEntry(
    this.id,
    this.title,
    this.subtitle,
    this.emoji,
    this.accent,
    this.art, {
    this.bot = true,
    this.solo = false,
    this.singlePlayer = false,
  });
  final String id;
  final String title;
  final String subtitle;
  final String emoji;
  final Color accent;
  final String art;

  /// Whether an empty lobby falls back to a computer opponent. جفت‌یاب says
  /// no — the tile must not advertise a bot that will never appear.
  final bool bot;

  /// Playable alone against the clock (records only, no points).
  final bool solo;

  /// Purely single-player: no lobby, no opponent, no bot. The tile must not
  /// advertise any multiplayer affordance for these.
  final bool singlePlayer;
}

const _games = <_GameEntry>[
  _GameEntry('tap', 'ضربه‌زن', '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', '👊',
      Color(0xFF84CC16), 'assets/games/tap/skin_1.webp',
      bot: false, singlePlayer: true),
  _GameEntry('memory', 'جفت‌یاب', 'جفت‌ها را به خاطر بسپار و ببر', '🃏',
      Color(0xFFA855F7), 'assets/games/memory.webp',
      bot: false, solo: true),
  _GameEntry('connect4', 'چهار در یک ردیف', 'چهارتا رو ردیف کن', '🔴',
      Color(0xFFF59E0B), 'assets/games/connect4.webp'),
  _GameEntry('reversi', 'اتللو', 'مهره‌ها را برگردان', '⚫', Color(0xFF34D399),
      'assets/games/reversi.webp'),
];

class GamesHubPage extends StatefulWidget {
  const GamesHubPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<GamesHubPage> createState() => _GamesHubPageState();
}

class _GamesHubPageState extends State<GamesHubPage> {
  String? _active;

  void _back() => setState(() => _active = null);

  @override
  Widget build(BuildContext context) {
    switch (_active) {
      case 'tap':
        return TapGameScreen(api: widget.api, onBack: _back);
      case 'memory':
        return MemoryScreen(api: widget.api, onBack: _back);
      case 'connect4':
        return Connect4Screen(api: widget.api, onBack: _back);
      case 'reversi':
        return ReversiScreen(api: widget.api, onBack: _back);
    }

    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(Gaps.lg),
      children: [
        Text('بخش بازی‌ها 🎮',
            style: theme.textTheme.headlineSmall
                ?.copyWith(fontWeight: FontWeight.w800)),
        Gaps.vXxs,
        Text(
          'با کاربران دیگر آنلاین رقابت کن و امتیاز بگیر. جفت‌یاب را می‌توانی '
          'تنها هم بازی کنی و رکورد بزنی.',
          style: theme.textTheme.bodyMedium,
        ),
        Gaps.vLg,
        for (final g in _games) ...[
          _GameTile(entry: g, onTap: () => setState(() => _active = g.id)),
          Gaps.vSm,
        ],
      ],
    );
  }
}

class _GameTile extends StatelessWidget {
  const _GameTile({required this.entry, required this.onTap});
  final _GameEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: Corners.rXl,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 7,
                  child: Image.asset(
                    entry.art,
                    fit: BoxFit.cover,
                    // Never let a missing/corrupt asset blank the whole hub.
                    errorBuilder: (_, __, ___) => Container(
                      color: entry.accent.withValues(alpha: 0.18),
                      alignment: Alignment.center,
                      child: Text(entry.emoji,
                          style: const TextStyle(fontSize: 40)),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.72),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: Gaps.md,
                  bottom: Gaps.xs,
                  left: Gaps.md,
                  child: Row(
                    children: [
                      Text(entry.emoji, style: const TextStyle(fontSize: 22)),
                      Gaps.hXs,
                      Expanded(
                        child: Text(
                          entry.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(Gaps.md),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(entry.subtitle, style: theme.textTheme.bodySmall),
                        Gaps.vXs,
                        Wrap(spacing: Gaps.xxs, runSpacing: Gaps.xxs, children: [
                          if (entry.singlePlayer) ...[
                            _Tag(label: 'تک‌نفره', color: entry.accent),
                            const _Tag(
                                label: '۵۰ لول', color: Color(0xFFF59E0B)),
                            const _Tag(
                                label: 'ذخیرهٔ خودکار',
                                color: Color(0xFF34D399)),
                          ] else ...[
                            _Tag(label: 'دو نفره آنلاین', color: entry.accent),
                            if (entry.bot)
                              _Tag(label: 'بازی با ربات', color: entry.accent)
                            else
                              const _Tag(
                                  label: 'فقط حریف واقعی',
                                  color: Color(0xFF38BDF8)),
                            if (entry.solo)
                              const _Tag(
                                  label: 'بازی تنها · رکوردی',
                                  color: Color(0xFF34D399)),
                          ],
                        ]),
                      ],
                    ),
                  ),
                  Icon(Icons.play_circle_fill_rounded,
                      size: 34, color: entry.accent),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.xs, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: Corners.rPill,
      ),
      child: Text(
        label,
        style: Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
