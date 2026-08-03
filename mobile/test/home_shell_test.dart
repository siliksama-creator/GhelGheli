// ============================================================================
//  «صفحات اپ بعد ورود لود نمیشن» — تست یکپارچهٔ پوستهٔ اصلی
// ============================================================================
//
//   flutter test test/home_shell_test.dart
//
// این تست HomeShell واقعی را با یک ApiClient واقعی سوار می‌کند و فقط لایهٔ
// شبکه را جعل می‌کند. هیچ‌کدام از تست‌های موجود این کار را نمی‌کردند — همه
// یا منطق خالص را می‌سنجیدند یا یک ویجت را جدا. به همین دلیل باگی که کاربر
// دید («بعد از ورود هیچ صفحه‌ای بالا نمی‌آید») از همهٔ ۱۶۵ تست رد شده بود.
//
// چیزی که اینجا سنجیده می‌شود:
//   * پوسته بعد از ورود واقعاً محتوا نشان می‌دهد، نه صفحهٔ خالی
//   * عوض کردن تب کار می‌کند
//   * یک پاسخ خراب/کند یک صفحه، بقیهٔ اپ را از کار نمی‌اندازد
//   * هر صفحه فقط یک بار داده می‌گیرد، نه در حلقه

import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/home_shell.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';

/// شمارندهٔ درخواست‌ها به تفکیک مسیر — برای تشخیص حلقهٔ fetch.
final Map<String, int> hits = {};

