// نگهبانِ «دکمهٔ دریافتِ امتیازِ ماموریت باید دیده شود».
//
// ═══════════════════════════════════════════════════════════════════════
// باگی که این آزمون جلویش را می‌گیرد
// ═══════════════════════════════════════════════════════════════════════
//
// گزارش مالک: «دکمهٔ دریافت امتیاز ماموریت‌ها در اندروید دیده نمی‌شود».
//
// فرضیه‌هایی که **رد** شدند (هر کدام بررسی شد، نه حدس):
//   • دکمه در کد نیست → هست، growth_panel.dart
//   • endpoint نیست → هست، POST /api/missions/:key/claim
//   • قرارداد داده فرق دارد → نمی‌کند؛ complete/claimed/goal یکی است
//   • پنل بریده می‌شود → نمی‌شود، داخل SingleChildScrollView است
//
// علتِ واقعی، در تمِ برنامه:
//
//     minimumSize: const Size.fromHeight(TouchTarget.comfortable)
//
// ‏`Size.fromHeight(52)` معادلِ `Size(double.infinity, 52)` است — یعنی
// کمینه‌عرضِ **بی‌نهایت**. دکمه‌های ریزِ ماموریت در یک `Row` داخلِ کارتِ
// ۱۹۰ پیکسلی هستند و آنجا قیدِ بی‌نهایت نامعتبر است:
//
//     BoxConstraints forces an infinite width.
//     The offending constraints were: BoxConstraints(w=Infinity, h=27.0)
//
// دکمه چیدمان نمی‌شد، پس رندر هم نمی‌شد. در buildِ release این خطاها
// بی‌صدا رد می‌شوند و فقط جای خالی می‌ماند — برای همین کسی خطایی نمی‌دید
// و به نظر می‌رسید «دکمه وجود ندارد».
//
// تعارضِ دوم: کمینه‌ارتفاعِ ۵۲ در برابرِ `SizedBox(height: 27)`.
//
// ⚠️ درسِ روش‌شناختی: این باگ با خواندنِ کد پیدا **نمی‌شد**. کد کاملاً
//    منطقی به نظر می‌رسید. فقط با رندر کردنِ واقعیِ ویجت و شمردنِ
//    خطاهای چیدمان دیده شد.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/theme/tokens.dart';

/// همان استایلی که در `growth_panel.dart` روی دکمه‌های ریز می‌نشیند.
ButtonStyle _compactClaimStyle({double height = 27}) => ButtonStyle(
      minimumSize: WidgetStatePropertyAll(Size(0, height)),
      maximumSize: WidgetStatePropertyAll(Size(double.infinity, height)),
      padding:
          const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 10)),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );

/// بازسازیِ وفادارِ کارتِ ماموریتِ روزانه از `growth_panel.dart`.
///
/// عمداً کپی است و نه import: `GrowthPanel` به `ApiClient` و سوکت نیاز
/// دارد و آوردنشان آزمونِ چیدمان را به آزمونِ شبکه تبدیل می‌کرد. عددهای
/// چیدمان دکمه (ارتفاع ۲۷، فونت ۹.۵) و _compactClaimStyle همان‌اند.
Widget _missionCard({
  required bool complete,
  required bool claimed,
  required bool fixed,
}) {
  // آینهٔ چیدمان عمودیِ فعلی growth_panel — بدون side-scroll.
  // دکمه هنوز داخل Row با ارتفاع ثابت است؛ همان باگِ minimumSize
  // بی‌نهایت باید اینجا قابل بازتولید باشد.
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .045),
      borderRadius: Corners.rMd,
      border: Border.all(
          color: complete ? const Color(0xFFFFD166) : Colors.white12),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Row(children: [
          Text('روزانه',
              style: TextStyle(color: Color(0xFF38BDF8), fontSize: 9.5)),
          Spacer(),
          Text('+۳۶',
              style: TextStyle(
                  color: Color(0xFFFFD166),
                  fontSize: 9.5,
                  fontWeight: FontWeight.w900)),
        ]),
        const Text('شروع پرقدرت · سطح ۱',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
        const Text('۴ مسابقه را تا پایان کامل کن',
            maxLines: 1,
            style: TextStyle(fontSize: 9.5, color: Colors.white54)),
        const SizedBox(height: 8),
        const LinearProgressIndicator(value: 1, minHeight: 5),
        const SizedBox(height: 5),
        Row(children: [
          const Expanded(
              child: Text('۴/۴', style: TextStyle(fontSize: 9.5))),
          SizedBox(
            height: 27,
            child: FilledButton(
              style: fixed ? _compactClaimStyle() : null,
              onPressed: !complete || claimed ? null : () {},
              child: Text(
                  claimed ? 'گرفته شد' : complete ? 'دریافت' : 'ادامه',
                  style: const TextStyle(fontSize: 9.5)),
            ),
          ),
        ]),
      ],
    ),
  );
}

Widget _wrap(Widget child, {double textScale = 1.0}) => MaterialApp(
      theme: AppTheme.dark(),
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: Center(child: child)),
        ),
      ),
    );

