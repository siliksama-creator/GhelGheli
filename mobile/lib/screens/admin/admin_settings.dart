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
  // ── پیکربندیِ کلاینت (بنرِ اطلاعیه + نسخهٔ حداقل) — هم‌ترازِ پنلِ وب ──
  final _announceText = TextEditingController();
  final _announceLink = TextEditingController();
  final _minVersionAndroid = TextEditingController();
  final _minVersionIos = TextEditingController();
  bool _announceActive = false;
  String _announceAccent = 'gold';
  bool _forceAndroid = false;
  bool _forceIos = false;
  bool _savingClient = false;
  final _provider = TextEditingController();
  final _sender = TextEditingController();
  final _apiKey = TextEditingController();
  final _pattern = TextEditingController();
  bool _smsEnabled = false;
  bool _smsTest = true;
  bool _loading = true;
  String? _loadError;
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
    _announceText.dispose();
    _announceLink.dispose();
    _minVersionAndroid.dispose();
    _minVersionIos.dispose();
    super.dispose();
  }

  Future<void> _load() async {

    // بدون try، هر شکست شبکه‌ای این صفحه را تا ابد روی چرخنده نگه می‌داشت:
    // استثنا بالا می‌رفت و خط `_loading = false` هرگز اجرا نمی‌شد. همان
    // باگی که کاربر با «صفحات لود نمیشن» گزارش داد.
    try {
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
      // ── پیکربندیِ کلاینت — بدونِ آن ادمینِ اندروید نمی‌توانست بنرِ
      //    اطلاعیه یا حداقلِ نسخه را ببیند/عوض کند (شکافِ پنل‌ها).
      final cc = await widget.api.get('/api/admin/settings/client-config');
      final app = cc['app'] is Map ? Map<String, dynamic>.from(cc['app']) : <String, dynamic>{};
      final ann = cc['announcement'] is Map ? Map<String, dynamic>.from(cc['announcement']) : <String, dynamic>{};
      _announceText.text = '${ann['text'] ?? ''}';
      _announceLink.text = '${ann['link'] ?? ''}';
      _announceActive = ann['active'] == true;
      _announceAccent = '${ann['accent'] ?? 'gold'}';
      final minV = app['minVersion'] is Map ? Map<String, dynamic>.from(app['minVersion']) : <String, dynamic>{};
      final force = app['forceUpdate'] is Map ? Map<String, dynamic>.from(app['forceUpdate']) : <String, dynamic>{};
      _minVersionAndroid.text = '${minV['android'] ?? ''}';
      _minVersionIos.text = '${minV['ios'] ?? ''}';
      _forceAndroid = force['android'] == true;
      _forceIos = force['ios'] == true;
      if (mounted) setState(() => _loading = false);
  
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loading = false;
      });
    }
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
      // The admin can leave the screen while the request is in flight;
      // setState on a disposed widget throws.
      if (!mounted) return;
      setState(() => _message = r['message'] ?? 'ذخیره شد');
    } catch (e) {
      if (!mounted) return;
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
      if (!mounted) return;
      setState(() => _message = r['message'] ?? 'ذخیره شد');
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = apiError(e));
    } finally {
      if (mounted) setState(() => _savingSms = false);
    }
  }

  Future<void> _saveClient() async {
    setState(() => _savingClient = true);
    try {
      final r = await widget.api.patch('/api/admin/settings/client-config', {
        'app': {
          'minVersion': {
            'android': _minVersionAndroid.text.trim(),
            'ios': _minVersionIos.text.trim(),
          },
          'forceUpdate': {
            'android': _forceAndroid,
            'ios': _forceIos,
          },
        },
        'announcement': {
          'active': _announceActive,
          'text': _announceText.text.trim(),
          'link': _announceLink.text.trim(),
          'accent': _announceAccent,
        },
      });
      if (!mounted) return;
      setState(() => _message = r['message'] ?? 'ذخیره شد');
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = apiError(e));
    } finally {
      if (mounted) setState(() => _savingClient = false);
    }
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

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        FormSection(
          title: 'پیکربندی کلاینت (بدون نیاز به نسخهٔ جدید)',
          subtitle: 'بنرِ اطلاعیه و حداقلِ نسخهٔ اپ — همان چیزی که پنلِ وب دارد. '
              'تغییرات بلافاصله در اپ کاربران دیده می‌شود.',
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _announceActive,
              onChanged: (v) => setState(() => _announceActive = v),
              title: const Text('بنرِ اطلاعیه فعال باشد'),
            ),
            TextField(
                controller: _announceText,
                decoration: const InputDecoration(labelText: 'متن اطلاعیه')),
            TextField(
                controller: _announceLink,
                decoration: const InputDecoration(labelText: 'لینک اطلاعیه (اختیاری)')),
            DropdownButtonFormField<String>(
              initialValue: _announceAccent,
              items: const [
                DropdownMenuItem(value: 'gold', child: Text('طلایی')),
                DropdownMenuItem(value: 'green', child: Text('سبز')),
                DropdownMenuItem(value: 'blue', child: Text('آبی')),
                DropdownMenuItem(value: 'orange', child: Text('نارنجی')),
              ],
              onChanged: (v) => setState(() => _announceAccent = v ?? 'gold'),
              decoration: const InputDecoration(labelText: 'رنگ بنر'),
            ),
            TextField(
                controller: _minVersionAndroid,
                decoration: const InputDecoration(
                    labelText: 'حداقل نسخهٔ اندروید')),
            TextField(
                controller: _minVersionIos,
                decoration: const InputDecoration(labelText: 'حداقل نسخهٔ iOS')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _forceAndroid,
              onChanged: (v) => setState(() => _forceAndroid = v),
              title: const Text('آپدیت اجباری اندروید'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _forceIos,
              onChanged: (v) => setState(() => _forceIos = v),
              title: const Text('آپدیت اجباری iOS'),
            ),
            FilledButton.icon(
              onPressed: _savingClient ? null : _saveClient,
              icon: _savingClient
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.save_rounded),
              label: const Text('ذخیره پیکربندی کلاینت'),
            ),
          ],
        ),
        Gaps.vMd,
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
