// صفحهٔ بارگذاریِ قلقلی — خواستهٔ مالک (۲۶–۲۷ شهریور)
// ═══════════════════════════════════════════════════════════════════════════
//
// «صفحهٔ بارگذاری باید سینمایی باشد و واقعی — نه یک چرخندهٔ خالی.»
//
// ── چرا نسخهٔ قبلی بازنویسی شد ──
//
// نسخهٔ اول این فایل عمداً **بی‌حرکت** بود. دلیلش مستند است و درست بود:
// یک ورودِ ۹۰۰ میلی‌ثانیه‌ای با کدِ آن روز، بعدش به یک صفحهٔ ایستا می‌رسید
// و همان انتقال، مثلِ لرزش دیده می‌شد. پس سازنده «هیچ حرکتی» را انتخاب
// کرد. اما آن تصمیم یک هزینهٔ پنهان داشت که در شمارش درآمد هیچ‌جا دیده
// نمی‌شد: اولین چیزی که هر کاربرِ ایرانی در روز چند بار می‌بیند، یک
// صفحهٔ مرده با یک چرخندهٔ عمومی بود — شبیه‌ترین چیز در دنیا به «اپ خراب
// است».
//
// خواستهٔ صریحِ مالک: «هر بار اجرا، کاملِ سینمایی». پس آن تصمیم لغو شد —
// ولی **شرطِ** سازندهٔ قبلی هم برجا ماند و این فایل آن را رعایت می‌کند:
//
//   • فریمِ اول دقیقاً همان چیزی است که اسپلشِ سیستمی نشان داده بود
//     (لوگو، هم‌اندازه، همان وسط). هیچ پرشی بینِ دو صفحه نیست؛ حرکت از
//     همان حالت شروع می‌شود و به حالتِ نهایی می‌رسد.
//   • صفحه هرگز زمانِ ساختگی اضافه نمی‌کند. `BootController.minimumBrand`
//     فقط یک کفِ ۷۰۰ میلی‌ثانیه‌ایِ لحظهٔ برند است و اگر کارهای واقعی
//     بیشتر طول بکشند، هیچ چیز اضافه نمی‌شود. (عددِ قبلی ۹۰۰ms بود و برای
//     نسخهٔ بی‌حرکتِ قدیم انتخاب شده بود؛ با ۷۰۰ms، نورافکن و ورودِ لوگو
//     وقتِ نفس‌کشیدن دارند و بدترین حالتِ تحمیلی هنوز زیرِ یک ثانیه است.)
//
// ── چهار لایه، از پشت به جلو ──
//
//   ۱. **زمینِ شبانه**: همان `BrandColors.darkBg` که اسپلشِ سیستمی و کل
//      اپ دارند (#060D18). هیچ گرادیانِ رنگی‌ای اینجا نیست؛ گرادیانِ
//      آبی-بنفش، زبانِ بصریِ هر اپِ SaaSِ دیگری است.
//   ۲. **نورافکن‌های ورزشگاه**: دو مخروطِ نورِ مورب از بالا، با درخششِ
//      آرام. این همان چیزی است که «شبِ مسابقه» را می‌سازد و به کارت‌های
//      فوتبالیِ برند گره می‌خورد.
//   ۳. **غبارِ چمن**: ۲۲ ذرهٔ پراکنده با درخششِ مستقل. ارزان است (یک
//      `CustomPaint`) ولی صفحه را «در هوا معلق» نگه می‌دارد.
//   ۴. **قهرمان**: لوگوی واقعی (`logo_large.webp`، ۱۱۳۰×۸۸۳) با پرشِ
//      بازیگوش، شناوریِ آرام، هالهٔ نفس‌کشنده و ردِ نورِ براق. تمامِ
//      حرکتِ قهرمان از `AnimatedLogo` می‌آید — همان موتورِ مشترکی که
//      صفحهٔ ورود و هدرِ کشو از آن استفاده می‌کنند. دلیلش ساده است:
//      وقتی لوگو از اسپلش به صفحهٔ ورود **منتقل** می‌شود، باید همان
//      چیزی باشد که کاربر از قبل می‌شناسد، نه یک نسخهٔ نزدیک.
//
// ── قاعده‌هایی که چند بار نقض شده بودند ──
//
//   • **`Timer.periodic` هنگامِ غیرفعال‌بودن خاموش می‌شود.** ticker فقط
//     وقتی `active == true` است می‌چرخد. نسخهٔ قبلی هم همین را داشت و
//     دلیلش هنوز معتبر است: یک تایمرِ همیشه‌روشن، تست‌های ویجت را
//     می‌شکند و باتری می‌خورد.
//   • **احترامِ کامل به «کاهش حرکت».** `MediaQuery.maybeDisableAnimationsOf`
//     نورافکن، غبار، پرش و شناوری را کامل خاموش می‌کند؛ صفحه همان قابِ
//     نهاییِ ثابت می‌شود و نوارِ پیشرفت بدونِ نرم‌سازی مستقیم می‌پرد.
//     کفِ ۷۰۰ms در این حالت هم می‌ماند — چون برند باید دیده شود — ولی
//     هرگز از کارِ واقعی بیشتر طول نمی‌کشد، و در حالتِ خرابی دکمهٔ
//     «رد کردن» بلافاصله از صفحه می‌گذرد.
//   • **متنِ فارسیِ برند، نه متنِ فنی.** «در حال بارگذاری» روی صفحهٔ اولِ
//     یک اپِ بازی، زبانِ یک پنلِ ادمین است. مرحله‌ها به زبانِ خودِ بازی
//     حرف می‌زنند: نشست، قوانینِ زمین، چمن، دروازه.
//   • **RTL درست.** متنِ فارسی `Directionality.rtl` می‌خواهد؛ نوارِ
//     پیشرفت با تبدیل عددی پر می‌شود (نه با `Alignment.centerRight`) تا
//     جهتِ نوار به جهتِ متن گره نخورد.

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/boot_controller.dart';
import '../../theme/colors.dart';
import '../../widgets/animated_logo.dart';

