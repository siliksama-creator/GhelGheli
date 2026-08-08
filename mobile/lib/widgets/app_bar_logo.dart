// لوگوی زندهٔ نوار بالا.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این ویجت بازنویسی شد
// ═══════════════════════════════════════════════════════════════════════════
//
// نقد مالک: «اون درخشش لوگو که گفتم صفحه اصلی اون بالا منظورم حالت
// انیمیشنی بود نه یه درخشش ساده و خشک بی تحرک».
//
// حق داشت. نسخهٔ قبلی فقط `alpha` یک BoxShadow را در ۳ ثانیه بالا و
// پایین می‌برد. از نظر فنی انیمیشن بود، از نظر چشم نه: تغییرِ صرفِ
// شفافیت، **حرکت** نیست. چشم انسان به جابه‌جایی و چرخش حساس است، نه به
// روشناییِ آهسته — برای همین آن نسخه «خشک و بی‌تحرک» دیده می‌شد.
//
// ═══════════════════════════════════════════════════════════════════════════
// چهار حرکتِ هم‌زمان، با دوره‌های اول (prime) نسبت به هم
// ═══════════════════════════════════════════════════════════════════════════
//
//   ۱. **حلقهٔ چرخانِ رنگین** — یک گرادیانِ مخروطی (SweepGradient) که
//      دور لوگو می‌چرخد. این اصلی‌ترین منبعِ حسِ «زنده بودن» است: چرخش
//      یکنواخت را چشم فوراً می‌گیرد.
//   ۲. **جرقهٔ مداری** — یک نقطهٔ نورانی که روی همان حلقه می‌دود و یک
//      دنبالهٔ کوتاه دارد. حلقهٔ تنها بعد از چند ثانیه یکنواخت می‌شود؛
//      جرقه یک «رخداد» در هر دور می‌سازد.
//   ۳. **تابشِ عبوری روی خود لوگو** — یک نوارِ نورِ مورب که از روی
//      تصویر رد می‌شود و به آلفای خودِ لوگو ماسک شده. بدون ماسک، نوار
//      از روی گوشه‌های خالی هم رد می‌شود و مثل خط اسکنِ خراب دیده
//      می‌شود.
//   ۴. **تنفس و تابِ خیلی کوچک** — مقیاس ±۲.۵٪ و چرخشِ ±۱.۵ درجه. این
//      لایه است که لوگو را از یک «تصویر با افکت» به یک «چیزِ زنده»
//      تبدیل می‌کند.
//
// دوره‌ها عمداً ۳۲۰۰، ۴۷۰۰ و ۲۹۰۰ میلی‌ثانیه‌اند و نه مضربِ هم: اگر
// هم‌دوره بودند، هر چند ثانیه همه با هم به اوج می‌رسیدند و یک ضربانِ
// آشکارِ تکراری می‌ساختند که بدتر از بی‌حرکتی است.
//
// ═══════════════════════════════════════════════════════════════════════════
// هزینه — چون این ویجت در «همهٔ» صفحه‌هاست
// ═══════════════════════════════════════════════════════════════════════════
//
// نوار بالا در تمام ۱۱ صفحهٔ کاربر حاضر است، پس هر هزینه‌ای اینجا هزینهٔ
// کل اپ است. چهار تصمیم:
//
//   • **یک AnimationController**، نه چهار. هر حرکت با ضریبِ خودش از یک
//     ساعتِ مشترک می‌خواند. چهار کنترلر یعنی چهار Ticker و چهار بار
//     برنامه‌ریزیِ فریم.
//   • **RepaintBoundary** دورش. بدون آن، هر فریمِ این لوگو کل نوار بالا
//     (پنج آیکون + عنوان + نشان‌ها) را دوباره رنگ می‌کند.
//   • **`cacheWidth: 96`** روی تصویر. لوگو ۷۲۰ پیکسل است؛ بدون این
//     راهنما یک بیت‌مپِ ۱.۶ مگابایتی برای کل نشست در حافظه می‌ماند تا
//     ۳۲ پیکسل رسم شود. با ۹۶ (۳۲ در ۳x) می‌شود ۳۷ کیلوبایت.
//   • **توقف کامل با reduce-motion.** کسی که در تنظیمات سیستم انیمیشن
//     را خاموش کرده، فریمِ ثابت می‌گیرد و کنترلر اصلاً نمی‌چرخد —
//     هم الزامِ WCAG 2.3.3 و هم صرفه‌جوییِ باتری.
//
// حلقه و جرقه هر دو در **یک** CustomPainter کشیده می‌شوند (چند
// `drawArc`)، نه با ویجت‌های تودرتو، پس کل این جلوه یک لایهٔ نقاشی است.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'animated_logo.dart' show BlendMask;

