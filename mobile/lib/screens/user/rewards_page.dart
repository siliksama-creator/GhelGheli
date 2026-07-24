import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';
import '../../widgets/state_views.dart';

/// Rewards catalogue: same GET /api/rewards + POST /api/rewards/:id/claim
/// contract as the legacy `RewardsPage`.
class RewardsPage extends StatefulWidget {
  final ApiClient api;
  const RewardsPage({super.key, required this.api});

  @override
  State<RewardsPage> createState() => _RewardsPageState();
}

class _RewardsPageState extends State<RewardsPage> {
  late Future<dynamic> _future = widget.api.get('/api/rewards');

  Future<void> _reload() async {
    setState(() => _future = widget.api.get('/api/rewards'));
    await _future;
  }

  Future<void> _claim(String id) async {
    try {
      await widget.api.post('/api/rewards/$id/claim', {});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('درخواست جایزه ثبت شد')));
      }
      await _reload();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _future,
        onRetry: _reload,
        builder: (context, data) {
          final rewards = List<Map<String, dynamic>>.from(data as List);
          return ListView(
            padding:
                const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ClipRRect(
                        borderRadius: Corners.rLg,
                        child: Image.asset('assets/brand/rewards_banner.webp',
                            height: 132, fit: BoxFit.cover)),
                    Gaps.vMd,
                    Text('جوایز قلقلی', style: theme.textTheme.headlineSmall),
                    Gaps.vXxs,
                    Text('امتیاز جمع کن، جایزه بگیر و پیشرفتت را ببین.',
                        style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              Gaps.vLg,
              if (rewards.isEmpty)
                const AppCard(
                    child: EmptyState(
                        icon: Icons.card_giftcard_rounded,
                        title: 'هنوز جایزه‌ای تعریف نشده است'))
              else
                ...rewards.map((r) => Padding(
                      padding: const EdgeInsets.only(bottom: Gaps.sm),
                      child: AppCard(
                        padding: const EdgeInsets.all(Gaps.md),
                        child: Row(
                          children: [
                            ClipRRect(
                              borderRadius: Corners.rMd,
                              child: r['image_url'] != null
                                  ? Image.network(fullAssetUrl(r['image_url']),
                                      width: 56, height: 56, fit: BoxFit.cover)
                                  : Container(
                                      width: 56,
                                      height: 56,
                                      color: theme
                                          .colorScheme.surfaceContainerHighest,
                                      child: const Icon(
                                          Icons.card_giftcard_rounded),
                                    ),
                            ),
                            Gaps.hMd,
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(r['name'] ?? '',
                                      style: theme.textTheme.titleSmall,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 2),
                                  Text(
                                      '${faNum(r['required_points'])} امتیاز — ${r['reward_value']}',
                                      style: theme.textTheme.bodySmall),
                                ],
                              ),
                            ),
                            Gaps.hSm,
                            FilledButton.tonal(
                              onPressed: r['eligible'] == true
                                  ? () => _claim(r['id'])
                                  : null,
                              child: const Text('دریافت'),
                            ),
                          ],
                        ),
                      ),
                    )),
            ],
          );
        },
      ),
    );
  }
}
