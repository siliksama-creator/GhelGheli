/// پنل مدیریتِ «ثبت کارت از طریق عکس» — نسخهٔ اندروید.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا صفحهٔ جدا از «کارت و کد»
/// ═══════════════════════════════════════════════════════════════════════════
///
/// آن صفحه سیستمِ «ثبت با کدِ تنها» را مدیریت می‌کند و روی پول واقعی کار
/// می‌کند. قاطی کردنشان در یک صفحه فقط باعث می‌شد مدیر کد را در بانکِ
/// اشتباه وارد کند — و آن اشتباه بی‌سروصداست: کد ثبت می‌شود، ولی هیچ
/// کاربری نمی‌تواند از آن استفاده کند.
///
/// دقیقاً همان سه بخشِ پنل وب، با همان مسیرهای API. **یک دیتابیس، یک
/// بانک کد، یک مجموعه طرح** — هر تغییری اینجا بلافاصله در پنل وب هم
/// دیده می‌شود و برعکس.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';

import '../../api_client.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';
import 'photo_cards/card_group.dart';
import 'photo_cards/grouped_card_tile.dart';
import 'photo_cards/edit_grouped_card_sheet.dart';

class AdminPhotoCards extends StatefulWidget {
  final ApiClient api;
  const AdminPhotoCards({super.key, required this.api});

  @override
  State<AdminPhotoCards> createState() => _AdminPhotoCardsState();
}

class _AdminPhotoCardsState extends State<AdminPhotoCards> {
  List<Map<String, dynamic>> _cards = [];
  Map _stats = const {};
  List _submissions = [];
  List _options = [];
  /// انتخابِ طرح برای هر پرونده: { شناسهٔ پرونده: شناسهٔ طرح }
  final Map<String, String> _picks = {};

  /// فهرست کدها + فیلترِ وضعیت. مالک خواست بتواند کدها را ویرایش و
  /// حذف کند، و برای آن اول باید ببیندشان.
  List _codeList = [];

  /// گروهِ بازشده در فهرستِ کدها. `null` یعنی همه بسته.
  String? _openGroup;

