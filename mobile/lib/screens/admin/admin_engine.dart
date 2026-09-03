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
      {String? hint, String? helper, bool integer = false}) {
    return _NumEdit(
      label: label,
      hint: hint,
      helper: helper,
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
                        (v) => _photo['acceptScore'] = v, helper: 'اگر کارتِ شبیه‌تری پیدا نشود، امتیازِ تنها کافی نیست: رتبهٔ اول باید دست‌کم ۱۵٪ از رتبهٔ دوم بهتر باشد. بالا بردنِ این عدد، تأییدِ خودکار را کم و صفِ بررسیِ انسانی را پر می‌کند.')),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('بررسی انسانی', 'reviewScore', _photo,
                        (v) => _photo['reviewScore'] = v, helper: 'زیرِ این عدد «رد» و بینِ این تا آستانهٔ پذیرش «به صفِ بررسی». سرور اجازه نمی‌دهد این از آستانهٔ پذیرش بیشتر شود.')),
              ]),
              Row(children: [
                Expanded(
                    child: _numField('کارت‌های دفترچه‌ای', 'boundAcceptScore',
                        _photo, (v) => _photo['boundAcceptScore'] = v, helper: 'برای کارتی که کدِ چاپی‌اش خوانده شده؛ خودِ کد اثبات است، پس عکس شل‌تر سنجیده می‌شود.')),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('کارت‌های رایگان', 'freeAcceptScore', _photo,
                        (v) => _photo['freeAcceptScore'] = v, helper: 'برای کارتِ رایگانِ بی‌کد؛ اثباتی جزِ خودِ عکس نیست، پس سخت‌تر از کارتِ دفترچه‌ای گرفته می‌شود.')),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('تشخیص تکراری', 'duplicateSimilarity',
                        _photo, (v) => _photo['duplicateSimilarity'] = v, helper: 'شباهت به یک کارتِ ثبت‌شدهٔ دیگر؛ بالاتر از این یعنی «همان طرحِ قبلی است» و بارگذاری رد می‌شود.')),
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
                        (v) => _levels['base'] = v, helper: 'XPِ لازمِ لولِ اول. پایین بیاوریدید شروعِ بازی آسان‌تر می‌شود.')),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('شیب خطی', 'lin', _levels,
                        (v) => _levels['lin'] = v, helper: 'به هر لول اضافه می‌شود: لولِ n ≈ پایه × (۱ + (n−۱) × این عدد).')),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('توان نمایی', 'exp', _levels,
                        (v) => _levels['exp'] = v, helper: 'عددِ بزرگ‌تر، فاصلهٔ لول‌های اول را زیاد و لول‌های بعدی را تقریباً مساوی می‌کند.')),
              ]),
              Row(children: [
                Expanded(
                    child: _numField('زانو (لول)', 'knee', _levels,
                        (v) => _levels['knee'] = v, integer: true, helper: 'از این لول به بعد رشدِ نمایی کنار می‌رود و یک «پلهٔ» ثابت جایش می‌آید.')),
                const SizedBox(width: Gaps.sm),
                Expanded(
                    child: _numField('پلهٔ بعد از زانو', 'tail', _levels,
                        (v) => _levels['tail'] = v, helper: 'مقداری که از لولِ زانو به هر لولِ بعدی اضافه می‌شود.')),
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
          const SizedBox(height: Gaps.md),
          _OpsLimitsSection(api: widget.api),
          const SizedBox(height: Gaps.md),
          _BazaarProductsSection(api: widget.api),
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

  /// `hint` روی `hintText` می‌نشیند و در فیلدِ **پر** دیده نمی‌شود؛ این
  /// شماره‌ها همیشه از سرور مقدار دارند، پس توضیحِ «چه چیزی را لمس می‌کند»
  /// باید `helperText` باشد. پارامترِ بی‌مصرف = دروغِ رابط، نه قابلیت.
  final String? helper;
  final bool integer;
  final String value;
  final ValueChanged<String> onChanged;
  const _NumEdit(
      {required this.label,
      this.hint,
      this.helper,
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
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        helperText: widget.helper,
        helperMaxLines: 3,
      ),
    );
  }
}

/// سقف‌ها و اعدادِ عملیاتی — آینهٔ OpsLimitsCard در پنلِ وب.
/// نگهداری چت، قفل عکس‌کارت، اقتصاد معرف، نرخ پنج مسیر و انیمیشن گردونه؛
/// گاردهای امنیتی فقط نمایش داده می‌شوند.
class _OpsLimitsSection extends StatefulWidget {
  const _OpsLimitsSection({required this.api});
  final ApiClient api;

