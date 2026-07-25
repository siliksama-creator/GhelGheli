import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';

/// Image picker + preview used by every admin image input (card types,
/// rewards, stickers).
///
/// The old version was a bare text field with a gallery button that gave no
/// feedback at all: the upload ran silently in the background, so an admin
/// could pick a photo and hit "save" a moment later while the field was
/// still empty — the record was then created with an empty image_url even
/// though the file had landed on the VPS. It also swallowed upload errors
/// entirely. This version shows the upload in progress, previews the
/// result, and surfaces failures.
class ImageUrlField extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onPick;
  final String label;

  /// True while an upload is in flight — disables the button and shows a bar.
  final bool uploading;

  /// Last upload error, shown inline so it can't go unnoticed.
  final String? error;

  const ImageUrlField({
    super.key,
    required this.controller,
    required this.onPick,
    this.label = 'عکس / آدرس آپلودشده',
    this.uploading = false,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final url = controller.text.trim();
        final hasImage = url.isNotEmpty;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _Thumb(url: url, uploading: uploading),
                Gaps.hSm,
                Expanded(
                  child: TextField(
                    controller: controller,
                    decoration: InputDecoration(
                      labelText: label,
                      prefixIcon: const Icon(Icons.link_rounded),
                      helperText: uploading
                          ? 'در حال آپلود عکس...'
                          : (hasImage ? 'عکس آماده است ✓' : 'هنوز عکسی انتخاب نشده'),
                      helperStyle: TextStyle(
                        color: uploading
                            ? theme.colorScheme.primary
                            : (hasImage
                                ? const Color(0xFF16A34A)
                                : theme.colorScheme.outline),
                        fontWeight: FontWeight.w600,
                      ),
                      suffixIcon: hasImage && !uploading
                          ? IconButton(
                              tooltip: 'حذف عکس',
                              icon: const Icon(Icons.clear_rounded, size: 18),
                              onPressed: () => controller.clear(),
                            )
                          : null,
                    ),
                  ),
                ),
                Gaps.hSm,
                IconButton.filledTonal(
                  onPressed: uploading ? null : onPick,
                  tooltip: 'انتخاب از گالری',
                  icon: uploading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2.2),
                        )
                      : const Icon(Icons.photo_library_rounded),
                ),
              ],
            ),
            if (uploading) ...[
              Gaps.vXxs,
              const LinearProgressIndicator(minHeight: 3),
            ],
            if (error != null) ...[
              Gaps.vXxs,
              Row(
                children: [
                  Icon(Icons.error_outline_rounded,
                      size: 15, color: theme.colorScheme.error),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      error!,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.error),
                    ),
                  ),
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url, required this.uploading});
  final String url;
  final bool uploading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final full = fullAssetUrl(url);
    return Container(
      width: 54,
      height: 54,
      decoration: BoxDecoration(
        borderRadius: Corners.rSm,
        color: theme.colorScheme.surfaceContainerHighest,
        border: Border.all(
          color: url.isEmpty
              ? theme.colorScheme.outline.withValues(alpha: 0.35)
              : const Color(0xFF16A34A),
          width: 1.4,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: uploading
          ? const Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2.2),
              ),
            )
          : (full.isEmpty
              ? Icon(Icons.image_outlined,
                  color: theme.colorScheme.outline, size: 22)
              : Image.network(
                  full,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Icon(Icons.broken_image_outlined,
                      color: theme.colorScheme.error, size: 22),
                )),
    );
  }
}
