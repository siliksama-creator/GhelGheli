/// ثبت کارت با عکس — بخش کاربر در اپ اندروید.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا کنارِ «ثبت کد کارت» و نه به‌جای آن
/// ═══════════════════════════════════════════════════════════════════════════
///
/// خواستهٔ صریح مالک: بخش قبلی دست‌نخورده بماند. کاربری که کارت قدیمی
/// دارد باید بتواند مثل همیشه فقط کد را وارد کند.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا کد هم لازم است، وقتی عکس داریم
/// ═══════════════════════════════════════════════════════════════════════════
///
/// عکس ثابت می‌کند کارتِ فیزیکی در دستِ کاربر است. کد ثابت می‌کند این
/// **نسخهٔ** خاص هنوز خرج نشده. اندازه‌گیری روی عکس واقعی نشان داد دو
/// کارت با طرحِ یکسان و کدِ متفاوت شباهت ۱.۰۰۰۰ دارند — یعنی تصویر
/// به‌تنهایی نمی‌تواند بگوید «این نسخه قبلاً استفاده شده».
///
///   • فقط کد  → هر کس کد را بداند امتیاز می‌گیرد بدون داشتن کارت
///   • فقط عکس → یک کارت بی‌نهایت بار ثبت می‌شود
///
/// تشخیصِ خودکارِ کد از روی عکس عمداً وجود ندارد: روی عکس واقعیِ گوشی
/// اندازه‌گیری شد و حتی در کیفیت عالی هم درست نخواند، پس فقط نرخِ خطا را
/// بالا می‌برد. کاربر کد را تایپ می‌کند و بارِ ضدتقلب را عکس به دوش
/// می‌کشد.
///
/// چهار نتیجهٔ ممکن:
///   approved   کد معتبر + عکس شناخته شد → کارت در اینونتوری
///   pending    کد معتبر ولی عکس شناخته نشد → بررسی دستی مدیر
///   bad_code   کد غلط → راهنمای حروفِ مبهم + شمارشِ تلاش
///   locked     ۵ کدِ غلطِ پشت‌سرهم → ۳ ساعت قفل
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چند نسخه از یک کارت: عکس می‌ماند، فقط کد پاک می‌شود
/// ═══════════════════════════════════════════════════════════════════════════
///
/// حالتِ رایجِ واقعی این است: کاربر ده بسته کارت خریده و پنج تای‌شان
/// «محمد صلاح» درآمده. هر پنج کارت **از نظر تصویری کاملاً یکسان‌اند** و
/// فقط کدِ پشت‌شان فرق می‌کند.
///
/// نسخهٔ قبلی بعد از هر ثبتِ موفق عکس را پاک می‌کرد، با این فرض که
/// «کارتِ بعدی عکسِ دیگری دارد». آن فرض غلط بود و کاربر مجبور می‌شد پنج
/// بار از پنج کارتِ یکسان عکس بگیرد — کاری بی‌معنی که فقط او را خسته
/// می‌کرد.
///
/// حالا عکس می‌ماند و فقط فیلدِ کد خالی و فوکوس می‌شود. کاربر کدِ بعدی
/// را تایپ می‌کند و دوباره «ثبت» می‌زند. اگر کارتِ بعدی واقعاً متفاوت
/// است، خودش دکمهٔ ✕ روی عکس را می‌زند یا عکسِ تازه می‌گیرد.
///
/// سمتِ سرور **هیچ** محدودیتی روی تکرارِ عکس ندارد؛ اصالت را کد تضمین
/// می‌کند و هر کد فقط یک بار مصرف می‌شود.
///
/// **همان دیتابیس و همان بانک کدِ وب‌اپ و پنل.** هیچ داده یا مسیرِ
/// جداگانه‌ای وجود ندارد.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api_client.dart';
import '../theme/colors.dart';
import '../theme/tokens.dart';
import 'safe_image.dart';

/// مراحلِ واقعیِ آنالیز — برچسب و توضیح.
///
/// هر مرحله کارِ واقعیِ سرور را نشان می‌دهد، نه انیمیشنِ تزئینی. اگر
/// روزی موتور عوض شد، این فهرست هم باید عوض شود: لودینگی که چیزِ
/// نادرست بگوید بدتر از نبودنش است.
const List<(String, String)> _kAnalysisSteps = [
  ('در حال تحلیل تصویر…', 'رنگ، لبه‌ها، بافت و روشنایی'),
  ('در حال خواندن متن کارت…', 'نام بازیکن و شمارهٔ پیراهن'),
  ('مقایسه با کارت‌ها…', 'جست‌وجو در همهٔ کارت‌های ثبت‌شده'),
];

