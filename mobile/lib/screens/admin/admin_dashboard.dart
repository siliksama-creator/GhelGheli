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
    // خطا اینجا بلعیده می‌شود، عمداً.
    //
    // AsyncSection دقیقاً همین future را می‌خواند و خودش حالت خطا را با
    // دکمهٔ تلاش دوباره رندر می‌کند. اگر اینجا هم rethrow شود،
    // RefreshIndicator آن را به یک خطای مدیریت‌نشدهٔ فریم‌ورک تبدیل می‌کند
    // — یعنی یک خطا، دو بار گزارش، یکی‌شان به شکل کرش.
    try {
      await _data;
    } catch (_) {
      // AsyncSection نمایشش می‌دهد.
    }
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
                childAspectRatio: 1.45,
                children: [
                  StatCard('کاربران', d['users'],
                      icon: Icons.people_alt_rounded),
                  StatCard('کدهای امروز', d['usedCodesToday'],
                      icon: Icons.today_rounded,
                      accent: const Color(0xFF1C78FF)),
                  StatCard('کدهای ماه', d['usedCodesThisMonth'],
                      icon: Icons.calendar_month_rounded,
                      accent: const Color(0xFF00D49A)),
                  StatCard('جوایز در انتظار', d['pendingClaims'],
                      icon: Icons.pending_actions_rounded,
                      accent: const Color(0xFFF2A93B)),
                  StatCard('تیکت باز', d['pendingTickets'] ?? 0,
                      icon: Icons.support_agent_rounded,
                      accent: const Color(0xFF38BDF8)),
                  StatCard('برداشت در انتظار', d['pendingWithdrawals'] ?? 0,
                      icon: Icons.account_balance_wallet_rounded,
                      accent: const Color(0xFFF59E0B)),
                  StatCard('صف بررسی کارت', d['pendingPhotoReviews'] ?? 0,
                      icon: Icons.document_scanner_rounded,
                      accent: const Color(0xFFA855F7)),
                  StatCard('خطای باز', d['openCrashes'] ?? 0,
                      icon: Icons.bug_report_rounded,
                      accent: const Color(0xFFFF5070)),
                  StatCard('پلاس فعال', d['plusActive'] ?? 0,
                      icon: Icons.star_rounded,
                      accent: const Color(0xFFFFD166)),
                  StatCard('سکه در گردش', d['coinsInCirculation'] ?? 0,
                      icon: Icons.monetization_on_rounded,
                      accent: const Color(0xFF22E7A6)),
                  StatCard('عضویت امروز', d['usersJoinedToday'] ?? 0,
                      icon: Icons.person_add_alt_1_rounded),
                  StatCard('چرخش گردونه امروز', d['wheelSpinsToday'] ?? 0,
                      icon: Icons.casino_rounded),
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
