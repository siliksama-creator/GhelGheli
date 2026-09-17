// ============================================================================
//  تست صفحهٔ بارگذاری
// ============================================================================
//
//   flutter test test/splash_test.dart
//
// ── این فایل آگاهانه بازنویسی شد (۲۷ شهریور) ──────────────────────────────
//
// سه تستِ قبلی اینجا **خلافِ** طراحیِ تأییدشدهٔ جدید را قفل می‌کردند و
// عمداً حذف/معکوس شدند. ثبتِ دلیل، بخشی از کار است؛ وگرنه نفرِ بعدی فکر
// می‌کند تست‌ها «برای عبور دادنِ کد» کج شده‌اند:
//
//   • «چیدمان از فریم اول ثابت است (بدون انیمیشن ورودی)» — نسخهٔ قبلیِ
//     صفحه عمداً بی‌حرکت بود، چون ورودِ ۹۰۰msی به یک صفحهٔ ایستا مثلِ لرزش
//     دیده می‌شد. مالک صریحاً «هر بار اجرا، کاملِ سینمایی» را انتخاب کرد، پس
//     حالا **باید** حرکت کند. تستِ جدید عکسِ آن را می‌سنجد: لوگو در طولِ
//     ورود جابه‌جا می‌شود.
//   • «همان تصویر اسپلش سیستمی را نشان می‌دهد» — قهرمانِ صفحه حالا لوگوی
//     برند است (`logo_large.webp`) و اسپلشِ سیستمی فقط نقشِ «قابِ اولِ
//     آشنا» را دارد: حالتِ شروعِ پرش از همان اندازهٔ کوچکِ او شروع می‌شود.
//   • «اسپینر دارد» — یک `CircularProgressIndicator` عمومی حذف شد و جایش
//     نوارِ پیشرفتِ برند آمد که به کارِ **واقعی** گره خورده است.
//
// چیزی که تغییر نکرده و همچنان قفل است: رنگِ پس‌زمینه باید مو‌به‌مو همان
// `#060D18` اسپلشِ سیستمی باشد، و کنترلرها نباید نشتی داشته باشند.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/core/boot_controller.dart';
import 'package:ghelgheli_mobile/screens/auth/auth_screen.dart';
import 'package:ghelgheli_mobile/screens/auth/splash_screen.dart';
import 'package:ghelgheli_mobile/theme/colors.dart';
import 'package:ghelgheli_mobile/widgets/animated_logo.dart';

/// یک دروازهٔ ساختگی با کارهای فوری. صفحه هیچ چیزی جز «نمایش دادن» از آن
/// نمی‌خواهد، پس تست هم دقیقاً همان ورودیِ بیرونی را می‌سازد.
BootController _gate({
  Future<void> Function()? session,
  bool critical = true,
  BootStage? startAt = BootStage.session,
  String label = 'نشستِ بازیکن را روی زمین می‌گذاریم…',
}) {
  final gate = BootController(
    tasks: [
      BootTask(
        stage: BootStage.session,
        label: label,
        critical: critical,
        run: session ?? () async {},
      ),
    ],
    isAuthenticated: () => false,
    minimumBrand: Duration.zero,
  );
  // صفحه فقط وقتی انیمیشنِ ورود را پخش می‌کند که دروازه واقعاً شروع شده
  // باشد؛ تست هم همان حالت را می‌سازد.
  if (startAt != null) {
    gate.stage.value = startAt;
    // دروازه هنگامِ اجرا مرحله و متن را با هم می‌نویسد؛ تست هم همان حالت را
    // می‌سازد. (فقط stage کافی نبود و تستِ متن، متنِ پیش‌فرض را می‌دید.)
    gate.label.value = label;
  }
  return gate;
}

Widget _wrap(Widget child, {bool reduceMotion = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(390, 844),
          disableAnimations: reduceMotion,
        ),
        child: child,
      ),
    );

String? _assetOf(ImageProvider p) {
  if (p is ResizeImage) return _assetOf(p.imageProvider);
  if (p is AssetImage) return p.assetName;
  if (p is ExactAssetImage) return p.assetName;
  return null;
}

