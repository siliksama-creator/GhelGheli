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
  String? _error;
  bool _loading = true;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final result = await widget.api.get('/api/admin/analytics?days=30', fresh: true);
      if (mounted) setState(() { _data = result is Map ? Map<String,dynamic>.from(result) : {}; _error = null; _loading = false; });
    } catch (error) { if (mounted) setState(() { _error = apiError(error); _loading = false; }); }
  }
  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return const LoadingView();
    if (_error != null && _data == null) return ErrorBanner(message: _error!, onRetry: _load);
    final funnel = _data?['funnel'] is Map ? _data!['funnel'] as Map : const {};
    final crashes = ((_data?['crashes'] as List?) ?? const []).whereType<Map>();
    return RefreshIndicator(onRefresh: _load, child: ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        const Text('تحلیل رشد و پایداری', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        const Text('رویدادهای دست‌اول و خطاهای پاک‌سازی‌شده · ۳۰ روز اخیر', style: TextStyle(fontSize: 10, color: Colors.white54)),
        Gaps.vMd,
        GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2,
          crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.45,
          children: [
            _metric('شروع مسابقه', funnel['started'], Icons.play_circle_rounded, const Color(0xFF38BDF8)),
            _metric('نرخ تکمیل', '${funnel['completionRate'] ?? 0}٪', Icons.check_circle_rounded, const Color(0xFF34D399)),
            _metric('نرخ نبرد دوباره', '${funnel['rematchRate'] ?? 0}٪', Icons.replay_rounded, const Color(0xFFFFD36B)),
            _metric('نرخ اشتراک', '${funnel['shareRate'] ?? 0}٪', Icons.ios_share_rounded, const Color(0xFFA855F7)),
          ]),
        Gaps.vMd,
        AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('صندوق خطاهای باز · ${faNum(_data?['openCrashCount'] ?? 0)}', style: const TextStyle(fontWeight: FontWeight.w900)),
          const Text('Web، Android و Backend؛ گروه‌بندی‌شده بدون توکن یا اطلاعات حساس', style: TextStyle(fontSize: 9, color: Colors.white54)),
          Gaps.vXs,
          for (final crash in crashes) Padding(padding: const EdgeInsets.only(top: 7), child: Container(
            width: double.infinity, padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(color: const Color(0xFFFF5070).withValues(alpha: .07), borderRadius: Corners.rMd,
              border: Border.all(color: const Color(0xFFFF5070).withValues(alpha: .2))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${crash['platform']} · ${faNum(crash['occurrences'])} بار', style: const TextStyle(color: Color(0xFFFF5070), fontSize: 9, fontWeight: FontWeight.w900)),
              Text('${crash['message']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5)),
            ]),
          )),
          if (crashes.isEmpty) const Padding(padding: EdgeInsets.only(top: 8), child: Text('در ۳۰ روز اخیر خطای بازی ثبت نشده است.', style: TextStyle(fontSize: 10, color: Colors.white54))),
        ])),
      ],
    ));
  }
  Widget _metric(String title, Object? value, IconData icon, Color color) => AppCard(child: Column(
    mainAxisAlignment: MainAxisAlignment.center, children: [Icon(icon, color: color), const SizedBox(height: 5),
      Text(faNum(value ?? 0), style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900)),
      Text(title, style: const TextStyle(fontSize: 9.5, color: Colors.white60))]));
}
