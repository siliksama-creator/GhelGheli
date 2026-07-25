// Multi-image attachment picker for support messages (1..5 images).
//
// Uploads happen immediately on pick so the send button never has to wait on
// the network, and each thumbnail shows its own progress/failure state.
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';

class AttachmentPicker extends StatefulWidget {
  const AttachmentPicker({
    super.key,
    required this.api,
    required this.urls,
    required this.onChanged,
    this.max = 5,
    this.enabled = true,
  });

  final ApiClient api;

  /// Uploaded URLs collected so far (owned by the parent).
  final List<String> urls;
  final ValueChanged<List<String>> onChanged;
  final int max;
  final bool enabled;

  @override
  State<AttachmentPicker> createState() => _AttachmentPickerState();
}

class _AttachmentPickerState extends State<AttachmentPicker> {
  int _uploading = 0;
  String? _error;

  bool get _busy => _uploading > 0;

  Future<void> _pick() async {
    final remaining = widget.max - widget.urls.length;
    if (remaining <= 0) return;

    final picked = await ImagePicker().pickMultiImage(imageQuality: 78);
    if (picked.isEmpty) return;

    // Silently trim rather than failing the whole batch when the user picks
    // more than the remaining slots.
    final files = picked.take(remaining).toList();
    final skipped = picked.length - files.length;

    setState(() {
      _uploading = files.length;
      _error = skipped > 0
          ? 'حداکثر ${widget.max} عکس؛ $skipped مورد اضافه نادیده گرفته شد'
          : null;
    });

    final next = List<String>.from(widget.urls);
    for (final f in files) {
      try {
        final url = await widget.api.uploadSupportImage(f.path);
        next.add(url);
      } catch (e) {
        if (mounted) setState(() => _error = apiError(e));
      } finally {
        if (mounted) setState(() => _uploading--);
      }
    }
    if (!mounted) return;
    widget.onChanged(next);
  }

  void _remove(int i) {
    final next = List<String>.from(widget.urls)..removeAt(i);
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final full = widget.urls.length >= widget.max;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            OutlinedButton.icon(
              onPressed: (!widget.enabled || _busy || full) ? null : _pick,
              icon: _busy
                  ? const SizedBox(
                      width: 15,
                      height: 15,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add_photo_alternate_outlined, size: 18),
              label: Text(_busy ? 'در حال آپلود...' : 'افزودن عکس'),
            ),
            Gaps.hXs,
            Text(
              '${faNum(widget.urls.length)} از ${faNum(widget.max)}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: full ? theme.colorScheme.primary : null,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          Gaps.vXxs,
          Text(_error!,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.error)),
        ],
        if (widget.urls.isNotEmpty) ...[
          Gaps.vXs,
          SizedBox(
            height: 72,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: widget.urls.length,
              separatorBuilder: (_, __) => Gaps.hXs,
              itemBuilder: (_, i) => _Thumb(
                url: widget.urls[i],
                onRemove: widget.enabled ? () => _remove(i) : null,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url, this.onRemove});
  final String url;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: Corners.rSm,
          child: Image.network(
            fullAssetUrl(url),
            width: 72,
            height: 72,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              width: 72,
              height: 72,
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: const Icon(Icons.broken_image_outlined, size: 20),
            ),
          ),
        ),
        if (onRemove != null)
          Positioned(
            top: 0,
            left: 0,
            child: InkWell(
              onTap: onRemove,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.only(
                      bottomRight: Radius.circular(10),
                      topLeft: Radius.circular(10)),
                ),
                padding: const EdgeInsets.all(3),
                child: const Icon(Icons.close_rounded,
                    size: 14, color: Colors.white),
              ),
            ),
          ),
      ],
    );
  }
}

/// Read-only gallery for attachments already on a message.
class AttachmentGallery extends StatelessWidget {
  const AttachmentGallery({super.key, required this.attachments});
  final List attachments;

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: Gaps.xs),
      child: Wrap(
        spacing: Gaps.xs,
        runSpacing: Gaps.xs,
        children: [
          for (final a in attachments)
            InkWell(
              onTap: () => _open(context, '$a'),
              child: ClipRRect(
                borderRadius: Corners.rSm,
                child: Image.network(
                  fullAssetUrl(a),
                  width: 76,
                  height: 76,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox(
                      width: 76,
                      height: 76,
                      child: Icon(Icons.broken_image_outlined)),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _open(BuildContext context, String url) {
    showDialog(
      context: context,
      barrierColor: Colors.black87,
      builder: (c) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(Gaps.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: InteractiveViewer(
                maxScale: 4,
                child: Image.network(fullAssetUrl(url), fit: BoxFit.contain),
              ),
            ),
            Gaps.vSm,
            FilledButton.icon(
              onPressed: () => Navigator.pop(c),
              icon: const Icon(Icons.close_rounded),
              label: const Text('بستن'),
            ),
          ],
        ),
      ),
    );
  }
}
