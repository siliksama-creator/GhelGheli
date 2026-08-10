import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../core/cosmetics.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/lifecycle_poller.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import '../shared/public_profile_sheet.dart';
import '../shared/rank_tile.dart';
import 'clubs_page.dart';

/// Monthly league leaderboard: podium (top 3) + ranked list, refreshed
/// every 12s. Includes Previous Season Winners tab.
class LeaguePage extends StatefulWidget {
  final ApiClient api;
  const LeaguePage({super.key, required this.api});

  @override
  State<LeaguePage> createState() => _LeaguePageState();
}

class _LeaguePageState extends State<LeaguePage> with LifecyclePoller {
  Map? _data;
  bool _loading = true;
  String? _error;
  int _tab = 0;
  String? _selectedLeagueId;

  @override
  void initState() {
    super.initState();
    _load();
    startPolling(const Duration(seconds: 12), _load);
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final url = _selectedLeagueId != null
          ? '/api/league/current?seasonId=$_selectedLeagueId'
          : '/api/league/current';
      final x = await widget.api.get(url);
      if (!mounted) return;
      setState(() {
        _data = x is Map ? x : null;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  Widget _tabs() => Padding(
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, 0),
        child: SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('جدول لیگ')),
            ButtonSegment(value: 1, label: Text('باشگاه‌ها')),
            ButtonSegment(value: 2, label: Text('برندگان قبل')),
          ],
          selected: {_tab},
          showSelectedIcon: false,
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
      );

