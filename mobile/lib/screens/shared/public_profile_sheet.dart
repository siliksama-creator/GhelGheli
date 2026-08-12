import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../widgets/async_section.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/safe_image.dart';

/// Shows a user's comprehensive public profile (points, league rank, club, plus, prizes, cards).
Future<void> showPublicProfile(
    BuildContext context, ApiClient api, Object? userId) async {
  if (userId == null) return;
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (sheetContext) => DraggableScrollableSheet(
      initialChildSize: 0.70,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      expand: false,
      builder: (_, controller) => Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0C1B30),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.6),
              blurRadius: 30,
              offset: const Offset(0, -10),
            ),
          ],
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: AsyncSection<dynamic>(
          future: api.get('/api/users/$userId/public'),
          builder: (context, data) => _PublicProfileBody(
              data: Map<String, dynamic>.from(data as Map),
              controller: controller),
        ),
      ),
    ),
  );
}

class _PublicProfileBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final ScrollController controller;
  const _PublicProfileBody({required this.data, required this.controller});

  @override
  Widget build(BuildContext context) {
    final rewards = List<Map<String, dynamic>>.from(data['rewards'] ?? []);
    final trophies = List<Map<String, dynamic>>.from(data['trophies'] ?? []);
    final cards = List<Map<String, dynamic>>.from(data['cards'] ?? []);
    final cos = Map<String, dynamic>.from(data['cosmetics'] as Map? ?? {});
    final hasPlus = cos['plus'] == true;
    final clubSlug = cos['club'] as String?;
    final bestRank = data['bestRank'];
    final totalPrize = (data['totalPrizeAmount'] as num?)?.toInt() ?? 0;

    return AnimatedProfileBackground(
      slug: cos['profileBackground'] as String?,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: ListView(
      controller: controller,
      children: [
        // Handle bar
        Center(
          child: Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),

        // ── User Header ──
        Row(
          children: [
            CosmeticAvatarFrame(
              frame: cos['frame'] as String?,
              child: AvatarImage(
                keyName: data['profile_avatar_key'],
                imageUrl: data['profile_image_url'],
                radius: 30,
                ring: true,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DisplayName(
                    name: data['nickname'] ?? 'کاربر',
                    cosmetics: cos,
                    showTitle: true,
                    level: (data['level'] is Map)
                        ? ((data['level'] as Map)['level'] as num?)?.toInt()
                        : null,
                    avatarKey: data['profile_image_url'] == null
                        ? data['profile_avatar_key']
                        : null,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (clubSlug != null && clubSlug.isNotEmpty) ...[
                        Image.asset(clubAsset(clubSlug), width: 16, height: 16, fit: BoxFit.contain, cacheWidth: 48,
                            errorBuilder: (_, __, ___) => const SizedBox.shrink()),
                        const SizedBox(width: 4),
                        Text(
                          'هوادار باشگاه',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(width: 8),
                      ],
                      if (hasPlus)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFD166).withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: 0.45)),
                          ),
                          child: const Text('★ عضو قلقلی پلاس',
                              style: TextStyle(color: Color(0xFFFFD166), fontSize: 9.5, fontWeight: FontWeight.w900)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 14),

        // ── 4-Grid Key Stats (Ultra Dense & Beautiful) ──
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
          childAspectRatio: 2.3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _StatCard(
              icon: Icons.emoji_events_rounded,
              iconColor: const Color(0xFFFFD166),
              title: 'رتبه لیگ این ماه',
              value: () {
                final r = data['currentLeagueRank'] ?? bestRank;
                return r != null ? 'رتبه ${faNum(r)}' : 'رتبه ۱';
              }(),
            ),
            _StatCard(
              icon: Icons.star_rounded,
              iconColor: const Color(0xFF38BDF8),
              title: 'مجموع امتیازات کل',
              value: '${faNum(data['lifetime_points'])} امتیاز',
            ),
            _StatCard(
              icon: Icons.account_balance_wallet_rounded,
              iconColor: const Color(0xFF34D399),
              title: 'جوایز نقدی کسب‌شده',
              value: totalPrize > 0 ? '${faNum(totalPrize)} تومان' : '۰ تومان',
            ),
            _StatCard(
              icon: Icons.card_giftcard_rounded,
              iconColor: const Color(0xFFFF8A3D),
              title: 'تعداد کل جوایز و تندیس‌ها',
              value: '${faNum(trophies.length + rewards.length)} جایزه',
            ),
          ],
        ),

        const SizedBox(height: 14),

        // ── Registered Cards Shelf ──
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('کلکسیون کارت‌های ثبت‌شده',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.white)),
            Text('${faNum(cards.length)} مدل کارت',
                style: const TextStyle(fontSize: 11, color: Color(0xFF38BDF8), fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 8),
        if (cards.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Center(
              child: Text('هنوز کارتی در کلکسیون این کاربر ثبت نشده است.',
                  style: TextStyle(color: Colors.white54, fontSize: 11)),
            ),
          )
        else
          SizedBox(
            height: 98,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: cards.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final c = cards[i];
                return Container(
                  width: 76,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Column(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: SafeImage(
                          url: c['image_url'],
                          width: 68,
                          height: 60,
                          fallbackAsset: 'assets/games/memory/medal.webp',
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${c['name'] ?? 'کارت'} (${faNum(c['registered_count'])}×)',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Colors.white70),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),

        const SizedBox(height: 14),

        // ── Rewards Won Shelf ──
        if (trophies.isNotEmpty || rewards.isNotEmpty) ...[
          const Text('جوایز و تندیس‌های کسب‌شده',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 8),
          SizedBox(
            height: 90,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final t in trophies)
                  Container(
                    width: 76,
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    child: Column(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: SafeImage(
                            url: t['image_url'],
                            width: 68,
                            height: 56,
                            fallbackAsset: 'assets/pass/reward_gift_icon.webp',
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${t['name'] ?? 'جایزه'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    )));
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.value,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 22),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10, color: Colors.white60, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
