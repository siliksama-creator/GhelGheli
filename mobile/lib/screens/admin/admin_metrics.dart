import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api_client.dart';
import '../../core/money.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

/// مانیتورینگ زنده سرور — تعداد سوکت‌ها، اتاق‌های بازی فعال، حافظه ردیس، اتصالات پستگرس و لاگ‌های خطا.
/// آیینهٔ کاملِ مانیتورینگ وب.
class AdminMetrics extends StatefulWidget {
  final ApiClient api;
  const AdminMetrics({super.key, required this.api});

  @override
  State<AdminMetrics> createState() => _AdminMetricsState();
}

class _AdminMetricsState extends State<AdminMetrics> {
  Map? _data;
  bool _loading = true;
  String? _loadError;
  bool _autoRefresh = true;
  Timer? _timer;
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _load();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 4), (t) {
      if (_autoRefresh && mounted && !_loading) {
        _load(silent: true);
      }
    });
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() => _loading = true);
    }
    try {
      final d = await widget.api.get('/api/admin/metrics');
      if (mounted) {
        setState(() {
          _data = d;
          _loadError = null;
          _loading = false;
        });
        if (!silent) {
          WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loading = false;
      });
    }
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  void _copyLogs() {
    final logs = _data?['pm2Logs'];
    if (logs == null || logs.isEmpty) return;
    Clipboard.setData(ClipboardData(text: logs));
    _snack('لاگ‌ها با موفقیت کپی شدند');
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return const LoadingView();
    if (_loadError != null && _data == null) {
      return RefreshIndicator(
        onRefresh: () => _load(),
        child: ListView(padding: const EdgeInsets.all(20), children: [
          const SizedBox(height: 40),
          ErrorBanner(message: _loadError!, onRetry: _load),
        ]),
      );
    }

    final d = _data ?? {};
    final theme = Theme.of(context);

    final socketCount = d['socketCount'] ?? 0;
    final activeRooms = d['activeRooms'] ?? 0;
    final redisMemory = d['redisMemory'] ?? '—';
    final pg = d['postgresConnections'] ?? {'total': 0, 'idle': 0, 'waiting': 0};
    final logs = d['pm2Logs'] ?? 'در حال بارگذاری لاگ‌ها...';

    return RefreshIndicator(
      onRefresh: () => _load(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          // ── کنترل زنده ──
          Row(
            children: [
              Expanded(
                child: CheckboxListTile(
                  title: const Text('بروزرسانی خودکار زنده (۴ ثانیه)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  value: _autoRefresh,
                  onChanged: (v) {
                    if (v != null) {
                      setState(() {
                        _autoRefresh = v;
                        _startTimer();
                      });
                    }
                  },
                ),
              ),
              if (_autoRefresh)
                const StatusBadge(
                  status: 'live',
                  labels: {'live': '● لایو'},
                ),
            ],
          ),
          Gaps.vMd,

          // ── کارت‌های سنجه‌های زنده سرور ──
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.25,
            children: [
              _metricTile(
                'سوکت‌های فعال',
                faNum(socketCount),
                'اتصال Socket.io',
                Icons.network_ping_rounded,
                Colors.green,
              ),
              _metricTile(
                'بازی‌های آنلاین زنده',
                faNum(activeRooms),
                'اتاق بازی فعال',
                Icons.sports_esports_rounded,
                Colors.blue,
              ),
              _metricTile(
                'حافظه ردیس',
                redisMemory,
                'used_memory_human',
                Icons.memory_rounded,
                Colors.amber,
              ),
              _pgMetricTile(pg),
            ],
          ),
          Gaps.vMd,

          // ── ترمینال لاگ‌های PM2 ──
          AppCard(
            title: 'لاگ خطاهای سرور (PM2 Error Logs)',
            subtitle: 'استریم آنلاین لاگ‌های فرآیند ghelgheli-api',
            action: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'کپی لاگ‌ها',
                  icon: const Icon(Icons.copy_all_rounded),
                  onPressed: _copyLogs,
                ),
                IconButton(
                  tooltip: 'انتهای لاگ‌ها',
                  icon: const Icon(Icons.arrow_downward_rounded),
                  onPressed: _scrollToBottom,
                ),
              ],
            ),
            child: Container(
              height: 380,
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                color: const Color(0xFF040B15),
                borderRadius: BorderRadius.circular(Corners.rMd),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
              ),
              child: Scrollbar(
                controller: _scrollController,
                child: SingleChildScrollView(
                  controller: _scrollController,
                  scrollDirection: Axis.vertical,
                  child: Text(
                    logs.trim(),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: Color(0xFF38BDF8),
                      height: 1.5,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _metricTile(String title, String value, String subtitle, IconData icon, Color color) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(Gaps.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              Gaps.hXs,
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: color,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: theme.textTheme.labelSmall?.copyWith(color: Colors.grey),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _pgMetricTile(Map pg) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(Gaps.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Row(
            children: [
              Icon(Icons.database_rounded, size: 18, color: Colors.cyan),
              Gaps.hXs,
              Text('اتصال PostgreSQL', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 4),
          _pgRow('کل اتصالات:', faNum(pg['total'] ?? 0)),
          _pgRow('اتصال Idle:', faNum(pg['idle'] ?? 0)),
          _pgRow('در صف انتظار:', faNum(pg['waiting'] ?? 0), isWarning: (pg['waiting'] ?? 0) > 0),
        ],
      ),
    );
  }

  Widget _pgRow(String label, String val, {bool isWarning = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1.5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 10.5, color: Colors.grey)),
          Text(
            val,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.bold,
              color: isWarning ? Colors.red : Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
