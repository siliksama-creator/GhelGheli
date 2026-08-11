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
  'blue_fire': [Color(0xFFBAE6FD), Color(0xFF2563EB), Color(0xFF38BDF8)],
  'stadium_frame': [Color(0xFF22C55E), Color(0xFF0EA5E9)],
  'animated_gold': [Color(0xFFB45309), Color(0xFFFFF0A3), Color(0xFFD97706)],
  'club_neon': [Color(0xFFC026D3), Color(0xFF22D3EE)],
  'season_champion': [Color(0xFFFFD166), Color(0xFFDC2626)],
  'champions_night': [Color(0xFF172554), Color(0xFFA78BFA)],
  'pro_holographic': [Color(0xFF22D3EE), Color(0xFFF472B6), Color(0xFFA3E635)],
  'annual_royal_frame': [Color(0xFFFFD166), Color(0xFF7C3AED)],
};

const nameGradientColors = <String, List<Color>>{
  'rainbow': rainbowColors,
  'gold_gradient': [Color(0xFFFFF0A3), Color(0xFFF59E0B)],
  'green_neon': [Color(0xFFD9F99D), Color(0xFF10B981)],
  'animated_fire': [Color(0xFFFDE047), Color(0xFFF97316), Color(0xFFEF4444)],
  'calm_rainbow': [Color(0xFF60A5FA), Color(0xFFC084FC), Color(0xFFF9A8D4)],
  'icy_glow': [Color(0xFFE0F2FE), Color(0xFF38BDF8)],
  'digital_typing': [Color(0xFF67E8F9), Color(0xFF22C55E)],
  'mvp_name': [Color(0xFFFFFFFF), Color(0xFFFFD166)],
  'social_team': [Color(0xFFFB7185), Color(0xFF8B5CF6)],
};

const resultTemplateColors = <String, List<Color>>{
  'result_stadium': [Color(0xFF052E16), Color(0xFF0EA5E9)],
  'result_champions': [Color(0xFF172554), Color(0xFF7C3AED)],
  'result_fire': [Color(0xFF450A0A), Color(0xFFF97316)],
  'result_ice': [Color(0xFF082F49), Color(0xFF7DD3FC)],
  'result_gold_mvp': [Color(0xFF422006), Color(0xFFFFD166)],
  'result_friendly': [Color(0xFF312E81), Color(0xFFFB7185)],
  'result_derby': [Color(0xFFB91C1C), Color(0xFF1D4ED8)],
  'result_world_cup': [Color(0xFF064E3B), Color(0xFFFACC15)],
  'annual_royal_result': [Color(0xFF1E1B4B), Color(0xFFFFD166)],
};

BoxDecoration? profileBackgroundDecoration(String? slug) {
  final colors = switch (slug) {
    'locker_room' => const [Color(0xFF3F2A1D), Color(0xFF0F172A)],
    'night_stadium' => const [Color(0xFF020617), Color(0xFF1D4ED8)],
    'player_tunnel' => const [Color(0xFF111827), Color(0xFFF59E0B)],
    'champion_podium' => const [Color(0xFF422006), Color(0xFFFFD166)],
    'training_ground' => const [Color(0xFF052E16), Color(0xFF22C55E)],
    'collection_room' => const [Color(0xFF1E1B4B), Color(0xFFA78BFA)],
    _ => null,
  };
  if (colors == null) return null;
  return BoxDecoration(
    gradient: LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: [colors.first.withValues(alpha: .78), const Color(0xE6030712)],
    ),
    image: DecorationImage(
      image: AssetImage('assets/shop/cosmetics/$slug.webp'),
      fit: BoxFit.cover,
      opacity: .46,
    ),
    borderRadius: BorderRadius.circular(22),
    border: Border.all(color: colors.last.withValues(alpha: .52)),
  );
}

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
  if (payload == null || nameGradientColors.containsKey(payload)) return null;
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
  const AnimePlusStar({super.key, this.size = 20, this.annual = false});
  final double size;
  final bool annual;

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
                widget.annual ? Icons.auto_awesome_rounded : Icons.star_rounded,
                size: sz,
                color: widget.annual ? const Color(0xFFE9D5FF) : const Color(0xFFFFD700),
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
    this.showTitle = false,
  });

  final String name;
  final Map? cosmetics;
  final TextStyle? style;
  final int maxLines;
  final Object? avatarKey;
  final int? level;
  final bool showTitle;

  @override
  Widget build(BuildContext context) {
    final c = cosmetics ?? const {};
    final onLight = Theme.of(context).brightness == Brightness.light;
    final colorKey = (c['color'] ?? c['nameColor']) as String?;
    final colour = nameColorOf(colorKey, onLight: onLight);
    final gradient = nameGradientColors[colorKey];

    Widget text = Text(
      name,
      maxLines: maxLines,
      overflow: TextOverflow.ellipsis,
      style: (style ?? const TextStyle()).copyWith(color: colour),
    );

    if (gradient != null) {
      text = ShaderMask(
        shaderCallback: (r) => LinearGradient(
          colors: onLight && colorKey == 'rainbow' ? rainbowColorsOnLight : gradient,
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

    final club = (c['club'] ?? c['clubBadge']) as String?;
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
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 2),
            child: AnimePlusStar(size: 19, annual: c['annual'] == true),
          ),
        if (showTitle && c['title'] != null)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 4),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: const Color(0xFFFFD166).withValues(alpha: .12),
                borderRadius: BorderRadius.circular(99),
                border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: .35)),
              ),
              child: Text('${c['title']}',
                  style: const TextStyle(fontSize: 7.5, color: Color(0xFFFFD166), fontWeight: FontWeight.w800)),
            ),
          ),
      ],
    );
  }
}
