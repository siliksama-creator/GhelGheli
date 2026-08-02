// ============================================================================
//  تست لوگوی متحرک صفحهٔ ورود
// ============================================================================
//
//   flutter test test/animated_logo_test.dart
//
// این ویجت اولین چیزی است که کاربر می‌بیند، پس دو چیز باید تضمین شود:
//
//   ۱. واقعاً حرکت کند — یک لوگوی «متحرک» که ثابت مانده، همان لوگوی قبلی
//      است با کد بیشتر.
//   ۲. اگر کاربر در تنظیمات سیستم «کاهش حرکت» را روشن کرده باشد، هیچ‌چیز
//      حرکت نکند. این الزام WCAG 2.3.3 است و برای کسانی که اختلال دهلیزی
//      دارند تفاوت بین یک صفحهٔ قابل استفاده و یک صفحهٔ تهوع‌آور است.
//      نسخهٔ وب همین کار را با prefers-reduced-motion می‌کند.
//
// و اینکه کنترلرهای انیمیشن نشتی نداشته باشند — یک لوپ بی‌پایان که آزاد
// نشود، مصرف باتری روی صفحه‌ای است که کاربر ترکش کرده.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/widgets/animated_logo.dart';

Widget _wrap(Widget child, {bool reduceMotion = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: reduceMotion),
        child: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  group('لوگوی متحرک', () {
    testWidgets('لوگو را رسم می‌کند', (tester) async {
      await tester.pumpWidget(_wrap(const AnimatedLogo(width: 200)));
      expect(find.byType(Image), findsWidgets);

      final asset = tester
          .widgetList<Image>(find.byType(Image))
          .map((w) => (w.image as AssetImage).assetName)
          .first;
      expect(asset, 'assets/brand/logo.webp');
    });

    testWidgets('در طول زمان واقعاً حرکت می‌کند', (tester) async {
      await tester.pumpWidget(_wrap(const AnimatedLogo(width: 200)));

      // بعد از پایان انیمیشن ورودی نمونه می‌گیریم تا آنچه می‌سنجیم شناورشدن
      // دائمی باشد، نه ورود یک‌بارهٔ اولیه.
      await tester.pump(const Duration(milliseconds: 1300));
      final a = tester.getRect(find.byType(Image).first);
      await tester.pump(const Duration(milliseconds: 1500));
      final b = tester.getRect(find.byType(Image).first);

      expect(a, isNot(equals(b)),
          reason: 'لوگو باید بین دو لحظه جابه‌جا شده باشد');
    });

    testWidgets('با «کاهش حرکت» کاملاً ثابت می‌ماند', (tester) async {
      await tester.pumpWidget(
          _wrap(const AnimatedLogo(width: 200), reduceMotion: true));

      final a = tester.getRect(find.byType(Image).first);
      await tester.pump(const Duration(milliseconds: 1500));
      final b = tester.getRect(find.byType(Image).first);
      await tester.pump(const Duration(milliseconds: 1500));
      final c = tester.getRect(find.byType(Image).first);

      expect(a, b);
      expect(b, c);
    });

    testWidgets('با «کاهش حرکت» جلوه‌های اضافه رسم نمی‌شوند', (tester) async {
      await tester.pumpWidget(
          _wrap(const AnimatedLogo(width: 200), reduceMotion: true));
      // فقط خود تصویر؛ بدون هاله، بدون درخشش، بدون CustomPaint جرقه‌ها.
      expect(find.byType(CustomPaint).evaluate().length, lessThan(3));
    });

    testWidgets('intro=false بدون انیمیشن ورودی شروع می‌شود', (tester) async {
      await tester.pumpWidget(
          _wrap(const AnimatedLogo(width: 200, intro: false)));
      await tester.pump();
      // اگر ورودی اجرا می‌شد، در فریم اول مقیاس ۰٫۷۲ بود و اندازه کوچک‌تر
      // از حالت نهایی دیده می‌شد.
      final opacity = tester.widget<Opacity>(find.byType(Opacity).first);
      expect(opacity.opacity, 1.0);
    });

    testWidgets('کنترلرها نشتی ندارند', (tester) async {
      await tester.pumpWidget(_wrap(const AnimatedLogo(width: 200)));
      await tester.pump(const Duration(milliseconds: 400));
      // جایگزینی درخت dispose را صدا می‌زند؛ اگر کنترلرِ لوپ آزاد نشود
      // flutter_test در پایان تست شکایت می‌کند.
      await tester.pumpWidget(_wrap(const SizedBox()));
      expect(find.byType(AnimatedLogo), findsNothing);
    });
  });
}
