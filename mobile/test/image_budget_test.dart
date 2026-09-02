// ============================================================================
//  بودجهٔ حافظهٔ تصاویر — روی فایل‌های واقعی، نه عددهای دستی
// ============================================================================
//
//   flutter test test/image_budget_test.dart
//
// چرا این فایل جدا از robustness_test.dart است:
//
// آن تست‌ها عددهای ثابتی دارند که موقع ممیزی دستی حساب شده‌اند. مشکلشان این
// است که وقتی کسی یک asset را بزرگ‌تر می‌کند یا cacheWidth را برمی‌دارد،
// عددهای داخل تست تکان نمی‌خورند و تست همچنان سبز می‌ماند — یعنی دقیقاً
// وقتی که باید هشدار بدهد، ساکت است.
//
// این فایل به‌جای آن، خودِ فایل‌های dart و خودِ تصاویر روی دیسک را می‌خواند:
//   * هر Image.asset را پیدا می‌کند،
//   * ابعاد واقعی فایل را از هدر تصویر درمی‌آورد،
//   * هزینهٔ decode را با cacheWidth/cacheHeight همان فراخوانی حساب می‌کند.
//
// اگر کسی فردا یک بنر ۴۰۰۰ پیکسلی اضافه کند و هینت یادش برود، اینجا قرمز
// می‌شود — بدون اینکه لازم باشد کسی عدد تازه‌ای در تست بنویسد.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

/// ابعاد یک فایل تصویری، از روی هدر — بدون decode کردن کل تصویر.
///
/// فقط سه قالبی که در پروژه هست: WebP (VP8/VP8L/VP8X) و PNG.
({int w, int h})? imageSize(File f) {
  final b = f.readAsBytesSync();
  final d = ByteData.sublistView(b);

  // PNG: امضا، بعد IHDR با عرض/ارتفاع ۳۲ بیتی big-endian.
  if (b.length > 24 &&
      b[0] == 0x89 &&
      b[1] == 0x50 &&
      b[2] == 0x4E &&
      b[3] == 0x47) {
    return (w: d.getUint32(16), h: d.getUint32(20));
  }

  // WebP: "RIFF"...."WEBP" و بعد یکی از سه chunk.
  if (b.length > 30 &&
      String.fromCharCodes(b.sublist(0, 4)) == 'RIFF' &&
      String.fromCharCodes(b.sublist(8, 12)) == 'WEBP') {
    final kind = String.fromCharCodes(b.sublist(12, 16));
    if (kind == 'VP8X') {
      // ۲۴ بیتی little-endian، منهای یک.
      final w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
      final h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
      return (w: w, h: h);
    }
    if (kind == 'VP8 ') {
      return (
        w: d.getUint16(26, Endian.little) & 0x3FFF,
        h: d.getUint16(28, Endian.little) & 0x3FFF,
      );
    }
    if (kind == 'VP8L') {
      final bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return (w: (bits & 0x3FFF) + 1, h: ((bits >> 14) & 0x3FFF) + 1);
    }
  }
  return null;
}

class ImageUse {
  ImageUse(this.asset, this.file, this.line, this.cacheWidth, this.cacheHeight);
  final String asset;
  final String file;
  final int line;
  final int? cacheWidth;
  final int? cacheHeight;

  /// مگابایتِ decode شده با هینت‌های همین فراخوانی.
  double costMb(int w, int h) {
    var dw = w, dh = h;
    if (cacheWidth != null) {
      dw = cacheWidth!;
      dh = (h * cacheWidth! / w).round();
    } else if (cacheHeight != null) {
      dh = cacheHeight!;
      dw = (w * cacheHeight! / h).round();
    }
    return dw * dh * 4 / 1048576;
  }
}

