// GhelGheli — Flutter mobile app entry point.
//
// This file only wires together app-level concerns (theming, locale,
// routing between auth / user / admin shells). All screen implementations
// live under lib/screens, reusable UI primitives under lib/widgets, and the
// design system under lib/theme — see ARCHITECTURE.md for the full map.
import 'dart:async';

// `SystemChrome` / `SystemUiOverlayStyle` در `services.dart` هستند و
// `defaultTargetPlatform` در `foundation.dart`؛ هیچ‌کدام با importِ
// `material.dart` به‌تنهایی در دسترس نیستند (تحلیل‌گر آن‌ها را «تعریف‌نشده»
// می‌بیند). برای تنظیمِ نوارهای سیستم به هر دو نیاز داریم.
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'core/boot_controller.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/user/home_shell.dart';
// پوستهٔ ادمین عمداً import نشده: مدیریت فقط با پنل وب ادمین است و کد
// `lib/screens/admin/` از این اپ حذف شده. اگر روزی اپ ادمینِ داخلی خواستید،
// صفحات را از تاریخچهٔ گیت برگردان و اینجا پشتِ فلگِ `kIncludeAdmin` وصل کن
// (پیش‌فرض false؛ با --dart-define=INCLUDE_ADMIN=true روشن می‌شود). جزئیات:
// docs/ADMIN_PANEL_MOBILE_RETIREMENT.md.
import 'screens/user/games/game_audio.dart';
import 'core/app_config.dart';
import 'core/deep_links.dart';
import 'core/error_boundary.dart';
import 'core/memory_guard.dart';
import 'theme/app_theme.dart';

void main() {
  // Binding must exist before we touch platform channels below.
  WidgetsFlutterBinding.ensureInitialized();

  // ═══════════════════════════════════════════════════════════════════════
  // شبکهٔ ایمنیِ خطا — باید پیش از هر چیز دیگری نصب شود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // بدون این، دو چیز بی‌صدا اتفاق می‌افتاد:
  //
  //   ۱. هر خطای build در **ریلیز** یک مستطیلِ خاکستریِ خالی می‌شد،
  //      بدون متن و بدون هیچ راهِ خروجی. کاربر فقط می‌توانست اپ را
  //      ببندد.
  //   ۲. هر Future رهاشده‌ای که reject می‌کرد، کاملاً گم می‌شد.
  //
  // زودتر از `runApp` نصب می‌شود تا حتی خطای همان اولین فریم هم پوشش
  // داده شود.
  installErrorHandlers();

  // Decoded-image cache: the card artwork, avatars and game banners are
  // re-shown constantly while navigating. The default 100 MB budget is far
  // more than this app needs and pushes low-end devices into GC churn;
  // 40 MB / 200 entries keeps everything hot without the pressure.
  PaintingBinding.instance.imageCache
    ..maximumSizeBytes = 40 << 20
    ..maximumSize = 200;

  // ═══════════════════════════════════════════════════════════════════════
  // واکنش به فشارِ حافظهٔ سیستم
  // ═══════════════════════════════════════════════════════════════════════
  //
  // سقفِ بالا فقط می‌گوید «بیشتر از این نگیر». چیزی که کم بود، پس دادنِ
  // حافظه در لحظه‌ای است که سیستم درخواست می‌کند.
  //
  // اندروید پیش از کشتنِ اپ یک هشدار می‌فرستد (onTrimMemory). اپ آن را
  // نادیده می‌گرفت، پس سیستم چیزی برای بازپس‌گیری پیدا نمی‌کرد و
  // مستقیم اپ را می‌کشت — روی گوشیِ ۲ گیگابایتی که مخاطبِ اصلیِ این
  // اپ است، این واقعاً اتفاق می‌افتد و کاربر آن را «اپ خودش بسته شد»
  // می‌بیند.
  //
  // جزئیاتِ دو سطحِ واکنش در core/memory_guard.dart.
  MemoryGuard.instance.install();
  // متن/عددِ زنده (فاز ۲): گوش‌دادن به بازگشت از پس‌زمینه تا تغییری که
  // ادمین در پنل می‌دهد، در اپِ بازِ کاربر هم بنشیند. خودِ fetch در
  // `_GhelGheliAppState` وصل می‌شود، چون ApiClient همان‌جا ساخته می‌شود.
  AppConfig.instance.install();
  // گوش‌دادن به لینکِ دعوتِ اتاق (ghelgheli://join یا دامنهٔ وب). اگر
  // اپ از حالت سرد با لینک باز شود، کد اتاق برای صفحهٔ بازی‌ها ذخیره
  // می‌شود؛ اگر اپ باز باشد از استریم می‌رسد. شکستش بی‌اثر است.
  unawaited(DeepLinks.instance.start());

  // ═══════════════════════════════════════════════════════════════════════
  // نوارِ ناوبریِ خودِ گوشی (home / back / برنامه‌های اخیر)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // این برنامه هیچ تنظیمی روی نوارهای سیستم نداشت، پس اندروید آن‌ها را با
  // رنگِ پیش‌فرضِ خودش روی اپ می‌کشید: یک نوارِ مشکیِ بی‌ربط چسبیده به
  // نوارِ پایینِ قلقلی که هم با تمِ اپ جور نبود و هم ارتفاعِ مفیدِ صفحه
  // را می‌خورد.
  //
  // روی اندروید ۱۵ (API ۳۵) وضعیت بدتر هم می‌شود: سیستم برای اپ‌هایی که
  // ۳۵ را هدف گرفته‌اند «لبه‌به‌لبه» را **اجبار** می‌کند. یعنی اپ ما در
  // عمل همین حالا هم روی گوشی‌های جدید زیرِ نوارِ ناوبری رفته بود، و چون
  // هیچ جا فضای امن را رعایت نکرده‌ایم، نوارِ سیستم عملاً روی نوارِ پایین
  // افتاده و جلوی لمسِ آخرین تب را گرفته بود — همان «مانع می‌شود»ای که
  // گزارش شده.
  //
  // پس دو کار لازم است و هر دو انجام می‌شوند:
  //   ۱. اینجا: نوارها را شفاف کنیم تا رنگِ خودِ اپ از زیرشان رد شود
  //      (`contrastEnforced: false` لایهٔ خاکستری‌ای را که اندروید ۱۰+ برای
  //      خوانایی روی نوار می‌کشد حذف می‌کند).
  //   ۲. در شل: به اندازهٔ `MediaQuery.viewPaddingOf(context).bottom`
  //      padding بدهیم تا محتوا بالای ناوبریِ سیستم بماند.
  if (defaultTargetPlatform == TargetPlatform.android) {
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        systemStatusBarContrastEnforced: false,
        systemNavigationBarColor: Colors.transparent,
        systemNavigationBarDividerColor: Colors.transparent,
        systemNavigationBarContrastEnforced: false,
      ),
    );
  }

  runApp(const GhelGheliApp());
}

