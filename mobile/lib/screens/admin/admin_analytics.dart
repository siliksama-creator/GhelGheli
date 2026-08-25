import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';

class AdminAnalytics extends StatefulWidget {
  const AdminAnalytics({super.key, required this.api});
  final ApiClient api;
  @override
  State<AdminAnalytics> createState() => _AdminAnalyticsState();
}

class _AdminAnalyticsState extends State<AdminAnalytics> {
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _wheel;
  Map<String, dynamic>? _refs;
  Map<String, dynamic>? _duel;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result =
          await widget.api.get('/api/admin/analytics?days=30', fresh: true);
      Map<String, dynamic>? wheel;
      Map<String, dynamic>? refs;
      Map<String, dynamic>? duel;
      try {
        final w = await widget.api.get('/api/admin/wheel/stats', fresh: true);
        if (w is Map) wheel = Map<String, dynamic>.from(w);
      } catch (_) {}
      try {
        final r = await widget.api
            .get('/api/admin/referrals/purchase-commissions?limit=20', fresh: true);
        if (r is Map) refs = Map<String, dynamic>.from(r);
      } catch (_) {}
      try {
        final d = await widget.api.get('/api/admin/card-duel/balance', fresh: true);
        if (d is Map) duel = Map<String, dynamic>.from(d);
      } catch (_) {}
      if (mounted) {
        setState(() {
          _data = result is Map ? Map<String, dynamic>.from(result) : {};
          _wheel = wheel;
          _refs = refs;
          _duel = duel;
          _error = null;
          _loading = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = apiError(error);
          _loading = false;
        });
      }
    }
  }

  Future<void> _resolve(String hash, String platform) async {
    try {
      final r = await widget.api.patch('/api/admin/crashes/groups/$hash', {
        'status': 'resolved',
        'platform': platform,
      });
      if (!mounted) return;
      final n = r is Map ? r['updated'] : 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${faNum(n)} گزارش بسته شد')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return const LoadingView();
    if (_error != null && _data == null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }
    final funnel = _data?['funnel'] is Map ? _data!['funnel'] as Map : const {};
    final crashes = ((_data?['crashes'] as List?) ?? const []).whereType<Map>();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          const Text('تحلیل رشد و پایداری',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
          const Text(
              'رویدادها، صندوق خطا، گردونه و کمیسیون معرفی · ۳۰ روز اخیر',
              style: TextStyle(fontSize: 10, color: Colors.white54)),
          Gaps.vMd,
          GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.45,
              children: [
                _metric('شروع مسابقه', funnel['started'],
                    Icons.play_circle_rounded, const Color(0xFF38BDF8)),
                _metric('نرخ تکمیل', '${funnel['completionRate'] ?? 0}٪',
                    Icons.check_circle_rounded, const Color(0xFF34D399)),
                _metric('نرخ نبرد دوباره', '${funnel['rematchRate'] ?? 0}٪',
                    Icons.replay_rounded, const Color(0xFFFFD36B)),
                _metric('نرخ اشتراک', '${funnel['shareRate'] ?? 0}٪',
                    Icons.ios_share_rounded, const Color(0xFFA855F7)),
              ]),
          Gaps.vMd,
          AppCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(
                    'صندوق خطاهای باز · ${faNum(_data?['openCrashCount'] ?? 0)}',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                const Text(
                    'بستن گروه همهٔ رخدادهای همان hash را حل می‌کند',
                    style: TextStyle(fontSize: 9, color: Colors.white54)),
                Gaps.vXs,
                for (final crash in crashes)
                  Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(9),
                      decoration: BoxDecoration(
                          color: const Color(0xFFFF5070).withValues(alpha: .07),
                          borderRadius: Corners.rMd,
                          border: Border.all(
                              color: const Color(0xFFFF5070)
                                  .withValues(alpha: .2))),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                '${crash['platform']} · ${faNum(crash['occurrences'])} بار',
                                style: const TextStyle(
                                    color: Color(0xFFFF5070),
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900)),
                            Text('${crash['message']}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 10.5)),
                            Align(
                              alignment: AlignmentDirectional.centerEnd,
                              child: TextButton(
                                onPressed: () => _resolve(
                                    '${crash['error_hash']}',
                                    '${crash['platform']}'),
                                child: const Text('حل شد'),
                              ),
                            ),
                          ]),
                    ),
                  ),
                if (crashes.isEmpty)
                  const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('در ۳۰ روز اخیر خطای بازی ثبت نشده است.',
                          style: TextStyle(fontSize: 10, color: Colors.white54))),
              ])),
          if (_wheel != null) ...[
            Gaps.vMd,
            AppCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  const Text('آمار واقعی گردونه',
                      style: TextStyle(fontWeight: FontWeight.w900)),
                  Text(
                      '${faNum(_wheel!['spins'])} چرخش · ${faNum(_wheel!['cashPaid'])} تومان پرداخت‌شده',
                      style: const TextStyle(fontSize: 11, color: Colors.white70)),
                  for (final p
                      in ((_wheel!['byPrize'] as List?) ?? const []).take(8))
                    if (p is Map)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          '${p['label']} · ${faNum(p['hits'])} بار',
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                ])),
          ],
          if (_refs != null) ...[
            Gaps.vMd,
            AppCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(
                      'کمیسیون معرفی · ${faNum(_refs!['totalCommission'])} تومان',
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                  for (final row
                      in ((_refs!['rows'] as List?) ?? const []).take(12))
                    if (row is Map)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          '${row['referrer_nickname'] ?? row['referrer_mobile']} ← ${faNum(row['commission_amount'])} تومان',
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                ])),
          ],
          if (_duel != null) ...[
            Gaps.vMd,
            AppCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(
                      'تعادل دوئل · ${faNum(_duel!['sampledBattles'])} نبرد',
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                  Text(
                      'راند نمونه‌گیری‌شده: ${faNum(_duel!['sampledRounds'])}',
                      style: const TextStyle(fontSize: 11, color: Colors.white70)),
                ])),
          ],
        ],
      ),
    );
  }

  Widget _metric(String title, Object? value, IconData icon, Color color) =>
      AppCard(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, color: color),
        const SizedBox(height: 5),
        Text(faNum(value ?? 0),
            style: TextStyle(
                color: color, fontSize: 22, fontWeight: FontWeight.w900)),
        Text(title,
            style: const TextStyle(fontSize: 9.5, color: Colors.white60))
      ]));
}
