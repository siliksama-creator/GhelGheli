import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';

/// User management & manual point adjustments. Same endpoints as legacy
/// `AdminUsers`.
class AdminUsers extends StatefulWidget {
  final ApiClient api;
  const AdminUsers({super.key, required this.api});

  @override
  State<AdminUsers> createState() => _AdminUsersState();
}

class _AdminUsersState extends State<AdminUsers> {
  List _rows = [];
  final _query = TextEditingController();
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final rows = await widget.api
        .get('/api/admin/users?search=${Uri.encodeComponent(_query.text)}');
    if (mounted)
      setState(() {
        _rows = rows;
        _loading = false;
      });
  }

  Future<void> _adjustPoints(String id) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('امتیاز دستی'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(signed: true),
          decoration: const InputDecoration(
              labelText: 'مثبت یا منفی',
              prefixIcon: Icon(Icons.exposure_rounded)),
          autofocus: true,
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('ثبت')),
        ],
      ),
    );
    if (value != null) {
      await widget.api.post('/api/admin/users/$id/points',
          {'points': int.tryParse(value) ?? 0, 'reason': 'تغییر از اپ مدیریت'});
      await _load();
    }
  }

  // SMS OTP isn't active yet, so users can't self-service a forgotten
  // password. Support can set a temporary one here after verifying the
  // user's identity by phone/in person — the action is written to the
  // audit log on the backend.
  Future<void> _resetPassword(String id) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تنظیم رمز موقت'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                'چون پیامک هنوز فعال نیست، کاربر نمی‌تواند رمز را خودش بازیابی کند. فقط بعد از احراز هویت کاربر این کار را انجام دهید.',
                style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                  labelText: 'رمز جدید (حداقل ۶ کاراکتر)',
                  prefixIcon: Icon(Icons.key_rounded)),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('ثبت')),
        ],
      ),
    );
    if (value == null || value.isEmpty) return;
    if (value.length < 6) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('رمز باید حداقل ۶ کاراکتر باشد')));
      }
      return;
    }
    await widget.api.post('/api/admin/users/$id/reset-password', {
      'newPassword': value,
      'reason': 'بازیابی رمز توسط پشتیبانی',
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('رمز عبور کاربر تغییر کرد؛ رمز جدید را به او اطلاع دهید')));
    }
  }

  Future<void> _showDetails(String id) async {
    final d = await widget.api.get('/api/admin/users/$id');
    final u = Map<String, dynamic>.from(d['user']);
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(u['nickname'] ?? u['mobile'] ?? 'کاربر'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _DetailRow('موبایل/نام کاربری', u['mobile']),
              _DetailRow('نام', u['first_name']),
              _DetailRow('نام خانوادگی', u['last_name']),
              _DetailRow('سن', u['age']),
              _DetailRow('استان', u['province']),
              _DetailRow('محل زندگی', u['city']),
              _DetailRow('شماره کارت/شبا', u['bank_account']),
              _DetailRow('امتیاز فعلی', faNum(u['current_points'])),
              _DetailRow('امتیاز تاریخی', faNum(u['lifetime_points'])),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('بستن'))
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        AppCard(
          padding: const EdgeInsets.all(Gaps.sm),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _query,
                  onSubmitted: (_) => _load(),
                  decoration: const InputDecoration(
                      labelText: 'جستجوی کاربر',
                      prefixIcon: Icon(Icons.search_rounded),
                      border: InputBorder.none,
                      filled: false),
                ),
              ),
              IconButton.filled(
                  onPressed: _load, icon: const Icon(Icons.search_rounded)),
            ],
          ),
        ),
        Gaps.vMd,
        if (_loading)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: Gaps.xxl),
              child: LoadingView())
        else if (_rows.isEmpty)
          const AppCard(
              child: EmptyState(
                  icon: Icons.person_search_rounded, title: 'کاربری یافت نشد'))
        else
          ..._rows.map((u) => Padding(
                padding: const EdgeInsets.only(bottom: Gaps.sm),
                child: AppCard(
                  padding: const EdgeInsets.all(Gaps.md),
                  onTap: () => _showDetails(u['id']),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${u['mobile']} — ${u['nickname'] ?? ''}',
                                style: theme.textTheme.titleSmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Text('${faNum(u['current_points'])} امتیاز',
                                    style: theme.textTheme.bodySmall),
                                Gaps.hSm,
                                StatusBadge(
                                    status: u['status'] ?? '',
                                    labels: const {
                                      'active': 'فعال',
                                      'blocked': 'مسدود'
                                    }),
                              ],
                            ),
                          ],
                        ),
                      ),
                      PopupMenuButton<String>(
                        onSelected: (s) async {
                          if (s == 'points') {
                            await _adjustPoints(u['id']);
                          } else if (s == 'reset_password') {
                            await _resetPassword(u['id']);
                          } else {
                            await widget.api.patch(
                                '/api/admin/users/${u['id']}/status',
                                {'status': s, 'reason': 'از اپ مدیریت'});
                            await _load();
                          }
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(
                              value: 'points', child: Text('تغییر امتیاز')),
                          const PopupMenuItem(
                              value: 'reset_password',
                              child: Text('بازیابی رمز عبور')),
                          PopupMenuItem(
                              value: u['status'] == 'active'
                                  ? 'blocked'
                                  : 'active',
                              child: Text(u['status'] == 'active'
                                  ? 'مسدود'
                                  : 'رفع مسدودی')),
                        ],
                      ),
                    ],
                  ),
                ),
              )),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final Object? value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text('$label: ', style: theme.textTheme.bodySmall),
          Expanded(
              child: Text('${value ?? ''}', style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
