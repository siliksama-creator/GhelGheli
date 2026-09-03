import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

/// «متن‌های زنده» — آینهٔ پنل وب (`admin/src/pages/live-copy.jsx`).
///
/// چرا این صفحه هست: از فاز ۲ به بعد هرچه کاربر در وب و اندروید می‌خواند
/// (جمله‌ها و عددهایش) از `live_copy`/`live_rules` می‌آید. اگر اندروید این
/// را نداشت، «پنلِ کامل» یعنی ادمین برای عوض‌کردنِ یک کاما هم باید لپ‌تاپ
/// باز کند — و درِ «بی‌دقتیِ انسانی» و «دو پنلِ ناهمسان» همان‌جاست.
///
/// سه اصلِ این صفحه، که در نسخهٔ وب مو‌به‌مو همین‌ها رعایت شده:
///  • زبانِ آدم: برچسبِ هر فیلد خودِ جمله است، نه نامِ کلیدِ فنی.
///  • پیش‌نمایشِ زنده: همان چیزی که کاربر می‌بیند، با کمی تأخیرِ تایپ
///    (سرور جای‌نگهدارها را با `live_rules`ی امروز پر می‌کند).
///  • نگهبانِ جای‌نگهدار: اگر مدیرِ تازه‌کار `{days}` را از جمله پاک کند،
///    آن عدد دیگر هیچ‌وقت در اپ نمی‌نشیند و باگ *ساکت* است؛ اینجا همان
///    لحظه هشدار می‌دهیم و دکمهٔ ذخیره تا رفعِ هشدار قفل می‌ماند.
///
/// بازگردانیِ یک‌مرحله‌ای هم همین‌جاست: اشتباهِ مدیر نباید فاجعه باشد.
class AdminLiveCopy extends StatefulWidget {
  final ApiClient api;
  const AdminLiveCopy({super.key, required this.api});

  @override
  State<AdminLiveCopy> createState() => _AdminLiveCopyState();
}

/// نامِ فارسیِ گروه‌ها — باید مو‌به‌مو با `GROUP_LABEL` در پنل وب یکی باشد؛
/// `testAdminCopyParity` همین را می‌سنجد. تکرارِ *عمدی* به‌جای منبعِ مشترک:
/// فایلِ JSX را نمی‌توان در دارت import کرد، پس یکسان‌بودن را گارد تضمین
/// می‌کند، نه شانس و حافظهٔ آدم.
const Map<String, String> kAdminCopyGroups = {
  'referral': 'دعوت از دوستان',
  'coinGuide': 'راهنمای سکه و نرخ‌ها',
  'plus': 'اشتراک پلاس',
  'streak': 'استریک ورود روزانه',
  'support': 'پشتیبانی و منشور حریم خصوصی',
  'photoReview': 'بررسی عکس کارت',
  'wheel': 'گردونه شانس',
  'games': 'بازی‌ها',
  'reconnect': 'اتصالِ دوباره',
  'avatars': 'آواتارها',
};

final RegExp _placeholderRe = RegExp(r'\{([a-zA-Z][a-zA-Z0-9_]*)\}');

List<String> _placeholdersOf(String? s) =>
    s == null ? const [] : [for (final m in _placeholderRe.allMatches(s)) m.group(1)!];

/// برچسبِ آدم‌پسند: خودِ جمله تا ۴۶ کاراکتر (همان قاعدهٔ نسخهٔ وب).
String _labelFor(String key, Object? value) {
  final v = value is String ? value.trim() : '';
  if (v.isEmpty) return key.split('.').last;
  return v.length > 46 ? '${v.substring(0, 46)}…' : v;
}

