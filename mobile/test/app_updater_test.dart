// ============================================================================
//  تستِ آپدیتِ داخل‌اپی — «دانلودِ خودکار، فایلِ سالم، نصبِ کنترل‌شده»
// ============================================================================
//
//   flutter test test/app_updater_test.dart
//
// این فایل، ماشینِ حالتِ `AppUpdater` را با دانلودر/نصب‌کنندهٔ جعلی می‌سنجد —
// بدونِ شبکه و بدونِ کانالِ بومی. پنج چیزی که قفل می‌شوند:
//
//   ۱. پیشرفت، صعودی و در بازهٔ ۰ تا ۱ گزارش می‌شود و دانلودِ سالم به
//      مرحلهٔ `readyToInstall` می‌رسد.
//   ۲. فایلِ ناقص (حجمِ ناهم‌خوان) یا دست‌کاری‌شده (sha256 ناهم‌خوان)
//      هرگز به نصب نمی‌رسد و از دیسک پاک می‌شود.
//   ۳. لغو، مرحله را `cancelled` می‌کند.
//   ۴. نصبِ موفق `done` و نصبِ ناموفق `error` می‌دهد؛ صدازدنِ دوبارهٔ
//      نصب از مرحلهٔ نامرتبط نادیده گرفته می‌شود.
//   ۵. شروعِ دوباره وسطِ کار نادیده گرفته می‌شود، ولی بعد از خطا
//      («تلاش مجدد») دوباره شروع می‌شود.

import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/services/app_updater.dart';

const _info = AppUpdateInfo(
  version: '1.1.20',
  url: 'https://example.invalid/app.apk',
);

Future<Directory> _tempDir() =>
    Directory.systemTemp.createTemp('gg_update_test_');

/// دانلودرِ جعلی: پیشرفتِ صعودی گزارش می‌کند و بایت‌های داده‌شده را می‌نویسد.
AppUpdateDownload _fakeDownload(List<int> bytes, {void Function()? onCall}) {
  return ({
    required String url,
    required String savePath,
    required void Function(int received, int total) onProgress,
    required CancelToken cancelToken,
  }) async {
    onCall?.call();
    onProgress(0, bytes.length);
    // اگر وسطِ کار لغو شد، مثلِ dio رفتار کن: خطای cancel.
    if (cancelToken.isCancelled) {
      throw DioException(
        requestOptions: RequestOptions(path: url),
        type: DioExceptionType.cancel,
      );
    }
    await File(savePath).writeAsBytes(bytes);
    onProgress(bytes.length, bytes.length);
  };
}