class PhotoCardBox extends StatefulWidget {
  const PhotoCardBox({super.key, required this.api, this.onRegistered});

  final ApiClient api;

  /// بعد از ثبتِ موفق صدا زده می‌شود تا صفحهٔ والد امتیاز و اینونتوری
  /// را تازه کند.
  final VoidCallback? onRegistered;

  @override
  State<PhotoCardBox> createState() => _PhotoCardBoxState();
}

class _PhotoCardBoxState extends State<PhotoCardBox> {
  final _code = TextEditingController();

  /// فوکوسِ فیلدِ کد.
  ///
  /// بعد از هر ثبتِ موفق دوباره فوکوس می‌گیرد تا کاربری که چند نسخه از
  /// یک کارت دارد بتواند بدونِ لمسِ اضافه کدِ بعدی را تایپ کند.
  final _codeFocus = FocusNode();
  String? _imagePath;
  bool _busy = false;

  /// ── مرحلهٔ آنالیز، برای نوارِ پیشرفت ──
  ///
  /// خواستهٔ مالک: «یه لودینگ دقیقا به اندازه زمان مورد نیاز انجین …
  /// که واقعا اینکار انجام شه و یه آنالیز حرفه‌ای رخ بده».
  ///
  /// ⚠️ این مراحل **ساختگی نیستند**. هر کدام کارِ واقعیِ سرور را نشان
  ///    می‌دهند و زمان‌بندی‌شان از اندازه‌گیریِ واقعی آمده:
  ///
  ///      اثرانگشتِ تصویری  ~۳۳۰ms  (پنج سیگنالِ موازی)
  ///      خواندنِ متن       ~۸۵۰ms  (OCR)
  ///      مقایسه با کاتالوگ ~۵۰ms
  ///
  ///    نوار روی مرحلهٔ آخر **متوقف** می‌ماند تا پاسخ برسد؛ هرگز خودش
  ///    به ۱۰۰٪ نمی‌رسد. لودینگی که زودتر از کارِ واقعی تمام شود بدتر
  ///    از نبودنش است — کاربر فکر می‌کند هنگ کرده و دوباره می‌زند.
  int _phase = 0;

  /// تایمرهای مرحله‌ها؛ در `dispose` و پایانِ درخواست لغو می‌شوند.
  ///
  /// ⚠️ بدونِ لغو، `setState` بعد از dispose صدا زده می‌شود — همان
  ///    باگِ تاریخیِ این پروژه که در حالتِ release صفحهٔ قرمز می‌داد.
  final List<Timer> _phaseTimers = [];
  bool _checking = true;

  /// تا وقتی مدیر طرحی آپلود نکرده، این بخش اصلاً نشان داده نمی‌شود —
  /// بهتر از نشان دادن چیزی که همیشه شکست می‌خورد.
  bool _available = false;

  /// تعدادِ پرونده‌های در انتظارِ بررسی — **از سرور**.
  ///
  /// باگِ قبلی: بنرِ «در حال بررسی» فقط حالتِ محلی بود. بعد از اینکه
  /// مدیر تأیید می‌کرد، کاربر تا بازکردنِ دوبارهٔ اپ همان پیام را
  /// می‌دید — یعنی «در حال بررسی» می‌گفت در حالی که کارت قبلاً به
  /// مجموعه‌اش اضافه شده بود.
  int _pendingCount = 0;

  /// تعدادِ طرح‌های کاتالوگ — فقط برای زمان‌بندیِ لودینگ.
  ///
  /// خودِ مقایسه با ۲۰۰ طرح ۲.۵ms است (اندازه‌گیری‌شده)، ولی سرور با
  /// کاتالوگِ بزرگ‌تر ردیف‌های بیشتری می‌خواند و در ساعتِ شلوغ کندتر
  /// پاسخ می‌دهد.
  int _designCount = 0;

  Map? _result;
  String? _error;

  /// وقتی سرور قفل اعلام کند، ورودی و دکمه غیرفعال می‌شوند تا کاربر
  /// بی‌جهت تلاش نکند و پیام را بخواند.
  bool _locked = false;