  @override
  State<_OpsLimitsSection> createState() => _OpsLimitsSectionState();
}

class _OpsLimitsSectionState extends State<_OpsLimitsSection> {
  Map<String, dynamic> _l = const {};
  bool _loading = true;
  bool _saving = false;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/settings/ops-limits');
      if (!mounted) return;
      setState(() {
        _l = Map<String, dynamic>.from(d as Map);
        _loading = false;
        _gen++;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setNum(String path, String value) {
    final parts = path.split('.');
    setState(() {
      Map<String, dynamic> node = _l;
      for (var i = 0; i < parts.length - 1; i++) {
        final cur = node[parts[i]];
        if (cur is Map) {
          node = Map<String, dynamic>.from(cur);
        } else {
          node = {};
        }
        _l[parts[i]] = node;
      }
      node[parts.last] = int.tryParse(value) ?? 0;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final d = await widget.api.patch('/api/admin/settings/ops-limits', _l);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('${d['message'] ?? 'ذخیره شد'}')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      final msg = apiError(e);
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg.isNotEmpty ? msg : 'ذخیره ناموفق بود')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  int _num(String path) {
    final parts = path.split('.');
    Map<String, dynamic> node = _l;
    for (var i = 0; i < parts.length - 1; i++) {
      final cur = node[parts[i]];
      if (cur is Map) {
        node = Map<String, dynamic>.from(cur);
      } else {
        return 0;
      }
    }
    return (node[parts.last] as num?)?.toInt() ?? 0;
  }


  Widget _stakesField(String key, String label) {
    final list = (_l[key] is List)
        ? List<dynamic>.from(_l[key] as List)
        : const <dynamic>[];
    final text = list.map((e) => '$e').join('، ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        key: ValueKey('stakes-$key-$text'),
        initialValue: text,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
          helperText: 'اعداد را با ویرگول جدا کنید؛ ۰ = رایگان/تمرین',
        ),
        onChanged: (v) {
          final nums = v
              .split(RegExp(r'[,،\s]+'))
              .map((s) => int.tryParse(s.trim()))
              .whereType<int>()
              .toList();
          _l[key] = nums;
        },
      ),
    );
  }

  static const _rlNames = {
    'chat': 'چت',
    'tapBatch': 'ضربه‌زن',
    'wheel': 'گردونه',
    'cardDuel': 'دوئل کارت',
    'withdrawal': 'برداشت کیف پول',
  };

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const LoadingView();
    }
    final rl = _l['rateLimits'] is Map
        ? Map<String, dynamic>.from(_l['rateLimits'] as Map)
        : const <String, dynamic>{};
    final sec = _l['securityRateLimits'] is Map
        ? Map<String, dynamic>.from(_l['securityRateLimits'] as Map)
        : const <String, dynamic>{};

    return FormSection(
      title: 'سقف‌ها و اعدادِ عملیاتی',
      subtitle: 'تا امروز ثابتِ کد بودند؛ ذخیره بدون ری‌استارت و بدون آپدیت اعمال می‌شود.',
      children: [
        _numField('chatKeepLimit', 'نگه‌داری پیام چت'),
        _numField('photoLockMaxFails', 'تلاش مجاز عکس‌کارت پیش از قفل'),
        _numField('wheelSpinMs', 'مدت انیمیشن گردونه (ms)'),
        _numField('wheelSpinRotations', 'دورِ کامل گردونه'),
        _numField('referralCommissionPercent', 'کمیسیون امتیازی معرف (٪)'),
        _numField('referralPurchaseCommissionPercent', 'کمیسیون نقدی معرف (٪)'),
        _numField('referralMaxInvitesForDaily', 'سقف دعوت مؤثر روزانه'),
        _numField('referralSpinsPerInvite', 'چرخش هدیه هر دعوت'),
        _numField('referralInvitesPerDailySpin', 'دعوت لازم برای چرخش اضافه'),
        _numField('referralBaseDailySpins', 'چرخش روزانهٔ پایه'),
        _numField('referralWithdrawalThreshold', 'آستانهٔ برداشت معرف (تومان)'),
        _stakesField('publicStakes', 'ورودی‌های عمومی (۰=تمرین، با ویرگول)'),
        _stakesField('lobbyStakes', 'ورودی‌های لابی/خصوصی (با ویرگول)'),
        const Text('محدودکننده‌های نرخ (پنجره/سقف)',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        for (final entry in rl.entries) ...[
          Row(children: [
            SizedBox(
              width: 110,
              child: Text(_rlNames[entry.key] ?? entry.key,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
            ),
            Expanded(
              child: _numField('rateLimits.${entry.key}.windowMs', 'پنجره (ms)'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _numField('rateLimits.${entry.key}.limit', 'سقف'),
            ),
          ]),
        ],
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.04),
            borderRadius: Corners.rMd,
            border: Border.all(color: Colors.white10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(children: [
                Icon(Icons.shield_rounded, size: 15, color: Color(0xFF7DD3FC)),
                SizedBox(width: 6),
                Text('گاردهای امنیتی — فقط نمایش',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
              ]),
              const Text(
                'سقف OTP و ورودها ضدِ brute-force‌اند و عمداً از پنل قابل ویرایش نیستند.',
                style: TextStyle(fontSize: 11, color: Colors.white60),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  for (final e in sec.entries)
                    Text('${e.key}: ${(e.value as Map)['limit']} در '
                        '${((e.value as Map)['windowMs'] as num) ~/ 60000} دقیقه',
                        style: const TextStyle(
                            fontSize: 11, color: Colors.white60)),
                ],
              ),
            ],
          ),
        ),
        FilledButton.icon(
          onPressed: _saving ? null : _save,
          icon: const Icon(Icons.save_rounded),
          label: Text(_saving ? 'در حال ذخیره…' : 'ذخیرهٔ سقف‌ها'),
        ),
      ],
    );
  }

