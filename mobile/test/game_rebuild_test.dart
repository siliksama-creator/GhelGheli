// بودجهٔ بازسازیِ صفحهٔ بازی — با شمارشِ واقعیِ build، نه حدس.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// نگرانیِ مالک: «حافظه اجرایی اپ در زمان بازی ها بالا نره که اپ کراش
// نکنه یا کند نشه».
//
// `GameSession` یک `ChangeNotifier` است و ساعتِ نوبت هر ۲۰۰ میلی‌ثانیه
// تیک می‌زند. هر تیکی که ثانیهٔ نمایش‌داده‌شده را عوض کند،
// `notifyListeners` صدا می‌زند. اگر کلِ صفحهٔ بازی به آن گوش بدهد، هر
// ثانیه **کل درخت** بازساخته می‌شود: تابلوی امتیاز، نوار حریف،
// تختهٔ بازی با ۶۴ خانه، دکمه‌ها — همه، فقط برای اینکه یک عدد از ۱۲
// به ۱۱ برود.
//
// این تست شمارندهٔ build را روی یک تختهٔ آزمایشی می‌گذارد و ثابت
// می‌کند که تیکِ ساعت، تخته را بازنمی‌سازد.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// شمارندهٔ ساده: هر بار build شود یکی بالا می‌رود.
class _CountingBoard extends StatelessWidget {
  const _CountingBoard({required this.counter});
  final List<int> counter;

  @override
  Widget build(BuildContext context) {
    counter[0]++;
    return const SizedBox(width: 100, height: 100);
  }
}

/// یک ChangeNotifier که مثل ساعتِ بازی رفتار می‌کند.
class _FakeClock extends ChangeNotifier {
  int seconds = 15;

  void tick() {
    seconds--;
    notifyListeners();
  }
}

/// چیدمانِ **بد**: همه‌چیز داخل یک AnimatedBuilder بدون child.
class _NaiveLayout extends StatelessWidget {
  const _NaiveLayout({required this.clock, required this.counter});
  final _FakeClock clock;
  final List<int> counter;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: clock,
      builder: (context, _) => Column(
        children: [
          Text('${clock.seconds}'),
          _CountingBoard(counter: counter),
        ],
      ),
    );
  }
}

/// چیدمانِ **درست**: بخشِ ثابت به‌عنوان `child` بیرون از builder.
class _OptimisedLayout extends StatelessWidget {
  const _OptimisedLayout({required this.clock, required this.counter});
  final _FakeClock clock;
  final List<int> counter;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: clock,
      // `child` یک بار ساخته می‌شود و فلاتر همان نمونه را به builder
      // پاس می‌دهد — پس زیردرختش بازساخته نمی‌شود.
      child: _CountingBoard(counter: counter),
      builder: (context, child) => Column(
        children: [
          Text('${clock.seconds}'),
          child!,
        ],
      ),
    );
  }
}

void main() {
  group('الگوی child در AnimatedBuilder واقعاً اثر دارد', () {
    testWidgets('بدون child: هر تیک کل زیردرخت بازساخته می‌شود',
        (tester) async {
      final clock = _FakeClock();
      final counter = [0];
      await tester.pumpWidget(MaterialApp(
        home: _NaiveLayout(clock: clock, counter: counter),
      ));
      final initial = counter[0];

      for (var i = 0; i < 10; i++) {
        clock.tick();
        await tester.pump();
      }

      expect(counter[0] - initial, 10,
          reason: 'این چیدمانِ بد است و باید ۱۰ بار بازسازی کند — '
              'اگر نکرد، خودِ تست بی‌معنی شده');
      clock.dispose();
    });

    testWidgets('با child: زیردرخت دست‌نخورده می‌ماند', (tester) async {
      final clock = _FakeClock();
      final counter = [0];
      await tester.pumpWidget(MaterialApp(
        home: _OptimisedLayout(clock: clock, counter: counter),
      ));
      final initial = counter[0];

      for (var i = 0; i < 10; i++) {
        clock.tick();
        await tester.pump();
      }

      expect(counter[0] - initial, 0,
          reason: 'با الگوی child نباید هیچ بازسازی‌ای رخ دهد');
      clock.dispose();
    });
  });

  group('بودجهٔ ساعتِ بازی', () {
    test('تیک ۲۰۰ms فقط وقتی ثانیه عوض شود اعلان می‌دهد', () {
      // ═══════════════════════════════════════════════════════════════
      // چرا این مهم است
      // ═══════════════════════════════════════════════════════════════
      //
      // ساعت هر ۲۰۰ میلی‌ثانیه تیک می‌زند (۵ بار در ثانیه) تا شمارش
      // معکوس روان به‌نظر برسد. ولی چیزی که روی صفحه عوض می‌شود فقط
      // یک عددِ ثانیه است.
      //
      // اگر هر تیک `notifyListeners` می‌زد، صفحهٔ بازی ۵ بار در ثانیه
      // بازساخته می‌شد به‌جای ۱ بار — یعنی ۵ برابر کار برای صفر
      // تفاوتِ دیداری.
      //
      // منطق واقعی در game_session.dart این شرط را دارد:
      //     if (clamped != secondsLeft) { ... notifyListeners(); }
      // این تست همان قرارداد را روی یک بازتولیدِ ساده قفل می‌کند.
      var notifications = 0;
      var secondsLeft = -1;

      void tick(int elapsedMs) {
        const totalMs = 15000;
        final left = ((totalMs - elapsedMs) / 1000).ceil();
        final clamped = left.clamp(0, 15);
        if (clamped != secondsLeft) {
          secondsLeft = clamped;
          notifications++;
        }
      }

      // یک ثانیهٔ کامل: پنج تیکِ ۲۰۰ میلی‌ثانیه‌ای.
      for (var ms = 0; ms <= 1000; ms += 200) {
        tick(ms);
      }
      expect(notifications, lessThanOrEqualTo(2),
          reason: 'در یک ثانیه نباید بیش از یکی دو اعلان بدهد، '
              'شد $notifications');
    });

    test('کل یک نوبت ۱۵ ثانیه‌ای حدود ۱۵ اعلان دارد، نه ۷۵', () {
      var notifications = 0;
      var secondsLeft = -1;
      for (var ms = 0; ms <= 15000; ms += 200) {
        final left = ((15000 - ms) / 1000).ceil();
        final clamped = left.clamp(0, 15);
        if (clamped != secondsLeft) {
          secondsLeft = clamped;
          notifications++;
        }
      }
      // ۷۵ تیک در کل نوبت؛ فقط ۱۶ تای آن باید اعلان بدهد.
      expect(notifications, lessThanOrEqualTo(17),
          reason: 'ساعت نباید در هر تیک اعلان بدهد، شد $notifications');
      expect(notifications, greaterThan(10),
          reason: 'ولی باید واقعاً شمارش معکوس را نشان دهد');
    });
  });
}
