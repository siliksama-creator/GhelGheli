// جداسازیِ ساعتِ بازی از بقیهٔ درخت — با شمارشِ واقعیِ build.
//
// ═══════════════════════════════════════════════════════════════════════════
// باگِ عملکردی که این تست قفلش می‌کند
// ═══════════════════════════════════════════════════════════════════════════
//
// `GameSession` یک `ChangeNotifier` است و `GameScaffold` با یک
// `AnimatedBuilder` به آن گوش می‌دهد. تا پیش از این، تیکِ شمارش معکوس
// هم روی همان `notifyListeners` سوار بود.
//
// یعنی هر ثانیه، کل صفحهٔ بازی بازساخته می‌شد:
//
//   • اتللو → ۶۴ خانه، هرکدام با BoxDecoration و Border،
//   • جفت‌یاب → ۱۶ کارت با تصویر،
//   • پنالتی → تابلوی امتیاز + شبکهٔ ۹ ناحیه + نقاشِ کاملِ زمین.
//
// و همهٔ این کار فقط برای اینکه عددِ «۱۲» به «۱۱» تبدیل شود. روی گوشیِ
// کم‌توان همین منبعِ لرزشِ محسوس در بازی بود — «کند شدن»ی که مالک
// گزارش کرد.
//
// راه‌حل: یک `ChangeNotifier` جدا به نام `clock`. تیک فقط آن را اعلان
// می‌دهد و تنها ویجتی که عدد را نشان می‌دهد (نوار حریف) به آن گوش
// می‌دهد.
//
// این تست هر دو سمتِ قرارداد را می‌سنجد:
//   ۱. تیکِ ساعت **نباید** شنوندگانِ نشست را بیدار کند،
//   ۲. ولی تغییرِ واقعیِ وضعیت **باید** بکند — وگرنه حرکتِ حریف روی
//      تخته دیده نمی‌شود و «بهینه‌سازی» بازی را شکسته است.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/games/game_session.dart';

void main() {
  group('ساعت از وضعیتِ بازی جداست', () {
    test('نشست یک ساعتِ مستقل دارد', () {
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      addTearDown(s.dispose);
      // اگر روزی کسی `clock` را حذف کند و به `notifyListeners`
      // برگردد، اینجا شکست می‌خورد.
      expect(s.clock, isNotNull);
      expect(identical(s.clock, s), isFalse,
          reason: 'ساعت باید یک Listenable جدا باشد، نه خودِ نشست');
    });

    testWidgets('اعلانِ ساعت، شنوندگانِ نشست را بیدار نمی‌کند',
        (tester) async {
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      addTearDown(s.dispose);

      var sessionBuilds = 0;
      var clockBuilds = 0;

      await tester.pumpWidget(MaterialApp(
        home: Column(
          children: [
            AnimatedBuilder(
              animation: s,
              builder: (_, __) {
                sessionBuilds++;
                return const SizedBox.shrink();
              },
            ),
            ListenableBuilder(
              listenable: s.clock,
              builder: (_, __) {
                clockBuilds++;
                return const SizedBox.shrink();
              },
            ),
          ],
        ),
      ));

      final baseSession = sessionBuilds;
      final baseClock = clockBuilds;

      // ۱۵ تیکِ ساعت — همان چیزی که در یک نوبتِ کامل رخ می‌دهد.
      for (var i = 0; i < 15; i++) {
        s.clock.notifyListeners();
        await tester.pump();
      }

      expect(clockBuilds - baseClock, 15,
          reason: 'نمایشگرِ شمارش معکوس باید هر تیک به‌روز شود');
      expect(sessionBuilds - baseSession, 0,
          reason: 'تختهٔ بازی نباید به‌خاطر تیکِ ساعت بازساخته شود — '
              'این همان باگی است که بازی را کند می‌کرد');
    });

    testWidgets('ولی تغییرِ وضعیت هنوز تخته را بازمی‌سازد', (tester) async {
      // نیمهٔ دومِ قرارداد. بدون این، «بهینه‌سازی» می‌توانست به قیمتِ
      // دیده نشدنِ حرکتِ حریف تمام شود.
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      addTearDown(s.dispose);

      var sessionBuilds = 0;
      await tester.pumpWidget(MaterialApp(
        home: AnimatedBuilder(
          animation: s,
          builder: (_, __) {
            sessionBuilds++;
            return const SizedBox.shrink();
          },
        ),
      ));
      final base = sessionBuilds;

      // `leave()` یک تغییرِ وضعیتِ واقعی است و notifyListeners می‌زند.
      s.leave();
      await tester.pump();

      expect(sessionBuilds - base, greaterThan(0),
          reason: 'تغییرِ وضعیتِ بازی باید همچنان درخت را به‌روز کند');
    });

    test('dispose نشست، ساعت را هم آزاد می‌کند', () {
      // یک ChangeNotifierِ آزادنشده، همهٔ شنوندگانش را زنده نگه می‌دارد.
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      s.dispose();
      // استفاده از یک ChangeNotifierِ آزادشده پرتاب می‌کند؛ همین ثابت
      // می‌کند که آزاد شده.
      expect(() => s.clock.addListener(() {}), throwsFlutterError);
    });
  });
}
