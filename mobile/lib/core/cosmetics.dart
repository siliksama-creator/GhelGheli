/// Shared rendering rules for purchased cosmetics.
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../widgets/level_badge.dart';
import 'assets.dart';

/// Crest asset for a club slug.
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

const rainbowColorsOnLight = <Color>[
  Color(0xFFC2185B),
  Color(0xFF7B1FA2),
  Color(0xFF0264C8),
  Color(0xFF00795C),
];

const _nameColorOnLight = <int, Color>{
  0xFFFFC53D: Color(0xFF9B6C00), // طلایی
  0xFF00D49A: Color(0xFF008561), // زمردی
  0xFFF87171: Color(0xFFEA0C0C), // سرخ
  0xFF60A5FA: Color(0xFF086FEF), // آسمانی
  0xFFA855F7: Color(0xFF9E42F6), // بنفش
};

Color? nameColorOf(String? payload, {bool onLight = false}) {
  if (payload == null || payload == 'rainbow') return null;
  if (!payload.startsWith('#')) return null;
  final hex = payload.replaceFirst('#', '');
  final v = int.tryParse(hex, radix: 16);
  if (v == null) return null;
  final c = Color(0xFF000000 | v);
  if (!onLight) return c;
  return _nameColorOnLight[c.toARGB32()] ?? c;
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
        cacheWidth: (size * 3).round(),
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      ),
    );
  }
}

/// ستاره پلاس با هاله درخشش طلایی انیمه‌ای (بدون ستاره‌های ریز چرخان)
class AnimePlusStar extends StatefulWidget {
  const AnimePlusStar({super.key, this.size = 20});
  final double size;

  @override
  State<AnimePlusStar> createState() => _AnimePlusStarState();
}

class _AnimePlusStarState extends State<AnimePlusStar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  )..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sz = widget.size;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        final pulse = 0.85 + 0.30 * math.sin(t * 2 * math.pi).abs();

        return SizedBox(
          width: sz + 6,
          height: sz + 6,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // هاله درخشش ملایم و باکلاس طلایی
              Container(
                width: sz * 1.35 * pulse,
                height: sz * 1.35 * pulse,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      const Color(0xFFFFD700).withValues(alpha: 0.65 * pulse),
                      const Color(0xFFF59E0B).withValues(alpha: 0.20 * pulse),
                      Colors.transparent,
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFFFD700).withValues(alpha: 0.45 * pulse),
                      blurRadius: 10 * pulse,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              ),
              // ستاره طلایی اصلی با سایه گرم
              Icon(
                Icons.star_rounded,
                size: sz,
                color: const Color(0xFFFFD700),
                shadows: const [
                  Shadow(
                    color: Color(0xFFFFEA7A),
                    blurRadius: 6,
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

/// A display name with its badge, colour and Plus star.
class DisplayName extends StatelessWidget {
  const DisplayName({
    super.key,
    required this.name,
    this.cosmetics,
    this.style,
    this.maxLines = 1,
    this.avatarKey,
    this.level,
  });

  final String name;
  final Map? cosmetics;
  final TextStyle? style;
  final int maxLines;
  final Object? avatarKey;
  final int? level;

  @override
  Widget build(BuildContext context) {
    final c = cosmetics ?? const {};
    final onLight = Theme.of(context).brightness == Brightness.light;
    final colour = nameColorOf(c['color'] as String?, onLight: onLight);
    final rainbow = c['color'] == 'rainbow';

    Widget text = Text(
      name,
      maxLines: maxLines,
      overflow: TextOverflow.ellipsis,
      style: (style ?? const TextStyle()).copyWith(color: colour),
    );

    if (rainbow) {
      text = ShaderMask(
        shaderCallback: (r) => LinearGradient(
          colors: onLight ? rainbowColorsOnLight : rainbowColors,
        ).createShader(r),
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
        if (level != null) ...[
          LevelBadge(level: level!),
          const SizedBox(width: 3),
        ],
        Flexible(child: text),
        if (c['plus'] == true)
          const Padding(
            padding: EdgeInsetsDirectional.only(start: 2),
            child: AnimePlusStar(size: 19),
          ),
      ],
    );
  }
}
