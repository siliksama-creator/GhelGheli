import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

/// تنظیمات چت، SMS، پیکربندی کلاینت، حالت تعمیر و هدیهٔ عضویت.
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
  final _announceText = TextEditingController();
  final _announceLink = TextEditingController();
  final _minVersionAndroid = TextEditingController();
  final _minVersionIos = TextEditingController();
  final _updateUrlAndroid = TextEditingController();
  final _updateUrlIos = TextEditingController();
  final _maintMsg = TextEditingController();
  final _giftPoints = TextEditingController();
  final _giftMessage = TextEditingController();
  bool _announceActive = false;
  String _announceAccent = 'gold';
  bool _forceAndroid = false;
  bool _forceIos = false;
  bool _savingClient = false;
  bool _maintActive = false;
  bool _wheelEnabled = true;
  bool _giftEnabled = false;
  bool _savingGift = false;
  final Map<String, bool> _gameOn = {
    'tap': true,
    'penalty': true,
    'card_duel': true,
    'memory': true,
  };
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
    _updateUrlAndroid.dispose();
    _updateUrlIos.dispose();
    _maintMsg.dispose();
    _giftPoints.dispose();
    _giftMessage.dispose();
    super.dispose();
  }

  Future<void> _load() async {
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
      final cc = await widget.api.get('/api/admin/settings/client-config');
      final app = cc['app'] is Map
          ? Map<String, dynamic>.from(cc['app'] as Map)
          : <String, dynamic>{};
      final ann = cc['announcement'] is Map
          ? Map<String, dynamic>.from(cc['announcement'] as Map)
          : <String, dynamic>{};
      _announceText.text = '${ann['text'] ?? ''}';
      _announceLink.text = '${ann['link'] ?? ''}';
      _announceActive = ann['active'] == true;
      _announceAccent = '${ann['accent'] ?? 'gold'}';
      final minV = app['minVersion'] is Map
          ? Map<String, dynamic>.from(app['minVersion'] as Map)
          : <String, dynamic>{};
      final force = app['forceUpdate'] is Map
          ? Map<String, dynamic>.from(app['forceUpdate'] as Map)
          : <String, dynamic>{};
      _minVersionAndroid.text = '${minV['android'] ?? ''}';
      _minVersionIos.text = '${minV['ios'] ?? ''}';
      _forceAndroid = force['android'] == true;
      _forceIos = force['ios'] == true;
      final urls = app['updateUrl'] is Map
          ? Map<String, dynamic>.from(app['updateUrl'] as Map)
          : <String, dynamic>{};
      _updateUrlAndroid.text = '${urls['android'] ?? ''}';
      _updateUrlIos.text = '${urls['ios'] ?? ''}';
      final feat = cc['features'] is Map
          ? Map<String, dynamic>.from(cc['features'] as Map)
          : <String, dynamic>{};
      final maint = feat['maintenance'] is Map
          ? Map<String, dynamic>.from(feat['maintenance'] as Map)
          : <String, dynamic>{};
      _maintActive = maint['active'] == true;
      _maintMsg.text = '${maint['message'] ?? ''}';
      _wheelEnabled = feat['wheel'] != false;
      final games = feat['games'] is Map
          ? Map<String, dynamic>.from(feat['games'] as Map)
          : <String, dynamic>{};
      for (final id in _gameOn.keys) {
        _gameOn[id] = games[id] != false;
      }
      try {
        final g = await widget.api.get('/api/admin/signup-gift');
        if (g is Map) {
          _giftEnabled = g['enabled'] == true;
          _giftPoints.text = '${g['points'] ?? 0}';
          _giftMessage.text = '${g['message'] ?? ''}';
        }
      } catch (_) {}
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
      if (!mounted) return;
      setState(() => _message = r['message'] ?? 'ذخیره شد');
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = apiError(e));
    } finally {
      if (mounted) setState(() => _savingChat = false);
    }
  }

  Future<void> _saveGift() async {
    setState(() => _savingGift = true);
    try {
      final r = await widget.api.patch('/api/admin/signup-gift', {
        'enabled': _giftEnabled,
        'points': int.tryParse(_giftPoints.text) ?? 0,
        'message': _giftMessage.text.trim(),
      });
      if (!mounted) return;
      setState(() => _message = r['message'] ?? 'هدیهٔ عضویت ذخیره شد');
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = apiError(e));
    } finally {
      if (mounted) setState(() => _savingGift = false);
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
          'updateUrl': {
            'android': _updateUrlAndroid.text.trim(),
            'ios': _updateUrlIos.text.trim(),
          },
        },
        'announcement': {
          'active': _announceActive,
          'text': _announceText.text.trim(),
          'link': _announceLink.text.trim(),
          'accent': _announceAccent,
        },
        'features': {
          'maintenance': {
            'active': _maintActive,
            'message': _maintMsg.text.trim(),
          },
          'games': Map<String, bool>.from(_gameOn),
          'wheel': _wheelEnabled,
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

  Widget _savingIcon(bool busy) => busy
      ? const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
        )
      : const Icon(Icons.save_rounded);

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
          subtitle:
              'بنر اطلاعیه، حداقل نسخه، حالت تعمیر و خاموشی هر بازی. تغییرات بلافاصله در اپ کاربران دیده می‌شود.',
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
                decoration:
                    const InputDecoration(labelText: 'لینک اطلاعیه (اختیاری)')),
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
                decoration:
                    const InputDecoration(labelText: 'حداقل نسخهٔ اندروید')),
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
            TextField(
                controller: _updateUrlAndroid,
                decoration:
                    const InputDecoration(labelText: 'لینک دانلود اندروید')),
            TextField(
                controller: _updateUrlIos,
                decoration: const InputDecoration(labelText: 'لینک دانلود iOS')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _maintActive,
              onChanged: (v) => setState(() => _maintActive = v),
              title: const Text('حالت تعمیر (بازی و گردونه بسته شود)'),
            ),
            TextField(
                controller: _maintMsg,
                decoration:
                    const InputDecoration(labelText: 'پیام حالت تعمیر')),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _wheelEnabled,
              onChanged: (v) => setState(() => _wheelEnabled = v),
              title: const Text('گردونه فعال باشد'),
            ),
            for (final e in const [
              ('tap', 'ضربه‌زن'),
              ('penalty', 'ضربات پنالتی'),
              ('card_duel', 'دوئل کارت‌ها'),
              ('memory', 'جفت‌یاب'),
            ])
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _gameOn[e.$1] != false,
                onChanged: (v) => setState(() => _gameOn[e.$1] = v),
                title: Text('${e.$2} فعال باشد'),
              ),
            FilledButton.icon(
              onPressed: _savingClient ? null : _saveClient,
              icon: _savingIcon(_savingClient),
              label: const Text('ذخیره پیکربندی کلاینت'),
            ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'هدیهٔ امتیاز عضویت',
          subtitle:
              'از لحظهٔ ذخیره هر کاربر تازه همین مقدار را می‌گیرد. پیش‌فرض خاموش است.',
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _giftEnabled,
              onChanged: (v) => setState(() => _giftEnabled = v),
              title: const Text('هدیهٔ عضویت فعال باشد'),
            ),
            TextField(
                controller: _giftPoints,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: 'امتیاز خوش‌آمدگویی')),
            TextField(
                controller: _giftMessage,
                decoration:
                    const InputDecoration(labelText: 'متن پیام دفتر امتیاز')),
            FilledButton.icon(
              onPressed: _savingGift ? null : _saveGift,
              icon: _savingGift
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.card_giftcard_rounded),
              label: const Text('ذخیره هدیهٔ عضویت'),
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
              icon: _savingIcon(_savingChat),
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
