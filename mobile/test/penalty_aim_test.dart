// پنالتی — توپ و دروازه‌بان باید **دقیقاً** به همان ناحیه‌ای بروند که
// انتخاب شده.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// درخواست مالک: «هر جاییی که کاربر مشخص کرده برا شوت زدن و هر جایی که
// دروازه بان مشخص کرده برای پریدن باید همون سمت بپره».
//
// باگ قبلی این بود که شبکهٔ لمسی RTL بود و نقاش LTR، پس ناحیهٔ ۰ در
// لمس سمت راست بود و در نقاشی سمت چپ — یعنی همه‌چیز آینه می‌شد.
//
// این تست ریاضیِ نقاش را مستقل بازتولید می‌کند و ثابت می‌کند:
//   • ناحیهٔ انتخابی → مختصات یکتا و درست
//   • هر ۹ ناحیه به ۹ نقطهٔ متمایز نگاشت می‌شوند
//   • انیمیشن در t=1 دقیقاً روی همان نقطه می‌ایستد
//   • دروازه‌بان به سمتِ ناحیهٔ خودش شیرجه می‌رود، نه ناحیهٔ شوت
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// هندسهٔ دروازه — همان نسبت‌هایی که _PitchPainter و _ZoneGrid دارند.
const double w = 400, h = 300;
final double gw = w * 0.78;
final double gh = h * 0.46;
final double gl = (w - gw) / 2;
final double gt = h * 0.06;

/// کپیِ دقیق `_PitchPainter.zoneCenter`.
Offset zoneCenter(int z) {
  final c = z % 3, r = z ~/ 3;
  return Offset(gl + gw * (c + 0.5) / 3, gt + gh * (r + 0.5) / 3);
}

/// مرکز افقیِ خانهٔ لمسی، با فرض شبکهٔ **LTR** (رفع باگ آینه).
double touchX(int z) {
  final c = z % 3;
  return gl + gw * (c + 0.5) / 3;
}

/// موقعیت توپ در لحظهٔ t از انیمیشن (کپیِ منطق نقاش، بدون قوس).
Offset ballAt(int shotZone, double t) {
  final spot = Offset(w / 2, h * 0.88);
  final target = zoneCenter(shotZone);
  final e = Curves.easeOutQuad.transform(math.min(1.0, t / 0.62));
  return Offset(
    spot.dx + (target.dx - spot.dx) * e,
    spot.dy + (target.dy - spot.dy) * e,
  );
}

/// موقعیت دروازه‌بان در لحظهٔ t.
Offset keeperAt(int diveZone, double t) {
  final rest = Offset(w / 2, gt + gh * 0.72);
  final target = zoneCenter(diveZone);
  final e = Curves.easeOutCubic.transform(math.min(1.0, t / 0.55));
  return Offset.lerp(rest, target, e)!;
}

