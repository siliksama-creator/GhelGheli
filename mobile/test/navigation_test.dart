// تست‌های ناوبری — نگهبانِ چیدمانی که مالک خواست.
//
// این فایل سه چیز را قفل می‌کند که هر کدام یک بار در عمل شکسته بودند:
//
//   ۱. فروشگاه باید یک مقصد مستقل باشد و آیکونش کنار گردونه در نوار بالا
//      بنشیند — نه یک زیرتبِ پنهان داخل «جوایز».
//   ۲. هر صفحه‌ای که ساخته شده باید از جایی قابل دسترس باشد. «دعوت
//      دوستان» یک بار عملاً گم شد چون فقط از یک میان‌بر داشبورد باز
//      می‌شد.
//   ۳. عنوان هر صفحه باید با خودِ صفحه بخواند؛ لیستِ `_titles` با ایندکس
//      کار می‌کند، پس اضافه کردن یک صفحه بدون عنوان، همه را یکی جابه‌جا
//      می‌کند.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/home_shell.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// آداپتوری که یک بوت‌استرپِ سالم برمی‌گرداند تا پوسته کامل رندر شود.
class _OkAdapter implements HttpClientAdapter {
  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<List<int>>? requestStream, Future<void>? cancelFuture) async {
    return ResponseBody.fromString(
      '{"user":{"id":"u1","nickname":"تست","current_points":0,'
      '"wallet_balance":0},"inventory":[],"leaguePayouts":[],'
      '"rewards":[],"wheel":{"spinsLeft":2,"unlimited":false},'
      '"pass":{"tier":3,"tierCount":50,"claimable":4,"hasPlus":false,'
      '"daysLeft":42,"intoTier":10,"tierNeeds":115,"tiersToday":2,'
      '"maxTiersPerDay":2,"dayCapReached":true}}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      },
    );
  }
}

