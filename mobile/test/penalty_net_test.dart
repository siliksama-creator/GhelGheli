// فیزیک تور دروازه — پایداری، درستی، و **دیده شدن** روی صفحه.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها لازم‌اند
// ═══════════════════════════════════════════════════════════════════════════
//
// دو نگرانیِ مالک اینجا به هم می‌رسند و معمولاً با هم می‌جنگند:
//
//   ۱. «کاربر گل زد اصلا بفهمه گل زده — هیچ اتفاقی توی تور دروازه
//      نمیوفته» → تور باید واقعاً و در **جای درست** موج بردارد.
//   ۲. «حافظه اجرایی اپ در زمان بازی ها بالا نره که اپ کراش نکنه یا
//      کند نشه» → همان تور نباید هزینهٔ اجرا بسازد.
//
// هر دو اینجا اندازه‌گیری می‌شوند، نه فرض.
//
// ═══════════════════════════════════════════════════════════════════════════
// دو اشتباهِ واقعی که همین تست‌ها گرفتند
// ═══════════════════════════════════════════════════════════════════════════
//
// **اول — انفجارِ عددی.** نسخهٔ اول نیروها را درجا حساب می‌کرد: گرهٔ i
// موقعیتِ همسایهٔ چپش را می‌خواند که در همان پیمایش قبلاً به‌روز شده
// بود، ولی همسایهٔ راستش را از فریم قبل (گوس-زایدل به‌جای ژاکوبی).
// عملگرِ حاصل متقارن نبود و انرژی به‌جای کم شدن رشد می‌کرد: مجموع
// قدرمطلقِ عمق‌ها از ۸.۷ در فریم ۱۰ به **۴۹۱** در فریم ۳۸۰ رسید. تور
// منفجر می‌شد و هرگز نمی‌خوابید، پس Ticker تا ابد روشن می‌ماند.
//
// **دوم — فیزیکِ درست ولی نامرئی.** بعد از رفعِ پایداری، شبیه‌سازی
// «درست» کار می‌کرد: موج پخش می‌شد، بازتاب می‌کرد، آرام می‌گرفت. ولی
// اندازه‌گیریِ خروجیِ تصویری نشان داد بیشترین جابه‌جایی روی یک دروازهٔ
// ۳۲۰×۱۵۰ پیکسلی فقط **۱.۱۶ پیکسل** است — یعنی دقیقاً همان «هیچ
// اتفاقی نمی‌افتد»ی که مالک شکایت کرد، فقط این بار با فیزیک.
//
// درسِ دومی مهم‌تر است: **فیزیکِ درست به‌خودیِ‌خود جلوهٔ دیده‌شدنی
// نمی‌سازد.** برای همین گروهِ «دیده شدن» در انتها، خروجیِ همان تابعی را
// می‌سنجد که نقاش استفاده می‌کند (`offY`) و نه مقادیرِ داخلی را.
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/games/penalty_net.dart';

/// شبیه‌سازی را [seconds] ثانیه با گام واقعیِ فریم جلو می‌برد.
void run(NetSim net, double seconds, {double dt = 1 / 60}) {
  for (var i = 0; i < (seconds / dt).round(); i++) {
    net.step(dt);
  }
}

/// مجموع قدرمطلقِ عمق‌ها — معیارِ «انرژیِ» قابل مشاهدهٔ سیستم.
double energyOf(NetSim n) {
  var e = 0.0;
  for (var r = 0; r < NetSim.rows; r++) {
    for (var c = 0; c < NetSim.cols; c++) {
      e += n.depth(c, r).abs();
    }
  }
  return e;
}

