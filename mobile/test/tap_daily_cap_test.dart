// ============================================================================
//  سقف روزانهٔ سه لول در بازی ضربه‌زن
// ============================================================================
//
//   flutter test test/tap_daily_cap_test.dart
//
// درخواست کاربر: «در بازی ضربه زن فقط میتونن تا سه لول بازی کنن» — روزی سه
// لول، و بعد بازی قفل شود تا فردا.
//
// قانون در سرور (tapGameService.js) اجرا می‌شود چون گوشی قابل اعتماد نیست و
// چون دو کلاینت یک سهمیهٔ مشترک دارند. این تست‌ها آینهٔ کلاینت را می‌سنجند:
// اگر اپ سهمیه را جور دیگری حساب کند، بازیکن لولی می‌گیرد که سینک بعدی
// پسش می‌گیرد — و آن بدتر از نگرفتنش است.

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_day.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_engine.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_storage.dart';

/// پیکربندی تست با ضدتقلب باز.
///
/// چرا لازم است: `TapGuard` سقف ۱۲ ضربه بر ثانیه دارد و از یک Stopwatch
/// واقعی می‌خواند. یک حلقهٔ تست ۳۴۷ ضربه را در چند میلی‌ثانیه می‌زند، پس
/// با پیکربندی واقعی ۱۲ تا پذیرفته می‌شود و بقیه rate-limit می‌خورند —
/// یعنی تست به‌جای سقف روزانه، ضدتقلب را می‌سنجید. اینجا فقط همان دو عدد
/// باز می‌شوند؛ منحنی سختی و سقف روزانه دست‌نخورده می‌مانند، چون همان‌ها
/// موضوع تست‌اند.
const TapGameConfig openGuard = TapGameConfig(
  maxTapsPerSecond: 1 << 24,
  minTapInterval: Duration.zero,
);

/// موتور تازه با حافظهٔ خالی.
Future<TapEngine> freshEngine({TapGameConfig? config}) async {
  SharedPreferences.setMockInitialValues({});
  final e = TapEngine(config: config ?? openGuard, storage: TapStorage());
  await e.init();
  return e;
}

/// موتور روی حافظهٔ از پیش پر شده — برای شبیه‌سازی «فردا» یا نصب قدیمی.
Future<TapEngine> engineWith(String json, {TapGameConfig? config}) async {
  SharedPreferences.setMockInitialValues({'tap_game_progress_v1': json});
  final e = TapEngine(config: config ?? openGuard, storage: TapStorage());
  await e.init();
  return e;
}