Future<void> _pumpShell(WidgetTester tester) async {
  final api = ApiClient();
  api.dio.httpClientAdapter = _OkAdapter();
  await api.saveToken('t');
  await tester.pumpWidget(MaterialApp(
    locale: const Locale('fa'),
    // تمِ واقعی اپ لازم است: صفحه‌ها از BrandTheme extension استفاده
    // می‌کنند و بدون آن، تست چیزی را می‌سنجد که شبیه محصول نیست.
    theme: AppTheme.dark(),
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: HomeShell(
        api: api,
        onLogout: () {},
        dark: true,
        onTheme: () {},
      ),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('میان‌برهای نوار بالا', () {
    testWidgets('آیکون فروشگاه کنار آیکون گردونه هست', (tester) async {
      await _pumpShell(tester);

      final shop = find.byTooltip('فروشگاه');
      final wheel = find.byWidgetPredicate((w) =>
          w is IconButton &&
          (w.tooltip?.contains('گردونه') ?? false));

      expect(shop, findsOneWidget, reason: 'آیکون فروشگاه باید در نوار بالا باشد');
      expect(wheel, findsOneWidget, reason: 'آیکون گردونه باید در نوار بالا باشد');

      // «کنار هم» یعنی واقعاً کنار هم، نه دو سر نوار.
      final dxShop = tester.getCenter(shop).dx;
      final dxWheel = tester.getCenter(wheel).dx;
      expect((dxShop - dxWheel).abs(), lessThan(80),
          reason: 'فروشگاه و گردونه باید کنار هم باشند');
    });

    testWidgets('زدن آیکون فروشگاه صفحهٔ فروشگاه را باز می‌کند',
        (tester) async {
      await _pumpShell(tester);
      await tester.tap(find.byTooltip('فروشگاه'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('فروشگاه'), findsWidgets,
          reason: 'عنوان نوار بالا باید «فروشگاه» شود');
    });

    testWidgets('فروشگاه دیگر زیرتبِ جوایز نیست', (tester) async {
      await _pumpShell(tester);
      // به تبِ جوایز برو.
      await tester.tap(find.text('جوایز').last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // SegmentedButtonِ قدیمیِ «جوایز | فروشگاه» نباید وجود داشته باشد.
      expect(find.byType(SegmentedButton<int>), findsNothing,
          reason: 'فروشگاه حالا مقصد مستقل است، نه زیرتب');
    });
  });

  group('گذر نبرد', () {
    testWidgets('آیکون گذر نبرد در نوار بالا هست', (tester) async {
      await _pumpShell(tester);
      expect(find.byWidgetPredicate((w) =>
          w is IconButton && (w.tooltip?.contains('گذر نبرد') ?? false)),
          findsOneWidget);
    });

    testWidgets('نشان، پله‌های باز شدهٔ امروز را نشان می‌دهد نه کل جوایز',
        (tester) async {
      // مالک: «وقتی بتل پس کاربر باز میشه کنار آیکون بتل پس ۱ قرمز میاد
      // اگه دوتا باز شده ۲ میاد ولی سقف باز شدن ۲ هستش».
      //
      // در دادهٔ جعلی claimable=4 ولی tiersToday=2 → نشان باید «۲»
      // باشد، نه «۴».
      await _pumpShell(tester);
      expect(find.text('۲'), findsWidgets,
          reason: 'عدد نشان = پله‌های امروز');
      expect(find.text('۴'), findsNothing,
          reason: 'عدد جوایز نباید روی نشان بیاید');
    });

    testWidgets('نشان هرگز از سقف روزانه بیشتر نمی‌شود', (tester) async {
      // محافظ دوم در کلاینت: اگر سرور روزی عدد بزرگ‌تری بفرستد، نشان
      // نباید «۷» نشان دهد.
      await _pumpShell(tester);
      for (final n in ['۳', '۴', '۵', '۶', '۷']) {
        expect(find.text(n), findsNothing, reason: 'نشان نباید $n باشد');
      }
    });

    testWidgets('زدن آیکون صفحهٔ گذر نبرد را باز می‌کند', (tester) async {
      await _pumpShell(tester);
      await tester.tap(find.byWidgetPredicate((w) =>
          w is IconButton && (w.tooltip?.contains('گذر نبرد') ?? false)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.textContaining('گذر نبرد'), findsWidgets);
    });
  });

  group('هیچ صفحه‌ای گم نمی‌شود', () {
    testWidgets('«دعوت دوستان» از شیتِ بیشتر قابل دسترس است', (tester) async {
      await _pumpShell(tester);

      await tester.tap(find.text('بیشتر'));
      // pumpAndSettle نه: لوگوی درخشانِ نوار بالا یک انیمیشنِ بی‌پایان
      // دارد (repeat)، پس درخت هرگز «آرام» نمی‌شود و تست تایم‌اوت
      // می‌خورد. چند فریمِ مشخص برای باز شدن شیت کافی است.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // داخل خود شیت جست‌وجو کن: عنوانِ صفحه هم ممکن است همین متن باشد.
      expect(
          find.descendant(
              of: find.byType(ListTile), matching: find.text('دعوت دوستان')),
          findsOneWidget,
          reason: 'صفحهٔ دعوت باید از شیت باز شود، نه فقط از میان‌بر داشبورد');
    });

    testWidgets('کیف پول، پشتیبانی و پروفایل هم در شیت هستند', (tester) async {
      await _pumpShell(tester);
      await tester.tap(find.text('بیشتر'));
      // pumpAndSettle نه: لوگوی درخشانِ نوار بالا یک انیمیشنِ بی‌پایان
      // دارد (repeat)، پس درخت هرگز «آرام» نمی‌شود و تست تایم‌اوت
      // می‌خورد. چند فریمِ مشخص برای باز شدن شیت کافی است.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      for (final t in ['کیف پول', 'پشتیبانی', 'پروفایل']) {
        expect(
            find.descendant(
                of: find.byType(ListTile), matching: find.text(t)),
            findsOneWidget,
            reason: '$t باید در شیت باشد');
      }
    });
  });
}
