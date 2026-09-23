// ═══════════════════════════════════════════════════════════════════════════
// آپدیتِ داخل‌اپی: دانلودِ خودکار + راستی‌آزمایی + نصب با یک لمس
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۳ مهر ۱۴۰۵): «وقتی پیغام آپدیت اومد — چه اجباری چه غیراجباری —
// یه لودینگ دانلود پر بشه؛ اپ همین‌طور که بازه خودش دانلود کنه و بعد خودشو
// نصب کنه. در حالت اجبار هم کاربر تا آپدیت نکرده نتونه با اپ کار کنه.»
//
// چرا این سرویس جدا از دیالوگ است: ماشینِ حالت (دانلود → بررسی → نصب) باید
// بدونِ ویجت هم تست شود. `test/app_updater_test.dart` با دانلودر/نصب‌کنندهٔ
// جعلی، همین کلاس را می‌سنجد — بدونِ شبکه و بدونِ کانالِ بومی.
//
// چرا بدونِ وابستگیِ تازه: `dio` (دانلود با درصدِ پیشرفت)، `crypto` (بررسیِ
// sha256)، `path_provider` (پوشهٔ امنِ اپ) هر سه از قبل در pubspec هستند و
// تاریخچهٔ پروژه نشان داده هر وابستگیِ بومیِ تازه (نمونه: path_provider_android)
// می‌تواند بیلد را بشکند. تنها تکهٔ بومی، یک MethodChannelِ کوچک است که
// `tool/patch_update_install.sh` در CI تزریقش می‌کند — چون `android/` در
// git نیست و هر بار بازساخته می‌شود.
//
// «نصبِ خودش»: اندروید به اپِ عادی اجازهٔ نصبِ بی‌صدا نمی‌دهد؛ بهترینِ ممکن
// بازکردنِ خودکارِ نصب‌کنندهٔ سیستم است. اگر کانالِ بومی نباشد (بیلدِ محلیِ
// بدونِ پچ)، دیالوگ به‌جایش مرورگر را باز می‌کند تا کاربر هرگز گیر نکند.

import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

/// مرحله‌های ماشینِ حالتِ آپدیت.
enum AppUpdatePhase {
  /// هنوز شروع نشده.
  idle,

  /// در حال گرفتنِ فایل از سرور.
  downloading,

  /// فایل رسیده؛ حجم و sha256 سنجیده می‌شود.
  verifying,

  /// فایل سالم روی دیسک است و آمادهٔ نصب.
  readyToInstall,

  /// فرمانِ نصب به اندروید فرستاده شده.
  installing,

  /// نصب‌کننده باز شد (بعدش سیستم کار را دست می‌گیرد).
  done,

  /// خطا — با `errorCode` می‌شود پیامِ درست را نشان داد.
  error,

  /// کاربر لغو کرد (فقط در حالتِ غیراجباری ممکن است).
  cancelled,
}

/// هرچه دیالوگ برای نمایش و دانلود لازم دارد — یک‌جا از `app.release`.
class AppUpdateInfo {
  /// نسخهٔ منتشرشده، مثل `1.1.20`.
  final String version;

  /// یادداشتی که ادمین در صفحهٔ «انتشار اپ» نوشته.
  final String notes;

  /// حجمِ موردانتظارِ فایل (بایت). صفر یعنی «نمی‌دانیم».
  final int sizeBytes;

  /// اثرِ sha256 فایل. خالی یعنی «بررسی نکن».
  final String sha256;

  /// لینکِ مستقیمِ APK (خودِ سرور).
  final String url;

  /// اجباری: کاربر تا نصب نکند به اپ برنمی‌گردد.
  final bool forced;

  /// نسخهٔ نصب‌شدهٔ فعلی (برای سطرِ «نسخهٔ فعلی شما …»).
  final String current;

  /// حداقلِ لازم — خالی یعنی «حداقلی در کار نیست، فقط نسخهٔ تازه آمده».
  final String min;

  const AppUpdateInfo({
    this.version = '',
    this.notes = '',
    this.sizeBytes = 0,
    this.sha256 = '',
    required this.url,
    this.forced = false,
    this.current = '',
    this.min = '',
  });

  /// نامِ امنِ فایل روی دیسک. نسخه از سرور می‌آید و نباید خام در مسیر
  /// بنشیند (`../` در نامِ فایل یعنی نوشتن بیرون از پوشهٔ اپ).
  String get fileName {
    final v = version.trim().isEmpty ? 'latest' : version.trim();
    final safe = v
        .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')
        // '..' بدونِ '/' هم به بیرون راه ندارد، ولی نامِ فایل را مشکوک
        // می‌کند؛ خنثی‌اش می‌کنیم (`1.1.20` نقطهٔ تکی دارد و دست‌نخورده
        // می‌ماند).
        .replaceAll('..', '__');
    return 'ghelgheli-$safe.apk';
  }
}

