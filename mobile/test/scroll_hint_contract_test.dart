// قراردادِ راهنمای اسکرول — همان چیزی که در وب و پنل هم قفل شده است.
//
// خواستهٔ مالک (۲۹ شهریور): «هر تبی که کاربرا نیاز دارن به اسکرول کنن،
// راهنمایی نشون داده بشه؛ یکپارچه و برای همیشه درستش کن.»
//
// چهار شکایتِ مشخص پشتِ این تست‌هاست:
//
//   ۱. جملهٔ خودِ صفحه هیچ‌وقت دیده نمی‌شد: نسخهٔ قبلی هر برچسبِ بلندتر از
//      ۱۶ نویسه را با «ادامه پایین‌تر» عوض می‌کرد — یعنی عملاً همهٔ ۱۴ جمله.
//   ۲. اسکرولِ **برنامه‌ای** هم «کاربر رفت» شمرده می‌شد (هر
//      `ScrollUpdateNotification`)، پس قرص پیش از دیده‌شدن می‌رفت.
//   ۳. با برگشتن به یک تب، قرص برنمی‌گشت — چون ویجت‌ها در کشِ صفحه‌ها زنده
//      می‌مانند و «دیده شد» هرگز صفر نمی‌شد.
//   ۴. شیتِ «بیشتر» هیچ نشانه‌ای نداشت که پایین‌تر هم ردیف هست.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/home_shell.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/widgets/scroll_hint.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// لیستی با ارتفاعِ دلخواه — برای ساختنِ «کمی سرریز» و «سرریزِ زیاد».
Widget _list(double itemHeight, int count) => ListView.builder(
      itemCount: count,
      itemBuilder: (_, i) => SizedBox(height: itemHeight, child: Text('r$i')),
    );

Future<void> _pumpHint(WidgetTester tester, Widget hint) async {
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: hint)));
  // یک فریم برای ScrollMetricsNotification، یکی برای بازسازی.
  await tester.pump();
  await tester.pump();
}

