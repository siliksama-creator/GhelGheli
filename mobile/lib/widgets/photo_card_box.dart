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
/// است، خودش دکمهٔ  روی عکس را می‌زند یا عکسِ تازه می‌گیرد.
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
import 'card_frame_guide.dart';
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
  const PhotoCardBox({
    super.key,
    required this.api,
    this.onRegistered,
    this.embedded = false,
  });

  final ApiClient api;

  /// Dashboard-embedded mode removes the duplicated divider/title so the real
  /// form sits above the fold while keeping every input and anti-fraud hint.
  final bool embedded;

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

  /// آیا راهنمای کادر در این نشست نشان داده شده؟
  ///
  /// در حافظهٔ ویجت می‌ماند نه دیسک: هدف این است که در یک نشست تکرار
  /// نشود، ولی کاربری که فردا برمی‌گردد دوباره ببیندش — چون احتمالاً
  /// فراموش کرده.
  bool _guideShown = false;

  /// ── مرحلهٔ آنالیز، برای نوارِ پیشرفت ──
  ///
  /// خواستهٔ مالک: «یه لودینگ دقیقا به اندازه زمان مورد نیاز انجین …
  /// که واقعا اینکار انجام شه و یه آنالیز حرفه‌ای رخ بده».
  ///
  ///  این مراحل **ساختگی نیستند**. هر کدام کارِ واقعیِ سرور را نشان
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
  ///  بدونِ لغو، `setState` بعد از dispose صدا زده می‌شود — همان
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

  /// آیا جزئیاتِ راهنمای حروفِ مبهم باز است؟
  ///
  /// بسته پیش‌فرض است تا فرم کوتاه بماند (شکایتِ مالک: «نوارش خیلی دراز
  /// شده»). خلاصهٔ یک‌خطی همیشه دیده می‌شود، پس هشدار از دست نمی‌رود.
  bool _hintOpen = false;

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
    //  FocusNode هم مثل Controller باید dispose شود، وگرنه نشتِ
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
    // ── راهنمای کادر، فقط قبلِ دوربین ──
    //
    // برای گالری بی‌معنی است: عکس از قبل گرفته شده و کاربر نمی‌تواند
    // کاری کند. نشان دادنش آنجا فقط یک مانعِ اضافه است.
    //
    //  فقط **یک بار در هر نشست**. راهنمایی که هر بار ظاهر شود از
    //    کمک به مزاحمت تبدیل می‌شود و کاربر یاد می‌گیرد بدونِ خواندن
    //    ردش کند — یعنی دقیقاً برعکسِ هدف.
    if (source == ImageSource.camera && !_guideShown) {
      final go = await showCardFrameGuide(context);
      if (!mounted) return;
      _guideShown = true;
      if (!go) return;
    }
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
    //  سقفِ ۱.۵ ثانیه برای `slack`: بدونِ آن با کاتالوگِ چندصدتایی
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
        //  عکس عمداً **پاک نمی‌شود** — توضیح کامل در سربرگِ فایل.
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
    final theme = Theme.of(context);

    // ── تا وقتی پاسخِ سرور نیامده، جای خالی ──
    //
    // این حالت کسری از ثانیه طول می‌کشد و نشان دادنِ «چیزی نیست» در آن
    // لحظه فقط پرشِ چشمی می‌سازد.
    if (_checking) return const SizedBox.shrink();

    // ══════════════════════════════════════════════════════════════════
    // کاتالوگِ خالی: پیامِ روشن، نه سکوت
    // ══════════════════════════════════════════════════════════════════
    //
    // ── باگی که مالک با اسکرین‌شات نشان داد ──
    //
    // نسخهٔ قبلی وقتی `available == false` بود **کلِ بخش را پنهان
    // می‌کرد**. ولی بنرِ «ثبت کارت‌های قلقلی» و متنِ زیرش در
    // `dashboard_page` هستند نه اینجا — پس آن‌ها می‌ماندند و این بخش
    // ناپدید می‌شد.
    //
    // نتیجه‌ای که کاربر می‌دید: یک بنرِ تبلیغاتیِ بزرگ با عنوان «ثبت
    // کارت‌های قلقلی» و توضیحِ اینکه کارت‌ها در فروشگاه‌ها فروخته
    // می‌شوند — و **هیچ دکمه، فرم یا راهی برای ثبت**. مالک پرسید
    // «الان کاربر چطوری کارت ثبت کنه؟!» و حق داشت.
    //
    //  سکوت بدترین پاسخِ ممکن است: کاربر نمی‌داند اپ خراب است، یا
    //    اینترنتش قطع است، یا هنوز کارتی تعریف نشده. هر سه حدس او را
    //    به پشتیبانی می‌فرستد.
    //
    // حالا پیامِ صریح می‌بیند که می‌گوید مشکل از او نیست و چه باید
    // بکند.
    if (!_available) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Gaps.vMd,
          Container(
            padding: const EdgeInsets.all(Gaps.sm),
            decoration: BoxDecoration(
              borderRadius: Corners.rMd,
              color: theme.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.35),
              border: Border.all(
                  color: theme.colorScheme.outline.withValues(alpha: 0.35)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.hourglass_empty_rounded, size: 20),
                const SizedBox(width: Gaps.xs),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ثبت کارت هنوز فعال نشده',
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w900)),
                      Gaps.vXxs,
                      Text(
                        'هنوز کارتی در سیستم تعریف نشده است. به‌محض اینکه '
                        'اولین سری کارت‌ها اضافه شود، همین‌جا می‌توانی از '
                        'کارتت عکس بگیری و کدش را وارد کنی.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // چیدمانِ جمع‌وجور
    // ═══════════════════════════════════════════════════════════════════
    //
    // ── شکایتِ مالک ──
    //
    //   «حالا قسمت ثبت کد کاربر رو بهینه کن هم گوشی و هم وب اپ چون
    //    نوارش خیلی دراز شده، یکم جمع و جور تر و کوتاه تر بشه»
    //
    // ── چه چیزی نوار را دراز کرده بود ──
    //
    // چهار چیز، که هر کدام جداگانه توجیه داشتند ولی رویِ هم فاجعه شدند:
    //
    //   ۱. دو پاراگرافِ توضیح، مجموعاً چهار خط (~۷۰ پیکسل)
    //   ۲. دو دکمهٔ ۷۶ پیکسلی برای دوربین و گالری
    //   ۳. پیش‌نمایشِ ۲۰۰ پیکسلیِ عکس
    //   ۴. جعبهٔ راهنمای حروفِ مبهم، سه خطِ همیشه‌باز (~۶۰ پیکسل)
    //
    // جمعاً بیش از ۵۰۰ پیکسل — روی گوشیِ معمولی بیشتر از یک صفحهٔ کامل،
    // فقط برای فرمی که دو ورودی دارد.
    //
    // ── چه تغییر کرد ──
    //
    //   • دو پاراگراف → یک جملهٔ کوتاه. جملهٔ «چند نسخه» به راهنمای
    //     زیرِ فیلدِ کد منتقل شد، جایی که واقعاً به آن نیاز است.
    //   • دکمه‌های ۷۶ → ۵۲ پیکسل، افقی به‌جای عمودی (آیکون کنارِ متن).
    //     هدفِ لمس همچنان بالاتر از حداقلِ ۴۴ پیکسلیِ دسترس‌پذیری است.
    //   • پیش‌نمایش ۲۰۰ → ۱۱۰ پیکسل، و **کنارِ** فیلدِ کد نه بالایش.
    //     دو عنصر که با هم یک ردیف می‌شوند، ۱۶۰ پیکسل صرفه‌جویی.
    //   • راهنمای حروف تاشو شد؛ بسته یک خط است.
    //
    //  هیچ اطلاعاتی حذف نشد — فقط جابه‌جا و تاشو شد. راهنمای حروفِ
    //    مبهم دلیلِ وجودیِ روشنی داشت (کاربر باید **قبل** از تایپ بداند
    //    که ۰ و O شبیه‌اند، وگرنه یکی از پنج تلاشش را می‌سوزاند) پس
    //    حذف نشد؛ خلاصه‌اش همیشه دیده می‌شود و جزئیاتش یک ضربه فاصله
    //    دارد.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.embedded) ...[
          Gaps.vMd,
          Divider(color: theme.colorScheme.outline.withValues(alpha: 0.3)),
          Gaps.vSm,
          Row(
            children: [
              Expanded(
                child: Text('ثبت کارت با عکس',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w900)),
              ),
              // شمارِ در انتظار به‌صورت یک نشانِ کوچک کنارِ عنوان، به‌جای
              // بنرِ سه‌خطی. بنر فقط وقتی باز می‌شود که کاربر رویش بزند.
              if (_pendingCount > 0 && _result == null)
                _pendingChip(context),
            ],
          ),
          Gaps.vXxs,
          Text(
            'از کارت عکس بگیر و کدش را وارد کن.',
            style: theme.textTheme.bodySmall,
          ),
          Gaps.vSm,
        ] else ...[
          if (_pendingCount > 0 && _result == null)
            Align(alignment: AlignmentDirectional.centerStart, child: _pendingChip(context)),
          if (_pendingCount > 0 && _result == null) Gaps.vXs,
        ],

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

        // ── عکس و کد در یک ردیف ──
        //
        // این بزرگ‌ترین صرفه‌جوییِ ارتفاع است. قبلاً پیش‌نمایشِ ۲۰۰
        // پیکسلی تمامِ عرض را می‌گرفت و فیلدِ کد زیرش می‌آمد؛ حالا
        // پیش‌نمایشِ ۱۱۰ پیکسلی سمتِ راست و فیلدِ کد سمتِ چپ، در یک
        // ردیف. حدود ۱۶۰ پیکسل کمتر.
        //
        // نسبتِ ۱۱۰×۸۰ عمداً نزدیک به نسبتِ خودِ کارتِ فوتبالی است، پس
        // عکس با BoxFit.cover بدونِ تحریفِ محسوس جا می‌شود.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // کلید برای تستِ چیدمان: تستی که مطمئن می‌شود این جایگاه
            // **کنارِ** فیلدِ کد می‌ماند نه بالایش، چون همین یک تصمیم
            // ~۱۶۰ پیکسل از ارتفاعِ فرم کم کرد.
            SizedBox(
                key: const ValueKey('pcPhotoSlot'),
                width: 80,
                child: _photoSlot(context)),
            const SizedBox(width: Gaps.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _code,
                    focusNode: _codeFocus,
                    enabled: !_locked,
                    textCapitalization: TextCapitalization.characters,
                    // کد لاتین است و در فیلدِ راست‌به‌چپ کاراکترهایش
                    // جابه‌جا دیده می‌شود.
                    textDirection: TextDirection.ltr,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2),
                    decoration: InputDecoration(
                      labelText: 'کد روی کارت',
                      // `isDense` + padding کوچک‌تر: ارتفاعِ پیش‌فرضِ
                      // TextField در متریال ۵۶ پیکسل است که اینجا
                      // بی‌دلیل بلند است.
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: Gaps.sm, vertical: 12),
                      prefixIcon: const Icon(Icons.vpn_key_rounded, size: 18),
                      prefixIconConstraints:
                          const BoxConstraints(minWidth: 34, minHeight: 34),
                      // پاک کردنِ سریعِ کدِ اشتباه، بدونِ نگه‌داشتنِ
                      // دکمهٔ بک‌اسپیس.
                      suffixIcon: _code.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.backspace_outlined,
                                  size: 16),
                              tooltip: 'پاک کردن',
                              visualDensity: VisualDensity.compact,
                              onPressed: () => setState(_code.clear),
                            ),
                    ),
                    onSubmitted: (_) {
                      if (!_busy && !_locked && _imagePath != null
                          && _code.text.trim().isNotEmpty) {
                        _submit();
                      }
                    },
                    onChanged: (_) => setState(() {}),
                  ),
                  Gaps.vXs,
                  // دو دکمهٔ باریک، آیکون کنارِ متن به‌جای بالای آن.
                  // ۵۲ پیکسل ارتفاع — همچنان بالاتر از حداقلِ ۴۴
                  // پیکسلیِ دسترس‌پذیری.
                  Row(
                    children: [
                      Expanded(
                        child: _pickButton(context, Icons.photo_camera_rounded,
                            'دوربین', () => _pick(ImageSource.camera)),
                      ),
                      const SizedBox(width: Gaps.xs),
                      Expanded(
                        child: _pickButton(context, Icons.photo_library_rounded,
                            'گالری', () => _pick(ImageSource.gallery)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
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
        //  روی مرحلهٔ آخر متوقف می‌ماند تا پاسخ برسد؛ هرگز خودش به
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
        // ── راهنمای عکس‌گرفتن حذف شد، جای بهتری پیدا کرد ──
        //
        // این متن قبلاً وقتی عکسی انتخاب نشده بود زیرِ فرم می‌نشست.
        // حذفش برای کوتاه کردنِ فرم اطلاعات را از بین نمی‌برد: همان
        // راهنما در `showCardFrameGuide` هست که **قبل از باز شدنِ
        // دوربین** نشان داده می‌شود — یعنی دقیقاً لحظه‌ای که به درد
        // می‌خورد، نه وقتی کاربر دارد فرم را نگاه می‌کند.
      ],
    );
  }

  /// جایگاهِ عکس — هم پیش‌نمایش، هم دکمهٔ انتخاب وقتی خالی است.
  ///
  /// ── چرا یک عنصر و نه دو ──
  ///
  /// قبلاً وقتی عکسی نبود این فضا کاملاً خالی می‌ماند و فقط دو دکمه
  /// دیده می‌شد؛ وقتی عکس می‌آمد، ناگهان ۲۰۰ پیکسل به ارتفاعِ فرم
  /// اضافه می‌شد و همه‌چیز می‌پرید. حالا جایگاه **همیشه** همان اندازه
  /// است: خالی یک کادرِ نقطه‌چین است، پر عکس. هیچ پرشی رخ نمی‌دهد.
  Widget _photoSlot(BuildContext context) {
    final theme = Theme.of(context);
    const h = 110.0;

    if (_imagePath == null) {
      return InkWell(
        onTap: _busy ? null : () => _pick(ImageSource.camera),
        borderRadius: Corners.rMd,
        child: Container(
          height: h,
          decoration: BoxDecoration(
            borderRadius: Corners.rMd,
            color: theme.colorScheme.surfaceContainerHighest
                .withValues(alpha: 0.3),
            border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.45)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add_a_photo_outlined,
                  size: 22, color: theme.colorScheme.primary),
              const SizedBox(height: 4),
              Text('عکس کارت',
                  style: theme.textTheme.labelSmall
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      );
    }

    return Stack(
      alignment: AlignmentDirectional.topEnd,
      children: [
        ClipRRect(
          borderRadius: Corners.rMd,
          child: Image.file(
            File(_imagePath!),
            height: h,
            width: double.infinity,
            // cover و نه contain: در کادرِ کوچک، contain حاشیهٔ خالیِ
            // زیادی می‌گذارد. کاربر عکس را برای **تأیید انتخاب** نگاه
            // می‌کند نه برای بررسیِ جزئیات.
            fit: BoxFit.cover,
            // اگر فایل بین انتخاب و رندر پاک شود، نباید کل صفحه با
            // استثنا بشکند.
            errorBuilder: (_, __, ___) => const SizedBox(
              height: h,
              child: Center(child: Icon(Icons.broken_image_outlined)),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(3),
          child: Material(
            color: Colors.black54,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => setState(() => _imagePath = null),
              child: const Padding(
                padding: EdgeInsets.all(3),
                child:
                    Icon(Icons.close_rounded, size: 15, color: Colors.white),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _pickButton(
      BuildContext context, IconData icon, String label, VoidCallback onTap) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: _busy ? null : onTap,
      borderRadius: Corners.rMd,
      child: Container(
        // ۵۲ به‌جای ۷۶. آیکون کنارِ متن است نه بالایش، پس ارتفاعِ کمتر
        // هیچ چیزی را فشرده نمی‌کند. همچنان بالاتر از حداقلِ ۴۴
        // پیکسلیِ راهنمای دسترس‌پذیری.
        height: 52,
        decoration: BoxDecoration(
          borderRadius: Corners.rMd,
          border:
              Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.5)),
          color: theme.colorScheme.surfaceContainerHighest
              .withValues(alpha: 0.35),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: theme.colorScheme.primary),
            const SizedBox(width: 5),
            // Flexible: نامِ دکمه در فونتِ بزرگِ سیستم نباید سرریز کند.
            Flexible(
              child: Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }

  /// نشانِ کوچکِ «در انتظار بررسی» کنارِ عنوان.
  ///
  /// جایگزینِ بنرِ سه‌خطیِ قبلی که ~۷۵ پیکسل می‌گرفت. متنِ کامل با یک
  /// ضربه در یک SnackBar نشان داده می‌شود — اطلاعات حذف نشده، فقط
  /// وقتی نمایش داده می‌شود که کاربر بخواهد.
  Widget _pendingChip(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      borderRadius: Corners.rPill,
      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${faNum(_pendingCount)} عکس در حال بررسی است. کیفیت عکس کامل '
            'نبود؛ کارشناس بررسی می‌کند و ممکن است تا ۲۴ ساعت طول بکشد. '
            'کد شما محفوظ است و می‌توانید کارت‌های دیگرتان را ثبت کنید.',
          ),
          duration: const Duration(seconds: 6),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          borderRadius: Corners.rPill,
          color: BrandColors.warningOnLight.withValues(alpha: 0.15),
          border: Border.all(
              color: BrandColors.warningOnLight.withValues(alpha: 0.45)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.hourglass_top_rounded,
                size: 13, color: BrandColors.warningOnLight),
            const SizedBox(width: 3),
            Text('${faNum(_pendingCount)} در بررسی',
                style: theme.textTheme.labelSmall?.copyWith(
                    color: BrandColors.warningOnLight,
                    fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  /// راهنمای حروفِ مبهم — خلاصه همیشه دیده می‌شود، جزئیات تاشو.
  ///
  /// ── چرا حذف نشد، فقط تا شد ──
  ///
  /// وسوسه‌کننده بود که برای کوتاه کردنِ فرم کلاً حذفش کنیم. ولی دلیلِ
  /// وجودی‌اش هنوز پابرجاست: کاربر باید **قبل** از تایپ بداند که ۰ و O
  /// شبیه‌اند. نشان دادنِ این راهنما بعد از خطا یعنی یکی از پنج تلاشش
  /// را بی‌دلیل سوزانده و به قفلِ سه‌ساعته نزدیک‌تر شده.
  ///
  /// راه‌حل: خلاصهٔ یک‌خطی همیشه دیده می‌شود («۰ و O، ۱ و I و L را
  /// اشتباه نگیر») که خودش هشدار را می‌رساند، و مثال‌های چشمی یک ضربه
  /// فاصله دارند. از سه خطِ همیشه‌باز به یک خط. ~۴۰ پیکسل صرفه‌جویی.
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

    return InkWell(
      borderRadius: Corners.rSm,
      onTap: () => setState(() => _hintOpen = !_hintOpen),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.info_outline_rounded,
                    size: 14, color: theme.colorScheme.outline),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'صفر و O، و یک با I و L را اشتباه نگیر',
                    style: theme.textTheme.labelSmall,
                  ),
                ),
                Icon(
                    _hintOpen
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    size: 16,
                    color: theme.colorScheme.outline),
              ],
            ),
            // AnimatedCrossFade و نه if ساده: باز و بسته شدنِ ناگهانی
            // بقیهٔ صفحه را می‌پراند.
            AnimatedCrossFade(
              duration: const Duration(milliseconds: 160),
              crossFadeState: _hintOpen
                  ? CrossFadeState.showSecond
                  : CrossFadeState.showFirst,
              firstChild: const SizedBox(width: double.infinity, height: 0),
              secondChild: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: DefaultTextStyle.merge(
                  style: theme.textTheme.bodySmall ?? const TextStyle(),
                  child: Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
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
                      const Text('. بزرگ یا کوچک بودنِ حروف مهم نیست. '),
                      Text(
                        'چند نسخه از یک کارت داری؟ یک بار عکس بگیر و کدها '
                        'را پشت‌سرهم وارد کن — عکس سرِ جایش می‌ماند.',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.primary),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
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