void main() {
  group('تور دروازه — حالت اولیه', () {
    test('در شروع خوابیده است و هیچ کاری نمی‌کند', () {
      final net = NetSim();
      expect(net.settled, isTrue);
      // مهم‌ترین ادعای عملکردی: تورِ ساکن **صفر** هزینه دارد.
      expect(net.step(1 / 60), isFalse,
          reason: 'تورِ خوابیده نباید هیچ گامی بردارد');
    });

    test('تور صاف است — هیچ گرهی جابه‌جا نیست', () {
      final net = NetSim();
      for (var r = 0; r < NetSim.rows; r++) {
        for (var c = 0; c < NetSim.cols; c++) {
          expect(net.offX(c, r, 300), 0);
          expect(net.offY(c, r, 140), 0);
          expect(net.depth(c, r), 0);
        }
      }
    });
  });

  group('تور دروازه — واکنش به ضربه', () {
    test('ضربه تور را بیدار می‌کند', () {
      final net = NetSim();
      net.hit(0.5, 0.5, 0.8);
      expect(net.settled, isFalse);
      expect(net.step(1 / 60), isTrue);
    });

    test('موج دقیقاً از نقطهٔ برخورد شروع می‌شود، نه از وسط', () {
      // این همان چیزی است که یک انیمیشنِ ازپیش‌ضبط‌شده نمی‌تواند بدهد:
      // توپ می‌تواند به هر کدام از ۹ ناحیه برود و موجِ ثابت همیشه از
      // وسط شروع می‌شود — چشم فوراً می‌فهمد که به ضربه ربطی ندارد.
      final net = NetSim();
      net.hit(0.15, 0.2, 0.9);
      run(net, 0.05);

      const leftCol = 2, topRow = 2;
      const rightCol = NetSim.cols - 3, bottomRow = NetSim.rows - 3;
      final near = net.depth(leftCol, topRow).abs();
      final far = net.depth(rightCol, bottomRow).abs();
      expect(near, greaterThan(far * 3),
          reason: 'نزدیکِ برخورد باید به‌وضوح بیشتر فرو رفته باشد '
              '(نزدیک=$near دور=$far)');
    });

    test('نقطهٔ برخورد راست با نقطهٔ برخورد چپ آینه است', () {
      final left = NetSim()..hit(0.2, 0.5, 0.8);
      final right = NetSim()..hit(0.8, 0.5, 0.8);
      run(left, 0.05);
      run(right, 0.05);

      const c = 2, mirror = NetSim.cols - 3;
      expect(left.depth(c, 4).abs(), greaterThan(left.depth(mirror, 4).abs()));
      expect(right.depth(mirror, 4).abs(),
          greaterThan(right.depth(c, 4).abs()));
      expect((left.depth(c, 4) - right.depth(mirror, 4)).abs(), lessThan(0.05));
    });

    test('ضربهٔ محکم‌تر موج بزرگ‌تری می‌سازد', () {
      final soft = NetSim()..hit(0.5, 0.5, 0.35);
      final hard = NetSim()..hit(0.5, 0.5, 1.0);
      run(soft, 0.05);
      run(hard, 0.05);
      expect(hard.peakDepth, greaterThan(soft.peakDepth * 1.3));
    });

    test('تیرک‌ها و بالای دروازه قفل‌اند — تور به میله دوخته است', () {
      final net = NetSim()..hit(0.5, 0.35, 1.0);
      run(net, 0.2);
      for (var r = 0; r < NetSim.rows; r++) {
        expect(net.depth(0, r), 0, reason: 'تیرک چپ نباید تکان بخورد');
        expect(net.depth(NetSim.cols - 1, r), 0,
            reason: 'تیرک راست نباید تکان بخورد');
      }
      for (var c = 0; c < NetSim.cols; c++) {
        expect(net.depth(c, 0), 0, reason: 'بالای دروازه نباید تکان بخورد');
      }
    });

    test('کفِ تور آزاد است — همان‌جا که توپ می‌افتد', () {
      // در دروازهٔ واقعی پایینِ تور آزادانه تکان می‌خورد و دقیقاً همان
      // چیزی است که «توپ افتاد داخل» را نشان می‌دهد.
      final net = NetSim()..hit(0.5, 0.85, 1.0);
      run(net, 0.08);
      var moved = false;
      for (var c = 1; c < NetSim.cols - 1; c++) {
        if (net.depth(c, NetSim.rows - 1).abs() > 0.01) moved = true;
      }
      expect(moved, isTrue);
    });
  });

  group('تور دروازه — پایداری عددی', () {
    test('حتی با محکم‌ترین ضربه منفجر نمی‌شود', () {
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      for (var i = 0; i < 600; i++) {
        net.step(1 / 60);
        expect(net.peakDepth.isFinite, isTrue, reason: 'مقدار NaN/بی‌نهایت شد');
        expect(net.peakDepth, lessThan(6.0), reason: 'دامنه منفجر شد');
      }
    });

    test('انرژی به‌جای رشد، کاهش می‌یابد', () {
      // ثبتِ مستقیمِ باگِ گوس-زایدل. اگر کسی بافرِ دوم را بردارد، این
      // تست فوراً قرمز می‌شود.
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      run(net, 0.15);
      final early = energyOf(net);
      run(net, 0.5);
      final later = energyOf(net);
      expect(later, lessThan(early),
          reason: 'سیستمِ میرا باید انرژی از دست بدهد، نه بگیرد '
              '(${early.toStringAsFixed(2)} → ${later.toStringAsFixed(2)})');
    });

    test('ضربه‌های پیاپی روی هم انباشته نمی‌شوند تا بترکند', () {
      final net = NetSim();
      for (var i = 0; i < 30; i++) {
        net.hit(0.5, 0.5, 1.0);
        run(net, 0.05);
        expect(net.peakDepth.isFinite, isTrue);
        expect(net.peakDepth, lessThan(6.0));
      }
    });

    test('یک فریمِ پرش‌کرده (لگ) سیستم را نمی‌شکند', () {
      // مثلاً وقتی یک دیالوگ باز می‌شود یا GC اجرا می‌شود، فریم می‌تواند
      // ۳۰۰ میلی‌ثانیه طول بکشد. اگر آن dt خام به فنر داده شود، منفجر
      // می‌شود — برای همین گام ثابت و سقفِ زیرگام گذاشته شد.
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      net.step(0.3);
      net.step(1.5);
      net.step(0.001);
      expect(net.peakDepth.isFinite, isTrue);
      expect(net.peakDepth, lessThan(6.0));
    });

    test('dt صفر یا منفی کرش نمی‌کند', () {
      final net = NetSim()..hit(0.5, 0.5, 0.8);
      net.step(0);
      net.step(-1);
      expect(net.peakDepth.isFinite, isTrue);
    });
  });

  group('تور دروازه — بودجهٔ اجرا', () {
    test('خودش می‌خوابد و بی‌نهایت نمی‌چرخد', () {
      // مهم‌ترین تستِ عملکردی: اگر تور نخوابد، Ticker برای همیشه روشن
      // می‌ماند و در هر ۱۶ میلی‌ثانیه یک فریم درخواست می‌کند — حتی
      // وقتی هیچ چیزی روی صفحه عوض نمی‌شود.
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      var frames = 0;
      while (!net.settled && frames < 600) {
        net.step(1 / 60);
        frames++;
      }
      expect(net.settled, isTrue, reason: 'تور بعد از ۱۰ ثانیه هم نخوابید');
      expect(frames, lessThan(150),
          reason: 'موج باید زیر ۲.۵ ثانیه بخوابد، شد ${frames / 60}s');
      expect(frames, greaterThan(24),
          reason: 'موج باید دست‌کم ۰.۴ ثانیه دیده شود، شد ${frames / 60}s');
    });

    test('بعد از خوابیدن دقیقاً صاف است، نه کج‌ومعوج', () {
      // بدون صفر کردنِ صریح، تور با یک جابه‌جاییِ کوچکِ دائمی می‌ماند و
      // بعد از چند گل، آویزان و شل دیده می‌شود.
      final net = NetSim()..hit(0.3, 0.6, 1.0);
      while (!net.settled) {
        net.step(1 / 60);
      }
      expect(net.peakDepth, 0);
      for (var r = 0; r < NetSim.rows; r++) {
        for (var c = 0; c < NetSim.cols; c++) {
          expect(net.offY(c, r, 140), 0);
        }
      }
    });

    test('reset فوراً همه‌چیز را برمی‌گرداند', () {
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      run(net, 0.1);
      expect(net.settled, isFalse);
      net.reset();
      expect(net.settled, isTrue);
      expect(net.peakDepth, 0);
    });

    test('اندازهٔ شبکه در بودجه است', () {
      // ۱۳۵ گره × ۹ آرایهٔ Float32 = ~۴.۹ کیلوبایت. اگر روزی کسی شبکه
      // را به ۴۰×۳۰ ببرد، هزینهٔ هر فریم ~۹ برابر می‌شود بدون اینکه
      // روی گوشی تفاوتی دیده شود.
      const nodes = NetSim.cols * NetSim.rows;
      expect(nodes, lessThanOrEqualTo(200),
          reason: 'شبکه بزرگ‌تر از بودجه است ($nodes گره)');
      expect(nodes * 9 * 4, lessThan(8 * 1024));
    });

    test('یک گام برای کل شبکه سریع است', () {
      // معیار خام، ولی یک رگرسیونِ فاحش (مثلاً تخصیص در حلقه) را
      // می‌گیرد. معادلِ یک دقیقه بازیِ کامل.
      final net = NetSim();
      final sw = Stopwatch()..start();
      for (var i = 0; i < 60; i++) {
        net.hit(0.5, 0.5, 1.0);
        for (var j = 0; j < 60; j++) {
          net.step(1 / 60);
        }
      }
      sw.stop();
      expect(sw.elapsedMilliseconds, lessThan(3000),
          reason: 'شبیه‌سازی خیلی کند است: ${sw.elapsedMilliseconds}ms '
              'برای ۳۶۰۰ گام');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // دیده شدن — با همان تابعی که نقاش استفاده می‌کند
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نکته دربارهٔ روش: نسخهٔ اولِ این گروه واقعاً روی بوم رندر می‌کرد و
  // پیکسل می‌شمرد. ولی چند فراخوانیِ `Picture.toImage` پشت سر هم در
  // محیطِ تستِ بدون GPU (که CI هم همان است) قفل می‌شود و کل اجرا با
  // تایم‌اوت می‌میرد — یعنی تستی که به‌جای گرفتنِ باگ، مانعِ اجرای
  // بقیه می‌شود.
  //
  // `offY` دقیقاً همان تابعی است که `_PitchPainter` برای جای‌گذاریِ هر
  // گره صدا می‌زند، پس سنجیدنِ خروجیِ آن معادلِ سنجیدنِ پیکسل است، بدون
  // هزینه و بدون شکنندگی.
  group('تور روی صفحه واقعاً دیده می‌شود', () {
    test('اوج جابه‌جاییِ تصویری در بازهٔ قابل دیدن است', () {
      // این تست مستقیماً باگِ «۱.۱۶ پیکسل» را قفل می‌کند.
      const gh = 150.0; // ارتفاع دهانهٔ دروازه روی یک گوشی معمولی
      final net = NetSim()..hit(0.5, 0.5, 1.0);
      var peak = 0.0;
      var frames = 0;
      while (!net.settled && frames < 600) {
        net.step(1 / 60);
        frames++;
        for (var r = 0; r < NetSim.rows; r++) {
          for (var c = 0; c < NetSim.cols; c++) {
            final o = net.offY(c, r, gh).abs();
            if (o > peak) peak = o;
          }
        }
      }
      expect(peak, greaterThan(6.0),
          reason: 'موج کمتر از ۶ پیکسل است و روی گوشی دیده نمی‌شود '
              '(${peak.toStringAsFixed(2)}px) — همان باگی که یک بار رخ داد');
      expect(peak, lessThan(26.0),
          reason: 'موج بیش از حد بزرگ است و تور پاره به‌نظر می‌رسد '
              '(${peak.toStringAsFixed(2)}px)');
    });

    test('موج در سمتِ درستِ دروازه متمرکز است', () {
      const gh = 150.0;
      final left = NetSim()..hit(0.17, 0.5, 1.0);
      run(left, 0.13);

      var leftSum = 0.0, rightSum = 0.0;
      const mid = NetSim.cols ~/ 2;
      for (var r = 0; r < NetSim.rows; r++) {
        for (var c = 0; c < NetSim.cols; c++) {
          final v = left.offY(c, r, gh).abs();
          if (c < mid) {
            leftSum += v;
          } else if (c > mid) {
            rightSum += v;
          }
        }
      }
      expect(leftSum, greaterThan(rightSum * 2),
          reason: 'شوت به چپ باید عمدتاً سمت چپ تور را تکان دهد '
              '(چپ=${leftSum.toStringAsFixed(1)} '
              'راست=${rightSum.toStringAsFixed(1)})');
    });

    test('ضربهٔ ضعیف هم دیده می‌شود، فقط کمتر', () {
      // اگر فقط محکم‌ترین ضربه دیده شود، بازیکنی که کنترل‌شده می‌زند
      // حس می‌کند بازی به او پاسخ نمی‌دهد.
      const gh = 150.0;
      final net = NetSim()..hit(0.5, 0.5, 0.35);
      var peak = 0.0;
      var frames = 0;
      while (!net.settled && frames < 600) {
        net.step(1 / 60);
        frames++;
        for (var r = 0; r < NetSim.rows; r++) {
          for (var c = 0; c < NetSim.cols; c++) {
            final o = net.offY(c, r, gh).abs();
            if (o > peak) peak = o;
          }
        }
      }
      expect(peak, greaterThan(3.0),
          reason: 'حتی آرام‌ترین ضربه باید موجِ قابل دیدن بسازد '
              '(${peak.toStringAsFixed(2)}px)');
    });
  });
}
