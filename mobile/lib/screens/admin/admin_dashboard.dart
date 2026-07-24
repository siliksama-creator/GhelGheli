import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/async_section.dart';
import '../shared/rank_tile.dart';
import 'widgets/stat_card.dart';

/// Admin overview: KPI grid + live leaderboard preview. Same
/// GET /api/admin/dashboard payload as the legacy `AdminDashboard`.
class AdminDashboard extends StatefulWidget {
  final ApiClient api;
  const AdminDashboard({super.key, required this.api});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  late Future<dynamic> _data = widget.api.get('/api/admin/dashboard');

  Future<void> _reload() async {
    setState(() => _data = widget.api.get('/api/admin/dashboard'));
    await _data;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: AsyncSection<dynamic>(
        future: _data,
        onRetry: _reload,
        builder: (context, d) {
          final entries = List<Map>.from(d['league']['entries'] ?? []);
          return ListView(
            padding:
                const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
            children: [
              GridView.count(
                crossAxisCount: MediaQuery.sizeOf(context).width > 900 ? 4 : 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: Gaps.sm,
                mainAxisSpacing: Gaps.sm,
                childAspectRatio: 1.5,
                children: [
                  StatCard('کاربران', d['users'],
                      icon: Icons.people_alt_rounded),
                  StatCard('کدهای امروز', d['usedCodesToday'],
                      icon: Icons.today_rounded,
                      accent: const Color(0xFF1C78FF)),
                  StatCard('کدهای ماه', d['usedCodesThisMonth'],
                      icon: Icons.calendar_month_rounded,
                      accent: const Color(0xFF00D49A)),
                  StatCard('درخواست‌های در انتظار', d['pendingClaims'],
                      icon: Icons.pending_actions_rounded,
                      accent: const Color(0xFFF2A93B)),
                ],
              ),
              Gaps.vLg,
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('لیدربرد زنده', style: theme.textTheme.titleLarge),
                    Gaps.vMd,
                    ...entries.map((r) => RankTile(
                        rank: int.tryParse('${r['rank']}') ?? 0, row: r)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
