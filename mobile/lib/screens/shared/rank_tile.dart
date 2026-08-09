import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/tokens.dart';

/// Dense leaderboard row for ranks beyond the podium.
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
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: isTop
                  ? const Color(0xFFFFC94D).withValues(alpha: 0.16)
                  : scheme.surfaceContainerHigh.withValues(alpha: 0.65),
              border: Border.all(
                color: isTop
                    ? const Color(0xFFFFC94D).withValues(alpha: 0.35)
                    : Colors.white.withValues(alpha: 0.05),
              ),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 13,
                  backgroundColor: isTop
                      ? const Color(0xFFFFC94D)
                      : scheme.surfaceContainerHighest,
                  child: Text(
                    faNum(rank),
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: isTop ? const Color(0xFF241900) : scheme.onSurface,
                      fontSize: 11,
                    ),
                  ),
                ),
                Gaps.hSm,
                Expanded(
                  child: DisplayName(
                    name: row['nickname'] ?? row['first_name'] ?? 'کاربر',
                    cosmetics: row['cosmetics'] as Map?,
                    level: (row['level'] as num?)?.toInt(),
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                ),
                Text(
                  '${faNum(row['points'])} امتیاز',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: isTop ? const Color(0xFFFFD166) : const Color(0xFF38BDF8),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
