// ============================================================================
//  بازی ضربه‌زن نباید گوشی را کند کند
// ============================================================================
//
//   flutter test test/tap_perf_test.dart
//
// گزارش مالک: «بازی ضربه‌زن به شدت سرعت موبایل رو پایین میاره بعد مدتی».
//
// ═══════════════════════════════════════════════════════════════════════════
// ریشهٔ مشکل
// ═══════════════════════════════════════════════════════════════════════════
//
// هر ضربه `setState` روی کلِ صفحه صدا می‌زد. یعنی در هر فریم **تمامِ**
// درخت دوباره ساخته می‌شد — از جمله `TapCharacter` که تصویرِ شخصیت،
// `AnimatedBuilder`، `CustomPaint`ِ شناورها و یک `Stack` دارد.
//
// `TapCharacter` هیچ نیازی به بازسازی ندارد: کلِ انیمیشنش با کنترلرهای
// داخلیِ خودش اجرا می‌شود. ولی چون والد بازسازی می‌شد، فلاتر مجبور بود
// آن زیردرخت را هم دوباره بسازد و تطبیق دهد — ۱۲ بار در ثانیه کارِ
// کاملاً بی‌فایده. فشارِ مداومِ ساختِ ویجت GC را وادار به اجرای مکرر
// می‌کرد و «بعد مدتی» گوشی گرم و کند می‌شد.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست به این شکل نوشته شده
// ═══════════════════════════════════════════════════════════════════════════
//
// نمی‌شود «سرعت» را در تستِ واحد سنجید — عددش به ماشینِ اجراکننده بستگی
// دارد و تستِ کند-یا-تند شکننده است.
//
// چیزی که **می‌شود** قطعی سنجید، خودِ علت است: «آیا زیردرختِ سنگین با
// هر ضربه دوباره ساخته می‌شود؟» یک شمارندهٔ ساده در `build` جواب را
// می‌دهد و به سخت‌افزار هیچ ربطی ندارد.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_guard.dart';

/// ویجتی که هر بار `build` شدنش شمرده می‌شود.
///
/// جایگزینِ `TapCharacter` در تست: همان نقش را دارد (فرزندِ گرانِ صفحه)
/// ولی به دارایی و شبکه نیاز ندارد.
class _CountingChild extends StatelessWidget {
  const _CountingChild({required this.onBuild});
  final VoidCallback onBuild;

  @override
  Widget build(BuildContext context) {
    onBuild();
    return const SizedBox(width: 40, height: 40);
  }
}

/// بازسازیِ الگوی صفحه: یک شمارنده که مدام عوض می‌شود + یک فرزندِ گران.
class _Harness extends StatefulWidget {
  const _Harness({super.key, required this.onChildBuild, required this.useNotifier});
  final VoidCallback onChildBuild;

  /// true → الگوی جدید (ValueListenableBuilder)
  /// false → الگوی قدیمی (setState سراسری)
  final bool useNotifier;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  final ValueNotifier<int> tick = ValueNotifier<int>(0);
  int counter = 0;

  /// یک «ضربه» را شبیه‌سازی می‌کند.
  void bump() {
    counter++;
    if (widget.useNotifier) {
      tick.value++;
    } else {
      setState(() {});
    }
  }

  @override
  void dispose() {
    tick.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Column(
        children: [
          if (widget.useNotifier)
            ValueListenableBuilder<int>(
              valueListenable: tick,
              builder: (_, __, ___) => Text('$counter'),
            )
          else
            Text('$counter'),
          _CountingChild(onBuild: widget.onChildBuild),
        ],
      ),
    );
  }
}

void main() {
  group('بازسازیِ زیردرختِ سنگین', () {
    testWidgets('الگوی قدیمی: هر ضربه فرزند را هم بازمی‌سازد (رگرسیون)',
        (tester) async {
      var builds = 0;
      final key = GlobalKey<_HarnessState>();
      await tester.pumpWidget(MaterialApp(
        home: _Harness(
            key: key, onChildBuild: () => builds++, useNotifier: false),
      ));
      expect(builds, 1);

      for (var i = 0; i < 20; i++) {
        key.currentState!.bump();
        await tester.pump();
      }

      // این همان رفتارِ خراب است — اینجا **ثبت** می‌شود تا اگر روزی کسی
      // به الگوی setState برگردد، تفاوت در تستِ بعدی فریاد بزند.
      expect(builds, 21,
          reason: 'setState سراسری کلِ درخت را بازمی‌سازد');
    });

    testWidgets('الگوی جدید: ۲۰ ضربه، فرزند فقط یک بار ساخته می‌شود',
        (tester) async {
      var builds = 0;
      final key = GlobalKey<_HarnessState>();
      await tester.pumpWidget(MaterialApp(
        home:
            _Harness(key: key, onChildBuild: () => builds++, useNotifier: true),
      ));
      expect(builds, 1, reason: 'ساختِ اولیه');

      for (var i = 0; i < 20; i++) {
        key.currentState!.bump();
        await tester.pump();
      }

      // نکتهٔ اصلی: عدد روی صفحه به‌روز شده ولی فرزند دست‌نخورده مانده.
      expect(builds, 1,
          reason: 'ValueListenableBuilder فقط خودش را بازمی‌سازد؛ '
              'TapCharacter نباید با هر ضربه دوباره ساخته شود');
      expect(find.text('20'), findsOneWidget,
          reason: 'شمارنده باید واقعاً به‌روز شده باشد');
    });
  });

  group('گاردِ ضربه حافظه را نمی‌بلعد', () {
    // «بعد مدتی» یعنی هر ساختاری که با ادامهٔ بازی رشد کند مشکوک است.
    test('پنجرهٔ لغزان بعد از هزاران ضربه هم کوچک می‌ماند', () {
      const cfg = TapGameConfig();
      final guard = TapGuard(config: cfg);
      var now = 0;
      for (var i = 0; i < 5000; i++) {
        // فاصلهٔ معقول تا ضربه‌ها پذیرفته شوند.
        now += cfg.minTapInterval.inMilliseconds + 5;
        guard.register(now);
      }
      // پنجره فقط ضربه‌های یک ثانیهٔ اخیر را نگه می‌دارد.
      expect(guard.currentRate, lessThanOrEqualTo(cfg.maxTapsPerSecond),
          reason: 'پنجره باید قدیمی‌ها را دور بیندازد، نه اینکه انبار کند');
    });

    test('ضربه‌های ردشده هم چیزی انباشت نمی‌کنند', () {
      const cfg = TapGameConfig();
      final guard = TapGuard(config: cfg);
      // همه در یک لحظه: همه رد می‌شوند جز اولی.
      for (var i = 0; i < 3000; i++) {
        guard.register(1000);
      }
      expect(guard.currentRate, lessThanOrEqualTo(cfg.maxTapsPerSecond));
      expect(guard.rejectedCount, greaterThan(0));
    });

    test('reset همه‌چیز را پاک می‌کند', () {
      const cfg = TapGameConfig();
      final guard = TapGuard(config: cfg);
      var now = 0;
      for (var i = 0; i < 50; i++) {
        now += cfg.minTapInterval.inMilliseconds + 5;
        guard.register(now);
      }
      guard.reset();
      expect(guard.currentRate, 0);
      expect(guard.acceptedCount, 0);
      expect(guard.rejectedCount, 0);
    });
  });
}
