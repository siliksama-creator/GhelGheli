// ============================================================================
//  تست دروازهٔ راه‌اندازی — «صفحهٔ بارگذاری واقعی است، نه تأخیر ساختگی»
// ============================================================================
//
//   flutter test test/boot_controller_test.dart
//
// این فایل کوتاه است ولی حساس‌ترین بخش این قابلیت را می‌سنجد. بقیهٔ کد
// (انیمیشن، رنگ، متن) اگر خراب شود کاربر یک صفحهٔ زشت می‌بیند؛ اگر **این**
// خراب شود کاربر چند ثانیه بیشتر منتظر می‌ماند یا اصلاً وارد اپ نمی‌شود.
//
// چهار چیزی که قفل می‌شوند:
//
//   ۱. هیچ تأخیری که به کارِ واقعی گره نخورده باشد. کلِ زمانِ راه‌اندازی
//      باید «بیشترینِ کارِ واقعی و کفِ برند» باشد، نه جمعِ آن‌ها. تستِ
//      «کف با کار جمع نمی‌شود» همین را عدد به عدد ثابت می‌کند: اگر روزی
//      کسی `Future.wait` را به دو `await` پشت‌سرهم بشکند، این تست قرمز
//      می‌شود — وگرنه فقط کاربر متوجه می‌شود.
//   ۲. یک کارِ کُند (شبکهٔ کند) باید با تایم‌اوتِ خودش رها شود و دروازه
//      باز شود. کاربر روی اسپلش حبس نمی‌شود.
//   ۳. شکستِ کارِ غیرحیاتی = «با پیش‌فرض ادامه بده»، بی‌صدا برای کاربر و
//      ثبت‌شده برای ما.
//   ۴. شکستِ کارِ حیاتی = پرسیدن، نه حدس‌زدن؛ و «رد کردن» باید بی‌درنگ
//      از صفحه بگذرد.

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/core/boot_controller.dart';

BootTask _task(
  BootStage stage, {
  Future<void> Function()? run,
  bool critical = false,
  Duration timeout = const Duration(seconds: 3),
  String label = 'کار',
}) =>
    BootTask(
      stage: stage,
      label: label,
      critical: critical,
      timeout: timeout,
      run: run ?? () async {},
    );

