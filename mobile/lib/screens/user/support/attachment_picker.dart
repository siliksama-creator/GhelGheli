import 'dart:io';

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

  Future<void> _pick(ImageSource source) async {
    final remaining = widget.max - widget.urls.length;
    if (remaining <= 0) return;

    final picker = ImagePicker();
    List<XFile> files = [];

    if (source == ImageSource.gallery) {
      final picked = await picker.pickMultiImage(imageQuality: 80);
      files = picked;
    } else {
      final photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 80);
      if (photo != null) files = [photo];
    }

    if (!mounted || files.isEmpty) return;

    final toUpload = files.take(remaining).toList();
    setState(() {
      _uploading = toUpload.length;
      _error = null;
    });

    final next = List<String>.from(widget.urls);
    for (final f in toUpload) {
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

  void _showPickerSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F1E36),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('انتخاب تصویر پیوست', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Colors.white)),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded, color: Color(0xFF38BDF8)),
                title: const Text('انتخاب از گالری تصاویر', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pick(ImageSource.gallery);
                },
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_rounded, color: Color(0xFF22E7A6)),
                title: const Text('گرفتن عکس با دوربین', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pick(ImageSource.camera);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final full = widget.urls.length >= widget.max;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Prominent Upload Target Box
        InkWell(
          onTap: (!widget.enabled || _busy || full) ? null : _showPickerSheet,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0xFF38BDF8).withValues(alpha: 0.08),
              border: Border.all(
                color: const Color(0xFF38BDF8).withValues(alpha: full ? 0.2 : 0.55),
                width: 1.2,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                      )
                    : const Icon(Icons.add_a_photo_rounded, size: 20, color: Color(0xFF38BDF8)),
                const SizedBox(width: 8),
                Text(
                  _busy
                      ? 'در حال آپلود تصویر…'
                      : full
                          ? 'تکمیل سقف ۵ تصویر'
                          : 'افزودن عکس / اسکرین‌شات پیوست (${faNum(widget.urls.length)} از ${faNum(widget.max)})',
                  style: const TextStyle(
                    color: Color(0xFF38BDF8),
                    fontWeight: FontWeight.w900,
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 6),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 11)),
        ],
        if (widget.urls.isNotEmpty) ...[
          const SizedBox(height: 8),
          SizedBox(
            height: 74,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: widget.urls.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
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
              color: Colors.white12,
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
                  color: Colors.black87,
                  borderRadius: BorderRadius.only(
                    bottomRight: Radius.circular(8),
                    topLeft: Radius.circular(6),
                  ),
                ),
                padding: const EdgeInsets.all(3),
                child: const Icon(Icons.close_rounded, size: 14, color: Colors.white),
              ),
            ),
          ),
      ],
    );
  }
}

class AttachmentGallery extends StatelessWidget {
  const AttachmentGallery({super.key, required this.attachments});
  final List attachments;

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final a in attachments)
            InkWell(
              onTap: () => _open(context, '$a'),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  fullAssetUrl(a),
                  width: 72,
                  height: 72,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox(width: 72, height: 72, child: Icon(Icons.broken_image_outlined)),
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
        insetPadding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: InteractiveViewer(
                maxScale: 4,
                child: Image.network(fullAssetUrl(url), fit: BoxFit.contain),
              ),
            ),
            const SizedBox(height: 8),
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
