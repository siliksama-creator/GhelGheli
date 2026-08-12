import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/player_card.dart';
import '../../widgets/rarity_card_frame.dart'; // RarityCardFrame via PlayerCard

Future<void> showCardDetail(BuildContext context, Map<String, dynamic> item) {
  return showDialog(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.82),
    builder: (_) => _CardDetailDialog(item: item),
  );
}

class _CardDetailDialog extends StatelessWidget {
  const _CardDetailDialog({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final qty = item['quantity'] ?? item['registered_count'];

    return Dialog(
      insetPadding: const EdgeInsets.all(Gaps.lg),
      backgroundColor: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360, maxHeight: 620),
              child: PlayerCard(
                card: item,
                showStats: true,
              ),
            ),
          ),
          Gaps.vSm,
          Text(
            '${faNum(item['point_value'])} امتیاز · تعداد ${faNum(qty)} · ${rarityLabels[cardRarityOf(item)] ?? ''}',
            style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800),
          ),
          if ((item['description'] ?? '').toString().isNotEmpty) ...[
            Gaps.vXs,
            Text('${item['description']}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white60, fontSize: 13)),
          ],
          Gaps.vMd,
          FilledButton.icon(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close_rounded),
            label: const Text('بستن'),
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
              foregroundColor: theme.colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