  @override
  Widget build(BuildContext context) {
    if (_tab == 1) {
      return Column(
        children: [
          _tabs(),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Gaps.md),
              child: ClubsTab(api: widget.api),
            ),
          ),
        ],
      );
    }

    if (_tab == 2) {
      return Column(
        children: [
          _tabs(),
          Expanded(
            child: _PreviousWinnersView(data: _data),
          ),
        ],
      );
    }

    if (_loading) {
      return Column(
        children: [
          _tabs(),
          const Expanded(child: LoadingView()),
        ],
      );
    }

    if (_error != null && _data == null) {
      return Column(
        children: [
          _tabs(),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(Gaps.md),
              child: ErrorBanner(message: _error!, onRetry: _load),
            ),
          ),
        ],
      );
    }

    final entries = List<Map>.from(_data?['entries'] ?? []);
    final season = _data?['season'];
    final end =
        season?['ends_at'] == null ? null : DateTime.parse(season['ends_at']);
    final daysLeft = end == null
        ? ''
        : '${faNum(end.difference(DateTime.now()).inDays)} روز تا پایان این دوره لیگ';
    final top = entries.take(3).toList();
    final rest = entries.skip(3).toList();
    final brand = context.brand;
    final theme = Theme.of(context);

    return Column(
      children: [
        _tabs(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
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
                            height: 116, width: double.infinity, fit: BoxFit.cover,
                            cacheWidth: 820),
                      ),
                      Gaps.vMd,
                      const Text('لیگ قلقلی',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 22)),
                      Gaps.vXxs,
                      Text(
                        'برترین کاربران تا پایان زمان اعلام شده؛ جوایز پس از پایان لیگ پرداخت و لیگ بعدی آغاز می‌شود.',
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
                      final rank = i + 1;
                      return Expanded(
                        child: InkWell(
                          onTap: () => showPublicProfile(
                              context, widget.api, r['user_id']),
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            padding: EdgeInsets.symmetric(
                                vertical: isFirst ? Gaps.lg : Gaps.md,
                                horizontal: Gaps.xs),
                            decoration: BoxDecoration(
                              color: isFirst
                                  ? brand.gold
                                  : theme.colorScheme.surfaceContainerHigh,
                              borderRadius: Corners.rXl,
                              border: Border.all(
                                  color: isFirst
                                      ? brand.goldLight
                                      : theme.colorScheme.outlineVariant),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  rank == 1 ? '🥇' : (rank == 2 ? '🥈' : '🥉'),
                                  style: const TextStyle(fontSize: 22),
                                ),
                                const SizedBox(height: 4),
                                DisplayName(
                                  name: r['nickname'] ?? 'کاربر',
                                  cosmetics: r['cosmetics'] is Map
                                      ? Map<String, dynamic>.from(r['cosmetics'])
                                      : null,
                                  style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12.5,
                                      color: isFirst
                                          ? const Color(0xFF241900)
                                          : theme.colorScheme.onSurface),
                                ),
                                const SizedBox(height: 2),
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
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    padding: EdgeInsets.zero,
                    itemCount: rest.length,
                    itemBuilder: (context, i) => RankTile(
                      rank: i + 4,
                      row: rest[i],
                      onTap: () =>
                          showPublicProfile(context, widget.api, rest[i]['user_id']),
                    ),
                  ),
                if (entries.isEmpty)
                  const AppCard(
                      child: EmptyState(
                          icon: Icons.emoji_events_outlined,
                          title: 'هنوز امتیازی در لیگ ثبت نشده است')),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// نمایش برندگان دورهٔ قبلی لیگ (تا پایان لیگ بعدی در این تب نمایش داده می‌شوند).
class _PreviousWinnersView extends StatelessWidget {
  const _PreviousWinnersView({required this.data});
  final Map? data;

  @override
  Widget build(BuildContext context) {
    final prev = data?['previousSeason'];
    final List<Map> prevWinners = (prev is Map && prev['winners'] is List)
        ? List<Map>.from(prev['winners'])
        : (data?['previousWinners'] is List
            ? List<Map>.from(data!['previousWinners'])
            : (prev is List
                ? List<Map>.from(prev.whereType<Map>())
                : <Map>[]));
    final theme = Theme.of(context);

    if (prevWinners.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(Gaps.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: const LinearGradient(
                colors: [Color(0xFF3D2E00), Color(0xFF1A1400)],
              ),
            ),
            child: Column(
              children: [
                const Icon(Icons.emoji_events_rounded, size: 48, color: Color(0xFFFFD700)),
                const SizedBox(height: 8),
                Text(
                  'برندگان دوره قبل لیگ',
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: const Color(0xFFFFD700),
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'پس از پایان لیگ، برندگان تا شروع لیگ بعدی اینجا نمایش داده می‌شوند.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const AppCard(
            child: EmptyState(
              icon: Icons.military_tech_outlined,
              title: 'هنوز دوره قبلی بسته نشده است',
              message: 'به محض پایان این دوره لیگ و پرداخت جوایز، لیست برندگان در این قسمت ثبت خواهد شد.',
            ),
          ),
        ],
      );
    }

    final monthLabel = prev?['monthYear'] ?? prevWinners[0]['month_year'] ?? 'فصل گذشته';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              colors: [Color(0xFF3D2E00), Color(0xFF1A1400)],
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFFD700).withValues(alpha: 0.15),
                blurRadius: 20,
              ),
            ],
          ),
          child: Column(
            children: [
              const Icon(Icons.emoji_events_rounded, size: 48, color: Color(0xFFFFD700)),
              const SizedBox(height: 8),
              Text(
                'برندگان دوره قبل لیگ',
                style: theme.textTheme.titleLarge?.copyWith(
                  color: const Color(0xFFFFD700),
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'فصل $monthLabel — این برندگان تا پایان لیگ بعدی اینجا نمایش داده می‌شوند',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        for (final w in prevWinners)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: w['rank'] == 1
                          ? const Color(0xFFFFD700)
                          : (w['rank'] == 2
                              ? const Color(0xFFC0C0C0)
                              : (w['rank'] == 3
                                  ? const Color(0xFFCD7F32)
                                  : const Color(0xFF334155))),
                      child: Text(
                        '${w['rank']}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            w['nickname'] ?? w['first_name'] ?? 'کاربر',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          if (w['points'] != null)
                            Text(
                              '${faNum(w['points'])} امتیاز',
                              style: theme.textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                    if (w['prize_amount'] != null && NumberParser.toInt(w['prize_amount']) > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          color: const Color(0xFF22E7A6).withValues(alpha: 0.15),
                          border: Border.all(color: const Color(0xFF22E7A6).withValues(alpha: 0.4)),
                        ),
                        child: Text(
                          '${faNum(w['prize_amount'])} تومان',
                          style: const TextStyle(
                            color: Color(0xFF22E7A6),
                            fontWeight: FontWeight.w900,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