class GhelGheliApp extends StatefulWidget {
  const GhelGheliApp({super.key});

  @override
  State<GhelGheliApp> createState() => _GhelGheliAppState();
}

class _GhelGheliAppState extends State<GhelGheliApp> {
  final ApiClient api = ApiClient();

  /// دروازهٔ راه‌اندازی. تا وقتی `result` خالی است، صفحهٔ اسپلش روی است.
  late final BootController _boot;

  /// کلیدِ صفحهٔ اسپلش، برای صدا‌زدنِ خروجِ سینمایی پیش از تعویضِ صفحه.
  final GlobalKey<SplashScreenState> _splashKey =
      GlobalKey<SplashScreenState>();

  @override
  void initState() {
    super.initState();
    // منبعِ یکتای config: AppConfig همان ApiClientِ اپ را می‌گیرد (نه یک
    // کلاینتِ تازه) تا کشِ ETag و حذفِ تکرارِ درخواست بین همهٔ صفحه‌ها یکی
    // بماند — `home_shell_perf_test` و `etag_cache_test` دقیقاً همین را
    // می‌سنجند؛ کلاینتِ دوم یعنی دو درخواستِ config در هر اجرا.
    AppConfig.instance.attach(api);
    configureCrashReporter((source, message, stack) async {
      // صندوقِ کرشِ اول-شخصیِ کمینه-حریم‌خصوصی. خطای ارسال عمداً نادیده
      // گرفته می‌شود (در error_boundary) تا هرگز حلقهٔ کرش نسازد.
      //
      // گزارشِ مهمان هم فرستاده می‌شود: قبلاً «بدون توکن = اصلاً نفرست»
      // بود، اما مهم‌ترین خطاها همان‌هایی‌اند که قبل از ورود/ثبت‌نام روی
      // اولین تجربهٔ کاربر رخ می‌دهند؛ مسیرِ سرور حالا مهمان را با
      // user_id=NULL می‌پذیرد. توکن اگر حاضر باشد خودکار می‌رود.
      await api.post('/api/telemetry/crash', {
        'platform': 'android',
        'source': source,
        // APK رسمی این مقدار را با --dart-define از pubspec می‌گیرد
        // (build-apk.yml). مقدارِ پیش‌فرضِ ثابت اینجا یک‌بار روی 1.0.0+1
        // مانده بود و بعد روی 1.1.9+11 — هر بار نسخه بالا می‌رفت این عدد
        // جا می‌ماند و کرش‌ها به نسخهٔ اشتباه نسبت داده می‌شدند.
        //
        // به‌جای عددِ سومی که باز کهنه شود، صراحتاً می‌گوییم «نامشخص»:
        // یک ردیفِ unknown در صندوقِ کرش بی‌ضرر است، ولی ردیفی که به
        // نسخهٔ اشتباه چسبیده باشد تحلیل را گمراه می‌کند.
        'release': const String.fromEnvironment(
          'APP_RELEASE',
          defaultValue: 'android-unknown',
        ),
        'message': message,
        'stack': stack,
        // `configVersion` هم می‌آید (آینهٔ `main.jsx`): «این کرش از کدام
        // متن یا قاعده شروع شد» فقط وقتی قابلِ پاسخ‌دادن است که شمارهٔ
        // config در خودِ ردیف باشد. اگر config هرگز نرسیده باشد null
        // می‌فرستیم، نه ۰: ۰ یعنی «نسخهٔ صفر» و با یک configِ واقعی
        // اشتباه گرفته می‌شود.
        'context': {
          'screen': 'flutter',
          'guest': api.token == null,
          'configVersion': AppConfig.instance.configVersion,
        },
      });
    });
    // توکنِ منقضی نباید کاربر را در پوستهٔ خالی حبس کند.
    //
    // اگر سرور به هر درخواستی ۴۰۱ بدهد، ApiClient توکن مرده را پاک
    // می‌کند و این callback را می‌زند؛ یک setState کافی است تا build
    // دوباره اجرا شود، `api.token == null` ببیند و AuthScreen را نشان
    // دهد. بدون این، اپ برای همیشه HomeShell‌ای را نگه می‌داشت که هیچ
    // دیتایی نمی‌توانست بگیرد. توضیح کامل در api_client.dart.
    api.onSessionExpired = () {
      if (mounted) setState(() {});
    };
    // ═══════════════════════════════════════════════════════════════════
    // چرا `whenComplete` و نه `then`
    // ═══════════════════════════════════════════════════════════════════
    //
    // `then` فقط در مسیرِ موفقیت اجرا می‌شود. اگر `loadToken` پرتاب
    // می‌کرد، `_ready` هرگز true نمی‌شد و اپ **برای همیشه** روی صفحهٔ
    // Splash می‌ماند — بدون پیام، بدون دکمه، و تنها راهِ کاربر حذف و
    // نصب دوبارهٔ اپ بود.
    //
    // حالا `loadToken` خودش هم داخلاً catch دارد (توضیحش آنجاست)، ولی
    // این خط به آن تکیه نمی‌کند: `whenComplete` در هر دو مسیر اجرا
    // می‌شود، پس حتی اگر روزی آن catch برداشته شود، اپ باز بالا
    // می‌آید. دو لایهٔ دفاعی برای چیزی که شکستش یعنی اپِ کاملاً
    // غیرقابل‌استفاده.
    //
    // در بازنویسیِ دروازه (۲۷ شهریور) این خط عوض نشد — عمداً. تنها تفاوت
    // این است که Futureِ آن حالا به‌عنوان کارِ «نشست» به دروازه داده
    // می‌شود، پس همان گارانتی سرِ جایش می‌ماند و مسیر هم از خودِ آن
    // خوانده می‌شود.
    // ═══════════════════════════════════════════════════════════════════
    // دروازهٔ راه‌اندازی — «صفحهٔ بارگذاری باید واقعی باشد»
    // ═══════════════════════════════════════════════════════════════════
    //
    // چهار کار، موازی، هر کدام با تایم‌اوتِ خودش:
    //
    //   ۱. بازیابیِ نشست (حیاتی) — تنها کاری که مسیر را تعیین می‌کند؛
    //   ۲. تنظیماتِ زندهٔ پنل — تا جملهٔ اسپلش وسطِ خواندن عوض نشود و
    //      صفحهٔ اول با پیش‌فرض‌های کد بالا نیاید؛
    //   ۳. ترجیحِ قطعِ صدا — پیش از این رهاشده بود (`GameAudio.load()`
    //      بدونِ await)، یعنی تا وقتی حافظه می‌خواند ممکن بود یک صدای
    //      بازی روی گوشیِ بی‌صدا پخش شود (یا برعکس)؛
    //   ۴. گرم‌کردنِ تصویرهای صفحهٔ ورود — تا لحظهٔ انتقال، لوگو و پس‌زمینه
    //      از صفر رمزگشایی نشوند و پرشِ تصویری نداشته باشیم.
    //
    // `_boot.start()` همین‌جا صدا زده می‌شود، وگرنه انیمیشنِ ورودِ لوگو در
    // اسپلش تمام می‌شود و کاربر فقط فریمِ آخر را می‌بیند.
    final sessionRestore = api.loadToken().whenComplete(() {});
    _boot = BootController(
      tasks: [
        BootTask(
          stage: BootStage.session,
          critical: true,
          timeout: const Duration(seconds: 3),
          label: 'نشستِ بازیکن را روی زمین می‌گذاریم…',
          run: () => sessionRestore,
        ),
        BootTask(
          stage: BootStage.config,
          label: 'قوانینِ این فصل را از اتاقِ داور می‌گیریم…',
          run: () => AppConfig.instance.ensure(api),
        ),
        BootTask(
          stage: BootStage.audio,
          timeout: const Duration(milliseconds: 1500),
          label: 'صدای ورزشگاه را تنظیم می‌کنیم…',
          run: () => GameAudio.instance.load(),
        ),
        BootTask(
          stage: BootStage.art,
          timeout: const Duration(seconds: 2),
          label: 'چمنِ زمین را می‌کشیم…',
          run: _precacheArt,
        ),
      ],
      isAuthenticated: () => api.token != null,
    );
    // `start()` را here صدا می‌زنیم؛ نتیجه نگه داشته می‌شود تا اگر بعداً
    // کسی به `elapsed` یا فهرستِ کارهای ناتمام نگاه کند، از دست نرفته باشد.
    unawaited(_boot.start().then(_onBootFinished));
  }

