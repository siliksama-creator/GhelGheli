// Full-size view of an inventory card. Opened by tapping a card in the
// dashboard carousel so the player artwork the admin uploaded is actually
// visible instead of being cropped into a 168px tile.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/cached_card_image.dart';
import '../../widgets/rarity_card_frame.dart';

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
    final imageValue = item['image_url'] ?? item['imageUrl'];
    final img = fullAssetUrl(imageValue);
    final qty = item['quantity'];

    return Dialog(
      insetPadding: const EdgeInsets.all(Gaps.lg),
      backgroundColor: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Container(
              decoration: BoxDecoration(
                borderRadius: Corners.rXxl,
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFFFFD36B),
                    Color(0xFF0B2B4F),
                    Color(0xFF00D49A),
                  ],
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 30,
                    offset: const Offset(0, 14),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(Gaps.sm),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: RarityCardFrame(
                      rarity: item['duel_rarity'] as String?,
                      borderRadius: 22,
                      child: ClipRRect(
                      borderRadius: Corners.rLg,
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.25),
                        constraints: const BoxConstraints(minHeight: 200),
                        width: double.infinity,
                        child: img.isEmpty
                            ? const _Fallback(missing: true)
                            // همان کشِ دیسکیِ اینونتوری. اینجا مهم‌تر هم
                            // هست: نمای بزرگ عمداً `cacheWidth` ندارد
                            // (کاربر تا ۴ برابر زوم می‌کند و باید جزئیات
                            // را ببیند)، پس بدونِ کش هر بار بازکردنِ
                            // جزئیات یک دانلودِ تمام‌اندازه بود.
                            //
                            // چون کلیدِ کش خودِ URL است و همان URLی است
                            // که خانهٔ اینونتوری استفاده می‌کند، فایل
                            // قبلاً روی دیسک هست و این نما بدونِ هیچ
                            // درخواستی باز می‌شود.
                            : InteractiveViewer(
                                maxScale: 4,
                                child: CachedCardImage(
                                  url: imageValue,
                                  fit: BoxFit.contain,
                                  placeholder: const _Fallback(),
                                ),
                              ),
                      ),
                    ),
                    ),
                  ),
                  Gaps.vSm,
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Gaps.xs),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${item['name'] ?? 'کارت'}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 20,
                          ),
                        ),
                        Gaps.vXxs,
                        Row(
                          children: [
                            _Pill(
                              icon: Icons.inventory_2_rounded,
                              label: 'تعداد: ${faNum(qty)}',
                            ),
                            Gaps.hXs,
                            _Pill(
                              icon: Icons.star_rounded,
                              label: '${faNum(item['point_value'])} امتیاز',
                            ),
                          ],
                        ),
                        Gaps.vXs,
                        CardDuelStatsMini(item: item),
                        if ((item['description'] ?? '').toString().isNotEmpty) ...[
                          Gaps.vXs,
                          Text(
                            '${item['description']}',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 13),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Gaps.vXs,
                ],
              ),
            ),
          ),
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

class _Fallback extends StatelessWidget {
  const _Fallback({this.missing = false});
  final bool missing;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 220,
        child: Center(
          child: missing
              ? const Icon(Icons.image_not_supported_outlined,
                  color: Colors.white38, size: 42)
              : const SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
        ),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.xs, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.3),
        borderRadius: Corners.rPill,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.white70),
          const SizedBox(width: 4),
          Text(label,
              style: const TextStyle(color: Colors.white, fontSize: 12.5)),
        ],
      ),
    );
  }
}
