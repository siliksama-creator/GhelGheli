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
import '../../widgets/coin_chip.dart';
import '../../widgets/coin_guide.dart';
import 'clubs_page.dart';
import '../../widgets/ui_icon.dart';

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

  /// اقتصادِ بازی‌ها (درصدِ انتقالِ سکه و…) — از /api/config؛ وقتی ادمین
  /// عوض کند، این صفحه هم بدونِ آپدیتِ اپ متنِ جدید را نشان می‌دهد.
  Map<String, dynamic>? _economy;

  Future<void> _load() async {
    try {
      final cfg = await widget.api.get('/api/config');
      if (mounted && cfg is Map) {
        final m = Map<String, dynamic>.from(cfg);
        if (m['economy'] is Map) {
          setState(() => _economy = Map<String, dynamic>.from(m['economy']));
        }
      }
    } catch (_) {}

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
                // ── ترتیبِ عمدی: راهنمای سکه پیش از هر چیزِ دیگر ──
                // خواستهٔ مالک این بود که «سکه چطور به دست می‌آید» بدونِ
                // اسکرول دیده شود. بنرِ قبلی ۱۱۶px عکس + تیتر + پاراگراف +
                // چیپِ شمارش‌معکوس بود و به‌تنهایی کلِ نیمهٔ بالای صفحه را
                // می‌گرفت؛ راهنما زیرِ خطِ تا می‌افتاد.
                //
                // بنر حذف نشد، فشرده شد: عکس به پس‌زمینهٔ کم‌رنگِ همان نوار
                // تبدیل شد (`Stack` + `opacity: .22`) و تیتر و شمارش‌معکوس
                // در یک ردیف نشستند. پاراگرافِ توضیحیِ لیگ به پایینِ لیست
                // منتقل شد. آینهٔ `userweb/src/screens/League.jsx`.
                ClipRRect(
                  borderRadius: Corners.rXxl,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                          colors: brand.leagueGradient,
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: 0.25),
                            blurRadius: 26)
                      ],
                    ),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: Opacity(
                            opacity: 0.22,
                            child: Image.asset(
                                'assets/brand/league_banner.webp',
                                fit: BoxFit.cover,
                                cacheWidth: 820,
                                errorBuilder: (_, __, ___) =>
                                    const SizedBox.shrink()),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: Gaps.md, vertical: 12),
                          child: Row(
                            children: [
                              const Expanded(
                                child: Text('لیگ قلقلی',
                                    style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 20)),
                              ),
                              const SizedBox(width: 10),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: Gaps.sm, vertical: 6),
                                decoration: BoxDecoration(
                                    color:
                                        Colors.white.withValues(alpha: 0.16),
                                    borderRadius: Corners.rPill),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.timer_outlined,
                                        size: 15, color: Colors.white),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: Text(
                                          daysLeft.isEmpty
                                              ? 'در حال محاسبه'
                                              : daysLeft,
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w800,
                                              fontSize: 12.5)),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Gaps.vSm,
                CoinGuide(economy: _economy),
                // سکوی سه‌نفره فقط وقتی معنا دارد که سه نفر باشند. با یک یا
                // دو نفر، Expanded کارت را تمامِ‌عرض می‌کند و چون محتوایش
                // عمودی است (مدال/نام/سکه) یک ستونِ بلندِ سه‌طبقه می‌شود که
                // با ردیفِ تک‌سطریِ «جایگاه شما» درست زیرش ناهماهنگ است.
                // آینهٔ PodiumRow در League.jsx.
                if (top.isNotEmpty && top.length < 3)
                  ...top.asMap().entries.map((e) {
                    final i = e.key;
                    final r = e.value;
                    final rank = i + 1;
                    final accent = rank == 1
                        ? const Color(0xFFFFD700)
                        : rank == 2
                            ? const Color(0xFFCBD5E1)
                            : const Color(0xFFCD7F32);
                    return InkWell(
                      onTap: () => showPublicProfile(context, widget.api, r['user_id']),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: accent, width: 1.4),
                          boxShadow: [
                            BoxShadow(color: accent.withValues(alpha: 0.13), blurRadius: 12, offset: const Offset(0, 4)),
                          ],
                        ),
                        child: Row(
                          children: [
                            UiIcon(
                              rank == 1 ? 'medal1' : (rank == 2 ? 'medal2' : 'medal3'),
                              size: 19,
                              color: rank == 1
                                  ? const Color(0xFFFFD166)
                                  : rank == 2
                                      ? const Color(0xFFCBD5E1)
                                      : const Color(0xFFD08B5B),
                            ),
                            const SizedBox(width: 9),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(999),
                                color: accent,
                              ),
                              child: Text(
                                faNum(rank),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  color: rank == 1
                                      ? const Color(0xFF241900)
                                      : rank == 2
                                          ? const Color(0xFF1E293B)
                                          : Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: DisplayName(
                                name: r['nickname'] ?? 'کاربر',
                                cosmetics: r['cosmetics'] is Map
                                    ? Map<String, dynamic>.from(r['cosmetics'])
                                    : null,
                                style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: theme.colorScheme.onSurface),
                              ),
                            ),
                            CoinChip(value: r['coins'], size: 22),
                            const SizedBox(width: 7),
                            Text(
                              faNum(r['points']),
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                if (top.length >= 3)
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
                                vertical: isFirst ? 11 : 9,
                                horizontal: 5),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerHigh,
                              borderRadius: Corners.rXl,
                              border: Border.all(
                                  color: isFirst
                                      ? const Color(0xFFFFD700)
                                      : rank == 2
                                          ? const Color(0xFFCBD5E1)
                                          : const Color(0xFFCD7F32),
                                  width: isFirst ? 1.8 : 1.4),
                              boxShadow: isFirst
                                  ? [BoxShadow(color: const Color(0xFFFFD700).withValues(alpha: 0.28), blurRadius: 14, offset: const Offset(0, 4))]
                                  : rank == 2
                                      ? [BoxShadow(color: const Color(0xFFCBD5E1).withValues(alpha: 0.18), blurRadius: 10)]
                                      : [BoxShadow(color: const Color(0xFFCD7F32).withValues(alpha: 0.16), blurRadius: 10)],
                            ),
                            // مدال و شمارهٔ رتبه در یک خط، سکه و امتیاز هم
                            // در یک خط: قبلاً پنج سطرِ جدا بودند و کارت
                            // ۱۸۷px ارتفاع می‌گرفت. مدال خودش رتبه را
                            // می‌گوید، پس چیپِ «رتبه ۱» تکرار بود.
                            // آینهٔ PodiumCard در League.jsx.
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    UiIcon(
                                      rank == 1
                                          ? 'medal1'
                                          : (rank == 2 ? 'medal2' : 'medal3'),
                                      size: 19,
                                      color: rank == 1
                                          ? const Color(0xFFFFD166)
                                          : rank == 2
                                              ? const Color(0xFFCBD5E1)
                                              : const Color(0xFFD08B5B),
                                    ),
                                    const SizedBox(width: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(999),
                                        color: isFirst
                                            ? const Color(0xFFFFD700)
                                            : rank == 2
                                                ? const Color(0xFFCBD5E1)
                                                : const Color(0xFFCD7F32),
                                      ),
                                      child: Text(
                                        faNum(rank),
                                        style: TextStyle(
                                          fontSize: 9.5,
                                          fontWeight: FontWeight.w900,
                                          color: isFirst ? const Color(0xFF241900) : rank == 2 ? const Color(0xFF1E293B) : Colors.white,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 5),
                                DisplayName(
                                  name: r['nickname'] ?? 'کاربر',
                                  cosmetics: r['cosmetics'] is Map
                                      ? Map<String, dynamic>.from(r['cosmetics'])
                                      : null,
                                  style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface),
                                ),
                                const SizedBox(height: 4),
                                Wrap(
                                  alignment: WrapAlignment.center,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  spacing: 6,
                                  children: [
                                    CoinChip(
                                        value: r['coins'], size: isFirst ? 26 : 22),
                                    Text(
                                      faNum(r['points']),
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: theme.colorScheme.onSurfaceVariant),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                Gaps.vSm,
                // کارت جایگاه کاربر در جدول لیگ
                if (_data?['myEntry'] != null || entries.isNotEmpty)
                  Builder(builder: (ctx) {
                    final myEntry = _data?['myEntry'] as Map?;
                    final rankNum = myEntry?['rank'] ?? 1;
                    final pts = myEntry?['points'] ?? (_data?['season']?['current_points'] ?? 0);
                    final myCoins = myEntry?['coins'] ?? 0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                        ),
                        border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.4)),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                            blurRadius: 10,
                          ),
                        ],
                      ),
                      // تک‌سطری: عنوانِ بلندِ «جایگاه شما در این دوره لیگ»
                      // روی سطرِ جدا، کارت را دوبرابر می‌کرد بی‌آنکه چیزی
                      // اضافه بگوید. آینهٔ League.jsx.
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: const Color(0xFF38BDF8).withValues(alpha: 0.15),
                            ),
                            child: const Icon(Icons.person_pin_rounded, color: Color(0xFF38BDF8), size: 16),
                          ),
                          const SizedBox(width: 9),
                          const Text(
                            'جایگاه شما',
                            style: TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8), fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(width: 9),
                          Text(
                            faNum(rankNum),
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white),
                          ),
                          const Spacer(),
                          CoinChip(value: myCoins, size: 21),
                          const SizedBox(width: 7),
                          Text(
                            faNum(pts),
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8)),
                          ),
                        ],
                      ),
                    );
                  }),
                Gaps.vSm,
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
                          title: 'هنوز کسی در این لیگ سکه‌ای نبرده است')),
                // پاراگرافِ توضیحیِ لیگ، منتقل‌شده از بنرِ بالا: اطلاعاتِ
                // لازم است ولی کسی برای خواندنش وارد صفحهٔ لیگ نمی‌شود،
                // پس جای بالای صفحه را نمی‌گیرد. آینهٔ League.jsx.
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 14, 2, 0),
                  child: Text(
                    () {
                      final pct = num.tryParse(
                              '${_economy?['coinCarryoverPercent'] ?? ''}')
                              ?.toInt() ??
                          10;
                      final pctText = pct == 0
                          ? 'انتقالِ سکه به لیگِ بعدی صفر است'
                          : '${faNum(pct)}٪ از سکه به لیگِ بعدی منتقل می‌شود';
                      return 'مبنای دریافتِ جایزهٔ لیگ، رتبه بر اساسِ سکه است و با سکه‌ها در استخرِ جایزه شرکت می‌کنی. '
                          'برترین کاربران تا پایان زمانِ اعلام‌شده؛ جوایز پس از پایانِ لیگ پرداخت و لیگِ بعدی آغاز می‌شود. '
                          'سکه‌ها بعد از پایانِ لیگ صفر می‌شوند و $pctText.';
                    }(),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.62),
                        fontSize: 12.5,
                        height: 1.65),
                  ),
                ),
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