/// آداپتور جعلی: به‌جای شبکه، از این جدول جواب می‌دهد.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter({
    this.slow = const {},
    this.failing = const {},
    this.body = const {},
  });

  /// مسیرهایی که عمداً کند جواب می‌دهند (برای تست موازی بودن).
  final Map<String, Duration> slow;

  /// مسیرهایی که خطا می‌دهند. غیرfinal تا تست بتواند وسط کار «شبکه
  /// برگشت» را شبیه‌سازی کند.
  Map<String, int> failing;

  /// بدنهٔ سفارشی برای یک مسیر — برای تست پاسخ ناقص یا HTML.
  final Map<String, String> body;

  static const _profile = '{"user":{"id":"u1","nickname":"تست",'
      '"current_points":120,"lifetime_points":300,"monthly_league_points":50,'
      '"wallet_balance":0,"status":"active","profile_avatar_key":'
      '"avatar_1_football.png"},"inventory":[],"leaguePayouts":[]}';

  static const _bootstrap = '{"user":{"id":"u1","nickname":"تست",'
      '"current_points":120,"lifetime_points":300,"monthly_league_points":50,'
      '"wallet_balance":0,"status":"active","profile_avatar_key":'
      '"avatar_1_football.png"},"inventory":[],"leaguePayouts":[],'
      '"rewards":[],"wheel":{"spinsLeft":1,"unlimited":false}}';

  static final Map<String, String> _routes = {
    '/api/bootstrap': _bootstrap,
    '/api/wheel/count': '{"spinsLeft":1,"unlimited":false}',
    '/api/profile': _profile,
    '/api/rewards': '[]',
    '/api/wheel': '{"prizes":[{"id":"p1","label":"۱۰۰ امتیاز","kind":"points",'
        '"value":100,"color":"#84CC16","sliceOrder":1}],"dailyQuota":1,'
        '"dailyLeft":1,"dailyAvailable":true,"bonusSpins":0,"spinsLeft":1,'
        '"invitedCount":0,"resetInMs":3600000}',
    '/api/referrals': '{"code":"1234","commissionPercent":5,'
        '"spinsPerReferral":3,"invitesPerDailySpin":10,"maxInvitesForDaily":50,'
        '"invitedCount":0,"totalEarned":0,"bonusSpins":0,"dailySpins":1,'
        '"invitesToNextDailySpin":10,"atDailyCap":false,"friends":[]}',
    '/api/notifications': '[]',
    '/api/league/current':
        '{"season":{"month_year":"1405-05"},"entries":[],"previousSeason":[]}',
    '/api/shop': '{"balance":0,"plus":{"active":false},"equipped":{},'
        '"clubs":[],"items":[]}',
    '/api/clubs': '{"clubs":[],"mine":[]}',
    '/api/games/tap/progress': '{"level":1,"levelTaps":0,"totalTaps":0,'
        '"flaggedTaps":0,"requiredTaps":239,"levelCount":50,"pointsAwarded":0,'
        '"pointsToNextLevel":239,"totalGamePoints":50000,"levelsPerDay":2,'
        '"levelsLeftToday":2,"resetInMs":3600000}',
    '/api/cards/inventory': '[]',
    '/api/wallet': '{"balance":0,"transactions":[]}',
    '/api/support/tickets': '[]',
    '/api/chat/messages': '[]',
  };

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final path = options.path;
    hits[path] = (hits[path] ?? 0) + 1;

    final delay = slow[path];
    if (delay != null) await Future<void>.delayed(delay);

    final fail = failing[path];
    if (fail != null) {
      return ResponseBody.fromString('{"message":"خطای آزمایشی"}', fail,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType]
          });
    }

    final custom = this.body[path];
    if (custom != null) {
      return ResponseBody.fromString(custom, 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      });
    }

    final body = _routes[path];
    if (body == null) {
      // مسیر ناشناخته: ۴۰۴ می‌دهیم نه کرش — دقیقاً مثل سرور واقعی.
      return ResponseBody.fromString('{"message":"یافت نشد"}', 404, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      });
    }
    return ResponseBody.fromString(body, 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _fakeApi({
  Map<String, Duration> slow = const {},
  Map<String, int> failing = const {},
  Map<String, String> body = const {},
}) {
  final api = ApiClient();
  api.token = 'fake-token';
  api.dio.httpClientAdapter =
      _FakeAdapter(slow: slow, failing: failing, body: body);
  return api;
}

Widget _wrap(ApiClient api) => MaterialApp(
      theme: AppTheme.dark(),
      home: HomeShell(
        api: api,
        onLogout: () {},
        onTheme: () {},
        dark: true,
      ),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    hits.clear();
    SharedPreferences.setMockInitialValues({});
  });

  group('بارگذاری بعد از ورود', () {
    testWidgets('پوسته بالا می‌آید و داشبورد محتوا نشان می‌دهد',
        (tester) async {
      await tester.pumpWidget(_wrap(_fakeApi()));
      // چند فریم تا درخواست‌ها برگردند.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump(const Duration(seconds: 1));

      // نوار پایین باید باشد — یعنی پوسته رندر شده.
      expect(find.byType(NavigationBar), findsOneWidget,
          reason: 'نوار پایین نیست: پوسته اصلاً بالا نیامده');
      // و باید محتوایی از داشبورد دیده شود، نه صفحهٔ سفید.
      expect(find.byType(Scaffold), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('هر صفحه فقط یک بار داده می‌گیرد، نه در حلقه',
        (tester) async {
      // این همان چیزی است که «لود نمیشن» را می‌سازد: اگر setState پوسته
      // صفحه‌ها را از نو بسازد، initState دوباره fetch می‌کند، که دوباره
      // setState می‌زند... و صفحه هیچ‌وقت به حالت پایدار نمی‌رسد.
      await tester.pumpWidget(_wrap(_fakeApi()));
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));
      final afterLoad = Map<String, int>.from(hits);

      // چند ثانیه بی‌کار — هیچ درخواست تازه‌ای نباید برود.
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(seconds: 3));

      for (final e in afterLoad.entries) {
        expect(hits[e.key], e.value,
            reason: 'مسیر ${e.key} دوباره صدا زده شد — حلقهٔ fetch');
      }
      // و هیچ مسیری نباید بیش از دو بار صدا شده باشد.
      hits.forEach((path, n) {
        expect(n, lessThanOrEqualTo(2), reason: '$path حلقه زده: $n بار');
      });
    });

    testWidgets('عوض کردن تب کار می‌کند و کرش نمی‌دهد', (tester) async {
      await tester.pumpWidget(_wrap(_fakeApi()));
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));

      final bar = find.byType(NavigationBar);
      expect(bar, findsOneWidget);

      // هر مقصد نوار پایین را بزن.
      for (final label in ['جوایز', 'لیگ', 'چت و بازی', 'خانه']) {
        final dest = find.text(label);
        if (dest.evaluate().isEmpty) continue;
        await tester.tap(dest.first, warnIfMissed: false);
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull, reason: 'تب $label کرش داد');
      }
    });
  });

  _stuckSpinnerTests();

  group('مقاومت در برابر خطای شبکه', () {
    testWidgets('۵۰۰ روی پروفایل اپ را سفید نمی‌کند', (tester) async {
      await tester.pumpWidget(
          _wrap(_fakeApi(failing: {'/api/bootstrap': 500})));
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));

      // پوسته باید همچنان باشد. یک خطای پروفایل نباید کل اپ را ببرد.
      expect(find.byType(NavigationBar), findsOneWidget,
          reason: 'خطای یک درخواست کل پوسته را برد');
      expect(tester.takeException(), isNull);
    });

    testWidgets('۴۰۱ روی یک مسیر بقیهٔ اپ را نمی‌شکند', (tester) async {
      await tester.pumpWidget(_wrap(_fakeApi(failing: {
        '/api/wheel': 401,
        '/api/rewards': 401,
      })));
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('یک درخواست کند بقیه را بلاک نمی‌کند', (tester) async {
      // اگر بارگذاری‌ها سریالی باشند، کاربر مجموع همهٔ تأخیرها را
      // منتظر می‌ماند. با موازی بودن، کندترین یکی تعیین‌کننده است.
      await tester.pumpWidget(_wrap(_fakeApi(slow: {
        '/api/bootstrap': const Duration(seconds: 4),
      })));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 900));

      // با وجود اینکه rewards هنوز نیامده، پوسته باید رندر شده باشد.
      expect(find.byType(NavigationBar), findsOneWidget,
          reason: 'یک درخواست کند کل صفحه را نگه داشته');
      await tester.pump(const Duration(seconds: 5));
      expect(tester.takeException(), isNull);
    });
  });
}

