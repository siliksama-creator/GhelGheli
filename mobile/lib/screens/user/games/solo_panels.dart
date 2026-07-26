// Presentation pieces for the solo (time-attack) mode: the live HUD, the
// result card and the leaderboard.
//
// Kept apart from the screen that wires them together so no single game file
// grows heavy — the screen owns state, this file owns pixels.
import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/avatar_image.dart';
import 'memory_cards.dart' show memoryAccent;
import 'solo_session.dart';

/// Live stopwatch + flip counter + pairs found, shown while playing.
class SoloHud extends StatelessWidget {
  const SoloHud({super.key, required this.session, this.bestMs});
  final SoloSession session;
  final int? bestMs;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cards = (session.state['cards'] as List?) ?? const [];
    final found = cards.where((c) => c is Map && c['matched'] != null).length ~/ 2;
    final total = cards.isEmpty ? 8 : cards.length ~/ 2;
    // Beating your own best is the whole point of the mode, so show the
    // chase live rather than only revealing it at the end.
    final chasing = bestMs != null && session.running;
    final ahead = chasing && session.elapsedMs < bestMs!;

    Widget stat(IconData icon, String value, String label, Color color) =>
        Expanded(
          child: Column(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(height: 2),
              Text(value,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: color,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  )),
              Text(label, style: theme.textTheme.labelSmall),
            ],
          ),
        );

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xs),
      child: Column(
        children: [
          Row(
            children: [
              stat(Icons.timer_outlined, formatRunTime(session.elapsedMs), 'زمان',
                  chasing ? (ahead ? const Color(0xFF34D399) : const Color(0xFFF59E0B)) : memoryAccent),
              _divider(context),
              stat(Icons.touch_app_outlined, faNum(session.flips), 'برگرداندن',
                  theme.colorScheme.onSurface),
              _divider(context),
              stat(Icons.style_outlined, '${faNum(found)}/${faNum(total)}', 'جفت',
                  const Color(0xFF38BDF8)),
            ],
          ),
          if (bestMs != null) ...[
            Gaps.vXxs,
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(ahead ? Icons.trending_up_rounded : Icons.flag_outlined,
                    size: 13,
                    color: ahead
                        ? const Color(0xFF34D399)
                        : theme.colorScheme.outline),
                Gaps.hXxs,
                Text(
                  ahead
                      ? 'جلوتر از رکوردت (${formatRunTime(bestMs)})'
                      : 'رکورد تو: ${formatRunTime(bestMs)}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: ahead
                        ? const Color(0xFF34D399)
                        : theme.colorScheme.outline,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _divider(BuildContext context) => Container(
        width: 1,
        height: 30,
        color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
      );
}

/// End-of-run panel. Celebrates a personal best, otherwise shows the gap.
class SoloResult extends StatelessWidget {
  const SoloResult({
    super.key,
    required this.session,
    required this.onRetry,
    required this.onExit,
  });

  final SoloSession session;
  final VoidCallback onRetry;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final record = session.isRecord;
    final gap = (session.previousMs != null && session.finalMs != null)
        ? session.finalMs! - session.previousMs!
        : null;

    return AppCard(
      color: record ? memoryAccent.withValues(alpha: 0.10) : null,
      child: Column(
        children: [
          Text(record ? '🏅' : (session.perfect ? '🎯' : '👏'),
              style: const TextStyle(fontSize: 38)),
          Gaps.vXxs,
          Text(
            record ? 'رکورد جدید شخصی!' : 'آفرین، تمام شد',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w900,
              color: record ? memoryAccent : theme.colorScheme.onSurface,
            ),
          ),
          Gaps.vXs,
          Wrap(
            spacing: Gaps.xs,
            runSpacing: Gaps.xxs,
            alignment: WrapAlignment.center,
            children: [
              _Pill(
                icon: Icons.timer_outlined,
                label: formatRunTime(session.finalMs),
                color: memoryAccent,
              ),
              _Pill(
                icon: Icons.touch_app_outlined,
                label: '${faNum(session.finalFlips)} برگرداندن',
                color: const Color(0xFF38BDF8),
              ),
              if (session.perfect)
                const _Pill(
                  icon: Icons.auto_awesome_rounded,
                  label: 'بی‌نقص! هیچ کارتی تکراری نشد',
                  color: Color(0xFFFBBF24),
                ),
              if (session.rank != null)
                _Pill(
                  icon: Icons.leaderboard_rounded,
                  label: 'رتبه ${faNum(session.rank)} در جدول',
                  color: const Color(0xFF34D399),
                ),
            ],
          ),
          if (!record && gap != null && gap > 0) ...[
            Gaps.vXs,
            Text(
              '${formatRunTime(gap)} ثانیه تا رکوردت (${formatRunTime(session.bestMs)}) فاصله داری',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall,
            ),
          ],
          // Solo is intentionally point-free; say so plainly instead of
          // letting the player wonder why their balance didn't move.
          Gaps.vXs,
          Text(
            'بازی تنها امتیاز ندارد — فقط رکورد ثبت می‌شود. برای امتیاز با یک حریف واقعی بازی کن.',
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall
                ?.copyWith(color: theme.colorScheme.outline),
          ),
          Gaps.vMd,
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: onRetry,
                  style: FilledButton.styleFrom(backgroundColor: memoryAccent),
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('دوباره'),
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: OutlinedButton(onPressed: onExit, child: const Text('پایان')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Fastest players. One row per person — a single quick player can't own the
/// whole board.
class SoloLeaderboard extends StatelessWidget {
  const SoloLeaderboard({
    super.key,
    required this.rows,
    this.myRank,
    this.onOpenProfile,
  });

  final List rows;
  final int? myRank;
  final void Function(Object userId)? onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (rows.isEmpty) {
      return AppCard(
        child: Column(
          children: [
            Icon(Icons.emoji_events_outlined,
                size: 34, color: theme.colorScheme.outline),
            Gaps.vXs,
            Text('هنوز رکوردی ثبت نشده — اولین نفر باش!',
                textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
          ],
        ),
      );
    }

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 4, bottom: Gaps.xs),
            child: Row(
              children: [
                const Icon(Icons.leaderboard_rounded,
                    size: 17, color: memoryAccent),
                Gaps.hXxs,
                Text('سریع‌ترین‌ها',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const Spacer(),
                if (myRank != null)
                  Text('رتبه تو: ${faNum(myRank)}',
                      style: theme.textTheme.labelSmall
                          ?.copyWith(color: memoryAccent, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          for (var i = 0; i < rows.length; i++)
            _Row(
              row: rows[i] is Map ? rows[i] as Map : const {},
              position: i + 1,
              highlight: myRank != null && myRank == i + 1,
              onTap: onOpenProfile,
            ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.row,
    required this.position,
    required this.highlight,
    this.onTap,
  });
  final Map row;
  final int position;
  final bool highlight;
  final void Function(Object userId)? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final id = row['userId'];
    // Medal colours drawn as a gradient disc rather than 🥇🥈🥉. Those three
    // emoji are missing from a surprising number of systems, and an empty
    // box beside the top scorer looked broken. Same reasoning as the card
    // faces: never let a font decide whether the UI is readable.
    const medalColors = <int, List<Color>>{
      1: [Color(0xFFFDE68A), Color(0xFFF59E0B)],
      2: [Color(0xFFF1F5F9), Color(0xFF94A3B8)],
      3: [Color(0xFFFCD9B6), Color(0xFFB45309)],
    };
    final medal = medalColors[position];
    return InkWell(
      borderRadius: Corners.rMd,
      onTap: (onTap != null && id != null) ? () => onTap!(id) : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: Gaps.xs, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: Corners.rMd,
          color: highlight ? memoryAccent.withValues(alpha: 0.14) : null,
          border: highlight
              ? Border.all(color: memoryAccent.withValues(alpha: 0.5))
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 23,
              height: 23,
              alignment: Alignment.center,
              decoration: medal == null
                  ? null
                  : BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: medal,
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: const [
                        BoxShadow(color: Colors.black26, blurRadius: 4),
                      ],
                    ),
              child: Text(
                faNum(position),
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: medal == null
                      ? theme.colorScheme.onSurface
                      : (position == 3 ? Colors.white : const Color(0xFF2B1A02)),
                ),
              ),
            ),
            Gaps.hXxs,
            AvatarImage(
              keyName: row['profileAvatarKey'],
              imageUrl: row['profileImageUrl'],
              radius: 15,
            ),
            Gaps.hXs,
            Expanded(
              child: Text('${row['nickname'] ?? 'کاربر'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ),
            Text(
              formatRunTime((row['durationMs'] as num?)?.toInt()),
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
                color: memoryAccent,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            Gaps.hXxs,
            Text('· ${faNum(row['flips'])} برگرداندن',
                style: theme.textTheme.labelSmall),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.xs, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: Corners.rPill,
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          Gaps.hXxs,
          Text(label,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: color, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
