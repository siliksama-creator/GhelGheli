// ============================================================================
//  تستِ اجرای واقعیِ تورِ آموزشِ صوتی در اپ
// ============================================================================
//
//   flutter test test/tour_overlay_test.dart
//
// ── چرا این فایل لازم شد ──────────────────────────────────────────────────
//
// تورِ اندروید با `flutter analyze` و تست‌های عمومیِ پروژه سبز بود، ولی
// **هیچ‌وقت اجرا نشده بود**. صفر-هشدارِ تحلیل فقط می‌گوید کد کامپایل می‌شود،
// نه اینکه لایهٔ تور بالا می‌آید، کارت می‌نشیند، «رد کردن» پرچم را ثبت
// می‌کند و «دوباره ببین» دوباره بازش می‌کند. روی گوشی، همین فاصله یعنی
// «کد نوشته شده» در برابر «کار می‌کند» — و مالک فقط دومی را می‌بیند.
//
// چیزی که این‌جا سنجیده می‌شود:
//   * تورِ خودکار بعد از ورود باز می‌شود و کارتِ متن + پردهٔ تار می‌آید
//   * «رد کردن» لایه را می‌بندد و `POST /api/onboarding/seen` را می‌فرستد
//   * «دوباره ببین» (TourBus) از اول بازش می‌کند
//   * «بعدی» جلو می‌رود و شمارندهٔ فارسی عوض می‌شود
//   * `/api/onboarding` فقط **یک بار** خوانده می‌شود (نه در حلقه)
//
// نکتهٔ فنی: همه‌جا `tester.pump(...)` صریح است، نه `pumpAndSettle` — انگشتِ
// تور و قرصِ هاله انیمیشنِ بی‌پایان دارند و `pumpAndSettle` روی آن‌ها
// timeout می‌خورد. در پایانِ هر تست هم تور با «رد کردن» بسته می‌شود تا
// کنترلرها dispose شوند (وگرنه flutter_test از تایمرِ بازی گوشزد می‌کند).

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/home_shell.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/tour/tour_service.dart';

/// شمارندهٔ درخواست‌ها به تفکیک مسیر — برای تشخیص حلقهٔ fetch.
final Map<String, int> hits = {};

/// بدنه‌های `POST /api/onboarding/seen` که رسیده — برای سنجشِ پرچم.
final List<String> seenPosts = [];

/// آداپتورِ جعلی: فقط لایهٔ شبکه جعل می‌شود، بقیهٔ اپ واقعی است.
class _TourAdapter implements HttpClientAdapter {
  _TourAdapter() {
    _routes['/api/onboarding'] = _onboarding;
  }

  /// ۱۸ بخش — **همان idهای سرور** (گاردِ `testOnboarding.js` برابریِ این
  /// فهرست با نقشهٔ `TourPlan` و با سرویسِ سرور را قفل می‌کند). این‌جا
  /// عنوان/متن ساختگی‌اند چون آن‌ها دادهٔ سرورند و کلاینت از خودش متن
  /// نمی‌سازد؛ چیزی که مهم است شکل و شمارشان است.
  /// رقمِ فارسی — همان کاری که `faNum` در اپ می‌کند.
  ///
  /// چرا لازم شد: نسخهٔ اولِ این تست در دادهٔ آزمایشی رقمِ لاتین می‌ساخت
  /// (`بخش 1`) ولی در انتظار رقمِ فارسی نوشته بود (`بخش ۱`)؛ نتیجه سه
  /// شکست بود که ربطی به اپ نداشت. حالا هر دو طرف فارسی‌اند.
  static String _fa(int n) =>
      '$n'.split('').map((d) => '۰۱۲۳۴۵۶۷۸۹'[int.parse(d)]).join();

  static final String _onboarding = () {
    const ids = <String>[
      'home', 'daily', 'tap', 'wheel', 'cards', 'league', 'club', 'invite',
      'duel', 'cap', 'missions', 'pass', 'coins', 'shop', 'wallet',
      'profile', 'support', 'outro',
    ];
    final steps = <String>[];
    for (var i = 0; i < ids.length; i++) {
      steps.add('{"id":"${ids[i]}","title":"بخش ${_fa(i + 1)}",'
          '"text":"متن آزمایشی ${_fa(i + 1)}","audioUrl":'
          '"/api/onboarding/audio/${ids[i]}.mp3","audioReady":true}');
    }
    return '{"enabled":true,"seen":false,"version":1,"steps":['
        '${steps.join(',')}]}';
  }();

  static const _profile =
      '{"user":{"id":"u1","nickname":"تست","current_points":120,'
      '"lifetime_points":300,"monthly_league_points":50,"wallet_balance":0,'
      '"status":"active","profile_avatar_key":"avatar_1_football.png"},'
      '"inventory":[],"leaguePayouts":[]}';

  static const _bootstrap =
      '{"user":{"id":"u1","nickname":"تست","current_points":120,'
      '"lifetime_points":300,"monthly_league_points":50,"wallet_balance":0,'
      '"status":"active","profile_avatar_key":"avatar_1_football.png"},'
      '"inventory":[],"leaguePayouts":[],"rewards":[],'
      '"wheel":{"spinsLeft":1,"unlimited":false}}';

  static final Map<String, String> _routes = {
    '/api/bootstrap': _bootstrap,
    '/api/profile': _profile,
    '/api/wheel/count': '{"spinsLeft":1,"unlimited":false}',
    '/api/rewards': '[]',
    '/api/notifications': '[]',
    '/api/league/current':
        '{"season":{"month_year":"1405-05"},"entries":[],"previousSeason":[]}',
    '/api/shop':
        '{"balance":0,"plus":{"active":false},"equipped":{},"clubs":[],"items":[]}',
    '/api/clubs': '{"clubs":[],"mine":[]}',
    '/api/cards/inventory': '[]',
    '/api/wallet': '{"balance":0,"transactions":[]}',
    '/api/support/tickets': '[]',
    '/api/chat/messages': '[]',
    '/api/onboarding/seen': '{"ok":true}',
  };

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final path = options.path;
    hits[path] = (hits[path] ?? 0) + 1;

