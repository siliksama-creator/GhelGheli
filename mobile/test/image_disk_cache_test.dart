// تست‌های کشِ دیسکیِ تصویرِ کارت.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها لازم‌اند
// ═══════════════════════════════════════════════════════════════════════════
//
// این کلاس در همین جلسه نوشته شد و **صفر پوششِ تست** داشت. سه ویژگی‌اش
// آن را دقیقاً از جنسِ کدی می‌کند که باگش سکوت می‌کند:
//
//   ۱. با سیستمِ فایل کار می‌کند — خطاهایش استثنا نمی‌دهند، فقط نتیجهٔ
//      اشتباه می‌دهند (فایلِ نیمه‌نوشته، فایلی که پاک نشده).
//   ۲. عمداً همهٔ استثناها را می‌بلعد (`catch (_) { return null; }`) تا
//      خرابیِ کش هرگز تصویر را از بین نبرد. همین یعنی هیچ خطایی به
//      بیرون درز نمی‌کند و باگ در سکوتِ کامل زندگی می‌کند.
//   ۳. حذفِ LRU روی فایل‌هایی کار می‌کند که کاربر نمی‌بیندشان.
//
// ⚠️ نکتهٔ مهم: خودِ `fetch()` به شبکه نیاز دارد و اینجا تست نمی‌شود.
//    چیزی که تست می‌شود منطقِ **دیسک** است: کلیدسازی، نوشتنِ اتمی،
//    خواندن، و پاکسازیِ LRU — همان بخشی که اگر خراب باشد کاربر تصویرِ
//    غلط یا خالی می‌بیند.
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/services/image_disk_cache.dart';

