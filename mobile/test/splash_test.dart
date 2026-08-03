// ============================================================================
//  تست صفحهٔ لودینگ اول اپ
// ============================================================================
//
//   flutter test test/splash_test.dart
//
// این صفحه اولین چیزی است که هر کاربر می‌بیند و چهار ایراد داشت که همه‌شان
// «بی‌صدا» بودند: کد کامپایل می‌شد، تست‌ها سبز بودند، ولی لانچ زشت بود.
// تست‌های اینجا دقیقاً همان چهار مورد را قفل می‌کنند تا برنگردند:
//
//   ۱. رنگ پس‌زمینه باید مو‌به‌مو با اسپلش سیستمی و اسکافولد اپ یکی باشد،
//      وگرنه هنگام لانچ یک پرش رنگ دیده می‌شود.
//   ۲. نباید انیمیشن «ورودی» داشته باشد — چیدمان باید از فریم اول ثابت
//      باشد، چون بازیابی توکن معمولاً زیر ۱۰۰ms تمام می‌شود.
//   ۳. باید همان تصویر شخصیتِ اسپلش سیستمی را نشان بدهد، نه لوگوی متنی.
//   ۴. کنترلر انیمیشن باید dispose شود.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/auth/splash_screen.dart';
import 'package:ghelgheli_mobile/theme/colors.dart';

void main() {
  group('صفحهٔ لودینگ', () {
    testWidgets('پس‌زمینه دقیقاً همان رنگ اسپلش سیستمی است', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SplashScreen()));

      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      // مقدار ثابت در pubspec (#060D18) — اگر این دو از هم جدا شوند، لانچ
      // دوباره چشمک می‌زند.
      expect(scaffold.backgroundColor, BrandColors.darkBg);
      expect(BrandColors.darkBg, const Color(0xFF060D18));
    });

    testWidgets('همان تصویر شخصیتِ اسپلش سیستمی را نشان می‌دهد',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SplashScreen()));

      // نام فایل را از هر لایه‌ای بیرون می‌کشد.
      //
      // چرا cast مستقیم به AssetImage غلط بود: به محض اینکه به تصویر
      // `cacheWidth` بدهیم — که برای کم کردن مصرف حافظه لازم است — فلاتر
      // آن را داخل یک ResizeImage می‌پیچد و cast می‌ترکد. تست باید
      // «کدام فایل نشان داده می‌شود» را بسنجد، نه اینکه چند لایه دورش
      // پیچیده شده؛ وگرنه هر بهینه‌سازی حافظه یک تست بی‌ربط را می‌شکند.
      String? nameOf(ImageProvider p) {
        if (p is ResizeImage) return nameOf(p.imageProvider);
        if (p is AssetImage) return p.assetName;
        if (p is ExactAssetImage) return p.assetName;
        return null;
      }

      final images = tester
          .widgetList<Image>(find.byType(Image))
          .map((w) => nameOf(w.image))
          .whereType<String>()
          .toList();

      // قبلاً اینجا لوگوی متنی بود و اسپلش سیستمی شخصیت — دو نشان پشت سر
      // هم شبیه خطای بارگذاری دیده می‌شد.
      expect(images, contains('assets/splash/splash_android12.png'));
    });

    testWidgets('چیدمان از فریم اول ثابت است (بدون انیمیشن ورودی)',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SplashScreen()));

      final first = tester.getRect(find.byType(Image).first);
      // ۹۰۰ms جلو می‌رویم: با انیمیشن ورودیِ قبلی (scale از ۰٫۸۶) اندازه
      // عوض می‌شد. حالا فقط شفافیتِ درخشش نبض می‌زند، پس هندسه ثابت است.
      await tester.pump(const Duration(milliseconds: 900));
      final later = tester.getRect(find.byType(Image).first);

      expect(later, first);
    });

    testWidgets('اسپینر دارد تا کاربر بداند اپ گیر نکرده', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SplashScreen()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('کنترلر انیمیشن نشتی ندارد', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SplashScreen()));
      // جایگزینی درخت، dispose را صدا می‌زند؛ اگر کنترلر آزاد نشود
      // flutter_test در پایان تست خطای «AnimationController was not
      // disposed» می‌دهد.
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      expect(find.byType(SplashScreen), findsNothing);
    });
  });
}