  /// بعد از دروازه: یک بازسازی، تا `home:` مسیرِ درست را انتخاب کند.
  ///
  /// هیچ تصمیمِ مسیری اینجا گرفته نمی‌شود — `build` خودش از `api.token`
  /// می‌خواند. این تابع فقط می‌گوید «دروازه تمام شد، دوباره بکش».
  void _onBootFinished(BootResult result) {
    if (!mounted) return;
    _playSplashExit();
    // و از همین لحظه، گرم‌کردنِ پس‌زمینه‌ای — بدونِ اینکه کسی معطلش بماند.
    unawaited(_warmUpLoginArt());
    if (result.degraded) {
      // شکستِ کارِ غیرحیاتی: کاربر معطل نمی‌شود، ولی ردیفِ تشخیصی می‌ماند.
      // (`BootController` هم لاگ می‌کند؛ این خط برای کسی است که فهرستِ
      // مرحله‌ها را در گزارشِ خطا می‌خواهد.)
      debugPrint('[boot] ${result.elapsed.inMilliseconds}ms '
          'با ${result.failures.length} کارِ ناتمام');
    }
    setState(() {});
  }

  /// رمزگشاییِ زودهنگامِ **تصویرِ خودِ قهرمانِ صفحهٔ بارگذاری**.
  ///
  /// ⚠️ قاعده‌ای که با اندازه‌گیریِ زنده روی وب ثابت شد و اینجا هم حاکم است:
  /// **دروازه فقط تا وقتی بسته می‌ماند که کاری که کاربر می‌بیند تمام شود.**
  /// نسخهٔ اولِ این کار سه تصویر را داخلِ دروازه رمزگشایی می‌کرد؛ دو تای
  /// دیگر (لوگو و پس‌زمینهٔ صفحهٔ ورود) در صفحهٔ بارگذاری هیچ‌وقت دیده
  /// نمی‌شوند، پس نگه‌داشتنِ کاربر برایشان «تأخیرِ ساختاری» است، نه کارِ
  /// واقعی. آن دو به `_warmUpLoginArt` منتقل شدند که **بعد** از باز شدنِ
  /// دروازه و در پس‌زمینه اجرا می‌شود.
  ///
  /// تنها استثنا، همین یک تصویر است: قهرمانِ اسپلش، که کاربر دقیقاً همان را
  /// نگاه می‌کند و بدونِ آن اولین فریم خالی می‌ماند.
  Future<void> _precacheArt() async {
    // `precacheImage` به BuildContext نیاز دارد؛ اینجا نداریم. به‌جایش
    // مستقیم از کشِ تصویرِ موتور استفاده می‌کنیم — همان چیزی که
    // `precacheImage` هم انجام می‌دهد، بدونِ نیاز به ویجت.
    //
    // ✅ عددِ `width` باید **مو‌به‌مو** همان چیزی باشد که خودِ `AnimatedLogo`
    // در اسپلش می‌خواهد (`kSplashLogoCacheWidth`)، وگرنه کشِ تصویر آن را یک
    // ورودیِ جدا حساب می‌کند و همان کار دوباره انجام می‌شود — این بار
    // وسطِ انتقال.
    await _resolveOnce(
      const ResizeImage(
        AssetImage('assets/brand/logo_large.webp'),
        width: kSplashLogoCacheWidth,
        policy: ResizeImagePolicy.fit,
      ),
    );
  }

