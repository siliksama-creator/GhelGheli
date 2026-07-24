import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

/// Chat moderation settings + SMS provider configuration. Same endpoints
/// as legacy `AdminSettings`.
class AdminSettings extends StatefulWidget {
  final ApiClient api;
  const AdminSettings({super.key, required this.api});

  @override
  State<AdminSettings> createState() => _AdminSettingsState();
}

class _AdminSettingsState extends State<AdminSettings> {
  final _chatMin = TextEditingController();
  final _cooldown = TextEditingController();
  final _badWords = TextEditingController();
  final _provider = TextEditingController();
  final _sender = TextEditingController();
  final _apiKey = TextEditingController();
  final _pattern = TextEditingController();
  bool _smsEnabled = false;
  bool _smsTest = true;
  bool _loading = true;
  bool _savingChat = false;
  bool _savingSms = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _chatMin.dispose();
    _cooldown.dispose();
    _badWords.dispose();
    _provider.dispose();
    _sender.dispose();
    _apiKey.dispose();
    _pattern.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final c = await widget.api.get('/api/admin/settings/chat');
    _chatMin.text = '${c['minLifetimePoints'] ?? 0}';
    _cooldown.text = '${c['messageCooldownSeconds'] ?? 5}';
    _badWords.text = ((c['badWords'] as List?) ?? []).join('\n');
    final s = await widget.api.get('/api/admin/settings/sms');
    _provider.text = s['provider'] ?? '';
    _sender.text = s['sender'] ?? '';
    _apiKey.text = s['apiKeyMasked'] ?? '';
    _pattern.text = s['patternCode'] ?? '';
    _smsEnabled = s['enabled'] == true;
    _smsTest = s['testMode'] != false;
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _saveChat() async {
    setState(() => _savingChat = true);
    try {
      final r = await widget.api.patch('/api/admin/settings/chat', {
        'minLifetimePoints': int.tryParse(_chatMin.text) ?? 0,
        'messageCooldownSeconds': int.tryParse(_cooldown.text) ?? 5,
        'badWordsText': _badWords.text,
        'reason': 'تنظیم از اپ مدیریت',
      });
      setState(() => _message = r['message'] ?? 'ذخیره شد');
    } catch (e) {
      setState(() => _message = apiError(e));
    } finally {
      if (mounted) setState(() => _savingChat = false);
    }
  }

  Future<void> _saveSms() async {
    setState(() => _savingSms = true);
    try {
      final r = await widget.api.patch('/api/admin/settings/sms', {
        'provider': _provider.text,
        'sender': _sender.text,
        'apiKey': _apiKey.text,
        'patternCode': _pattern.text,
        'enabled': _smsEnabled,
        'testMode': _smsTest,
      });
      setState(() => _message = r['message'] ?? 'ذخیره شد');
    } catch (e) {
      setState(() => _message = apiError(e));
    } finally {
      if (mounted) setState(() => _savingSms = false);
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
          title: 'تنظیمات چت کاربران',
          subtitle:
              'حداقل امتیاز و فاصله زمانی بین پیام‌ها برای جلوگیری از اسپم.',
          children: [
            TextField(
                controller: _chatMin,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'حداقل امتیاز تاریخی برای چت')),
            TextField(
                controller: _cooldown,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'فاصله بین پیام‌ها - ثانیه')),
            TextField(
                controller: _badWords,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(
                    labelText: 'کلمات رکیک/ممنوعه؛ هر خط یک کلمه')),
            FilledButton.icon(
              onPressed: _savingChat ? null : _saveChat,
              icon: _savingChat
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.save_rounded),
              label: const Text('ذخیره تنظیمات چت'),
            ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'تنظیمات پنل SMS',
          children: [
            TextField(
                controller: _provider,
                decoration:
                    const InputDecoration(labelText: 'نام سرویس‌دهنده')),
            TextField(
                controller: _sender,
                decoration: const InputDecoration(labelText: 'فرستنده')),
            TextField(
                controller: _apiKey,
                decoration: const InputDecoration(labelText: 'API Key')),
            TextField(
                controller: _pattern,
                decoration: const InputDecoration(labelText: 'کد پترن/قالب')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _smsEnabled,
              onChanged: (v) => setState(() => _smsEnabled = v),
              title: const Text('فعال‌سازی SMS'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _smsTest,
              onChanged: (v) => setState(() => _smsTest = v),
              title: const Text('حالت تست'),
            ),
            FilledButton.icon(
              onPressed: _savingSms ? null : _saveSms,
              icon: _savingSms
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.sms_rounded),
              label: const Text('ذخیره SMS'),
            ),
          ],
        ),
        if (_message != null) ...[
          Gaps.vMd,
          Text(_message!,
              style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
        ],
      ],
    );
  }
}
