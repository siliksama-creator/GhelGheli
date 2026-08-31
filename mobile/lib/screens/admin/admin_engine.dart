// اهرم‌های موتور — آینهٔ admin/src/pages/engine.jsx
//
// تنظیماتِ فنی که تا امروز ثابتِ کد بودند: آستانه‌های تشخیص کارت، منحنی
// سطح، جوایز استریک و پیام‌های آمادهٔ چت. ذخیره در app_settings بلافاصله
// روی همهٔ کلاینت‌ها اثر می‌گذارد — بدون دپلوی و بدون آپدیت اپ.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminEngine extends StatefulWidget {
  final ApiClient api;
  const AdminEngine({super.key, required this.api});

  @override
  State<AdminEngine> createState() => _AdminEngineState();
}

class _AdminEngineState extends State<AdminEngine> {
  Map<String, dynamic> _photo = const {};
  Map<String, dynamic> _levels = const {};
  List<String> _streak = const [];
  List<String> _canned = const [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _streakCtrl = TextEditingController();
  final _cannedCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _streakCtrl.dispose();
    _cannedCtrl.dispose();
    super.dispose();
  }

  void _toast(String m) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/settings/engine');
      if (!mounted) return;
      setState(() {
        _photo = Map<String, dynamic>.from((d['photoMatch'] as Map?) ?? {});
        _levels = Map<String, dynamic>.from((d['levels'] as Map?) ?? {});
        _streak = (d['streak']?['rewards'] as List? ?? const [])
            .map((e) => '$e')
            .toList();
        _canned = (d['cannedMessages'] as List? ?? const [])
            .whereType<String>()
            .toList();
        _streakCtrl.text = _streak.join('، ');
        _cannedCtrl.text = _canned.join('\n');
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _patch(String path, Map<String, dynamic> body) async {
    setState(() => _saving = true);
    try {
      final r = await widget.api.patch('/api/admin$path', body);
      _toast('${(r as Map?)?['message'] ?? 'ذخیره شد'}');
      await _load();
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _savePhoto() async {
    final vals = <String, double>{};
    for (final key in [
      'acceptScore',
      'reviewScore',
      'boundAcceptScore',
      'freeAcceptScore',
      'duplicateSimilarity'
    ]) {
      final n = double.tryParse('${_photo[key] ?? ''}');
      if (n == null || n < 0 || n > 1) {
        _toast('«$key» باید عددی بین ۰ و ۱ باشد');
        return;
      }
      vals[key] = n;
    }
    await _patch('/settings/photo-match', vals);
  }

  Future<void> _saveLevels() async {
    final vals = <String, dynamic>{};
    for (final key in ['base', 'lin', 'exp', 'knee', 'tail']) {
      final n = double.tryParse('${_levels[key] ?? ''}');
      if (n == null) {
        _toast('«$key» عدد معتبر نیست');
        return;
      }
      vals[key] = key == 'knee' ? n.round() : n;
    }
    await _patch('/settings/levels', vals);
  }

  Future<void> _saveStreak() async {
    final rewards = _streakCtrl.text
        .split(RegExp(r'[،,\s]+'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .map((e) => int.tryParse(e))
        .toList();
    if (rewards.length < 2 ||
        rewards.length > 30 ||
        rewards.any((e) => e == null || e < 0 || e > 1000000)) {
      _toast('چرخه باید بین ۲ تا ۳۰ روز باشد و هر روز بین ۰ تا ۱٬۰۰۰٬۰۰۰');
      return;
    }
    await _patch('/settings/streak', {'rewards': rewards});
  }

  Future<void> _saveCanned() async {
    final messages = _cannedCtrl.text
        .split('\n')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    if (messages.isEmpty) {
      _toast('حداقل یک پیام لازم است');
      return;
    }
    await _patch('/chat/canned', {'messages': messages});
  }

  Widget _numField(String label, String key, Map<String, dynamic> src,
      void Function(String) onChanged,
      {String? hint, bool integer = false}) {
    return _NumEdit(
      label: label,
      hint: hint,
      integer: integer,
      value: '${src[key] ?? ''}',
      onChanged: onChanged,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FormSection(
            title: 'آستانه‌های تشخیص کارت',
            subtitle: 'امتیاز شباهت ۰ تا ۱ — ذخیره از همین لحظه اعمال می‌شود',
            children: [
              Row(children: [
                Expanded(
                    child: _numField('پذیرش خودکار', 'acceptScore', _photo,
                        (v) => _photo['acceptScore'] = v)),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('بررسی انسانی', 'reviewScore', _photo,
                        (v) => _photo['reviewScore'] = v)),
              ]),
              Row(children: [
                Expanded(
                    child: _numField('کارت‌های دفترچه‌ای', 'boundAcceptScore',
                        _photo, (v) => _photo['boundAcceptScore'] = v)),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('کارت‌های رایگان', 'freeAcceptScore', _photo,
                        (v) => _photo['freeAcceptScore'] = v)),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('تشخیص تکراری', 'duplicateSimilarity',
                        _photo, (v) => _photo['duplicateSimilarity'] = v)),
              ]),
              FilledButton.icon(
                onPressed: _saving ? null : _savePhoto,
                icon: const Icon(Icons.save_rounded),
                label: const Text('ذخیره آستانه‌ها'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'منحنی سطح بازیکن',
            subtitle: 'نوار پیشرفت همهٔ کاربران از حالا با آن حساب می‌شود',
            children: [
              Row(children: [
                Expanded(
                    child: _numField('پایه (XP لول‌های اول)', 'base', _levels,
                        (v) => _levels['base'] = v)),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('شیب خطی', 'lin', _levels,
                        (v) => _levels['lin'] = v)),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('توان نمایی', 'exp', _levels,
                        (v) => _levels['exp'] = v)),
              ]),
              Row(children: [
                Expanded(
                    child: _numField('زانو (لول)', 'knee', _levels,
                        (v) => _levels['knee'] = v, integer: true)),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('پلهٔ بعد از زانو', 'tail', _levels,
                        (v) => _levels['tail'] = v)),
              ]),
              FilledButton.icon(
                onPressed: _saving ? null : _saveLevels,
                icon: const Icon(Icons.save_rounded),
                label: const Text('ذخیره منحنی'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'چرخهٔ استریک ورود',
            subtitle: 'جایزهٔ هر روز، جدا با کاما (۲ تا ۳۰ روز)',
            children: [
              TextField(
                controller: _streakCtrl,
                decoration: const InputDecoration(
                    labelText: 'جوایز روزانه',
                    hintText: '100, 150, 200, 250, 300, 350, 500'),
              ),
              FilledButton.icon(
                onPressed: _saving ? null : _saveStreak,
                icon: const Icon(Icons.save_rounded),
                label: const Text('ذخیره چرخه'),
              ),
            ],
          ),
          const SizedBox(height: Gaps.md),
          FormSection(
            title: 'پیام‌های آمادهٔ چت',
            subtitle: 'هر خط یک پیام (حداکثر ۸۰ حرف)',
            children: [
              TextField(
                controller: _cannedCtrl,
                maxLines: 14,
                decoration: const InputDecoration(
                    labelText: 'پیام‌ها',
                    alignLabelWithHint: true,
                    border: OutlineInputBorder()),
              ),
              FilledButton.icon(
                onPressed: _saving ? null : _saveCanned,
                icon: const Icon(Icons.save_rounded),
                label: const Text('ذخیره پیام‌ها'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// فیلد عددی با کنترلرِ مالکیت‌شده — الگوی مجاز پروژه:
/// کنترلر در initState ساخته و در dispose آزاد می‌شود؛ مقدارِ بیرونی فقط
/// وقتی عوض شود (مثلاً بعد از بارگذاری مجدد) در didUpdateWidget بازنویسی
/// می‌شود تا فوکوسِ کاربر به هم نریزد.
class _NumEdit extends StatefulWidget {
  final String label;
  final String? hint;
  final bool integer;
  final String value;
  final ValueChanged<String> onChanged;
  const _NumEdit(
      {required this.label,
      this.hint,
      this.integer = false,
      required this.value,
      required this.onChanged});

  @override
  State<_NumEdit> createState() => _NumEditState();
}

class _NumEditState extends State<_NumEdit> {
  late final TextEditingController _c;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(covariant _NumEdit old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value && _c.text != widget.value) {
      _c.text = widget.value;
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _c,
      keyboardType:
          TextInputType.numberWithOptions(decimal: !widget.integer),
      onChanged: widget.onChanged,
      decoration: InputDecoration(labelText: widget.label, hintText: widget.hint),
    );
  }
}
