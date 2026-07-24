import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import '../shared/public_profile_sheet.dart';
import '../shared/rank_tile.dart';

/// Monthly league leaderboard: podium (top 3) + ranked list, refreshed
/// every 12s exactly as in the legacy `LeaguePage`.
class LeaguePage extends StatefulWidget {
  final ApiClient api;
  const LeaguePage({super.key, required this.api});

  @override
  State<LeaguePage> createState() => _LeaguePageState();
}

class _LeaguePageState extends State<LeaguePage> {
  Map? _data;
  Timer? _timer;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final x = await widget.api.get('/api/league/current');
    if (mounted)
      setState(() {
        _data = x;
        _loading = false;
      });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    final entries = List<Map>.from(_data?['entries'] ?? []);
    final season = _data?['season'];
    final end =
        season?['ends_at'] == null ? null : DateTime.parse(season['ends_at']);
    final daysLeft = end == null
        ? ''
        : '${faNum(end.difference(DateTime.now()).inDays)} روز تا پایان ماه';
    final top = entries.take(3).toList();
    final rest = entries.skip(3).toList();
    final brand = context.brand;
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          Container(
            padding: const EdgeInsets.all(Gaps.xl),
            decoration: BoxDecoration(
              borderRadius: Corners.rXxl,
              gradient: LinearGradient(
                  colors: brand.leagueGradient,
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25), blurRadius: 26)
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: Corners.rLg,
                  child: Image.asset('assets/brand/league_banner.webp',
                      height: 116, width: double.infinity, fit: BoxFit.cover),
                ),
                Gaps.vMd,
                const Text('لیگ ماهانه قلقلی',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 22)),
                Gaps.vXxs,
                Text(
                  'برترین کاربران تا پایان ماه؛ امتیاز لیگ آخر ماه ریست می‌شود اما امتیاز کلی دست نمی‌خورد.',
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.88),
                      fontSize: 12.5,
                      height: 1.5),
                ),
                Gaps.vMd,
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: Gaps.sm, vertical: 6),
                  decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.16),
                      borderRadius: Corners.rPill),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.timer_outlined,
                          size: 15, color: Colors.white),
                      const SizedBox(width: 6),
                      Text(daysLeft.isEmpty ? 'در حال محاسبه' : daysLeft,
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 12.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Gaps.vLg,
          if (top.isNotEmpty)
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: top.asMap().entries.map((e) {
                final i = e.key;
                final r = e.value;
                final isFirst = i == 0;
                return Expanded(
                  child: GestureDetector(
                    onTap: () =>
                        showPublicProfile(context, widget.api, r['user_id']),
                    child: Container(
                      height: isFirst ? 168 : 138,
                      margin: EdgeInsets.symmetric(
                          horizontal: 4, vertical: isFirst ? 0 : 8),
                      padding: const EdgeInsets.all(Gaps.sm),
                      decoration: BoxDecoration(
                        borderRadius: Corners.rXl,
                        gradient: LinearGradient(
                          colors: isFirst
                              ? [
                                  const Color(0xFFFFD36B),
                                  const Color(0xFF7A4D00)
                                ]
                              : [
                                  theme.colorScheme.surfaceContainerHighest,
                                  theme.colorScheme.surfaceContainer
                                ],
                        ),
                        boxShadow: [
                          BoxShadow(
                              color: Colors.black.withValues(alpha: 0.16),
                              blurRadius: 16,
                              offset: const Offset(0, 8))
                        ],
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(['🥇', '🥈', '🥉'][i],
                              style: const TextStyle(fontSize: 30)),
                          const SizedBox(height: 4),
                          Text(
                            r['nickname'] ?? r['first_name'] ?? 'کاربر',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                                color: isFirst
                                    ? const Color(0xFF241900)
                                    : theme.colorScheme.onSurface),
                          ),
                          Text(
                            '${faNum(r['points'])} امتیاز',
                            style: TextStyle(
                                fontSize: 11.5,
                                color: isFirst
                                    ? const Color(0xFF241900)
                                        .withValues(alpha: 0.75)
                                    : theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          Gaps.vMd,
          if (rest.isNotEmpty)
            ...rest.asMap().entries.map((e) => RankTile(
                rank: e.key + 4,
                row: e.value,
                onTap: () => showPublicProfile(
                    context, widget.api, e.value['user_id']))),
          if (entries.isEmpty)
            const AppCard(
                child: EmptyState(
                    icon: Icons.emoji_events_outlined,
                    title: 'هنوز امتیازی در لیگ ثبت نشده است')),
        ],
      ),
    );
  }
}