  /// ── گروه‌بندیِ کدها بر پایهٔ کارتی که به آن گره خورده‌اند ──
  ///
  /// getter ساده است و در هر رندر اجرا می‌شود، ولی `_codeList` سقفِ
  /// ۳۰۰ ردیف دارد (سرور بیشتر نمی‌دهد) پس هزینه‌اش ناچیز است. کش
  /// کردنش یعنی یک منبعِ حقیقتِ دوم که باید هم‌گام نگه داشته شود —
  /// همان چیزی که در `home_shell` باگِ کندی ساخت.
  List<MapEntry<String, List>> get _namedGroups {
    final m = <String, List>{};
    for (final c in _codeList.cast<Map>()) {
      final k = c['expected_card_type_name'];
      if (k == null) continue;
      (m['$k'] ??= []).add(c);
    }
    final out = m.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));
    return out;
  }

  /// کدهایی که مالِ هیچ کارتِ مشخصی نیستند.
  List get _freeCodes => _codeList
      .cast<Map>()
      .where((c) => c['expected_card_type_name'] == null)
      .toList();
  String _codeFilter = 'unused';

  final _quickCodeCtrl = TextEditingController();
  bool _quickToggling = false;
  Map<String, dynamic>? _quickResult;

  Future<void> _toggleQuickCode() async {
    final code = _quickCodeCtrl.text.trim();
    if (code.isEmpty) {
      _snack('کد کارت را وارد کنید');
      return;
    }
    setState(() => _quickToggling = true);
    try {
      final r = await widget.api.post('/api/admin/photo-cards/codes/toggle-by-code', {'code': code});
      final m = r is Map ? Map<String, dynamic>.from(r) : <String, dynamic>{};
      setState(() => _quickResult = m);
      _snack(m['message']?.toString() ?? 'وضعیت کد تغییر کرد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _quickToggling = false);
    }
  }

  bool _loading = true;
  String? _loadError;

  // فرم طرح
  String? _pickedImage;

  /// ── عکسِ پشتِ کارت، اختیاری ──
  ///
  /// خواستهٔ مالک: «ادمین برای هر عکس کارت ۲ تا عکس بفرسه هم‌زمان هر ۲
  /// عکس آنالیز شن». هر عکس طرحِ مستقلِ خودش می‌شود ولی هر دو به یک
  /// نوعِ کارت وصل می‌شوند، پس کاربر از هر طرف عکس بگیرد شناخته می‌شود.
  ///
  /// چرا ادغام نمی‌شوند: شباهتِ تصویریِ رو و پشت روی کارت‌های واقعی فقط
  /// ۰.۳۸ اندازه‌گیری شد — کمتر از شباهتِ دو بازیکنِ متفاوت. یک
  /// اثرانگشتِ مشترک هر دو را خراب می‌کرد.
  String? _pickedBack;
  final _name = TextEditingController();
  final _points = TextEditingController();
  final _cash = TextEditingController();
  final _attack = TextEditingController(text: '50');
  final _defense = TextEditingController(text: '50');
  final _speed = TextEditingController(text: '50');
  final _technique = TextEditingController(text: '50');
  final _goal = TextEditingController(text: '50');
  final _energy = TextEditingController(text: '100');
  String _rarity = 'normal';
  String _effect = 'none';
  // کارتِ کلکسیونی — همان قابلیتِ پنلِ وب، با همان رفتار.
  bool _collectible = false;
  bool _uploading = false;

  // فرم کد — مدیر خودش وارد می‌کند
  final _codes = TextEditingController();
  final _batch = TextEditingController();

  /// نوعِ کارتی که این دستهٔ کد رویش چاپ می‌شود. null = «نمی‌دانم».
  ///
  /// وقتی مقدار دارد، ثبتِ کاربر تقریباً همیشه خودکار تأیید می‌شود:
  /// خودِ کد مدرکِ مالکیت است و عکس فقط باید نشان دهد کارتِ فیزیکی در
  /// دست است. توضیحِ کاملِ منطق در `photoCardService.decideSubmission`.
  String? _codeType;
  bool _assigning = false;

  /// کدهای اختصاصیِ کارتی که همین حالا آپلود می‌شود — اختیاری.
  ///
  /// اگر پر باشد، کدها در **همان تراکنشِ** ساختِ طرح به آن گره
  /// می‌خورند. درخواستِ دومِ جدا یعنی احتمالِ کارتِ بدونِ کد وقتی
  /// شبکه وسطِ کار قطع شود.
  final _ownCodes = TextEditingController();

  /// (شناسهٔ نوعِ کارت، نام) — برای منویِ انتخاب.
  ///
  /// کارت‌های گروه‌بندی‌شده مستقیماً یک گزینه به‌ازای هر نوع می‌دهند.
  List<(String, String)> get _cardTypeOptions {
    final out = _cards
        .map((card) => (
              card['card_type_id']?.toString() ?? '',
              (card['card_type_name'] ?? '—').toString(),
            ))
        .where((entry) => entry.$1.isNotEmpty)
        .toList()
      ..sort((a, b) => a.$2.compareTo(b.$2));
    return out;
  }
  bool _savingCodes = false;
  Map? _report;

  /// سقفِ **هر نوبت**، نه سقفِ کل. مجموع کدها محدودیتی ندارد.
  static const int _maxBatch = 20000;

  @override
  void initState() {
    super.initState();
    // شمارندهٔ زندهٔ زیر کادر باید با تایپ به‌روز شود.
    _codes.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _points.dispose();
    _cash.dispose();
    _attack.dispose();
    _defense.dispose();
    _speed.dispose();
    _technique.dispose();
    _goal.dispose();
    _energy.dispose();
    _ownCodes.dispose();
    _codes.dispose();
    _batch.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final r = await Future.wait([
        widget.api.get('/api/admin/photo-cards/designs', fresh: true),
        widget.api.get('/api/admin/photo-cards/codes/stats', fresh: true),
        widget.api
            .get('/api/admin/photo-cards/submissions?status=pending', fresh: true),
        widget.api.get('/api/admin/photo-cards/designs/options', fresh: true),
        widget.api.get(
            '/api/admin/photo-cards/codes?status=$_codeFilter', fresh: true),
      ]);
      if (!mounted) return;
      setState(() {
        _cards = groupedPhotoCards(Map.from(r[0] as Map));
        _stats = (r[1]['stats'] as Map?) ?? const {};
        _submissions = (r[2]['submissions'] as List?) ?? const [];
        _options = (r[3]['options'] as List?) ?? const [];
        _codeList = (r[4]['codes'] as List?) ?? const [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loading = false;
      });
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  /// `back = true` یعنی انتخابگر برای پشتِ کارت است.
  Future<void> _pickImage({bool back = false}) async {
    try {
      final f = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        // عکسِ خام باید باکیفیت بماند: اثر انگشت از آن ساخته می‌شود و
        // همین تصویر در اینونتوریِ کاربران نمایش داده می‌شود.
        maxWidth: 2000,
        imageQuality: 92,
      );
      if (f == null) return;
      setState(() {
        if (back) {
          _pickedBack = f.path;
        } else {
          _pickedImage = f.path;
        }
      });
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _uploadDesign() async {
    if (_pickedImage == null) return _snack('عکس کارت را انتخاب کنید');
    if (_name.text.trim().isEmpty) return _snack('نام کارت را بنویسید');
    setState(() => _uploading = true);
    try {
      final res = await widget.api.postMultipart(
        '/api/admin/photo-cards/designs',
        filePath: _pickedImage,
        // پشت فقط وقتی فرستاده می‌شود که انتخاب شده باشد؛ سرور نبودش
        // را «کارتِ یک‌طرفه» تفسیر می‌کند نه خطا.
        extraFiles: _pickedBack != null ? {'imageBack': _pickedBack!} : const {},
        fields: {
          'name': _name.text.trim(),
          'pointValue': _points.text.trim().isEmpty ? '0' : _points.text.trim(),
          'cashAmount': _cash.text.trim().isEmpty ? '0' : _cash.text.trim(),
          'duelAttack': _attack.text.trim().isEmpty ? '50' : _attack.text.trim(),
          'duelDefense': _defense.text.trim().isEmpty ? '50' : _defense.text.trim(),
          'duelSpeed': _speed.text.trim().isEmpty ? '50' : _speed.text.trim(),
          'duelTechnique': _technique.text.trim().isEmpty ? '50' : _technique.text.trim(),
          'duelGoalChance': _goal.text.trim().isEmpty ? '50' : _goal.text.trim(),
          'duelEnergy': _energy.text.trim().isEmpty ? '100' : _energy.text.trim(),
          'duelRarity': _rarity,
          'duelEffect': _effect,
          // رشته: multipart همه‌چیز را رشته می‌فرستد. سرور با
          // collectibleInput رشته و boolean هر دو را می‌پذیرد.
          'isCollectible': _collectible ? 'true' : 'false',
          if (_ownCodes.text.trim().isNotEmpty) 'rawCodes': _ownCodes.text.trim(),
        },
      );
      final d = (res.data is Map) ? res.data as Map : const {};

      // ── چرا وضعیت دستی بررسی می‌شود ──
      // `postMultipart` عمداً `validateStatus: (_) => true` دارد تا
      // بدنهٔ خطاها (مثل ۴۰۹ «طرح تکراری») خوانده شود نه اینکه به
      // استثنا تبدیل شود و پیامِ مفیدش گم گردد.
      if (res.statusCode != null && res.statusCode! >= 400) {
        _snack('${d['message'] ?? 'ثبت نشد'}');
        return;
      }

      _snack(d['message']?.toString() ?? 'کارت ثبت شد');
      setState(() {
        _pickedImage = null;
        _pickedBack = null;
        _name.clear();
        _points.clear();
        _cash.clear();
        _attack.text = '50';
        _defense.text = '50';
        _speed.text = '50';
        _technique.text = '50';
        _goal.text = '50';
        _energy.text = '100';
        _rarity = 'normal';
        _effect = 'none';
        _collectible = false;
      });
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _saveCodes() async {
    final raw = _codes.text.trim();
    if (raw.isEmpty) return _snack('کدها را وارد کنید');
    setState(() {
      _savingCodes = true;
      _report = null;
    });
    try {
      final r = await widget.api.post('/api/admin/photo-cards/codes', {
        'rawCodes': raw,
        if (_batch.text.trim().isNotEmpty) 'batchLabel': _batch.text.trim(),
        if (_codeType != null) 'cardTypeId': _codeType,
      });
      setState(() => _report = r as Map);
      _snack(r['message']?.toString() ?? 'ثبت شد');
      if ((r['insertedCount'] ?? 0) > 0) _codes.clear();
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _savingCodes = false);
    }
  }

  /// نوعِ کارتِ انتخاب‌شده را روی کلِ یک دستهٔ ثبت‌شده اعمال می‌کند.
  ///
  /// چرا لازم است: مدیری که قبلاً کدها را بدون کارت وارد کرده بن‌بست
  /// است — کدها چاپ و توزیع شده‌اند و حذفشان ممکن نیست.
  Future<void> _assignBatchType() async {
    final label = _batch.text.trim();
    if (label.isEmpty) return _snack('اول برچسب دسته را بنویسید');
    setState(() => _assigning = true);
    try {
      final r = await widget.api
          .post('/api/admin/photo-cards/codes/assign-type', {
        'batchLabel': label,
        'cardTypeId': _codeType,
      });
      _snack(r['message']?.toString() ?? 'اعمال شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _assigning = false);
    }
  }

  /// ویرایشِ متنِ کد. فقط برای کدِ آزاد یا باطل — سرور هم همین را
  /// اجبار می‌کند، ولی دکمه‌اش را هم نشان نمی‌دهیم تا کاربر با خطای
  /// همیشگی روبه‌رو نشود.
  Future<void> _editCode(Map c) async {
    final ctrl = TextEditingController(text: '${c['code']}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('ویرایش کد'),
        content: TextField(
          controller: ctrl,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.left,
          style: const TextStyle(fontFamily: 'monospace'),
          decoration: const InputDecoration(labelText: 'کد جدید'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('ذخیره')),
        ],
      ),
    );
    ctrl.dispose();
    if (ok != true) return;
    try {
      await widget.api.patch('/api/admin/photo-cards/codes/${c['id']}',
          {'code': ctrl.text.trim()});
      _snack('کد ویرایش شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _deleteCode(Map c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('حذف ${c['code']}'),
        content: const Text('این کد برای همیشه حذف می‌شود. اگر فقط '
            'می‌خواهید موقتاً از دسترس خارج شود، «ابطال» را بزنید.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('حذف کن')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.delete('/api/admin/photo-cards/codes/${c['id']}');
      _snack('کد حذف شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _setCodeStatus(Map c, String status) async {
    try {
      if (status == 'voided') {
        await widget.api.patch(
            '/api/admin/photo-cards/codes/${c['id']}/void',
            {'reason': 'ابطال دستی'});
      } else {
        await widget.api.patch(
            '/api/admin/photo-cards/codes/${c['id']}', {'status': status});
      }
      _snack(status == 'voided' ? 'کد باطل شد' : 'کد به چرخه برگشت');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _toggleCard(Map card) async {
    try {
      await widget.api.patch(
        '/api/admin/photo-cards/card-types/${card['card_type_id']}',
        {'isActive': !(card['is_active'] == true)},
      );
      _snack(card['is_active'] == true
          ? 'کارت و همهٔ تصاویرش غیرفعال شدند'
          : 'کارت و همهٔ تصاویرش فعال شدند');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _deleteCard(Map card) async {
    final name = '${card['card_type_name'] ?? 'این کارت'}';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('حذف کارت «$name»'),
        content: const Text(
          'روی کارت، پشت کارت و کدهای هرگز مصرف‌نشده با هم حذف می‌شوند. '
          'اگر سابقهٔ کاربر یا کد مصرف‌شده وجود داشته باشد، سرور برای '
          'حفظ سابقه اجازهٔ حذف نمی‌دهد.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('انصراف'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('حذف کامل کارت'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final result = await widget.api.delete(
          '/api/admin/photo-cards/card-types/${card['card_type_id']}');
      _snack(result is Map && result['message'] != null
          ? result['message'].toString()
          : 'کارت حذف شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _decide(Map s, bool approve) async {
    final chosen = _picks['${s['id']}'];

    // ── وقتی موتور حدسی ندارد، انتخاب الزامی است ──
    // بدون آن سرور ۴۰۰ می‌دهد؛ بهتر است همین‌جا با پیام روشن‌تر
    // جلویش گرفته شود.
    if (approve && chosen == null && s['design_image'] == null) {
      return _snack('اول مشخص کنید این کد مربوط به کدام کارت است');
    }
    if (!approve) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('رد کردن این ثبت'),
          content: const Text(
              'کد آزاد می‌شود و کاربر می‌تواند دوباره با عکس بهتر تلاش کند.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('انصراف')),
            FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('رد کن')),
          ],
        ),
      );
      if (ok != true) return;
    }
    try {
      await widget.api.post(
        '/api/admin/photo-cards/submissions/${s['id']}/decide',
        {
          'approve': approve,
          'reason': approve ? '' : 'عکس با کارت مطابقت نداشت',
          if (chosen != null) 'designId': chosen,
        },
      );
      _snack(approve ? 'تأیید شد' : 'رد شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  /// شمارشِ تقریبیِ محلی، فقط برای نمایش.
  ///
  /// تفکیک و اعتبارسنجیِ واقعی سمت سرور است. اگر اینجا هم منطق را
  /// می‌نوشتم، دو جا برای واگرا شدن داشتیم و روزی یکی «۱۵۰۰۰ کد»
  /// می‌گفت و سرور ۱۴۹۸۷ ثبت می‌کرد.
  int get _typedCount => _codes.text
      .split(RegExp(r'[\n,;\t، ]+'))
      .where((s) => s.trim().isNotEmpty)
      .length;

    @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_loadError != null) {
      return ErrorBanner(message: _loadError!, onRetry: _load);
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(Gaps.md),
        children: [
          _designForm(context),
          const SizedBox(height: Gaps.md),
          _codeBank(context),
          const SizedBox(height: Gaps.md),
          _codeListSection(context),
          const SizedBox(height: Gaps.md),
          _reviewQueue(context),
          const SizedBox(height: Gaps.md),
          _cardList(context),
          const SizedBox(height: Gaps.xl),
        ],
      ),
    );
  }

  /// یک خانهٔ انتخابِ عکس با پیش‌نمایش.
  ///
  /// چرا تابعِ مشترک و نه دو بلوکِ کپی‌شده: رو و پشت باید **دقیقاً** یک
  /// ظاهر و یک رفتار داشته باشند. کپی‌پیست یعنی روزی یکی‌شان عوض
  /// می‌شود و دیگری نه — همان اشتباهی که یک بار با `releaseGuard` رخ
  /// داد و ۵۰۰ به مدیر می‌داد.
  Widget _photoSlot(BuildContext context,
      {required String label,
      required String? path,
      required VoidCallback onTap}) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Gaps.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: Gaps.xxs),
            child: Text(label,
                style: theme.textTheme.labelLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          InkWell(
            onTap: _uploading ? null : onTap,
            borderRadius: Corners.rLg,
            child: Container(
              height: 170,
              decoration: BoxDecoration(
                borderRadius: Corners.rLg,
                border: Border.all(
                    color: theme.colorScheme.outline.withValues(alpha: 0.5)),
                color: theme.colorScheme.surfaceContainerHighest
                    .withValues(alpha: 0.35),
              ),
              clipBehavior: Clip.antiAlias,
              child: path == null
                  ? Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.add_photo_alternate_rounded,
                            size: 32, color: theme.colorScheme.primary),
                        const SizedBox(height: Gaps.xs),
                        Text('انتخاب عکس', style: theme.textTheme.titleSmall),
                        Text('هرچه باکیفیت‌تر، بهتر',
                            style: theme.textTheme.bodySmall),
                      ],
                    )
                  : Image.file(
                      File(path),
                      fit: BoxFit.contain,
                      width: double.infinity,
                      // اگر فایل بین انتخاب و رندر پاک شود (مثلاً کاربر
                      // از گالری حذفش کند) نباید کل صفحه با استثنا
                      // بشکند.
                      errorBuilder: (_, __, ___) => const Center(
                          child: Icon(Icons.broken_image_outlined, size: 30)),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _duelStatField(String label, TextEditingController c) => TextField(
        controller: c,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(labelText: label, hintText: '0 تا 100'),
      );

  // ── ۱. آپلود عکس خام ──
  Widget _designForm(BuildContext context) {
    final theme = Theme.of(context);
    return FormSection(
      title: 'تعریف کارت (رو و پشت)',
      subtitle: 'عکس باکیفیت هر دو طرفِ کارت را بگذارید. سیستم برای هر '
          'کدام اثر انگشت جدا می‌سازد و هر دو به همین کارت وصل می‌شوند.',
      children: [
        // ══════════════════════════════════════════════════════════════
        // دو انتخابگر: روی کارت و پشتِ کارت
        // ══════════════════════════════════════════════════════════════
        //
        // پشت اختیاری است — کارت‌هایی که فقط یک طرفشان طرح دارد هم باید
        // ثبت شوند. ولی اگر پشت هم طرح دارد و آپلود نشود، کاربری که از
        // پشت عکس بگیرد شناخته نمی‌شود؛ راهنمای زیرِ کادرها همین را
        // صریح می‌گوید.
        _photoSlot(context, label: 'روی کارت', path: _pickedImage,
            onTap: () => _pickImage()),
        _photoSlot(context, label: 'پشت کارت (اختیاری)', path: _pickedBack,
            onTap: () => _pickImage(back: true)),
        Text(
          _pickedBack != null
              ? ' هر دو عکس آنالیز می‌شوند — کاربر از هر طرف عکس بگیرد '
                  'شناخته می‌شود.'
              : 'ℹ اگر پشتِ کارت هم طرح دارد اضافه‌اش کنید، وگرنه کاربری '
                  'که از پشت عکس بگیرد شناخته نمی‌شود.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: _pickedBack != null
                ? BrandColors.successOnLight
                : theme.colorScheme.onSurfaceVariant,
          ),
        ),
        TextField(
          controller: _name,
          decoration: const InputDecoration(
              labelText: 'نام کارت', hintText: 'مثلاً: امباپه — فرانسه'),
        ),
        TextField(
          controller: _points,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
              labelText: 'امتیاز این کارت', hintText: 'مثلاً 3000'),
        ),
        TextField(
          controller: _cash,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
              labelText: 'جایزهٔ نقدی (تومان، اختیاری)', hintText: '0'),
        ),
        const SizedBox(height: 10),
        // ── نوعِ کارت: بازی یا کلکسیونی ──
        //
        // بالای بخشِ استاتس، چون تیک خوردنش آن بخش را کاملاً حذف می‌کند.
        // اگر پایین‌تر بود، مدیر اول شش عدد را پر می‌کرد و بعد می‌فهمید
        // هیچ‌کدام اثری ندارند.
        DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: _collectible ? const Color(0x88F59E0B) : const Color(0x22FFFFFF),
            ),
            color: _collectible ? const Color(0x14F59E0B) : Colors.transparent,
          ),
          child: CheckboxListTile(
            value: _collectible,
            onChanged: (v) => setState(() => _collectible = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFFF59E0B),
            title: const Text('کارت کلکسیونی است (برای بازی نیست)',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
            subtitle: Text(
              _collectible
                  ? 'فقط جمع‌آوری: در اینونتوری و جوایز دیده می‌شود، ولی در آرنای دوئل قابل انتخاب نیست.'
                  : 'کارت بازی: در آرنای دوئل قابل استفاده است و استاتس می‌خواهد.',
              style: const TextStyle(fontSize: 11, height: 1.6),
            ),
          ),
        ),
        if (!_collectible) ...[
        const SizedBox(height: 10),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          initiallyExpanded: true,
          leading: const Icon(Icons.sports_esports_rounded),
          title: const Text('استات دوئل کارت'),
          subtitle: const Text('این اعداد در نبرد زندهٔ پنج‌کارتی اثر مستقیم دارند'),
          children: [
            Row(children: [
              Expanded(child: _duelStatField('حمله', _attack)),
              Gaps.hXs,
              Expanded(child: _duelStatField('دفاع', _defense)),
            ]),
            Row(children: [
              Expanded(child: _duelStatField('سرعت', _speed)),
              Gaps.hXs,
              Expanded(child: _duelStatField('تکنیک', _technique)),
            ]),
            Row(children: [
              Expanded(child: _duelStatField('شانس گل', _goal)),
              Gaps.hXs,
              Expanded(child: _duelStatField('انرژی', _energy)),
            ]),
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _rarity,
                  decoration: const InputDecoration(labelText: 'کلاس کارت'),
                  items: const [
                    DropdownMenuItem(value: 'normal', child: Text('معمولی')),
                    DropdownMenuItem(value: 'silver', child: Text('نقره‌ای')),
                    DropdownMenuItem(value: 'gold', child: Text('طلایی')),
                    DropdownMenuItem(value: 'premium', child: Text('پرمیوم')),
                    DropdownMenuItem(value: 'legend', child: Text('لجند')),
                  ],
                  onChanged: (v) => setState(() => _rarity = v ?? 'normal'),
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _effect,
                  decoration: const InputDecoration(labelText: 'افکت خاص'),
                  items: const [
                    DropdownMenuItem(value: 'none', child: Text('بدون افکت')),
                    DropdownMenuItem(value: 'finisher', child: Text('فینیشر')),
                    DropdownMenuItem(value: 'wall', child: Text('دیوار دفاعی')),
                    DropdownMenuItem(value: 'speedster', child: Text('سرعتی')),
                    DropdownMenuItem(value: 'playmaker', child: Text('بازی‌ساز')),
                    DropdownMenuItem(value: 'lucky_star', child: Text('ستاره خوش‌شانس')),
                  ],
                  onChanged: (v) => setState(() => _effect = v ?? 'none'),
                ),
              ),
            ]),
          ],
        ),
        ],
        const SizedBox(height: 10),
        // ── کدهای اختصاصیِ همین کارت ──
        //
        // تفاوتِ دو حالت اینجاست: با کد، ثبتِ کاربر با شباهتِ ۲۰٪ هم
        // خودکار تأیید می‌شود. بدونِ کد، تشخیص کاملاً از روی عکس است
        // و آستانه ۴۰٪.
        TextField(
          controller: _ownCodes,
          maxLines: 4,
          textDirection: TextDirection.ltr,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'کدهای اختصاصی این کارت (اختیاری — هر خط یک کد)',
            hintText: 'GHP-A2B3-C4D5\nGHP-X7K9-M1N2\n…',
            alignLabelWithHint: true,
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: Text(
            _ownCodes.text.trim().isNotEmpty
                ? ' این کدها به همین کارت گره می‌خورند — ثبتِ کاربر با '
                    'شباهت ۲۰٪ هم خودکار تأیید می‌شود.'
                : 'ℹ بدون کد اختصاصی، تشخیص از روی عکس است (آستانهٔ ۴۰٪).',
            style: theme.textTheme.bodySmall,
          ),
        ),
        FilledButton.icon(
          onPressed: _uploading ? null : _uploadDesign,
          icon: _uploading
              ? const SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.cloud_upload_rounded),
          label: Text(_uploading ? 'در حال تحلیل تصویر…' : 'آپلود و ساخت اثر انگشت'),
        ),
      ],
    );
  }

  // ── ۲. بانک کد ──
  Widget _codeBank(BuildContext context) {
    final theme = Theme.of(context);
    return FormSection(
      title: 'بانک کد مشترک',
      subtitle: 'کدهای چاپ‌شده روی کارت‌ها را وارد کنید. این بانک بین همهٔ '
          'طرح‌ها مشترک است — طرح جدید که اضافه شود، همین کدها پوششش می‌دهند.',
      children: [
        Row(
          children: [
            _statPill(context, 'کل', _stats['total'], null),
            _statPill(context, 'آزاد', _stats['unused'], BrandColors.successOnLight),
            _statPill(context, 'در بررسی', _stats['reserved'], BrandColors.warningOnLight),
            _statPill(context, 'مصرف‌شده', _stats['used'], null),
          ],
        ),
        // ── یک کادر برای هر دو حالت ──
        // «دانه‌ای» یعنی یک خط، «انبوه» یعنی چند خط. دو فرم جدا فقط مدیر
        // را مجبور می‌کرد بین دوتاشان انتخاب کند بدون سود.
        TextField(
          controller: _codes,
          maxLines: 6,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.left,
          style: const TextStyle(
              fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.5),
          decoration: const InputDecoration(
            labelText: 'کدها — هر خط یک کد (یا با کاما/فاصله جدا کنید)',
            hintText: 'GHP-A2B3-C4D5\nQL-2026-0001\n…',
            alignLabelWithHint: true,
          ),
        ),
        Text(
          _typedCount > 0
              ? '${faNum(_typedCount)} کد نوشته‌اید'
              : 'کدهایی که روی کارت‌ها چاپ شده را اینجا وارد کنید',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        // ── انتخابِ کارت: مهم‌ترین تصمیمِ این فرم ──
        //
        // پیش‌فرض عمداً «نمی‌دانم» است: انتخابِ اشتباهِ یک کارت بدتر از
        // انتخاب نکردن است، چون کاربر امتیازِ کارتِ دیگری می‌گیرد.
        DropdownButtonFormField<String?>(
          initialValue: _codeType,
          isExpanded: true,
          decoration: const InputDecoration(
              labelText: 'این کدها روی کدام کارت چاپ می‌شوند؟'),
          items: [
            const DropdownMenuItem<String?>(
                value: null, child: Text('نمی‌دانم — تشخیص از روی عکس')),
            for (final t in _cardTypeOptions)
              DropdownMenuItem<String?>(
                  value: t.$1, child: Text(t.$2, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _codeType = v),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: Text(
            _codeType != null
                ? ' ثبتِ این کدها تقریباً همیشه خودکار تأیید می‌شود — '
                    'کاربر فقط باید عکسی از کارت بفرستد، حتی با کیفیت پایین.'
                : 'ℹ بدون انتخاب کارت، تشخیص فقط از روی عکس است و '
                    'عکس‌های نامفهوم به صف بررسی شما می‌روند.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        TextField(
          controller: _batch,
          decoration: const InputDecoration(
              labelText: 'برچسب دسته (اختیاری)', hintText: 'مثلاً: چاپ مهر ۱۴۰۵'),
        ),
        // تخصیصِ گروهی روی دستهٔ موجود.
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: OutlinedButton.icon(
            onPressed: _assigning ? null : _assignBatchType,
            icon: _assigning
                ? const SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.link_rounded, size: 18),
            label: const Text('اعمال کارتِ بالا روی کلِ این دسته'),
          ),
        ),
        FilledButton.icon(
          onPressed: _savingCodes || _typedCount > _maxBatch ? null : _saveCodes,
          icon: _savingCodes
              ? const SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.vpn_key_rounded),
          label: Text(_savingCodes ? 'در حال ثبت…' : 'ثبت کدها'),
        ),
        if (_typedCount > _maxBatch)
          Text(
            'در هر نوبت حداکثر ${faNum(_maxBatch)} کد. بقیه را در نوبت بعد '
            'اضافه کنید — برای مجموع کدها سقفی نیست.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: BrandColors.dangerOnLight),
          ),
        if (_report != null) _reportView(context, _report!),
      ],
    );
  }

  Widget _reportView(BuildContext context, Map r) {
    final theme = Theme.of(context);
    final clash = (r['clashWithOldBankCount'] ?? 0) as int;
    return Container(
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: Gaps.xs,
            runSpacing: Gaps.xs,
            children: [
              _tag(context, '${faNum(r['insertedCount'] ?? 0)} ثبت شد',
                  BrandColors.successOnLight),
              if ((r['duplicateInDbCount'] ?? 0) > 0)
                _tag(context, '${faNum(r['duplicateInDbCount'])} از قبل بود',
                    BrandColors.warningOnLight),
              if ((r['duplicateInFileCount'] ?? 0) > 0)
                _tag(context,
                    '${faNum(r['duplicateInFileCount'])} تکراری در ورودی',
                    BrandColors.warningOnLight),
              if ((r['invalidCount'] ?? 0) > 0)
                _tag(context, '${faNum(r['invalidCount'])} نامعتبر',
                    BrandColors.dangerOnLight),
            ],
          ),
          // ── هشدارِ برخورد با بانکِ سیستم قدیمی ──
          // سکوت اینجا یعنی یک کارت دو بار امتیاز می‌دهد و ماه‌ها بعد
          // از روی شکایت کشف می‌شود.
          if (clash > 0) ...[
            const SizedBox(height: Gaps.xs),
            Container(
              padding: const EdgeInsets.all(Gaps.xs),
              decoration: BoxDecoration(
                borderRadius: Corners.rSm,
                color: BrandColors.warningOnLight.withValues(alpha: 0.13),
                border: Border.all(
                    color: BrandColors.warningOnLight.withValues(alpha: 0.45)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 17, color: BrandColors.warningOnLight),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${faNum(clash)} کد در سیستم «ثبت کد کارت» هم وجود دارد.',
                          style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: BrandColors.warningOnLight),
                        ),
                        Text(
                          'یعنی همان کارت یک بار با کد و یک بار با عکس قابل '
                          'ثبت است و دو بار امتیاز می‌دهد. اگر عمدی نیست، آن '
                          'کدها را از یکی از دو سیستم باطل کنید.',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _tag(BuildContext context, String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: Corners.rPill,
          color: color.withValues(alpha: 0.15),
        ),
        child: Text(text,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: color, fontWeight: FontWeight.w800)),
      );

  Widget _statPill(BuildContext context, String label, Object? v, Color? color) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: Gaps.xs),
        decoration: BoxDecoration(
          borderRadius: Corners.rMd,
          color:
              theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        ),
        child: Column(
          children: [
            Text(faNum(v ?? 0),
                style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900, color: color)),
            Text(label, style: theme.textTheme.labelSmall),
          ],
        ),
      ),
    );
  }

  // ── فهرست و مدیریتِ کدها ──
  /// خروجیِ CSV کدها برای چاپخانه — همان دکمه‌ای که پنلِ وب دارد.
  /// بایت‌های خام را می‌گیرد و مستقیم به برگهٔ اشتراک‌گذاری می‌فرستد
  /// (تلگرام/ایمیل/درایو/…)؛ برای فایل‌های متنی مسیرِ دیسک لازم نیست.
  Future<void> _exportCodesCsv() async {
    try {
      final bytes = await widget.api.downloadBytes(
          '/api/admin/photo-cards/codes/export');
      if (!mounted) return;
      if (bytes.isEmpty) {
        _snack('خروجی خالی است — کدی برای خروج وجود ندارد');
        return;
      }
      await SharePlus.instance.share(ShareParams(
        files: [
          XFile.fromData(
            bytes,
            mimeType: 'text/csv',
            name: 'photo-card-codes.csv',
          ),
        ],
        subject: 'کدهای کارت قلقلی',
        text: 'خروجی CSV کدهای کارت قلقلی',
      ));
    } catch (e) {
      if (!mounted) return;
      _snack('خروجی ناموفق بود: ${apiError(e)}');
    }
  }

  Widget _codeListSection(BuildContext context) {
    final theme = Theme.of(context);
    const filters = [
      ('unused', 'آزاد'), ('used', 'مصرف‌شده'),
      ('reserved', 'در بررسی'), ('voided', 'باطل'),
    ];
    return FormSection(
      title: 'کدهای ثبت‌شده',
      subtitle: 'ویرایش یا حذف فقط برای کدهای استفاده‌نشده ممکن است — '
          'کدِ مصرف‌شده امتیاز داده و در مجموعهٔ کاربر نشسته.',
      children: [
        // ── خروجیِ CSV برای چاپخانه — هم‌ترازِ پنلِ وب ──
        OutlinedButton.icon(
          onPressed: _exportCodesCsv,
          icon: const Icon(Icons.download_rounded, size: 17),
          label: const Text('خروجی CSV کدها برای چاپخانه'),
        ),
        Gaps.vXs,
        // ── جستجوی سریع و فعال/غیرفعال‌سازی کد ──
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: Colors.white.withValues(alpha: 0.04),
            border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.qr_code_scanner_rounded, size: 16, color: Color(0xFF38BDF8)),
                  SizedBox(width: 6),
                  Text('فعال / غیرفعال‌سازی سریع کد (از میان ۱۵٬۰۰۰+ کد)',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Directionality(
                      textDirection: TextDirection.ltr,
                      child: TextField(
                        controller: _quickCodeCtrl,
                        decoration: const InputDecoration(
                          hintText: 'GHP-A2B3-C4D5',
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _quickToggling ? null : _toggleQuickCode,
                    child: Text(_quickToggling ? '...' : 'تغییر وضعیت'),
                  ),
                ],
              ),
              if (_quickResult != null) ...[
                const SizedBox(height: 6),
                Text(
                  'کد ${_quickResult!['code']} -> ${_quickResult!['status'] == 'unused' ? 'فعال (آماده مصرف)' : 'غیرفعال (باطل)'}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: _quickResult!['status'] == 'unused' ? const Color(0xFF34D399) : const Color(0xFFFF6B6B),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final (k, label) in filters)
                Padding(
                  padding: const EdgeInsets.only(left: 6),
                  child: ChoiceChip(
                    selected: _codeFilter == k,
                    label: Text(label),
                    onSelected: (_) {
                      setState(() => _codeFilter = k);
                      _load();
                    },
                  ),
                ),
            ],
          ),
        ),
        if (_codeList.isEmpty)
          const EmptyState(
            icon: Icons.vpn_key_outlined,
            title: 'کدی در این دسته نیست',
            message: 'فیلتر را عوض کنید یا کد جدید وارد کنید.',
          ),
        // ══════════════════════════════════════════════════════════════
        // گروه‌بندی زیرِ نامِ بازیکن
        // ══════════════════════════════════════════════════════════════
        //
        // شکایتِ مالک: «برای کد هایی که ثبت شدن باید روی خود بازیکن
        // ویرایش کرد و کد هاشو دید، نباید انقدر اسکرول طولانی بشه».
        //
        // با ۱۰۰۰ کد در هر کارت، فهرستِ تخت روی موبایل عملاً بی‌نهایت
        // اسکرول بود. حالا هر بازیکن یک ردیفِ بسته است و فقط گروهِ
        // بازشده کدهایش را نشان می‌دهد.
        for (final g in _namedGroups)
          _codeGroup(context, theme,
              key: g.key, title: ' ${g.key}', list: g.value),
        // کدهای بی‌نام بخشِ جدای خودشان را دارند: جنسشان فرق می‌کند
        // (تشخیص کاملاً از روی عکس، آستانهٔ ۴۰٪ به‌جای ۲۰٪) و قاطی
        // کردنشان باعث می‌شد مدیر نفهمد کدام‌یک کدام است.
        if (_freeCodes.isNotEmpty)
          _codeGroup(context, theme,
              key: '__free__',
              title: ' بدون کارتِ مشخص — تشخیص از روی عکس',
              list: _freeCodes,
              accent: BrandColors.warningOnLight),
      ],
    );
  }

  /// یک ردیفِ کد با دکمه‌های عملیات.
  ///
  /// از بدنهٔ فهرست جدا شد تا هم گروهِ نام‌دار و هم گروهِ بی‌نام از یک
  /// کد استفاده کنند. کپی‌پیستِ ۷۳ خط بین دو جا یعنی روزی یکی عوض
  /// می‌شود و دیگری نه.
  Widget _codeRow(BuildContext context, Map c, ThemeData theme) {
    return Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.sm, vertical: Gaps.xs),
            decoration: BoxDecoration(
              borderRadius: Corners.rSm,
              color: theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.32),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // کد لاتین است؛ در ردیفِ راست‌به‌چپ باید صریح
                      // ltr شود وگرنه کاراکترهایش جابه‌جا دیده می‌شوند.
                      Text('${c['code']}',
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.w800,
                              fontSize: 13)),
                      //  = کارتی که کد **از پیش** به آن گره خورده.
                      // با `card_type_name` فرق دارد: آن نتیجهٔ تطبیقِ
                      // عکس بعد از مصرف است، این تصمیمِ مدیر پیش از
                      // توزیع. نشان تفکیکشان را در یک نگاه ممکن می‌کند.
                      if (c['expected_card_type_name'] != null
                          || c['card_type_name'] != null
                          || c['batch_label'] != null)
                        Text(
                          [
                            if (c['expected_card_type_name'] != null)
                              ' ${c['expected_card_type_name']}',
                            if (c['card_type_name'] != null)
                              '${c['card_type_name']}',
                            if (c['batch_label'] != null) '${c['batch_label']}',
                          ].join(' · '),
                          style: theme.textTheme.labelSmall,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                // دکمه‌ها بر پایهٔ وضعیت: نشان دادنِ دکمه‌ای که همیشه
                // خطا می‌دهد بدترین نوعِ رابط است.
                if (c['status'] == 'unused' || c['status'] == 'voided') ...[
                  IconButton(
                    icon: const Icon(Icons.edit_rounded, size: 19),
                    tooltip: 'ویرایش',
                    onPressed: () => _editCode(c),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_outline_rounded, size: 19),
                    tooltip: 'حذف',
                    onPressed: () => _deleteCode(c),
                  ),
                ],
                if (c['status'] == 'unused')
                  IconButton(
                    icon: const Icon(Icons.block_rounded, size: 19),
                    tooltip: 'ابطال',
                    onPressed: () => _setCodeStatus(c, 'voided'),
                  ),
                if (c['status'] == 'voided')
                  IconButton(
                    icon: const Icon(Icons.restore_rounded, size: 19),
                    tooltip: 'بازگرداندن',
                    onPressed: () => _setCodeStatus(c, 'unused'),
                  ),
              ],
            ),
    );
  }

  /// یک گروهِ تاشو از کدها.
  Widget _codeGroup(BuildContext context, ThemeData theme,
      {required String key,
      required String title,
      required List list,
      Color? accent}) {
    final open = _openGroup == key;
    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.xs),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        border: Border.all(
          color: open
              ? theme.colorScheme.primary.withValues(alpha: 0.6)
              : theme.colorScheme.outline.withValues(alpha: 0.35),
        ),
        color: theme.colorScheme.surfaceContainerHighest
            .withValues(alpha: 0.18),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _openGroup = open ? null : key),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: Gaps.sm, vertical: Gaps.sm),
              child: Row(
                children: [
                  Expanded(
                    child: Text(title,
                        style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800, color: accent)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 9, vertical: 2),
                    decoration: BoxDecoration(
                      borderRadius: Corners.rPill,
                      color: theme.colorScheme.surfaceContainerHighest,
                    ),
                    child: Text('${faNum(list.length)} کد',
                        style: theme.textTheme.labelSmall),
                  ),
                  const SizedBox(width: Gaps.xs),
                  Icon(open
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded),
                ],
              ),
            ),
          ),
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  Gaps.xs, 0, Gaps.xs, Gaps.xs),
              child: Column(
                children: [
                  for (final c in list.cast<Map>())
                    _codeRow(context, c, theme),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── ۳. صف بررسی ──
  Widget _reviewQueue(BuildContext context) {
    final theme = Theme.of(context);
    return FormSection(
      title: _submissions.isEmpty
          ? 'صف بررسی'
          : 'صف بررسی (${faNum(_submissions.length)})',
      subtitle: 'عکس‌هایی که سیستم مطمئن نبوده. تأیید یا رد شما نهایی است.',
      children: [
        if (_submissions.isEmpty)
          const EmptyState(
            icon: Icons.check_circle_outline_rounded,
            title: 'چیزی در صف نیست',
            message: 'همهٔ ثبت‌ها به‌صورت خودکار تعیین تکلیف شده‌اند.',
          ),
        for (final s in _submissions.cast<Map>()) _reviewRow(context, s, theme),
      ],
    );
  }

  Widget _reviewRow(BuildContext context, Map s, ThemeData theme) {
    final score = ((s['match_score'] ?? 0) as num).toDouble();
    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.sm),
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // دو عکس کنار هم — مقایسهٔ چشمی تنها راهی است که مدیر در چند
          // ثانیه تصمیم می‌گیرد.
          Row(
            children: [
              _shot(context, s['userImageUrl'], 'عکس کاربر'),
              const Icon(Icons.compare_arrows_rounded, size: 18),
              _shot(context, s['design_image'], 'حدس سیستم'),
              const SizedBox(width: Gaps.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${s['card_type_name'] ?? 'نامشخص'}',
                        style: theme.textTheme.titleSmall),
                    Text(
                      '${s['nickname'] ?? s['mobile'] ?? '—'} · کد ${s['code'] ?? '—'}',
                      style: theme.textTheme.bodySmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    // درصد شباهت نمایش داده می‌شود چون مدیر باید بداند
                    // سیستم چقدر مطمئن بوده، نه اینکه کورکورانه تأیید کند.
                    _tag(
                        context,
                        'شباهت ${faNum((score * 100).round())}٪',
                        score >= 0.65
                            ? BrandColors.successOnLight
                            : BrandColors.warningOnLight),
                  ],
                ),
              ),
            ],
          ),
          // ── چرا این پرونده اینجاست ──
          // تصمیم مدیر در دو حالت فرق می‌کند، پس علت باید صریح باشد نه
          // اینکه از روی درصد شباهت حدس زده شود.
          if (s['review_reason'] == 'image_unknown') ...[
            const SizedBox(height: Gaps.xs),
            Container(
              padding: const EdgeInsets.all(Gaps.xs),
              decoration: BoxDecoration(
                borderRadius: Corners.rSm,
                color: BrandColors.infoOnLight.withValues(alpha: 0.12),
                border: Border.all(
                    color: BrandColors.infoOnLight.withValues(alpha: 0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(' کد معتبر است',
                      style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: BrandColors.infoOnLight)),
                  Text(
                    'ولی عکس با هیچ کارتی تطبیق نخورد. مشخص کنید این کد '
                    'مربوط به کدام کارت است.',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: Gaps.xs),
          // انتخابِ دستیِ طرح. پیش‌فرض حدسِ موتور است تا در حالتِ
          // کم‌اطمینان مدیر مجبور به انتخاب دوباره نشود.
          DropdownButtonFormField<String>(
            initialValue: _picks['${s['id']}'],
            isExpanded: true,
            decoration: const InputDecoration(
              isDense: true,
              labelText: 'این کد مربوط به کدام کارت است؟',
            ),
            hint: Text(s['card_type_name'] != null
                ? 'پیش‌فرض: ${s['card_type_name']}'
                : '— انتخاب کارت —'),
            items: [
              for (final o in _options.cast<Map>())
                DropdownMenuItem(
                  value: '${o['id']}',
                  child: Text(
                    '${o['card_type_name']} (${faNum(o['point_value'])} امتیاز)',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() {
              if (v != null) _picks['${s['id']}'] = v;
            }),
          ),
          const SizedBox(height: Gaps.xs),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _decide(s, true),
                  icon: const Icon(Icons.check_rounded, size: 17),
                  label: const Text('تأیید'),
                ),
              ),
              const SizedBox(width: Gaps.xs),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _decide(s, false),
                  icon: const Icon(Icons.close_rounded, size: 17),
                  label: const Text('رد'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _shot(BuildContext context, Object? url, String caption) {
    return Column(
      children: [
        ClipRRect(
          borderRadius: Corners.rSm,
          child: SafeImage(
            url: url?.toString() ?? '',
            width: 54,
            height: 74,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(height: 2),
        Text(caption, style: Theme.of(context).textTheme.labelSmall),
      ],
    );
  }

  // ── ۴. فهرست کارت‌های گروه‌بندی‌شده ──
  Widget _cardList(BuildContext context) {
    return FormSection(
      title: 'کارت‌های ثبت‌شده (${faNum(_cards.length)})',
      subtitle: 'هر ردیف یک کارت است. تصاویر رو و پشت مستقل تشخیص داده '
          'می‌شوند، اما ویرایش، کد، وضعیت و حذف برای کل کارت است.',
      children: [
        if (_cards.isEmpty)
          const EmptyState(
            icon: Icons.image_outlined,
            title: 'هنوز کارتی نیست',
            message: 'اولین کارت را با عکس رو و در صورت وجود پشت ثبت کنید.',
          ),
        for (final card in _cards)
          GroupedPhotoCardTile(
            card: card,
            onEdit: () => showEditGroupedPhotoCardSheet(
              context: context,
              api: widget.api,
              card: card,
              onSaved: _load,
              showMessage: _snack,
            ),
            onToggle: () => _toggleCard(card),
            onDelete: () => _deleteCard(card),
          ),
      ],
    );
  }

}
