// راه‌اندازیِ اپ نباید هرگز روی صفحهٔ Splash قفل شود.
//
// ═══════════════════════════════════════════════════════════════════════════
// باگی که این تست‌ها قفلش می‌کنند
// ═══════════════════════════════════════════════════════════════════════════
//
// `main.dart` قبلاً این بود:
//
//     api.loadToken().then((_) {
//       if (mounted) setState(() => _ready = true);
//     });
//
// `then` فقط در مسیرِ موفقیت اجرا می‌شود. و `loadToken` به
// `SharedPreferences.getInstance()` تکیه می‌کند که واقعاً می‌تواند
// شکست بخورد: دیسکِ پر، فایلِ تنظیماتِ خراب بعد از یک بستنِ ناگهانی،
// یا پروفایلِ قفل‌شده در دستگاه‌های چنداکانتی.
//
// در آن حالت `_ready` هرگز true نمی‌شد و کاربر **برای همیشه** به
// صفحهٔ Splash نگاه می‌کرد: نه پیامی، نه دکمه‌ای، و تنها راه حذف و
// نصب دوبارهٔ اپ.
//
// این بدترین نوع باگ است چون:
//   • در توسعه هرگز دیده نمی‌شود (SharedPreferences همیشه کار می‌کند)،
//   • هیچ خطایی در UI نشان نمی‌دهد،
//   • و کاربر هیچ راهی برای بازیابی ندارد.
//
// دفاع دو لایه شد و هر دو لایه اینجا جداگانه تست می‌شوند.
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:ghelgheli_mobile/api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('plugins.flutter.io/shared_preferences');

  setUp(() {
    // SharedPreferences یک نمونهٔ singleton را کش می‌کند. بدون ریست،
    // مقدارِ تستِ قبلی به تستِ بعدی نشت می‌کند و نتیجه به **ترتیب
    // اجرا** وابسته می‌شود — یعنی تستی که تنها سبز است، در مجموعه
    // قرمز می‌شود.
    SharedPreferences.resetStatic();
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    SharedPreferences.resetStatic();
  });

  group('لایهٔ اول — loadToken هرگز پرتاب نمی‌کند', () {
    test('وقتی حافظهٔ محلی کاملاً خراب است', () async {
      // شبیه‌سازیِ یک دستگاهِ واقعی با تنظیماتِ خراب.
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        throw PlatformException(
          code: 'unavailable',
          message: 'حافظهٔ محلی در دسترس نیست',
        );
      });

      final api = ApiClient();
      // مهم‌ترین ادعا: پرتاب نمی‌کند.
      await expectLater(api.loadToken(), completes);
      // و به حالتِ امنِ «وارد نشده» می‌رود، نه یک حالتِ نیمه‌کاره.
      expect(api.token, isNull);
      expect(api.isAdmin, isFalse);
    });

    test('در حالت عادی توکن را درست می‌خواند', () async {
      // اگر مسیرِ خطا را طوری درست کرده باشیم که مسیرِ عادی بشکند،
      // چیزی به دست نیاورده‌ایم.
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'getAll') {
          return <String, Object>{
            'flutter.token': 'tok-123',
            'flutter.isAdmin': true,
          };
        }
        return null;
      });

      final api = ApiClient();
      await api.loadToken();
      expect(api.token, 'tok-123');
      expect(api.isAdmin, isTrue);
    });

    test('نبودِ توکن یعنی وارد نشده، نه خطا', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'getAll') return <String, Object>{};
        return null;
      });

      final api = ApiClient();
      await api.loadToken();
      expect(api.token, isNull);
      expect(api.isAdmin, isFalse);
    });
  });

  group('لایهٔ دوم — main از whenComplete استفاده می‌کند', () {
    test('نه از then', () {
      // ═══════════════════════════════════════════════════════════════
      // چرا یک تستِ متنی و نه رفتاری
      // ═══════════════════════════════════════════════════════════════
      //
      // تستِ رفتاریِ این مورد نیازمند ساختنِ کلِ اپ با یک ApiClientِ
      // جعلی است که پرتاب می‌کند — و چون `_GhelGheliAppState` خصوصی
      // است و ApiClient را خودش می‌سازد، تزریق ممکن نیست بدون
      // بازطراحیِ main فقط برای تست.
      //
      // چیزی که واقعاً می‌خواهیم تضمین کنیم این است که کسی فردا
      // `whenComplete` را دوباره به `then` برنگرداند، و برای همان،
      // بررسیِ متنِ منبع کافی و صادقانه است. لایهٔ اول (بالا) به‌صورت
      // رفتاری تست شده.
      final src = File('lib/main.dart').readAsStringSync();
      expect(src.contains('api.loadToken().whenComplete('), isTrue,
          reason: 'راه‌اندازی باید با whenComplete باشد تا شکستِ '
              'loadToken اپ را روی Splash قفل نکند');
      expect(src.contains('api.loadToken().then('), isFalse,
          reason: 'then فقط مسیرِ موفقیت را پوشش می‌دهد');
    });
  });
}
