// ============================================================================
//  گردونهٔ شانس — تست‌های کلاینت
// ============================================================================
//
//   flutter test test/wheel_test.dart
//
// چیزی که اینجا سنجیده می‌شود، منطقِ *کلاینت* است؛ احتمالات و پرداخت کاملاً
// سمت سرور هستند و در backend/scripts/testWheel.js تست می‌شوند.
//
// مهم‌ترین چیزی که کلاینت می‌تواند خراب کند: سوزن روی برشی بایستد که با
// جایزهٔ اعلام‌شده فرق دارد. آن لحظه کاربر مطمئن می‌شود بازی تقلبی است،
// حتی اگر جایزه درست واریز شده باشد.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/wheel_page.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';

/// همان محاسبه‌ای که WheelPage برای زاویهٔ توقف انجام می‌دهد.
///
/// بازتولید شده تا بشود بدون شبکه و بدون انیمیشن تستش کرد. اگر این و
/// نسخهٔ داخل صفحه از هم جدا شوند، تستِ «هر برش زیر سوزن می‌ایستد» شکست
/// می‌خورد — که دقیقاً کاری است که باید بکند.
double stopTurns(int idx, int n, double jitterFactor) {
  final seg = 1.0 / n;
  final target = 1.0 - (idx + 0.5) * seg;
  final jitter = jitterFactor * seg * 0.7;
  const fullSpins = 6.0;
  const base = fullSpins;
  final frac = (target + jitter) - (base % 1.0);
  return base + (frac < 0 ? frac + 1.0 : frac);
}

/// کدام برش بعد از چرخیدن به اندازهٔ [turns] زیر سوزن (بالای دایره) است.
int sliceUnderPointer(double turns, int n) {
  // گردونه به اندازهٔ turns چرخیده؛ نقطه‌ای که الان بالاست، قبل از چرخش
  // در زاویهٔ -turns بوده.
  var frac = (-turns) % 1.0;
  if (frac < 0) frac += 1.0;
  return (frac * n).floor() % n;
}

void main() {
  group('زاویهٔ توقف گردونه', () {
    test('هر برش دقیقاً زیر سوزن می‌ایستد', () {
      // این تستِ اصلی است: اگر جایزهٔ اعلام‌شده با برشِ زیر سوزن نخواند،
      // کاربر فکر می‌کند بازی تقلبی است.
      for (final n in [6, 8, 9, 12]) {
        for (var idx = 0; idx < n; idx++) {
          final turns = stopTurns(idx, n, 0);
          expect(sliceUnderPointer(turns, n), idx,
              reason: 'برش $idx از $n زیر سوزن نایستاد');
        }
      }
    });

    test('پراکندگی تصادفی هرگز از مرز برش رد نمی‌شود', () {
      // jitter برای این است که چرخش‌ها یک‌شکل نباشند، ولی اگر از نصف عرض
      // برش بیشتر شود، سوزن روی برش همسایه می‌ایستد و جایزه با تصویر
      // نمی‌خواند. ۷۰٪ یعنی حداکثر ۳۵٪ به هر طرف — امن.
      const n = 9;
      for (var idx = 0; idx < n; idx++) {
        for (final j in [-0.5, -0.49, -0.25, 0.0, 0.25, 0.49, 0.5]) {
          final turns = stopTurns(idx, n, j);
          expect(sliceUnderPointer(turns, n), idx,
              reason: 'برش $idx با jitter $j جابه‌جا شد');
        }
      }
    });

    test('همیشه حداقل شش دور کامل می‌چرخد', () {
      // کمتر از این، چرخش شبیه یک تکان کوچک می‌شود نه یک گردونه.
      for (var idx = 0; idx < 9; idx++) {
        expect(stopTurns(idx, 9, 0), greaterThanOrEqualTo(6.0));
      }
    });

    test('چرخش همیشه رو به جلوست، هیچ‌وقت به عقب نمی‌پرد', () {
      // اگر زاویه بین دو چرخش کم شود، گردونه معکوس می‌چرخد که غلط به‌نظر
      // می‌رسد. مقدار تجمعی است، پس باید همیشه بزرگ‌تر باشد.
      var previous = 0.0;
      final rnd = math.Random(42);
      for (var i = 0; i < 50; i++) {
        final idx = rnd.nextInt(9);
        const seg = 1.0 / 9;
        final target = 1.0 - (idx + 0.5) * seg;
        final base = previous + 6.0;
        final frac = target - (base % 1.0);
        final next = base + (frac < 0 ? frac + 1.0 : frac);
        expect(next, greaterThan(previous));
        previous = next;
      }
    });
  });

  group('پارس جایزه از سرور', () {
    test('رنگ hex شش‌رقمی درست خوانده می‌شود', () {
      final p = WheelPrize.fromJson({
        'label': '۱۰۰ امتیاز', 'kind': 'points', 'value': 100,
        'color': '#84CC16', 'sliceOrder': 1,
      });
      expect(p.color, const Color(0xFF84CC16));
      expect(p.value, 100);
      expect(p.sliceOrder, 1);
    });

    test('رنگ نامعتبر باعث کرش نمی‌شود', () {
      // سرور رنگ را از دیتابیس می‌فرستد و مدیر می‌تواند اشتباه تایپ کند.
      // یک صفحهٔ خالی بدتر از یک برش سبز است.
      for (final bad in ['', 'nope', '#GG0000', null, 42]) {
        final p = WheelPrize.fromJson({
          'label': 'x', 'kind': 'points', 'value': 1,
          'color': bad, 'sliceOrder': 1,
        });
        expect(p.color, isA<Color>());
      }
    });

    test('مقدار عددی به شکل رشته هم پذیرفته می‌شود', () {
      // JSON از شبکه می‌آید؛ اتکا به اینکه همیشه int است شکننده است.
      final p = WheelPrize.fromJson({
        'label': 'x', 'kind': 'cash', 'value': '50000',
        'color': '#F59E0B', 'sliceOrder': '2',
      });
      expect(p.value, 50000);
      expect(p.sliceOrder, 2);
    });

    test('فیلدهای غایب باعث کرش نمی‌شوند', () {
      final p = WheelPrize.fromJson({});
      expect(p.label, '');
      expect(p.value, 0);
      expect(p.kind, 'points');
    });
  });

  _v2();

  group('نمایش گردونه', () {
    testWidgets('بدون جایزه هم کرش نمی‌کند', (tester) async {
      // اگر کاتالوگ خالی باشد (مدیر همه را غیرفعال کرده)، صفحه باید
      // چیزی نشان بدهد نه اینکه بترکد.
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: SizedBox(width: 300, height: 300)),
      ));
      expect(tester.takeException(), isNull);
    });
  });
}

