// حافظه و صحتِ دارایی‌ها.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// درخواست مالک: «فعالیت پایین آوردن مصرف رم گوشی هارو انجام بده بدون کم
// کردن امکانات».
//
// آواتارها از PNG ۳۸۴×۳۸۴ به WebP ۲۵۶×۲۵۶ تبدیل شدند: ۲٬۴۰۸ کیلوبایت →
// ۱۷۴ کیلوبایت (۹۳٪ کمتر) و حافظهٔ دیکد هر کدام از ۰.۵۶ به ۰.۲۵ مگابایت.
//
// ولی کلیدِ ذخیره‌شده در دیتابیس هنوز `.png` است (سرور آن را در لیست
// سفید اعتبارسنجی می‌کند). پس `avatarAsset` باید ترجمه کند — و اگر یک
// روز کسی این ترجمه را بردارد، **همهٔ آواتارها ناپدید می‌شوند** بدون
// اینکه کامپایلر چیزی بگوید. این تست دقیقاً همان را می‌گیرد.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/core/assets.dart';

void main() {
  group('نگاشت کلید آواتار به فایل', () {
    test('کلید .png به فایل .webp ترجمه می‌شود', () {
      expect(avatarAsset('avatar_1_football.png'),
          'assets/avatars/avatar_1_football.webp');
    });

    test('هر ۱۰ آواتارِ فهرست، فایل واقعی روی دیسک دارند', () {
      for (final key in avatarFiles) {
        final path = avatarAsset(key);
        expect(File(path).existsSync(), isTrue,
            reason: '$path وجود ندارد — آواتار در اپ خالی می‌ماند');
      }
    });

    test('نشان باشگاه دست‌نخورده می‌ماند', () {
      expect(avatarAsset('club:bayern'), 'assets/shop/club_bayern.webp');
    });

    test('کلید خالی به آواتار پیش‌فرض می‌رسد', () {
      final p = avatarAsset(null);
      expect(p.endsWith('.webp'), isTrue);
      expect(File(p).existsSync(), isTrue);
    });
  });

  group('بودجهٔ حافظهٔ دارایی‌ها', () {
    /// ابعاد یک فایل WebP یا PNG.
    List<int>? dims(String path) {
      final b = File(path).readAsBytesSync();
      if (b.length < 32) return null;
      // PNG
      if (b[0] == 0x89 && b[1] == 0x50) {
        int be(int o) =>
            (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
        return [be(16), be(20)];
      }
      // WebP
      final fmt = String.fromCharCodes(b.sublist(12, 16));
      if (fmt == 'VP8L') {
        final bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return [(bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1];
      }
      if (fmt == 'VP8 ') {
        final w = (b[26] | (b[27] << 8)) & 0x3FFF;
        final h = (b[28] | (b[29] << 8)) & 0x3FFF;
        return [w, h];
      }
      if (fmt == 'VP8X') {
        return [
          (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
          (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
        ];
      }
      return null;
    }

    test('هیچ آواتاری بزرگ‌تر از ۲۵۶ پیکسل نیست', () {
      for (final key in avatarFiles) {
        final d = dims(avatarAsset(key));
        if (d == null) continue;
        expect(d[0], lessThanOrEqualTo(256),
            reason: '${avatarAsset(key)} عرضش ${d[0]} است — دیکدش گران '
                'می‌شود و آواتار هرگز بزرگ‌تر از ۹۲ پیکسل دیده نمی‌شود');
      }
    });

    test('مجموع حجم آواتارها زیر ۴۰۰ کیلوبایت است', () {
      var total = 0;
      for (final key in avatarFiles) {
        total += File(avatarAsset(key)).lengthSync();
      }
      expect(total, lessThan(400 * 1024),
          reason: 'قبل از تبدیل به WebP، ۲٬۴۰۸ کیلوبایت بود');
    });

    test('حافظهٔ دیکدِ کلِ آواتارها زیر ۳ مگابایت است', () {
      // انتخابگرِ پروفایل هر ۱۰ آواتار را با هم نشان می‌دهد.
      var mb = 0.0;
      for (final key in avatarFiles) {
        final d = dims(avatarAsset(key));
        if (d != null) mb += d[0] * d[1] * 4 / (1024 * 1024);
      }
      expect(mb, lessThan(3.0),
          reason: 'با PNG ۳۸۴ پیکسلی این عدد ۵.۶ مگابایت بود');
    });
  });

  group('بودجهٔ کش تصاویر', () {
    test('سقف کش در main.dart تعریف شده', () {
      final src = File('lib/main.dart').readAsStringSync();
      expect(src.contains('maximumSizeBytes'), isTrue,
          reason: 'بدون سقف، فلاتر ۱۰۰ مگابایت پیش‌فرض می‌گیرد');
      expect(src.contains('maximumSize'), isTrue);
    });
  });
}
