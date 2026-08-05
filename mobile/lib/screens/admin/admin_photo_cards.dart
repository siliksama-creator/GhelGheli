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

import '../../api_client.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';

class AdminPhotoCards extends StatefulWidget {
  final ApiClient api;
  const AdminPhotoCards({super.key, required this.api});

  @override
  State<AdminPhotoCards> createState() => _AdminPhotoCardsState();
}

class _AdminPhotoCardsState extends State<AdminPhotoCards> {
  List _designs = [];
  Map _stats = const {};
  List _submissions = [];
  bool _loading = true;
  String? _loadError;

  // فرم طرح
  String? _pickedImage;
  final _name = TextEditingController();
  final _points = TextEditingController();
  final _cash = TextEditingController();
  bool _uploading = false;

  // فرم کد — مدیر خودش وارد می‌کند
  final _codes = TextEditingController();
  final _batch = TextEditingController();
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
      ]);
      if (!mounted) return;
      setState(() {
        _designs = (r[0]['designs'] as List?) ?? const [];
        _stats = (r[1]['stats'] as Map?) ?? const {};
        _submissions = (r[2]['submissions'] as List?) ?? const [];
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

  Future<void> _pickImage() async {
    try {
      final f = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        // عکسِ خام باید باکیفیت بماند: اثر انگشت از آن ساخته می‌شود و
        // همین تصویر در اینونتوریِ کاربران نمایش داده می‌شود.
        maxWidth: 2000,
        imageQuality: 92,
      );
      if (f == null) return;
      setState(() => _pickedImage = f.path);
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _uploadDesign() async {
    if (_pickedImage == null) return _snack('عکس کارت را انتخاب کنید');
    if (_name.text.trim().isEmpty) return _snack('نام کارت را بنویسید');
    setState(() => _uploading = true);
    try {
      final r = await widget.api.postMultipart(
        '/api/admin/photo-cards/designs',
        filePath: _pickedImage,
        fields: {
          'name': _name.text.trim(),
          'pointValue': _points.text.trim().isEmpty ? '0' : _points.text.trim(),
          'cashAmount': _cash.text.trim().isEmpty ? '0' : _cash.text.trim(),
        },
      );
      _snack(r['message']?.toString() ?? 'طرح ثبت شد');
      setState(() {
        _pickedImage = null;
        _name.clear();
        _points.clear();
        _cash.clear();
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

  Future<void> _toggleDesign(Map d) async {
    try {
      await widget.api.patch(
        '/api/admin/photo-cards/designs/${d['id']}',
        {'isActive': !(d['is_active'] == true)},
      );
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _decide(Map s, bool approve) async {
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
        {'approve': approve, 'reason': approve ? '' : 'عکس با کارت مطابقت نداشت'},
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
          _reviewQueue(context),
          const SizedBox(height: Gaps.md),
          _designList(context),
          const SizedBox(height: Gaps.xl),
        ],
      ),
    );
  }

  // ── ۱. آپلود عکس خام ──
  Widget _designForm(BuildContext context) {
    final theme = Theme.of(context);
    return FormSection(
      title: 'آپلود عکس خام کارت',
      subtitle: 'عکس باکیفیت کارت را بگذارید. سیستم اثر انگشت تصویر را '
          'می‌سازد تا بعداً عکسِ کاربر را با آن تطبیق دهد.',
      children: [
        InkWell(
          onTap: _uploading ? null : _pickImage,
          borderRadius: Corners.rLg,
          child: Container(
            height: 190,
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              border: Border.all(
                  color: theme.colorScheme.outline.withValues(alpha: 0.5)),
              color: theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.35),
            ),
            clipBehavior: Clip.antiAlias,
            child: _pickedImage == null
                ? Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_photo_alternate_rounded,
                          size: 34, color: theme.colorScheme.primary),
                      const SizedBox(height: Gaps.xs),
                      Text('انتخاب عکس', style: theme.textTheme.titleSmall),
                      Text('هرچه باکیفیت‌تر، بهتر',
                          style: theme.textTheme.bodySmall),
                    ],
                  )
                : Image.file(
                    File(_pickedImage!),
                    fit: BoxFit.contain,
                    width: double.infinity,
                    // اگر فایل بین انتخاب و رندر پاک شود (مثلاً کاربر از
                    // گالری حذفش کند) نباید کل صفحه با استثنا بشکند.
                    errorBuilder: (_, __, ___) => const Center(
                        child: Icon(Icons.broken_image_outlined, size: 30)),
                  ),
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
        TextField(
          controller: _batch,
          decoration: const InputDecoration(
              labelText: 'برچسب دسته (اختیاری)', hintText: 'مثلاً: چاپ مهر ۱۴۰۵'),
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

  // ── ۴. فهرست طرح‌ها ──
  Widget _designList(BuildContext context) {
    final theme = Theme.of(context);
    return FormSection(
      title: 'طرح‌های ثبت‌شده',
      subtitle: 'کارت غیرفعال دیگر با عکس کاربران تطبیق داده نمی‌شود.',
      children: [
        if (_designs.isEmpty)
          const EmptyState(
            icon: Icons.image_outlined,
            title: 'هنوز طرحی نیست',
            message: 'اولین عکس خام را از بالا آپلود کنید.',
          ),
        for (final d in _designs.cast<Map>())
          Container(
            margin: const EdgeInsets.only(bottom: Gaps.xs),
            padding: const EdgeInsets.all(Gaps.xs),
            decoration: BoxDecoration(
              borderRadius: Corners.rMd,
              color:
                  theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
            ),
            child: Opacity(
              // غیرفعال کم‌رنگ می‌شود ولی نه آن‌قدر که خوانده نشود.
              opacity: d['is_active'] == true ? 1 : 0.55,
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: Corners.rSm,
                    child: SafeImage(
                        url: '${d['image_url'] ?? ''}',
                        width: 46,
                        height: 62,
                        fit: BoxFit.cover),
                  ),
                  const SizedBox(width: Gaps.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${d['card_type_name'] ?? '—'}',
                            style: theme.textTheme.titleSmall),
                        Text('${faNum(d['point_value'] ?? 0)} امتیاز',
                            style: theme.textTheme.bodySmall),
                        Text('${faNum(d['redeemed_count'] ?? 0)} بار ثبت شده',
                            style: theme.textTheme.labelSmall),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () => _toggleDesign(d),
                    child:
                        Text(d['is_active'] == true ? 'غیرفعال' : 'فعال کن'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