void main() {
  group('آپدیتِ داخل‌اپی', () {
    test('دانلودِ سالم به نصب آماده می‌رسد و پیشرفت صعودی است', () async {
      final dir = await _tempDir();
      addTearDown(() => dir.deleteSync(recursive: true));
      final updater = AppUpdater(
        targetDir: dir,
        download: _fakeDownload([1, 2, 3, 4]),
      );
      addTearDown(updater.dispose);
      final seen = <double>[];
      updater.addListener(() {
        final s = updater.value;
        if (s.phase == AppUpdatePhase.downloading) seen.add(s.progress);
      });
      await updater.start(const AppUpdateInfo(
        version: '1.1.20',
        sizeBytes: 4,
        url: 'https://example.invalid/app.apk',
      ));
      expect(updater.value.phase, AppUpdatePhase.readyToInstall);
      expect(updater.apkPath, isNotNull);
      expect(File(updater.apkPath!).existsSync(), isTrue);
      expect(seen.isNotEmpty, isTrue);
      for (var i = 1; i < seen.length; i++) {
        expect(seen[i] >= seen[i - 1], isTrue,
            reason: 'پیشرفت باید صعودی باشد: $seen');
      }
      expect(seen.last, 1.0);
    });

    test('حجمِ ناهم‌خوان خطای size می‌دهد و فایلِ خراب پاک می‌شود',
        () async {
      final dir = await _tempDir();
      addTearDown(() => dir.deleteSync(recursive: true));
      final updater = AppUpdater(
        targetDir: dir,
        download: _fakeDownload([1, 2, 3]),
      );
      addTearDown(updater.dispose);
      await updater.start(const AppUpdateInfo(
        version: '1.1.20',
        sizeBytes: 999,
        url: 'https://example.invalid/app.apk',
      ));
      expect(updater.value.phase, AppUpdatePhase.error);
      expect(updater.value.errorCode, 'size');
      expect(updater.apkPath, isNull);
      expect(dir.listSync().isEmpty, isTrue,
          reason: 'فایلِ ناقص نباید روی دیسک بماند');
    });

    test('sha256 درست قبول و نادرست رد می‌شود', () async {
      final bytes = [10, 20, 30, 40, 50];
      final good = sha256.convert(bytes).toString();
      Future<AppUpdateSnapshot> run(String hash) async {
        final dir = await _tempDir();
        addTearDown(() => dir.deleteSync(recursive: true));
        final updater = AppUpdater(
          targetDir: dir,
          download: _fakeDownload(bytes),
        );
        addTearDown(updater.dispose);
        await updater.start(AppUpdateInfo(
          version: '1.1.20',
          sizeBytes: bytes.length,
          sha256: hash,
          url: 'https://example.invalid/app.apk',
        ));
        return updater.value;
      }

      final okSnap = await run(good);
      expect(okSnap.phase, AppUpdatePhase.readyToInstall);
      final badSnap = await run('0' * 64);
      expect(badSnap.phase, AppUpdatePhase.error);
      expect(badSnap.errorCode, 'hash');
    });

    test('لغو، مرحله را cancelled می‌کند', () async {
      final dir = await _tempDir();
      addTearDown(() => dir.deleteSync(recursive: true));
      final updater = AppUpdater(
        targetDir: dir,
        download: ({
          required String url,
          required String savePath,
          required void Function(int received, int total) onProgress,
          required CancelToken cancelToken,
        }) async {
          // دانلودِ کُند که فقط با لغو تمام می‌شود.
          await cancelToken.whenCancel;
          throw DioException(
            requestOptions: RequestOptions(path: url),
            type: DioExceptionType.cancel,
          );
        },
      );
      addTearDown(updater.dispose);
      final fut = updater.start(_info);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      updater.cancel();
      await fut;
      expect(updater.value.phase, AppUpdatePhase.cancelled);
    });

    test('نصبِ موفق done و نصبِ ناموفق error می‌دهد', () async {
      Future<AppUpdater> ready({AppUpdateInstall? install}) async {
        final dir = await _tempDir();
        addTearDown(() => dir.deleteSync(recursive: true));
        final updater = AppUpdater(
          targetDir: dir,
          download: _fakeDownload([7, 7, 7]),
          install: install,
        );
        addTearDown(updater.dispose);
        await updater.start(_info);
        expect(updater.value.phase, AppUpdatePhase.readyToInstall);
        return updater;
      }

      var installed = 0;
      final ok = await ready(install: (_) async => installed++);
      await ok.install();
      expect(ok.value.phase, AppUpdatePhase.done);
      expect(installed, 1);

      final bad = await ready(
        install: (_) async => throw Exception('نصب‌کننده باز نشد'),
      );
      await bad.install();
      expect(bad.value.phase, AppUpdatePhase.error);
      expect(bad.value.errorCode, 'install');
    });

    test('نبودِ اجازه، نصب را به صفحهٔ تک‌کلید می‌برد نه به خطا', () async {
      final dir = await _tempDir();
      addTearDown(() => dir.deleteSync(recursive: true));
      var calls = 0;
      final updater = AppUpdater(
        targetDir: dir,
        download: _fakeDownload([9, 9]),
        install: (_) async {
          calls++;
          throw const InstallPermissionNeeded();
        },
      );
      addTearDown(updater.dispose);
      await updater.start(_info);
      await updater.install();
      expect(updater.value.phase, AppUpdatePhase.needsPermission);
      expect(calls, 1);
      // برگشت از صفحهٔ اجازه: دوباره نصب صدا زده می‌شود.
      await updater.install();
      expect(calls, 2);
      expect(updater.value.phase, AppUpdatePhase.needsPermission);
    });

    test('نصب از مرحلهٔ نامرتبط نادیده گرفته می‌شود', () async {
      final dir = await _tempDir();
      addTearDown(() => dir.deleteSync(recursive: true));
      var installed = 0;
      final updater = AppUpdater(
        targetDir: dir,
        download: _fakeDownload([1]),
        install: (_) async => installed++,
      );
      addTearDown(updater.dispose);
      // بدونِ دانلود — باید هیچ کاری نکند.
      await updater.install();
      expect(installed, 0);
      expect(updater.value.phase, AppUpdatePhase.idle);
    });

    test('شروعِ دوباره وسطِ کار نادیده ولی بعد از خطا ممکن است', () async {
      final dir = await _tempDir();
      addTearDown(() => dir.deleteSync(recursive: true));
      var calls = 0;
      final updater = AppUpdater(
        targetDir: dir,
        download: _fakeDownload([1, 2], onCall: () => calls++),
      );
      addTearDown(updater.dispose);
      // هر دو هم‌زمان شروع می‌کنند؛ فقط یکی باید دانلود کند.
      await Future.wait([
        updater.start(const AppUpdateInfo(
          version: '1.1.20',
          sizeBytes: 12345, // عمداً غلط تا به خطا برسیم
          url: 'https://example.invalid/app.apk',
        )),
        updater.start(const AppUpdateInfo(
          version: '1.1.20',
          sizeBytes: 12345,
          url: 'https://example.invalid/app.apk',
        )),
      ]);
      expect(calls, 1);
      expect(updater.value.phase, AppUpdatePhase.error);
      // «تلاش مجدد» بعد از خطا باید دوباره شروع شود.
      await updater.start(const AppUpdateInfo(
        version: '1.1.20',
        sizeBytes: 2,
        url: 'https://example.invalid/app.apk',
      ));
      expect(calls, 2);
      expect(updater.value.phase, AppUpdatePhase.readyToInstall);
    });

    test('نامِ فایل، نسخهٔ مخرب را خنثی می‌کند', () {
      const evil = AppUpdateInfo(
        version: '../../etc/cron.d/x',
        url: 'https://example.invalid/app.apk',
      );
      expect(evil.fileName.contains('/'), isFalse);
      expect(evil.fileName.contains('..'), isFalse);
      expect(evil.fileName.endsWith('.apk'), isTrue);
      expect(
        const AppUpdateInfo(url: 'u').fileName,
        'ghelgheli-latest.apk',
      );
    });
  });
}
