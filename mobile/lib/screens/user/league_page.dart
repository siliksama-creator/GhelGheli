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
/// every 12s exactly as in the legacy `LeaguePage`.
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
    // Paused automatically while the app is backgrounded.
    startPolling(const Duration(seconds: 12), _load);
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  Future<void> _load() async {
    // try/catch لازم است، نه یک احتیاط اضافه.
    //
    // بدون آن، هر شکستی — توکن منقضی، شبکهٔ لرزان، یک ۵۰۰ گذرا — استثنا
    // پرتاب می‌کرد و خط `_loading = false` هرگز اجرا نمی‌شد. صفحه تا ابد
    // روی چرخنده می‌ماند بدون هیچ پیام یا راه خروجی. این دقیقاً همان
    // «صفحات لود نمیشن» بود که کاربر گزارش داد.
    try {
      final url = _selectedLeagueId != null ? '/api/league/current?seasonId=$_selectedLeagueId' : '/api/league/current';
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
        // دادهٔ قبلی نگه داشته می‌شود: بهتر از پاک کردن جدولی که کاربر
        // داشت می‌خواند، فقط چون یک رفرش پس‌زمینه شکست خورد.
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  /// The two-way switch above both views. Kept as one widget so the tabs sit
  /// in exactly the same place whichever is showing — moving them would read
  /// as the page jumping.
  Widget _tabs() => Padding(
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, 0),
        child: SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('جدول لیگ')),
            ButtonSegment(value: 1, label: Text('باشگاه‌ها')),
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
            child: _data?['previousSeason'] != null
                ? _PreviousWinnersView(data: _data)
                : const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: Text('هنوز دوره قبلی برگزار نشده است')),
                  ),
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

    // خطا و هیچ دادهٔ قبلی‌ای: راه خروج بده، نه صفحهٔ خالی.
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
                  // cacheWidth, not cacheHeight: BoxFit.cover in a box wider
                  // than the source scales by WIDTH, so a height hint
                  // constrains the axis that does not bind. The asset is
                  // pre-cropped to the displayed aspect, so its native 820
                  // width is both cheaper and sharper than the old hint.
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
                  'برترین کاربران تا پایان زمان اعلام شده؛ جوایز پس از پایان لیگ پرداخت و لیگ بعدی توسط ادمین آغاز می‌شود.',
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
                          // مدالِ تصویری به‌جای ایموجی — بستهٔ ۲۰۲۶.
                          Image.asset(
                            medalAsset(i + 1),
                            width: 34,
                            height: 34,
                            fit: BoxFit.contain,
                            cacheWidth: 68,
                            errorBuilder: (_, __, ___) => const Icon(Icons.military_tech_rounded, size: 30),
                          ),
                          const SizedBox(height: 4),
                          DisplayName(
                            name: r['nickname'] ?? r['first_name'] ?? 'کاربر',
                            cosmetics: r['cosmetics'] as Map?,
                            level: (r['level'] as num?)?.toInt(),
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
            // sliver-less lazy list inside the existing ListView.
            //
            // This spread built all 97 remaining rank tiles — each with an
            // avatar — on every build, and this screen re-polls every 12
            // seconds. ListView.builder with shrinkWrap keeps the single
            // outer scroll while constructing only the visible rows.
            //
            // `physics: NeverScrollable` is required so the inner list does
            // not fight the outer one for drag gestures.
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


/// نمایش برندگان دورهٔ قبلی لیگ.
class _PreviousWinnersView extends StatelessWidget {
  const _PreviousWinnersView({required this.data});
  final Map? data;

  @override
  Widget build(BuildContext context) {
    final prev = data?['previousSeason'];
    if (prev == null) {
      return const Center(child: Text('اطلاعات در دسترس نیست'));
    }
    final winners = List<Map>.from(prev['winners'] ?? []);
    final theme = Theme.of(context);
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
          ),
          child: Column(children: [
            const Icon(Icons.emoji_events_rounded, size: 48, color: Color(0xFFFFD700)),
            const SizedBox(height: 8),
            Text('برندگان لیگ قبلی', style: theme.textTheme.titleLarge?.copyWith(color: const Color(0xFFFFD700), fontWeight: FontWeight.w900)),
            Text(prev['monthYear'] ?? '', style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70)),
          ]),
        ),
        const SizedBox(height: 16),
        for (final w in winners)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: w['rank'] == 1 ? const Color(0xFFFFD700) : w['rank'] == 2 ? const Color(0xFFC0C0C0) : const Color(0xFFCD7F32),
                    child: Text('${w['rank']}', style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.white)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(w['nickname'] ?? 'کاربر', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    Text('${w['points']} امتیاز', style: theme.textTheme.bodySmall),
                  ])),
                  if (w['prizeAmount'] != null && w['prizeAmount'] > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        color: const Color(0xFF22E7A6).withValues(alpha: 0.15),
                        border: Border.all(color: const Color(0xFF22E7A6).withValues(alpha: 0.4)),
                      ),
                      child: Text('${w['prizeAmount']} تومان', style: const TextStyle(color: Color(0xFF22E7A6), fontWeight: FontWeight.w900, fontSize: 12)),
                    ),
                ]),
              ),
            ),
          ),
      ],
    );
  }
}