void main() {
  group('دروازهٔ راه‌اندازی', () {
    test('پیشرفت فقط با تمام‌شدنِ کارها بالا می‌رود، نه با گذرِ زمان',
        () async {
      final gate = BootController(
        tasks: [
          _task(BootStage.session, critical: true),
          _task(BootStage.config),
          _task(BootStage.audio),
          _task(BootStage.art),
        ],
        isAuthenticated: () => false,
        minimumBrand: Duration.zero,
      );

      // پیش از شروع: صفر.
      expect(gate.progress.value, 0);

      final future = gate.start();
      // همان لحظه که موتور فقط «میکروتسک» اجرا کرده، باید یک پله بالا رفته
      // باشد — کارها فوری‌اند. اگر نوار با تایمر پر می‌شد، اینجا صفر
      // می‌ماند.
      await Future<void>.delayed(Duration.zero);
      expect(gate.progress.value, greaterThan(0));

      await future;
      expect(gate.progress.value, 1);
      expect(gate.finished.value, true);
    });

    test('کفِ برند با کارِ واقعی جمع نمی‌شود (کارِ کندتر، صفر اضافه)',
        () async {
      // کارِ ۱۲۰ms با کفِ ۷۰۰ms. اگر کد اشتباه جمع می‌کرد، ۸۲۰ms می‌شد.
      final gate = BootController(
        tasks: [
          _task(BootStage.session, critical: true, run: () async {
            await Future<void>.delayed(const Duration(milliseconds: 120));
          }),
        ],
        isAuthenticated: () => true,
        minimumBrand: const Duration(milliseconds: 700),
      );

      // ⚠️ توجه: در این تست `minimumBrand` از زمانِ واقعی هم بلندتر است،
      // پس نتیجه باید ~۷۰۰ms باشد نه ۸۲۰ms. این همان «یک بار پرداخت، نه
      // دو بار» است. بازهٔ ۲۰ms برای نویزِ زمان‌بندیِ CI باز گذاشته شده.
      final sw = Stopwatch()..start();
      final result = await gate.start();
      sw.stop();

      expect(result.elapsed.inMilliseconds, lessThan(800),
          reason: 'کفِ برند نباید روی زمانِ کار اضافه شود');
      expect(sw.elapsed.inMilliseconds, greaterThanOrEqualTo(690));
    });

    test('کفِ برند وقتی کارها سریع‌اند اعمال می‌شود', () async {
      final gate = BootController(
        tasks: [_task(BootStage.session, critical: true)],
        isAuthenticated: () => false,
        minimumBrand: const Duration(milliseconds: 300),
      );

      final sw = Stopwatch()..start();
      await gate.start();
      sw.stop();
      expect(sw.elapsed.inMilliseconds, greaterThanOrEqualTo(290));
    });

    test('کارِ کُند با تایم‌اوتِ خودش رها می‌شود و دروازه باز می‌شود',
        () async {
      final gate = BootController(
        tasks: [
          _task(BootStage.session, critical: true),
          // شبکه‌ای که هرگز جواب نمی‌دهد.
          _task(
            BootStage.config,
            timeout: const Duration(milliseconds: 150),
            run: () => Completer<void>().future,
          ),
        ],
        isAuthenticated: () => true,
        minimumBrand: Duration.zero,
      );

      final result = await gate.start().timeout(
            const Duration(seconds: 2),
            onTimeout: () => throw StateError('دروازه گیر کرد — کاربر حبس شد'),
          );

      expect(result.failures, contains(BootStage.config));
      expect(result.degraded, isTrue);
      // کارِ حیاتی سالم بود، پس کاربر نباید چیزی ببیند.
      expect(result.authenticated, isTrue);
      expect(gate.progress.value, 1);
    });

    test('شکستِ کارِ حیاتی می‌پرسد؛ «رد کردن» بی‌درنگ می‌گذرد', () async {
      var attempts = 0;
      final gate = BootController(
        tasks: [
          _task(
            BootStage.session,
            critical: true,
            run: () async {
              attempts += 1;
              throw StateError('حافظهٔ محلی خوانده نشد');
            },
          ),
        ],
        isAuthenticated: () => false,
        minimumBrand: Duration.zero,
      );

      final future = gate.start();
      // کمی صبر تا کار شکست بخورد و دروازه به حالتِ تصمیم برسد.
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(gate.notice.value, isNotNull,
          reason: 'کاربر باید بداند چیزی نیامد و بتواند تصمیم بگیرد');

      expect(gate.result, isNull, reason: 'تا تصمیمِ کاربر، مسیر انتخاب نشده');

      gate.skip();
      final result = await future;
      expect(result.failures, contains(BootStage.session));
      expect(attempts, 1, reason: '«رد کردن» نباید کار را دوباره اجرا کند');
    });

    test('«تلاش دوباره» همان کار را دوباره اجرا می‌کند', () async {
      var attempts = 0;
      final gate = BootController(
        tasks: [
          _task(
            BootStage.session,
            critical: true,
            run: () async {
              attempts += 1;
              if (attempts == 1) throw StateError('بار اول نشد');
            },
          ),
        ],
        isAuthenticated: () => true,
        minimumBrand: Duration.zero,
      );

      final future = gate.start();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(gate.notice.value, isNotNull);

      gate.retry();
      // ⚠️ همان Futureِ اول. نسخهٔ اولِ کنترلر روی «تلاش دوباره» یک اجرای
      // تازه می‌ساخت و این `await` تا ابد معلق می‌ماند؛ این تست همان
      // بن‌بست را می‌گیرد.
      final result = await future.timeout(
        const Duration(seconds: 2),
        onTimeout: () => throw StateError(
            'تلاش دوباره فراخوانِ اول را معلق گذاشت'),
      );
      expect(result.failures, isEmpty,
          reason: 'تلاش دوم موفق بود، پس نباید شکستی ثبت شود');
      expect(attempts, 2);
      expect(result.authenticated, isTrue);
    });

    test('شکستِ کارِ غیرحیاتی کاربر را متوقف نمی‌کند', () async {
      final gate = BootController(
        tasks: [
          _task(BootStage.session, critical: true),
          _task(BootStage.audio, run: () async => throw StateError('صدا نیامد')),
          _task(BootStage.art, run: () async => throw StateError('تصویر نیامد')),
        ],
        isAuthenticated: () => true,
        minimumBrand: Duration.zero,
      );

      final result = await gate.start();
      expect(result.failures, containsAll([BootStage.audio, BootStage.art]));
      expect(result.authenticated, isTrue);
      expect(gate.notice.value, isNull,
          reason: 'چیزی که کاربر نمی‌تواند کاری درباره‌اش بکند را نمی‌پرسیم');
    });

    test('متنِ مرحله گلوگاه را نشان می‌دهد و عقب برنمی‌گردد', () async {
      final slow = Completer<void>();
      final gate = BootController(
        tasks: [
          _task(BootStage.session,
              critical: true,
              label: 'مرحله ۱',
              run: () => slow.future),
          _task(BootStage.config, label: 'مرحله ۲'),
        ],
        isAuthenticated: () => false,
        minimumBrand: Duration.zero,
      );

      final future = gate.start();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      // کارِ دوم تمام شده ولی کارِ اول (حیاتی) هنوز در جریان است: متن باید
      // همان کارِ در جریان باشد، نه کارِ بعدی که هنوز شروعِ کارش نکرده.
      expect(gate.label.value, 'مرحله ۱');
      expect(gate.stage.value, BootStage.session);

      slow.complete();
      await future;
      expect(gate.label.value, '');
      expect(gate.stage.value, isNull,
          reason: 'بعد از پایان، هیچ مرحله‌ای «در انتظار» نیست');
    });

    test('مسیر از خودِ نشستِ بازیابی‌شده می‌آید', () async {
      var token = false;
      final gate = BootController(
        tasks: [
          _task(BootStage.session, critical: true, run: () async {
            token = true;
          }),
        ],
        isAuthenticated: () => token,
        minimumBrand: Duration.zero,
      );
      final result = await gate.start();
      expect(result.authenticated, isTrue);
    });

    test('start() دوباره‌صدا‌زده‌شده یک اجرا می‌سازد، نه دو', () async {
      var runs = 0;
      final gate = BootController(
        tasks: [
          _task(BootStage.session, critical: true, run: () async {
            runs += 1;
            await Future<void>.delayed(const Duration(milliseconds: 30));
          }),
        ],
        isAuthenticated: () => false,
        minimumBrand: Duration.zero,
      );

      final a = gate.start();
      final b = gate.start();
      await Future.wait([a, b]);
      expect(runs, 1, reason: 'دو دروازهٔ هم‌زمان یعنی دو درخواستِ config');
    });
  });
}
