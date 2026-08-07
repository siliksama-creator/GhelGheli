// ═══════════════════════════════════════════════════════════════════════════
// کشِ دیسکیِ تصویرِ کارت‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک ──
//
//   «اگه میشه یه کاری کن که وقتی کاربر کارتی به اینونتوریش انتقال پیدا کرد
//    ازون به بعد دیگه تصویر کارت از گوشیش کش بشه که برای نمایش کارت در
//    اینونتوری هر بار درخواست به سرور ارسال نشه»
//
// ── مشکلی که واقعاً وجود داشت ──
//
// `Image.network` فلاتر فقط **کشِ حافظه** دارد (`ImageCache`، پیش‌فرض ۱۰۰
// تصویر / ۱۰۰ مگابایت). آن کش با بستنِ اپ کاملاً پاک می‌شود. یعنی کاربری
// که ۳۰ کارت دارد، هر بار اپ را باز می‌کند ۳۰ درخواستِ HTTP می‌زند — روی
// اینترنتِ موبایلِ ایران چند ثانیه انتظار و مصرفِ حجم، برای فایل‌هایی که
// **هرگز عوض نمی‌شوند**.
//
// سرور از قبل درست پاسخ می‌دهد:
//     Cache-Control: public, max-age=31536000, immutable
// ولی فلاتر آن هدر را نمی‌خواند. مرورگر می‌خواند — برای همین وب‌اپ این
// مشکل را نداشت و فقط اپِ اندروید داشت.
//
// ── چرا پکیج اضافه نشد (cached_network_image) ──
//
// وسوسه‌کننده بود. ولی `pubspec.yaml` این پروژه تاریخچهٔ مستندی از خرابیِ
// بیلد بر اثرِ وابستگی دارد: `path_provider_android` نسخهٔ ۲.۳.۰ وابستگیِ
// `jni` آورد و **هر** ساختِ APK را شکست، و رفعش یک `dependency_overrides`
// دستی شد. `cached_network_image` خودش سه وابستگیِ تراگذر می‌آورد
// (flutter_cache_manager, sqflite, rxdart) که هرکدام همان ریسک را دارند.
//
// کاری که لازم داریم ۱۵۰ خط است و هیچ وابستگیِ تازه‌ای نمی‌خواهد:
// `dio` و `crypto` از قبل مستقیم اعلام شده‌اند، و `path_provider` از قبل
// در `pubspec.lock` هست (تراگذر از مسیر shared_preferences).
//
// ── قرارداد ──
//
// نامِ فایلِ کش = SHA-1 از URL کامل. چرا هش و نه خودِ نامِ فایل:
//   • نامِ فایلِ سرور ممکن است کاراکترِ غیرمجازِ سیستمِ فایل داشته باشد
//   • دو دامنهٔ متفاوت می‌توانند نامِ فایلِ یکسان داشته باشند
//   • طول ثابت است، پس محدودیتِ ۲۵۵ کاراکتریِ نامِ فایل هرگز نمی‌خورد
//
// SHA-1 و نه SHA-256: اینجا رمزنگاری نیست، فقط نام‌گذاری. برخوردِ تصادفی
// عملاً ناممکن است و ۴۰ کاراکتر کوتاه‌تر از ۶۴ است.
import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

class ImageDiskCache {
  ImageDiskCache._();
  static final ImageDiskCache instance = ImageDiskCache._();

  /// سقفِ کش. کارتِ بهینه‌شده حدود ۱۰۰ تا ۱۵۰ کیلوبایت است، پس ۶۰
  /// مگابایت یعنی حدود ۴۰۰ تا ۶۰۰ کارت — بیش از هر کلکسیونِ واقعی.
  ///
  /// چرا اصلاً سقف: بدونِ آن، کاربری که سال‌ها اپ را نگه می‌دارد پوشهٔ
  /// کشی می‌سازد که هیچ‌وقت کوچک نمی‌شود. اندروید در فشارِ فضا خودش
  /// پوشهٔ cache را پاک می‌کند، ولی روی آن حساب نمی‌کنیم.
  static const int _maxBytes = 60 * 1024 * 1024;

