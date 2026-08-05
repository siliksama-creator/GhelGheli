// وجودِ فیزیکیِ فایل‌های ظاهرِ کاراکترِ ضربه‌زن.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست
// ═══════════════════════════════════════════════════════════════════════════
//
// `defaultSkins` فقط یک فهرست از **رشته** است. اگر مسیری غلط تایپ شود یا
// فایلی در `pubspec.yaml` اعلام نشود، دارت هیچ خطایی نمی‌دهد — کامپایل
// می‌شود، تست‌های منطقی سبز می‌مانند، و کاربر در لولِ فلان به‌جای شخصیت
// یک ایموجیِ جایگزین می‌بیند (`errorBuilder` عمداً کرش نمی‌دهد، پس حتی
// در لاگ هم چیزی پیدا نیست).
//
// این دقیقاً همان کلاس باگی است که فقط در دستِ کاربر دیده می‌شود. یک
// بررسیِ ساده روی فایل‌سیستم جلویش را می‌گیرد.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';

void main() {
  const cfg = TapGameConfig();

  test('هر مسیرِ ظاهر واقعاً روی دیسک وجود دارد', () {
    for (final path in cfg.skins) {
      expect(File(path).existsSync(), isTrue,
          reason: 'فایلِ «$path» در پروژه نیست — کاربر به‌جای شخصیت '
              'ایموجیِ جایگزین می‌بیند و هیچ خطایی هم ثبت نمی‌شود');
    }
  });

  test('پوشهٔ دارایی در pubspec اعلام شده', () {
    // بدون این خط، فایل‌ها در APK بسته‌بندی نمی‌شوند حتی اگر روی دیسک
    // باشند — یعنی تستِ بالا سبز است ولی اپِ نصب‌شده خراب.
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec.contains('assets/games/tap/'), isTrue,
        reason: 'assets/games/tap/ در pubspec.yaml اعلام نشده');
  });

  test('هیچ فایلِ ظاهرِ بلااستفاده‌ای در پوشه نمانده', () {
    // داراییِ مرده حجمِ APK را بی‌دلیل بالا می‌برد. اگر روزی ظاهری از
    // فهرست حذف شد ولی فایلش ماند، اینجا معلوم می‌شود.
    final dir = Directory('assets/games/tap');
    final onDisk = dir
        .listSync()
        .whereType<File>()
        .map((f) => f.path.replaceAll('\\', '/'))
        .where((p) => p.endsWith('.webp'))
        .toSet();
    final used = cfg.skins.toSet();
    expect(onDisk.difference(used), isEmpty,
        reason: 'فایل‌های زیر در هیچ لولی استفاده نمی‌شوند');
  });

  test('اندازهٔ هر فایل معقول است', () {
    // فایلِ صفربایتی یعنی کپیِ نصفه‌کاره؛ فایلِ خیلی بزرگ یعنی کسی
    // نسخهٔ فشرده‌نشده را جایگزین کرده و حافظهٔ گوشیِ ضعیف را می‌بلعد.
    for (final path in cfg.skins) {
      final bytes = File(path).lengthSync();
      expect(bytes, greaterThan(5 * 1024), reason: '$path خیلی کوچک است');
      expect(bytes, lessThan(400 * 1024), reason: '$path خیلی بزرگ است');
    }
  });
}
