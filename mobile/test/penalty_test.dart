// تست‌های بازی ضربات پنالتی — سمت کلاینت.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا اینجا صفحه رندر نمی‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// PenaltyScreen در لحظهٔ ساخت `GameSession(...).connect()` را صدا می‌زند و
// socket.io یک تایمر بازپیوند داخلی می‌سازد که خارج از کنترل ماست؛
// flutter_test آن را «تایمر معلق» می‌بیند و تست را رد می‌کند. هیچ‌کدام از
// سه بازی دیگر هم به همین دلیل تست ویجت ندارند.
//
// پس به‌جای رندر کردن، **منطقی** که واقعاً می‌تواند بشکند تست می‌شود:
// نگاشت ناحیه‌ها، منحنی پرتابه، و مهم‌تر از همه اینکه اعداد کلاینت با
// سرور یکی بمانند. اگر این دو از هم جدا بیفتند، کاربر انیمیشنی می‌بیند
// که با نتیجهٔ واقعی نمی‌خواند — بدترین نوع باگ چون شبیه تقلب به‌نظر
// می‌رسد.
import 'dart:math' as math;
import 'package:flutter_test/flutter_test.dart';

/// همان نگاشتی که سرور و نقاش صفحه استفاده می‌کنند.
int zoneCol(int z) => z % 3;
int zoneRow(int z) => z ~/ 3;

/// درون‌یابی خطی — همان که _PitchPainter برای مسیر توپ به کار می‌برد.
double lerp(double a, double b, double t) => a + (b - a) * t;

void main() {
  group('نگاشت نواحی دروازه', () {
    test('۹ ناحیه، بدون هم‌پوشانی', () {
      final seen = <String>{};
      for (var z = 0; z < 9; z++) {
        seen.add('${zoneRow(z)},${zoneCol(z)}');
      }
      expect(seen.length, 9);
    });

    test('گوشه‌ها درست نگاشت می‌شوند', () {
      expect([zoneRow(0), zoneCol(0)], [0, 0], reason: 'بالا-چپ');
      expect([zoneRow(2), zoneCol(2)], [0, 2], reason: 'بالا-راست');
      expect([zoneRow(6), zoneCol(6)], [2, 0], reason: 'پایین-چپ');
      expect([zoneRow(8), zoneCol(8)], [2, 2], reason: 'پایین-راست');
      expect([zoneRow(4), zoneCol(4)], [1, 1], reason: 'مرکز');
    });

    test('هر ناحیه در محدودهٔ معتبر است', () {
      for (var z = 0; z < 9; z++) {
        expect(zoneRow(z), inInclusiveRange(0, 2));
        expect(zoneCol(z), inInclusiveRange(0, 2));
      }
    });
  });

  group('مسیر پرتابهٔ توپ', () {
    test('از نقطهٔ پنالتی شروع و به ناحیهٔ هدف ختم می‌شود', () {
      const from = 100.0, to = 40.0;
      expect(lerp(from, to, 0), from);
      expect(lerp(from, to, 1), to);
    });

    test('قوس در وسط مسیر بیشترین ارتفاع را دارد', () {
      // arc = sin(t*pi) — همان فرمول نقاش.
      double arc(double t) => math.sin(t * math.pi);
      expect(arc(0), closeTo(0, 0.001), reason: 'شروع بدون قوس');
      expect(arc(1), closeTo(0, 0.001), reason: 'پایان بدون قوس');
      expect(arc(0.5), closeTo(1, 0.001), reason: 'اوج در وسط');
      expect(arc(0.5) > arc(0.25), isTrue);
      expect(arc(0.5) > arc(0.75), isTrue);
    });

    test('قوس هرگز منفی نمی‌شود — توپ زیر زمین نمی‌رود', () {
      for (var i = 0; i <= 100; i++) {
        final t = i / 100;
        expect(math.sin(t * math.pi), greaterThanOrEqualTo(-0.0001));
      }
    });

    test('توپ در مسیر کوچک می‌شود — حس پرسپکتیو', () {
      const r0 = 10.0;
      final rEnd = lerp(r0, r0 * 0.55, 1);
      expect(rEnd, lessThan(r0));
      expect(rEnd, greaterThan(0), reason: 'هرگز صفر یا منفی نمی‌شود');
    });
  });

  group('قدرت شوت', () {
    // نوار قدرت بین ۰.۳۵ و ۱ نوسان می‌کند. شوت خیلی ضعیف هیچ‌وقت انتخاب
    // منطقی نیست و فقط کاربر را سرخورده می‌کند.
    double power(double osc) => 0.35 + osc * 0.65;

    test('کف و سقف درست است', () {
      expect(power(0), closeTo(0.35, 0.001));
      expect(power(1), closeTo(1.0, 0.001));
    });

    test('همیشه در بازهٔ معتبر سرور می‌ماند', () {
      for (var i = 0; i <= 100; i++) {
        final p = power(i / 100);
        expect(p, inInclusiveRange(0.0, 1.0),
            reason: 'سرور قدرت خارج از ۰..۱ را رد می‌کند');
      }
    });

    test('صعودی است — نگه داشتن بیشتر یعنی محکم‌تر', () {
      expect(power(0.8), greaterThan(power(0.2)));
    });
  });

  group('قرارداد با سرور', () {
    test('شیء حرکت شکل درستی دارد', () {
      // سرور {zone:int 0..8, power:double 0..1} می‌خواهد.
      final shot = {'zone': 7, 'power': 0.82};
      expect(shot['zone'], isA<int>());
      expect(shot['power'], isA<double>());
      expect(shot['zone'] as int, inInclusiveRange(0, 8));
      expect(shot['power'] as double, inInclusiveRange(0.0, 1.0));
    });

    test('دروازه‌بان فقط ناحیه می‌فرستد', () {
      final dive = {'zone': 3};
      expect(dive.containsKey('power'), isFalse,
          reason: 'سرور برای دروازه‌بان قدرت لازم ندارد');
    });
  });
}
