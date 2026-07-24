import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';

/// Leaderboard row for ranks beyond the podium (used by both the user
/// league page and the admin dashboard/league views).
class RankTile extends StatelessWidget {
  final int rank;
  final Map row;
  final VoidCallback? onTap;

  const RankTile(
      {super.key, required this.rank, required this.row, this.onTap});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isTop = rank <= 3;
    return Padding(
      padding: const EdgeInsets.only(bottom: Gaps.xs),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: Corners.rLg,
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.md, vertical: Gaps.sm + 2),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              color: isTop
                  ? const Color(0xFFFFC94D).withValues(alpha: 0.16)
                  : scheme.surfaceContainerHigh,
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: isTop
                      ? const Color(0xFFFFC94D)
                      : scheme.surfaceContainerHighest,
                  child: Text(
                    faNum(rank),
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: isTop ? const Color(0xFF241900) : scheme.onSurface,
                      fontSize: 13,
                    ),
                  ),
                ),
                Gaps.hSm,
                Expanded(
                  child: Text(
                    row['nickname'] ?? row['first_name'] ?? 'کاربر',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                Text('${faNum(row['points'])} امتیاز',
                    style: Theme.of(context).textTheme.labelMedium),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