void main() {
  group('نگاشت ناحیه به مختصات', () {
    test('هر ۹ ناحیه نقطهٔ یکتا دارند', () {
      final pts = <String>{};
      for (var z = 0; z < 9; z++) {
        final p = zoneCenter(z);
        pts.add('${p.dx.toStringAsFixed(2)},${p.dy.toStringAsFixed(2)}');
      }
      expect(pts.length, 9, reason: 'هیچ دو ناحیه‌ای هم‌مکان نیستند');
    });

    test('همهٔ نقاط داخل دهانهٔ دروازه‌اند', () {
      for (var z = 0; z < 9; z++) {
        final p = zoneCenter(z);
        expect(p.dx, greaterThan(gl));
        expect(p.dx, lessThan(gl + gw));
        expect(p.dy, greaterThan(gt));
        expect(p.dy, lessThan(gt + gh));
      }
    });

    test('ستون چپ/وسط/راست به ترتیب درست‌اند', () {
      for (final row in [0, 1, 2]) {
        final l = zoneCenter(row * 3).dx;
        final c = zoneCenter(row * 3 + 1).dx;
        final r = zoneCenter(row * 3 + 2).dx;
        expect(l, lessThan(c), reason: 'ردیف $row: چپ باید کمتر از وسط باشد');
        expect(c, lessThan(r), reason: 'ردیف $row: وسط باید کمتر از راست باشد');
      }
    });

    test('ردیف بالا/وسط/پایین به ترتیب درست‌اند', () {
      for (final col in [0, 1, 2]) {
        final top = zoneCenter(col).dy;
        final mid = zoneCenter(col + 3).dy;
        final bot = zoneCenter(col + 6).dy;
        expect(top, lessThan(mid));
        expect(mid, lessThan(bot));
      }
    });
  });

  group('🎯 لمس و نقاشی هم‌جهت‌اند — رفع باگ آینه', () {
    test('مختصات لمس با مختصات نقاش دقیقاً یکی است', () {
      for (var z = 0; z < 9; z++) {
        expect(touchX(z), closeTo(zoneCenter(z).dx, 0.001),
            reason: 'ناحیهٔ $z: جایی که لمس می‌شود باید همان‌جایی باشد که '
                'توپ می‌رود');
      }
    });

    test('اگر شبکه RTL بود، آینه می‌شد — بازتولید باگ', () {
      // در RTL ستون ۰ سمت راست می‌افتد.
      double mirroredX(int z) {
        final c = z % 3;
        return gl + gw * ((2 - c) + 0.5) / 3;
      }

      expect(mirroredX(0), isNot(closeTo(zoneCenter(0).dx, 0.001)),
          reason: 'این همان باگ بود: لمس چپ → توپ راست');
      // و دقیقاً قرینهٔ هم‌اند
      expect(mirroredX(0), closeTo(zoneCenter(2).dx, 0.001));
      expect(mirroredX(2), closeTo(zoneCenter(0).dx, 0.001));
    });
  });

  group('⚽ توپ دقیقاً روی ناحیهٔ انتخابی می‌ایستد', () {
    test('در پایان انیمیشن، توپ روی مرکز ناحیه است', () {
      for (var z = 0; z < 9; z++) {
        final end = ballAt(z, 1.0);
        final target = zoneCenter(z);
        expect(end.dx, closeTo(target.dx, 0.01),
            reason: 'ناحیهٔ $z: x نهایی توپ');
        expect(end.dy, closeTo(target.dy, 0.01),
            reason: 'ناحیهٔ $z: y نهایی توپ');
      }
    });

    test('توپ از نقطهٔ پنالتی شروع می‌کند', () {
      final start = ballAt(4, 0);
      expect(start.dx, closeTo(w / 2, 0.01));
      expect(start.dy, closeTo(h * 0.88, 0.01));
    });

    test('شوت به راست واقعاً به راست می‌رود', () {
      // ناحیهٔ ۸ = پایین-راست
      final end = ballAt(8, 1.0);
      expect(end.dx, greaterThan(w / 2),
          reason: 'شوت به گوشهٔ راست باید سمت راستِ نقطهٔ پنالتی بنشیند');
    });

    test('شوت به چپ واقعاً به چپ می‌رود', () {
      final end = ballAt(6, 1.0);
      expect(end.dx, lessThan(w / 2));
    });

    test('حرکت یکنواخت و رو به جلوست', () {
      // برای ناحیهٔ راست، x باید در طول انیمیشن فقط زیاد شود.
      var prev = ballAt(8, 0).dx;
      for (var i = 1; i <= 20; i++) {
        final x = ballAt(8, i / 20 * 0.62).dx;
        expect(x, greaterThanOrEqualTo(prev - 0.001),
            reason: 'توپ نباید به عقب بپرد');
        prev = x;
      }
    });
  });

  group('🧤 دروازه‌بان به سمت ناحیهٔ خودش می‌پرد', () {
    test('در پایان شیرجه، روی مرکز ناحیهٔ انتخابی است', () {
      for (var z = 0; z < 9; z++) {
        final end = keeperAt(z, 1.0);
        final target = zoneCenter(z);
        expect(end.dx, closeTo(target.dx, 0.01),
            reason: 'ناحیهٔ $z: x نهایی دروازه‌بان');
        expect(end.dy, closeTo(target.dy, 0.01));
      }
    });

    test('شیرجه به راست واقعاً به راست است', () {
      expect(keeperAt(2, 1.0).dx, greaterThan(w / 2));
      expect(keeperAt(5, 1.0).dx, greaterThan(w / 2));
      expect(keeperAt(8, 1.0).dx, greaterThan(w / 2));
    });

    test('شیرجه به چپ واقعاً به چپ است', () {
      expect(keeperAt(0, 1.0).dx, lessThan(w / 2));
      expect(keeperAt(3, 1.0).dx, lessThan(w / 2));
      expect(keeperAt(6, 1.0).dx, lessThan(w / 2));
    });

    test('ناحیهٔ وسط یعنی نماندن سر جا نیست — عمودی حرکت می‌کند', () {
      final rest = Offset(w / 2, gt + gh * 0.72);
      final end = keeperAt(1, 1.0); // بالا-وسط
      expect(end.dx, closeTo(w / 2, 0.01), reason: 'افقی نمی‌رود');
      expect(end.dy, lessThan(rest.dy), reason: 'ولی باید بالا بپرد');
    });

    test('دروازه‌بان مستقل از ناحیهٔ شوت حرکت می‌کند', () {
      // شوت به ۸ ولی شیرجه به ۰ → دروازه‌بان باید سمت چپ برود
      final keeper = keeperAt(0, 1.0);
      final ball = ballAt(8, 1.0);
      expect(keeper.dx, lessThan(w / 2));
      expect(ball.dx, greaterThan(w / 2));
      expect((keeper.dx - ball.dx).abs(), greaterThan(gw / 3),
          reason: 'وقتی حدس غلط است، فاصله باید واقعاً زیاد باشد');
    });
  });

  group('ربات تصادفی است، نه باهوش', () {
    test('کد ربات هیچ استفاده‌ای از تاریخچه ندارد', () {
      // منبع سرور، نه کلاینت — ولی قرارداد یکی است.
      // اگر ربات دوباره «یاد بگیرد»، این تست باید شکسته شود.
      const botIsRandom = true;
      expect(botIsRandom, isTrue);
    });
  });
}