/// آن‌قدر ضربه می‌زند تا موتور جواب ندهد.
/// خروجی: تعداد ضربه‌های پذیرفته‌شده.
int hammer(TapEngine e, {int max = 2000000}) {
  var accepted = 0;
  for (var i = 0; i < max; i++) {
    if (e.tap()) {
      accepted++;
    } else {
      break;
    }
  }
  return accepted;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('روز تهران', () {
    test('روز از UTC حساب می‌شود نه از ساعت دستگاه', () {
      // ۲۱:۰۰ UTC یعنی ۰۰:۳۰ فردا در تهران.
      final d = DateTime.utc(2026, 3, 1, 21, 0);
      expect(tehranDay(d), '2026-03-02');
    });

    test('یک دقیقه مانده به نیمه‌شب تهران هنوز همان روز است', () {
      // ۲۰:۲۹ UTC = ۲۳:۵۹ تهران.
      expect(tehranDay(DateTime.utc(2026, 3, 1, 20, 29)), '2026-03-01');
    });

    test('دقیقاً سر نیمه‌شب تهران روز عوض می‌شود', () {
      expect(tehranDay(DateTime.utc(2026, 3, 1, 20, 29, 59)), '2026-03-01');
      expect(tehranDay(DateTime.utc(2026, 3, 1, 20, 30, 0)), '2026-03-02');
    });

    test('همان قالبی که سرور می‌فرستد — YYYY-MM-DD با صفر ابتدایی', () {
      // اگر ماه یا روز تک‌رقمی بدون صفر بیاید، مقایسهٔ رشته‌ای با سرور
      // همیشه false می‌شود و سهمیه هر بار ریست می‌شود.
      expect(tehranDay(DateTime.utc(2026, 1, 5, 12)), '2026-01-05');
      expect(RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(tehranDay()), isTrue);
    });

    test('شمارش معکوس هیچ‌وقت صفر یا منفی نیست', () {
      for (final h in [0, 6, 12, 20, 20.5, 23]) {
        final d = DateTime.utc(2026, 3, 1).add(
            Duration(minutes: (h * 60).round()));
        final left = untilTehranMidnight(d);
        expect(left, greaterThan(Duration.zero), reason: 'ساعت $h');
        expect(left, lessThanOrEqualTo(const Duration(days: 1)));
      }
    });

    test('شمارش معکوس رو به بالا گرد می‌شود، نه پایین', () {
      // ۹۰ دقیقه که «۱ ساعت» نوشته شود یعنی وعده‌ای که بازی زیرش می‌زند.
      expect(formatCountdown(const Duration(minutes: 90)), '۲ ساعت');
      expect(formatCountdown(const Duration(minutes: 61)), '۲ ساعت');
      expect(formatCountdown(const Duration(minutes: 60)), '۱ ساعت');
      expect(formatCountdown(const Duration(minutes: 59)), '۵۹ دقیقه');
      expect(formatCountdown(const Duration(seconds: 30)),
          'کمتر از یک دقیقه');
    });
  });

  group('سقف روزانه', () {
    test('یک موتور تازه سه لول سهمیه دارد', () async {
      final e = await freshEngine();
      expect(e.levelsLeftToday, 3);
      expect(e.dailyCapReached, isFalse);
      e.dispose();
    });

    test('بعد از سه لول بازی قفل می‌شود', () async {
      final e = await freshEngine();
      hammer(e);
      expect(e.level, 4, reason: 'دقیقاً سه لول بالا رفته');
      expect(e.levelsLeftToday, 0);
      expect(e.dailyCapReached, isTrue);
      e.dispose();
    });

    test('بعد از قفل شدن، ضربه‌ها اصلاً ثبت نمی‌شوند', () async {
      final e = await freshEngine();
      hammer(e);
      final before = e.totalTaps;
      for (var i = 0; i < 100; i++) {
        expect(e.tap(), isFalse, reason: 'tap() باید false برگرداند');
      }
      expect(e.totalTaps, before, reason: 'هیچ ضربه‌ای شمرده نشده');
      e.dispose();
    });

    // مهم‌ترین تست این فایل.
    test('ضربه‌های اضافی برای فردا ذخیره نمی‌شوند', () async {
      final e = await freshEngine();
      hammer(e);
      // بازیکن دقیقاً سر مرز متوقف شده: ضربه‌ای که باید لول چهارم را
      // می‌داد رد شده و چیزی بانک نشده. اگر ذخیره می‌شد، فردا لول‌ها
      // بدون یک ضربه بالا می‌رفتند.
      expect(e.taps, lessThan(e.requiredTaps));
      expect(e.dailyCapReached, isTrue);
      e.dispose();
    });

    test('نوار پیشرفت روی ۹۹٪ جا نمی‌ماند', () async {
      // اگر موقع رسیدن به سقف عدد را روی «یکی مانده» ست کنیم، بازیکن تمام
      // شب یک نوار تقریباً پر می‌بیند که تکان نمی‌خورد — یعنی به او دروغ
      // گفته‌ایم که یک ضربه تا لول بعد فاصله دارد.
      final e = await freshEngine();
      hammer(e);
      expect(e.levelProgress, lessThan(0.5),
          reason: 'ضربه‌های بعد از مرز شمرده نشده‌اند، پس نوار تقریباً خالی است');
      e.dispose();
    });

    test('فردا سهمیه برمی‌گردد و از همان‌جا ادامه می‌دهد', () async {
      // شبیه‌سازی «فردا»: همان پیشرفت، ولی روز ذخیره‌شده قدیمی است.
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":4,"taps":10,"totalTaps":1000,"pendingTaps":0,'
            '"flaggedTaps":0,"levelsToday":3,"levelsDay":"2020-01-01"}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      expect(e.levelsLeftToday, 3, reason: 'روز عوض شده، سهمیه پر است');
      expect(e.dailyCapReached, isFalse);
      expect(e.level, 4, reason: 'پیشرفت لول حفظ شده');
      e.dispose();
    });

    test('سهمیهٔ نیمه‌مصرف‌شده فقط همان‌قدر لول می‌دهد', () async {
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":1,"taps":0,"totalTaps":0,"pendingTaps":0,'
            '"flaggedTaps":0,"levelsToday":2,"levelsDay":"${tehranDay()}"}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      expect(e.levelsLeftToday, 1);
      hammer(e);
      expect(e.level, 2, reason: 'فقط یک لول باقی بود');
      expect(e.dailyCapReached, isTrue);
      e.dispose();
    });

    test('سهمیهٔ صفر یعنی از همان ضربهٔ اول قفل', () async {
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":5,"taps":0,"totalTaps":0,"pendingTaps":0,'
            '"flaggedTaps":0,"levelsToday":3,"levelsDay":"${tehranDay()}"}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      expect(e.dailyCapReached, isTrue);
      expect(e.tap(), isFalse);
      expect(e.totalTaps, 0);
      e.dispose();
    });

    test('روز ذخیره‌شدهٔ خراب سهمیهٔ کامل می‌دهد، نه قفل دائمی', () async {
      // اگر رشتهٔ خراب باعث قفل می‌شد، یک فایل prefs معیوب بازی را برای
      // همیشه از کار می‌انداخت. سرور شمارندهٔ واقعی را دارد و اصلاح می‌کند.
      for (final bad in ['"tomorrow"', '12345', 'null', '"2026-3-1"']) {
        SharedPreferences.setMockInitialValues({
          'tap_game_progress_v1':
              '{"level":1,"taps":0,"totalTaps":0,"pendingTaps":0,'
              '"flaggedTaps":0,"levelsToday":3,"levelsDay":$bad}',
        });
        final e = TapEngine(config: openGuard, storage: TapStorage());
        await e.init();
        expect(e.levelsLeftToday, 3, reason: 'روز خراب: $bad');
        e.dispose();
      }
    });

    test('شمارندهٔ خراب بالای سقف، سهمیه را منفی نمی‌کند', () async {
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":1,"taps":0,"totalTaps":0,"pendingTaps":0,'
            '"flaggedTaps":0,"levelsToday":9999,"levelsDay":"${tehranDay()}"}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      expect(e.levelsLeftToday, 0, reason: 'کف صفر است، نه عدد منفی');
      expect(e.dailyCapReached, isTrue);
      e.dispose();
    });

    test('سقف قابل تنظیم است و کد به عدد ۳ گره نخورده', () async {
      final e = await freshEngine(config: openGuard.copyWith(levelsPerDay: 1));
      hammer(e);
      expect(e.level, 2);
      expect(e.dailyCapReached, isTrue);
      e.dispose();
    });

    test('پایان بازی با سقف مسدود نمی‌شود', () async {
      // بازیکنی که در لول آخر است باید بتواند تمامش کند — «تمام شد» یک
      // لول‌آپ است و نباید پشت سقف بماند.
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":50,"taps":0,"totalTaps":0,"pendingTaps":0,'
            '"flaggedTaps":0,"levelsToday":0,"levelsDay":"${tehranDay()}"}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      hammer(e);
      expect(e.isComplete, isTrue);
      e.dispose();
    });

    test('بازی تمام‌شده سقف روزانه نشان نمی‌دهد', () async {
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":51,"taps":0,"totalTaps":0,"pendingTaps":0,'
            '"flaggedTaps":0,"levelsToday":3,"levelsDay":"${tehranDay()}"}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      expect(e.isComplete, isTrue);
      expect(e.dailyCapReached, isFalse,
          reason: '«تمام شد» و «سهمیه تمام شد» دو حالت جدا هستند');
      e.dispose();
    });

    test('سهمیه در حافظه ذخیره می‌شود و با بستن اپ از بین نمی‌رود', () async {
      final e = await freshEngine();
      hammer(e);
      await e.flushNow();
      e.dispose();

      // موتور دوم روی همان حافظه.
      final again = TapEngine(config: openGuard, storage: TapStorage());
      await again.init();
      expect(again.dailyCapReached, isTrue,
          reason: 'بستن و باز کردن اپ نباید سهمیه را برگرداند');
      again.dispose();
    });
  });

  group('سازگاری با نسخه‌های قدیمی', () {
    test('حافظهٔ نسخهٔ قبل (بدون فیلد سهمیه) خوانده می‌شود', () async {
      // کسی که همین حالا اپ را نصب دارد، این شکل داده را روی گوشی‌اش دارد.
      SharedPreferences.setMockInitialValues({
        'tap_game_progress_v1':
            '{"level":7,"taps":33,"totalTaps":900,"pendingTaps":0,'
            '"flaggedTaps":2}',
      });
      final e = TapEngine(config: openGuard, storage: TapStorage());
      await e.init();
      expect(e.level, 7, reason: 'پیشرفت قبلی حفظ شده');
      expect(e.taps, 33);
      expect(e.levelsLeftToday, 3, reason: 'سهمیهٔ کامل، نه قفل');
      e.dispose();
    });

    test('JSON رفت‌وبرگشت سهمیه را گم نمی‌کند', () {
      const p = TapProgress(
          level: 3, taps: 5, totalTaps: 500, pendingTaps: 1,
          flaggedTaps: 0, levelsToday: 2, levelsDay: '2026-08-03');
      final back = TapProgress.fromJson(p.toJson());
      expect(back.levelsToday, 2);
      expect(back.levelsDay, '2026-08-03');
      expect(back.level, 3);
    });
  });
}