/// هینتِ رمزگشاییِ لوگوی اسپلش — **یک عدد، دو مصرف‌کننده**.
///
/// `SplashScreen` این را به `AnimatedLogo` می‌دهد و `main.dart` همان را در
/// کارِ گرم‌کردنِ دارایی‌ها استفاده می‌کند. اگر این دو عدد یکی نباشند، کشِ
/// تصویرِ فلاتر آن‌ها را دو ورودیِ جدا می‌بیند: رمزگشاییِ دوباره، دقیقاً در
/// لحظهٔ انتقال به صفحهٔ بعد.
///
/// ۷۸۰ = بیشترین اندازهٔ قهرمان (۲۶۰) × بیشترین چگالیِ رایج (۳). عمداً عددِ
/// ثابت است و از عرضِ واقعیِ صفحه حساب نمی‌شود؛ وگرنه کلیدِ کش با هر گوشی
/// عوض می‌شود و گرم‌کردنِ زودهنگام بی‌فایده می‌شود.
const int kSplashLogoCacheWidth = 780;

/// ── دو عددِ مورف ─────────────────────────────────────────────────────────
///
/// هر دو از **اندازه‌گیریِ واقعی** آمده‌اند، نه از حدس: روی صفحهٔ ۳۹۰×۸۴۴
/// لوگوی صفحهٔ ورود از y=۸۶ تا y=۲۸۲ کشیده می‌شود (مرکز ۱۸۴) و قهرمانِ
/// اسپلش روی ۳۶۰ می‌نشیند. اختلافِ این دو نسبت، مسیرِ مورف را می‌سازد:
/// حدود ۲۱٪ ارتفاعِ صفحه، رو به بالا.
///
/// ⚠️ این اعداد **لازم نیست دقیق باشند**. مورف هم‌زمان با محوشدن اجرا
/// می‌شود و در پایان شفافیتِ لوگو صفر است؛ یک خطای چند ده پیکسلی زیرِ
/// شفافیتِ رو به صفر دیده نمی‌شود. به همین دلیل اندازه‌گیریِ زنده
/// (که یک `RenderObject` و یک `GlobalKey` اضافه می‌کرد — و `GlobalKey` روی
/// خودِ قهرمان، ورودِ دوبارهٔ انیمیشن را می‌شکست) کنار گذاشته شد.
const double kAuthLogoCenterRatio = 0.218;

/// عرضِ لوگو در صفحهٔ ورود — اندازهٔ مقصدِ مورف.
const double kAuthLogoWidth = 230;

/// جایگاهِ قهرمانِ اسپلش، نسبتی از ارتفاع.
const double kSplashHeroCenterRatio = 0.427;

/// بزرگ‌نماییِ کلِ صحنه در لحظهٔ خروج — «دوربین به داخلِ بازی می‌رود».
///
/// ⚠️ این عدد فقط تزئینی نیست: چون مورفِ قهرمان **داخلِ** همین تبدیل اجرا
/// می‌شود، هر جابه‌جایی و هر مقیاسی که برای قهرمان حساب می‌کنیم در نهایت
/// در این عدد ضرب می‌شود. نسخهٔ اول این را در نظر نگرفته بود و اندازه‌گیری
/// نشان داد لوگو ۱۰٪ بزرگ‌تر و ۲۴ پیکسل بالاتر از جایگاهِ واقعی‌اش در
/// صفحهٔ ورود می‌نشیند — یعنی مورف به «تقریباً همان‌جا» می‌رسید. حالا هر دو
/// تبدیل با همین عدد تصحیح می‌شوند.
const double kSplashExitZoom = 1.10;

class SplashScreen extends StatefulWidget {
  const SplashScreen({
    super.key,
    required this.boot,
    this.paused = false,
  });

  /// دروازهٔ واقعیِ راه‌اندازی. صفحه فقط **نشان می‌دهد**؛ هیچ کاری خودش
  /// انجام نمی‌دهد و هیچ زمان‌بندی‌ای نمی‌سازد.
  final BootController boot;

