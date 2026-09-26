import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/tokens.dart';
import '../../widgets/coin_chip.dart';

String _prizePart(Map row) {
  final kind = '${row['kind'] ?? ''}';
  final label = '${row['label'] ?? ''}'.trim();
  final value = row['value'];
  final base = switch (kind) {
    'cash' => '${faNum(value)} تومان',
    'points' => '${faNum(value)} امتیاز',
    'plus_days' => '${faNum(value)} روز قلقلی پلاس',
    'card_box' => '${faNum(value)} صندوق کارت',
    'shop_item' => label.isEmpty ? 'آیتم فروشگاه' : label,
    _ => label,
  };
  if (base.isEmpty) return '';
  if (label.isNotEmpty && kind != 'shop_item' && label != base) {
    return '$base · $label';
  }
  return base;
}

String prizeChipText(Object? prize) {
  if (prize is! List || prize.isEmpty) return '';
  final parts = <String>[];
  for (final item in prize) {
    if (item is! Map) continue;
    final line = _prizePart(Map<String, dynamic>.from(item));
    if (line.isNotEmpty) parts.add(line);
  }
  return parts.join(' و ');
}

Widget? prizeCaption(Object? prize, {double fontSize = 11, TextAlign textAlign = TextAlign.start}) {
  final text = prizeChipText(prize);
  if (text.isEmpty) return null;
  return Padding(
    padding: const EdgeInsets.only(top: 2),
    child: Text(
      text,
      textAlign: textAlign,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: const Color(0xFFFFD166),
        fontSize: fontSize,
        fontWeight: FontWeight.w800,
        height: 1.35,
      ),
    ),
  );
}

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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(11),
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
                  radius: 11,
                  backgroundColor: isTop
                      ? const Color(0xFFFFC94D)
                      : scheme.surfaceContainerHighest,
                  child: Text(
                    faNum(rank),
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: isTop ? const Color(0xFF241900) : scheme.onSurface,
                      fontSize: 10.5,
                    ),
                  ),
                ),
                Gaps.hSm,
                Expanded(
                  child: DisplayName(
                    name: row['nickname'] ?? row['first_name'] ?? 'کاربر',
                    cosmetics: row['cosmetics'] as Map?,
                    level: (row['level'] as num?)?.toInt(),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                ),
                if (prizeChipText(row['prize']).isNotEmpty)
                  Flexible(
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(end: 6),
                      child: Text(
                        prizeChipText(row['prize']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                        style: const TextStyle(color: Color(0xFFFFD166), fontSize: 11, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                CoinChip(value: row['coins'], size: 20),
                Gaps.hXs,
                Text(
                  faNum(row['points']),
                  style: TextStyle(
                    fontSize: 12,
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
