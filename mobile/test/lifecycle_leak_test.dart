// نشتِ منابع — با اجرای واقعیِ چرخهٔ عمر، نه تحلیل ایستا.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها لازم‌اند
// ═══════════════════════════════════════════════════════════════════════════
//
// یک اسکریپتِ تحلیلِ ایستا (tools/audit_dispose.py) می‌تواند بگوید «نامِ
// این کنترلر در dispose ظاهر شده». چیزی که نمی‌تواند بگوید این است که
// آیا واقعاً در زمانِ اجرا آزاد می‌شود یا نه — مثلاً وقتی dispose زودتر
// return می‌کند، یا وقتی یک mixin در زنجیره، `super.dispose()` را صدا
// نمی‌زند.
//
// این فایل ویجت‌ها را واقعاً می‌سازد، از درخت برمی‌دارد، و بررسی می‌کند
// که هیچ Ticker و هیچ Timerی زنده نمانده باشد. فلاتر خودش در حالت تست
// برای Tickerهای رهاشده خطا می‌دهد؛ برای Timerها باید صریح بررسی کنیم.
//
// نکتهٔ مهم دربارهٔ `LifecyclePoller`: نشتِ آن **بی‌صدا** است. تایمر
// داخل تیک `mounted` را بررسی می‌کند، پس هیچ خطایی نمی‌دهد — فقط تا
// ابد هر ۱۰ ثانیه یک درخواست شبکه می‌زند و کلِ درختِ ویجتِ مرده را
// زنده نگه می‌دارد. دقیقاً همان نوع باگی که در تستِ دستی هرگز پیدا
// نمی‌شود.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/widgets/lifecycle_poller.dart';
import 'package:ghelgheli_mobile/widgets/scroll_hint.dart';
import 'package:ghelgheli_mobile/screens/user/games/penalty_net.dart';

// ── یک صفحهٔ آزمایشی که poller را استفاده می‌کند ولی stopPolling را
//    **عمداً فراموش می‌کند** ────────────────────────────────────────────
//
// این دقیقاً همان اشتباهی است که صفحهٔ بعدیِ اضافه‌شده به اپ ممکن است
// بکند. mixin باید خودش نجاتش دهد.
class _ForgetfulPoller extends StatefulWidget {
  const _ForgetfulPoller({required this.onPoll});
  final Future<void> Function() onPoll;

  @override
  State<_ForgetfulPoller> createState() => _ForgetfulPollerState();
}