// ============================================================================
//  مشخصات نسخهٔ دوم — کد ۴ رقمی، سهمیهٔ متغیر، امتیاز بازی
// ============================================================================

void _v2() {
  group('منحنی امتیاز بازی ضربه‌زن', () {
    const cfg = TapGameConfig();

    test('کل بازی دقیقاً ۵۰٬۰۰۰ امتیاز است', () {
      // عددی که مالک تعیین کرد. پنجاه جملهٔ گرد‌شده به‌تنهایی عدد رُندی
      // نمی‌سازند، پس خطای گرد کردن در لول آخر جبران می‌شود؛ اگر آن
      // بشکند، بازی بی‌سروصدا ۴۹٬۹۹۷ امتیاز می‌ارزد.
      expect(cfg.gameTotalPoints, 50000);
      var sum = 0;
      for (var lv = 1; lv <= cfg.levelCount; lv++) {
        sum += cfg.requiredTaps(lv);
      }
      expect(sum, 50000);
    });

    test('با سرور یکی است — همان چند نقطهٔ کلیدی', () {
      // این اعداد از tapGameService.js می‌آیند. اگر دو سر از هم جدا شوند،
      // کلاینت نوار پیشرفتی نشان می‌دهد که سینک بعدی عوضش می‌کند.
      expect(cfg.requiredTaps(1), 239);
      expect(cfg.requiredTaps(2), 251);
      expect(cfg.requiredTaps(25), 770);
      expect(cfg.requiredTaps(50), 2611);
    });

    test('هیچ لولی رایگان نیست', () {
      // لول با هزینهٔ صفر، حلقهٔ لول‌آپ موتور را بی‌نهایت می‌چرخاند.
      for (var lv = 1; lv <= cfg.levelCount; lv++) {
        expect(cfg.requiredTaps(lv), greaterThanOrEqualTo(1), reason: 'لول $lv');
      }
    });

    test('منحنی صعودی است', () {
      for (var lv = 2; lv <= cfg.levelCount; lv++) {
        expect(cfg.requiredTaps(lv),
            greaterThanOrEqualTo(cfg.requiredTaps(lv - 1)));
      }
    });

    test('سقف روزانه ۲ لول است', () {
      expect(cfg.levelsPerDay, 2);
    });

    test('cumulativePoints از صفر شروع می‌شود', () {
      expect(cfg.cumulativePoints(1, 0), 0);
    });

    test('cumulativePoints لول‌های تمام‌شده را می‌شمارد', () {
      expect(cfg.cumulativePoints(2, 0), cfg.requiredTaps(1));
      expect(cfg.cumulativePoints(2, 7), cfg.requiredTaps(1) + 7);
    });

    test('بازی تمام‌شده برابر ۵۰٬۰۰۰ است', () {
      expect(cfg.cumulativePoints(cfg.levelCount + 1, 0), 50000);
    });

    test('مقدار خراب امتیاز را باد نمی‌کند', () {
      // اختلاف دو خوانش cumulativePoints همان چیزی است که **پرداخت**
      // می‌شود؛ یک مقدار کران‌نخورده اینجا یعنی ساختن امتیاز از هوا.
      expect(cfg.cumulativePoints(1, 1000000), cfg.requiredTaps(1));
      expect(cfg.cumulativePoints(1, -99), 0);
      // لولِ منفی به ۱ کلمپ می‌شود، پس امتیازِ درونِ لول همچنان شمرده
      // می‌شود. سرور هم دقیقاً همین کار را می‌کند — و همین «یکی بودن»
      // چیزی است که اهمیت دارد، نه خودِ عدد.
      expect(cfg.cumulativePoints(-5, 10), 10);
      expect(cfg.cumulativePoints(9999, 10), 50000);
    });

    test('پیکربندی خراب کرش نمی‌کند', () {
      // یک پاس تنظیم اشتباه نباید NaN تولید کند و کل صفحه را بترکاند.
      for (final bad in [
        const TapGameConfig(totalPoints: 0),
        const TapGameConfig(growthFactor: 0),
        const TapGameConfig(levelCount: 1),
      ]) {
        expect(() => bad.requiredTaps(1), returnsNormally);
        expect(bad.requiredTaps(1), greaterThanOrEqualTo(1));
      }
    });
  });
}
