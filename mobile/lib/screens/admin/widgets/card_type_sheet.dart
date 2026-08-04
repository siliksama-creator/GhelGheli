import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../api_client.dart';
import '../../../core/money.dart';
import '../../../theme/colors.dart';
import '../../../theme/brand_theme.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/safe_image.dart';
import 'image_url_field.dart';

/// ---------------------------------------------------------------------------
///  مدیریت یکپارچهٔ یک نوع کارت
/// ---------------------------------------------------------------------------
///
/// قبلاً ویرایش کارت و افزودن کد دو جای کاملاً جدا بودند: مدیر کارت را در
/// یک دیالوگ ویرایش می‌کرد، بعد باید پایین صفحه می‌رفت، از یک کشویی همان
/// کارت را دوباره پیدا می‌کرد و کدها را آنجا می‌چسباند. با ده‌ها کارت،
/// انتخاب اشتباه از آن کشویی یعنی هزار کد به کارت غلط می‌خورد.
///
/// حالا هر دو در یک شیت‌اند و کارتِ مقصد در تیتر نوشته شده، پس هیچ‌وقت
/// ابهامی نیست که کدها به کدام کارت اضافه می‌شوند.
class CardTypeSheet extends StatefulWidget {
  final ApiClient api;
  final Map cardType;

  const CardTypeSheet({super.key, required this.api, required this.cardType});

  /// `true` برمی‌گرداند اگر چیزی تغییر کرده باشد (تا صفحه دوباره بارگذاری شود).
  static Future<bool?> show(BuildContext context, ApiClient api, Map cardType) =>
      showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: CardTypeSheet(api: api, cardType: cardType),
        ),
      );

  @override
  State<CardTypeSheet> createState() => _CardTypeSheetState();
}

