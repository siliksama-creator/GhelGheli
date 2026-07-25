// A network image that can never blow up the UI.
//
// Several screens used a bare `Image.network`, which renders Flutter's grey
// exception box when a URL 404s or the connection drops mid-download — and
// on a poor mobile connection that happened often. This wraps the common
// cases: a graceful placeholder while loading, a quiet fallback on error,
// and a memory cache sized to what is actually on screen.
import 'package:flutter/material.dart';

import '../api_client.dart';
import '../theme/tokens.dart';

class SafeImage extends StatelessWidget {
  const SafeImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.fallbackIcon = Icons.image_outlined,
    this.fallbackEmoji,
  });

  /// Absolute URL, or a `/uploads/...` path resolved against the API base.
  final Object? url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final IconData fallbackIcon;
  final String? fallbackEmoji;

  @override
  Widget build(BuildContext context) {
    final resolved = fullAssetUrl(url);
    Widget child;

    if (resolved.isEmpty) {
      child = _placeholder(context);
    } else {
      // Decode at roughly the display size: full-resolution decodes of a
      // 1600px upload into a 60px avatar wasted a lot of memory.
      final dpr = MediaQuery.maybeOf(context)?.devicePixelRatio ?? 2.0;
      final cacheW = width == null ? null : (width! * dpr).round();
      final cacheH = height == null ? null : (height! * dpr).round();

      child = Image.network(
        resolved,
        width: width,
        height: height,
        fit: fit,
        cacheWidth: cacheW,
        cacheHeight: cacheH,
        filterQuality: FilterQuality.medium,
        loadingBuilder: (context, widget, progress) =>
            progress == null ? widget : _loading(context),
        errorBuilder: (_, __, ___) => _placeholder(context),
      );
    }

    if (borderRadius != null) {
      child = ClipRRect(borderRadius: borderRadius!, child: child);
    }
    return child;
  }

  Widget _loading(BuildContext context) => Container(
        width: width,
        height: height,
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );

  Widget _placeholder(BuildContext context) => Container(
        width: width,
        height: height,
        color: Theme.of(context)
            .colorScheme
            .surfaceContainerHighest
            .withValues(alpha: 0.6),
        alignment: Alignment.center,
        child: fallbackEmoji != null
            ? Text(fallbackEmoji!,
                style: TextStyle(fontSize: (height ?? 40) * 0.45))
            : Icon(fallbackIcon,
                size: ((height ?? 40) * 0.4).clamp(14.0, 40.0),
                color: Theme.of(context).colorScheme.outline),
      );
}

/// Convenience for the common "rounded thumbnail" case.
class SafeThumb extends StatelessWidget {
  const SafeThumb({
    super.key,
    required this.url,
    this.size = 56,
    this.radius,
    this.fallbackEmoji,
  });

  final Object? url;
  final double size;
  final double? radius;
  final String? fallbackEmoji;

  @override
  Widget build(BuildContext context) => SafeImage(
        url: url,
        width: size,
        height: size,
        borderRadius: BorderRadius.circular(radius ?? Corners.sm),
        fallbackEmoji: fallbackEmoji,
      );
}