  /// گرم‌کردنِ پس‌زمینه‌ایِ تصویرهای صفحهٔ ورود.
  ///
  /// بعد از باز شدنِ دروازه اجرا می‌شود و **هیچ‌وقت** کسی منتظرش نمی‌ماند؛
  /// نتیجه‌اش اگر برسد، انتقال به صفحهٔ ورود نرم‌تر می‌شود و اگر نرسد، هیچ
  /// اتفاقی نمی‌افتد. (خطایش هم گرفته می‌شود تا به‌صورتِ خطای رهاشده در
  /// لاگ ننشیند.)
  Future<void> _warmUpLoginArt() async {
    try {
      await Future.wait(<Future<void>>[
        _resolveOnce(const ResizeImage(
          AssetImage('assets/brand/logo.webp'),
          width: 690, // 230 × 3 (بیشترین چگالیِ رایجِ گوشی‌ها)
          policy: ResizeImagePolicy.fit,
        )),
        _resolveOnce(const ResizeImage(
          AssetImage('assets/brand/login_hero.webp'),
          width: 360,
          policy: ResizeImagePolicy.fit,
        )),
      ]);
    } catch (_) {
      // گرم‌کردنِ اختیاری؛ شکستش نباید هیچ‌جا دیده شود.
    }
  }