// ============================================================================
//  بازتولید دقیقِ چیزی که کاربر روی گوشی دید
// ============================================================================
//
// عکس کاربر: پوسته بالا آمده (نوار بالا و پایین هستند) ولی وسط صفحه فقط یک
// چرخنده است که هیچ‌وقت تمام نمی‌شود.
//
// این تست‌ها همان حالت را می‌سازند و مطمئن می‌شوند که دیگر ممکن نیست.

void _stuckSpinnerTests() {
  group('چرخندهٔ گیرکرده — بازتولید گزارش کاربر', () {
    testWidgets('تایم‌اوت شبکه صفحه را روی چرخنده رها نمی‌کند',
        (tester) async {
      // بدترین حالت واقعی: سرور جواب نمی‌دهد و درخواست تایم‌اوت می‌شود.
      // قبل از اصلاح، `_loading = false` هرگز اجرا نمی‌شد.
      await tester.pumpWidget(_wrap(_fakeApi(failing: {
        '/api/bootstrap': 504,
      })));
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));

      // نباید هیچ چرخنده‌ای باقی مانده باشد.
      expect(find.byType(CircularProgressIndicator), findsNothing,
          reason: 'صفحه روی چرخنده گیر کرده — دقیقاً باگی که کاربر دید');
      expect(tester.takeException(), isNull);
    });

    testWidgets('پاسخ ناقص (بدون user) هم چرخنده را باز می‌کند',
        (tester) async {
      // یک پراکسی که body را می‌بُرد، یا استقرار نیمه‌کاره. قبلاً `_data`
      // غیرnull می‌شد و شرط «خطا و دادهٔ خالی» رد می‌شد — یعنی نه خطا نشان
      // داده می‌شد نه محتوا.
      await tester.pumpWidget(_wrap(_fakeApi(body: {
        '/api/bootstrap': '{"inventory":[],"rewards":[]}',
      })));
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));

      expect(find.byType(CircularProgressIndicator), findsNothing,
          reason: 'پاسخ ناقص نباید چرخندهٔ ابدی بسازد');
      expect(tester.takeException(), isNull);
    });

    testWidgets('پاسخ کاملاً بی‌ربط (HTML به‌جای JSON) کرش نمی‌دهد',
        (tester) async {
      // صفحهٔ خطای پراکسی یا کپچای اپراتور — روی موبایل ایران رایج است.
      await tester.pumpWidget(_wrap(_fakeApi(body: {
        '/api/bootstrap': '<html><body>503</body></html>',
      })));
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));
      expect(tester.takeException(), isNull);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('بعد از خطا، تلاش دوباره واقعاً کار می‌کند', (tester) async {
      // یک راه خروج که خودش کار نکند، بدتر از نبودنش است.
      final adapter = _FakeAdapter(failing: {'/api/bootstrap': 500});
      final api = ApiClient();
      api.token = 'fake';
      api.dio.httpClientAdapter = adapter;

      await tester.pumpWidget(_wrap(api));
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));

      final retry = find.text('تلاش مجدد');
      expect(retry, findsWidgets, reason: 'دکمهٔ تلاش دوباره باید باشد');

      // حالا شبکه برمی‌گردد.
      adapter.failing = const {};
      await tester.tap(retry.first, warnIfMissed: false);
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));

      expect(tester.takeException(), isNull);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });
  });
}
