/// Shared rendering rules for purchased cosmetics.
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../widgets/level_badge.dart';
import 'assets.dart';
import '../widgets/cosmetic_motion.dart';

export 'cosmetic_palette.dart';
export '../widgets/cosmetic_motion.dart';

/// Crest asset for a club slug.
String clubAsset(String? slug) =>
    (slug == null || slug.isEmpty) ? '' : clubAssetOf(slug);

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
    final colorKey = (c['color'] ?? c['nameColor']) as String?;
    final text = AnimatedNameText(
      name: name,
      effect: colorKey,
      style: style,
      maxLines: maxLines,
    );

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
        if (c['profileBadge'] != null) ...[
          const SizedBox(width: 3),
          ProfileBadgeVisual(badge: c['profileBadge'] as String?, compact: true),
        ],
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