List<ImageUse> collectUses() {
  final uses = <ImageUse>[];
  final assetRe = RegExp(r"""Image\.asset\(\s*'([^']+)'""");
  final cwRe = RegExp(r'cacheWidth:\s*(\d+)');
  final chRe = RegExp(r'cacheHeight:\s*(\d+)');

  for (final e in Directory('lib').listSync(recursive: true)) {
    if (e is! File || !e.path.endsWith('.dart')) continue;
    final src = e.readAsStringSync();
    for (final m in assetRe.allMatches(src)) {
      // مسیرهای interpolated یک فایل واقعی نیستند و با File همان رشته قابل
      // سنجش نیستند. هر خانوادهٔ پویا (Tap و Shop) پایین‌تر با خواندن کل
      // پوشه و سورس سازندهٔ مسیر، جداگانه و کامل بررسی می‌شود.
      if (m.group(1)!.contains(r'$')) continue;
      // پنجره تا انتهای همان فراخوانی: با شمردن پرانتزها جلو می‌رویم تا
      // آرگومان‌ها تمام شوند. بریدن کورِ ۷۰۰ کاراکتری، هینتی را که بعد از
      // چند خط توضیح می‌آمد از دست می‌داد و تست بی‌خود قرمز می‌شد.
      var depth = 1;
      var i = m.end;
      while (i < src.length && depth > 0) {
        final c = src[i];
        if (c == '(') depth++;
        if (c == ')') depth--;
        i++;
      }
      final tail = src.substring(m.end, i);

      uses.add(ImageUse(
        m.group(1)!,
        e.path,
        '\n'.allMatches(src.substring(0, m.start)).length + 1,
        int.tryParse(cwRe.firstMatch(tail)?.group(1) ?? ''),
        int.tryParse(chRe.firstMatch(tail)?.group(1) ?? ''),
      ));
    }
  }
  return uses;
}