  Widget _numField(String path, String label) {
    return TextFormField(
      key: ValueKey('ops_$path$_gen'),
      initialValue: '${_num(path)}',
      keyboardType: TextInputType.number,
      decoration: InputDecoration(labelText: label),
      onChanged: (v) => _setNum(path, v),
    );
  }
}

/// نقاط قیمتی کافه‌بازار — آینهٔ BazaarProductsCard در پنل وب.
/// فقط‌خواندنی + هشدار وقتی قیمت صندوق محصولِ متناظر ندارد.
class _BazaarProductsSection extends StatefulWidget {
  const _BazaarProductsSection({required this.api});
  final ApiClient api;

  @override
  State<_BazaarProductsSection> createState() => _BazaarProductsSectionState();
}

class _BazaarProductsSectionState extends State<_BazaarProductsSection> {
  List<Map<String, dynamic>> _prices = const [];
  List<Map<String, dynamic>> _plus = const [];
  String _apiBase = '';
  int? _boxPrice;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final c = await widget.api.get('/api/admin/bazaar-products');
      int? boxPrice;
      try {
        final b = await widget.api.get('/api/admin/card-box');
        boxPrice = (b['price'] as num?)?.toInt();
      } catch (_) {/* قیمت صندوق اختیاری است */}
      if (!mounted) return;
      setState(() {
        _prices = ((c['priceProducts'] as List?) ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _plus = ((c['plusProducts'] as List?) ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _apiBase = '${c['apiBase'] ?? ''}';
        _boxPrice = boxPrice;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const LoadingView();
    }
    final priceSet = _prices.map((e) => (e['price'] as num?)?.toInt() ?? 0).toSet();
    final boxOk = _boxPrice == null || priceSet.contains(_boxPrice);
    return FormSection(
      title: 'نقاط قیمتی کافه‌بازار — فقط خواندنی',
      subtitle: 'اگر قیمتی اینجا نباشد، خرید آن آیتم ناممکن است. درگاه: $_apiBase',
      children: [
        if (!boxOk)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFF87171).withValues(alpha: 0.1),
              borderRadius: Corners.rMd,
              border: Border.all(color: const Color(0xFFF87171).withValues(alpha: 0.4)),
            ),
            child: Text(
              'هشدار: قیمت فعلی صندوق کارت (${faNum(_boxPrice ?? 0)} تومان) در کافه‌بازار '
              'محصول ندارد — خرید صندوق رد می‌شود.',
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFFCA5A5)),
            ),
          ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final p in _prices)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFD166).withValues(alpha: 0.08),
                  borderRadius: Corners.rMd,
                  border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: 0.3)),
                ),
                child: Text('${faNum(p['price'])} → ${p['productId']}',
                    style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFFFFD166))),
              ),
          ],
        ),
        const Text('اشتراک پلاس',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final p in _plus)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFF38BDF8).withValues(alpha: 0.08),
                  borderRadius: Corners.rMd,
                  border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.3)),
                ),
                child: Text('${p['label']} → ${p['productId']}',
                    style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF7DD3FC))),
              ),
          ],
        ),
      ],
    );
  }
}
