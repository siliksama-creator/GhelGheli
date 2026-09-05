// GhelGheli — Flutter mobile app entry point.
//
// This file only wires together app-level concerns (theming, locale,
// routing between auth / user / admin shells). All screen implementations
// live under lib/screens, reusable UI primitives under lib/widgets, and the
// design system under lib/theme — see ARCHITECTURE.md for the full map.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/admin/admin_shell.dart';
import 'screens/user/home_shell.dart';
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
  runApp(const GhelGheliApp());
}

class GhelGheliApp extends StatefulWidget {
  const GhelGheliApp({super.key});

  @override
  State<GhelGheliApp> createState() => _GhelGheliAppState();
}

class _GhelGheliAppState extends State<GhelGheliApp> {
  final ApiClient api = ApiClient();
  bool _ready = false;

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
    // Restore the saved mute preference before any game can play a sound.
    GameAudio.instance.load();
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
    api.loadToken().whenComplete(() {
      if (mounted) setState(() => _ready = true);
    });
    // config عمومی است (بدونِ توکن)، پس معطلِ توکن نمی‌مانیم. اگر این
    // درخواست با fetchِ HomeShell هم‌زمان شود، پنجرهٔ ۱.۲ ثانیه‌ایِ
    // ApiClient آن را ادغام می‌کند: دو فراخوانی = یک درخواستِ واقعی.
    unawaited(AppConfig.instance.ensure(api));
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
      home: !_ready
          ? const SplashScreen()
          : api.token == null
          ? AuthScreen(api: api, onDone: _refresh)
          : api.isAdmin
          ? AdminShell(api: api, onLogout: _logout)
          : HomeShell(api: api, onLogout: _logout),
    );
  }
}