  /// وقتی پخشِ ویدیو/تبِ دیگری جلوی صفحه است. (امروز استفاده نمی‌شود ولی
  /// قراردادِ توقف، بخشی از رفتارِ درستِ هر انیمیشنِ طولانی است.)
  final bool paused;

  /// حالا عمومی است (بدونِ زیرخط) چون `main.dart` یک `GlobalKey` روی آن
  /// نگه می‌دارد تا پیش از تعویضِ صفحه، خروجِ سینمایی را صدا بزند.
  @override
  State<SplashScreen> createState() => SplashScreenState();
}

class SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  // ── محیط: نورافکن + غبار ──────────────────────────────────────────────
  //
  // ۱۸ ثانیه. آهسته‌تر از این، حرکتِ غبار دیده نمی‌شود؛ تندتر، مثلِ
  // باران می‌شود. `repeat()` بدونِ `reverse` چون همه‌چیز با توابعِ
  // مثلثاتی نوشته شده و در نقطهٔ اتصال گسستگی ندارد.
  late final AnimationController _ambient = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 18000),
  );

  // ── تقدیر ────────────────────────────────────────────────────────────
  late final AnimationController _curtain = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 380),
  );

  /// جرقهٔ پایان: یک برقِ کوتاه روی نوار وقتی به ۱۰۰٪ رسید.
  late final AnimationController _finish = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 620),
  );

  /// مقدارِ پیشرفتِ نمایش‌داده‌شده — نرم دنبالِ مقدارِ واقعی می‌آید تا
  /// نوار تکان نخورد.
  ///
  /// ⚠️ این **تعیین‌کنندهٔ زمان‌بندی نیست**: اگر کارِ واقعی کندتر باشد،
  /// مقدارِ واقعی جلو می‌زند و نرم‌سازی فقط نویزِ پله‌ای را می‌گیرد. اگر
  /// سریع تمام شود، نوار همان‌جا متوقف می‌ماند و منتظر می‌ماند.
  late final AnimationController _bar = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  );

  ValueNotifier<double> get _progress => widget.boot.progress;

  bool _finishArmed = false;
  bool _entered = false;

  /// عرضِ جاریِ قهرمان. در `build` ثبت می‌شود (بدونِ `setState` — یک
  /// ثبتِ ساده، نه تغییرِ وضعیت) تا `exit()` بتواند نسبتِ اندازهٔ مقصد را
  /// حساب کند.
  double _logoWidth = 0;

  /// مقصدِ مورف. در `exit()` حساب می‌شود، چون تا آن لحظه نمی‌دانیم صفحه
  /// چقدر بلند است.
  double _handoffDy = 0;
  double _handoffScale = 1;

  /// زیرِ «کاهش حرکت» هر چیزی که می‌چرخد خاموش است.
  bool _reduceMotion = false;

  @override
  void initState() {
    super.initState();
    _progress.addListener(_onProgress);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // MediaQuery فقط از اینجا قابل خواندن است (نه در initState)، و چون
    // کاربر می‌تواند این تنظیم را در همان لحظه عوض کند، هر تغییرِ وابستگی
    // دوباره بررسی می‌شود.
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduce != _reduceMotion) {
      _reduceMotion = reduce;
      final target = _progress.value.clamp(0.0, 1.0);
      if (reduce) {
        _ambient.stop();
        _bar.value = target;
      } else {
        _ambient.repeat();
        _bar.animateTo(target,
            duration: const Duration(milliseconds: 650),
            curve: Curves.easeOutCubic);
      }
    }
    _syncEntered();
  }

  /// ورودِ لوگو، فقط وقتی پخش می‌شود که دروازه واقعاً شروع شده باشد.
  ///
  /// این یک جزئیاتِ کوچک ولی مهم است: `AnimatedLogo` انیمیشنِ ورودِ خودش
  /// را در `initState` می‌سازد. اگر صفحه پیش از شروعِ دروازه ساخته شود،
  /// پرش تمام می‌شود و کاربر فقط نشستنِ انتهایی را می‌بیند.
  void _syncEntered() {
    final started = widget.boot.stage.value != null;
    if (started && !_entered) {
      setState(() => _entered = true);
    } else if (!started && _entered) {
      setState(() => _entered = false);
    }
  }

  void _onProgress() {
    if (!mounted) {
      _syncEntered();
      return;
    }
    final target = _progress.value.clamp(0.0, 1.0);
    _syncEntered();

    if (_reduceMotion) {
      _bar.value = target;
    } else {
      // مدت بر اساس فاصلهٔ باقی‌مانده: یک پلهٔ کوچک نباید ۶۵۰ms طول بکشد،
      // وگرنه نوار از کارهای واقعی عقب می‌ماند و در پایان مثلِ زامبی
      // می‌خزد.
      final remaining = (target - _bar.value).abs();
      _bar.animateTo(
        target,
        duration: Duration(milliseconds: (90 + 560 * remaining).round()),
        curve: Curves.easeOutCubic,
      );
    }

    if (target >= 1 && !_finishArmed) {
      _finishArmed = true;
      if (!_reduceMotion) _finish.forward(from: 0);
    }
  }

  @override
  void didUpdateWidget(covariant SplashScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.paused != widget.paused) {
      if (widget.paused) {
        _ambient.stop();
      } else if (!_reduceMotion) {
        _ambient.repeat();
      }
    }
  }

  @override
  void dispose() {
    // ترتیب مهم است: اول گوش‌دادن را قطع می‌کنیم تا یک notify دیرهنگام
    // روی کنترلرِ مرده ننشیند.
    _progress.removeListener(_onProgress);
    _ambient.dispose();
    _curtain.dispose();
    _finish.dispose();
    _bar.dispose();
    super.dispose();
  }

  /// خروجِ سینمایی: لوگو بزرگ می‌شود و محو («به داخلِ بازی می‌رود»).
  ///
  /// `main.dart` قبل از تعویضِ صفحه این را صدا می‌زند، پس انتقال یک
  /// محوِ سادهٔ پیش‌فرض نیست — حرکتِ خودِ برند آن را می‌سازد.
  Future<void> exit() async {
    if (_reduceMotion || !mounted || _curtain.isAnimating) return;

    // ── مقصدِ مورف ──
    //
    // «قهرمان از وسطِ صفحه بلند می‌شود و همان‌جا می‌نشیند که صفحهٔ ورود
    // انتظارش را دارد.» این چیزی است که خواستهٔ طرح نامش را «مورفِ پیوسته»
    // گذاشته؛ بدونِ آن، کاربر یک پرشِ ۱۷۶ پیکسلی بین دو صفحه می‌دید.
    final h = MediaQuery.sizeOf(context).height;
    if (_logoWidth > 0) {
      // هر دو با `kSplashExitZoom` تقسیم می‌شوند — توضیحش بالای همان ثابت.
      _handoffDy =
          (kAuthLogoCenterRatio - kSplashHeroCenterRatio) * h / kSplashExitZoom;
      _handoffScale = kAuthLogoWidth / _logoWidth / kSplashExitZoom;
      // یک بازسازی، تا ویجتِ قهرمان با مقصدِ تازه ساخته شود؛ بعدش کنترلر
      // از صفر تا یک می‌رود و مقصد را طی می‌کند.
      setState(() {});
    }

    try {
      // `orCancel` تا وقتی انیمیشن تمام نشده کامل نمی‌شود؛ اگر صفحه در
      // میانهٔ راه از درخت بیرون بیاید (مثلاً کاربر اپ را ببندد) این Future
      // لغو می‌شود و بدونِ این try/catch یک استثنای بی‌صاحب در لاگ می‌نشیند.
      await _curtain.forward().orCancel;
    } catch (_) {
      // لغو شد — یعنی صفحه رفت. کاری برای انجام نیست.
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

    return Scaffold(
      // بدونِ AppBar: هیچ چیزی بالای صفحه نباید سایه بیندازد.
      backgroundColor: BrandColors.darkBg,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── ۱. زمینِ شبانه ──
          const ColoredBox(color: BrandColors.darkBg),

          // ── ۲ + ۳. نورافکن و غبار ──
          if (!reduce)
            RepaintBoundary(
              child: AnimatedBuilder(
                animation: _ambient,
                builder: (context, _) => CustomPaint(
                  painter: _StadiumPainter(
                    t: _ambient.value,
                    seed: 7,
                    // نور را کمی به سمتِ بالا-راست می‌بریم تا وزنِ تصویر
                    // پشتِ لوگو بماند و چشم را از آن جدا نکند.
                    focus: const Alignment(0, -0.18),
                  ),
                  size: size,
                ),
              ),
            ),

          // ── ۴. قهرمان ──
          if (!reduce)
            AnimatedBuilder(
              animation: _curtain,
              builder: (context, child) {
                final t = Curves.easeInCubic.transform(_curtain.value);
                return Opacity(
                  opacity: 1 - t,
                  child: Transform.scale(scale: 1 + 0.10 * t, child: child),
                );
              },
              child: _Hero(
                progress: _bar,
                finish: _finish,
                enabled: _entered && !reduce,
                boot: widget.boot,
                curtain: _curtain,
                onLogoWidth: (w) => _logoWidth = w,
                handoffDy: _handoffDy,
                handoffScale: _handoffScale,
              ),
            )
          else
            _Hero(
              progress: _bar,
              finish: _finish,
              enabled: false,
              boot: widget.boot,
              curtain: _curtain,
              onLogoWidth: (w) => _logoWidth = w,
              handoffDy: _handoffDy,
              handoffScale: _handoffScale,
            ),
        ],
      ),
    );
  }
}

