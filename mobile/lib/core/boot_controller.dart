// دروازهٔ واقعیِ راه‌اندازیِ اپ — خواستهٔ مالک (۲۷ شهریور)
// ═══════════════════════════════════════════════════════════════════════════
//
// «صفحهٔ بارگذاری باید واقعی باشد، نه یک تأخیرِ ساختگی.»
//
// تا امروز سه چیزِ متفاوت وقتِ راه‌اندازی صرف می‌کردند و هیچ‌کدام به کاربر
// گفته نمی‌شد:
//
//   ۱. `api.loadToken()` — بازیابیِ توکن از حافظهٔ محلی (در `main.dart`،
//      و **تنها** چیزی که صفحهٔ اسپلش منتظرش می‌ماند)؛
//   ۲. `AppConfig.instance.ensure(api)` — تنظیماتِ زندهٔ پنل از سرور که
//      `unawaited` بود، یعنی صفحهٔ اول با پیش‌فرض‌های کد بالا می‌آمد و
//      ممکن بود بعداً یک پرشِ متن/رنگ اتفاق بیفتد. متنِ اسپلش چنین بود
//      که کاربر حرفِ پنل را می‌خواند و وسطِ خواندن، جمله عوض می‌شد؛
//   ۳. گرم‌کردنِ صدا و دارایی‌های برند که هیچ‌کس منتظرشان نبود.
//
// این کلاس هر سه را زیرِ یک «دروازه» می‌آورد و دو قاعدهٔ سخت دارد:
//
//   • **هر کار تایم‌اوت دارد.** یک درخواستِ شبکه‌ای که هرگز جواب نمی‌دهد
//     نباید کاربر را روی اسپلش حبس کند. شکستِ یک کارِ غیرحیاتی یعنی
//     «با پیش‌فرض ادامه بده»، نه «منتظر بمان».
//   • **پیشرفت از کارِ واقعی می‌آید.** `progress` فقط با تمام‌شدنِ کارها
//     بالا می‌رود؛ هیچ تایمری آن را پر نمی‌کند. تنها استثنا `minimumBrand`
//     است: یک کفِ ۷۰۰ میلی‌ثانیه‌ای تا انیمیشنِ ورود فرصتِ دیده‌شدن
//     داشته باشد (خواستهٔ مالک: هر اجرا کاملِ سینمایی). این عدد **فقط
//     زمانِ اضافه را پر می‌کند و هرگز با کارِ واقعی جمع نمی‌شود**:
//     کارها و کف، موازی‌اند، پس کلِ راه‌اندازی = بیشترینِ این دو.
//
// ⚠️ این فایل عمداً هیچ ارجاعی به `ApiClient` ندارد. کارها از بیرون تزریق
//    می‌شوند؛ یعنی می‌شود رفتارش را — تایم‌اوت، شکست، تصمیمِ کاربر —
//    بدونِ شبکه و بدونِ اپِ کامل تست کرد. (تستِ `boot_controller_test.dart`
//    همین کار را می‌کند.)

import 'dart:async';

import 'package:flutter/foundation.dart';

/// شناسهٔ مرحله‌های راه‌اندازی. ترتیبِ اعلام، ترتیبِ نمایشِ متن است.
enum BootStage {
  /// بازیابیِ نشستِ ذخیره‌شده — تنها کارِ **حیاتی**.
  session,

  /// تنظیماتِ زنده (متن، رنگ، اعداد) از سرور.
  config,

  /// ترجیحِ صدا و گرم‌کردنِ پخش‌کننده.
  audio,

  /// رمزگشاییِ لوگوی بزرگِ اسپلش، تا لحظهٔ انتقال به صفحهٔ ورود پرش نکند.
  art,
}

/// یک کارِ راه‌اندازی.
class BootTask {
  const BootTask({
    required this.stage,
    required this.label,
    required this.run,
    this.critical = false,
    this.timeout = const Duration(milliseconds: 2500),
  });

  final BootStage stage;

  /// متنِ فارسیِ روی صفحه، به زبانِ برند (کارت، زمین، لیگ) — نه «در حال
  /// بارگذاری» که زبانِ یک پنلِ ادمین است.
  final String label;

  final Future<void> Function() run;

  /// کارِ حیاتی: شکستش یعنی «نمی‌دانیم کاربر وارد شده یا نه» و باید از
  /// کاربر پرسیده شود. کارِ غیرحیاتی: با پیش‌فرض ادامه می‌دهیم.
  final bool critical;

  final Duration timeout;
}

/// نتیجهٔ دروازه.
class BootResult {
  const BootResult({
    required this.authenticated,
    required this.failures,
    required this.elapsed,
  });

