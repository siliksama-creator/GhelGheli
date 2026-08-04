// نشستِ بازی بعد از dispose نباید پرتاب کند.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست در پاسِ دوم اضافه شد
// ═══════════════════════════════════════════════════════════════════════════
//
// در فاز ۳ یک `ChangeNotifier` جدا به نام `clock` به `GameSession`
// اضافه شد تا تیکِ شمارش معکوس، تختهٔ بازی را بازنسازد. آن تغییر
// مشکلِ عملکردی را حل کرد — و یک مسیرِ تازهٔ کرش باز کرد.
//
// این دقیقاً همان چیزی است که «پاس دوم» برای پیدا کردنش وجود دارد:
// فیکس‌ها باگ تازه می‌سازند.
//
// `ChangeNotifier.notifyListeners()` بعد از `dispose()` پرتاب می‌کند.
// سناریوی واقعی:
//
//   ۱. کاربر وسطِ بازی دکمهٔ back را می‌زند → صفحه dispose می‌شود،
//   ۲. یک بستهٔ socket که همان لحظه در راه بود می‌رسد،
//   ۳. گرداننده `_stopClock()` را صدا می‌زند،
//   ۴. `_stopClock` روی `clock`ِ آزادشده اعلان می‌دهد → کرش.
//
// این به زمان‌بندیِ شبکه بستگی دارد، پس در تستِ دستی تقریباً هرگز دیده
// نمی‌شود و فقط روی گوشیِ کاربر با شبکهٔ کند رخ می‌دهد. تست‌های زیر
// همان توالی را عمداً بازتولید می‌کنند.
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/screens/user/games/game_session.dart';

void main() {
  group('چرخهٔ عمرِ نشستِ بازی', () {
    test('leave() بعد از dispose پرتاب نمی‌کند', () {
      // سناریوی «کاربر back زد و یک رویدادِ socket در راه بود».
      // `leave()` داخلش `_stopClock()` دارد که روی `clock` اعلان
      // می‌دهد؛ اگر `clock` آزاد شده باشد، پرتاب می‌کرد.
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      s.dispose();
      expect(() => s.leave(), returnsNormally,
          reason: 'یک رویدادِ دیرهنگامِ socket نباید اپ را بشکند');
    });

    test('تیکِ ساعت بعد از dispose بی‌صدا نادیده گرفته می‌شود', () {
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      s.dispose();
      expect(() => s.clockTickForTest(), returnsNormally,
          reason: 'تیکِ باقی‌مانده از تایمر نباید پرتاب کند');
    });

    test('نشستِ زنده هنوز درست کار می‌کند', () {
      // اطمینان از اینکه محافظت‌ها مسیرِ عادی را نکشته‌اند — وگرنه
      // شمارش معکوس اصلاً به‌روز نمی‌شود.
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      var notified = 0;
      s.clock.addListener(() => notified++);
      s.clockTickForTest();
      expect(notified, 1);
      s.dispose();
    });

    test('leave() روی نشستِ زنده هنوز کار می‌کند', () {
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      var notified = 0;
      s.addListener(() => notified++);
      s.leave();
      expect(notified, greaterThan(0),
          reason: 'خروج از بازی باید همچنان UI را به‌روز کند');
      s.dispose();
    });

    test('dispose ساعت را هم آزاد می‌کند', () {
      // یک ChangeNotifierِ آزادنشده همهٔ شنوندگانش — و از طریق آن‌ها کل
      // درختِ ویجت — را زنده نگه می‌دارد.
      final s = GameSession(api: ApiClient(), gameId: 'penalty');
      s.dispose();
      expect(() => s.clock.addListener(() {}), throwsFlutterError);
    });
  });
}
