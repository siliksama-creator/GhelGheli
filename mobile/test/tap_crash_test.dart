// ============================================================================
//  تست‌های پایداری بازی ضربه‌زن — «بعد از مدتی کراش می‌کند»
// ============================================================================
//
//   flutter test test/tap_crash_test.dart
//
// گزارش کاربر: بازی بعد از مدتی بازی کردن کم‌کم شروع به کراش کردن می‌کند.
// «کم‌کم» کلیدواژهٔ مهم است: یعنی خطای منطقی نیست، بلکه چیزی است که با
// گذشت زمان یا با بالا رفتن اعداد بدتر می‌شود.
//
// چهار مسیر پیدا شد که هر چهار تا با ادامهٔ بازی بدتر می‌شوند. این تست‌ها
// قبل از رفع نوشته شدند و باید شکست بخورند؛ بعد از رفع باید سبز شوند.

import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_guard.dart';

void main() {
  group('سرریز عددی در منحنی سختی', () {
    const cfg = TapGameConfig();

    test('لول‌های معتبر عدد درست می‌دهند', () {
      // منحنی بازطراحی شد: کل بازی حالا ۵۰٬۰۰۰ امتیاز است با رشد ۱.۰۵.
      // این اعداد باید با tapGameService.js یکی باشند.
      expect(cfg.requiredTaps(1), 239);
      expect(cfg.requiredTaps(10), 371);
      expect(cfg.requiredTaps(50), 2611);
    });

    // ریشهٔ کراش: requiredTaps از round() روی یک double استفاده می‌کند.
    // 100 * 1.15^level برای لول ~۴۰۰ از محدودهٔ int 64 بیتی بیرون می‌زند و
    // برای لول ~۱۱۰۰ به Infinity می‌رسد؛ double.round() روی Infinity در
    // دارت استثنا پرتاب می‌کند و کل فریم را می‌ترکاند.
    //
    // چطور کاربر به آنجا می‌رسد؟ سرور مقدار level را برمی‌گرداند و موتور
    // آن را می‌پذیرد؛ یک پاسخ خراب، یک فایل prefs دست‌کاری‌شده، یا حتی
    // حلقهٔ while در tap() با یک batch بزرگ آفلاین کافی است.
    test('لول خارج از محدوده نباید استثنا بدهد', () {
      for (final lv in [100, 400, 700, 1100, 5000, 1 << 30]) {
        expect(() => cfg.requiredTaps(lv), returnsNormally,
            reason: 'requiredTaps($lv) نباید پرتاب کند');
        final v = cfg.requiredTaps(lv);
        expect(v, greaterThan(0), reason: 'requiredTaps($lv) منفی/صفر شد');
        expect(v, lessThan(1 << 62), reason: 'requiredTaps($lv) سرریز کرد');
      }
    });

    test('لول منفی یا صفر امن است', () {
      expect(() => cfg.requiredTaps(0), returnsNormally);
      expect(() => cfg.requiredTaps(-5), returnsNormally);
      expect(cfg.requiredTaps(0), greaterThan(0));
    });

    // cumulativeTaps یک حلقهٔ O(n) است که در UI صدا زده می‌شود.
    test('cumulativeTaps روی لول بزرگ نه معلق می‌ماند نه سرریز می‌کند', () {
      expect(() => cfg.cumulativeTaps(100000), returnsNormally);
      expect(cfg.cumulativeTaps(50), greaterThan(0));
    });
  });

  group('هزینهٔ محاسبهٔ منحنی', () {
    const cfg = TapGameConfig();

    // requiredTaps با یک حلقهٔ O(level) پیاده شده بود و در هر ضربه، هر فریمِ
    // نوار پیشرفت، و داخل حلقهٔ جست‌وجوی levelsUntilNextSkin صدا زده می‌شود.
    // در لول ۵۰ یعنی ~۵۰ ضرب شناور در هر فراخوانی — روی گوشی ضعیف با ۱۲
    // ضربه در ثانیه، فریم‌ها را می‌خورد و همان چیزی است که کاربر به‌عنوان
    // «کم‌کم کند و بعد کراش» توصیف می‌کند.
    test('محاسبه در لول بالا سریع است', () {
      final sw = Stopwatch()..start();
      for (var i = 0; i < 200000; i++) {
        cfg.requiredTaps(50);
      }
      sw.stop();
      expect(sw.elapsedMilliseconds, lessThan(400),
          reason: '۲۰۰هزار فراخوانی ${sw.elapsedMilliseconds}ms طول کشید — '
              'در حلقهٔ رندر خیلی گران است');
    });
  });

  group('کران‌داری نگهبان ضدتقلب', () {
    // بررسی شد و سالم بود: صف پنجره با maxTapsPerSecond کران دارد، چون
    // دروازهٔ دوم قبل از افزودن، طول صف را چک می‌کند. این تست‌ها آن خاصیت
    // را قفل می‌کنند تا با تغییرات بعدی از بین نرود — currentRate از همین
    // طول خوانده و در UI نمایش داده می‌شود.
    test('ضربه‌های ردشده صف را بی‌نهایت بزرگ نمی‌کنند', () {
      final guard = TapGuard(config: const TapGameConfig());
      // ۱۰هزار ضربه با فاصلهٔ ۱۰ms — همه زیر آستانهٔ ۴۵ms.
      for (var t = 0; t < 100000; t += 10) {
        guard.register(t);
      }
      expect(guard.currentRate, lessThanOrEqualTo(12),
          reason: 'صف پنجره هرس نشده — currentRate=${guard.currentRate}');
    });

    test('پنجره بعد از سکوت طولانی خالی می‌شود', () {
      final guard = TapGuard(config: const TapGameConfig());
      for (var t = 0; t < 500; t += 50) {
        guard.register(t);
      }
      final before = guard.currentRate;
      expect(before, greaterThan(0));
      // ده ثانیه بعد یک ضربه: پنجره باید فقط همان یکی را داشته باشد.
      guard.register(10500);
      expect(guard.currentRate, 1,
          reason: 'ورودی‌های کهنه از پنجره حذف نشدند');
    });
  });
}