  /// از **خودِ** کارِ بازیابیِ نشست می‌آید، نه از یک بررسیِ دوباره. یعنی
  /// شاخهٔ «خانه یا ورود» هیچ‌وقت از دروازه جدا نمی‌شود.
  final bool authenticated;

  /// مرحله‌هایی که شکست خوردند یا تایم‌اوت شدند.
  final List<BootStage> failures;

  /// چقدر طول کشید — برای گزارشِ خطا و برای اینکه بشود ثابت کرد صفحه
  /// بیشتر از کارِ واقعی چیزی نگاه نداشته.
  final Duration elapsed;

  bool get degraded => failures.isNotEmpty;
}

class BootController extends ChangeNotifier {
  BootController({
    required this.tasks,
    required this.isAuthenticated,
    this.minimumBrand = const Duration(milliseconds: 700),
  }) : assert(tasks.isNotEmpty, 'دروازه بدونِ کار معنا ندارد');

  final List<BootTask> tasks;

  /// بازتابِ نتیجهٔ **واقعیِ** بازیابیِ نشست (خواستهٔ طرح: شاخهٔ مسیر نباید
  /// یک بررسیِ جداگانهٔ هاردکدشده باشد).
  final bool Function() isAuthenticated;

  /// کفِ لحظهٔ برند. تنها چیزی که در راه‌اندازی «زمانِ ساختگی» است و
  /// صادقانه: ۷۰۰ms، فقط وقتی کارها سریع‌تر تمام شده باشند.
  final Duration minimumBrand;

  /// ۰ تا ۱، فقط از تمام‌شدنِ کارهای واقعی.
  final ValueNotifier<double> progress = ValueNotifier<double>(0);

  /// مرحله‌ای که **در انتظار** است (نه آخرین چیزی که شروع شد). برای
  /// تشخیصِ «دروازه شروع شده» هم از همین استفاده می‌شود.
  final ValueNotifier<BootStage?> stage = ValueNotifier<BootStage?>(null);

  /// متنِ فارسیِ روی صفحه.
  final ValueNotifier<String> label = ValueNotifier<String>('');

  final ValueNotifier<bool> finished = ValueNotifier<bool>(false);

  /// وقتی پر است، صفحه به‌جای نوارِ پیشرفت کارتِ «تلاش دوباره / رد کن»
  /// نشان می‌دهد. هرگز روی صفحه قفل نمی‌شویم.
  final ValueNotifier<String?> notice = ValueNotifier<String?>(null);

  BootResult? _result;
  BootResult? get result => _result;

  /// یک اجرای هم‌زمان. `start()` دوباره‌صدا‌زده‌شده همان Future را برمی‌گرداند؛
  /// پس اگر ویجت دوباره ساخته شود، دو دروازه روی هم نمی‌افتند (که یعنی دو
  /// بار درخواستِ تنظیمات و دو بار رقابت روی `progress`).
  Future<BootResult>? _inFlight;

  /// تصمیمِ کاربر در حالتِ خرابی.
  Completer<bool>? _decision;

  Future<BootResult> start() => _inFlight ??= _run();