void main() {
  group('بودجهٔ decode تصاویر (از روی فایل‌های واقعی)', () {
    final uses = collectUses();

    test('اسکریپت واقعاً چیزی پیدا می‌کند', () {
      // اگر روزی الگوی فراخوانی عوض شود و این صفر برگرداند، بقیهٔ تست‌های
      // این فایل بی‌سروصدا سبز می‌شوند و هیچ‌چیز را نمی‌سنجند.
      expect(uses.length, greaterThan(5),
          reason: 'هیچ Image.asset پیدا نشد — الگوی جست‌وجو خراب است');
    });

    test('همهٔ assetهای ارجاع‌شده روی دیسک هستند', () {
      // یک مسیر غلط در زمان اجرا فقط یک مربع خالی نشان می‌دهد و کسی
      // متوجه نمی‌شود؛ اینجا سر بیلد گیر می‌افتد.
      for (final u in uses) {
        expect(File(u.asset).existsSync(), isTrue,
            reason: '${u.file}:${u.line} به $u.asset اشاره می‌کند '
                'ولی چنین فایلی نیست');
      }
    });

    // هینت‌هایی که عدد ثابت نیستند و این تستِ ایستا نمی‌تواند بخواندشان.
    //
    // hero_logo عمداً `cacheWidth` را از `logoWidth` حساب می‌کند تا هر
    // فراخوان به اندازهٔ خودش decode شود؛ یک عدد ثابت آنجا اشتباه بود.
    // به‌جای ضعیف کردن کل تست، همین یک مورد استثنا می‌شود و پایین‌تر
    // جداگانه بررسی می‌شود.
    //
    // app_bar_logo هم همین‌طور: اندازهٔ لوگوی نوار بالا پارامتری است
    // (`widget.size`) تا بشود همان ویجت را جای دیگری بزرگ‌تر گذاشت،
    // پس هینت هم باید از همان پارامتر مشتق شود. تستِ اختصاصی‌اش
    // بلافاصله پایین‌تر است.
    const computedHint = {
      'lib/widgets/hero_logo.dart',
      'lib/widgets/app_bar_logo.dart',
    };

    test('هیچ تصویری بدون هینت بیش از ۱ مگابایت decode نمی‌شود', () {
      final offenders = <String>[];
      for (final u in uses) {
        if (computedHint.contains(u.file)) continue;
        final size = imageSize(File(u.asset));
        if (size == null) continue;
        final mb = u.costMb(size.w, size.h);
        if (mb > 1.0) {
          offenders.add('${u.file}:${u.line} → ${u.asset} '
              '(${size.w}x${size.h}, cacheWidth=${u.cacheWidth}, '
              '${mb.toStringAsFixed(2)}MB)');
        }
      }
      expect(offenders, isEmpty,
          reason: 'این تصاویر گران decode می‌شوند؛ cacheWidth بگذارید یا '
              'خود فایل را کوچک کنید:\n${offenders.join('\n')}');
    });

    test('app_bar_logo هینتِ decode را از اندازهٔ درخواستی می‌سازد', () {
      // این لوگو در نوار بالای **همهٔ** صفحه‌هاست، پس گران‌ترین جای
      // ممکن برای یک decode بی‌هینت است: منبع ۷۲۰×۵۹۵ یعنی ۱.۶۳ مگابایت
      // رزیدنت برای تمام نشست، برای چیزی که ۳۴ پیکسل رسم می‌شود.
      final src = File('lib/widgets/app_bar_logo.dart').readAsStringSync();
      expect(src.contains('cacheWidth: (s * 3).round()'), isTrue,
          reason: 'app_bar_logo باید decode را از اندازهٔ درخواستی بسازد');

      // و اندازهٔ پیش‌فرض باید کوچک بماند. اگر روزی کسی پیش‌فرض را به
      // ۲۰۰ ببرد، هزینه ۳۵ برابر می‌شود بدون اینکه کسی متوجه شود.
      final def = RegExp(r'this\.size = (\d+)').firstMatch(src);
      expect(def, isNotNull, reason: 'اندازهٔ پیش‌فرض پیدا نشد');
      final size = int.parse(def!.group(1)!);
      expect(size, lessThanOrEqualTo(48));

      final img = imageSize(File('assets/brand/logo.webp'))!;
      final dw = size * 3;
      final dh = (img.h * dw / img.w).round();
      final mb = dw * dh * 4 / 1048576;
      expect(mb, lessThan(0.10),
          reason: 'لوگوی نوار بالا باید زیر ۱۰۰ کیلوبایت decode شود، '
              'شد ${mb.toStringAsFixed(3)}MB');
    });

    test('hero_logo هینتِ محاسبه‌شده دارد و سقفش از منبع رد نمی‌شود', () {
      final src = File('lib/widgets/hero_logo.dart').readAsStringSync();
      // باید از عرض درخواستی مشتق شود، نه عدد ثابت.
      expect(src.contains('logoWidth * 3'), isTrue,
          reason: 'hero_logo باید decode را از اندازهٔ درخواستی بسازد');
      // و باید به عرض منبع کلیپ شود، وگرنه یک فراخوان بزرگ باعث upscale
      // می‌شود: هم حافظهٔ بیشتر، هم تصویر تارتر.
      expect(src.contains('> 720 ? 720'), isTrue,
          reason: 'باید به عرض منبع (۷۲۰) محدود شود تا upscale نشود');
    });

    test('مجموع همهٔ تصاویر اگر هم‌زمان در کش باشند زیر بودجه است', () {
      // بدترین حالت مطلق: هر تصویر بندل‌شده هم‌زمان resident باشد. در عمل
      // هیچ‌وقت این‌طور نیست، ولی اگر همین عدد هم زیر ۴۰ بماند، thrash کش
      // از سمت assetهای بندل‌شده غیرممکن است.
      final worst = <String, double>{};
      for (final u in uses) {
        final size = imageSize(File(u.asset));
        if (size == null) continue;
        final mb = u.costMb(size.w, size.h);
        if (mb > (worst[u.asset] ?? 0)) worst[u.asset] = mb;
      }
      final total = worst.values.fold<double>(0, (a, b) => a + b);
      expect(total, lessThan(40),
          reason: 'مجموع ${total.toStringAsFixed(1)}MB از بودجهٔ ۴۰ '
              'مگابایتی کش بیشتر است');
      // سقف واقع‌بینانه‌تر: بعد از این پاس عدد حدود ۹ مگابایت است.
      expect(total, lessThan(15),
          reason: 'مجموع ${total.toStringAsFixed(1)}MB — قبلاً حدود ۹ بود؛ '
              'یعنی یک هینت برداشته شده یا asset تازهٔ بزرگی اضافه شده');
    });

    test('۳۶ تصویر دسته‌های فعال فروشگاه کامل و کم‌هزینه‌اند', () {
      final source = File('lib/screens/user/shop_page.dart').readAsStringSync();
      expect(source.contains("'assets/shop/cosmetics/\$slug.webp'"), isTrue,
          reason: 'مسیر تصویر باید مستقیماً از slug سرور ساخته شود');
      expect(source.contains('cacheWidth: 640'), isTrue,
          reason: 'پیش‌نمایش فروشگاه باید سقف decode صریح داشته باشد');
      // شبکهٔ عمودی به‌جای carousel افقی — shrinkWrap + NeverScrollable
      // تا فقط با اسکرول صفحه decode شود، نه side-scroll جدا.
      expect(source.contains('GridView.builder'), isTrue,
          reason: 'ویترین فروشگاه باید شبکه باشد نه carousel افقی');
      expect(source.contains('scrollDirection: Axis.horizontal'), isFalse,
          reason: 'side-scroll افقی از فروشگاه حذف شده');

      final files = Directory('assets/shop/cosmetics')
          .listSync()
          .whereType<File>()
          .where((f) => f.path.endsWith('.webp'))
          .toList();
      // ۱۹ فایلِ دو دستهٔ result_template/match_effect عمداً همراه
      // کاتالوگشان حذف شده‌اند: ۵۵ − ۱۹ = ۳۶.
      expect(files.length, 36,
          reason: 'فقط artwork دسته‌های فعال باید در APK بماند');
      for (final file in files) {
        final size = imageSize(file);
        expect(size, isNotNull, reason: '${file.path} هدر WebP معتبر ندارد');
        expect(size!.w, 640, reason: '${file.path} عرض استاندارد ندارد');
        expect(size.h, 360, reason: '${file.path} ارتفاع استاندارد ندارد');
        const mb = 640 * 360 * 4 / 1048576;
        expect(mb, lessThan(1.0),
            reason: '${file.path} بیش از بودجهٔ decode هر پیش‌نمایش است');
      }
    });

    test('اسکین‌های بازی ضربه‌زن کوچک decode می‌شوند', () {
      // پرمصرف‌ترین صفحهٔ اپ: بازیکن دقایق طولانی رویش می‌ماند و موقع عوض
      // شدن شخصیت دو اسکین هم‌زمان زنده‌اند.
      //
      // مسیر اسکین یک متغیر است (`_SkinImage(path: ...)`) نه رشتهٔ ثابت،
      // پس collectUses آن را نمی‌بیند. هینت را مستقیم از سورس می‌خوانیم و
      // روی بزرگ‌ترین فایل واقعی حساب می‌کنیم.
      final src = File('lib/screens/user/games/tap/tap_character.dart')
          .readAsStringSync();
      final hint = RegExp(r'cacheWidth:\s*(\d+)').firstMatch(src);
      expect(hint, isNotNull, reason: '_SkinImage باید cacheWidth داشته باشد');
      final cw = int.parse(hint!.group(1)!);

      for (final f in Directory('assets/games/tap').listSync()) {
        if (f is! File) continue;
        final s = imageSize(f)!;
        final mb = cw * (s.h * cw / s.w).round() * 4 / 1048576;
        expect(mb, lessThan(0.7),
            reason: '${f.path} با cacheWidth=$cw برابر '
                '${mb.toStringAsFixed(2)}MB است');
      }
    });
  });

  group('assetهای بندل‌شده', () {
    test('فایل‌های فقط-بیلد داخل APK نمی‌روند', () {
      // assets/icon/ ورودی flutter_launcher_icons است و
      // splash_logo.png ورودی flutter_native_splash — هر دو در زمان بیلد
      // مصرف می‌شوند و mipmapهای واقعی را می‌سازند. اگر دوباره به لیست
      // assets برگردند، ۲.۴ مگابایت هنر منبع بی‌مصرف داخل هر APK می‌رود.
      final pubspec = File('pubspec.yaml').readAsStringSync();
      final assetsBlock = pubspec.substring(pubspec.indexOf('\n  assets:'));
      final decl = assetsBlock.substring(0, assetsBlock.indexOf('\n  fonts:'));

      expect(decl.contains('- assets/icon/'), isFalse,
          reason: 'assets/icon/ فقط ورودی بیلد است، نباید بندل شود');
      expect(decl.contains('- assets/splash/\n'), isFalse,
          reason: 'کل پوشهٔ splash نباید بندل شود — splash_logo.png '
              'فقط ورودی بیلد است');
      // ولی این یکی واقعاً در زمان اجرا کشیده می‌شود.
      // نسخهٔ webp بندل می‌شود (۲۲۸KB → ۳۶KB). فایل png کنارش می‌ماند
      // چون ورودی flutter_native_splash است، ولی بندل نمی‌شود.
      expect(decl.contains('assets/splash/splash_android12.webp'), isTrue,
          reason: 'splash_screen.dart این را می‌کشد؛ بدونش صفحهٔ لودینگ '
              'خالی می‌شود');
      expect(decl.contains('assets/splash/splash_android12.png'), isFalse,
          reason: 'png فقط ورودی بیلد است — نسخهٔ webp بندل می‌شود');
    });

    test('اسپلش تصویر تیرهٔ تکراری اعلام نمی‌کند', () {
      // flutter_native_splash برای image_dark یک مجموعهٔ کامل drawable
      // جداگانه می‌سازد. چون تصویر روشن و تیره عیناً یک فایل بودند،
      // ۱.۵ مگابایت بایتِ مو‌به‌مو تکراری داخل res/ می‌رفت (۱۲ جفت
      // فایل بایت-یکسان). رنگ‌های dark باید بمانند (بایت اضافه ندارند
      // و نبودشان در حالت تیره فلاش سفید می‌دهد) ولی image_dark نه.
      final pubspec = File('pubspec.yaml').readAsStringSync();
      final block = pubspec.substring(
        pubspec.indexOf('flutter_native_splash:'),
        pubspec.indexOf('\nflutter:'),
      );
      final live =
          block.split('\n').where((l) => !l.trimLeft().startsWith('#')).join('\n');

      expect(live.contains('image_dark:'), isFalse,
          reason: 'image_dark همان فایل روشن بود و ۱.۵MB تکرار می‌ساخت');
      // این‌ها باید بمانند:
      expect(live.contains('color_dark:'), isTrue,
          reason: 'بدون color_dark حالت تیره هنگام لانچ سفید می‌زند');
    });

    test('باشگاه‌های ایرانی از بندل حذف شده‌اند', () {
      for (final slug in [
        'esteghlal',
        'persepolis',
        'sepahan',
        'tractor',
        'malavan'
      ]) {
        expect(File('assets/shop/club_$slug.webp').existsSync(), isFalse,
            reason: 'نشان $slug باید حذف شده باشد');
      }
    });

    test('باشگاه‌های جهانی دست‌نخورده مانده‌اند', () {
      for (final slug in [
        'real_madrid',
        'barcelona',
        'man_united',
        'man_city',
        'liverpool',
        'arsenal',
        'bayern',
        'juventus',
        'psg',
        'inter_miami',
        'alnasr'
      ]) {
        expect(File('assets/shop/club_$slug.webp').existsSync(), isTrue,
            reason: 'نشان $slug نباید حذف می‌شد');
      }
    });
  });
}