void main() {
  // ── چرا منطق اینجا بازسازی شده و خودِ کلاس import نشده ──
  //
  // `ImageDiskCache` به `getTemporaryDirectory()` از path_provider وابسته
  // است که در تستِ واحد پلاگینِ بومی ندارد و استثنا می‌دهد. جایگزین‌هایش
  // یا mock کردنِ کانالِ پلتفرم است (شکننده و پرسروصدا) یا تزریقِ مسیر
  // به کلاس — که یعنی API عمومی را برای راحتیِ تست عوض کنیم.
  //
  // درسِ تکرارشدهٔ این پروژه: «محصول را برای راحتیِ تست خراب نکن».
  //
  // پس اینجا **قراردادها** تست می‌شوند روی پوشهٔ موقتِ واقعی: همان
  // الگوریتم‌هایی که کلاس استفاده می‌کند، با همان ورودی‌ها. اگر کسی
  // الگوریتمِ کلاس را عوض کند و اینجا را نه، تستِ «کلاس همان کار را
  // می‌کند» (گروهِ آخر) قرمز می‌شود.
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('ggcache');
  });
  tearDown(() async {
    if (dir.existsSync()) await dir.delete(recursive: true);
  });

  String keyFor(String url) => sha1.convert(url.codeUnits).toString();

  group('کلیدسازی از URL', () {
    test('همان URL همیشه همان کلید را می‌دهد', () {
      const u = 'https://api.ghelghelishop.ir/uploads/images/1786-abc.webp';
      expect(keyFor(u), keyFor(u));
    });

    test('دو URL متفاوت کلیدِ متفاوت دارند', () {
      expect(keyFor('https://x/a.webp'), isNot(keyFor('https://x/b.webp')));
    });

    test('کلید فقط حروفِ مجازِ نامِ فایل دارد', () {
      // ── چرا هش و نه خودِ نامِ فایل ──
      // نامِ فایلِ سرور می‌تواند کاراکترِ غیرمجازِ سیستمِ فایل داشته باشد،
      // و دو دامنه می‌توانند نامِ یکسان داشته باشند.
      final k = keyFor('https://x/عکس کارت?v=1&a=/b.webp');
      expect(RegExp(r'^[0-9a-f]{40}$').hasMatch(k), isTrue, reason: k);
    });

    test('طولِ کلید ثابت است — سقفِ ۲۵۵ کاراکتریِ نامِ فایل هرگز نمی‌خورد', () {
      final long = 'https://x/${'a' * 5000}.webp';
      expect(keyFor(long).length, 40);
    });

    test('تفاوتِ یک کاراکتر کلیدِ کاملاً متفاوت می‌دهد', () {
      // اگر URLهای مشابه کلیدِ مشابه بدهند، خطرِ برخورد بالا می‌رود.
      final a = keyFor('https://x/1786096320347-cvdk9uw2pfm.webp');
      final b = keyFor('https://x/1786096320348-cvdk9uw2pfm.webp');
      expect(a, isNot(b));
    });
  });

  group('نوشتنِ اتمی', () {
    test('rename فایل را کامل و خوانا می‌گذارد', () async {
      final body = List<int>.generate(4096, (i) => i % 256);
      final tmp = File('${dir.path}/k.tmp');
      await tmp.writeAsBytes(body, flush: true);
      final target = File('${dir.path}/k');
      await tmp.rename(target.path);

      expect(target.existsSync(), isTrue);
      expect(await target.length(), 4096);
      expect(tmp.existsSync(), isFalse, reason: 'فایلِ موقت باید رفته باشد');
    });

    test('⚠️ فایلِ نیمه‌نوشته نباید معتبر شمرده شود', () async {
      // این دقیقاً دلیلِ وجودِ نوشتنِ اتمی است: اگر اپ وسطِ نوشتن کشته
      // شود (کاربر خارج شود، سیستم حافظه بخواهد) و ما مستقیم روی فایلِ
      // نهایی می‌نوشتیم، یک فایلِ صفر بایتی می‌ماند که `existsSync()`
      // آن را معتبر می‌بیند و کاربر برای همیشه تصویرِ خراب می‌دید.
      final half = File('${dir.path}/half');
      await half.writeAsBytes([]);
      final st = half.statSync();
      final valid = st.type == FileSystemEntityType.file && st.size > 0;
      expect(valid, isFalse, reason: 'فایلِ خالی نباید کشِ معتبر باشد');
    });

    test('نوشتنِ دوباره روی همان کلید فایل را خراب نمی‌کند', () async {
      final target = File('${dir.path}/k');
      for (var round = 0; round < 3; round++) {
        final tmp = File('${dir.path}/k.tmp');
        await tmp.writeAsBytes(List.filled(1000 * (round + 1), 7), flush: true);
        await tmp.rename(target.path);
      }
      expect(await target.length(), 3000);
    });
  });

  group('تشخیصِ کشِ معتبر با statSync', () {
    test('فایلِ موجود و ناخالی معتبر است', () async {
      final f = File('${dir.path}/ok');
      await f.writeAsBytes(List.filled(100, 1));
      final st = f.statSync();
      expect(st.type == FileSystemEntityType.file && st.size > 0, isTrue);
    });

    test('فایلِ ناموجود کرش نمی‌دهد، فقط نامعتبر است', () {
      // statSync روی مسیرِ ناموجود استثنا نمی‌دهد؛ نوعِ notFound
      // برمی‌گرداند. اگر روزی به exists() برگردیم این رفتار عوض می‌شود.
      final st = File('${dir.path}/nope').statSync();
      expect(st.type, FileSystemEntityType.notFound);
      expect(st.type == FileSystemEntityType.file && st.size > 0, isFalse);
    });

    test('پوشه به‌جای فایل معتبر شمرده نمی‌شود', () async {
      final d = Directory('${dir.path}/adir');
      await d.create();
      final st = File(d.path).statSync();
      expect(st.type == FileSystemEntityType.file, isFalse,
          reason: 'پوشه نباید به‌عنوان تصویرِ کش‌شده خوانده شود');
    });
  });

  group('پاکسازیِ LRU', () {
    test('قدیمی‌ترین‌ها اول می‌روند و به ۸۰٪ سقف می‌رسیم', () async {
      const maxBytes = 10000;
      // ده فایلِ ۱۵۰۰ بایتی = ۱۵۰۰۰ بایت، بالاتر از سقف.
      final files = <File>[];
      for (var i = 0; i < 10; i++) {
        final f = File('${dir.path}/f$i');
        await f.writeAsBytes(List.filled(1500, i));
        files.add(f);
      }
      // زمانِ دسترسیِ ساختگی: f0 قدیمی‌ترین.
      final base = DateTime.now().subtract(const Duration(days: 10));
      for (var i = 0; i < 10; i++) {
        await files[i].setLastAccessed(base.add(Duration(hours: i)));
      }

      var total = 15000;
      final stats = <File, DateTime>{};
      for (final f in files) {
        stats[f] = f.statSync().accessed;
      }
      files.sort((a, b) => stats[a]!.compareTo(stats[b]!));
      final target = (maxBytes * 0.8).round();
      final deleted = <String>[];
      for (final f in files) {
        if (total <= target) break;
        total -= await f.length();
        deleted.add(f.path.split('/').last);
        await f.delete();
      }

      expect(total, lessThanOrEqualTo(target));
      expect(deleted.first, 'f0', reason: 'قدیمی‌ترین باید اول برود');
      // ۱۵۰۰۰ → ۸۰۰۰ یعنی ۵ فایل (۷۵۰۰) حذف می‌شود تا به ۷۵۰۰ برسیم.
      expect(deleted, ['f0', 'f1', 'f2', 'f3', 'f4']);
      expect(File('${dir.path}/f9').existsSync(), isTrue,
          reason: 'تازه‌ترین باید بماند');
    });

    test('زیرِ سقف، هیچ فایلی حذف نمی‌شود', () async {
      const maxBytes = 100000;
      var total = 0;
      for (var i = 0; i < 5; i++) {
        final f = File('${dir.path}/g$i');
        await f.writeAsBytes(List.filled(100, i));
        total += 100;
      }
      expect(total <= maxBytes, isTrue);
      expect(dir.listSync().length, 5);
    });

    test('فایلی که پاک نمی‌شود حلقه را متوقف نمی‌کند', () async {
      // در کلاس، `delete` داخل try/catch است. اینجا همان قرارداد سنجیده
      // می‌شود: خطای یک فایل نباید بقیه را نجات‌نیافته بگذارد.
      var deleted = 0;
      for (var i = 0; i < 3; i++) {
        try {
          if (i == 1) throw const FileSystemException('boom');
          deleted += 1;
        } catch (_) {
          // ادامه
        }
      }
      expect(deleted, 2);
    });
  });

  group('کلاس همان قراردادها را دارد', () {
    // ⚠️ این گروه پلی است بین منطقِ بازسازی‌شدهٔ بالا و کدِ واقعی.
    //    اگر کسی الگوریتمِ کلاس را عوض کند (مثلاً SHA-256 یا سقفِ
    //    متفاوت) و تست‌های بالا را نه، اینجا قرمز می‌شود.
    final src = File('lib/services/image_disk_cache.dart').readAsStringSync();

    test('از sha1 برای نامِ فایل استفاده می‌کند', () {
      expect(src.contains('sha1.convert'), isTrue);
    });

    test('تشخیص URL نسخه‌دار در کلاس هست', () {
      expect(src.contains('isVersionedImageUrl'), isTrue);
      expect(src.contains('/uploads/'), isTrue);
    });

    test('نوشتن اتمی است (tmp سپس rename)', () {
      expect(src.contains(".tmp'"), isTrue);
      expect(RegExp(r'\.rename\(').hasMatch(src), isTrue,
          reason: 'بدونِ rename، فایلِ نیمه‌کاره برای همیشه می‌ماند');
    });

    test('سقفِ کش تعریف شده و معقول است', () {
      final m = RegExp(r'_maxBytes\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024')
          .firstMatch(src);
      expect(m, isNotNull, reason: 'سقفِ کش پیدا نشد');
      final mb = int.parse(m!.group(1)!);
      expect(mb, greaterThanOrEqualTo(20),
          reason: 'کمتر از ۲۰ مگابایت یعنی کلکسیونِ متوسط جا نمی‌شود');
      expect(mb, lessThanOrEqualTo(200),
          reason: 'بیشتر از ۲۰۰ مگابایت روی گوشیِ ارزان بی‌ادبی است');
    });

    test('از Application Support استفاده می‌کند نه Documents', () {
      // خواستهٔ جدید مالک «بعد از بستن و باز کردن دوباره هم از کش لود کن»
      // بود. temporary قراردادِ ماندگاری ندارد و هر لحظه ممکن است پاک
      // شود؛ Application Support برای همین دادهٔ داخلیِ پایدار ساخته شده.
      //
      // Documents همچنان ممنوع است چون در بکاپِ کاربر می‌رود و برای
      // دادهٔ بازتولیدپذیرِ کش، جای درستی نیست.
      final code = src
          .replaceAll(RegExp(r'//.*'), '')
          .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '');
      expect(code.contains('getApplicationSupportDirectory'), isTrue);
      expect(code.contains('getApplicationDocumentsDirectory'), isFalse,
          reason: 'کشِ قابلِ بازسازی نباید در بکاپِ گوگل برود');
    });

    test('درخواست‌های موازیِ یک URL ادغام می‌شوند', () {
      // بدونِ این، ده خانهٔ اینونتوری که یک تصویر می‌خواهند ده دانلودِ
      // موازی شروع می‌کنند و هر ده روی یک فایل می‌نویسند.
      expect(src.contains('_inFlight'), isTrue);
    });

    test('همهٔ خطاها بلعیده می‌شوند تا تصویر از بین نرود', () {
      // بدترین حالتِ این کلاس باید «مثلِ قبل» باشد نه «بدتر از قبل».
      expect(RegExp(r'catch \(_\) \{').allMatches(src).length,
          greaterThanOrEqualTo(4));
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  //  بندانگشتیِ درخواستی (`?w=`) و باگِ خاموشِ prewarm
  // ═════════════════════════════════════════════════════════════════════
  //
  // ⚠️ این گروه بعد از کشفِ باگی اضافه شد که **هیچ ردی از خود نمی‌گذاشت**:
  // `prewarmPayload` نشانیِ نسبیِ سرور (`/uploads/images/x.webp`) را
  // مستقیم به `fetch` می‌داد، `_dio` که baseUrl ندارد استثنا می‌داد، و
  // `catch (_)` عمدیِ کلاس آن را می‌بلعید. نتیجه: هر سه فراخوانِ prewarm
  // بی‌صدا هیچ کاری نمی‌کردند و هیچ تستی قرمز نمی‌شد.
  //
  // درسش: هر جا استثنا عمداً بلعیده می‌شود، باید تستی باشد که **نتیجهٔ
  // مثبت** را ثابت کند، نه فقط «خطا نداد».
  group('بندانگشتی و نرمال‌سازیِ نشانی', () {
    final src = File('lib/services/image_disk_cache.dart').readAsStringSync();
    final widgetSrc =
        File('lib/widgets/cached_card_image.dart').readAsStringSync();

    test('عرض‌های بندانگشتی با سرور یکی است', () {
      // ⚠️ اگر عددی اینجا باشد و در THUMB_WIDTHS سرور نباشد، سرور `?w=`
      // را نادیده می‌گیرد و فایلِ کامل می‌فرستد — یعنی بی‌صدا به حالتِ
      // کند برمی‌گردیم. مقایسه با خودِ فایلِ سرور انجام می‌شود تا
      // واگراییِ دو طرف ممکن نباشد.
      final serverSrc = File('../backend/src/server.js').readAsStringSync();
      final m = RegExp(r'THUMB_WIDTHS = new Set\(\[([0-9,\s]+)\]\)')
          .firstMatch(serverSrc);
      expect(m, isNotNull, reason: 'THUMB_WIDTHS در سرور پیدا نشد');
      final serverWidths = m!
          .group(1)!
          .split(',')
          .map((e) => int.parse(e.trim()))
          .toList()
        ..sort();

      final d = RegExp(r'kThumbWidths = <int>\[([0-9,\s]+)\]').firstMatch(src);
      expect(d, isNotNull, reason: 'kThumbWidths در کلاینت پیدا نشد');
      final clientWidths = d!
          .group(1)!
          .split(',')
          .map((e) => int.parse(e.trim()))
          .toList()
        ..sort();

      expect(clientWidths, serverWidths);
    });

    test('کوچک‌ترین عرضِ کافی انتخاب می‌شود، هرگز کوچک‌تر', () {
      // ⚠️ انتخابِ عرضِ کمتر از نیاز یعنی تصویرِ تار — باگِ ظاهری که از
      // کندی بدتر است. پس همیشه بالادست گرد می‌کنیم.
      const url = 'https://api.example.com/uploads/images/a.webp';
      expect(thumbUrlFor(url, 130), '$url?w=160');
      expect(thumbUrlFor(url, 160), '$url?w=160');
      expect(thumbUrlFor(url, 161), '$url?w=240');
      expect(thumbUrlFor(url, 280), '$url?w=320');
      expect(thumbUrlFor(url, 420), '$url?w=480');
    });

    test('فراتر از بزرگ‌ترین پله، اصلِ فایل سرو می‌شود', () {
      const url = 'https://api.example.com/uploads/images/a.webp';
      expect(thumbUrlFor(url, 900), url);
    });

    test('مسیرهای بدونِ بندانگشتی دست‌نخورده می‌مانند', () {
      // سرور فقط برای `/uploads/images/` بندانگشتی می‌سازد. افزودنِ
      // `?w=` به بقیه فقط کلیدِ کش را بی‌جهت دو تکه می‌کند.
      expect(thumbUrlFor('https://x/public/logo.png', 200),
          'https://x/public/logo.png');
      expect(thumbUrlFor('https://x/uploads/tickets/a.png', 200),
          'https://x/uploads/tickets/a.png');
      expect(thumbUrlFor('', 200), '');
      expect(thumbUrlFor('https://x/uploads/images/a.webp', null),
          'https://x/uploads/images/a.webp');
      // نشانی‌ای که از قبل کوئری دارد نباید دوباره‌نویسی شود.
      expect(thumbUrlFor('https://x/uploads/images/a.webp?v=2', 200),
          'https://x/uploads/images/a.webp?v=2');
    });

    test('fetch و cached نشانیِ نسبی را مطلق می‌کنند', () {
      // ⚠️ همان باگِ خاموش. رفع باید در **دروازهٔ ورودیِ کلاس** باشد نه
      // در فراخوان‌ها، وگرنه فراخوانِ بعدی دوباره همین اشتباه را می‌کند.
      expect(src.contains('Future<File?> fetch(String rawUrl)'), isTrue,
          reason: 'fetch باید ورودیِ خام بگیرد و خودش نرمال کند');
      expect(src.contains('Future<File?> cached(String rawUrl)'), isTrue,
          reason: 'cached باید همان نرمال‌سازی را داشته باشد');
      // هر سه دروازه (fetch، cached و memoryHit) باید واقعاً fullAssetUrl
      // صدا بزنند، نه فقط اسمِ پارامتر عوض شده باشد.
      expect(
          RegExp(r'final url = fullAssetUrl\(rawUrl\);').allMatches(src).length,
          3);
    });

    test('prewarm همان نشانی‌ای را گرم می‌کند که ویجت می‌خواهد', () {
      // ⚠️ اگر prewarm فایلِ کامل را بگیرد ولی ویجت `?w=320` را بخواهد،
      // آن دو دو کلیدِ متفاوتِ کش‌اند و بهینه‌سازی به ضدِ خودش تبدیل
      // می‌شود: یک‌بار ۱۳۷KB در پس‌زمینه و یک‌بار ۱۳KB موقعِ نمایش.
      expect(src.contains('yield thumbUrlFor('), isTrue);
      expect(src.contains('_cardPrewarmPx'), isTrue);
      expect(src.contains('_avatarPrewarmPx'), isTrue);
    });

    test('ویجت روی نشانیِ بندانگشتی کش و عقب‌نشینی می‌کند', () {
      // هویتِ تصویر (`_resolved`) و مقصدِ دانلود (`_requestUrl`) باید جدا
      // بمانند، وگرنه تغییرِ اندازه به‌اشتباه «تصویر عوض شد» تفسیر
      // می‌شود و کارت یک فریم سفید می‌پرد.
      expect(widgetSrc.contains('String _requestUrl'), isTrue);
      expect(widgetSrc.contains('_requestUrl = thumbUrlFor('), isTrue);
      expect(widgetSrc.contains('final requested = _requestUrl;'), isTrue);
      // عقب‌نشینی به شبکه هم نباید کاربر را به دانلودِ چند برابری
      // برگرداند.
      expect(
          widgetSrc.contains('_requestUrl.isEmpty ? _resolved : _requestUrl'),
          isTrue);
      // کلیدِ حافظه هم باید همان نشانیِ درخواستی باشد.
      expect(widgetSrc.contains('_syncHit[_requestUrl]'), isTrue);
      expect(widgetSrc.contains('_syncHit.remove(_requestUrl)'), isTrue);
    });
  });
}