  Directory? _dir;
  // درخواست‌های در جریان. بدونِ این، اگر ده خانهٔ اینونتوری هم‌زمان یک
  // تصویر بخواهند (کارتِ تکراری در دو لیست)، ده دانلودِ موازیِ یکسان
  // شروع می‌شود و هر ده روی یک فایل می‌نویسند.
  final Map<String, Future<File?>> _inFlight = {};
  final Dio _dio = Dio(BaseOptions(
    responseType: ResponseType.bytes,
    // مهلتِ سخاوتمندانه: اینترنتِ موبایلِ ایران کند است و شکستِ زودهنگام
    // یعنی برگشت به حالتِ «هر بار دانلود».
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 40),
    // ۴۰۴ نباید استثنا پرتاب کند؛ خودمان تصمیم می‌گیریم.
    validateStatus: (s) => s != null && s < 500,
  ));

  Future<Directory> _ensureDir() async {
    if (_dir != null) return _dir!;
    // getTemporaryDirectory و نه getApplicationDocumentsDirectory:
    // این داده قابلِ بازسازی است و نباید در بکاپِ خودکارِ گوگل برود یا
    // در «حجمِ اشغال‌شدهٔ اپ» به‌عنوان دادهٔ کاربر شمرده شود.
    final base = await getTemporaryDirectory();
    final d = Directory('${base.path}/card_images');
    // ── چرا نسخهٔ همگام ──
    //
    // `avoid_slow_async_io` درست می‌گوید: نسخهٔ async این متدها روی
    // کارِ کوچکِ متادیتا **کندتر** است، چون کار به یک ایزولهٔ دیگر
    // فرستاده و برگردانده می‌شود و آن رفت‌وبرگشت از خودِ syscall
    // گران‌تر است. اینجا فقط یک بار در طولِ عمرِ اپ اجرا می‌شود.
    if (!d.existsSync()) d.createSync(recursive: true);
    _dir = d;
    return d;
  }

  String _keyFor(String url) => sha1.convert(url.codeUnits).toString();

  /// مسیرِ فایلِ کش‌شده اگر موجود باشد، وگرنه null. **بدونِ شبکه.**
  ///
  /// جدا از `fetch` است تا ویجت بتواند در همان فریمِ اول تصمیم بگیرد
  /// «فایل دارم» یا «باید دانلود کنم» — بدونِ اینکه یک فریم اسپینر
  /// نشان بدهد و بعد ناگهان تصویر بپرد.
  Future<File?> cached(String url) async {
    if (url.isEmpty) return null;
    try {
      final dir = await _ensureDir();
      final f = File('${dir.path}/${_keyFor(url)}');
      // همگام و عمدی: این متد در مسیرِ رندرِ هر خانهٔ اینونتوری صدا
      // زده می‌شود و باید سریع‌ترین حالت باشد. `statSync` هر دو سؤال
      // («هست؟» و «خالی نیست؟») را با **یک** syscall جواب می‌دهد،
      // به‌جای دو رفت‌وبرگشتِ async.
      final st = f.statSync();
      if (st.type == FileSystemEntityType.file && st.size > 0) {
        // زمانِ دسترسی را به‌روز می‌کنیم تا پاکسازیِ LRU تصویرِ
        // پرکاربرد را قربانی نکند. شکستش بی‌اهمیت است.
        unawaited(f.setLastAccessed(DateTime.now()).catchError((_) {}));
        return f;
      }
    } catch (_) {
      // هر خطای سیستمِ فایل یعنی «کش نداریم» — نه یعنی «خطا نشان بده».
    }
    return null;
  }

  /// فایل را برمی‌گرداند؛ اگر نبود دانلود و ذخیره می‌کند.
  ///
  /// در هر شکستی `null` برمی‌گرداند تا فراخوان به `Image.network` عقب
  /// بنشیند. ⚠️ کشِ خراب هرگز نباید باعثِ تصویرِ نمایش‌داده‌نشده شود:
  /// بدترین حالتِ این کلاس باید «مثلِ قبل» باشد، نه «بدتر از قبل».
  Future<File?> fetch(String url) {
    if (url.isEmpty) return Future.value(null);
    final existing = _inFlight[url];
    if (existing != null) return existing;

    final job = _fetch(url).whenComplete(() => _inFlight.remove(url));
    _inFlight[url] = job;
    return job;
  }

  Future<File?> _fetch(String url) async {
    final hit = await cached(url);
    if (hit != null) return hit;

    try {
      final dir = await _ensureDir();
      final res = await _dio.get<List<int>>(url);
      final body = res.data;
      if (res.statusCode != 200 || body == null || body.isEmpty) return null;

      // ── نوشتنِ اتمی ──
      //
      // اول در فایلِ موقت، بعد rename. بدونِ این، اگر اپ وسطِ نوشتن
      // کشته شود (کاربر از اپ خارج شود، سیستم حافظه بخواهد) یک فایلِ
      // نیمه‌کاره روی دیسک می‌ماند که `cached()` آن را معتبر می‌بیند و
      // برای همیشه تصویرِ خراب نشان می‌دهد. rename روی یک سیستمِ فایل
      // اتمی است.
      final tmp = File('${dir.path}/${_keyFor(url)}.tmp');
      await tmp.writeAsBytes(body, flush: true);
      final target = File('${dir.path}/${_keyFor(url)}');
      await tmp.rename(target.path);

      // پاکسازی در پس‌زمینه: نباید نمایشِ تصویر را عقب بیندازد.
      unawaited(_trim());
      return target;
    } catch (_) {
      return null;
    }
  }

  /// اگر کش از سقف گذشت، قدیمی‌ترین‌ها (بر اساسِ آخرین دسترسی) حذف
  /// می‌شوند تا به ۸۰٪ سقف برسیم.
  ///
  /// چرا ۸۰٪ و نه دقیقاً سقف: اگر تا خودِ سقف پاک کنیم، دانلودِ بعدی
  /// دوباره از سقف رد می‌شود و پاکسازی هر بار اجرا می‌شود. این حاشیه
  /// یعنی پاکسازی گاه‌به‌گاه اتفاق می‌افتد نه در هر دانلود.
  Future<void> _trim() async {
    try {
      final dir = await _ensureDir();
      final files = <File>[];
      var total = 0;
      await for (final e in dir.list()) {
        if (e is! File) continue;
        final len = await e.length();
        total += len;
        files.add(e);
      }
      if (total <= _maxBytes) return;

      final stats = <File, DateTime>{};
      for (final f in files) {
        try {
          // همگام: این حلقه در پس‌زمینه اجرا می‌شود و روی چند صد فایل
          // است؛ نسخهٔ async برای هرکدام یک رفت‌وبرگشت به ایزولهٔ
          // دیگر می‌سازد که مجموعاً کندتر از خودِ خواندنِ متادیتاست.
          stats[f] = f.statSync().accessed;
        } catch (_) {
          stats[f] = DateTime.fromMillisecondsSinceEpoch(0);
        }
      }
      files.sort((a, b) => stats[a]!.compareTo(stats[b]!));

      final target = (_maxBytes * 0.8).round();
      for (final f in files) {
        if (total <= target) break;
        try {
          total -= await f.length();
          await f.delete();
        } catch (_) {
          // فایلی که پاک نمی‌شود نباید حلقه را متوقف کند.
        }
      }
    } catch (_) {
      // پاکسازی بهترین‌تلاش است. شکستش هیچ اثری روی نمایش ندارد.
    }
  }

  /// پاکسازیِ کامل — برای دکمهٔ «پاک کردن کش» یا خروج از حساب.
  Future<void> clear() async {
    try {
      final dir = await _ensureDir();
      await dir.delete(recursive: true);
      _dir = null;
    } catch (_) {}
  }

  /// حجمِ فعلیِ کش به بایت. برای نمایش در تنظیمات.
  Future<int> sizeBytes() async {
    try {
      final dir = await _ensureDir();
      var total = 0;
      await for (final e in dir.list()) {
        if (e is File) total += await e.length();
      }
      return total;
    } catch (_) {
      return 0;
    }
  }

  @visibleForTesting
  void resetForTest() {
    _dir = null;
    _inFlight.clear();
  }
}