/// ستونِ مرکزی: لوگو، نامِ بازی، متنِ مرحله، نوارِ پیشرفت، شمارندهٔ درصد.
class _Hero extends StatelessWidget {
  const _Hero({
    required this.progress,
    required this.finish,
    required this.enabled,
    required this.boot,
    required this.curtain,
    required this.onLogoWidth,
    required this.handoffDy,
    required this.handoffScale,
  });

  final Animation<double> progress;
  final Animation<double> finish;
  final bool enabled;
  final BootController boot;

  /// پیشرفتِ خروج (۰ تا ۱) — همان کنترلری که صفحه را محو می‌کند. یک
  /// منبعِ زمان برای دو حرکت، پس هرگز از هم جدا نمی‌افتند.
  final Animation<double> curtain;

  /// عرضِ محاسبه‌شدهٔ قهرمان به بیرون گزارش می‌شود.
  final void Function(double) onLogoWidth;

  /// مقصدِ مورف: چقدر بالا و چقدر بزرگ‌تر.
  final double handoffDy;
  final double handoffScale;

  @override
  Widget build(BuildContext context) {
    // جهتِ راست‌به‌چپ با `Directionality` محلی تضمین می‌شود تا این صفحه
    // به زبانِ انتخاب‌شدهٔ گوشی وابسته نباشد (اپ تک‌زبانه است ولی قراردادِ
    // RTL باید صریح باشد).
    return Directionality(
      textDirection: TextDirection.rtl,
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            // اندازهٔ قهرمان از پنجرهٔ واقعی می‌آید، نه از یک عددِ ثابت:
            // روی گوشیِ کوچک ۲۳۰ پیکسل با نوار و متن‌ها همپوشانی می‌کرد.
            final logoWidth =
                math.min(260.0, math.max(150.0, constraints.maxHeight * 0.30));
            onLogoWidth(logoWidth);

            // ═══════════════════════════════════════════════════════
            // ترکیب‌بندی — بعد از دیدنِ فریم‌های واقعی بازچینی شد
            // ═══════════════════════════════════════════════════════
            //
            // نسخهٔ اول نامِ برند را دو بار نشان می‌داد (یک‌بار داخلِ خودِ
            // تصویرِ لوگو و یک‌بار به‌صورت متن). حذف شد و جایش نه یک متنِ
            // تازه، بلکه **فاصله** نشست: کارکرد اصلیِ آن خط، جدا کردنِ لوگو
            // از نوارِ پیشرفت بود و فاصله این کار را بی‌صدا انجام می‌دهد.
            //
            // قهرمان و زیرنویسش بالا می‌مانند؛ نوار و شمارنده و پیامِ پایین
            // کنارِ هم می‌نشینند. یعنی «چیزِ اصلی» و «وضعیتِ بارگذاری» دو
            // ناحیهٔ جدا هستند و چشم بین‌شان سرگردان نمی‌شود.
            return Column(
              children: [
                const Spacer(flex: 4),

                // لوگو + هاله. کلیدِ `enabled` جابه‌جاییِ درخت را هنگامِ
                // شروعِ دروازه انجام می‌دهد، پس پرش از فریمِ اولِ واقعی
                // اجرا می‌شود، نه از فریمی که کاربر ندیده.
                // ── مورفِ انتقال ──
                //
                // قهرمان در طولِ خروج، هم‌زمان با محوشدنِ صفحه، به سمتِ
                // جایگاهِ لوگو در صفحهٔ ورود می‌رود و به اندازهٔ آن
                // می‌رسد. نتیجه: کاربر «پرش» نمی‌بیند؛ می‌بیند که همان
                // نشان از وسطِ صفحه بلند می‌شود و جایی می‌نشیند که صفحهٔ
                // بعد منتظرش است.
                //
                // حرکت فقط روی خودِ قهرمان است، نه کلِ ستون: متنِ مرحله و
                // نوارِ پیشرفت هم دارند محو می‌شوند و باید سرِ جایشان
                // بمانند. اگر همه با هم پرواز می‌کردند، حرکت شبیهِ خطای
                // چیدمان می‌شد.
                AnimatedBuilder(
                  animation: curtain,
                  builder: (context, child) {
                    // همان منحنیِ زومِ بیرونی. اگر دو منحنیِ متفاوت باشند،
                    // مورف و زوم در میانهٔ راه از هم جدا می‌افتند و تصویر
                    // برای یک لحظه «لرزان» می‌شود.
                    final t = Curves.easeInCubic.transform(curtain.value);
                    return Transform.translate(
                      offset: Offset(0, handoffDy * t),
                      child: Transform.scale(
                        scale: 1 + (handoffScale - 1) * t,
                        child: child,
                      ),
                    );
                  },
                  child: AnimatedLogo(
                    key: ValueKey(enabled),
                    width: logoWidth,
                    asset: 'assets/brand/logo_large.webp',
                    // هینتِ رمزگشایی: ۱۱۳۰×۸۸۳ خام ≈ ۴ مگابایت می‌شود.
                    //
                    // ✅ همین عدد باید در `main.dart` هم (کارِ گرم‌کردنِ
                    // دارایی‌ها) بیاید، وگرنه کشِ تصویر آن را یک ورودیِ جدا
                    // حساب می‌کند و رمزگشایی دوباره انجام می‌شود. یک عدد، دو
                    // مصرف‌کننده، یک تعریف: `kSplashLogoCacheWidth`.
                    cacheWidth: kSplashLogoCacheWidth,
                    intro: enabled,
                    entrance: LogoEntrance.playful,
                  ),
                ),

                const SizedBox(height: 38),

                // ── پیامِ دروازه ──
                //
                // ورودی، خروجیِ مشترک: پیام توسط خودِ دروازه تعیین می‌شود
                // (یا متنِ مرحله، یا درخواستِ تصمیم پس از شکست).
                _StatusLine(boot: boot),

                const Spacer(flex: 3),

                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 44),
                  child: _ProgressBar(progress: progress, finish: finish),
                ),

                const SizedBox(height: 14),
                _PercentLine(progress: progress),

                const SizedBox(height: 26),
                const _FooterNote(),
                const SizedBox(height: 18),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// خطِ وضعیت: از `boot.label` / `boot.notice` تغذیه می‌شود.
///
/// هر تغییرِ متن با یک ورودِ کوچک از پایین، **توجه** را جلب می‌کند — بدونِ
/// آن، عوض‌شدنِ جمله در پایینِ صفحه دیده نمی‌شود و کاربر فکر می‌کند اپ
/// گیر کرده.
class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.boot});