class _ForgetfulPollerState extends State<_ForgetfulPoller>
    with LifecyclePoller {
  @override
  void initState() {
    super.initState();
    startPolling(const Duration(milliseconds: 50), widget.onPoll);
  }

  // عمداً هیچ dispose ای نوشته نشده — mixin باید تمیزکاری کند.

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// یک صفحهٔ درست‌رفتار، برای اطمینان از اینکه فراخوانیِ دستی هم بی‌ضرر
/// است (idempotent) و باعث dispose دوباره نمی‌شود.
class _TidyPoller extends StatefulWidget {
  const _TidyPoller({required this.onPoll});
  final Future<void> Function() onPoll;

  @override
  State<_TidyPoller> createState() => _TidyPollerState();
}

class _TidyPollerState extends State<_TidyPoller> with LifecyclePoller {
  @override
  void initState() {
    super.initState();
    startPolling(const Duration(milliseconds: 50), widget.onPoll);
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

void main() {
  group('LifecyclePoller نشت نمی‌کند', () {
    testWidgets('حتی وقتی صفحه stopPolling را فراموش کند', (tester) async {
      var polls = 0;
      await tester.pumpWidget(MaterialApp(
        home: _ForgetfulPoller(onPoll: () async => polls++),
      ));

      await tester.pump(const Duration(milliseconds: 120));
      final whileAlive = polls;
      expect(whileAlive, greaterThan(0),
          reason: 'poller باید وقتی صفحه زنده است کار کند');

      // صفحه را از درخت بردار.
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pump();

      // اگر تایمر زنده مانده باشد، `pump` با تایمرِ معلق شکست می‌خورد
      // یا شمارنده بالا می‌رود.
      await tester.pump(const Duration(milliseconds: 300));
      expect(polls, whileAlive,
          reason: 'بعد از حذف صفحه نباید هیچ درخواستِ تازه‌ای زده شود — '
              'تایمر نشت کرده است');
    });

    testWidgets('فراخوانیِ دستیِ stopPolling هم بی‌ضرر است', (tester) async {
      var polls = 0;
      await tester.pumpWidget(MaterialApp(
        home: _TidyPoller(onPoll: () async => polls++),
      ));
      await tester.pump(const Duration(milliseconds: 120));
      // نباید با «dispose دوبار صدا زده شد» بشکند.
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pump(const Duration(milliseconds: 200));
      expect(tester.takeException(), isNull);
    });
  });

  group('ScrollHint نشت نمی‌کند', () {
    testWidgets('کنترلرِ انیمیشن بعد از حذف آزاد می‌شود', (tester) async {
      // اگر AnimationController آزاد نشود، فلاتر در پایانِ تست خودش
      // خطا می‌دهد: "A AnimationController was leaked".
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ScrollHint(
            child: ListView.builder(
              itemCount: 100,
              itemBuilder: (_, i) => SizedBox(height: 60, child: Text('$i')),
            ),
          ),
        ),
      ));
      await tester.pump();
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });

    testWidgets('روی محتوای کوتاه هیچ انیمیشنی روشن نمی‌شود', (tester) async {
      // بودجهٔ باتری: قرصِ راهنما فقط وقتی صفحه واقعاً اسکرول دارد
      // باید نبض بزند. یک AnimationController که روی هر صفحهٔ کوتاه هم
      // می‌چرخد، در ۱۱ صفحهٔ اپ ضرب می‌شود.
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ScrollHint(
            child: ListView(children: const [SizedBox(height: 20)]),
          ),
        ),
      ));
      await tester.pump();
      // اگر یک انیمیشنِ تکرارشونده روشن بود، pumpAndSettle هرگز
      // برنمی‌گشت و تست با تایم‌اوت می‌شکست.
      await tester.pumpAndSettle(const Duration(milliseconds: 50));
      expect(tester.takeException(), isNull);
    });

    testWidgets('روی محتوای بلند، ریل ظاهر می‌شود', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ScrollHint(
            hintLabel: 'پایین‌تر',
            child: ListView.builder(
              itemCount: 80,
              itemBuilder: (_, i) => SizedBox(height: 70, child: Text('r$i')),
            ),
          ),
        ),
      ));
      // یک فریم برای رسیدن ScrollMetricsNotification، یکی برای بازسازی.
      await tester.pump();
      await tester.pump();
      expect(find.text('پایین‌تر'), findsOneWidget,
          reason: 'قرصِ راهنما باید روی صفحهٔ اسکرول‌شونده دیده شود');
    });

    testWidgets('بعد از اسکرولِ کاربر، قرص محو می‌شود', (tester) async {
      // راهنما باید یک بار آموزش بدهد، نه اینکه برای همیشه جلوی چشم
      // بماند.
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ScrollHint(
            hintLabel: 'پایین‌تر',
            child: ListView.builder(
              itemCount: 80,
              itemBuilder: (_, i) => SizedBox(height: 70, child: Text('r$i')),
            ),
          ),
        ),
      ));
      await tester.pump();
      await tester.pump();
      expect(find.text('پایین‌تر'), findsOneWidget);

      await tester.drag(find.byType(ListView), const Offset(0, -200));
      await tester.pump();
      await tester.pump();
      expect(find.text('پایین‌تر'), findsNothing,
          reason: 'بعد از اینکه کاربر یاد گرفت، راهنما باید برود');
    });
  });

  group('تورِ پنالتی منبعی را زنده نگه نمی‌دارد', () {
    test('بعد از آرام گرفتن، هیچ کاری انجام نمی‌دهد', () {
      // این معادلِ «Ticker خاموش شد» است: تا وقتی `settled` باشد،
      // `step` بلافاصله false برمی‌گرداند و صفحه فریمِ تازه نمی‌خواهد.
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      var frames = 0;
      while (!net.settled && frames < 600) {
        net.step(1 / 60);
        frames++;
      }
      expect(net.settled, isTrue);
      for (var i = 0; i < 10; i++) {
        expect(net.step(1 / 60), isFalse,
            reason: 'تورِ خوابیده نباید هیچ کاری بکند');
      }
    });
  });
}
