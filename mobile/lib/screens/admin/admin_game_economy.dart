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
  // ── منحنیِ ضربه‌زن (دورِ ۳۳) — قابلِ مدیریت بدونِ آپدیتِ اپ ──
  final _tapLevels = TextEditingController();
  final _tapTotal = TextEditingController();
  final _tapGrowth = TextEditingController();
  final _tapPerDay = TextEditingController();
  final _winPts = TextEditingController();
  final _losePts = TextEditingController();
  final _drawPts = TextEditingController();
  final _capPts = TextEditingController();
  bool _pointsEnabled = false;
  List<int> _stakes = const [100, 1000];
  final Map<String, TextEditingController> _coins = {};
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _ensureCoinControllers(_stakes);
    _load();
  }

  @override
  void dispose() {
    _pct.dispose();
    _tap.dispose();
    _q100.dispose();
    _q1000.dispose();
    _tapLevels.dispose();
    _tapTotal.dispose();
    _tapGrowth.dispose();
    _tapPerDay.dispose();
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

  void _ensureCoinControllers(List<int> stakes) {
    for (final g in _games) {
      for (final s in stakes) {
        for (final o in _outcomes) {
          _coins.putIfAbsent('$g.$s.$o', TextEditingController.new);
        }
        _coins.putIfAbsent('quota.$s', TextEditingController.new);
      }
    }
  }


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
      final levels = (res['stakeLevels'] is List)
          ? (res['stakeLevels'] as List).map((x) => (x as num).toInt()).where((n) => n > 0).toList()
          : const <int>[100, 1000];
      final stakeList = levels.isNotEmpty ? levels : const [100, 1000];
      _ensureCoinControllers(stakeList);
      setState(() {
        _stakes = stakeList;
        _pct.text = '${e['coinCarryoverPercent'] ?? 10}';
        _tap.text = '${e['tapCoinsPerLevel'] ?? 5}';
        final tc = jsonMap(e['tapCurve']);
        _tapLevels.text = '${tc['levelCount'] ?? 50}';
        _tapTotal.text = '${tc['totalPoints'] ?? 50000}';
        _tapGrowth.text = '${tc['growthFactor'] ?? 1.05}';
        _tapPerDay.text = '${tc['levelsPerDay'] ?? 2}';
        // JSON کلیدِ عددی را رشته می‌فرستد. `quota[100]` همیشه null بود
        // و پنل بعد از ذخیره دوباره پیش‌فرض نشان می‌داد.
        for (final s in stakeList) {
          final def = s == 100 ? 30 : 15;
          _coins['quota.$s']!.text = '${jsonGet(quota, s) ?? def}';
        }
        // سازگاری فیلدهای قدیمی اگر هنوز در درخت ویجت باشند
        if (stakeList.contains(100)) {
          _q100.text = _coins['quota.100']!.text;
        }
        if (stakeList.contains(1000)) {
          _q1000.text = _coins['quota.1000']!.text;
        }
        final gp = jsonMap(res['gamePoints']);
        _pointsEnabled = gp['enabled'] == true;
        _winPts.text = '${gp['winPoints'] ?? 10}';
        _losePts.text = '${gp['losePoints'] ?? 0}';
        _drawPts.text = '${gp['drawPoints'] ?? 0}';
        _capPts.text = '${gp['dailyCap'] ?? 10}';
        for (final g in _games) {
          final gr = jsonMap(rewards[g]);
          for (final s in _stakes) {
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
        for (final s in _stakes) {
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
          'dailyCoinQuota': {
            for (final s in _stakes)
              '$s': _v(_coins['quota.$s']!, s == 100 ? 30 : 15),
          },
          'coinRewards': coinRewards,
          'tapCurve': {
            'levelCount': _v(_tapLevels, 50),
            'totalPoints': _v(_tapTotal, 50000),
            'growthFactor':
                double.tryParse(_tapGrowth.text.trim()) ?? 1.05,
            'levelsPerDay': _v(_tapPerDay, 2),
          },
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

  /// `hint` توضیحِ مدیر است، نه متنِ محصول؛ روی `helperText` می‌نشیند، چون
  /// این فیلدها همیشه پرند و `hintText` رویِ فیلدِ پر دیده نمی‌شود.
  Widget _numField(TextEditingController c, String label,
    {num width = 90, String? hint}) {
    return SizedBox(
      width: width.toDouble(),
      child: TextField(
        controller: c,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        decoration: InputDecoration(
          labelText: label,
          helperText: hint,
          helperMaxLines: 6,
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
                            width: 170,
                        hint: 'کفِ عدد حساب می‌شود: ۹۹۹ سکه با ۱۰٪ یعنی ۹۹ سکه؛ عددِ بیرون از ۰ تا ۱۰۰ یا خالی، هیچ سکه‌ای منتقل نمی‌کند.'),
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
                  title: 'سهمیهٔ روزانه و سکهٔ ضربه‌زن',
                  children: [
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final s in _stakes)
                          _numField(_coins['quota.$s']!, 'سهمیهٔ $s'),
                        _numField(_tap, 'سکهٔ هر لولِ ضربه‌زن',
                        hint: 'به لول‌هایی که تا حالا رد شده چیزی اضافه نمی‌کند؛ از لحظهٔ ذخیره، برایِ لول‌هایِ بعدی مصرف می‌شود.'),
                      ],
                    ),
                  ],
                ),
                Gaps.vSm,
                FormSection(
                  title: 'منحنیِ بازی ضربه‌زن (دورِ ۳۳)',
                  children: [
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _numField(_tapLevels, 'تعداد لول', width: 110,
                        hint: 'اگر کمتر از لولی باشد که بعضی بازیکن‌ها رد کرده‌اند، آن‌ها در حالتِ «بازی تمام شد» می‌مانند و ریستِ پایینِ همین صفحه آزادشان می‌کند.'),
                        _numField(_tapTotal, 'جمعِ امتیازِ کل', width: 130,
                        hint: 'همین عدد بینِ لول‌ها توزیع می‌شود (کسرِ گردکردن در لولِ آخر جبران می‌شود)؛ بالا بردنش جمعِ کل را بالا می‌برد، نه فقط لولِ آخر را.'),
                        _numField(_tapGrowth, 'شیب (۱ تا ۱٫۵)', width: 120,
                        hint: '۱ = همهٔ لول‌ها هم‌قیمت؛ ۱٫۵ یعنی لولِ آخر چند برابرِ اول گران‌تر است — جمعِ کل همان عددِ بالاست، فقط توزیعش عوض می‌شود.'),
                        _numField(_tapPerDay, 'لول در روز', width: 110,
                        hint: '۰ یعنی هیچ لولی در روز بسته نمی‌شود (بازی تا فردا قفل است)، نه بی‌سقف؛ اگر خالی بماند پیش‌فرض ۲ است و بیش از ۵۰ به ۵۰ می‌چسبد.'),
                      ],
                    ),
                    const Text(
                      'جمعِ امتیاز دقیقاً بینِ لول‌ها پخش می‌شود. تغییرِ منحنی پیشرفتِ کسی را پاک نمی‌کند؛ '
                      'بازیکنانِ تمام‌کرده تا ریستِ دستی آزاد نمی‌شوند (بخشِ «آمار و ریست» پایین).',
                      style: TextStyle(fontSize: 11.5, color: Colors.white60),
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
                      for (final s in _stakes)
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
                    _numField(_winPts, 'امتیاز برد',
                    hint: 'در دفترِ امتیاز با همین عدد ثبت می‌شود؛ بردِ بدونِ امتیاز (۰) فقط در کارنامهٔ بازیکن دیده می‌شود.'),
                    _numField(_losePts, 'امتیاز باخت',
                    hint: 'منفی فقط کسر می‌کند و موجودی تا صفر پایین می‌آید (زیرِ صفر نمی‌رود)؛ کسرِ امتیاز هیچ‌وقت با سقفِ روزانه متوقف نمی‌شود.'),
                    _numField(_drawPts, 'امتیاز مساوی',
                    hint: 'می‌تواند منفی باشد؛ سرور آن را بین ۱۰۰۰- تا ۱۰۰۰+ نگه می‌دارد.'),
                    _numField(_capPts, 'سقف روزانه',
                    hint: '۰ یعنی بی‌سقف (خاموش)، نه «هیچ امتیازی نده»؛ فقط جایزه‌هایِ مثبت را می‌بندد و کسرِ امتیازِ باخت همیشه انجام می‌شود.'),
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
          // ── آمار و ریستِ بازی ضربه‌زن (دورِ ۳۳) ──
          _TapStatsSection(api: widget.api),
          _TapPrizesSection(api: widget.api),
          Gaps.vMd,
        ],
      ),
    );
  }
}

/// آمارِ «چه کسانی بازی را تمام کردند» + ریستِ تک‌کاربر یا کلِ بازی.
///
/// خواستهٔ مالک: «ادمین بتونه کامل بازی ضربه‌زن رو مدیریت کنه و درصورت
/// نیاز رست بده و آمار لولِ آخر شدن کاربرها رو داشته باشه». ریستِ
/// تک‌کاربر فقط همان یک نفر را به لول ۱ برمی‌گرداند؛ «ریستِ کل» برای
/// فصلِ تازه است و همهٔ پیشرفت‌ها را پاک می‌کند.
class _TapStatsSection extends StatefulWidget {
  const _TapStatsSection({required this.api});

  final ApiClient api;

  @override
  State<_TapStatsSection> createState() => _TapStatsSectionState();
}

class _TapStatsSectionState extends State<_TapStatsSection> {
  Map<String, dynamic>? _stats;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }


  Future<void> _load() async {
    try {
      final res = await widget.api.get('/api/admin/tap/stats');
      if (!mounted || res is! Map) return;
      setState(() {
        _stats = Map<String, dynamic>.from(res);
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _resetOne(Map u) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('ریست پیشرفت ضربه‌زن'),
        content: Text(
            'پیشرفتِ «${u['nickname']}» پاک شود؟ از لول ۱ شروع می‌کند.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('ریست')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final d = await widget.api
          .post('/api/admin/tap/reset', {'userId': u['userId']}) as Map;
      _toast('${d['message'] ?? 'ریست شد'}');
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resetAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('ریست کل بازی ضربه‌زن'),
        content: const Text(
            'پیشرفتِ «همهٔ کاربران» پاک می‌شود. برای شروعِ فصلِ تازه است و برگشت‌پذیر نیست.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('ریست کل'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final d = await widget.api
          .post('/api/admin/tap/reset', {'all': true}) as Map;
      _toast('${d['message'] ?? 'ریست کل انجام شد'}');
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppCard(child: LoadingView());
    }
    final s = _stats;
    if (s == null) return const SizedBox.shrink();
    final finished = (s['finishedUsers'] as List?) ?? const [];
    final curve = s['curve'] is Map ? Map<String, dynamic>.from(s['curve'] as Map) : const <String, dynamic>{};

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('بازی ضربه‌زن — آمار و ریست',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded, size: 20),
                tooltip: 'به‌روزرسانی',
              ),
            ],
          ),
          Gaps.vXs,
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _statChip('بازیکن', '${s['players'] ?? 0}'),
              _statChip('تمام‌کرده', '${s['finished'] ?? 0}',
                  color: const Color(0xFFFFD166)),
              _statChip('روی لولِ آخر', '${s['atFinalLevel'] ?? 0}'),
              _statChip(
                  'سکهٔ داده‌شده', '${s['totalCoinsAwarded'] ?? 0}',
                  color: const Color(0xFFFFD166)),
              if (curve.isNotEmpty)
                _statChip('منحنی', '${curve['levelCount']} لول · ${curve['levelsPerDay']}/روز'),
            ],
          ),
          Gaps.vSm,
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'بازیکنانی که بازی را تمام کرده‌اند (${finished.length})',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                ),
              ),
              TextButton.icon(
                onPressed: _busy ? null : _resetAll,
                icon: const Icon(Icons.restart_alt_rounded, size: 17),
                label: const Text('ریست کل'),
                style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              ),
            ],
          ),
          if (finished.isEmpty)
            const Text('هنوز کسی بازی را تمام نکرده است.',
                style: TextStyle(fontSize: 12, color: Colors.white60))
          else
            for (final u in finished)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: const Icon(Icons.emoji_events_rounded,
                    color: Color(0xFFFFD166), size: 22),
                title: Text('${u['nickname']}',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                subtitle: Text(
                  '${u['pointsAwarded'] ?? 0} امتیاز · ${u['coinsAwarded'] ?? 0} سکه',
                  style: const TextStyle(fontSize: 11.5),
                ),
                trailing: TextButton(
                  onPressed: _busy ? null : () => _resetOne(Map<String, dynamic>.from(u)),
                  child: const Text('ریست'),
                ),
              ),
        ],
      ),
    );
  }

  Widget _statChip(String label, String value, {Color? color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: (color ?? Colors.white).withValues(alpha: 0.08),
        border: Border.all(
            color: (color ?? Colors.white).withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Text(value,
              style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: color ?? Colors.white)),
          Text(label, style: const TextStyle(fontSize: 10.5, color: Colors.white60)),
        ],
      ),
    );
  }
}