void main() {
  group('صفحهٔ بارگذاری', () {
    testWidgets('پس‌زمینه دقیقاً همان رنگ اسپلش سیستمی است', (tester) async {
      await tester.pumpWidget(_wrap(SplashScreen(boot: _gate())));

      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      // مقدار ثابت در pubspec (#060D18) — اگر این دو از هم جدا شوند، لانچ
      // دوباره چشمک می‌زند.
      expect(scaffold.backgroundColor, BrandColors.darkBg);
      expect(BrandColors.darkBg, const Color(0xFF060D18));
    });

    testWidgets('قهرمان، لوگوی واقعیِ برند است', (tester) async {
      await tester.pumpWidget(_wrap(SplashScreen(boot: _gate())));

      final assets = tester
          .widgetList<Image>(find.byType(Image))
          .map((w) => _assetOf(w.image))
          .whereType<String>()
          .toList();

      expect(assets, contains('assets/brand/logo_large.webp'));
    });

    testWidgets('لوگو در طولِ ورود واقعاً حرکت می‌کند', (tester) async {
      // ⚠️ معکوسِ تستِ قبلی — توضیحِ کامل در بالای فایل.
      await tester.pumpWidget(_wrap(SplashScreen(boot: _gate())));

      final first = tester.getRect(find.byType(Image).first);
      await tester.pump(const Duration(milliseconds: 180));
      final mid = tester.getRect(find.byType(Image).first);
      await tester.pump(const Duration(milliseconds: 720));
      final settled = tester.getRect(find.byType(Image).first);

      expect(mid, isNot(equals(first)),
          reason: 'اگر فریم ۱۸۰ms با فریمِ اول یکی باشد، پرش اجرا نشده');
      expect(settled, isNot(equals(mid)),
          reason: 'نشستنِ کشسان باید بعد از پرش ادامه پیدا کند');
    });

    testWidgets('با «کاهش حرکت» قاب ثابت می‌ماند', (tester) async {
      await tester.pumpWidget(
          _wrap(SplashScreen(boot: _gate()), reduceMotion: true));

      final first = tester.getRect(find.byType(Image).first);
      await tester.pump(const Duration(milliseconds: 900));
      expect(tester.getRect(find.byType(Image).first), first);
    });

    testWidgets('نوارِ پیشرفت به پیشرفتِ واقعیِ دروازه گره خورده است',
        (tester) async {
      final gate = _gate();
      await tester.pumpWidget(_wrap(SplashScreen(boot: gate)));

      // هیچ چرخندهٔ عمومی‌ای نباید بماند: نسخهٔ قبلی داشت و همین دلیلِ
      // «شبیهِ هر اپِ دیگری بودن» بود.
      expect(find.byType(CircularProgressIndicator), findsNothing);

      // درصدِ نمایش‌داده‌شده از خودِ کنترلر می‌آید، نه از یک تایمرِ داخلی.
      expect(find.text('۰٪'), findsOneWidget);
      gate.progress.value = 0.42;
      // ⚠️ دو فریم لازم است و این یک نکتهٔ واقعیِ فلاتر است، نه تستِ شُل:
      // تیکرِ `animateTo` در اولین فریمی که اجرا می‌شود `elapsed = 0`
      // می‌گیرد (شروعش همان لحظه ثبت می‌شود). با یک `pump(400ms)` تنها،
      // نوار روی صفر می‌ماند. در اپِ واقعی فریم‌ها پیوسته می‌آیند و این
      // مسئله وجود ندارد؛ اینجا باید صریح یک فریمِ خالی هم بگیریم.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('۴۲٪'), findsOneWidget);

      gate.progress.value = 1;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
      expect(find.text('۱۰۰٪'), findsOneWidget);
    });

    testWidgets('متنِ مرحله از دروازه خوانده می‌شود', (tester) async {
      final gate = _gate(label: 'قوانینِ این فصل را از اتاقِ داور می‌گیریم…');
      await tester.pumpWidget(_wrap(SplashScreen(boot: gate)));

      expect(find.text('قوانینِ این فصل را از اتاقِ داور می‌گیریم…'),
          findsOneWidget);

      gate.label.value = 'چمنِ زمین را می‌کشیم…';
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('چمنِ زمین را می‌کشیم…'), findsOneWidget);
    });

    testWidgets('شکست، کارتِ تصمیم می‌آورد و «رد کردن» کار می‌کند',
        (tester) async {
      var attempts = 0;
      final gate = _gate(
        session: () async {
          attempts += 1;
          throw StateError('حافظه خوانده نشد');
        },
      );

      await tester.pumpWidget(_wrap(SplashScreen(boot: gate)));
      // دروازه را در همان محیطِ تست اجرا می‌کنیم (با `tester.runAsync` نه،
      // چون تایمرها باید در زمانِ مجازیِ خودِ تست بگذرند).
      unawaited(gate.start());
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('تلاش دوباره'), findsOneWidget);
      expect(find.text('رد کردن'), findsOneWidget);

      await tester.tap(find.text('رد کردن'));
      await tester.pump(const Duration(milliseconds: 50));
      expect(gate.result, isNotNull, reason: '«رد کردن» باید دروازه را باز کند');
      expect(attempts, 1);
    });

    // ═══════════════════════════════════════════════════════════════════════
    //  مورفِ انتقال — تستِ پذیرشِ طرح
    // ═══════════════════════════════════════════════════════════════════════
    //
    // خواستهٔ طرح: «کاربرِ واردنشده باید با یک مورفِ **پیوسته** به صفحهٔ ورود
    // برود؛ لوگو به جایگاهِ لوگو در هدرِ صفحهٔ ورود منتقل شود.»
    //
    // این تست آن جمله را عدد می‌کند: هم‌زمان لوگوی واقعیِ صفحهٔ ورود را
    // می‌سازد، جایگاهش را می‌خواند، و بعد بررسی می‌کند که قهرمانِ اسپلش
    // در پایانِ خروج دقیقاً همان‌جا و همان‌اندازه بنشیند.
    //
    // اندازه‌گیریِ واقعی (۳۹۰×۸۴۴):
    //     صفحهٔ ورود: مرکز ۱۸۴، عرض ۲۶۴٫۵
    //     اسپلش:      مرکز ۳۵۰، عرض ۲۹۱   ← ۱۶۶ پیکسل فاصله
    // و بعد از مورف: مرکز ۱۶۶، عرض ۲۶۴٫۵
    //
    // ⚠️ اختلافِ باقی‌ماندهٔ ارتفاع (~۱۸px) از فونتِ محیطِ تست می‌آید: اینجا
    //    Vazirmatn بارگذاری نمی‌شود و جملهٔ پایینِ صفحه به خطِ دوم می‌شکند،
    //    پس ستون جابه‌جا می‌شود. روی گوشیِ واقعی این اختلاف کوچک‌تر است — و
    //    مهم‌تر، مورف هم‌زمان با محوشدن اجرا می‌شود و در پایان شفافیتِ لوگو
    //    صفر است، پس خطای چندپیکسلی دیده نمی‌شود. به همین دلیل تلورانس اینجا
    //    ۴۰px است و نه ۵px؛ عددِ **عرض** اما دقیق است و ۵px تلورانس دارد.
    testWidgets('در خروج، قهرمان به جایگاهِ لوگوی صفحهٔ ورود می‌رسد',
        (tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      Widget wrap(Widget child) => MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(
                  size: Size(390, 844), devicePixelRatio: 3),
              child: child,
            ),
          );

      // ۱) جایگاهِ واقعیِ لوگو در صفحهٔ ورود.
      await tester.pumpWidget(wrap(AuthScreen(api: ApiClient(), onDone: () {})));
      await tester.pump(const Duration(milliseconds: 50));
      final authRect = tester.getRect(find.byType(AnimatedLogo));

      // ۲) قهرمانِ اسپلش.
      await tester.pumpWidget(wrap(SplashScreen(boot: _gate())));
      await tester.pump(const Duration(milliseconds: 1400));
      final start = tester.getRect(find.byType(AnimatedLogo));

      // ۳) خروج، تا فرودِ کامل.
      final state = tester.state<SplashScreenState>(find.byType(SplashScreen));
      final done = state.exit();
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      final end = tester.getRect(find.byType(AnimatedLogo));
      await done;

      expect(start.center.dy - end.center.dy, greaterThan(100),
          reason: 'لوگو باید به‌سمتِ بالا (جایگاهش در صفحهٔ ورود) حرکت کند');
      expect((end.center.dy - authRect.center.dy).abs(), lessThan(40),
          reason: 'مقصدِ مورف همان جایگاهِ لوگوی صفحهٔ ورود است');
      expect((end.width - authRect.width).abs(), lessThan(5),
          reason: 'اندازهٔ نهایی هم باید با لوگوی صفحهٔ ورود یکی باشد');
    });

    testWidgets('کنترلرها نشتی ندارند', (tester) async {
      await tester.pumpWidget(_wrap(SplashScreen(boot: _gate())));
      await tester.pump(const Duration(milliseconds: 300));
      // جایگزینی درخت dispose را صدا می‌زند؛ اگر کنترلری آزاد نشود
      // flutter_test در پایان تست خطای «was not disposed» می‌دهد.
      await tester.pumpWidget(_wrap(const SizedBox()));
      expect(find.byType(SplashScreen), findsNothing);
    });

    testWidgets('خروجِ سینمایی، لوگو را بزرگ و محو می‌کند', (tester) async {
      await tester.pumpWidget(_wrap(SplashScreen(boot: _gate())));
      await tester.pump(const Duration(milliseconds: 1200));

      final state = tester.state<SplashScreenState>(find.byType(SplashScreen));
      final before = tester.getRect(find.byType(Image).first);

      unawaited(state.exit());
      await tester.pump(const Duration(milliseconds: 200));
      final during = tester.getRect(find.byType(Image).first);

      expect(during.width, greaterThan(before.width),
          reason: 'لوگو باید بزرگ شود تا «به داخلِ بازی رفتن» حس شود');
    });
  });
}

/// `unawaited` بدون import کردنِ `dart:async`.
void unawaited(Future<void> future) {}
