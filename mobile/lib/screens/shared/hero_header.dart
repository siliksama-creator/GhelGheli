import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';

/// Dashboard hero header showing current points, greeting and progress
/// toward the next reward tier. Visual upgrade of the legacy `HeroHeader`
/// with the exact same data contract.
class HeroHeader extends StatelessWidget {
  final int points;
  final String nickname;
  final Map<String, dynamic>? nextReward;

  const HeroHeader(
      {super.key,
      required this.points,
      required this.nickname,
      this.nextReward});

  @override
  Widget build(BuildContext context) {
    final required = NumberParser.toInt(nextReward?['required_points']);
    final remaining = required > points ? required - points : 0;
    final progress = required > 0 ? (points / required).clamp(0.0, 1.0) : 0.0;
    final image = fullAssetUrl(nextReward?['image_url']);
    final brand = context.brand;

    return Container(
      padding: const EdgeInsets.all(Gaps.xl),
      decoration: BoxDecoration(
        borderRadius: Corners.rXxl,
        gradient: LinearGradient(
            colors: brand.heroGradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        boxShadow: [
          BoxShadow(
              color: brand.heroGradient.last.withValues(alpha: 0.32),
              blurRadius: 34,
              offset: const Offset(0, 16))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'سلام $nickname 👋',
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: Colors.white),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Gaps.vXs,
                    Text(faNum(points),
                        style: const TextStyle(
                            fontSize: 34,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            height: 1)),
                    const Text('امتیاز فعلی',
                        style: TextStyle(
                            color: Colors.white70,
                            fontWeight: FontWeight.w600,
                            fontSize: 13)),
                  ],
                ),
              ),
              if (image.isNotEmpty)
                ClipRRect(
                  borderRadius: Corners.rLg,
                  child: Container(
                    color: Colors.white.withValues(alpha: 0.14),
                    child: Image.network(image,
                        width: 68,
                        height: 68,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox()),
                  ),
                ),
            ],
          ),
          Gaps.vLg,
          ClipRRect(
            borderRadius: Corners.rPill,
            child: TweenAnimationBuilder<double>(
              duration: Motion.hero,
              curve: Motion.emphasized,
              tween: Tween(begin: 0, end: progress),
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 10,
                color: Colors.white,
                backgroundColor: Colors.white.withValues(alpha: 0.22),
              ),
            ),
          ),
          Gaps.vSm,
          Text(
            nextReward == null
                ? 'هنوز جایزه‌ای تعریف نشده است'
                : remaining == 0
                    ? 'شما به جایزه ${nextReward!['name']} رسیده‌اید 🎉'
                    : 'تا جایزه ${nextReward!['name']}: ${faNum(remaining)} امتیاز مانده',
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
          ),
        ],
      ),
    );
  }
}