/// آداپتورِ سالمِ /api/bootstrap تا پوسته کامل رندر شود (همان الگوی
/// `navigation_test.dart`).
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
    theme: AppTheme.dark(),
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: HomeShell(api: api, onLogout: () {}),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 600));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('آستانه‌ها با وب/پنل یکی است', () {
    testWidgets('محتوای کوتاه: نه قرص، نه ریل', (tester) async {
      await _pumpHint(
          tester, ScrollHint(hintLabel: 'پایین‌تر', child: _list(20, 2)));
      expect(find.text('پایین‌تر'), findsNothing);
      expect(find.byIcon(Icons.keyboard_arrow_down_rounded), findsNothing);
    });

    testWidgets('سرریزِ ناچیز (۱۳px، زیرِ آستانهٔ ۲۴) قرص نمی‌سازد',
        (tester) async {
      // قرصِ راهنما برای «۱۳ پیکسل محتوای پنهان» دروغ است؛ کاربر با یک
      // تکانِ کوچک همه‌چیز را می‌بیند. وب هم آستانهٔ ۲۴px دارد.
      await _pumpHint(
        tester,
        ScrollHint(
          hintLabel: 'پایین‌تر',
          child: SizedBox(
            height: 600,
            child: ListView(children: const [SizedBox(height: 613)]),
          ),
        ),
      );
      expect(find.text('پایین‌تر'), findsNothing);
    });

    testWidgets('سرریزِ واقعی: قرص می‌آید و جملهٔ کاملِ صفحه نوشته می‌شود',
        (tester) async {
      // برچسبِ واقعیِ صفحهٔ «خانه» — همان که نسخهٔ قبلی قیچی می‌کرد و به
      // «ادامه پایین‌تر» بدل می‌شد (۲۸ نویسه > حدِ ۱۶ نویسه‌ایِ قبلی).
      const label = 'میان‌برها و کارت‌ها پایین‌ترند';
      await _pumpHint(tester, ScrollHint(hintLabel: label, child: _list(70, 40)));
      expect(find.text(label), findsOneWidget);
      expect(find.text('ادامه پایین‌تر'), findsNothing,
          reason: 'متنِ جانشین نباید جای جملهٔ واقعی را بگیرد');
    });
  });

  group('دیده‌شدن فقط با اسکرولِ کاربر', () {
    testWidgets('اسکرولِ برنامه‌ای (jumpTo) قرص را محو نمی‌کند',
        (tester) async {
      const label = 'پایین‌تر';
      await _pumpHint(tester, ScrollHint(hintLabel: label, child: _list(70, 40)));
      expect(find.text(label), findsOneWidget);

      final scrollable = tester.state<ScrollableState>(find.byType(Scrollable));
      scrollable.position.jumpTo(120);
      await tester.pump();
      await tester.pump();

      expect(find.text(label), findsOneWidget,
          reason: 'جابه‌جاییِ برنامه‌ای نشانهٔ «کاربر خودش اسکرول کرد» نیست');
    });

    testWidgets('کشیدنِ کاربر قرص را محو می‌کند', (tester) async {
      const label = 'پایین‌تر';
      await _pumpHint(tester, ScrollHint(hintLabel: label, child: _list(70, 40)));
      expect(find.text(label), findsOneWidget);

      await tester.drag(find.byType(ListView), const Offset(0, -200));
      await tester.pump();
      await tester.pump();

      expect(find.text(label), findsNothing);
    });
  });

  group('بازگشت به تب، راهنما را برمی‌گرداند', () {
    testWidgets('عوض شدنِ resetToken «دیده شد» را صفر می‌کند', (tester) async {
      const label = 'پایین‌تر';
      Widget build(int token) => MaterialApp(
            home: Scaffold(
              body: ScrollHint(
                hintLabel: label,
                resetToken: token,
                child: _list(70, 40),
              ),
            ),
          );

      await tester.pumpWidget(build(1));
      await tester.pump();
      await tester.pump();
      expect(find.text(label), findsOneWidget);

      await tester.drag(find.byType(ListView), const Offset(0, -200));
      await tester.pump();
      await tester.pump();
      expect(find.text(label), findsNothing);

      // «تب عوض شد»: همان ویجت، توکنِ تازه — دقیقاً همان چیزی که
      // `home_shell` با `_visitTick` می‌فرستد.
      await tester.pumpWidget(build(2));
      await tester.pump();
      await tester.pump();
      expect(find.text(label), findsOneWidget,
          reason: 'با بازگشت به تب، قرص باید یک بار دیگر آموزش بدهد');
    });
  });

  group('شیتِ «بیشتر»', () {
    testWidgets('سرصفحه و شمارِ بخش‌ها دارد و ردیفِ آخر هم قابل دسترس است',
        (tester) async {
      await _pumpShell(tester);

      await tester.tap(find.text('بیشتر'));
      // `pumpAndSettle` نه: لوگوی درخشانِ نوار بالا انیمیشنِ بی‌پایان دارد.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('همهٔ بخش‌ها'), findsOneWidget,
          reason: 'کاربر باید بداند شیت چند مقصد دارد، نه اینکه فکر کند '
              'همین ردیف‌های دیده‌شده تمامِ فهرست است');
      expect(find.textContaining('بخش'), findsWidgets);

      // ردیفِ پایانی: اگر سقفِ ارتفاع/فاصلهٔ ایمن اشتباه باشد، این ردیف
      // بیرونِ قاب می‌ماند. با اسکرولِ داخلِ شیت باید به آن رسید.
      final sheetList = find.descendant(
        of: find.byType(ListView),
        matching: find.byType(ListTile),
      );
      expect(sheetList, findsWidgets);
      await tester.drag(find.byType(ListView).last, const Offset(0, -260));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      expect(
        find.descendant(
            of: find.byType(ListTile), matching: find.text('پروفایل')),
        findsOneWidget,
        reason: 'ردیف‌های پایانیِ شیت باید با اسکرول در دسترس باشند',
      );
      // آخرین ردیف نباید از پایینِ صفحه بیرون بزند.
      final last = tester.getRect(
          find.descendant(of: find.byType(ListTile), matching: find.text('پروفایل')));
      expect(last.bottom, lessThanOrEqualTo(tester.view.physicalSize.height /
          tester.view.devicePixelRatio + 0.5));
    });
  });
}
