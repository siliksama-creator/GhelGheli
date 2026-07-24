import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/async_section.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/state_views.dart';

/// Shows a user's public profile (nickname, points, cards, rewards) in a
/// bottom sheet — same endpoint & fields as the legacy `showPublicProfile`.
Future<void> showPublicProfile(
    BuildContext context, ApiClient api, Object? userId) async {
  if (userId == null) return;
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => DraggableScrollableSheet(
      initialChildSize: 0.62,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (_, controller) => Padding(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.lg),
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
    final theme = Theme.of(context);
    final rewards = List<Map<String, dynamic>>.from(data['rewards'] ?? []);
    final cards = List<Map<String, dynamic>>.from(data['cards'] ?? []);
    final joined = data['joined_at'] == null
        ? '-'
        : (DateTime.tryParse('${data['joined_at']}')
                ?.toLocal()
                .toString()
                .split('.')
                .first ??
            '-');

    return ListView(
      controller: controller,
      children: [
        Row(
          children: [
            AvatarImage(
                keyName: data['profile_avatar_key'],
                imageUrl: data['profile_image_url'],
                radius: 32,
                ring: true),
            Gaps.hMd,
            Expanded(
              child: Text(data['nickname'] ?? 'کاربر',
                  style: theme.textTheme.headlineSmall),
            ),
          ],
        ),
        Gaps.vLg,
        _StatRow(
            icon: Icons.calendar_month_rounded,
            label: 'زمان عضویت',
            value: joined),
        _StatRow(
            icon: Icons.star_rounded,
            label: 'امتیاز تاریخی کسب‌شده',
            value: faNum(data['lifetime_points'])),
        _StatRow(
            icon: Icons.bolt_rounded,
            label: 'امتیاز فعلی',
            value: faNum(data['current_points'])),
        const Divider(height: Gaps.xxl),
        Text('کارت‌های ثبت‌شده', style: theme.textTheme.titleSmall),
        Gaps.vSm,
        if (cards.isEmpty)
          const EmptyState(
              icon: Icons.credit_card_off_rounded,
              title: 'هنوز کارتی ثبت نکرده است')
        else
          ...cards.take(8).map(
                (card) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: card['image_url'] != null
                      ? ClipRRect(
                          borderRadius: Corners.rSm,
                          child: Image.network(fullAssetUrl(card['image_url']),
                              width: 40, height: 40, fit: BoxFit.cover))
                      : const Icon(Icons.credit_card_rounded),
                  title: Text(card['name'] ?? ''),
                  subtitle:
                      Text('تعداد ثبت: ${faNum(card['registered_count'])}'),
                ),
              ),
        const Divider(height: Gaps.xxl),
        Text('جوایز دریافت‌شده', style: theme.textTheme.titleSmall),
        Gaps.vSm,
        if (rewards.isEmpty)
          const EmptyState(
              icon: Icons.card_giftcard_rounded,
              title: 'هنوز جایزه تاییدشده‌ای ندارد')
        else
          ...rewards.take(8).map(
                (r) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: r['image_url'] != null
                      ? ClipRRect(
                          borderRadius: Corners.rSm,
                          child: Image.network(fullAssetUrl(r['image_url']),
                              width: 40, height: 40, fit: BoxFit.cover))
                      : const Icon(Icons.card_giftcard_rounded),
                  title: Text(r['name'] ?? ''),
                  subtitle: Text(r['status'] ?? ''),
                ),
              ),
        Gaps.vMd,
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _StatRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          Gaps.hSm,
          Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
          Text(value, style: theme.textTheme.titleSmall),
        ],
      ),
    );
  }
}