  final BootController boot;

  @override
  Widget build(BuildContext context) {
    // ⚠️ اینجا **`AnimatedSize` نباشد**. نسخهٔ اول داشت و در اولین فریم
    // از عرضِ صفر شروع می‌کرد؛ نتیجه این بود که کاربر در لحظهٔ ورود یک
    // تکهٔ وسطِ جمله را می‌دید («یکن را روی زمین م»). عرض ثابت و از پیش
    // معلوم، هم این ایراد را می‌بندد و هم از پرشِ چیدمان موقعِ عوض‌شدنِ
    // متن جلوگیری می‌کند.
    return SizedBox(
      width: double.infinity,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        transitionBuilder: (child, anim) => FadeTransition(
          opacity: anim,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.35),
              end: Offset.zero,
            ).animate(
                CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)),
            child: child,
          ),
        ),
        child: ValueListenableBuilder<String?>(
          valueListenable: boot.notice,
          builder: (context, notice, _) {
            if (notice != null) {
              return KeyedSubtree(
                key: const ValueKey('notice'),
                child: _FailureCard(boot: boot, message: notice),
              );
            }
            return ValueListenableBuilder<String>(
              key: const ValueKey('stage'),
              valueListenable: boot.label,
              builder: (context, label, _) => Text(
                // دروازه پیش از اولین کار، متنِ خالی دارد؛ تا آن لحظه
                // متنِ ثابتِ برند می‌ماند تا جمله‌ای خالی ظاهر نشود.
                label.isEmpty ? 'آماده‌سازیِ زمین…' : label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15.5,
                  height: 1.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white.withValues(alpha: 0.88),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// کارتِ خرابی — **هرگز** کاربر را قفل نمی‌کند.
class _FailureCard extends StatelessWidget {
  const _FailureCard({required this.boot, required this.message});

  final BootController boot;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 28),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0E1727),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BrandColors.amber.withValues(alpha: 0.34)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14.5,
              height: 1.55,
              fontWeight: FontWeight.w700,
              color: Colors.white.withValues(alpha: 0.9),
            ),
          ),
          const SizedBox(height: 10),
          // `Wrap` به‌جای `Row`: با بزرگ‌بودنِ فونتِ سیستم، دو دکمه زیرِ هم
          // می‌روند به‌جای اینکه از صفحه بیرون بزنند.
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 8,
            children: [
              _SmallButton(
                label: 'تلاش دوباره',
                primary: true,
                onTap: boot.retry,
              ),
              _SmallButton(
                label: 'رد کردن',
                primary: false,
                onTap: boot.skip,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SmallButton extends StatelessWidget {
  const _SmallButton({
    required this.label,
    required this.primary,
    required this.onTap,
  });

  final String label;
  final bool primary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: primary
          ? BrandColors.emerald.withValues(alpha: 0.16)
          : Colors.white.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: primary
                  ? BrandColors.emerald
                  : Colors.white.withValues(alpha: 0.78),
            ),
          ),
        ),
      ),
    );
  }
}

