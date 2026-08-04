// چیدمان صفحهٔ گذر نبرد — شکار «کادر خالی بزرگ».
//
// ═══════════════════════════════════════════════════════════════════════════
// باگی که این تست نگهبانش است
// ═══════════════════════════════════════════════════════════════════════════
//
// مالک اسکرین‌شاتی فرستاد که در آن، زیر کارت پیشرفت یک **کادر خالیِ
// بسیار بلند** با حاشیهٔ طلایی بود و بقیهٔ صفحه را می‌بلعید.
//
// علت: `Stack` به فرزندِ غیرPositioned خود constraints شُل می‌دهد، پس
// ListView عرضِ بی‌کران می‌گرفت و به فرزندانش پاس می‌داد. هر
// FilledButton پرتاب می‌کرد «BoxConstraints forces an infinite width» و
// رندرِ کل سربرگ می‌شکست. روی گوشیِ ریلیز خطاها پنهان‌اند، پس فقط کادر
// خالی دیده می‌شد — برای همین شبیه «باگ ظاهری» به‌نظر می‌رسید نه کرشِ
// چیدمان.
//
// این تست صفحه را با دادهٔ واقعی سوار می‌کند و اگر **هر** استثنای
// رندری رخ دهد، رد می‌شود. حدس زدن دربارهٔ چیدمان بی‌فایده است.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/pass_page.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// پاسخ /api/pass با همان شکلی که سرور می‌دهد.
Map<String, dynamic> passBody({
  int tier = 0,
  bool hasPlus = false,
  int claimable = 0,
  int tierCount = 12,
}) {
  return {
    'active': true,
    'season': {'id': 's1', 'name': 'فصل اول — شروع قلقلی', 'daysLeft': 42},
    'hasPlus': hasPlus,
    'xp': 90,
    'tier': tier,
    'tierCount': tierCount,
    'intoTier': 90,
    'tierNeeds': 100,
    'tiersToday': 0,
    'maxTiersPerDay': 2,
    'dayCapReached': false,
    'pendingTiers': 0,
    'claimable': claimable,
    'tiers': [
      for (var t = 1; t <= tierCount; t++)
        {
          'tier': t,
          'xpNeeded': t * 100,
          'unlocked': t <= tier,
          'free': {
            'id': 'f$t',
            'kind': 'points',
            'amount': 50 + t,
            'label': 'امتیاز',
            'claimed': false,
            'locked': false,
          },
          'plus': {
            'id': 'p$t',
            'kind': 'spins',
            'amount': 1,
            'label': '۱ چرخش',
            'claimed': false,
            'locked': !hasPlus,
          },
        },
    ],
    'sources': [
      {'source': 'game_play', 'xp': 15, 'dailyCap': 90, 'label': 'انجام بازی'},
    ],
  };
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.body);
  final Map<String, dynamic> body;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<List<int>>? requestStream, Future<void>? cancelFuture) async {
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });
  }
}

Future<void> _pump(WidgetTester tester, Map<String, dynamic> body) async {
  // اندازهٔ صفحه باید قبل از pumpWidget تنظیم شود، وگرنه اولین چیدمان با
  // پیش‌فرض ۸۰۰×۶۰۰ انجام می‌شود.
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  final api = ApiClient();
  api.dio.httpClientAdapter = _Adapter(body);
  await api.saveToken('t');
  await tester.pumpWidget(MaterialApp(
    locale: const Locale('fa'),
    theme: AppTheme.dark(),
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(body: PassPage(api: api, onOpenShop: () {})),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 900));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('بدون استثنای چیدمان', () {
    testWidgets('کاربر رایگان — هیچ خطای رندری نمی‌دهد', (tester) async {
      await _pump(tester, passBody(hasPlus: false));
      // اگر «forces an infinite width» رخ دهد، اینجا گیر می‌افتد.
      expect(tester.takeException(), isNull);
    });

    testWidgets('کاربر پلاس — هیچ خطای رندری نمی‌دهد', (tester) async {
      await _pump(tester, passBody(hasPlus: true, tier: 3));
      expect(tester.takeException(), isNull);
    });

    testWidgets('با جایزهٔ آماده (دکمهٔ دوم) هم خطا نمی‌دهد', (tester) async {
      // این حالت دکمهٔ «دریافت جایزه» را هم رندر می‌کند — دومین
      // FilledButtonی که با عرض بی‌کران می‌شکست.
      await _pump(tester, passBody(tier: 5, claimable: 4));
      expect(tester.takeException(), isNull);
    });
  });

  group('محتوا واقعاً دیده می‌شود', () {
    testWidgets('بلوک ترغیب به پلاس متن و دکمه دارد', (tester) async {
      await _pump(tester, passBody(hasPlus: false));
      expect(find.text('مسیر طلایی قفل است'), findsOneWidget,
          reason: 'کادر نباید خالی باشد — همان باگ اسکرین‌شات');
      expect(find.text('بازکردن'), findsOneWidget);
    });

    testWidgets('وقتی پلاس دارد، بلوک ترغیب نیست', (tester) async {
      await _pump(tester, passBody(hasPlus: true));
      expect(find.text('مسیر طلایی قفل است'), findsNothing);
    });

    testWidgets('سربرگ و نوار پیشرفت رندر می‌شوند', (tester) async {
      await _pump(tester, passBody());
      expect(find.textContaining('فصل اول'), findsOneWidget);
      expect(find.textContaining('روز تا پایان فصل'), findsOneWidget);
      expect(find.textContaining('امروز'), findsWidgets,
          reason: 'نمایش سقف روزانه باید باشد');
    });

    testWidgets('ردیف پله‌ها رندر می‌شوند', (tester) async {
      await _pump(tester, passBody(tier: 3));
      expect(find.byType(ListView), findsOneWidget);
      expect(find.textContaining('امتیاز'), findsWidgets);
    });
  });

  group('هیچ عنصری ارتفاع غیرعادی ندارد', () {
    testWidgets('بلندترین کادر از یک صفحه بیشتر نیست', (tester) async {
      await _pump(tester, passBody(hasPlus: false));
      const screenH = 2400 / 3;
      var tallest = 0.0;
      for (final e in find.byType(Container).evaluate()) {
        final box = e.renderObject as RenderBox?;
        if (box == null || !box.hasSize) continue;
        if (box.size.height > tallest) tallest = box.size.height;
      }
      expect(tallest, lessThan(screenH),
          reason: 'کادری با ارتفاع $tallest کل صفحه را گرفته');
    });
  });
}
