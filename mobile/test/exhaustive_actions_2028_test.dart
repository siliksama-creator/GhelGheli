import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';

import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/widgets/victory_share_dialog.dart';
import 'package:ghelgheli_mobile/screens/user/games/private_match_dialog.dart';
import 'package:ghelgheli_mobile/screens/user/league_page.dart';
import 'package:ghelgheli_mobile/screens/user/chat_page.dart';
import 'package:ghelgheli_mobile/screens/user/games_page.dart';
import 'package:ghelgheli_mobile/screens/admin/admin_notifications.dart';
import 'package:ghelgheli_mobile/screens/admin/admin_rewards.dart';

class _MockUniversalAdapter implements HttpClientAdapter {
  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<List<int>>? requestStream, Future<void>? cancelFuture) async {
    final path = options.path;

    if (path.contains('/api/chat/bootstrap')) {
      return ResponseBody.fromString(
        '{"config":{"eligible":true,"minLifetimePoints":0,"messageCooldownSeconds":5,"pinned":null},"messages":[],"cannedMessages":["سلام بچه‌ها!","من اومدم!","بازی خیلی باحال بود!"],"stickers":[]}',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path.contains('/api/bootstrap')) {
      return ResponseBody.fromString(
        '{"user":{"id":"u1","nickname":"قهرمان قلقلی","current_points":1250,"has_plus":true},"inventory":[],"rewards":[],"wheel":{"spinsLeft":3,"unlimited":false},"pass":{"claimable":1,"tiersToday":1,"maxTiersPerDay":2}}',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path.contains('/api/level')) {
      return ResponseBody.fromString(
        '{"level":15,"into":20,"needed":100,"progress":0.2,"isMax":false,"xp":320}',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path.contains('/api/league')) {
      return ResponseBody.fromString(
        '{"season":{"id":"s1","month_year":"1405-05","title":"لیگ برتر ماهانه","ends_at":"2026-08-23T00:00:00.000Z"},"activeLeagues":[{"id":"s1","title":"لیگ برتر ماهانه","league_type":"monthly"},{"id":"s2","title":"لیگ هفتگی قهرمانان","league_type":"weekly"}],"previousSeason":{"winners":[{"rank":1,"nickname":"قهرمان فصل قبل","points":1400,"prize_amount":500000}]},"myEntry":{"rank":12,"points":650},"entries":[{"user_id":"u1","nickname":"علی","points":500,"rank":1}]}',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path.contains('/api/pass')) {
      return ResponseBody.fromString(
        '{"active":true,"season":{"id":"s1","name":"فصل اول","ends_at":"2026-08-30T00:00:00.000Z"},"hasPlus":false,"xp":120,"tier":2,"tierCount":50,"intoTier":10,"tierNeeds":100,"tiersToday":1,"claimable":2,"tiers":[{"tier":1,"unlocked":true,"free":{"id":"t1f","kind":"points","amount":50,"claimed":true},"plus":{"id":"t1p","kind":"cash","amount":5000,"claimed":false,"locked":true}},{"tier":2,"unlocked":true,"free":{"id":"t2f","kind":"spins","amount":2,"claimed":false,"locked":false},"plus":{"id":"t2p","kind":"points","amount":100,"claimed":false,"locked":true}}]}',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path == '/api/admin/rewards') {
      return ResponseBody.fromString(
        '[]',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path == '/api/admin/reward-claims') {
      return ResponseBody.fromString(
        '[]',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    if (path == '/api/admin/reward-groups') {
      return ResponseBody.fromString(
        '{"groups":[]}',
        200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
      );
    }

    return ResponseBody.fromString(
      '{"ok":true,"message":"عملیات موفق"}',
      200,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }
}

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.dark(),
      locale: const Locale('fa'),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: child,
        ),
      ),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('[2028 Battery] ۱. چک کارت گرافیکی استوری پیروزی', () {
    testWidgets('دیالوگ اشتراک‌گذاری استوری با تمام مشخصات رندر می‌شود', (tester) async {
      await tester.pumpWidget(_wrap(const VictoryShareDialog(
        nickname: 'قهرمان قلقلی',
        hasPlus: true,
        gameTitle: 'ضربات پنالتی',
        scoreText: '۵ - ۳',
        referralCode: '4291',
        pointsEarned: 25,
      )));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('قهرمان قلقلی'), findsOneWidget);
      expect(find.text('۵ - ۳'), findsOneWidget);
      expect(find.text('4291'), findsOneWidget);
      expect(find.text('اشتراک‌گذاری در استوری و شبکه‌ها'), findsOneWidget);

      await tester.tap(find.text('اشتراک‌گذاری در استوری و شبکه‌ها'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
    });
  });

  group('[2028 Battery] ۲. چک چالش مستقیم و اتاق خصوصی', () {
    testWidgets('ساخت اتاق و کد ۴ رقمی و ورود دوست بدون باگ کار می‌کند', (tester) async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _MockUniversalAdapter();

      await tester.pumpWidget(_wrap(PrivateMatchDialog(
        api: api,
        onJoinRoom: (g, r) {},
      )));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('دوئل مستقیم با دوستان'), findsOneWidget);
      expect(find.text('ساخت اتاق بازی و دریافت کد'), findsOneWidget);

      await tester.tap(find.text('ساخت اتاق بازی و دریافت کد'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('کد اتاق شما:'), findsOneWidget);
    });
  });

  group('[2028 Battery] ۳. چک اجرای لیگ پویا و برندگان دوره قبل', () {
    testWidgets('جدول لیگ قلقلی با تب برندگان قبل و رتبه کاربر رندر می‌شود', (tester) async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _MockUniversalAdapter();

      await tester.pumpWidget(_wrap(LeaguePage(api: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('جدول لیگ'), findsWidgets);
      expect(find.text('باشگاه‌ها'), findsWidgets);
      expect(find.text('برندگان قبل'), findsWidgets);

      await tester.tap(find.text('برندگان قبل').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('برندگان دوره قبل لیگ'), findsOneWidget);
    });
  });

  group('[2028 Battery] ۴. چک چت کاربری با دسته‌بندی و پالت ایموجی', () {
    testWidgets('چت با تب‌های دسته‌بندی و ایموجی‌ها بدون خطا رندر می‌شود', (tester) async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _MockUniversalAdapter();

      await tester.pumpWidget(_wrap(ChatPage(api: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('💬 گفتگو'), findsOneWidget);
      expect(find.text('⚽ بازی'), findsOneWidget);
      expect(find.text('😀 ایموجی'), findsOneWidget);

      await tester.tap(find.text('😀 ایموجی'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('🔥'), findsOneWidget);
    });
  });

  group('[2028 Battery] ۵. چک هاب بازی‌ها و ۴ حالت مسابقه', () {
    testWidgets('هاب بازی‌ها با ۴ حالت و اطلاعات کاربر رندر می‌شود', (tester) async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _MockUniversalAdapter();

      await tester.pumpWidget(_wrap(GamesHubPage(api: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // ── چرا این سنجه‌ها به «حداقل یکی» تغییر کردند ──
      //
      // هدفِ تست این است که **چهار حالتِ مسابقه رندر شوند**. نسخهٔ قبل
      // آن را با `findsOneWidget` روی متنِ سراسری می‌سنجید — یعنی
      // به‌طور ضمنی فرض می‌کرد رشتهٔ «۱۰۰ امتیاز» فقط یک‌بار در کلِ
      // صفحه هست.
      //
      // وقتی کاشی‌های بازی به شکلِ مربعی درآمدند، هر کاشی هم نشانِ
      // حالت را نشان می‌دهد، پس همان متن چهار بار پیدا شد و تست شکست
      // — در حالی که **محصول درست‌تر** شده بود، نه خراب.
      //
      // ⚠️ به‌جای شل‌کردنِ تست، دامنه‌اش به خودِ نوارِ حالت محدود شد تا
      //    هنوز چیزی را اثبات کند: اینکه چهار پیل واقعاً آنجا هستند.
      final modeBar = find.byKey(const Key('gameModeBar'));
      for (final label in ['۱۰۰ امتیاز', '۱۰۰۰ امتیاز', 'تمرین با ربات', 'اتاق خصوصی']) {
        expect(
          find.descendant(of: modeBar, matching: find.text(label)),
          findsWidgets,
          reason: 'حالتِ «$label» باید در نوارِ انتخابِ حالت باشد',
        );
      }

      await tester.tap(find.descendant(
        of: modeBar, matching: find.text('اتاق خصوصی')).first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('ساخت اتاق و لابی اختصاصی'), findsOneWidget);
    });
  });

  group('[2028 Battery] ۶. چک پنل ادمین اعلان‌های هدفمند و جوایز', () {
    testWidgets('پنل اعلان‌های هدفمند با سگمنت‌ها بدون باگ رندر می‌شود', (tester) async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _MockUniversalAdapter();

      await tester.pumpWidget(_wrap(AdminNotifications(api: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('استودیوی اعلان‌های هدفمند'), findsOneWidget);
      expect(find.text('همه کاربران فعال'), findsOneWidget);
    });

    testWidgets('پنل ثبت جوایز با اعتبارسنجی مقادیر بدون خطا کار می‌کند', (tester) async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _MockUniversalAdapter();

      await tester.pumpWidget(_wrap(AdminRewards(api: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('گروه‌های جایزه'), findsOneWidget);
    });
  });
}