/// خطاهای چیدمان را در حینِ رندر جمع می‌کند.
Future<List<FlutterErrorDetails>> _layoutErrors(
    WidgetTester tester, Widget w) async {
  final errors = <FlutterErrorDetails>[];
  final old = FlutterError.onError;
  FlutterError.onError = errors.add;
  await tester.pumpWidget(w);
  await tester.pump();
  FlutterError.onError = old;
  return errors;
}

void main() {
  group('علتِ ریشه‌ای هنوز در تم هست (عمداً عوض نشد)', () {
    test('minimumSize تم کمینه‌عرضِ بی‌نهایت دارد', () {
      final theme = AppTheme.dark();
      final filled =
          theme.filledButtonTheme.style!.minimumSize!.resolve(<WidgetState>{})!;

      // چرا تم را سراسری اصلاح نکردیم: اندازه‌گیری شد که تغییرِ آن،
      // دکمه‌های تمام‌عرضِ برنامه را از ۸۰۰ به ۱۲۴ پیکسل جمع می‌کند
      // (الگوهای Center و Column بدون stretch). یک رگرسیونِ بصریِ
      // سراسری برای رفعِ یک باگِ محلی. پس دکمه‌های ریز استایلِ صریح
      // می‌گیرند و این ادعا مستند می‌کند که وضعِ تم عمدی است.
      expect(filled.width, double.infinity);
      expect(filled.height, TouchTarget.comfortable);
      expect(filled.height, greaterThan(27),
          reason: 'کمینه‌ارتفاعِ ۵۲ با جعبهٔ ۲۷ پیکسلیِ کارت تعارض دارد');
    });
  });

  group('بازتولیدِ باگ — بدونِ اصلاح', () {
    testWidgets('دکمه با استایلِ پیش‌فرضِ تم اصلاً چیدمان نمی‌شود',
        (tester) async {
      final errors = await _layoutErrors(
        tester,
        _wrap(_missionCard(complete: true, claimed: false, fixed: false)),
      );
      final infinite = errors.where(
          (e) => e.exception.toString().contains('infinite width'));
      expect(infinite, isNotEmpty,
          reason: 'این همان خطایی است که دکمه را نامرئی می‌کرد');
    });
  });

  group('پس از اصلاح', () {
    testWidgets('دکمهٔ «دریافت» بدونِ هیچ خطای چیدمان رندر می‌شود',
        (tester) async {
      final errors = await _layoutErrors(
        tester,
        _wrap(_missionCard(complete: true, claimed: false, fixed: true)),
      );
      expect(errors, isEmpty,
          reason: 'هیچ خطای چیدمانی نباید بماند: '
              '${errors.map((e) => e.exception).join(" | ")}');

      expect(find.text('دریافت'), findsOneWidget);

      final box = tester.renderObject<RenderBox>(find.byType(FilledButton));
      expect(box.size.height, 27,
          reason: 'دکمه باید دقیقاً همان ارتفاعی باشد که کارت داده');
      expect(box.size.width, greaterThan(0));
      expect(box.size.width, lessThan(190),
          reason: 'دکمه باید داخلِ کارتِ ۱۹۰ پیکسلی جا شود');
    });

    testWidgets('دکمه واقعاً قابلِ لمس است و رویداد می‌دهد', (tester) async {
      var tapped = false;
      await tester.pumpWidget(_wrap(
        SizedBox(
          width: 190,
          child: Row(children: [
            const Expanded(child: Text('۴/۴')),
            SizedBox(
              height: 27,
              child: FilledButton(
                style: _compactClaimStyle(),
                onPressed: () => tapped = true,
                child: const Text('دریافت', style: TextStyle(fontSize: 9.5)),
              ),
            ),
          ]),
        ),
      ));
      await tester.pump();
      await tester.tap(find.text('دریافت'));
      expect(tapped, isTrue, reason: 'دکمه باید واقعاً کلیک‌پذیر باشد');
    });

    testWidgets('حالتِ «گرفته شد» غیرفعال ولی همچنان دیده می‌شود',
        (tester) async {
      final errors = await _layoutErrors(
        tester,
        _wrap(_missionCard(complete: true, claimed: true, fixed: true)),
      );
      expect(errors, isEmpty);
      expect(find.text('گرفته شد'), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
        reason: 'ماموریتِ دریافت‌شده نباید دوباره قابلِ دریافت باشد',
      );
    });

    testWidgets('در بزرگ‌نماییِ فونت هم دکمه سالم می‌ماند', (tester) async {
      for (final scale in [1.0, 1.3, 1.6]) {
        final errors = await _layoutErrors(
          tester,
          _wrap(_missionCard(complete: true, claimed: false, fixed: true),
              textScale: scale),
        );
        final infinite = errors
            .where((e) => e.exception.toString().contains('infinite width'));
        expect(infinite, isEmpty,
            reason: 'در مقیاسِ $scale نباید خطای عرضِ بی‌نهایت باشد');
        expect(find.text('دریافت'), findsOneWidget);
      }
    });
  });
}
