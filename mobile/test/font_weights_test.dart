// نگهبانِ وزن‌های واقعیِ فونت.
//
// ═══════════════════════════════════════════════════════════════════════════
// باگی که این تست جلویش را می‌گیرد
// ═══════════════════════════════════════════════════════════════════════════
//
// `pubspec.yaml` پنج وزنِ وزیرمتن را ثبت کرده بود: ۴۰۰ تا ۸۰۰. ولی کدِ اپ
// در ده‌ها جا `FontWeight.w900` می‌خواست — از جمله نامِ معیار در اعلانِ
// راندِ دوئل، که بزرگ‌ترین متنِ کلِ بازی است.
//
// وقتی وزنِ خواسته‌شده فایل ندارد، فلاتر سکوت می‌کند و نزدیک‌ترین وزن را
// برمی‌دارد، بعد موتور آن را الگوریتمی ضخیم می‌کند («synthetic bold»).
// در لاتین کمی زشت است؛ در فارسی فاجعه است: ضخیم‌شدنِ یکنواختِ قلم،
// چشمِ حروفِ ه/ص/ط را می‌بندد و اتصال‌ها را لکه می‌کند. یعنی درشت‌ترین و
// مهم‌ترین متنِ بازی، بی‌کیفیت‌ترین رندر را داشت.
//
// نسخهٔ وب همین مشکل را داشت و `tool/typography.mjs` آنجا آن را می‌گرفت
// (`MAX_REAL_WEIGHT`) — ولی سمتِ اندروید هیچ نگهبانی نداشت. این فایل آن
// شکاف را می‌بندد: **هر وزنی که کد استفاده می‌کند باید فایل داشته باشد.**
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final pubspec = File('pubspec.yaml').readAsStringSync();

  test('هر وزنِ فونتِ استفاده‌شده در کد، فایلِ واقعی دارد', () {
    // وزن‌های ثبت‌شده در pubspec.
    final declared = RegExp(r'weight:\s*(\d+)')
        .allMatches(pubspec)
        .map((m) => int.parse(m.group(1)!))
        .toSet();
    expect(declared, contains(900),
        reason: 'کدِ اپ w900 می‌خواهد؛ بدونِ Vazirmatn-Black بولدِ مصنوعی '
            'رندر می‌شود و متنِ فارسی لکه‌ای می‌شود');

    // فایل‌ها واقعاً کنار پروژه باشند.
    for (final name in const [
      'Vazirmatn-Regular.ttf',
      'Vazirmatn-Medium.ttf',
      'Vazirmatn-SemiBold.ttf',
      'Vazirmatn-Bold.ttf',
      'Vazirmatn-ExtraBold.ttf',
      'Vazirmatn-Black.ttf',
    ]) {
      final file = File('assets/fonts/$name');
      expect(file.existsSync(), isTrue, reason: '$name وجود ندارد');
      expect(file.lengthSync(), greaterThan(20000),
          reason: '$name خیلی کوچک است — احتمالاً subsetِ خراب');
    }
  });

  test('وزنِ درخواستیِ کد از سنگین‌ترین وزنِ موجود بیشتر نیست', () {
    final declared = RegExp(r'weight:\s*(\d+)')
        .allMatches(pubspec)
        .map((m) => int.parse(m.group(1)!))
        .toList()
      ..sort();
    final heaviest = declared.last;

    // همهٔ `FontWeight.wNNN`های کدِ اپ.
    final used = <int>{};
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      for (final m in RegExp(r'FontWeight\.w(\d00)')
          .allMatches(entity.readAsStringSync())) {
        used.add(int.parse(m.group(1)!));
      }
    }
    expect(used, isNotEmpty, reason: 'اسکن باید چیزی پیدا کند');

    final synthetic = used.where((w) => w > heaviest).toList()..sort();
    expect(synthetic, isEmpty,
        reason: 'این وزن‌ها فایل ندارند و مصنوعی ضخیم می‌شوند: $synthetic '
            '(سنگین‌ترین وزنِ موجود: $heaviest)');
  });
}