class AppBarLogo extends StatefulWidget {
  const AppBarLogo({super.key, this.size = 34});

  final double size;

  @override
  State<AppBarLogo> createState() => _AppBarLogoState();
}

class _AppBarLogoState extends State<AppBarLogo>
    with SingleTickerProviderStateMixin {
  /// ساعتِ مشترکِ همهٔ حرکت‌ها.
  ///
  /// طولش کوچک‌ترین مضرب مشترکِ تقریبیِ سه دوره است تا حلقه بدون پرش
  /// بسته شود. مقدار خودش (۰..۱) خام استفاده نمی‌شود؛ هر حرکت با ضریبِ
  /// خودش از آن می‌خواند.
  late final AnimationController _clock;

  /// در initState ساخته می‌شود، نه `late final` روی فیلد — وگرنه اگر
  /// ویجت پیش از اولین build حذف شود، dispose() اولین جایی است که
  /// createTicker را روی عنصرِ غیرفعال صدا می‌زند و فلاتر پرتاب می‌کند:
  /// «Looking up a deactivated widget's ancestor is unsafe».
  @override
  void initState() {
    super.initState();
    _clock = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 9400),
    );
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = widget.size;

    // احترام به تنظیمِ سیستم. برای کسی که vestibular disorder دارد،
    // تفاوت یک صفحهٔ قابل استفاده و یک صفحهٔ تهوع‌آور همین است.
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduceMotion) {
      if (_clock.isAnimating) _clock.stop();
    } else if (!_clock.isAnimating) {
      _clock.repeat();
    }

    // تصویر یک بار ساخته می‌شود و در هر فریم دوباره استفاده — نه اینکه
    // هر فریم یک Image.asset تازه بسازیم.
    final logo = ClipOval(
      child: Image.asset(
        'assets/brand/logo.webp',
        width: s,
        height: s,
        fit: BoxFit.cover,
        cacheWidth: (s * 3).round(),
        errorBuilder: (_, __, ___) => Container(
          width: s,
          height: s,
          color: scheme.surface,
          alignment: Alignment.center,
          child: Icon(Icons.sports_soccer_rounded, size: s * 0.5, color: scheme.onSurface),
        ),
      ),
    );

    if (reduceMotion) {
      return SizedBox(width: s + 8, height: s + 8, child: Center(child: logo));
    }

    return RepaintBoundary(
      child: SizedBox(
        width: s + 8,
        height: s + 8,
        child: AnimatedBuilder(
          animation: _clock,
          builder: (context, child) {
            final t = _clock.value;
            // سه فازِ مستقل با دوره‌های غیرمضرب.
            final spin = (t * 9400 / 3200) % 1.0;   // حلقه و جرقه
            final sweep = (t * 9400 / 4700) % 1.0;  // تابشِ عبوری
            final breath = (t * 9400 / 2900) % 1.0; // تنفس و تاب

            final bs = math.sin(breath * math.pi * 2);

            return Stack(
              alignment: Alignment.center,
              children: [
                // ۱+۲ ── حلقهٔ چرخان و جرقهٔ مداری
                Positioned.fill(
                  child: CustomPaint(
                    painter: _OrbitPainter(
                      spin: spin,
                      a: scheme.primary,
                      b: scheme.secondary,
                      // درخشش با تنفس هماهنگ است تا دو حرکت یکی حس شوند،
                      // نه دو افکتِ بی‌ربط روی هم.
                      glow: 0.5 + bs * 0.5,
                    ),
                  ),
                ),

                // ۴ ── تنفس و تاب، روی خود لوگو
                Transform.rotate(
                  angle: bs * 0.026, // ~۱.۵ درجه
                  child: Transform.scale(
                    scale: 1 + bs * 0.025,
                    child: SizedBox(
                      width: s,
                      height: s,
                      child: Stack(
                        children: [
                          Positioned.fill(child: child!),

                          // ۳ ── تابشِ عبوری، ماسک‌شده به شکل خود لوگو
                          //
                          // BlendMode.plus نور را **اضافه** می‌کند به‌جای
                          // اینکه رویش بکشد؛ وگرنه سبزِ برند برای یک لحظه
                          // سفید می‌شد و مثل خطای رندر دیده می‌شد.
                          Positioned.fill(
                            child: IgnorePointer(
                              child: ClipOval(
                                child: BlendMask(
                                  blendMode: BlendMode.plus,
                                  child: ShaderMask(
                                    blendMode: BlendMode.dstIn,
                                    shaderCallback: (rect) => LinearGradient(
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                      colors: const [
                                        Colors.transparent,
                                        Colors.white,
                                        Colors.transparent,
                                      ],
                                      stops: _sweepStops(sweep),
                                    ).createShader(rect),
                                    child: ColorFiltered(
                                      colorFilter: ColorFilter.mode(
                                        Colors.white.withValues(alpha: 0.42),
                                        BlendMode.srcATop,
                                      ),
                                      child: child,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
          child: logo,
        ),
      ),
    );
  }

  /// نوارِ نور را از روی گرادیان عبور می‌دهد.
  ///
  /// فقط در ۳۵٪ اولِ دوره حرکت می‌کند و بقیهٔ زمان بیرون از قاب پارک
  /// است. تابشی که دائم می‌رود و می‌آید، به‌جای «برق زدن»، «لرزیدن»
  /// دیده می‌شود.
  static List<double> _sweepStops(double t) {
    const travel = 0.35;
    final p = t < travel ? t / travel : 1.0;
    final centre = -0.35 + p * 1.7;
    const half = 0.16; // پهن‌تر از نسخهٔ صفحهٔ ورود، چون سطح خیلی کوچک‌تر است
    return [
      (centre - half).clamp(0.0, 1.0),
      centre.clamp(0.0, 1.0),
      (centre + half).clamp(0.0, 1.0),
    ];
  }
}

/// حلقهٔ چرخان + جرقهٔ مداری + هالهٔ نفس‌کش.
///
/// هر سه در یک نقاش‌اند چون هر سه روی یک دایره‌اند و جدا کردنشان یعنی
/// سه لایهٔ نقاشیِ جدا برای چیزی که ۳۴ پیکسل است.
class _OrbitPainter extends CustomPainter {
  _OrbitPainter({
    required this.spin,
    required this.a,
    required this.b,
    required this.glow,
  });

  /// ۰..۱ — یک دور کامل.
  final double spin;
  final Color a, b;

  /// ۰..۱ — شدت هاله، هم‌فاز با تنفسِ لوگو.
  final double glow;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = math.min(size.width, size.height) / 2 - 1.6;
    final angle = spin * math.pi * 2;
    final rect = Rect.fromCircle(center: c, radius: r);

    // ── هاله ──
    //
    // MaskFilter به‌جای BoxShadow: اینجا داخل یک نقاش هستیم و
    // `drawCircle` با blur ارزان‌تر از ساختنِ یک لایهٔ سایه است.
    canvas.drawCircle(
      c,
      r * 0.92,
      Paint()
        ..color = a.withValues(alpha: 0.16 + glow * 0.20)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 4 + glow * 5),
    );

    // ── حلقهٔ چرخان ──
    //
    // SweepGradient با transform می‌چرخد. رنگ‌ها به خودشان برمی‌گردند
    // (a → b → a) وگرنه در نقطهٔ شروع یک درزِ رنگیِ آشکار می‌ماند.
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..shader = SweepGradient(
          colors: [
            a.withValues(alpha: 0.95),
            b.withValues(alpha: 0.35),
            a.withValues(alpha: 0.15),
            b.withValues(alpha: 0.55),
            a.withValues(alpha: 0.95),
          ],
          stops: const [0.0, 0.28, 0.55, 0.80, 1.0],
          transform: GradientRotation(angle),
        ).createShader(rect),
    );

    // ── دنبالهٔ جرقه ──
    //
    // یک کمانِ کوتاهِ محوشونده پشتِ جرقه. بدون دنباله، نقطه «می‌پرد»
    // به‌جای اینکه «بدود» — مغز بدون رد، حرکت را دنبال نمی‌کند.
    canvas.drawArc(
      rect,
      angle - 0.72,
      0.72,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(
          colors: [
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: 0.75),
          ],
          stops: const [0.0, 1.0],
          startAngle: angle - 0.72,
          endAngle: angle,
        ).createShader(rect),
    );

    // ── خود جرقه ──
    final sparkPos = Offset(
      c.dx + math.cos(angle) * r,
      c.dy + math.sin(angle) * r,
    );
    canvas.drawCircle(
      sparkPos,
      2.6,
      Paint()
        ..color = Colors.white
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.2),
    );
    canvas.drawCircle(sparkPos, 1.5, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant _OrbitPainter old) =>
      old.spin != spin || old.glow != glow || old.a != a || old.b != b;
}