Map<String, dynamic> _mapOf(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

class _AdminLiveCopyState extends State<AdminLiveCopy> {
  bool _loading = true;
  String? _loadError;
  bool _saving = false;
  bool _reverting = false;
  bool _loadingDefaults = false;
  bool _proMode = false;

  Map<String, dynamic> _ruleDefs = const {};
  Map<String, dynamic> _ruleValues = const {};
  Map<String, dynamic> _saved = const {}; // قالبِ ذخیره‌شده (مرجعِ مقایسه)
  Map<String, dynamic> _preview = const {}; // خروجیِ پرشده از سرور
  List<dynamic> _history = const [];

  /// کلِ fieldهایِ متنی و بندها در یک dictِ کنترلر؛ ساختشان در `build`
  /// فاجعه بود (هر rebuild کنترلرِ نو می‌ساخت و متنِ تایپ‌شده می‌پرید).
  final Map<String, TextEditingController> _text = {};
  final Map<String, TextEditingController> _nums = {};
  Timer? _previewTimer;

  String _key(String group, String field) => '$group.$field';

  TextEditingController _ctrlFor(String group, String field, String value) =>
      _text.putIfAbsent(
          _key(group, field), () => TextEditingController(text: value));

  String _sectionValue(String group, String field, int index, String part, String fallback) {
    final key = '${_key(group, field)}#$index.$part';
    return _text.putIfAbsent(key, () => TextEditingController(text: fallback)).text;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _previewTimer?.cancel();
    for (final c in _text.values) {
      c.dispose();
    }
    for (final c in _nums.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final view = await widget.api.get('/api/admin/settings/live-content');
      final rules = _mapOf(view['rules']);
      final copy = _mapOf(view['copy']);
      final template = _mapOf(copy['template']);
      final defs = _mapOf(rules['defs']);
      final values = _mapOf(rules['values']);
      for (final c in _text.values) {
        c.dispose();
      }
      for (final c in _nums.values) {
        c.dispose();
      }
      _text.clear();
      _nums.clear();
      template.forEach((group, fields) {
        if (fields is! Map) return;
        fields.forEach((field, value) {
          if (value is String) {
            _ctrlFor('$group', '$field', value);
          } else if (value is List) {
            for (var i = 0; i < value.length; i++) {
              final item = _mapOf(value[i]);
              for (final part in ['title', 'body']) {
                final key = '${_key('$group', '$field')}#$i.$part';
                _text.putIfAbsent(key,
                    () => TextEditingController(text: '${item[part] ?? ''}'));
              }
            }
          }
        });
      });
      defs.forEach((name, def) {
        final v = values[name] ?? _mapOf(def)['value'];
        _nums[name] = TextEditingController(text: '$v');
      });
      if (!mounted) return;
      setState(() {
        _ruleDefs = defs;
        _ruleValues = values;
        _saved = template;
        _loading = false;
      });
      _refreshPreview();
      _loadHistory();
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = apiError(e);
          _loading = false;
        });
      }
    }
  }

  /// «بازگشت به پیش‌فرضِ کد» — مثلِ نسخهٔ وب **بی‌ذخیره** است: فقط فرم را
  /// پر می‌کند تا مدیر در پیش‌نمایش ببیند چه چیزی برمی‌گردد و بعد خودش
  /// «ذخیره» را بزند. دکمهٔ یک‌کلیکه‌ای که مستقیمِ محصول را عوض کند، در
  /// پنلی که «اشتباهِ مدیر» در آن فاجعه است، طراحیِ بد است.
  Future<void> _loadDefaults() async {
    setState(() => _loadingDefaults = true);
    try {
      final d = await widget.api.get('/api/admin/settings/live-content/defaults');
      final copy = _mapOf(_mapOf(d)['copy']);
      if (!mounted) return;
      // `_ctrlFor` کنترلرِ *قدیمی* را نگه می‌دارد (putIfAbsent)، پس اگر
      // فقط `_draftOverride` را عوض کنیم، TextFieldها همان متنِ دیروز را
      // نشان می‌دهند و «بازگشت به پیش‌فرض» ظاهری ندارد. باید متنِ
      // کنترلرها هم بازنویسی شود.
      _applyValues(copy);
      setState(() => _draftOverride = copy);
      _notify('پیش‌فرض‌ها روی فرم نشست — هنوز ذخیره نشده');
    } catch (e) {
      _notify(apiError(e), error: true);
    } finally {
      if (mounted) setState(() => _loadingDefaults = false);
    }
  }

  void _notify(String text, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(text), backgroundColor: error ? Colors.red.shade700 : null));
  }

  Future<void> _loadHistory() async {
    try {
      final h =
          await widget.api.get('/api/admin/settings/live-content/history/copy');
      if (mounted) setState(() => _history = (h is List ? h : const []));
    } catch (_) {
      // تاریخچه اختیاری است؛ نبودنش نباید صفحه را خراب کند.
    }
  }

  /// پیش‌نمایش با کمی تأخیرِ تایپ گرفته می‌شود (نه هر keystroke) — همان
  /// کاری که نسخهٔ وب با `setTimeout(…, 420)` می‌کند.
  void _refreshPreview() {
    _previewTimer?.cancel();
    _previewTimer = Timer(const Duration(milliseconds: 420), () async {
      try {
        final d = await widget.api
            .post('/api/admin/settings/live-content/preview', const <String, dynamic>{});
        if (mounted) setState(() => _preview = _mapOf(_mapOf(d)['template']));
      } catch (_) {
        // پیش‌نمایش نیامد؟ خودِ فرم کار می‌کند؛ صفحه نباید سفید شود.
      }
    });
  }

  /// «جای‌نگهداری که مدیر پاک کرده» — اگر این پر باشد ذخیره قفل است.
  List<String> _missingWarnings() {
    final out = <String>[];
    _saved.forEach((group, fields) {
      if (fields is! Map) return;
      fields.forEach((field, raw) {
        if (raw is! String) return;
        final key = _key('$group', '$field');
        final value = _text[key]?.text ?? raw;
        final need = _placeholdersOf(raw).toSet();
        final have = _placeholdersOf(value).toSet();
        final lost = need.difference(have).toList();
        final unknown = have.difference(need).toList();
        if (lost.isEmpty && unknown.isEmpty) return;
        final parts = <String>[];
        if (lost.isNotEmpty) {
          parts.add('جا افتاده: ${lost.map((p) => '{$p}').join(' ')}');
        }
        if (unknown.isNotEmpty) {
          parts.add('ناشناخته: ${unknown.map((p) => '{$p}').join(' ')}');
        }
        out.add('${_proMode ? key : _labelFor(key, raw)} — ${parts.join(' | ')}');
      });
    });
    return out;
  }

  /// اگر «پیش‌فرض‌ها» را روی فرم نشانده باشیم، مرجعِ خواندنِ مقدارها
  /// همان پیش‌نویس است، نه `_saved` (که هنوز نسخهٔ ذخیره‌شده است). بیِ
  /// این خط، دکمهٔ «بازگشت به پیش‌فرض» ظاهرش عوض می‌شد ولی ذخیره، همان
  /// متنِ قبلی را برمی‌گرداند — دقیقاً همان «دکمه‌ای که کار نمی‌کند».
  Map<String, dynamic> _draftOverride = const {};

  Map<String, dynamic> get _form =>
      _draftOverride.isEmpty ? _saved : _draftOverride;

  /// مقدارهایِ `values` را روی کنترلرهایِ موجود می‌نشاند (و یکیِ نو می‌سازد
  /// اگر لازم شد). هر دو مسیرِ «بازگشت» — پیش‌فرضِ کد و بازگردانیِ آخرین
  /// تغییر — به همین نیاز دارند و نباید هر کدام یک نسخهٔ نیم‌بقیه‌اش
  /// از این منطق داشته باشند؛ آن‌وقت یکی از دو دکمه «کار نمی‌کند» می‌شد.
  void _applyValues(Map<String, dynamic> values) {
    values.forEach((group, fields) {
      if (fields is! Map) return;
      fields.forEach((field, value) {
        final key = _key('$group', '$field');
        if (value is String) {
          (_text[key] ??= TextEditingController()).text = value;
        } else if (value is List) {
          for (var i = 0; i < value.length; i++) {
            final item = _mapOf(value[i]);
            for (final part in const ['title', 'body']) {
              final skey = '$key#$i.$part';
              (_text[skey] ??= TextEditingController()).text = '${item[part] ?? ''}';
            }
          }
        }
      });
    });
  }

  Map<String, dynamic> _draftBody() {
    final out = <String, dynamic>{};
    _form.forEach((group, fields) {
      if (fields is! Map) return;
      final g = <String, dynamic>{};
      fields.forEach((field, raw) {
        final key = _key('$group', '$field');
        if (raw is String) {
          g['$field'] = _text[key]?.text ?? raw;
        } else if (raw is List) {
          // بندهای منشور: همان ترتیبِ آرایه برمی‌گردد؛ `sanitizeCopy` طولِ
          // فهرست را ثابت نگه می‌دارد، پس این‌جا هم فقط مقدارها می‌روند.
          g['$field'] = [
            for (var i = 0; i < raw.length; i++)
              {
                'title': _sectionValue('$group', '$field', i, 'title',
                    '${_mapOf(raw[i])['title'] ?? ''}'),
                'body': _sectionValue('$group', '$field', i, 'body',
                    '${_mapOf(raw[i])['body'] ?? ''}'),
              },
          ];
        }
      });
      out['$group'] = g;
    });
    return out;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final patched = await widget.api
          .patch('/api/admin/settings/live-content/copy', _draftBody());
      final nums = <String, dynamic>{};
      _nums.forEach((name, c) {
        final v = int.tryParse(c.text.trim());
        if (v != null) nums[name] = v;
      });
      Map<String, dynamic> rules = const {};
      if (nums.isNotEmpty) {
        rules = _mapOf(await widget.api
            .patch('/api/admin/settings/live-content/rules', nums));
      }
      if (!mounted) return;
      setState(() {
        _saved = _mapOf(patched['copy']);
        _draftOverride = const {};
        if (rules['rules'] is Map) _ruleValues = _mapOf(rules['rules']);
      });
      _refreshPreview();
      _loadHistory();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'ذخیره شد — از اجرای/بارِ بعدی، وب و اندروید همین را می‌بینند')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(apiError(e)), backgroundColor: Colors.red.shade700));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _revert() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('بازگردانیِ آخرین تغییرِ متن‌ها'),
        content: const Text('یک نسخه به عقب برمی‌گردیم. ادامه می‌دهی؟'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('بازگردانی')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _reverting = true);
    try {
      final r = await widget.api
          .post('/api/admin/settings/live-content/copy/revert', const <String, dynamic>{});
      final back = _mapOf(r['copy']);
      _applyValues(back);
      if (!mounted) return;
      setState(() => _saved = back);
      _refreshPreview();
      _loadHistory();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('به نسخهٔ قبلی برگشت')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(apiError(e)), backgroundColor: Colors.red.shade700));
      }
    } finally {
      if (mounted) setState(() => _reverting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_loadError != null) {
      return Padding(
        padding: const EdgeInsets.all(Gaps.md),
        child: ErrorBanner(
          message: _loadError!,
          onRetry: () {
            setState(() {
              _loading = true;
              _loadError = null;
            });
            _load();
          },
        ),
      );
    }

    final warnings = _missingWarnings();
    final groups = _form.keys.toList();

    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        const SectionHeader(
          title: 'متن‌های زنده',
          subtitle:
              'هرچه کاربر در وب و اندروید می‌خواند از همین‌جاست. ذخیره که کنی، در اجرا/بارِ بعدی اعمال می‌شود — نیازی به ساختنِ نسخهٔ تازه نیست.',
        ),
        const FormSection(
          title: 'نگرانِ خراب‌شدن نباش',
          children: [
            Text(
                'متن‌ها فقط «نوشته»‌اند — اگر عددی را عوض نکنی، منطقِ بازی '
                'دست‌نخورده می‌ماند. هر دکمه‌ای هم که بزنی، یک مرحله به عقب '
                'برمی‌گردد.',
                style: TextStyle(height: 1.9, fontSize: 12.5)),
          ],
        ),
        const SizedBox(height: Gaps.sm),
        _numbersCard(),
        const SizedBox(height: Gaps.sm),
        if (warnings.isNotEmpty) ...[
          _warningsCard(warnings),
          const SizedBox(height: Gaps.sm),
        ],
        for (final group in groups) ...[
          _groupCard('$group'),
          const SizedBox(height: Gaps.sm),
        ],
        _actionsCard(warnings),
        const SizedBox(height: Gaps.sm),
        _historyCard(),
        const SizedBox(height: Gaps.lg),
      ],
    );
  }

  Widget _numbersCard() {
    return FormSection(
      title: 'عددهایی که در متن نوشته می‌شوند',
      subtitle: 'این‌ها در اپ خوانده می‌شوند و هم‌زمان در بازی کار می‌کنند؛ '
          'پس بازه‌شان بسته است و بیرونِ بازه ذخیره نمی‌شود.',
      children: [
        for (final entry in _ruleDefs.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: Gaps.sm),
            child: TextField(
              controller: _nums[entry.key],
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: _proMode
                    ? '${entry.key} — ${_mapOf(entry.value)['label']}'
                    : '${_mapOf(entry.value)['label']}',
                helperText:
                    '${_mapOf(entry.value)['hint'] ?? ''}  ·  بین ${_mapOf(entry.value)['min']} تا ${_mapOf(entry.value)['max']}',
                helperMaxLines: 4,
                border: const OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ),
      ],
    );
  }

  Widget _warningsCard(List<String> warnings) {
    return FormSection(
      title: 'چیزهایی که جا افتاده',
      subtitle: 'اگر علامتِ { } عددی را از جمله پاک کنی، آن عدد دیگر هیچ‌وقت '
          'در اپ نمی‌نشیند. این‌ها را برگردان؛ تا رفعِ این هشدار ذخیره قفل است.',
      children: [
        for (final w in warnings)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text('•  $w',
                style: const TextStyle(fontSize: 12, height: 1.7)),
          ),
      ],
    );
  }

  Widget _groupCard(String group) {
    final fields = _mapOf(_form[group]);
    if (fields.isEmpty) return const SizedBox.shrink();
    final children = <Widget>[];
    fields.forEach((field, value) {
      final key = _key(group, '$field');
      if (value is String) {
        children.add(Padding(
          padding: const EdgeInsets.only(bottom: Gaps.sm),
          child: TextField(
            controller: _ctrlFor(group, '$field', value),
            maxLines: null,
            decoration: InputDecoration(
              labelText:
                  _proMode ? key : _labelFor(key, value),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (_) {
              setState(() {});
              _refreshPreview();
            },
          ),
        ));
      } else if (value is List) {
        for (var i = 0; i < value.length; i++) {
          final item = _mapOf(value[i]);
          for (final part in ['title', 'body']) {
            final label = part == 'title' ? 'تیتر' : 'متن';
            final ckey = '$key#$i.$part';
            children.add(Padding(
              padding: const EdgeInsets.only(bottom: Gaps.sm),
              child: TextField(
                controller: _text.putIfAbsent(ckey,
                    () => TextEditingController(text: '${item[part] ?? ''}')),
                maxLines: part == 'title' ? 1 : 4,
                decoration: InputDecoration(
                  labelText: 'بند ${i + 1} — $label',
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (_) => _refreshPreview(),
              ),
            ));
          }
        }
      }
    });
    return FormSection(
      title: kAdminCopyGroups[group] ?? group,
      children: children,
    );
  }

  Widget _actionsCard(List<String> warnings) {
    return FormSection(
      title: 'ذخیره',
      children: [
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: (_reverting || _loadingDefaults) ? null : _loadDefaults,
                icon: const Icon(Icons.layers_rounded, size: 18),
                label: const Text('پیش‌فرضِ کد'),
              ),
            ),
            const SizedBox(width: Gaps.xs),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _reverting ? null : _revert,
                icon: const Icon(Icons.undo_rounded, size: 18),
                label: const Text('بازگردانیِ آخرین تغییر'),
              ),
            ),
            const SizedBox(width: Gaps.sm),
            Expanded(
              child: FilledButton.icon(
                onPressed: (_saving || warnings.isNotEmpty) ? null : _save,
                icon: const Icon(Icons.save_rounded, size: 18),
                label: Text(_saving ? 'در حال ذخیره…' : 'ذخیره'),
              ),
            ),
          ],
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          dense: true,
          value: _proMode,
          onChanged: (v) => setState(() => _proMode = v),
          title: const Text('حالتِ حرفه‌ای (نمایشِ نامِ فنیِ کلیدها)'),
          subtitle: const Text(
            'همین نام‌ها را گاردها و لاگِ تغییرات می‌گویند؛ برای گزارش‌دادن '
            'به تیم لازم است.',
            style: TextStyle(fontSize: 11.5),
          ),
        ),
      ],
    );
  }

  Widget _historyCard() {
    return FormSection(
      title: 'تغییراتِ اخیر',
      subtitle:
          'هر ذخیره یک ردیف می‌گذارد؛ این‌جا می‌بینی چه کسی چه چیزی را عوض کرده.',
      children: [
        if (_history.isEmpty)
          const Text('هنوز تغییری ثبت نشده.', style: TextStyle(fontSize: 12.5))
        else
          for (final h in _history.take(10))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(_historyLine(h), style: const TextStyle(fontSize: 12)),
            ),
      ],
    );
  }

  /// برشِ «۲۰۲۶-۰۹-۰۳T۰۹:۱۲:۴۴» به تاریخ و ساعت — با `clamp`، چون
  /// `substring(0, 16)` روی ردیفِ ناقص (مثلاً بیِ `created_at`) استثنا
  /// می‌داد و کلِ صفحهٔ پنل را سفید می‌کرد.
  String _historyLine(dynamic h) {
    final m = _mapOf(h);
    final created = '${m['created_at'] ?? ''}'.replaceFirst('T', ' ');
    final when = created.length > 16 ? created.substring(0, 16) : created;
    final admin = m['admin_id'];
    return 'متن‌ها — ${when.isEmpty ? '—' : when}'
        '${admin != null ? ' (ادمین $admin)' : ''}';
  }
}
