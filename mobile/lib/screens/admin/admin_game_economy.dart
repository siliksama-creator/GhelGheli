// تنظیماتِ اقتصادِ بازی‌ها — پنل ادمینِ اندروید.
//
// خواستهٔ مالک:
//   • کنترلِ سکه در حالت برد/مساوی/باخت برای هر بازی و هر ورودی،
//   • درصدِ انتقالِ سکه از لیگِ بسته به لیگِ بعدی (صفر هم مجاز است)،
//   • سهمیهٔ روزانهٔ سکه و سکهٔ هر لولِ ضربه‌زن.
//
// نوشته‌های داخلِ اپ و وب این اعداد را از `/api/config` می‌خوانند، پس
// بلافاصله — بدونِ انتشارِ نسخهٔ جدید — همه‌جا عوض می‌شوند.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/json_get.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminGameEconomy extends StatefulWidget {
  const AdminGameEconomy({super.key, required this.api});
  final ApiClient api;

  @override
  State<AdminGameEconomy> createState() => _AdminGameEconomyState();
}

class _AdminGameEconomyState extends State<AdminGameEconomy> {
  static const _games = ['card_duel', 'penalty', 'memory'];
  static const _gameLabels = {
    'card_duel': 'دوئل کارت‌ها',
    'penalty': 'ضربات پنالتی',
    'memory': 'جفت‌یاب',
  };
  static const _outcomes = ['win', 'draw', 'loss'];
  static const _outcomeLabels = {'win': 'برد', 'draw': 'مساوی', 'loss': 'باخت'};