/// «نفرات برتر ضربه‌زن — اهدای جایزه» — آینهٔ TapPrizesCard در پنلِ وب.
/// ادمین ۱۰ نفرِ برتر را می‌بیند و برای هر کدام جایزهٔ نقدی (کیف پول) یا
/// فروشگاهی (آیتم شاپ) با دلیلِ ثبت‌شده در دفترِ کل می‌فرستد.
class _TapPrizesSection extends StatefulWidget {
  const _TapPrizesSection({required this.api});

  final ApiClient api;

  @override
  State<_TapPrizesSection> createState() => _TapPrizesSectionState();
}

class _TapPrizesSectionState extends State<_TapPrizesSection> {
  List<Map<String, dynamic>> _board = const [];
  List<Map<String, dynamic>> _shopItems = const [];
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }


  Future<void> _load() async {
    try {
      final b = await widget.api.get('/api/admin/tap/leaderboard?limit=10');
      final entries = ((b['entries'] as List?) ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      final shop = await widget.api.get('/api/admin/shop');
      final items = ((shop['items'] as List?) ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .where((e) => e['slug'] != null)
          .toList();
      if (!mounted) return;
      setState(() {
        _board = entries;
        _shopItems = items;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// فرمِ اعطا: نقدی = adjust کیف پول، فروشگاهی = grant-item.
  Future<void> _award(Map<String, dynamic> u, String type) async {
    final amountCtrl = TextEditingController(
        text: type == 'cash' ? '10000' : '');
    final reasonCtrl = TextEditingController(
        text: type == 'cash' ? 'جایزهٔ نفرات برتر ضربه‌زن' : 'جایزهٔ فروشگاهی ضربه‌زن');
    String? itemSlug;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: Text('${type == 'cash' ? 'جایزهٔ نقدی' : 'جایزهٔ فروشگاهی'} برای «${u['nickname']}»'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (type == 'cash')
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'مبلغ (تومان)'),
                )
              else
                DropdownButtonFormField<String>(
                  initialValue: itemSlug,
                  decoration: const InputDecoration(labelText: 'آیتم فروشگاه'),
                  items: [
                    for (final it in _shopItems)
                      DropdownMenuItem(
                        value: '${it['slug']}',
                        child: Text('${it['name']}', overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setDlg(() => itemSlug = v),
                ),
              const SizedBox(height: 10),
              TextField(
                controller: reasonCtrl,
                decoration: const InputDecoration(
                    labelText: 'دلیل (در دفترِ کل ثبت می‌شود)'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('ثبت جایزه'),
            ),
          ],
        ),
      ),
    );

    if (ok != true) return;
    final reason = reasonCtrl.text.trim();
    if (reason.length < 3) {
      _toast('ثبت دلیل (حداقل ۳ حرف) الزامی است');
      return;
    }
    setState(() => _busy = true);
    try {
      Map<String, dynamic> d;
      if (type == 'cash') {
        final n = int.tryParse(amountCtrl.text.trim()) ?? 0;
        if (n <= 0) {
          _toast('مبلغ نقدی باید عددی بزرگ‌تر از صفر باشد');
          return;
        }
        d = await widget.api.post('/api/admin/wallet/users/${u['userId']}/adjust',
            {'amount': n, 'reason': reason});
      } else {
        if (itemSlug == null || itemSlug!.isEmpty) {
          _toast('اول آیتم فروشگاه را انتخاب کن');
          return;
        }
        d = await widget.api.post('/api/admin/users/${u['userId']}/grant-item',
            {'kind': 'shop_item', 'value': 1, 'itemSlug': itemSlug, 'reason': reason});
      }
      _toast('${d['message'] ?? 'جایزه ثبت شد'}');
    } catch (e) {
      final msg = apiError(e);
      _toast(msg.isNotEmpty ? msg : 'خطا در ثبت جایزه');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('نفرات برتر ضربه‌زن — اهدای جایزه',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded, size: 20),
                tooltip: 'به‌روزرسانی',
              ),
            ],
          ),
          Gaps.vXxs,
          const Text(
            'به هر یک از ۱۰ نفرِ برتر می‌توانی جایزهٔ نقدی (کیف پول) یا فروشگاهی بدهی؛ هر اعطا با دلیل در دفترِ کل ثبت می‌شود.',
            style: TextStyle(fontSize: 11.5, color: Colors.white60),
          ),
          Gaps.vSm,
          if (_loading)
            const LoadingView()
          else if (_board.isEmpty)
            const Text('هنوز ضربه‌ای ثبت نشده است.',
                style: TextStyle(fontSize: 12, color: Colors.white60))
          else
            for (var i = 0; i < _board.length; i++)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: _rankBadge(i + 1),
                title: Text('${_board[i]['nickname']}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 13)),
                subtitle: Text(
                  '${_board[i]['totalTaps'] ?? 0} ضربه · لول ${_board[i]['level'] ?? 0}',
                  style: const TextStyle(fontSize: 11.5),
                ),
                trailing: Wrap(
                  spacing: 6,
                  children: [
                    TextButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _award(_board[i], 'cash'),
                      icon: const Icon(Icons.paid_rounded, size: 15),
                      label: const Text('نقدی'),
                    ),
                    TextButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _award(_board[i], 'shop'),
                      icon: const Icon(Icons.card_giftcard_rounded, size: 15),
                      label: const Text('فروشگاهی'),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }

  Widget _rankBadge(int rank) {
    final (bg, fg) = switch (rank) {
      1 => (const Color(0xFFF59E0B), const Color(0xFF2B1A02)),
      2 => (const Color(0xFF94A3B8), const Color(0xFF0F172A)),
      3 => (const Color(0xFFB45309), Colors.white),
      _ => (Colors.transparent, Colors.white70),
    };
    return Container(
      width: 24,
      height: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: rank > 3 ? Border.all(color: Colors.white24) : null,
      ),
      child: Text(
        '$rank',
        style: TextStyle(
            fontSize: 11, fontWeight: FontWeight.w900, color: fg),
      ),
    );
  }
}
