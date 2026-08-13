import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/rarity_card_frame.dart';
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
    final primary = sides.cast<Map?>().firstWhere(
          (side) => side?['side'] == 'front',
          orElse: () => sides.isEmpty ? null : sides.first,
        );
    final analysisComplete = card['analysis_complete'] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.sm),
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.34),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.45)),
      ),
      child: Opacity(
        opacity: active ? 1 : 0.55,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 100,
                  height: 148,
                  child: RarityCardFrame(
                    rarity: card['duel_rarity'] as String?,
                    borderRadius: 17,
                    padding: 3,
                    child: SafeImage(
                      url: '${primary?['image_url'] ?? ''}',
                      fit: BoxFit.cover,
                      fallbackEmoji: '🃏',
                    ),
                  ),
                ),
                Gaps.hSm,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${card['card_type_name'] ?? '—'}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
                      Gaps.vXxs,
                      Text('${faNum(card['point_value'] ?? 0)} امتیاز · '
                          '${faNum(card['side_count'] ?? sides.length)} تصویر تشخیص',
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary)),
                      Text('${faNum(card['redeemed_count'] ?? 0)} بار ثبت شده'
                          '${card['code_count'] == null ? '' : ' · ${faNum(card['code_count'])} کد'}',
                          style: theme.textTheme.labelSmall),
                      Gaps.vXxs,
                      Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: [
                          _StatusChip(
                            text: analysisComplete ? 'اثر انگشت کامل' : 'آنالیز ناقص',
                            good: analysisComplete,
                          ),
                          _StatusChip(
                            text: 'OCR: ${faNum(card['ocr_token_count'] ?? 0)} توکن',
                            good: (card['ocr_token_count'] as num? ?? 0) > 0,
                          ),
                        ],
                      ),
                      Gaps.vXxs,
                      // کارتِ کلکسیونی استاتس ندارد؛ نمایشِ شش عددِ بی‌اثر
                      // مدیر را گمراه می‌کند که انگار در بازی نقشی دارد.
                      if (card['is_collectible'] == true)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            color: const Color(0x1FF59E0B),
                            border: Border.all(color: const Color(0x55F59E0B)),
                          ),
                          child: const Text('🏅 کارت کلکسیونی — در آرنای دوئل نیست',
                              style: TextStyle(fontSize: 10.5, color: Color(0xFFFBBF24))),
                        )
                      else
                        CardDuelStatsMini(item: card),
                    ],
                  ),
                ),
              ],
            ),
            Gaps.vSm,
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (var index = 0; index < sides.length; index++) ...[
                    _SidePreview(side: sides[index], index: index),
                    if (index + 1 < sides.length) Gaps.hXs,
                  ],
                ],
              ),
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

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.text, required this.good});
  final String text;
  final bool good;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: (good ? Colors.greenAccent : Colors.orangeAccent).withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: good ? Colors.greenAccent : Colors.orangeAccent,
            fontSize: 9,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}

class _SidePreview extends StatelessWidget {
  const _SidePreview({required this.side, required this.index});

  final Map side;
  final int index;

  @override
  Widget build(BuildContext context) {
    final kind = side['side']?.toString() ?? 'alternate';
    final complete = side['fingerprint_complete'] == true;
    return Container(
      width: 78,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: Corners.rSm,
        color: Colors.black.withValues(alpha: 0.18),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: Corners.rSm,
            child: SafeImage(
              url: '${side['image_url'] ?? ''}',
              width: 68,
              height: 88,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(height: 3),
          Text(_sideLabels[kind] ?? 'تصویر ${faNum(index + 1)}',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 9.5)),
          Text('${faNum(side['width'] ?? 0)}×${faNum(side['height'] ?? 0)}',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 8.5)),
          Text(complete ? 'آنالیز کامل' : 'ناقص',
              style: TextStyle(fontSize: 8.5, color: complete ? Colors.greenAccent : Colors.orangeAccent)),
        ],
      ),
    );
  }
}
