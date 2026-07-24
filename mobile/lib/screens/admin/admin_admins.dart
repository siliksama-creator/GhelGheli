import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

/// Admin-account management + audit log. Same endpoints as legacy
/// `AdminAdmins`.
class AdminAdmins extends StatefulWidget {
  final ApiClient api;
  const AdminAdmins({super.key, required this.api});

  @override
  State<AdminAdmins> createState() => _AdminAdminsState();
}

class _AdminAdminsState extends State<AdminAdmins> {
  List _admins = [];
  List _logs = [];
  bool _loading = true;
  bool _saving = false;
  final _username = TextEditingController();
  final _password = TextEditingController();
  String _role = 'support';

  static const _roleLabels = {
    'super_admin': 'مدیر کل',
    'support': 'پشتیبان',
    'observer': 'ناظر'
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final admins = await widget.api.get('/api/admin/admins');
    final logs = await widget.api.get('/api/admin/audit-log');
    if (mounted)
      setState(() {
        _admins = admins;
        _logs = logs;
        _loading = false;
      });
  }

  Future<void> _add() async {
    if (_username.text.trim().isEmpty || _password.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await widget.api.post('/api/admin/admins', {
        'username': _username.text,
        'password': _password.text,
        'role': _role
      });
      _username.clear();
      _password.clear();
      await _load();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        FormSection(
          title: 'ادمین جدید',
          children: [
            TextField(
                controller: _username,
                decoration: const InputDecoration(
                    labelText: 'نام کاربری',
                    prefixIcon: Icon(Icons.person_outline_rounded))),
            TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: 'رمز عبور',
                    prefixIcon: Icon(Icons.lock_outline_rounded))),
            DropdownButtonFormField<String>(
              initialValue: _role,
              decoration: const InputDecoration(labelText: 'نقش'),
              items: const [
                DropdownMenuItem(value: 'super_admin', child: Text('مدیر کل')),
                DropdownMenuItem(value: 'support', child: Text('پشتیبان')),
                DropdownMenuItem(value: 'observer', child: Text('ناظر')),
              ],
              onChanged: (v) => setState(() => _role = v!),
            ),
            FilledButton.icon(
              onPressed: _saving ? null : _add,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.person_add_alt_1_rounded),
              label: const Text('ایجاد ادمین'),
            ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'ادمین‌ها',
          children: _admins.isEmpty
              ? [
                  const EmptyState(
                      icon: Icons.admin_panel_settings_outlined,
                      title: 'ادمینی ثبت نشده')
                ]
              : _admins
                  .map<Widget>((a) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.shield_rounded),
                        title: Text(a['username']),
                        subtitle: Text(_roleLabels[a['role']] ?? a['role']),
                      ))
                  .toList(),
        ),
        Gaps.vMd,
        FormSection(
          title: 'گزارش فعالیت (Audit Log)',
          children: _logs.isEmpty
              ? [
                  const EmptyState(
                      icon: Icons.history_rounded, title: 'رویدادی ثبت نشده')
                ]
              : _logs
                  .take(80)
                  .map<Widget>((l) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Text(
                            '${l['username'] ?? 'سیستم'} — ${l['action']} — ${l['created_at']}',
                            style: theme.textTheme.bodySmall),
                      ))
                  .toList(),
        ),
      ],
    );
  }
}