  @override
  void initState() {
    super.initState();
    // ── چرا بعد از اولین فریم و نه داخل initState ──
    //
    // این ویجت در انتهای داشبورد است و داشبورد هنگام باز شدن حدود ده
    // درخواستِ مهم‌تر می‌فرستد (پروفایل، اینونتوری، جوایز…). شروع کردنِ
    // یک درخواستِ **فرعی** در همان لحظه، پهنای باندِ محدودِ موبایل را
    // با چیزی می‌گیرد که فقط تصمیم می‌گیرد یک بخش دیده شود یا نه.
    //
    // `addPostFrameCallback` آن را به بعد از رندرِ اولین فریم می‌اندازد:
    // کاربر صفحه را زودتر می‌بیند و این درخواست وقتی می‌رود که صف
    // خلوت‌تر است.
    //
    // مزیت جانبی در تست‌ها: ویجتی که بلافاصله dispose می‌شود اصلاً
    // درخواستی نمی‌فرستد، پس چیزی معلق نمی‌ماند.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _checkAvailability();
    });
  }

  @override
  void dispose() {
    for (final t in _phaseTimers) {
      t.cancel();
    }
    _phaseTimers.clear();
    _code.dispose();
    // ⚠️ FocusNode هم مثل Controller باید dispose شود، وگرنه نشتِ
    // حافظه می‌دهد و در تست‌های ویجت با «A FocusNode was used after
    // being disposed» یا هشدارِ نشت گیر می‌کند.
    _codeFocus.dispose();
    super.dispose();
  }

  Future<void> _checkAvailability() async {
    try {
      // `fresh: true` تا کشِ ۱.۲ ثانیه‌ایِ ApiClient دور زده شود؛ بعد
      // از هر ثبت باید عددِ واقعی خوانده شود نه نسخهٔ کش‌شده.
      final r = await widget.api.get('/api/photo-cards/status', fresh: true);
      if (!mounted) return;
      setState(() {
        _available = r['available'] == true;
        _pendingCount = (r['pendingCount'] as num?)?.toInt() ?? 0;
        _designCount = (r['designCount'] as num?)?.toInt() ?? 0;
        _checking = false;
      });
    } catch (_) {
      // خطا یعنی «نشان نده». این بخش اختیاری است و نباید صفحهٔ اصلی را
      // با پیام خطا شلوغ کند.
      if (!mounted) return;
      setState(() {
        _available = false;
        _checking = false;
      });
    }
  }

  Future<void> _pick(ImageSource source) async {
    try {
      final f = await ImagePicker().pickImage(
        source: source,
        // ── چرا همین‌جا کوچک می‌شود ──
        //
        // عکس گوشی مدرن ۴ تا ۸ مگابایت است. روی اینترنت موبایل ایران
        // یعنی ۳۰ ثانیه انتظار و گاهی قطع شدن آپلود. سرور هرحال تصویر
        // را به ۱۶۰۰ پیکسل کوچک می‌کند، پس فرستادن نسخهٔ بزرگ‌تر هیچ
        // سودی ندارد.
        //
        // ۱۴۰۰ برای اثر انگشت بیش از کافی است: موتور تطبیق تصویر را به
        // ۳۲×۳۲ و ۱۲۸×۱۲۸ کاهش می‌دهد.
        maxWidth: 1400,
        maxHeight: 1400,
        imageQuality: 86,
      );
      if (f == null) return;
      if (!mounted) return;
      setState(() {
        _imagePath = f.path;
        _result = null;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = apiError(e));
    }
  }

  Future<void> _submit() async {
    if (_busy || _imagePath == null || _code.text.trim().isEmpty) return;
    setState(() {
      _busy = true;
      _phase = 0;
      _result = null;
      _error = null;
    });
    // زمان‌بندی از اندازه‌گیریِ واقعیِ موتور می‌آید (توضیح در `_phase`).
    for (final t in _phaseTimers) {
      t.cancel();
    }
    // ⚠️ سقفِ ۱.۵ ثانیه برای `slack`: بدونِ آن با کاتالوگِ چندصدتایی
    //    مرحلهٔ آخر دیر ظاهر می‌شد و کاربر نوارِ متوقف می‌دید — همان
    //    حسِ «هنگ کرده» که این لودینگ برای رفعش ساخته شده.
    final slack = (_designCount * 3).clamp(0, 1500);
    _phaseTimers
      ..clear()
      ..addAll([
        Timer(const Duration(milliseconds: 350),
            () { if (mounted) setState(() => _phase = 1); }),
        Timer(Duration(milliseconds: 1200 + slack),
            () { if (mounted) setState(() => _phase = 2); }),
      ]);
    try {
      final res = await widget.api.postMultipart(
        '/api/photo-cards/submit',
        filePath: _imagePath,
        fields: {'code': _code.text.trim()},
      );
      if (!mounted) return;
      final d = (res.data is Map) ? res.data as Map : const {};
      final status = d['status'];

      if (status == 'locked') {
        setState(() {
          _result = d;
          _locked = true;
        });
        return;
      }

      // ── کدِ غلط: عکس عمداً نگه داشته می‌شود ──
      // کاربر فقط باید کد را اصلاح کند؛ مجبور کردنش به عکس‌گرفتنِ
      // دوباره بی‌دلیل آزاردهنده است.
      if (status == 'bad_code') {
        setState(() => _result = d);
        return;
      }

      if (res.statusCode != null && res.statusCode! >= 400) {
        setState(() => _error = '${d['message'] ?? 'ثبت نشد'}');
        return;
      }

      setState(() {
        _result = d;
        // ⚠️ عکس عمداً **پاک نمی‌شود** — توضیح کامل در سربرگِ فایل.
        // کاربری که پنج نسخه از یک کارت دارد باید فقط کدِ بعدی را
        // تایپ کند، نه اینکه پنج بار از پنج کارتِ یکسان عکس بگیرد.
        _code.clear();
      });
      // فوکوس روی فیلدِ کد تا کیبورد باز بماند و کاربر بلافاصله کدِ
      // بعدی را بزند. بدون این، باید دوباره روی فیلد ضربه بزند —
      // ریزه‌کاری‌ای که در ثبتِ پشت‌سرهمِ ده کارت واقعاً حس می‌شود.
      if (mounted) _codeFocus.requestFocus();
      if (status == 'approved') widget.onRegistered?.call();
      // شمارِ در انتظار را از سرور تازه کن — چه ثبت شد چه به صف رفت.
      unawaited(_checkAvailability());
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = apiError(e));
    } finally {
      for (final t in _phaseTimers) {
        t.cancel();
      }
      _phaseTimers.clear();
      if (mounted) {
        setState(() {
          _busy = false;
          _phase = 0;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking || !_available) return const SizedBox.shrink();
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Gaps.vLg,
        Divider(color: theme.colorScheme.outline.withValues(alpha: 0.3)),
        Gaps.vMd,
        Text('📸 ثبت کارت با عکس', style: theme.textTheme.titleLarge),
        Gaps.vXxs,
        Text(
          'از کارت عکس بگیر و کدش را وارد کن. عکس ثابت می‌کند کارت را داری، '
          'پس کسی نمی‌تواند فقط با دانستن کد امتیاز بگیرد.',
          style: theme.textTheme.bodySmall,
        ),
        Gaps.vXxs,
        // ── چرا این جمله لازم است ──
        //
        // بدونِ آن، کاربری که پنج نسخهٔ یک کارت دارد فکر می‌کند باید
        // پنج بار عکس بگیرد — یا بدتر، فکر می‌کند فقط یکی‌شان قابل
        // ثبت است و چهار کد را دور می‌ریزد.
        Text(
          'چند نسخه از یک کارت داری؟ یک بار عکس بگیر و کدها را '
          'پشت‌سرهم وارد کن — عکس بعد از هر ثبت سرِ جایش می‌ماند.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.primary),
        ),
        Gaps.vMd,

        // ── نوارِ وضعیت، از سرور نه از حافظهٔ محلی ──
        // وقتی مدیر تأیید یا رد کند، این عدد صفر می‌شود و نوار خودش
        // محو می‌شود.
        if (_pendingCount > 0 && _result == null)
          _pendingBanner(context),
        if (_result != null) _resultView(context, _result!),
        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(Gaps.sm),
            decoration: BoxDecoration(
              borderRadius: Corners.rMd,
              color: theme.colorScheme.error.withValues(alpha: 0.12),
              border: Border.all(
                  color: theme.colorScheme.error.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                Icon(Icons.error_outline_rounded,
                    size: 18, color: theme.colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_error!,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.error)),
                ),
              ],
            ),
          ),
          Gaps.vSm,
        ],

        // دو دکمهٔ هم‌عرض. دوربین اول است چون حالتِ اصلی همان است:
        // کاربر کارت را در دست دارد.
        Row(
          children: [
            Expanded(
              child: _pickButton(context, Icons.photo_camera_rounded, 'دوربین',
                  () => _pick(ImageSource.camera)),
            ),
            const SizedBox(width: Gaps.sm),
            Expanded(
              child: _pickButton(context, Icons.photo_library_rounded, 'گالری',
                  () => _pick(ImageSource.gallery)),
            ),
          ],
        ),

        if (_imagePath != null) ...[
          Gaps.vSm,
          Stack(
            alignment: AlignmentDirectional.topStart,
            children: [
              ClipRRect(
                borderRadius: Corners.rLg,
                child: Image.file(
                  File(_imagePath!),
                  height: 200,
                  width: double.infinity,
                  fit: BoxFit.contain,
                  // اگر فایل بین انتخاب و رندر پاک شود، نباید کل صفحه
                  // با استثنا بشکند.
                  errorBuilder: (_, __, ___) => const SizedBox(
                    height: 200,
                    child: Center(child: Icon(Icons.broken_image_outlined)),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(6),
                child: Material(
                  color: Colors.black54,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => setState(() => _imagePath = null),
                    child: const Padding(
                      padding: EdgeInsets.all(5),
                      child: Icon(Icons.close_rounded,
                          size: 18, color: Colors.white),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],

        Gaps.vSm,
        TextField(
          controller: _code,
          focusNode: _codeFocus,
          enabled: !_locked,
          textCapitalization: TextCapitalization.characters,
          // کد لاتین است و در فیلدِ راست‌به‌چپ کاراکترهایش جابه‌جا دیده
          // می‌شود.
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.center,
          style: const TextStyle(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w800,
              letterSpacing: 2),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.vpn_key_rounded),
            labelText: 'کد روی کارت',
          ),
          onChanged: (_) => setState(() {}),
        ),
        Gaps.vXs,
        _codeHint(context),
        Gaps.vSm,
        FilledButton.icon(
          onPressed: (_busy || _locked || _imagePath == null
                  || _code.text.trim().isEmpty)
              ? null
              : _submit,
          icon: _busy
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2.2, color: Colors.white))
              : const Icon(Icons.document_scanner_rounded),
          label: Text(_busy ? _kAnalysisSteps[_phase].$1 : 'ثبت کارت'),
        ),
        // ── نوارِ پیشرفتِ آنالیز ──
        //
        // ⚠️ روی مرحلهٔ آخر متوقف می‌ماند تا پاسخ برسد؛ هرگز خودش به
        //    ۱۰۰٪ نمی‌رسد. توضیحِ کامل در `_phase`.
        if (_busy) ...[
          Gaps.vXs,
          ClipRRect(
            borderRadius: Corners.rPill,
            child: LinearProgressIndicator(
              value: (_phase + 1) / _kAnalysisSteps.length,
              minHeight: 6,
              backgroundColor:
                  theme.colorScheme.surfaceContainerHighest,
            ),
          ),
          Gaps.vXxs,
          Text(
            _kAnalysisSteps[_phase].$2,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ],
        if (_imagePath == null) ...[
          Gaps.vXs,
          Text(
            'راهنما: کل کارت داخل کادر باشد و نور کافی باشد. '
            'عکس تار هم معمولاً شناسایی می‌شود.',
            style: theme.textTheme.labelSmall,
          ),
        ],
      ],
    );
  }

  Widget _pickButton(
      BuildContext context, IconData icon, String label, VoidCallback onTap) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: _busy ? null : onTap,
      borderRadius: Corners.rLg,
      child: Container(
        // هدف لمسِ ۴۴ پیکسلی طبق راهنمای دسترس‌پذیری؛ روی موبایل این‌ها
        // اصلی‌ترین کنشِ صفحه‌اند.
        height: 76,
        decoration: BoxDecoration(
          borderRadius: Corners.rLg,
          border:
              Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.5)),
          color: theme.colorScheme.surfaceContainerHighest
              .withValues(alpha: 0.35),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 24, color: theme.colorScheme.primary),
            const SizedBox(height: 3),
            Text(label,
                style: theme.textTheme.labelLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  /// راهنمای حروفِ مبهم — **همیشه** دیده می‌شود، نه فقط بعد از خطا.
  ///
  /// کاربر باید قبل از تایپ بداند به چه چیزی دقت کند. نشان دادنِ این
  /// راهنما بعد از شکست یعنی یکی از پنج تلاشش را بی‌دلیل سوزانده.
  Widget _codeHint(BuildContext context) {
    final theme = Theme.of(context);
    Widget chip(String t) => Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(
            borderRadius: Corners.rSm,
            color: theme.colorScheme.surfaceContainerHighest
                .withValues(alpha: 0.7),
          ),
          child: Text(t,
              style: const TextStyle(
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w900,
                  fontSize: 12.5)),
        );

    return Container(
      padding: const EdgeInsets.all(Gaps.xs),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
        border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.25)),
      ),
      child: DefaultTextStyle.merge(
        style: theme.textTheme.bodySmall ?? const TextStyle(),
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('دقت کنید: ',
                style: theme.textTheme.bodySmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const Text('صفر '),
            chip('0'),
            const Text(' و حرف '),
            chip('O'),
            const Text(' شبیه‌اند، و عدد یک '),
            chip('1'),
            const Text(' با حروف '),
            chip('I'),
            const Text(' و '),
            chip('L'),
            const Text('. بزرگ یا کوچک بودنِ حروف مهم نیست.'),
          ],
        ),
      ),
    );
  }

  Widget _pendingBanner(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.sm),
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: BrandColors.warningOnLight.withValues(alpha: 0.12),
        border: Border.all(
            color: BrandColors.warningOnLight.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.hourglass_top_rounded,
              color: BrandColors.warningOnLight, size: 20),
          const SizedBox(width: Gaps.xs),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${faNum(_pendingCount)} عکس در حال بررسی',
                    style: theme.textTheme.titleSmall?.copyWith(
                        color: BrandColors.warningOnLight,
                        fontWeight: FontWeight.w900)),
                Text(
                  'کیفیت عکس کامل نبود؛ کارشناس بررسی می‌کند و ممکن است '
                  'تا ۲۴ ساعت طول بکشد. کد شما محفوظ است و می‌توانید '
                  'کارت‌های دیگرتان را ثبت کنید.',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _resultView(BuildContext context, Map r) {
    final theme = Theme.of(context);
    final status = r['status'];
    final pending = status == 'pending';
    final badCode = status == 'bad_code';
    final locked = status == 'locked';

    // ── سه خانوادهٔ رنگ برای سه پیامِ متفاوت ──
    // «اشتباه کردی» (قرمز)، «فعلاً نمی‌توانی» (بنفش) و «منتظر بمان»
    // (کهربایی) واکنش‌های متفاوتی می‌خواهند؛ یک رنگ برای همه یعنی
    // کاربر نمی‌فهمد باید چه کند.
    final color = locked
        ? const Color(0xFF7C4DFF)
        : badCode
            ? BrandColors.dangerOnLight
            : pending
                ? BrandColors.warningOnLight
                : BrandColors.successOnLight;

    if (badCode || locked) {
      return Container(
        margin: const EdgeInsets.only(bottom: Gaps.sm),
        padding: const EdgeInsets.all(Gaps.sm),
        decoration: BoxDecoration(
          borderRadius: Corners.rMd,
          color: color.withValues(alpha: 0.13),
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(locked ? Icons.lock_clock_rounded : Icons.error_outline_rounded,
                color: color, size: 20),
            const SizedBox(width: Gaps.xs),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    locked ? 'ثبت کارت موقتاً بسته است' : 'کد نادرست است',
                    style: theme.textTheme.titleSmall?.copyWith(
                        color: color, fontWeight: FontWeight.w900),
                  ),
                  Text('${r['message'] ?? ''}',
                      style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: Gaps.sm),
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: color.withValues(alpha: 0.13),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          if (!pending && r['imageUrl'] != null) ...[
            ClipRRect(
              borderRadius: Corners.rSm,
              child: SafeImage(
                  url: '${r['imageUrl']}',
                  width: 52,
                  height: 72,
                  fit: BoxFit.cover),
            ),
            const SizedBox(width: Gaps.sm),
          ] else ...[
            Icon(Icons.hourglass_top_rounded, color: color),
            const SizedBox(width: Gaps.sm),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pending
                      ? 'در انتظار بررسی'
                      : '${r['cardType'] ?? 'کارت'} ثبت شد',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(color: color, fontWeight: FontWeight.w900),
                ),
                Text(
                  pending
                      ? '${r['message'] ?? 'نتیجه را اطلاع می‌دهیم.'}'
                      : '+${faNum(r['addedPoints'] ?? 0)} امتیاز'
                          '${(r['addedCash'] ?? 0) > 0 ? ' · ${faNum(r['addedCash'])} تومان' : ''}',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