class _CardTypeSheetState extends State<CardTypeSheet>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  late final _name = TextEditingController(text: '${widget.cardType['name'] ?? ''}');
  late final _points =
      TextEditingController(text: '${widget.cardType['point_value'] ?? 0}');
  late final _cash =
      TextEditingController(text: '${widget.cardType['cash_amount'] ?? 0}');
  late final _desc =
      TextEditingController(text: '${widget.cardType['description'] ?? ''}');
  late final _image =
      TextEditingController(text: '${widget.cardType['image_url'] ?? ''}');
  final _codes = TextEditingController();

  bool _uploading = false;
  String? _imageError;
  bool _savingDetails = false;
  bool _savingCodes = false;
  Map? _report;
  bool _changed = false;

  /// سقف **هر بار ثبت**، نه سقف کل کارت.
  ///
  /// هیچ محدودیتی برای مجموع کدهای یک کارت وجود ندارد: مدیر می‌تواند این
  /// کار را هر چند بار که خواست تکرار کند و کارت به هزاران کد برسد. این
  /// عدد فقط اندازهٔ یک درخواست را محدود می‌کند تا یک چسباندن اشتباهی
  /// تراکنش را دقیقه‌ها باز نگه ندارد. (روی سرور آزموده شد: سه بار ۱۰۰۰
  /// تایی روی یک کارت = ۳۰۰۰ کد، هر بار ~۰.۵ ثانیه.)
  static const int bulkLimit = 1000;

  @override
  void initState() {
    super.initState();
    _codes.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabs.dispose();
    _name.dispose();
    _points.dispose();
    _cash.dispose();
    _desc.dispose();
    _image.dispose();
    _codes.dispose();
    super.dispose();
  }

  /// کدهای واردشده را همان‌طور که سرور می‌شمارد می‌شمارد.
  List<String> get _parsedCodes => _codes.text
      .split(RegExp(r'[\n,;\t ]+'))
      .map((c) => c.trim().toUpperCase())
      .where((c) => c.isNotEmpty)
      .toList();

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _pickImage() async {
    final x = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 82);
    // The gallery is a separate activity and can stay open for minutes; on a
    // low-memory device Android may destroy this one behind it. Checking
    // `x == null` is not enough — the widget itself may be gone.
    if (x == null || !mounted) return;
    setState(() {
      _uploading = true;
      _imageError = null;
    });
    try {
      final url = await widget.api.uploadAdminImage(x.path);
      if (mounted) setState(() => _image.text = url);
    } catch (e) {
      if (mounted) setState(() => _imageError = apiError(e));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _saveDetails() async {
    // آپلود عکس در پس‌زمینه اجرا می‌شود؛ ذخیرهٔ زودهنگام یعنی کارت با عکس
    // قبلی ذخیره شود در حالی که مدیر فکر می‌کند عکس جدید نشسته است.
    if (_uploading) {
      _toast('لطفاً تا پایان آپلود عکس صبر کنید');
      return;
    }
    final name = _name.text.trim();
    if (name.isEmpty) {
      _toast('نام کارت نمی‌تواند خالی باشد');
      return;
    }
    setState(() => _savingDetails = true);
    try {
      final body = <String, dynamic>{
        'name': name,
        'pointValue': int.tryParse(_points.text.trim()) ?? 0,
        'cashAmount': Money.parse(_cash.text) ?? 0,
        'description': _desc.text.trim(),
      };
      // فقط وقتی عکس هست بفرست. رشتهٔ خالی به سرور می‌گفت عکس فعلی را پاک
      // کن — دقیقاً همان‌طور که کارت‌ها تصویرشان را از دست می‌دادند.
      final img = _image.text.trim();
      if (img.isNotEmpty) body['imageUrl'] = img;

      await widget.api.patch('/api/admin/card-types/${widget.cardType['id']}', body);
      _changed = true;
      _toast('اطلاعات کارت ذخیره شد');
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _savingDetails = false);
    }
  }

  Future<void> _submitCodes() async {
    final codes = _parsedCodes;
    if (codes.isEmpty) {
      _toast('هیچ کدی وارد نشده است');
      return;
    }
    if (codes.length > bulkLimit) {
      _toast('هر بار حداکثر ${faNum(bulkLimit)} کد؛ ${faNum(codes.length)} کد وارد کرده‌اید. '
          'بقیه را در نوبت بعد اضافه کنید — سقفی برای مجموع کدهای کارت نیست.');
      return;
    }

    // تأیید صریح با نام کارت مقصد. ثبت هزار کد روی کارت اشتباه برگشت‌پذیر
    // نیست (کدها حذف نمی‌شوند، فقط باطل می‌شوند)، پس ارزش یک گام تأیید را دارد.
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('تأیید ثبت کدها'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${faNum(codes.length)} کد به کارت زیر اضافه می‌شود:',
                style: Theme.of(context).textTheme.bodyMedium),
            Gaps.vXs,
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                color: BrandColors.emerald.withValues(alpha: 0.12),
                borderRadius: Corners.rSm,
              ),
              child: Text(
                '${widget.cardType['name']}',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            Gaps.vXs,
            Text('کدهای تکراری یا نامعتبر نادیده گرفته می‌شوند.',
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true), child: const Text('ثبت کدها')),
        ],
      ),
    );
    if (confirmed != true) return;

    // بعد از `await showDialog` هیچ تضمینی نیست که شیت هنوز روی صفحه
    // باشد؛ بقیهٔ setStateهای همین تابع نگهبان دارند و این یکی جا
    // افتاده بود.
    if (!mounted) return;
    setState(() {
      _savingCodes = true;
      _report = null;
    });
    try {
      final r = await widget.api.post('/api/admin/card-codes/bulk', {
        'cardTypeId': widget.cardType['id'],
        'rawCodes': _codes.text,
      });
      _changed = true;
      if (mounted) {
        setState(() {
          _report = Map<String, dynamic>.from(r);
          if ((r['insertedCount'] ?? 0) > 0) _codes.clear();
        });
      }
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _savingCodes = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = widget.cardType;
    final count = _parsedCodes.length;
    final tooMany = count > bulkLimit;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, 0, Gaps.lg, Gaps.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── سرصفحه: کارتی که در حال ویرایش است ──
            Row(
              children: [
                if ('${t['image_url'] ?? ''}'.isNotEmpty)
                  ClipRRect(
                    borderRadius: Corners.rSm,
                    child: SafeImage(
                        url: t['image_url'],
                        width: 44,
                        height: 44,
                        fallbackEmoji: '🃏'),
                  )
                else
                  const Icon(Icons.credit_card_rounded, size: 34),
                Gaps.hSm,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${t['name']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800)),
                      Text(
                        '${faNum(t['code_count'] ?? 0)} کد · '
                        '${faNum(t['unused_count'] ?? 0)} مصرف‌نشده · '
                        '${faNum(t['used_count'] ?? 0)} مصرف‌شده',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Gaps.vSm,
            TabBar(
              controller: _tabs,
              tabs: const [
                Tab(text: 'ویرایش کارت'),
                Tab(text: 'افزودن کد'),
              ],
            ),
            Gaps.vSm,
            SizedBox(
              height: 380,
              child: TabBarView(
                controller: _tabs,
                children: [
                  // ───────────── ویرایش ─────────────
                  SingleChildScrollView(
                    child: Column(
                      children: [
                        TextField(
                          controller: _name,
                          decoration: const InputDecoration(labelText: 'نام کارت'),
                        ),
                        Gaps.vSm,
                        TextField(
                          controller: _points,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'امتیاز'),
                        ),
                        Gaps.vSm,
                        TextField(
                          controller: _cash,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            labelText: 'جایزهٔ نقدی (تومان)',
                            helperText: (Money.parse(_cash.text) ?? 0) > 0
                                ? 'با ثبت این کارت، ${Money.withUnit(Money.parse(_cash.text))} به کیف پول کاربر اضافه می‌شود'
                                : 'صفر = بدون جایزهٔ نقدی',
                            helperStyle: TextStyle(
                                color: (Money.parse(_cash.text) ?? 0) > 0
                                    ? BrandColors.emerald
                                    : null),
                          ),
                        ),
                        Gaps.vSm,
                        ImageUrlField(
                          controller: _image,
                          label: 'عکس کارت',
                          uploading: _uploading,
                          error: _imageError,
                          onPick: _pickImage,
                        ),
                        Gaps.vSm,
                        TextField(
                          controller: _desc,
                          decoration: const InputDecoration(labelText: 'توضیحات'),
                        ),
                        Gaps.vMd,
                        SizedBox(
                          width: double.infinity,
                          height: TouchTarget.comfortable,
                          child: FilledButton.icon(
                            onPressed: _savingDetails ? null : _saveDetails,
                            icon: _savingDetails
                                ? const _Spin()
                                : const Icon(Icons.save_rounded),
                            label: const Text('ذخیرهٔ تغییرات'),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // ───────────── افزودن کد ─────────────
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(Gaps.sm),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainerHighest,
                            borderRadius: Corners.rSm,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.info_outline_rounded, size: 16),
                              Gaps.hXs,
                              Expanded(
                                child: Text(
                                  'کدها به «${t['name']}» اضافه می‌شوند. هر خط یک کد، یا جدا با کاما. '
                              'هر نوبت تا ${faNum(bulkLimit)} کد؛ می‌توانید بارها تکرار کنید.',
                                  style: theme.textTheme.bodySmall,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Gaps.vSm,
                        TextField(
                          controller: _codes,
                          textCapitalization: TextCapitalization.characters,
                          minLines: 6,
                          maxLines: 10,
                          decoration: InputDecoration(
                            labelText: 'کدها',
                            hintText: 'GHEL-0001\nGHEL-0002\n...',
                            errorText: tooMany
                                ? 'هر بار حداکثر ${faNum(bulkLimit)} کد — می‌توانید چند نوبت اضافه کنید'
                                : null,
                            counterText: count == 0
                                ? 'هر بار تا ${faNum(bulkLimit)} کد · بدون سقف برای مجموع'
                                : '${faNum(count)} کد در این نوبت (حداکثر ${faNum(bulkLimit)})',
                            counterStyle: TextStyle(
                              color: tooMany
                                  ? theme.colorScheme.error
                                  : theme.colorScheme.onSurfaceVariant,
                              fontWeight:
                                  tooMany ? FontWeight.w700 : FontWeight.normal,
                            ),
                          ),
                        ),
                        Gaps.vSm,
                        SizedBox(
                          height: TouchTarget.comfortable,
                          child: FilledButton.icon(
                            onPressed:
                                (_savingCodes || tooMany || count == 0)
                                    ? null
                                    : _submitCodes,
                            icon: _savingCodes
                                ? const _Spin()
                                : const Icon(Icons.playlist_add_rounded),
                            label: Text(count == 0
                                ? 'ثبت کدها'
                                : 'ثبت ${faNum(count)} کد'),
                          ),
                        ),
                        if (_report != null) ...[
                          Gaps.vSm,
                          _BulkReport(report: _report!),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Gaps.vXs,
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton(
                onPressed: () => Navigator.pop(context, _changed),
                child: const Text('بستن'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// گزارش نتیجهٔ ثبت دسته‌ای.
///
/// عمداً هر چهار دسته را نشان می‌دهد حتی وقتی صفرند: مدیری که ۱۰۰۰ کد
/// فرستاده و ۹۹۸ تا ثبت شده باید بی‌درنگ ببیند آن ۲ تای دیگر چه شدند.
class _BulkReport extends StatelessWidget {
  final Map report;
  const _BulkReport({required this.report});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ins = report['insertedCount'] ?? 0;
    final dupDb = report['duplicateInDbCount'] ?? 0;
    final dupFile = report['duplicateInFileCount'] ?? 0;
    final invalid = report['invalidCount'] ?? 0;

    Widget row(String label, Object value, Color color, IconData icon) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Icon(icon, size: 15, color: color),
              Gaps.hXs,
              Expanded(child: Text(label, style: theme.textTheme.bodySmall)),
              Text(faNum(value),
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w800, color: color)),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        color: BrandColors.emerald.withValues(alpha: 0.08),
        borderRadius: Corners.rMd,
        border: Border.all(color: BrandColors.emerald.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          row('ثبت شد', ins, BrandColors.success, Icons.check_circle_rounded),
          row('تکراری در دیتابیس', dupDb, BrandColors.warning,
              Icons.content_copy_rounded),
          row('تکراری در متن ورودی', dupFile, BrandColors.warning,
              Icons.filter_none_rounded),
          row('فرمت نامعتبر', invalid, BrandColors.danger,
              Icons.error_outline_rounded),
          if ((report['invalid'] as List?)?.isNotEmpty ?? false) ...[
            Gaps.vXxs,
            Text(
              'نمونهٔ نامعتبرها: '
              '${(report['invalid'] as List? ?? const []).take(5).join('، ')}',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: context.brand.danger, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

class _Spin extends StatelessWidget {
  const _Spin();
  @override
  Widget build(BuildContext context) => const SizedBox(
      width: 16,
      height: 16,
      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white));
}
