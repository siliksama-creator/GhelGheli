// واکنش به فشارِ حافظه — با ارسالِ رخدادِ واقعیِ سیستم.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// نگرانیِ اصلیِ مالک این بود که اپ در بازی‌ها کرش کند یا کند شود. یکی
// از مسیرهای واقعیِ آن کرش این است:
//
//   ۱. رمِ گوشی کم می‌آید،
//   ۲. اندروید `onTrimMemory` می‌فرستد — آخرین فرصتِ اپ برای پس دادنِ
//      حافظه،
//   ۳. اپ نادیده می‌گیرد،
//   ۴. سیستم چیزی برای بازپس‌گیری پیدا نمی‌کند و اپ را می‌کشد.
//
// کاربر این را «اپ خودش بسته شد» می‌بیند. روی گوشیِ ۲ گیگابایتی که
// مخاطبِ اصلیِ این اپ است، این واقعاً رخ می‌دهد.
//
// این تست‌ها رخدادِ واقعیِ چرخهٔ عمر را از طریق `binding` می‌فرستند —
// نه اینکه متد را دستی صدا بزنند — تا ثابت شود سیم‌کشی هم درست است،
// نه فقط منطق.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/core/memory_guard.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    MemoryGuard.instance.uninstall();
    MemoryGuard.instance.install();
  });

  tearDown(() {
    MemoryGuard.instance.uninstall();
    PaintingBinding.instance.imageCache.clear();
  });

  group('MemoryGuard به سیستم گوش می‌دهد', () {
    test('نصبِ دوباره ناظرِ تکراری نمی‌سازد', () {
      // یک ناظرِ تکراری یعنی هر رخداد دو بار پردازش می‌شود — بی‌ضرر
      // به‌نظر می‌رسد ولی در `uninstall` فقط یکی برداشته می‌شود و
      // بقیه نشت می‌کنند.
      MemoryGuard.instance.install();
      MemoryGuard.instance.install();
      binding.handleMemoryPressure();
      expect(MemoryGuard.instance.pressureEvents, 1,
          reason: 'رخداد باید دقیقاً یک بار پردازش شود');
    });

    testWidgets('فشارِ حافظه کشِ تصویر را واقعاً خالی می‌کند',
        (tester) async {
      final cache = PaintingBinding.instance.imageCache;

      // کش را با چند ورودیِ ساختگی پر کن.
      final img = await _tinyImage();
      for (var i = 0; i < 5; i++) {
        cache.putIfAbsent(
          'k$i',
          () => OneFrameImageStreamCompleter(
            Future.value(ImageInfo(image: img.clone())),
          ),
        );
      }
      await tester.pump();
      expect(cache.currentSize, greaterThan(0),
          reason: 'ابتدا باید چیزی در کش باشد وگرنه تست چیزی نمی‌سنجد');

      binding.handleMemoryPressure();

      expect(MemoryGuard.instance.pressureEvents, 1);
      expect(cache.currentSize, 0,
          reason: 'کش باید کاملاً خالی شود — این آخرین فرصتِ اپ پیش از '
              'کشته شدن است');
      expect(cache.liveImageCount, 0,
          reason: 'تصاویرِ زنده هم باید رها شوند، وگرنه در یک صفحهٔ پر '
              'از تصویر بخش بزرگی از حافظه دست‌نخورده می‌ماند');
    });

    testWidgets('رفتن به پس‌زمینه فقط تصاویرِ زنده را رها می‌کند',
        (tester) async {
      // ═══════════════════════════════════════════════════════════════
      // چرا این با حالتِ فشار فرق دارد
      // ═══════════════════════════════════════════════════════════════
      //
      // کاربر معمولاً از پس‌زمینه برمی‌گردد. اگر هر بار جابه‌جایی بین
      // اپ‌ها کل کش را پاک می‌کردیم، بازگشت کند و پرش‌دار می‌شد —
      // یعنی یک بهینه‌سازیِ حافظه که تجربه را خراب می‌کند.
      final cache = PaintingBinding.instance.imageCache;
      final img = await _tinyImage();
      cache.putIfAbsent(
        'bg',
        () => OneFrameImageStreamCompleter(
          Future.value(ImageInfo(image: img.clone())),
        ),
      );
      await tester.pump();
      final before = cache.currentSize;

      binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);

      expect(MemoryGuard.instance.backgroundEvents, 1);
      expect(cache.liveImageCount, 0, reason: 'ارجاع‌های زنده رها می‌شوند');
      expect(cache.currentSize, before,
          reason: 'ولی خودِ کش نگه داشته می‌شود تا بازگشت روان بماند');
    });

    testWidgets('برگشتن به پیش‌زمینه چیزی را پاک نمی‌کند', (tester) async {
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(MemoryGuard.instance.backgroundEvents, 0,
          reason: 'فقط paused/detached باید واکنش داشته باشد');
    });

    test('uninstall ناظر را برمی‌دارد', () {
      // بدون این، هر بار نصب یک ناظرِ اضافه در WidgetsBinding می‌ماند.
      MemoryGuard.instance.uninstall();
      binding.handleMemoryPressure();
      expect(MemoryGuard.instance.pressureEvents, 0);
    });
  });

  group('سقفِ کشِ تصویر', () {
    test('در main تنظیم شده و منطقی است', () {
      final src = File('lib/main.dart').readAsStringSync();
      expect(src.contains('maximumSizeBytes = 40 << 20'), isTrue,
          reason: 'سقف ۴۰ مگابایت باید بماند — پیش‌فرضِ ۱۰۰ مگابایتیِ '
              'فلاتر گوشیِ کم‌رم را به GC churn می‌اندازد');
      expect(src.contains('MemoryGuard.instance.install()'), isTrue,
          reason: 'نگهبانِ حافظه باید در راه‌اندازی نصب شود');
    });
  });
}

/// کوچک‌ترین تصویرِ ممکن، برای پر کردنِ کش در تست.
Future<ui.Image> _tinyImage() async {
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawRect(
    const Rect.fromLTWH(0, 0, 1, 1),
    Paint()..color = const Color(0xFF000000),
  );
  return recorder.endRecording().toImage(1, 1);
}