  /// یک تصویر را در کش می‌نشاند و به‌محضِ آماده‌شدن برمی‌گردد.
  Future<void> _resolveOnce(ImageProvider provider) {
    final done = Completer<void>();
    late final ImageStreamListener listener;
    final stream = provider.resolve(ImageConfiguration.empty);
    listener = ImageStreamListener(
      (_, __) {
        stream.removeListener(listener);
        if (!done.isCompleted) done.complete();
      },
      onError: (_, __) {
        stream.removeListener(listener);
        if (!done.isCompleted) done.complete();
      },
    );
    stream.addListener(listener);
    return done.future;
  }

  /// خروجِ سینماییِ اسپلش.
  ///
  /// عمداً `await` نمی‌شود: انتقالِ `AnimatedSwitcher` هم‌زمان با آن شروع
  /// می‌شود، پس حرکتِ لوگو و محوشدنِ صفحه روی هم می‌افتند و یک توالیِ
  /// پیوسته می‌سازند، نه دو مرحلهٔ پشتِ‌سرهم. کلیدِ `_splashKey` بعد از
  /// تعویض بی‌اثر است (state حذف شده)، به همین دلیل `currentState` را
  /// چک می‌کنیم.
  void _playSplashExit() {
    final state = _splashKey.currentState;
    if (state != null) unawaited(state.exit());
  }

  Future<void> _refresh() async => setState(() {});