  final _pct = TextEditingController();
  final _tap = TextEditingController();
  final _q100 = TextEditingController();
  final _q1000 = TextEditingController();
  final _winPts = TextEditingController();
  final _losePts = TextEditingController();
  final _drawPts = TextEditingController();
  final _capPts = TextEditingController();
  bool _pointsEnabled = false;
  final Map<String, TextEditingController> _coins = {};
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    for (final g in _games) {
      for (final s in [100, 1000]) {
        for (final o in _outcomes) {
          _coins['$g.$s.$o'] = TextEditingController();
        }
      }
    }
    _load();
  }

  @override
  void dispose() {
    _pct.dispose();
    _tap.dispose();
    _q100.dispose();
    _q1000.dispose();
    _winPts.dispose();
    _losePts.dispose();
    _drawPts.dispose();
    _capPts.dispose();
    for (final c in _coins.values) {
      c.dispose();
    }
    super.dispose();
  }

  int _v(TextEditingController c, int fallback) =>
      int.tryParse(c.text.trim()) ?? fallback;

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/api/admin/settings/game-economy');
      if (!mounted || res is! Map) return;
      final e = res['economy'] is Map
          ? Map<String, dynamic>.from(res['economy'] as Map)
          : <String, dynamic>{};
      final rewards = e['coinRewards'] is Map
          ? Map<String, dynamic>.from(e['coinRewards'] as Map)
          : <String, dynamic>{};
      final quota = e['dailyCoinQuota'] is Map
          ? Map<String, dynamic>.from(e['dailyCoinQuota'] as Map)
          : <String, dynamic>{};
      setState(() {
        _pct.text = '${e['coinCarryoverPercent'] ?? 10}';
        _tap.text = '${e['tapCoinsPerLevel'] ?? 5}';
        // JSON کلیدِ عددی را رشته می‌فرستد. `quota[100]` همیشه null بود
        // و پنل بعد از ذخیره دوباره پیش‌فرض نشان می‌داد.
        _q100.text = '${jsonGet(quota, 100) ?? 30}';
        _q1000.text = '${jsonGet(quota, 1000) ?? 15}';
        final gp = jsonMap(res['gamePoints']);
        _pointsEnabled = gp['enabled'] == true;
        _winPts.text = '${gp['winPoints'] ?? 10}';
        _losePts.text = '${gp['losePoints'] ?? 0}';
        _drawPts.text = '${gp['drawPoints'] ?? 0}';
        _capPts.text = '${gp['dailyCap'] ?? 10}';
        for (final g in _games) {
          final gr = jsonMap(rewards[g]);
          for (final s in [100, 1000]) {
            final sr = jsonMap(jsonGet(gr, s));
            for (final o in _outcomes) {
              _coins['$g.$s.$o']!.text = '${sr[o] ?? 0}';
            }
          }
        }
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final coinRewards = <String, dynamic>{};
      for (final g in _games) {
        coinRewards[g] = <String, dynamic>{};
        for (final s in [100, 1000]) {
          // کلید باید رشته باشد: `jsonEncode` روی کلیدِ int پرتاب می‌کند
          // و ذخیره از پنل اندروید بی‌صدا شکست می‌خورد.
          coinRewards[g]['$s'] = <String, dynamic>{};
          for (final o in _outcomes) {
            coinRewards[g]['$s'][o] = _v(_coins['$g.$s.$o']!, 0);
          }
        }
      }
      final d = await widget.api.patch('/api/admin/settings/game-economy', {
        'economy': {
          'coinCarryoverPercent': _v(_pct, 10),
          'tapCoinsPerLevel': _v(_tap, 5),
          'dailyCoinQuota': {'100': _v(_q100, 30), '1000': _v(_q1000, 15)},
          'coinRewards': coinRewards,
        },
        'gamePoints': {
          'enabled': _pointsEnabled,
          'winPoints': _v(_winPts, 10),
          'losePoints': _v(_losePts, 0),
          'drawPoints': _v(_drawPts, 0),
          'dailyCap': _v(_capPts, 10),
        },
      });
      if (!mounted) return;
      _toast('${d['message'] ?? 'ذخیره شد'}');
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Widget _numField(TextEditingController c, String label, {num width = 90}) {
    return SizedBox(
      width: width.toDouble(),
      child: TextField(
        controller: c,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(Gaps.md),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('اقتصاد بازی‌ها',
                    style: Theme.of(context).textTheme.titleMedium),
                Gaps.vXxs,
                const Text(
                  'تغییرات این صفحه بلافاصله در نوشته‌های اپ اندروید و وب اعمال می‌شود — بدون نیاز به نسخهٔ جدید.',
                  style: TextStyle(fontSize: 12, color: Colors.white60),
                ),
                Gaps.vSm,
                FormSection(
                  title: 'انتقال سکه بین لیگ‌ها',
                  children: [
                    Row(
                      children: [
                        _numField(_pct, 'درصدِ انتقال (۰ تا ۱۰۰)',
                            width: 170),
                      ],
                    ),
                    const Text(
                      'سکه‌ها بعد از پایان لیگ صفر می‌شوند و این درصد به لیگ بعدی منتقل می‌شود. صفر یعنی انتقال صفر.',
                      style: TextStyle(fontSize: 11.5, color: Colors.white60),
                    ),
                  ],
                ),
                Gaps.vSm,
                FormSection(
                  title: 'سهمیهٔ روزانه و ضربه‌زن',
                  children: [
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _numField(_q100, 'سهمیهٔ ۱۰۰'),
                        _numField(_q1000, 'سهمیهٔ ۱۰۰۰'),
                        _numField(_tap, 'سکهٔ هر لولِ ضربه‌زن'),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          Gaps.vSm,
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('سکهٔ هر نتیجه در مسابقات',
                    style: Theme.of(context).textTheme.titleMedium),
                Gaps.vSm,
                for (final g in _games) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(_gameLabels[g]!,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 13)),
                  ),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in [100, 1000])
                        for (final o in _outcomes)
                          _numField(_coins['$g.$s.$o']!,
                              '${_outcomeLabels[o]} · $s'),
                    ],
                  ),
                  Gaps.vSm,
                ],
              ],
            ),
          ),
          Gaps.vSm,
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('امتیاز بازی‌های آنلاین',
                          style: Theme.of(context).textTheme.titleMedium),
                    ),
                    Switch(
                      value: _pointsEnabled,
                      onChanged: (v) => setState(() => _pointsEnabled = v),
                    ),
                  ],
                ),
                const Text(
                  'امتیاز مثبت برای برد، منفی برای باخت — همان صفحهٔ «امتیاز بازی». اینجا هم هست تا وب و اندروید یک صفحه داشته باشند.',
                  style: TextStyle(fontSize: 12, color: Colors.white60),
                ),
                Gaps.vSm,
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _numField(_winPts, 'امتیاز برد'),
                    _numField(_losePts, 'امتیاز باخت'),
                    _numField(_drawPts, 'امتیاز مساوی'),
                    _numField(_capPts, 'سقف روزانه'),
                  ],
                ),
              ],
            ),
          ),
          Gaps.vSm,
          FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_rounded),
            label: Text(_saving ? 'در حال ذخیره…' : 'ذخیرهٔ همه'),
          ),
          Gaps.vMd,
        ],
      ),
    );
  }
}