/// عکسِ لحظه‌ایِ وضعیت — هر تغییر، یک نمونهٔ تازه (تغییرناپذیر).
class AppUpdateSnapshot {
  final AppUpdatePhase phase;

  /// پیشرفتِ ۰ تا ۱. ‎-۱ یعنی «نامشخص» (سرور حجم را نفرستاده).
  final double progress;
  final int receivedBytes;
  final int totalBytes;

  /// کدِ خطا: `network` | `size` | `hash` | `install` | `missing-plugin`.
  final String? errorCode;
  final String? errorDetail;

  const AppUpdateSnapshot({
    this.phase = AppUpdatePhase.idle,
    this.progress = 0,
    this.receivedBytes = 0,
    this.totalBytes = 0,
    this.errorCode,
    this.errorDetail,
  });
}

/// دانلودرِ تزریق‌پذیر — در تولید `dio.download`، در تست یک تابعِ جعلی.
typedef AppUpdateDownload = Future<void> Function({
  required String url,
  required String savePath,
  required void Function(int received, int total) onProgress,
  required CancelToken cancelToken,
});

/// نصب‌کنندهٔ تزریق‌پذیر — در تولید کانالِ بومی، در تست یک تابعِ جعلی.
typedef AppUpdateInstall = Future<void> Function(String apkPath);

class AppUpdater extends ValueNotifier<AppUpdateSnapshot> {
  AppUpdater({
    Dio? dio,
    Directory? targetDir,
    AppUpdateDownload? download,
    AppUpdateInstall? install,
  })  : _dio = dio,
        _targetDir = targetDir,
        _download = download,
        _install = install,
        super(const AppUpdateSnapshot());

  static const MethodChannel _channel = MethodChannel('ghelgheli/update');

  final Dio? _dio;
  final Directory? _targetDir;
  final AppUpdateDownload? _download;
  final AppUpdateInstall? _install;

  CancelToken? _cancelToken;
  bool _started = false;
  bool _disposed = false;
  String? _apkPath;

  /// مسیرِ فایلِ دانلودشده — فقط وقتی معتبر است که مرحله
  /// `readyToInstall` (یا بعدش) باشد.
  String? get apkPath => _apkPath;

  void _set(AppUpdateSnapshot next) {
    // اگر دیالوگ بسته شده باشد، شنونده‌ای نیست که خبر بخواهد؛
    // و set روی ValueNotifierِ disposeشده استثنا می‌دهد.
    if (_disposed) return;
    value = next;
  }

  void _fail(String code, [String? detail]) {
    _started = false;
    _set(AppUpdateSnapshot(
      phase: AppUpdatePhase.error,
      progress: value.progress,
      receivedBytes: value.receivedBytes,
      totalBytes: value.totalBytes,
      errorCode: code,
      errorDetail: detail,
    ));
  }

  /// پوشهٔ دانلود: حافظهٔ داخلیِ خودِ اپ — کاربر نمی‌بیندش، با بستنِ اپ
  /// پاک نمی‌شود، و FileProviderِ ما (`files-path`) همان را سرو می‌کند.
  Future<Directory> _resolveDir() async {
    if (_targetDir != null) return _targetDir;
    final base = await getApplicationSupportDirectory();
    final dir = Directory('${base.path}/app_update');
    // نسخهٔ همگام: یک بار در طولِ عمرِ دیالوگ اجرا می‌شود و از
    // رفت‌وبرگشتِ ایزوله (avoid_slow_async_io) گران‌تر نیست.
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir;
  }