/// نوارِ پیشرفتِ نازک با گرادیانِ زمردی → طلایی.
///
/// چرا این دو رنگ: زمرد رنگِ برند است و طلایی رنگِ «جایزه». مسیرِ
/// بارگذاری همان مسیرِ خودِ بازی است — کارت، امتیاز، جایزه. سهٔ ایمنی:
/// نوکِ نوار یک نقطهٔ نور دارد تا حتی روی گوشیِ کوچک هم محلِ پیشرفت
/// خوانا باشد.
class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.progress, required this.finish});

  final Animation<double> progress;
  final Animation<double> finish;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([progress, finish]),
      builder: (context, _) {
        final v = progress.value.clamp(0.0, 1.0);
        return SizedBox(
          height: 7,
          child: LayoutBuilder(
            builder: (context, c) {
              return Stack(
                children: [
                  // ریلِ خالی. شفاف، نه خاکستریِ روشن: روی زمینهٔ شب
                  // یک ریلِ پررنگ مثلِ نوارِ خطا خوانده می‌شود.
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.07),
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                  // ── پرکننده ──
                  //
                  // دو نکتهٔ ظاهری که با چشم روی سایتِ زنده پیدا شدند:
                  //
                  //   ۱. **جهتِ گرادیان باید راست‌به‌چپ باشد.** نوار داخلِ
                  //      یک `Directionality.rtl` از سمتِ راست پر می‌شود، و
                  //      گرادیانِ پیش‌فرض (`centerLeft → centerRight`) رنگِ
                  //      طلایی را دقیقاً روی همان لبه‌ای می‌گذاشت که نوار از
                  //      آن شروع می‌شود. یعنی کاربر در ۵٪ اول **طلا** می‌دید:
                  //      رنگِ جایزه، پیش از به‌دست‌آوردنش.
                  //   ۲. **گرادیان باید به عرضِ ریل کشیده شود و بعد بریده
                  //      شود**، نه به عرضِ خودِ نوارِ پر. نسخهٔ اول گرادیان را
                  //      در عرضِ نوار می‌کشید، پس در هر درصدی هر سه رنگ فشرده
                  //      و حاضر بودند. حالا در ۵٪ فقط زمرد دیده می‌شود و
                  //      طلایی به‌عنوانِ پاداشِ رسیدن به ۱۰۰٪ ظاهر می‌شود.
                  ClipRect(
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      widthFactor: v,
                      child: SizedBox(
                        width: c.maxWidth,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              begin: Alignment.centerRight,
                              end: Alignment.centerLeft,
                              colors: [
                                Color(0xFF00D49A), // زمرد — برند
                                Color(0xFF9BE86B), // لیمویی — خودِ قلقلی
                                Color(0xFFFFC94D), // طلایی — جایزه
                              ],
                            ),
                            borderRadius: BorderRadius.circular(99),
                            boxShadow: [
                              BoxShadow(
                                color:
                                    BrandColors.emerald.withValues(alpha: 0.30),
                                blurRadius: 10,
                                spreadRadius: -1,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  // درخششِ پایان — یک برقِ کوتاه روی کلِ نوار وقتی
                  // رسید به ۱۰۰٪. «جایزه‌ای که کامل شد»، نه
                  // «چرخنده‌ای که ایستاد».
                  if (finish.value > 0 && finish.value < 1)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(99),
                            color: Colors.white.withValues(
                              alpha:
                                  0.55 * math.sin(finish.value * math.pi) * v,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

/// شمارندهٔ درصد. عددِ واقعی — نه یک انیمیشنِ ساختگیِ رو به بالا.
class _PercentLine extends StatelessWidget {
  const _PercentLine({required this.progress});

  final Animation<double> progress;

  /// رقم‌های فارسی.
  ///
  /// همه‌جای این صفحه فارسی است؛ یک «42%» لاتین آن وسط، مثلِ متنِ
  /// جای‌نگهدارِ ترجمه‌نشده خوانده می‌شود.
  ///
  /// ⚠️ اندازهٔ قلم و ترتیبِ نویسه‌ها هم از دلِ رندرِ واقعی آمد: در ۱۲٫۵
  /// پیکسل، «٪۰» شبیهِ یک نقطه بود و عدد خوانده نمی‌شد. حالا عدد اول
  /// می‌آید و یک پله بزرگ‌تر است.
  static const _fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  static String _digits(int n) =>
      n.toString().split('').map((c) => _fa[int.parse(c)]).join();

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: progress,
      builder: (context, _) => Text(
        '${_digits((progress.value.clamp(0.0, 1.0) * 100).round())}٪',
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
          color: Colors.white.withValues(alpha: 0.5),
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// پایینِ صفحه: یادآوریِ اینکه صفحهٔ بعد چه چیزی در انتظار است.
///
/// این خط کارِ بازاریابی نیست؛ کارِ **کاهش اضطراب** است. کاربر دومی
/// طولانی فقط باید بدونه منتظر چیه.
class _FooterNote extends StatelessWidget {
  const _FooterNote();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          Icons.sports_soccer_rounded,
          size: 13,
          color: BrandColors.emerald.withValues(alpha: 0.55),
        ),
        const SizedBox(width: 6),
        // `Flexible` و شکستن به خط دوم.
        //
        // ⚠️ این یک ایرادِ واقعیِ روی گوشی بود، نه فقط یک سخت‌گیریِ تست:
        // کاربری که در تنظیماتِ اندروید اندازهٔ فونت را بزرگ کرده (یا صفحهٔ
        // کوچکی دارد) با `Row`ِ سفت، این جمله از لبهٔ راست بیرون می‌زد و
        // نوارِ زردِ سرریز روی صفحهٔ بارگذاری می‌آمد. `Flexible` یعنی
        // «هرچقدر جا هست بگیر، بقیه را به خطِ بعد ببر».
        Flexible(
          child: Text(
            'کارت‌ها را جمع کن، امتیاز بگیر، به لیگ برس',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              height: 1.5,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.38),
            ),
          ),
        ),
      ],
    );
  }
}

/// نورافکن‌های ورزشگاه + غبار.
///
/// ── چرا `CustomPaint` و نه ویجت ──
///
/// ۲۲ ذره + دو مخروط، هر کدام یک ویجت، یعنی ۲۴ لایهٔ کامپوزیت در هر فریم
/// روی صفحهٔ اول. با یک `CustomPaint` می‌شود یک لایه. عددِ ۲۲ هم تصادفی
/// نیست: روی ۱۰ ذره صفحه خالی به‌نظر می‌رسد و روی ۴۰ ذره شبیه برفِ
/// تلویزیونِ قدیمی می‌شود.
class _StadiumPainter extends CustomPainter {
  _StadiumPainter({
    required this.t,
    required this.seed,
    required this.focus,
  });

  final double t;
  final int seed;
  final Alignment focus;

  static const int _particles = 22;

  @override
  void paint(Canvas canvas, Size size) {
    _paintLightCones(canvas, size);
    _paintParticles(canvas, size);
  }

  /// دو مخروطِ نور از بالای صفحه به سمتِ مرکز.
  ///
  /// نورِ ورزشگاه واقعی از بالا و از پشتِ یک لنز می‌آید؛ مخروط باریک
  /// می‌شود و لبه‌ها نرم‌اند. اینجا هم به‌جای دو مستطیلِ شفاف، دو مثلثِ
  /// نرم با درخششِ آهسته (دورهٔ ۹ ثانیه) کشیده می‌شود تا فضای بالای
  /// صفحه «نفس بکشد».
  void _paintLightCones(Canvas canvas, Size size) {
    final breathe = 0.5 + 0.5 * math.sin(t * 2 * math.pi);
    final top =
        Offset(size.width * focus.x + size.width / 2, -size.height * 0.06);
    final aim = Offset(size.width / 2, size.height * 0.58);

    // ⚠️ نسخهٔ اول این دو مخروط پررنگ‌تر و باریک‌تر بودند و روی هم یک «V»
    // درشت می‌ساختند — بیشتر شبیهِ نشانِ یک برندِ دیگر تا نورِ ورزشگاه.
    // سه تغییر: پهن‌تر (۰٫۳۶ → ۰٫۴۴)، کم‌رنگ‌تر (۰٫۰۵۵ → ۰٫۰۲۶) و
    // **نامتقارن**. تقارنِ کامل ریاضی به‌نظر می‌رسد؛ دو نورافکنِ واقعی هیچ‌وقت
    // دقیقاً هم‌شدت نیستند.
    final sides = <(double, double)>[(-1, 1.0), (1, 0.72)];

    for (final (side, strength) in sides) {
      final path = Path();
      final apex = Offset(top.dx + side * size.width * 0.16, top.dy);
      path.moveTo(apex.dx, apex.dy);
      path.lineTo(
          aim.dx - size.width * 0.44 * side, aim.dy + size.height * 0.34);
      path.lineTo(
          aim.dx + size.width * 0.12 * side, aim.dy + size.height * 0.38);
      path.close();

      canvas.drawPath(
        path,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              BrandColors.emerald
                  .withValues(alpha: (0.026 + 0.014 * breathe) * strength),
              Colors.transparent,
            ],
          ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
      );
    }
  }

  /// غبارِ معلقِ چمن.
  ///
  /// هر ذره موقعیت، اندازه و فازِ خودش را از یک `Random(seed)` ثابت
  /// می‌گیرد — یعنی هر اجرا همان تصویرِ قبلی است. تصادفِ واقعی اینجا
  /// بد است: صفحه در هر بازکردن متفاوت می‌شد و «کم‌دقت» به‌نظر می‌رسید.
  void _paintParticles(Canvas canvas, Size size) {
    final rnd = math.Random(seed);
    for (var i = 0; i < _particles; i++) {
      final phase = rnd.nextDouble();
      final x0 = rnd.nextDouble();
      // شعاعِ ۰٫۵ تا ۱٫۶ پیکسل: بزرگ‌تر از این شبیه حباب می‌شود.
      final r = 0.5 + rnd.nextDouble() * 1.1;

      // هر ذره با سرعتِ خودش بالا می‌رود و از بالا بیرون می‌زند و از پایین
      // برمی‌گردد — بدونِ پرش، چون حرکت در فضای مُد ۱ ادامه دارد.
      final y = ((phase + t * (0.35 + rnd.nextDouble() * 0.5)) % 1.0);
      final x = (x0 + 0.035 * math.sin((t + phase) * 2 * math.pi)) * size.width;
      final alpha = (1 - y) * 0.30 + 0.05;

      canvas.drawCircle(
        Offset(x, size.height * (1 - y)),
        r,
        Paint()
          ..color = (i % 4 == 0 ? BrandColors.lime : Colors.white)
              .withValues(alpha: alpha),
      );
    }
  }

  @override
  bool shouldRepaint(_StadiumPainter old) => old.t != t;
}
