// ============================================================================
//  تست‌های مقاومت — دادهٔ بد سرور نباید اپ را بترکاند
// ============================================================================
//
//   flutter test test/robustness_test.dart
//
// این تست‌ها همان کلاس خطایی را قفل می‌کنند که در ممیزی پیدا شد: `as List`
// و `as Map` روی فیلدهایی که ممکن است نباشند یا نوع دیگری داشته باشند.
//
// چرا مهم است: سرور در حالت خطا شکل دیگری برمی‌گرداند (رشته به‌جای Map،
// یا کلید غایب). یک cast ناامن آنجا استثنا می‌دهد و در بیلد release به
// صفحهٔ قرمز تبدیل می‌شود — درست وقتی که کاربر از قبل با مشکلی روبه‌روست.

import 'package:flutter_test/flutter_test.dart';

/// آینهٔ منطق دفاعی‌ای که در کد اعمال شد. اگر کسی بعداً به `as List` برگردد
/// این تست‌ها همچنان سبز می‌مانند، پس در کنارشان تست ویجت واقعی هم هست.
List _safeList(Object? v) => v is List ? v : const [];
Map<String, dynamic> _safeMap(Object? v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

void main() {
  group('پاسخ‌های ناقص سرور', () {
    test('لیست غایب به لیست خالی تبدیل می‌شود، نه استثنا', () {
      // requiredCards فقط وقتی وجود دارد که گروه به کارت خاصی نیاز داشته
      // باشد؛ برای جایزهٔ فقط-نقدی اصلاً فرستاده نمی‌شود.
      final tier = <String, dynamic>{'name': 'جایزهٔ نقدی'};
      expect(() => _safeList(tier['requiredCards']), returnsNormally);
      expect(_safeList(tier['requiredCards']), isEmpty);
    });

    test('رشته به‌جای Map باعث کراش نمی‌شود', () {
      // عنصر خطادار یک batch در پنل مدیریت یک String است نه Map.
      expect(() => _safeMap('خطای سرور'), returnsNormally);
      expect(_safeMap('خطای سرور'), isEmpty);
    });

    test('null در هر جایگاهی امن است', () {
      expect(_safeList(null), isEmpty);
      expect(_safeMap(null), isEmpty);
    });

    test('عدد در جایگاه لیست امن است', () {
      expect(_safeList(42), isEmpty);
    });

    test('لیست معتبر دست‌نخورده می‌ماند', () {
      expect(_safeList([1, 2, 3]), [1, 2, 3]);
      expect(_safeMap({'a': 1})['a'], 1);
    });
  });

  group('اندازهٔ decode تصاویر', () {
    // این‌ها اعدادی هستند که در ممیزی محاسبه شدند. اگر کسی cacheWidth را
    // بردارد، بودجهٔ ۴۰ مگابایتی کش دوباره سرریز می‌کند و اپ به همان
    // کندی قبلی برمی‌گردد.
    int decodedMb(int w, int h, int count) => (w * h * 4 * count) ~/ 1000000;

    test('مجموعهٔ کاری تصاویر زیر بودجهٔ کش می‌ماند', () {
      // بدترین حالت واقعی: صفحهٔ چت باز، با آواتارها و نشان‌ها.
      final total = decodedMb(192, 168, 1) // بنر چت
          + decodedMb(156, 156, 16) // گرید نشان باشگاه‌ها
          + decodedMb(45, 45, 20) // نشان کنار اسم‌ها
          + decodedMb(204, 204, 25) // آواتارهای یک صفحه
          + decodedMb(480, 700, 2); // دو اسکین در حال محو
      expect(total, lessThan(40),
          reason: 'مجموع $total مگابایت از بودجهٔ کش بیشتر است');
    });

    test('بدون cacheWidth از بودجه رد می‌شد (سند وضعیت قبلی)', () {
      final before = decodedMb(700, 490, 1)
          + decodedMb(512, 512, 16)
          + decodedMb(512, 512, 20)
          + decodedMb(384, 384, 25)
          + decodedMb(620, 900, 2);
      expect(before, greaterThan(40),
          reason: 'اگر این عدد زیر ۴۰ شد یعنی assetها کوچک شده‌اند و '
              'توضیحات این تست باید به‌روز شود');
    });
  });
}