  /// شروعِ دانلود. بعد از خطا/لغو می‌شود دوباره صدا زد («تلاش مجدد»)؛
  /// وسطِ کارِ در جریان، صدازدنِ دوباره نادیده گرفته می‌شود.
  Future<void> start(AppUpdateInfo info) async {
    if (_started || _disposed) return;
    _started = true;
    _cancelToken = CancelToken();
    _apkPath = null;
    _set(const AppUpdateSnapshot(
      phase: AppUpdatePhase.downloading,
      progress: 0,
    ));
    try {
      final dir = await _resolveDir();
      final path = '${dir.path}/${info.fileName}';
      final file = File(path);
      // فایلِ نیمه‌کارهٔ تلاشِ قبلی نباید به «ادامهٔ دانلود» بچسبد —
      // ما resume نمی‌کنیم و فایلِ ناقص فقط بررسیِ حجم را خراب می‌کند.
      if (file.existsSync()) {
        try {
          file.deleteSync();
        } catch (_) {
          // اگر پاک نشد، دانلودِ تازه رویش می‌نشیند؛ بررسیِ حجم/هش
          // در هر صورت فایلِ خراب را می‌گیرد.
        }
      }
      final Dio dio = _dio ??
          Dio(BaseOptions(
            // اینترنتِ موبایلِ ایران کند است؛ مهلتِ تنگ یعنی
            // «دانلودِ ۸۶ مگابایتی همیشه در ۶۰٪ می‌میرد».
            connectTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(seconds: 120),
          ));
      final bool ownDio = _dio == null;
      void onProgress(int received, int total) {
        final p = total > 0 ? (received / total).clamp(0.0, 1.0) : -1.0;
        _set(AppUpdateSnapshot(
          phase: AppUpdatePhase.downloading,
          progress: p,
          receivedBytes: received,
          totalBytes: total > 0 ? total : 0,
        ));
      }

      try {
        if (_download != null) {
          await _download(
            url: info.url,
            savePath: path,
            onProgress: onProgress,
            cancelToken: _cancelToken!,
          );
        } else {
          await dio.download(
            info.url,
            path,
            cancelToken: _cancelToken,
            onReceiveProgress: onProgress,
          );
        }
      } finally {
        if (ownDio) dio.close(force: true);
      }
      if (_cancelToken?.isCancelled ?? false) {
        _started = false;
        _set(const AppUpdateSnapshot(phase: AppUpdatePhase.cancelled));
        return;
      }
      // ── راستی‌آزمایی ────────────────────────────────────────────
      _set(AppUpdateSnapshot(
        phase: AppUpdatePhase.verifying,
        progress: 1,
        receivedBytes: value.receivedBytes,
        totalBytes: value.totalBytes,
      ));
      bool bad = false;
      if (info.sizeBytes > 0) {
        int len = -1;
        try {
          len = file.lengthSync();
        } catch (_) {
          len = -1;
        }
        if (len != info.sizeBytes) {
          try {
            if (file.existsSync()) file.deleteSync();
          } catch (_) {}
          _fail('size', 'expected=${info.sizeBytes} actual=$len');
          bad = true;
        }
      }
      final want = info.sha256.trim().toLowerCase();
      if (!bad && want.isNotEmpty) {
        String got = '';
        try {
          // جریانی (نه یک‌جای ۸۶ مگ در حافظه).
          final digest = await sha256.bind(file.openRead()).first;
          got = digest.toString();
        } catch (_) {
          got = '';
        }
        if (got != want) {
          try {
            if (file.existsSync()) file.deleteSync();
          } catch (_) {}
          _fail('hash', null);
          bad = true;
        }
      }
      if (bad) return;
      _apkPath = path;
      _started = false;
      _set(AppUpdateSnapshot(
        phase: AppUpdatePhase.readyToInstall,
        progress: 1,
        receivedBytes: value.receivedBytes,
        totalBytes: value.totalBytes,
      ));
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) {
        _started = false;
        _set(const AppUpdateSnapshot(phase: AppUpdatePhase.cancelled));
      } else {
        _fail('network', e.message);
      }
    } catch (e) {
      if (_cancelToken?.isCancelled ?? false) {
        _started = false;
        _set(const AppUpdateSnapshot(phase: AppUpdatePhase.cancelled));
      } else {
        _fail('network', '$e');
      }
    }
  }

  /// فرستادنِ فرمانِ نصب به اندروید. از مرحلهٔ `readyToInstall` (شلیکِ
  /// خودکار) و `done` (کاربری که از نصب‌کننده برگشته و دوباره «نصب» را
  /// می‌زند) کار می‌کند — از هر مرحلهٔ دیگری نادیده گرفته می‌شود تا دو
  /// نصب‌کننده باز نشود.
  Future<void> install() async {
    final path = _apkPath;
    final phase = value.phase;
    if (path == null ||
        (phase != AppUpdatePhase.readyToInstall &&
            phase != AppUpdatePhase.done)) {
      return;
    }
    if (_disposed) return;
    _set(AppUpdateSnapshot(
      phase: AppUpdatePhase.installing,
      progress: 1,
      receivedBytes: value.receivedBytes,
      totalBytes: value.totalBytes,
    ));
    try {
      if (_install != null) {
        await _install(path);
      } else {
        await _channel.invokeMethod<String>('installApk', {'path': path});
      }
      _set(AppUpdateSnapshot(
        phase: AppUpdatePhase.done,
        progress: 1,
        receivedBytes: value.receivedBytes,
        totalBytes: value.totalBytes,
      ));
    } on MissingPluginException {
      // بیلدِ محلیِ بدونِ پچِ بومی (android/ دستی ساخته شده). دیالوگ در
      // این حالت خودش مرورگر را باز می‌کند تا کاربر گیر نکند.
      _fail('missing-plugin', null);
    } on PlatformException catch (e) {
      _fail('install', e.message ?? e.code);
    } catch (e) {
      _fail('install', '$e');
    }
  }

  /// لغوِ دانلودِ در جریان. مرحلهٔ `cancelled` وقتی ست می‌شود که Futureی
  /// دانلود با خطای cancel برگردد — همان‌جا، نه اینجا — تا ترتیبِ
  /// رویدادها به‌هم نریزد.
  void cancel() {
    _cancelToken?.cancel();
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelToken?.cancel();
    super.dispose();
  }
}