  Future<void> _logout() async {
    await api.logout();
    if (!mounted) return;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'قلقلی',
      debugShowCheckedModeBanner: false,
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // ═══════════════════════════════════════════════════════════════════
      // چرا فقط تمِ تیره
      // ═══════════════════════════════════════════════════════════════════
      //
      // تمِ روشن کاملاً حذف شد. دو دلیل:
      //
      //   ۱. منبعِ پایدارِ باگ بود. هر رنگی باید دو بار سنجیده می‌شد و
      //      در عمل نمی‌شد؛ ممیزیِ پیکسلیِ آخر چند متنِ ناخوانا **فقط**
      //      در تمِ روشن پیدا کرد. هر ویجتِ جدید یک شرطِ isDark لازم
      //      داشت که فراموش کردنش بی‌صدا خرابی می‌ساخت.
      //
      //   ۲. هویتِ بصریِ قلقلی تیره است — سبزِ نئونی و آبی روی
      //      سرمه‌ای. تمِ روشن هیچ‌وقت آن حس را نمی‌داد.
      //
      // `theme` هم به نسخهٔ تیره اشاره می‌کند تا اگر جایی از سیستم
      // (مثلاً یک دیالوگِ پلتفرمی) به `theme` نگاه کند، باز هم تیره
      // بگیرد و هرگز صفحهٔ سفید ندهد.
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      builder: (context, child) =>
          Directionality(textDirection: TextDirection.rtl, child: child!),
      home: _buildHome(),
    );
  }

  /// مسیرِ جاری.
  ///
  /// سه حالت، دو انتقال:
  ///
  ///   • **دروازه باز نشده** → صفحهٔ اسپلش (با دروازهٔ واقعی).
  ///   • **دروازه باز شد و توکن هست** → پوستهٔ کاربر، با انتقالِ
  ///     بزرگ‌شدنِ آرام (fade + scale). اینجا هیچ قابِ میانی و هیچ بازدیدِ
  ///     الکی از صفحهٔ ورود نیست — کاربرِ واردشده مستقیم به خانه می‌رود.
  ///   • **دروازه باز شد و توکن نیست** → صفحهٔ ورود. اسپلش پیش از رفتن،
  ///     خروجِ خودش را بازی می‌کند (لوگو بزرگ می‌شود و محو می‌شود) و
  ///     هم‌زمان برگهٔ ورود از پایین بالا می‌آید. یعنی لوگو «به داخلِ
  ///     صفحهٔ ورود می‌رود» و صفحه دورِ همان جای خالی ساخته می‌شود.
  Widget _buildHome() {
    final Widget screen;
    if (_boot.result == null) {
      screen = SplashScreen(key: _splashKey, boot: _boot);
    } else if (api.token == null) {
      screen = AuthScreen(api: api, onDone: _refresh);
    } else {
      // پنل ادمین از اپ موبایل حذف شده — مدیریت فقط با پنل وب است
      // (`docs/ADMIN_PANEL_MOBILE_RETIREMENT.md`). حتی اگر توکنِ ادمین
      // در حافظه مانده باشد، اپ همیشه پوستهٔ کاربر را نشان می‌دهد؛ هیچ
      // مسیری به پوستهٔ ادمین نمی‌رود (کد ادمین در بیلد tree-shake شد).
      screen = HomeShell(api: api, onLogout: _logout);
    }

    return AnimatedSwitcher(
      // ۴۲۰ms: کوتاه‌تر از این، تعویضِ صفحه «پرش» می‌شود؛ بلندتر، به‌نظر
      // می‌رسد اپ معطل مانده. هم‌زمان با خروجِ لوگو در اسپلش اجرا می‌شود،
      // پس مجموعِ تأخیرِ اضافه صفر است.
      duration: const Duration(milliseconds: 420),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      layoutBuilder: (current, previous) => Stack(
        alignment: Alignment.center,
        children: [...previous, if (current != null) current],
      ),
      transitionBuilder: (child, anim) {
        // بزرگ‌شدنِ آرام از ۰٫۹۷ + محوشدگی. صفحهٔ ورود یک سُرخوردنِ
        // کوچکِ رو به بالا هم می‌گیرد تا «ورود از پایین» حس شود و
        // لوگویِ در حالِ محو، مقصد داشته باشد.
        final isAuth = child.key == const ValueKey('auth');
        return FadeTransition(
          opacity: anim,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.97, end: 1).animate(anim),
            child: SlideTransition(
              position: Tween<Offset>(
                begin: isAuth ? const Offset(0, 0.03) : Offset.zero,
                end: Offset.zero,
              ).animate(anim),
              child: child,
            ),
          ),
        );
      },
      // کلیدها تعیین می‌کنند کدام ویجت «همان» است و کدام تازه. صفحهٔ اسپلش
      // باید یک‌بار ساخته و یک‌بار حذف شود؛ اگر کلید ثابت بماند، اسپلش و
      // صفحهٔ بعد به‌عنوان یک ویجت دیده می‌شوند و هیچ انتقالی اجرا نمی‌شود.
      child: KeyedSubtree(
        key: ValueKey(
          _boot.result == null ? 'splash' : (api.token == null ? 'auth' : 'home'),
        ),
        child: screen,
      ),
    );
  }
}
