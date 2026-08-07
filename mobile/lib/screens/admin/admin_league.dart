import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/money.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';
import '../shared/rank_tile.dart';
import 'widgets/form_section.dart';

/// League prize-table editor, dynamic winner count, start/end dates selection,
/// pending payouts approval panel, and live leaderboard.
/// Same contract and features as league.jsx in React.
class AdminLeague extends StatefulWidget {
  final ApiClient api;
  const AdminLeague({super.key, required this.api});

  @override
  State<AdminLeague> createState() => _AdminLeagueState();
}

class _AdminLeagueState extends State<AdminLeague> {
  Map? _data;
  List<Map> _prizes = List.generate(10, (i) => {'rank': i + 1, 'amount': 0});
  List<Map> _payouts = [];
  bool _loading = true;
  String? _loadError;
  bool _saving = false;

  // ── تاریخ شروع و پایان فصلی ──
  DateTime? _startsAt;
  DateTime? _endsAt;
  bool _savingDates = false;

  // ── مدیریت تأیید جوایز ──
  String? _approvingId;
  final _winnerCountController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _winnerCountController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/league');
      final p = await widget.api.get('/api/admin/league/payouts');
      if (mounted) {
        setState(() {
          _data = d;
          _prizes = List<Map>.from(d?['season']?['prize_table'] ?? _prizes);
          _payouts = List<Map>.from(p ?? []);
          _winnerCountController.text = '${d?['winnerCount'] ?? _prizes.length}';

          final sStart = d?['season']?['starts_at'];
          final sEnd = d?['season']?['ends_at'];
          _startsAt = sStart != null ? DateTime.tryParse(sStart) : null;
          _endsAt = sEnd != null ? DateTime.tryParse(sEnd) : null;

          _loading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loading = false;
      });
    }
  }

  void _changeWinnerCount(int n) {
    if (n < 1 || n > 100) return;
    setState(() {
      _prizes = List<Map>.generate(n, (i) {
        if (i < _prizes.length) return _prizes[i];
        return {'rank': i + 1, 'amount': 0};
      });
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final n = int.tryParse(_winnerCountController.text) ?? _prizes.length;
      await widget.api.patch('/api/admin/league/current/prizes', {
        'prizeTable': _prizes,
        'winnerCount': n,
      });
      _snack('جدول جوایز لیگ ذخیره شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<DateTime?> _pickDateTime(DateTime? initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (date == null) return null;
    if (!mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial ?? DateTime.now()),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _saveDates() async {
    if (_startsAt == null || _endsAt == null) {
      _snack('لطفا هر دو تاریخ شروع و پایان را انتخاب کنید');
      return;
    }
    if (_endsAt!.isBefore(_startsAt!) || _endsAt!.isAtSameMomentAs(_startsAt!)) {
      _snack('تاریخ پایان باید بعد از تاریخ شروع باشد');
      return;
    }
    setState(() => _savingDates = true);
    try {
      await widget.api.patch('/api/admin/league/current/dates', {
        'startsAt': _startsAt!.toUtc().toIso8601String(),
        'endsAt': _endsAt!.toUtc().toIso8601String(),
      });
      _snack('تاریخ لیگ به‌روز شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _savingDates = false);
    }
  }

  Future<void> _approvePayout(String id) async {
    final one = _payouts.firstWhere((p) => p['id'] == id);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تأیید واریز جایزه'),
        content: Text(
            'آیا از واریز ${Money.format(one['amount'])} تومان به «${one['nickname'] ?? one['mobile']}» مطمئن هستید؟\n\nاین کار برگشت‌ناپذیر است.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('لغو')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('تأیید')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _approvingId = id);
    try {
      final r = await widget.api.post('/api/admin/league/payouts/$id/approve', {});
      _snack(r is Map ? '${r['message'] ?? 'واریز شد'}' : 'واریز شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _approvingId = null);
    }
  }

  Future<void> _approveAllPayouts() async {
    final pending = _payouts.where((p) => p['paid_at'] == null && NumberParser.toInt(p['amount']) > 0).toList();
    if (pending.isEmpty) return;
    final totalSum = pending.fold<int>(0, (sum, p) => sum + NumberParser.toInt(p['amount']));
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تأیید واریز همه جوایز'),
        content: Text(
            'آیا از تأیید و واریز تعداد ${faNum(pending.length)} جایزه به مجموع مبلغ ${Money.format(totalSum)} تومان مطمئن هستید؟\n\nاین کار برگشت‌ناپذیر است.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('لغو')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('تأیید همه')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _approvingId = 'all');
    try {
      final r = await widget.api.post('/api/admin/league/payouts/approve-all', {});
      _snack(r is Map ? '${r['message'] ?? 'واریز شد'}' : 'واریز شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _approvingId = null);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  String _fmtDate(DateTime? d) {
    if (d == null) return 'انتخاب نشده';
    return '${faNum(d.year)}/${faNum(d.month.toString().padLeft(2, '0'))}/${faNum(d.day.toString().padLeft(2, '0'))} '
        '${faNum(d.hour.toString().padLeft(2, '0'))}:${faNum(d.minute.toString().padLeft(2, '0'))}';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_loadError != null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          const SizedBox(height: 40),
          ErrorBanner(message: _loadError!, onRetry: _load),
        ]),
      );
    }

    final theme = Theme.of(context);
    final pendingPayouts = _payouts.where((p) => p['paid_at'] == null && NumberParser.toInt(p['amount']) > 0).toList();
    final pendingSum = pendingPayouts.fold<int>(0, (sum, p) => sum + NumberParser.toInt(p['amount']));

    final season = _data?['season'] ?? {};
    final isManual = season['manual_dates'] == true;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        // ── جوایز در انتظار تأیید ──
        if (pendingPayouts.isNotEmpty) ...[
          AppCard(
            title: '${faNum(pendingPayouts.length)} جایزه منتظر تأیید شماست',
            subtitle: 'مجموع ${Money.withUnit(pendingSum)} — تا تأیید نکنید به کیف پول واریز نمی‌شود',
            action: FilledButton.icon(
              onPressed: _approvingId == 'all' ? null : _approveAllPayouts,
              icon: _approvingId == 'all'
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check_circle_outline_rounded, size: 16),
              label: const Text('واریز همه', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            child: Column(
              children: [
                for (final p in pendingPayouts) ...[
                  const Divider(height: 1),
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(p['nickname'] ?? p['mobile'] ?? 'بی‌نام'),
                    subtitle: Text('رتبه ${faNum(p['rank'])} · لیگ ${p['month_year'] ?? '—'}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(Money.withUnit(p['amount']), style: const TextStyle(fontWeight: FontWeight.bold)),
                        Gaps.hSm,
                        FilledButton.icon(
                          onPressed: _approvingId != null ? null : () => _approvePayout(p['id']),
                          icon: _approvingId == p['id']
                              ? const SizedBox(
                                  width: 12,
                                  height: 12,
                                  child: CircularProgressIndicator(strokeWidth: 1.8, color: Colors.white),
                                )
                              : const Icon(Icons.wallet_rounded, size: 14),
                          label: const Text('واریز', style: TextStyle(fontSize: 11.5)),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          Gaps.vMd,
        ],

        // ── تنظیم تاریخ شروع و پایان فصلی ──
        FormSection(
          title: 'تاریخ شروع و پایان لیگ',
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    isManual ? 'تاریخ‌ها دستی تنظیم شده‌اند' : 'تاریخ‌ها خودکار از تقویم شمسی محاسبه می‌شوند',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isManual ? Colors.green : Colors.grey,
                    ),
                  ),
                ),
                StatusBadge(
                  status: isManual ? 'manual' : 'auto',
                  labels: const {'manual': 'دستی', 'auto': 'خودکار'},
                ),
              ],
            ),
            Gaps.vSm,
            ListTile(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(Corners.rMd),
                side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
              ),
              leading: const Icon(Icons.calendar_month_rounded),
              title: const Text('شروع فصل', style: TextStyle(fontSize: 12, color: Colors.grey)),
              subtitle: Text(_fmtDate(_startsAt), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              onTap: () async {
                final d = await _pickDateTime(_startsAt);
                if (d != null) setState(() => _startsAt = d);
              },
            ),
            Gaps.vXs,
            ListTile(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(Corners.rMd),
                side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
              ),
              leading: const Icon(Icons.event_busy_rounded),
              title: const Text('پایان فصل', style: TextStyle(fontSize: 12, color: Colors.grey)),
              subtitle: Text(_fmtDate(_endsAt), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              onTap: () async {
                final d = await _pickDateTime(_endsAt);
                if (d != null) setState(() => _endsAt = d);
              },
            ),
            Gaps.vSm,
            FilledButton.icon(
              onPressed: _savingDates ? null : _saveDates,
              icon: _savingDates
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                    )
                  : const Icon(Icons.calendar_clock_rounded),
              label: const Text('ذخیره تاریخ‌های لیگ'),
            ),
          ],
        ),
        Gaps.vMd,

        // ── جدول جوایز و تعداد برندگان ──
        FormSection(
          title: 'جدول جوایز و تعداد برندگان',
          children: [
            TextFormField(
              controller: _winnerCountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'تعداد برندگان (حداکثر ۱۰۰)',
                prefixIcon: Icon(Icons.people_outline_rounded),
              ),
              onChanged: (v) {
                final val = int.tryParse(v) ?? 0;
                _changeWinnerCount(val);
              },
            ),
            Gaps.vSm,
            ...List.generate(
              _prizes.length,
              (i) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: TextFormField(
                  key: ValueKey('prize_$i'),
                  initialValue: '${_prizes[i]['amount']}',
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'جایزه رتبه ${faNum(_prizes[i]['rank'])} (تومان)',
                    prefixIcon: const Icon(Icons.paid_outlined),
                  ),
                  onChanged: (v) => _prizes[i]['amount'] = int.tryParse(v) ?? 0,
                ),
              ),
            ),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                    )
                  : const Icon(Icons.save_rounded),
              label: const Text('ذخیره جدول جوایز لیگ'),
            ),
          ],
        ),
        Gaps.vMd,

        // ── لیدربرد ──
        FormSection(
          title: 'لیدربرد زنده لیگ ماه جاری',
          children: [
            for (final r in List<Map>.from(_data?['entries'] ?? []))
              RankTile(rank: int.tryParse('${r['rank']}') ?? 0, row: r),
            if ((_data?['entries'] as List? ?? []).isEmpty)
              const EmptyState(
                icon: Icons.emoji_events_outlined,
                title: 'هنوز امتیازی در این لیگ ثبت نشده',
              ),
          ],
        ),
      ],
    );
  }
}
