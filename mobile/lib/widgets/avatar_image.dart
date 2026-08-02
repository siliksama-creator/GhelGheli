import 'package:flutter/material.dart';
import '../core/assets.dart';
import '../api_client.dart';

/// Circular avatar that transparently falls back from a remote profile
/// photo to a bundled avatar illustration — same resolution logic as the
/// original `AvatarImage`, wrapped with a subtle ring for polish.
class AvatarImage extends StatelessWidget {
  final Object? keyName;
  final Object? imageUrl;
  final double radius;
  final bool ring;

  const AvatarImage(
      {super.key,
      this.keyName,
      this.imageUrl,
      this.radius = 28,
      this.ring = false});

  @override
  Widget build(BuildContext context) {
    final url = fullAssetUrl(imageUrl);
    // Decode at the size actually drawn. Avatars appear in every chat row,
    // every league row and every club roster row; at a 32px radius the
    // widget draws 64 logical px, so a full-resolution decode of each
    // distinct avatar is pure waste multiplied by the length of the list.
    // x3 covers the densest common Android screen.
    final cacheSide = (radius * 2 * 3).round();
    final image = url.isNotEmpty
        ? ResizeImage(NetworkImage(url), width: cacheSide)
        : ResizeImage(AssetImage(avatarAsset(keyName)), width: cacheSide)
            as ImageProvider;
    final avatar = CircleAvatar(radius: radius, backgroundImage: image);
    if (!ring) return avatar;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(2.5),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(colors: [scheme.primary, scheme.secondary]),
      ),
      child: Container(
        padding: const EdgeInsets.all(2),
        decoration:
            BoxDecoration(shape: BoxShape.circle, color: scheme.surface),
        child: avatar,
      ),
    );
  }
}
