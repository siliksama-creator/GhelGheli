/// Shared rendering rules for purchased cosmetics.
///
/// One place so the shop, chat, the league table, the club roster and the
/// profile always agree on what a crest, a frame or a name colour looks like.
/// The server decides WHETHER an item applies (ownership, Plus, or club
/// membership); this only draws it.
library;

import 'package:flutter/material.dart';

import 'assets.dart';

/// Crest asset for a club slug.
///
/// Derived, not mapped. The old hand-written map listed only the five
/// original Iranian clubs, so the eleven world clubs added later rendered
/// nothing — silently, because a missing key just fell through to a
/// placeholder icon.
String clubAsset(String? slug) =>
    (slug == null || slug.isEmpty) ? '' : clubAssetOf(slug);

const frameColors = <String, List<Color>>{
  'gold': [Color(0xFFFFD36B), Color(0xFFB8860B)],
  'neon': [Color(0xFFB5EF58), Color(0xFF00D49A)],
  'fire': [Color(0xFFFF8A3D), Color(0xFFF43F5E)],
  'ice': [Color(0xFF7DD3FC), Color(0xFF2563EB)],
  'holo': [Color(0xFFF472B6), Color(0xFFA855F7), Color(0xFF38BDF8)],
};

const rainbowColors = <Color>[
  Color(0xFFF472B6),
  Color(0xFFA855F7),
  Color(0xFF38BDF8),
  Color(0xFF34D399),
];

/// Colour for a name in chat / the league table. `rainbow` has no single
/// colour, so callers fall back to a gradient shader.
Color? nameColorOf(String? payload) {
  if (payload == null || payload == 'rainbow') return null;
  if (!payload.startsWith('#')) return null;
  final hex = payload.replaceFirst('#', '');
  final v = int.tryParse(hex, radix: 16);
  return v == null ? null : Color(0xFF000000 | v);
}

/// Small club crest drawn before a name.
class ClubBadge extends StatelessWidget {
  const ClubBadge({super.key, required this.club, this.size = 15});

  final String? club;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (club == null || club!.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 4),
      child: Image.asset(
        clubAsset(club),
        width: size,
        height: size,
        fit: BoxFit.contain,
        // THE HOTTEST IMAGE IN THE APP. This badge is drawn beside every
        // chat message and every league row, at 15px, from a 512px source.
        // Without cacheWidth each distinct crest costs 1 MB of decoded
        // bitmap; a chat full of different clubs could alone exceed the
        // 40 MB cache and start evicting everything else.
        cacheWidth: (size * 3).round(),
        // A crest for a club that was retired from the catalogue should
        // vanish, not leave a broken-image box next to someone's name.
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      ),
    );
  }
}

/// A display name with its badge, colour and Plus star.
///
/// Mirrors `DisplayName` in userweb/src/components/Cosmetics.jsx so a user
/// looks the same on both clients.
class DisplayName extends StatelessWidget {
  const DisplayName({
    super.key,
    required this.name,
    this.cosmetics,
    this.style,
    this.maxLines = 1,
    this.avatarKey,
  });

  final String name;
  final Map? cosmetics;
  final TextStyle? style;
  final int maxLines;

  /// What picture is already shown next to this name.
  ///
  /// If the user set their crest AS their profile picture, drawing the same
  /// crest again beside their name shows it twice in a row — which read as a
  /// rendering glitch, not a flourish. The badge exists to say "I support
  /// this club"; once the avatar says it, the badge is redundant.
  final Object? avatarKey;

  @override
  Widget build(BuildContext context) {
    final c = cosmetics ?? const {};
    final colour = nameColorOf(c['color'] as String?);
    final rainbow = c['color'] == 'rainbow';

    Widget text = Text(
      name,
      maxLines: maxLines,
      overflow: TextOverflow.ellipsis,
      style: (style ?? const TextStyle()).copyWith(color: colour),
    );

    if (rainbow) {
      // ShaderMask needs an opaque child colour to tint, so force white
      // before painting the gradient over it.
      text = ShaderMask(
        shaderCallback: (r) =>
            const LinearGradient(colors: rainbowColors).createShader(r),
        blendMode: BlendMode.srcIn,
        child: Text(
          name,
          maxLines: maxLines,
          overflow: TextOverflow.ellipsis,
          style: (style ?? const TextStyle()).copyWith(color: Colors.white),
        ),
      );
    }

    final club = c['club'] as String?;
    final avatarIsSameCrest =
        club != null && avatarKey?.toString() == 'club:$club';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!avatarIsSameCrest) ClubBadge(club: club),
        Flexible(child: text),
        if (c['plus'] == true)
          const Padding(
            padding: EdgeInsetsDirectional.only(start: 3),
            child: Text('⭐', style: TextStyle(fontSize: 11)),
          ),
      ],
    );
  }
}