  Future<BootResult> _run() async {
    final stopwatch = Stopwatch()..start();
    final failures = <BootStage>[];

    // ⚠️ «تلاش دوباره» عمداً **حلقه** است و نه فراخوانیِ دوبارهٔ `_run()`.
    //
    // نسخهٔ اول روی حالتِ تصمیم، تابع را از نو صدا می‌زد و `_inFlight` را پاک
    // می‌کرد. نتیجه این بود که فراخوان‌کنندهٔ اولی (که `await start()` کرده
    // بود) روی Futureِ قدیمی معلق می‌ماند و **هرگز** جواب نمی‌گرفت — یعنی
    // یک بن‌بستِ کامل در مسیری که خودش برای نجاتِ کاربر ساخته شده بود.
    // حالا یک Future، چند تلاش: هر بار که کاربر «تلاش دوباره» می‌زند،
    // همین تابع از سرِ حلقه ادامه می‌دهد.
    while (true) {
      failures.clear();
      progress.value = 0;

      // کارهای باقی‌مانده، به ترتیبِ اعلام.
      final pending = <BootTask>[...tasks];
      var done = 0;

      /// متنِ روی صفحه = **گلوگاهِ** دروازه.
      ///
      /// کارها موازی‌اند، پس «آخرین کاری که شروع شد» بی‌معنی است: هر چهار
      /// کار تقریباً هم‌زمان شروع می‌شوند و متن تا آخر روی «چمن» گیر می‌کند.
      /// به‌جایش، قدیمی‌ترین کارِ تمام‌نشده را نشان می‌دهیم. نتیجه در حالتِ
      /// عادی همان ترتیبِ اعلام است (نشست → قوانینِ زمین → صدا → چمن) و
      /// هیچ‌وقت عقب برنمی‌گردد؛ و اگر یک کارِ اول کُند باشد، متن هم همان
      /// چیزی را می‌گوید که واقعاً منتظرش هستیم.
      void refresh() {
        final next = pending.isEmpty ? null : pending.first;
        stage.value = next?.stage;
        label.value = next?.label ?? '';
      }

      refresh();

      // کفِ لحظهٔ برند، موازی با کارها. `Future.delayed` بی‌خطر است چون
      // اینجا هیچ تایمری روی ویجت گره نمی‌خورد؛ دروازه در `dispose` نشتیِ
      // تایمر ندارد (و `boot_controller_test` هم همین را چک می‌کند).
      final brandFloor = Future<void>.delayed(minimumBrand);

      await Future.wait(tasks.map((task) async {
        try {
          await task.run().timeout(task.timeout);
        } catch (_) {
          // شکست و تایم‌اوت اینجا یکی می‌شوند: از دیدِ کاربر هر دو یعنی
          // «این بخش نیامد»، و هر دو باید دروازه را باز کنند.
          failures.add(task.stage);
        } finally {
          pending.remove(task);
          done += 1;
          // هرگز عقب نمی‌رویم: یک کار که بعد از تایم‌اوت «موفق» شود نباید
          // نوار را برگرداند.
          final next = (done / tasks.length).clamp(0.0, 1.0);
          if (next > progress.value) progress.value = next;
          refresh();
        }
      }));

      if (failures.where(_isCritical).isEmpty) {
        // باقی‌ماندهٔ کفِ برند. اگر کارها طولانی‌تر بودند، این خط فوراً رد
        // می‌شود و صفر میلی‌ثانیه اضافه می‌کند.
        await brandFloor;
        break;
      }

      // ── حالتِ تصمیم ──
      //
      // فقط کارِ حیاتی این حالت را می‌سازد. مثلاً اگر خواندنِ توکن از حافظهٔ
      // محلی شکست بخورد، نمی‌دانیم کاربر وارد شده یا نه؛ رفتن به خانهٔ خالی
      // یا به صفحهٔ ورودِ اشتباه، هر دو بدتر از یک سؤالِ کوتاه است.
      notice.value = 'ارتباط برقرار نشد — بدونِ اطلاعاتِ ذخیره‌شده ادامه بدهیم؟';
      final again = await (_decision = Completer<bool>()).future;
      _decision = null;
      notice.value = null;
      if (!again) {
        await brandFloor;
        break;
      }
      // «تلاش دوباره»: از سرِ حلقه. نوار از صفر شروع می‌شود — عمداً، چون
      // کاربر دارد یک راه‌اندازیِ تازه را می‌بیند و نوارِ نیمه‌پُرِ قبلی
      // دروغ می‌گفت.
    }

    stopwatch.stop();

    _result = BootResult(
      authenticated: isAuthenticated(),
      failures: failures,
      elapsed: stopwatch.elapsed,
    );
    progress.value = 1;
    // بعد از پایان، هیچ مرحله‌ای «در انتظار» نیست. (حلقهٔ `_run` هر بار
    // فقط متنِ کارِ جاری را می‌نویسد؛ این دو خط، حالتِ پایانی را صریح
    // می‌کنند — صفحه از `stage != null` برای «آیا دروازه شروع شده»
    // استفاده می‌کند و نباید بعد از پایان هم true بماند.)
    stage.value = null;
    label.value = '';
    finished.value = true;

    if (failures.isNotEmpty) {
      // شکستِ غیرحیاتی بی‌صدا نمی‌ماند — ولی کاربر را معطل نمی‌کند.
      debugPrint('[boot] کارهای ناتمام: ${failures.map((f) => f.name).join(', ')}');
    }
    return _result!;
  }

  bool _isCritical(BootStage s) => tasks.any((t) => t.stage == s && t.critical);

  /// «تلاش دوباره» از کارتِ خرابی.
  void retry() => _decision?.complete(true);

  /// «رد کردن» — با پیش‌فرض‌ها ادامه بده.
  void skip() => _decision?.complete(false);

  @override
  void dispose() {
    progress.dispose();
    stage.dispose();
    label.dispose();
    finished.dispose();
    notice.dispose();
    super.dispose();
  }
}
