import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/safe_image.dart';

const _sideLabels = <String, String>{
  'front': 'روی کارت',
  'back': 'پشت کارت',
  'alternate': 'نمای دیگر',
};

/// One admin tile per card_type_id; front/back remain visible as recognition
/// samples but cannot be edited or enabled independently.
class GroupedPhotoCardTile extends StatelessWidget {
  const GroupedPhotoCardTile({
    super.key,
    required this.card,
    required this.onEdit,
    required this.onToggle,
    required this.onDelete,
  });

  final Map card;
  final VoidCallback onEdit;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sides = (card['sides'] as List? ?? const []).whereType<Map>().toList();
    final active = card['is_active'] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.xs),
      padding: const EdgeInsets.all(Gaps.xs),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
      ),
      child: Opacity(
        opacity: active ? 1 : 0.55,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 100),
                  child: Wrap(
                    spacing: Gaps.xxs,
                    children: [
                      for (var index = 0; index < sides.length; index++)
                        _SidePreview(side: sides[index], index: index),
                    ],
                  ),
                ),
                const SizedBox(width: Gaps.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${card['card_type_name'] ?? '—'}',
                          style: theme.textTheme.titleSmall),
                      Text('${faNum(card['point_value'] ?? 0)} امتیاز · '
                          '${faNum(card['side_count'] ?? sides.length)} تصویر تشخیص',
                          style: theme.textTheme.bodySmall),
                      Text('${faNum(card['redeemed_count'] ?? 0)} بار ثبت شده'
                          '${card['code_count'] == null ? '' : ' · ${faNum(card['code_count'])} کد'}',
                          style: theme.textTheme.labelSmall),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: Gaps.xs),
            Wrap(
              spacing: Gaps.xxs,
              runSpacing: Gaps.xxs,
              children: [
                OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_rounded, size: 15),
                  label: const Text('ویرایش کارت و کدها'),
                ),
                TextButton(
                  onPressed: onToggle,
                  child: Text(active ? 'غیرفعال کردن کارت' : 'فعال کردن کارت'),
                ),
                TextButton.icon(
                  onPressed: onDelete,
                  style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
                  icon: const Icon(Icons.delete_outline_rounded, size: 17),
                  label: const Text('حذف کارت'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SidePreview extends StatelessWidget {
  const _SidePreview({required this.side, required this.index});

  final Map side;
  final int index;

  @override
  Widget build(BuildContext context) {
    final kind = side['side']?.toString() ?? 'alternate';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: Corners.rSm,
          child: SafeImage(
            url: '${side['image_url'] ?? ''}',
            width: 42,
            height: 58,
            fit: BoxFit.cover,
          ),
        ),
        Text(_sideLabels[kind] ?? 'تصویر ${faNum(index + 1)}',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 9)),
      ],
    );
  }
}