    if (path == '/api/onboarding/seen') {
      seenPosts.add('${options.data}');
      return ResponseBody.fromString(_routes[path]!, 200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType]
          });
    }

    // مسیرِ تصویر/صدا و هر چیزِ ناشناس: بدنهٔ خالیِ ۲۰۰ (به‌جای ۴۰۴) تا
    // صفحه‌ها به حالتِ خطا نیفتند و تست فقط تور را بسنجد.
    final body = _routes[path] ?? '{}';
    return ResponseBody.fromString(body, 200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType]
        });
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _fakeApi() {
  final api = ApiClient();
  api.token = 'fake-token';
  api.dio.httpClientAdapter = _TourAdapter();
  return api;
}

Widget _wrap(ApiClient api) => MaterialApp(
      theme: AppTheme.dark(),
      home: HomeShell(api: api, onLogout: () {}),
    );

/// چند فریم جلو می‌رود تا تورِ خودکار باز شود (fetch + لنگر + فازِ ورود).
Future<void> _settleInTour(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 120));
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(seconds: 2));
  await tester.pump(const Duration(seconds: 2));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    hits.clear();
    seenPosts.clear();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('تور خودش باز می‌شود، پردهٔ تار می‌آید و کرش نمی‌کند',
      (tester) async {
    await tester.pumpWidget(_wrap(_fakeApi()));
    await _settleInTour(tester);

    expect(find.textContaining('آموزش صوتی'), findsWidgets,
        reason: 'کارتِ تور نیامد — تورِ خودکار باز نشده');
    expect(find.text('بخش ۱'), findsOneWidget,
        reason: 'کارتِ متنِ بخشِ اول پیدا نشد');
    expect(find.text('۱ از ۱۸'), findsOneWidget,
        reason: 'شمارندهٔ فارسیِ بخش‌ها درست نیست');
    // پردهٔ تار (چهار پنل) — یعنی «بقیهٔ صفحه تار شد».
    expect(find.byType(BackdropFilter), findsWidgets,
        reason: 'پردهٔ تار رندر نشد');
    expect(tester.takeException(), isNull);

    // بخشِ اول از «خانه» است و درِ ورودی ندارد؛ حلقه باید روی تبِ خانه
    // بنشیند (لنگرِ هندسی) نه اینکه هیچ‌جا نباشد.
    expect(find.text('پخش دوباره'), findsOneWidget,
        reason: 'دکمهٔ «پخش دوباره» نیست — کارت کامل رندر نشده');

    // `/api/onboarding` باید دقیقاً یک بار خوانده شده باشد (نه در حلقه).
    expect(hits['/api/onboarding'], 1,
        reason: 'وضعیتِ تور چند بار خوانده شد: ${hits['/api/onboarding']}');

    await tester.tap(find.text('رد کردن'));
    await tester.pump(const Duration(milliseconds: 200));
  });

  testWidgets('«رد کردن» لایه را می‌بندد و پرچم را روی سرور ثبت می‌کند',
      (tester) async {
    await tester.pumpWidget(_wrap(_fakeApi()));
    await _settleInTour(tester);
    expect(find.text('بخش ۱'), findsOneWidget);

    await tester.tap(find.text('رد کردن'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('بخش ۱'), findsNothing, reason: 'لایه بسته نشد');
    expect(seenPosts, isNotEmpty, reason: 'پرچمِ «دیده شد» به سرور نرفت');
    expect(seenPosts.first.contains('skipped'), isTrue,
        reason: 'پرچمِ رد کردن با skipped ثبت نشد: ${seenPosts.first}');
    // `options.data` در دایو بسته به مرحلهٔ pipeline یا Map است یا رشتهٔ
    // JSON؛ پس بودنِ کلیدها سنجیده می‌شود، نه شکلِ دقیقشان.
    expect(seenPosts.first.contains('version'), isTrue,
        reason: 'نسخهٔ تور در ثبتِ پرچم نیست: ${seenPosts.first}');
    expect(seenPosts.first.contains('true'), isTrue,
        reason: 'skipped باید true باشد: ${seenPosts.first}');
    expect(tester.takeException(), isNull);
  });

  testWidgets('«بعدی» جلو می‌رود و شمارندهٔ فارسی عوض می‌شود', (tester) async {
    await tester.pumpWidget(_wrap(_fakeApi()));
    await _settleInTour(tester);
    expect(find.text('۱ از ۱۸'), findsOneWidget);

    await tester.tap(find.text('بعدی'));
    await tester.pump(const Duration(milliseconds: 120));
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('۲ از ۱۸'), findsOneWidget,
        reason: 'با «بعدی» به بخشِ دوم نرفت');
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('رد کردن'));
    await tester.pump(const Duration(milliseconds: 200));
  });

  testWidgets('«دوباره ببین» از پروفایل، تور را از اول باز می‌کند',
      (tester) async {
    await tester.pumpWidget(_wrap(_fakeApi()));
    await _settleInTour(tester);

    await tester.tap(find.text('رد کردن'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('بخش ۱'), findsNothing);

    // آینهٔ دکمهٔ «پخش» در پروفایل.
    TourBus.instance.requestReplay();
    await _settleInTour(tester);

    expect(find.text('بخش ۱'), findsOneWidget,
        reason: '«دوباره ببین» تور را باز نکرد');
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('رد کردن'));
    await tester.pump(const Duration(milliseconds: 200));
  });
}
