import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  static const String defaultBaseUrl = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'https://api.ghelghelishop.ir');

  final Dio dio = Dio(BaseOptions(
    baseUrl: defaultBaseUrl,
    // Tightened from 12s: on a flaky mobile network a dead connection used to
    // hang the UI for 12 seconds before the user saw any error at all.
    connectTimeout: const Duration(seconds: 8),
    receiveTimeout: const Duration(seconds: 15),
    sendTimeout: const Duration(seconds: 20),
    // Ask for compressed responses — the league/chat payloads are pure JSON
    // and shrink dramatically over a slow mobile link.
    headers: {'Accept-Encoding': 'gzip'},
    // Let us handle non-2xx ourselves instead of paying for exception
    // construction on every expected 401/404.
    validateStatus: (code) => code != null && code < 500,
  ));

  String? token;
  bool isAdmin = false;
  // نقشِ ادمینِ واردشده ('super_admin' | 'support' | 'observer'). فقط
  // برای پنهان‌کردنِ صفحه/دکمه‌هایی است که بک‌اند در هر صورت ۴۰۳ می‌دهد؛
  // منبعِ حقیقتِ دسترسی سرور است. پیش‌فرض super_admin تا برای نشست‌های
  // قدیمی (که نقشی ذخیره نکرده‌اند) چیزی پنهان نشود.
  String adminRole = 'super_admin';
  bool get isSuperAdmin => adminRole == 'super_admin';

  /// صدا زده می‌شود وقتی سرور می‌گوید توکن دیگر معتبر نیست (۴۰۱).
  ///
  /// ═════════════════════════════════════════════════════════════════════
  /// چرا این وجود دارد — دومین علتِ «وارد اپ نمی‌شوم»
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// توکن کاربر ۳۰ روزه است (`JWT_EXPIRES_IN`). بعد از آن — یا اگر
  /// `JWT_SECRET` روی سرور عوض شود، یا حساب پاک/مسدود شود — گوشی هنوز یک
  /// رشتهٔ توکن در `SharedPreferences` دارد.
  ///
  /// جریان قبلی این بود:
  ///   main.dart می‌دید `api.token != null` → HomeShell را می‌ساخت →
  ///   HomeShell و داشبورد `/api/bootstrap` می‌زدند → سرور ۴۰۱ می‌داد →
  ///   هیچ‌جای اپ ۴۰۱ را مدیریت نمی‌کرد.
  ///
  /// نتیجه: کاربر **هرگز صفحهٔ ورود را نمی‌دید**. پوستهٔ اپ رندر می‌شد
  /// (نوار بالا و پایین)، وسط صفحه یا چرخنده بود یا بنر خطا، و تنها راه
  /// نجات دکمهٔ «خروج» بود که خیلی‌ها پیدایش نمی‌کردند — دقیقاً همان
  /// عکسی که مالک فرستاد: پوسته سالم، وسط خالی، نام کاربر خالی.
  ///
  /// وب‌اپ این را از اول درست داشت (`if (e.status === 401) logout()` در
  /// userweb/src/main.jsx) — فقط کلاینت موبایل جا افتاده بود.
  ///
  /// حالا هر ۴۰۱ روی یک مسیرِ نیازمندِ احراز هویت، توکنِ مرده را پاک
  /// می‌کند و اپ به صفحهٔ ورود برمی‌گردد؛ یعنی حالتِ بن‌بست غیرممکن
  /// می‌شود.
  void Function()? onSessionExpired;

  /// مسیرهایی که ۴۰۱ آن‌ها «جلسه منقضی شد» نیست بلکه «رمز غلط است».
  ///
  /// بدون این استثنا، یک تلاشِ ناموفقِ ورود، خودش را به‌عنوان انقضای
  /// جلسه جا می‌زد و صفحه را ری‌ست می‌کرد — کاربر پیغام «رمز نادرست» را
  /// هم نمی‌دید.
  static bool _isAuthAttempt(String path) =>
      path.contains('/auth/login') ||
      path.contains('/auth/register') ||
      path.contains('/auth/forgot-password');

  /// توکن را پاک می‌کند و به اپ خبر می‌دهد که باید به صفحهٔ ورود برگردد.
  void _handleUnauthorized(String path) {
    if (_isAuthAttempt(path)) return;
    if (token == null) return; // قبلاً خارج شده — دوباره کاری نکن.
    // پاک‌سازی محلی؛ `logout()` چون async است اینجا منتظرش نمی‌مانیم،
    // ولی حافظه را همین حالا تمیز می‌کنیم تا درخواست بعدی توکن مرده را
    // نفرستد.
    token = null;
    isAdmin = false;
    adminRole = 'super_admin';
    _getCache.clear();
    // ⚠️ کشِ ETag هم باید برود. اگر نرود، کاربرِ بعدی که وارد می‌شود
    // `If-None-Match` نفرِ قبلی را می‌فرستد و سرور ۳۰۴ می‌دهد — یعنی
    // دادهٔ حسابِ قبلی روی صفحهٔ حسابِ جدید. نشتیِ اطلاعاتِ بینِ حساب‌ها.
    _etagCache.clear();
    // به همان دلیل: اسنپ‌شاتِ کاربرِ قبلی نباید به کاربرِ بعدی نشان داده
    // شود. این جدی‌تر است چون SWR آن را **بلافاصله** رسم می‌کند.
    _lastGood.clear();
    SharedPreferences.getInstance().then((sp) {
      sp.remove('token');
      sp.remove('isAdmin');
      sp.remove('adminRole');
    }).catchError((_) => null);
    onSessionExpired?.call();
  }

  /// Base URL of the backend (also used for the Socket.IO connection).
  String get baseUrl => dio.options.baseUrl;

  ApiClient() {
    _tuneConnection();
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onResponse: (response, handler) {
        // With validateStatus above, error codes arrive here rather than as
        // exceptions — turn them back into the DioException the app expects.
        //
        // ═══════════════════════════════════════════════════════════════
        // THE `true` AT THE END IS THE WHOLE BUG. Do not remove it.
        // ═══════════════════════════════════════════════════════════════
        //
        // `handler.reject(err)` defaults to `callFollowingErrorInterceptor:
        // false`. In that mode Dio drops the request WITHOUT COMPLETING ITS
        // FUTURE — `await api.get(...)` then never returns: it does not
        // resolve, it does not throw, it simply hangs forever.
        //
        // Every screen in the app is written as:
        //
        //     try { await api.get(...); setState(_loading = false); }
        //     catch (e) { setState(_loading = false); }
        //
        // Neither branch can ever run, so `_loading` stays true and the user
        // stares at a spinner that will never stop. That is exactly the
        // screenshot the owner sent: shell painted, middle of the screen
        // spinning forever.
        //
        // It also explains why it looked intermittent: it only happens when
        // the server answers 4xx/5xx. A healthy response goes through
        // `handler.next` and is fine.
        //
        // Proven with a unit test — see api_client_test.dart, which timed
        // out at 30s before this fix and passes in milliseconds after it.
        final code = response.statusCode ?? 0;
        if (code == 401) {
          // توکن مرده: کاربر را به صفحهٔ ورود برگردان، نه اینکه در پوستهٔ
          // خالی گیر بیفتد. توضیح کامل روی `onSessionExpired`.
          _handleUnauthorized(response.requestOptions.path);
        }
        if (code >= 400) {
          handler.reject(
            DioException(
              requestOptions: response.requestOptions,
              response: response,
              type: DioExceptionType.badResponse,
            ),
            true,
          );
          return;
        }
        handler.next(response);
      },
    ));
  }

  /// Keeps TLS connections alive between requests.
  ///
  /// Every call used to pay for a fresh TCP + TLS handshake (~2 round trips
  /// to the VPS). Reusing a pooled connection removes that entirely from the
  /// second request onward, which is the single biggest win for perceived
  /// speed on mobile networks.
  void _tuneConnection() {
    final adapter = dio.httpClientAdapter;
    if (adapter is IOHttpClientAdapter) {
      adapter.createHttpClient = () {
        final client = HttpClient()
          ..idleTimeout = const Duration(seconds: 30)
          ..connectionTimeout = const Duration(seconds: 8)
          // The app fans out several calls at once on the dashboard; the
          // default of 1-per-host would serialise them.
          ..maxConnectionsPerHost = 6
          ..autoUncompress = true;
        return client;
      };
    }
  }

  /// توکنِ ذخیره‌شده را می‌خواند.
  ///
  /// ═══════════════════════════════════════════════════════════════════════
  /// چرا هرگز پرتاب نمی‌کند
  /// ═══════════════════════════════════════════════════════════════════════
  ///
  /// این تابع در مسیرِ راه‌اندازیِ اپ است: `main.dart` تا کامل شدنش
  /// صفحهٔ Splash نشان می‌دهد. اگر پرتاب کند، `_ready` هرگز true
  /// نمی‌شود و کاربر **برای همیشه** روی Splash می‌ماند — نه پیامی، نه
  /// دکمه‌ای، نه راهی جز حذف و نصب دوبارهٔ اپ.
  ///
  /// و `SharedPreferences.getInstance()` واقعاً می‌تواند شکست بخورد:
  /// دیسکِ پر، فایلِ تنظیماتِ خرابِ ناشی از یک بستنِ ناگهانی، یا
  /// پروفایل کاربرِ قفل‌شده در دستگاه‌های چنداکانتی.
  ///
  /// شکست اینجا کاملاً قابل بازیابی است: نبودِ توکن یعنی «وارد نشده»،
  /// که همان چیزی است که به کاربر نشان می‌دهیم. پس بی‌صدا به همان
  /// حالت می‌رویم به‌جای اینکه اپ را قفل کنیم.
  Future<void> loadToken() async {
    try {
      final sp = await SharedPreferences.getInstance();
      token = sp.getString('token');
      isAdmin = sp.getBool('isAdmin') ?? false;
      adminRole = sp.getString('adminRole') ?? 'super_admin';
    } catch (e) {
      // بدترین حالت: کاربر یک بار دیگر وارد می‌شود.
      token = null;
      isAdmin = false;
      adminRole = 'super_admin';
      debugPrint('loadToken failed, continuing signed-out: $e');
    }
  }

  Future<void> saveToken(String t,
      {bool admin = false, String? role}) async {
    // ورود با حساب دیگر یعنی هر پاسخِ کش‌شده مال شخص اشتباهی است.
    invalidateCache();
    token = t;
    isAdmin = admin;
    if (admin && role != null && role.isNotEmpty) adminRole = role;
    if (!admin) adminRole = 'super_admin';
    final sp = await SharedPreferences.getInstance();
    await sp.setString('token', t);
    await sp.setBool('isAdmin', admin);
    await sp.setString('adminRole', adminRole);
  }

  Future<void> logout() async {
    token = null;
    isAdmin = false;
    adminRole = 'super_admin';
    final sp = await SharedPreferences.getInstance();
    await sp.remove('token');
    await sp.remove('isAdmin');
    await sp.remove('adminRole');
    // Per-user game saves must not survive a sign-out: on a shared phone the
    // next person saw the previous user's tap-game level until the server
    // reconciled it.
    await sp.remove('tap_game_progress_v1');
    // و کشِ پاسخ‌ها. روی یک گوشی مشترک، بدون این، نفر بعدی برای یک ثانیه
    // پروفایل و امتیاز نفر قبلی را می‌دید — همان دلیلی که ذخیرهٔ بازی هم
    // بالا پاک می‌شود.
    invalidateCache();
    // ⚠️ `invalidateCache()` عمداً `_lastGood` را نگه می‌دارد (توضیحش
    // آنجاست) — ولی در خروج از حساب باید حتماً برود.
    //
    // این تفاوت ظریف و مهم است: با SWR، اسنپ‌شات **بلافاصله و بدونِ هیچ
    // درخواستی** رسم می‌شود. اگر بماند، نفرِ بعدی روی گوشیِ مشترک
    // کلکسیون و امتیازِ نفرِ قبلی را می‌بیند — نه برای یک ثانیه، بلکه
    // تا اولین پاسخِ سرور.
    _lastGood.clear();
  }

  // ── request coalescing ────────────────────────────────────────────────
  //
  // THE PROBLEM THIS SOLVES, measured rather than assumed:
  //
  // Opening the app fires GET /api/profile TWICE — once from HomeShell (for
  // the greeting and the points in the app bar) and once from DashboardPage
  // (for the same data plus rewards). They are issued microseconds apart by
  // two widgets that do not know about each other. Over a link to Iran that
  // is ~400ms of latency spent twice for one answer.
  //
  // Rather than rewire the widget tree — which would couple the shell to the
  // dashboard and make both harder to change — identical in-flight GETs
  // share one response, and the answer stays warm for a moment afterwards.
  //
  // WHY THE WINDOW IS SHORT (1.2s). Long enough to absorb the burst of calls
  // a screen makes as it mounts; far too short for a user to notice stale
  // data. Anything that MUTATES clears the cache outright, so a purchase or
  // a spin is never served a pre-change body.
  static const Duration _cacheWindow = Duration(milliseconds: 1200);
  final Map<String, ({DateTime at, dynamic body})> _getCache = {};
  final Map<String, Future<dynamic>> _inFlight = {};

  // ═══════════════════════════════════════════════════════════════════════
  // کشِ شرطی با ETag — «اگر عوض نشده، دوباره نفرست»
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ── خواستهٔ مالک ──
  //
  //   «وقتی کارتی در موبایل یا وب لود میشه باید کش بشه که دیگه به سیستم
  //    فشار نیاد ولی اگه تغییری در کارت در سرور به وجود اومد دوباره از
  //    سیستم خودشو بروز کنه»
  //
  // ── تفاوتش با `_cacheWindow` بالا ──
  //
  // آن پنجرهٔ ۱.۲ ثانیه‌ای فقط رگبارِ درخواست‌های هم‌زمانِ یک صفحه را جمع
  // می‌کند. بعد از ۱.۲ ثانیه، درخواست دوباره **کاملاً** از شبکه می‌آید —
  // حتی اگر هیچ حرفی عوض نشده باشد. کاربری که بین اینونتوری و آرنا
  // جابه‌جا می‌شود، هر بار کلِ فهرستِ کارت‌ها را دوباره دانلود می‌کرد.
  //
  // ── راه‌حل ──
  //
  // سرور (اکسپرس) از قبل `ETag` می‌فرستد؛ آزموده شد که با
  // `If-None-Match` جوابِ `304` با بدنهٔ صفر می‌دهد. حالا هر پاسخِ GET
  // همراه با ETagش نگه داشته می‌شود و درخواستِ بعدی آن را می‌فرستد:
  //
  //   • داده عوض نشده → `304`، بدنهٔ صفر بایت، دادهٔ محلی برمی‌گردد
  //   • داده عوض شده  → `200` با بدنهٔ تازه، کش به‌روز می‌شود
  //
  // یعنی دقیقاً همان چیزی که خواسته شد: فشار نمی‌آید، ولی تغییر بی‌درنگ
  // دیده می‌شود.
  //
  // ⚠️ `validateStatus` باید ۳۰۴ را «موفق» بداند وگرنه dio آن را استثنا
  //    می‌کند و ما به سراغِ کشِ محلی نمی‌رویم.
  //
  // چرا سقف دارد: کاربری که ساعت‌ها در اپ می‌ماند نباید حافظه را
  // بی‌نهایت بزرگ کند. ۶۰ مسیر بیش از هر جریانِ واقعیِ کاربر است.
  static const int _etagMax = 60;
  final Map<String, ({String etag, dynamic body})> _etagCache = {};

  void _rememberEtag(String path, Response<dynamic> r) {
    final etag = r.headers.value('etag');
    if (etag == null || etag.isEmpty) return;
    // درجِ مجدد کلید را به انتهای نگاشت می‌برد، پس قدیمی‌ترین همیشه اول
    // صف است و LRU با یک خط پیاده می‌شود.
    _etagCache.remove(path);
    _etagCache[path] = (etag: etag, body: r.data);
    while (_etagCache.length > _etagMax) {
      _etagCache.remove(_etagCache.keys.first);
    }
  }

  /// آخرین پاسخِ موفقِ هر مسیر، بدونِ انقضا.
  ///
  /// ═══════════════════════════════════════════════════════════════════════
  /// چرا این جدا از `_getCache` است — و چرا مهم‌ترین بخشِ سرعت است
  /// ═══════════════════════════════════════════════════════════════════════
  ///
  /// ── گزارشِ مالک ──
  ///
  ///   «هر بار که در اندروید از صفحه بازی میرم و یا به اینوتوری میرم باید
  ///    منتظر بمونم کارت ها لود بشن. این به سرور فشار نمیاره؟ نمیشه
  ///    یکاریش کنی انقدر لود کارت ها طول نکشه؟»
  ///
  /// ── اندازه‌گیریِ واقعی، قبل از هر تغییری ──
  ///
  ///   • سرور روی خودِ VPS: **۴ میلی‌ثانیه**
  ///   • همان درخواست از بیرون: **۴۷۰ تا ۱۰۳۰ میلی‌ثانیه**
  ///
  /// یعنی «فشار روی سرور» اصلاً مسئله نیست — سرور بیکار است. کلِ تأخیر
  /// رفت‌وبرگشتِ شبکه است (TLS + فاصله). پس بهینه‌سازیِ کوئری یا اضافه
  /// کردنِ ایندکس هیچ کمکی نمی‌کرد؛ باید **خودِ انتظار** حذف می‌شد.
  ///
  /// ── الگوی stale-while-revalidate ──
  ///
  /// کاربر بلافاصله آخرین دادهٔ شناخته‌شده را می‌بیند (صفر انتظار)، و
  /// در همان لحظه یک درخواستِ پس‌زمینه با `If-None-Match` می‌رود:
  ///
  ///   • داده عوض نشده → سرور ۳۰۴ می‌دهد، صفر بایت بدنه، هیچ اتفاقی
  ///     روی صفحه نمی‌افتد. (پس «فشار به سرور» هم عملاً صفر است.)
  ///   • داده عوض شده  → صفحه بی‌صدا به‌روز می‌شود.
  ///
  /// این دقیقاً همان چیزی است که مالک خواست: «انقدر لود طول نکشه» ولی
  /// «اگه تغییری به وجود اومد دوباره خودشو بروز کنه».
  ///
  /// ⚠️ چرا `_getCache` کافی نبود: پنجره‌اش ۱.۲ ثانیه است و فقط رگبارِ
  ///    درخواست‌های هم‌زمانِ یک صفحه را جمع می‌کند. کاربری که سی ثانیه در
  ///    صفحهٔ بازی است و برمی‌گردد، همیشه منتظرِ کاملِ شبکه می‌ماند.
  final Map<String, dynamic> _lastGood = {};

  /// مسیرهایی که «کهنه هم بهتر از خالی» است.
  ///
  /// عمداً فهرستِ سفید و نه همه‌چیز: مسیرهایی مثل کیف پول یا نتیجهٔ
  /// گردونه نباید مقدارِ کهنه نشان بدهند، چون کاربر بر اساسشان تصمیمِ
  /// مالی می‌گیرد. اینها همگی «کاتالوگ»اند: کارت‌ها، ترکیب، پروفایل.
  ///
  /// نکتهٔ نگهداری: فقط مسیرهای **واقعاً صدا‌زده‌شده** اینجا باشند. سه
  /// ورودیِ `/api/inventory`، `/api/league` و `/api/social` هیچ‌وقت
  /// فراخوانی نمی‌شدند (داده‌شان از `/api/bootstrap` و مسیرهای واقعی
  /// مثل `/api/league/current` می‌آید) و فقط ردّ گمراه‌کننده بودند؛ حذف
  /// شدند تا کسی روزی فکر نکند کشِ یک مسیرِ بی‌route را می‌خوانَد.
  static bool _swrEligible(String path) {
    const ok = [
      '/api/bootstrap',
      '/api/card-duel',
      '/api/rewards',
      '/api/reward-groups',
      '/api/shop',
      '/api/pass',
      '/api/missions',
    ];
    for (final prefix in ok) {
      if (path == prefix || path.startsWith('$prefix?') || path.startsWith('$prefix/')) {
        return true;
      }
    }
    return false;
  }

  /// آخرین دادهٔ شناخته‌شدهٔ یک مسیر، بدونِ هیچ درخواستی.
  ///
  /// صفحه می‌تواند اول این را رسم کند و بعد `get()` را صدا بزند.
  dynamic cachedSnapshot(String path) => _lastGood[path];

  Future<dynamic> get(String path, {bool fresh = false}) {
    if (!fresh) {
      final hit = _getCache[path];
      if (hit != null && DateTime.now().difference(hit.at) < _cacheWindow) {
        return Future.value(hit.body);
      }
      // A second caller arriving while the first request is still open waits
      // on the SAME future instead of opening its own socket.
      final pending = _inFlight[path];
      if (pending != null) return pending;
    }

    // ═══════════════════════════════════════════════════════════════════
    // چرا این با async/await نوشته شده و نه با زنجیرهٔ .then()
    // ═══════════════════════════════════════════════════════════════════
    //
    // نسخهٔ قبلی این بود:
    //
    //     final future = dio.get(path)
    //         .then((r) { _getCache[path] = ...; return r.data; })
    //         .whenComplete(() => _inFlight.remove(path));
    //     _inFlight[path] = future;
    //     return future;
    //
    // وقتی درخواست خطا می‌داد، این زنجیره **هرگز settle نمی‌شد**: نه
    // مقدار می‌داد، نه استثنا پرتاب می‌کرد. یعنی `await api.get(...)`
    // برای همیشه معلق می‌ماند.
    //
    // هر صفحهٔ اپ این شکل نوشته شده:
    //
    //     try   { await api.get(...); setState(_loading = false); }
    //     catch { setState(_loading = false); }
    //
    // هیچ‌کدام از دو شاخه اجرا نمی‌شد، پس `_loading` برای همیشه true
    // می‌ماند و کاربر به چرخنده‌ای نگاه می‌کرد که هیچ‌وقت تمام نمی‌شود.
    // این همان عکسی است که مالک فرستاد.
    //
    // با تست ثابت شد: `dio.get` مستقیم درست throw می‌کند، ولی همین
    // wrapper معلق می‌ماند (api_client_test.dart).
    //
    // شکل async/await هر دو مسیر را صریح می‌کند: موفقیت کش می‌شود، خطا
    // دوباره پرتاب می‌شود، و `finally` در هر دو حالت _inFlight را پاک
    // می‌کند.
    Future<dynamic> run() async {
      try {
        // ═══════════════════════════════════════════════════════════════
        // تلاشِ دوبارهٔ خودکار برای خطاهای گذرا
        // ═══════════════════════════════════════════════════════════════
        //
        // گزارش مالک: «خطای ارتباط با سرور زیاد شده مخصوصا قسمت چت».
        //
        // اندازه‌گیری روی سرور نشان داد /api/chat/messages در ۸
        // میلی‌ثانیه پاسخ می‌دهد و سرور ۸ ساعت بدون مشکل بالاست. پس
        // خطاها از **شبکهٔ موبایل** می‌آیند، نه از سرور: یک قطعیِ
        // یک‌ثانیه‌ای هنگام جابه‌جایی بین دکل‌ها یا سوییچ Wi‑Fi/داده
        // کافی است تا درخواست شکست بخورد.
        //
        // چت این را تشدید می‌کند چون هر ۱۰ ثانیه poll می‌کند: در یک
        // ساعت ۳۶۰ فرصت برای دیدنِ یک بلیپِ گذرا.
        //
        // یک تلاشِ دوباره پس از ۴۰۰ میلی‌ثانیه، اکثریتِ قاطعِ این
        // بلیپ‌ها را بی‌صدا حل می‌کند.
        //
        // چرا فقط **یک** تلاش و فقط برای GET:
        //   • GET ذاتاً idempotent است؛ تکرارش هیچ چیزی را دوباره
        //     نمی‌سازد. POST هرگز retry نمی‌شود — یک پیامِ چتِ دوبار
        //     ارسال‌شده بدتر از یک خطاست.
        //   • تلاشِ بیشتر یعنی کاربر ثانیه‌ها منتظرِ چیزی بماند که
        //     واقعاً قطع است. یک تلاش، تعادلِ بینِ «بلیپ را ندید» و
        //     «قطعیِ واقعی را سریع اعلام کن».
        //   • فقط خطاهای گذرا (تایم‌اوت، قطع شبکه، ۵xx، ۴۲۹). یک ۴۰۳
        //     یا ۴۰۴ دفعهٔ دوم هم همان جواب را می‌دهد.
        Response<dynamic> r;
        // ⚠️ `fresh` عمداً اینجا اثری ندارد و این ظریف است.
        //
        // `fresh: true` یعنی «دادهٔ معتبر می‌خواهم، پنجرهٔ ۱.۲ ثانیه‌ای را
        // دور بزن». ولی ۳۰۴ **خودش** پاسخِ معتبر است: سرور دارد می‌گوید
        // «نسخه‌ای که داری دقیقاً همان نسخهٔ فعلی است». پس اعتبارسنجی با
        // ETag با خواستهٔ `fresh` هیچ تضادی ندارد و فقط ترافیک را حذف
        // می‌کند.
        //
        // جایی که واقعاً باید ETag را دور انداخت، بعد از **نوشتن** است —
        // و آنجا `invalidateCache()` کلِ `_etagCache` را پاک می‌کند، پس
        // درخواستِ بعدی هرحال بدنهٔ کامل می‌گیرد.
        //
        // نسخهٔ اولِ همین کد `fresh ? null : ...` بود و تستِ
        // etag_cache_test آن را گرفت: با آن، هر صفحه‌ای که `fresh: true`
        // می‌زند (اکثرشان، هنگام pull-to-refresh) هیچ‌وقت از ۳۰۴ سود
        // نمی‌برد و کلِ این قابلیت عملاً خاموش می‌ماند.
        final known = _etagCache[path];
        // ── ⚠️ چرا اینجا `validateStatus` دست نمی‌خورد ──
        //
        // دو بار اشتباه کردم و هر بار تست‌های موجود گرفتند. ثبت می‌کنم تا
        // نفر بعدی همان راه را نرود:
        //
        //   تلاش ۱: `validateStatus: (c) => c < 400`
        //   تلاش ۲: `validateStatus: (c) => c == 304 || c < 300`
        //
        // هر دو غلط بودند، چون فرض می‌کردند دیفالتِ dio (`< 300`) اینجا
        // برقرار است. نیست: `BaseOptions` بالای همین فایل عمداً
        // `code < 500` گذاشته تا کدهای خطا به‌جای استثنا به
        // `onResponse` برسند — همان‌جا که اینترسپتورِ ۴۰۱ توکنِ منقضی را
        // پاک می‌کند و کاربر را به صفحهٔ ورود می‌فرستد.
        //
        // با override کردنِ آن، ۴۰۱ دیگر به اینترسپتور نمی‌رسید و
        // «انقضای جلسه» بی‌صدا از کار می‌افتاد: کاربر با توکنِ مرده گیر
        // می‌کرد و هیچ پیامی نمی‌دید.
        //
        // چون `< 500` از قبل شاملِ ۳۰۴ هم هست، هیچ تنظیمی لازم نیست —
        // فقط هدر را اضافه می‌کنیم و بس.
        final opts = known == null
            ? null
            : Options(headers: {'If-None-Match': known.etag});
        try {
          r = await dio.get(path, options: opts);
        } catch (e) {
          if (!isTransient(e)) rethrow;
          await Future<void>.delayed(const Duration(milliseconds: 400));
          r = await dio.get(path, options: opts);
        }
        if (r.statusCode == 304 && known != null) {
          // هیچ بایتی از بدنه دانلود نشد.
          _getCache[path] = (at: DateTime.now(), body: known.body);
          _lastGood[path] = known.body;
          return known.body;
        }
        _rememberEtag(path, r);
        _getCache[path] = (at: DateTime.now(), body: r.data);
        if (_swrEligible(path)) _lastGood[path] = r.data;
        return r.data;
      } finally {
        // چرا `unawaited`: مقادیر این نگاشت خودشان Future هستند، پس
        // `remove` یک `Future?` برمی‌گرداند — همان Futureی که همین حالا
        // در حال تمام شدن است. تحلیلگر آن را «Future رهاشده» می‌بیند،
        // ولی چیزی برای منتظر ماندن نیست: فقط داریم کلید را از نگاشتِ
        // «در پرواز» پاک می‌کنیم. `unawaited` این را صریح می‌کند
        // به‌جای اینکه قانون را با ignore خاموش کنیم.
        unawaited(_inFlight.remove(path));
      }
    }

    final future = run();
    // ═══════════════════════════════════════════════════════════════════
    // چرا اینجا `unawaited` لازم است و چرا خطر ندارد
    // ═══════════════════════════════════════════════════════════════════
    //
    // این همان Future است که بلافاصله پایین‌تر `return` می‌شود، پس
    // فراخوانندهٔ واقعی منتظرش می‌ماند و خطایش گرفته می‌شود. ولی
    // تحلیلگر فقط این خط را می‌بیند: یک Future در نگاشت ذخیره شد و
    // هیچ‌کس منتظرش نماند.
    //
    // نکتهٔ ظریف: اگر یک فراخوانِ **هم‌زمانِ دوم** برای همین مسیر برسد،
    // همین Future را می‌گیرد. پس Future هرگز بی‌صاحب نمی‌ماند مگر اینکه
    // فراخوانندهٔ اول خودش نتیجه را دور بیندازد — که مسئولیتِ اوست، نه
    // اینجا.
    //
    // `unawaited` صریح، این استدلال را برای خواننده و برای تحلیلگر ثبت
    // می‌کند؛ خاموش کردنِ قانون با ignore همین اطلاعات را پنهان می‌کرد.
    unawaited(future);
    _inFlight[path] = future;
    return future;
  }

  /// Drops cached GETs so the next read is authoritative.
  ///
  /// Called after every mutation. Clearing EVERYTHING rather than guessing
  /// which paths a write touched: buying a shop item changes the profile,
  /// the wallet and the shop at once, and a partial invalidation that misses
  /// one of them shows the user a number that contradicts what they just did.
  void invalidateCache() {
    _getCache.clear();
    // همان استدلالِ بالا: بعد از هر نوشتن، ETagهای ذخیره‌شده کهنه‌اند.
    // نگه داشتنشان یعنی کاربر بعد از ثبتِ کارت، اینونتوریِ قبل از ثبت را
    // می‌بیند و فکر می‌کند ثبت نشده.
    _etagCache.clear();
    // ⚠️ `_lastGood` عمداً **پاک نمی‌شود**.
    //
    // وسوسه‌کننده بود که اینجا هم پاکش کنیم، ولی آن کار خودِ قابلیت را
    // خنثی می‌کرد: بعد از هر ثبتِ کارت، کاربر دوباره صفحهٔ خالی و
    // اسپینر می‌دید — یعنی دقیقاً همان چیزی که قرار بود حل شود.
    //
    // بی‌خطر است چون `_etagCache` پاک شده: درخواستِ بعدی
    // `If-None-Match` نمی‌فرستد، پس حتماً بدنهٔ کامل و تازه می‌گیرد و
    // `_lastGood` را بازنویسی می‌کند. کاربر برای کسری از ثانیه دادهٔ
    // قبلی را می‌بیند و بعد به‌روز می‌شود — که بهتر از صفحهٔ خالی است.
  }

  /// دادهٔ کهنه را فوراً می‌دهد و در پس‌زمینه تازه‌اش می‌کند.
  ///
  /// `onFresh` فقط وقتی صدا زده می‌شود که دادهٔ تازه **واقعاً متفاوت**
  /// باشد؛ با ۳۰۴ یا پاسخِ یکسان اصلاً صدا زده نمی‌شود، پس صفحه بی‌دلیل
  /// دوباره رسم نمی‌شود.
  ///
  /// اگر چیزی در کش نباشد (اولین اجرای اپ)، رفتار دقیقاً مثل `get`
  /// معمولی است: منتظرِ شبکه می‌ماند.
  ({dynamic cached, Future<dynamic> fresh}) getStale(
    String path, {
    void Function(dynamic data)? onFresh,
    void Function(Object error)? onError,
  }) {
    final cached = _lastGood[path];
    final future = get(path, fresh: true).then((data) {
      // مقایسهٔ ارجاعی کافی است: مسیرِ ۳۰۴ عیناً همان شیءِ قبلی را
      // برمی‌گرداند، پس نابرابری یعنی داده واقعاً عوض شده.
      if (cached == null || !identical(cached, data)) onFresh?.call(data);
      return data;
    }).catchError((Object e) {
      // شکستِ شبکه وقتی دادهٔ کهنه داریم نباید صفحه را خراب کند —
      // کاربر آفلاین همچنان کلکسیونش را می‌بیند.
      if (cached == null) throw e;
      onError?.call(e);
      return cached;
    });
    return (cached: cached, fresh: future);
  }

  /// Runs several GETs concurrently over the pooled connection.
  ///
  /// Screens used to `await` each endpoint one after another, so the user
  /// waited for the SUM of the round trips. Now they overlap and the wait is
  /// just the slowest one.
  Future<List<dynamic>> getAll(List<String> paths) =>
      Future.wait(paths.map((p) => get(p)));
  Future<dynamic> post(String path, Map<String, dynamic> body) async {
    final r = await dio.post(path, data: body);
    // هر نوشتنی کش را باطل می‌کند — وگرنه کاربر می‌چرخاند و عددِ بعدی
    // هنوز حالتِ قبل از چرخش است.
    invalidateCache();
    return r.data;
  }

  Future<dynamic> put(String path, Map<String, dynamic> body) async {
    final r = await dio.put(path, data: body);
    invalidateCache();
    return r.data;
  }

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final r = await dio.patch(path, data: body);
    invalidateCache();
    return r.data;
  }

  /// دانلودِ خامِ بایت‌های یک پاسخ — برای خروجیِ CSV و فایل‌های متنی.
  ///
  /// مسیرهای عادی از `get` می‌گذرند که JSON را پارس می‌کند؛ این متد
  /// بایت‌های خام را می‌دهد تا بتوان مستقیم به اشتراک‌گذاشت یا ذخیره کرد.
  ///
  /// ⚠️ خروجی `Uint8List` است، نه `List<int>`. `XFile.fromData` و
  /// `File.writeAsBytes` هر دو `Uint8List` می‌خواهند؛ برگرداندنِ
  /// `List<int>` بیلدِ ریلیز را با `argument_type_not_assignable` می‌شکست.
  Future<Uint8List> downloadBytes(String path) async {
    final opts = Options(responseType: ResponseType.bytes);
    final res = await dio.get<List<int>>(path, options: opts);
    final data = res.data;
    if (data == null || data.isEmpty) return Uint8List(0);
    return data is Uint8List ? data : Uint8List.fromList(data);
  }

  /// حذفِ یک منبع.
  ///
  /// تا امروز هیچ صفحه‌ای به DELETE نیاز نداشت؛ مدیریتِ کدهای «کارت با
  /// عکس» اولین مورد است. `validateStatus` پیش‌فرضِ ApiClient (کمتر از
  /// ۵۰۰) اینجا هم کار می‌کند، پس ۴۰۹ «کد مصرف‌شده حذف نمی‌شود» به
  /// استثنا تبدیل می‌شود و پیامش به کاربر می‌رسد.
  Future<dynamic> delete(String path) async {
    final res = await dio.delete(path);
    invalidateCache();
    return res.data;
  }

  /// Uploads a support-ticket attachment (user-scoped route).
  Future<String> uploadSupportImage(String filePath) async {
    final form =
        FormData.fromMap({'image': await MultipartFile.fromFile(filePath)});
    final res = await dio.post('/api/support/uploads/image', data: form);
    return res.data['url'].toString();
  }

  Future<String> uploadAdminImage(String filePath) async {
    final form =
        FormData.fromMap({'image': await MultipartFile.fromFile(filePath)});
    final res = await dio.post('/api/admin/uploads/image', data: form);
    return res.data['url'].toString();
  }

  /// ارسال فایل **به‌همراه فیلدهای متنی** به یک مسیر دلخواه.
  ///
  /// دو متد بالا فقط `url` برمی‌گردانند و فیلد متنی نمی‌فرستند. «ثبت
  /// کارت با عکس» به عکس + کد در یک درخواست نیاز دارد و پاسخِ کامل
  /// می‌خواهد (وضعیت تطبیق، امتیاز، پیام). آن دو عمداً دست‌نخورده
  /// ماندند چون چند صفحه از آن‌ها استفاده می‌کنند.
  ///
  /// تایم‌اوت بالاتر از پیش‌فرض: سرور باید تصویر را رمزگشایی کند و سه
  /// اثر انگشت بسازد. تایم‌اوتِ کوتاه یعنی کاربر خطا می‌بیند در حالی
  /// که کارت درست ثبت شده — بدترین حالت.
  ///
  /// `validateStatus` عمداً همه را می‌پذیرد: این مسیر برای ۴۰۴ (کدِ
  /// غلط) و ۴۲۹ (قفل) بدنهٔ معناداری برمی‌گرداند که باید خوانده شود،
  /// نه اینکه به استثنا تبدیل شود و پیامش گم شود.
  /// ارسالِ چندبخشی با یک یا چند فایل.
  ///
  /// `extraFiles` برای مسیرهایی است که بیش از یک تصویر می‌گیرند — مثلِ
  /// «ثبت کارت» که رو و پشتِ کارت را هم‌زمان می‌فرستد. کلیدِ نقشه نامِ
  /// فیلد است و مقدارش مسیرِ فایل.
  ///
  /// `filePath` تکی دست‌نخورده ماند تا هیچ‌کدام از فراخوان‌های موجود
  /// نشکنند.
  Future<Response<dynamic>> postMultipart(
    String path, {
    String? filePath,
    String fileField = 'image',
    Map<String, String> extraFiles = const {},
    Map<String, dynamic> fields = const {},
  }) async {
    final map = <String, dynamic>{...fields};
    if (filePath != null) {
      map[fileField] = await MultipartFile.fromFile(filePath);
    }
    for (final e in extraFiles.entries) {
      map[e.key] = await MultipartFile.fromFile(e.value);
    }
    return dio.post(
      path,
      data: FormData.fromMap(map),
      options: Options(
        receiveTimeout: const Duration(seconds: 60),
        sendTimeout: const Duration(seconds: 60),
        validateStatus: (_) => true,
      ),
    );
  }
}

/// Persian digits, with thousands separators for plain integers.
///
/// The previous version only swapped digits, so a wallet balance rendered as
/// "۱۰۰۰۰۰۰" — seven characters a reader has to count. Grouping is applied
/// only when the value is a bare integer, so ids, codes and pre-formatted
/// strings pass through untouched.
String faNum(Object? value) {
  const en = '0123456789';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  var s = '$value';

  final isPlainInt = RegExp(r'^-?\d+$').hasMatch(s);
  if (isPlainInt && s.replaceAll('-', '').length > 3) {
    final negative = s.startsWith('-');
    final digits = negative ? s.substring(1) : s;
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write('٬');
      buf.write(digits[i]);
    }
    s = (negative ? '-' : '') + buf.toString();
  }

  for (var i = 0; i < 10; i++) {
    s = s.replaceAll(en[i], fa[i]);
  }

  // جداکنندهٔ اعشار فارسی «٫» (U+066B) است، نه نقطهٔ لاتین. سمتِ وب
  // `Intl.NumberFormat('fa-IR')` خودش این را می‌دهد؛ اگر اینجا نقطه
  // بماند، یک عددِ یکسان در دو کلاینت دو شکل دیده می‌شود. فقط وقتی
  // تبدیل می‌کنیم که نقطه واقعاً بینِ دو رقم باشد تا رشته‌هایی مثل
  // نسخه یا مسیرِ فایل دست‌نخورده بمانند.
  s = s.replaceAllMapped(
      RegExp(r'(?<=[۰-۹])\.(?=[۰-۹])'), (_) => '٫');

  return s;
}

String fullAssetUrl(Object? value) {
  final s = (value ?? '').toString();
  if (s.isEmpty) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return '${ApiClient.defaultBaseUrl}$s';
}

/// شمارهٔ موبایل را دقیقاً مثل سرور به شکل متعارف در می‌آورد.
///
/// ═══════════════════════════════════════════════════════════════════════
/// چرا این در کلاینت هم تکرار شده و فقط به سرور تکیه نشده
/// ═══════════════════════════════════════════════════════════════════════
///
/// صفحه‌کلید فارسی اندروید پیش‌فرض «۰۹۱۲…» تایپ می‌کند. سرور تا پیش از
/// این، آن رشته را با ردیفِ لاتینِ دیتابیس برابر نمی‌دید و ۴۰۱ می‌داد با
/// پیامِ گمراه‌کنندهٔ «شماره موبایل یا رمز عبور نادرست است» — رمز درست
/// بود. سمت سرور رفع شد (`normalizeMobile` در backend/src/server.js)، ولی
/// این کپی سه دلیل مستقل دارد:
///
/// ۱. APKهایی که همین حالا روی گوشی مردم است ممکن است به سروری وصل شوند
///    که هنوز به‌روزرسانی نشده؛ برعکسش هم ممکن است.
/// ۲. کاربر باید در همان لحظهٔ تایپ، شمارهٔ خودش را به شکلی ببیند که
///    ذخیره می‌شود — نه اینکه سرور بی‌صدا چیز دیگری ثبت کند.
/// ۳. نرمال‌سازی در دو طرف تضمین می‌کند ثبت‌نام و ورود همیشه به یک ردیف
///    برسند، پس «حساب سایه» ساخته نمی‌شود.
///
/// نام‌های کاربری غیرعددی (مثل `Admin`) هیچ رقمی ندارند و دست‌نخورده رد
/// می‌شوند.
String normalizeMobileInput(String raw) {
  var s = raw.trim();
  // ارقام فارسی (U+06F0–U+06F9) و عربی-هندی (U+0660–U+0669) → لاتین.
  s = s.replaceAllMapped(RegExp('[\u06F0-\u06F9]'),
      (m) => (m.group(0)!.codeUnitAt(0) - 0x06F0).toString());
  s = s.replaceAllMapped(RegExp('[\u0660-\u0669]'),
      (m) => (m.group(0)!.codeUnitAt(0) - 0x0660).toString());
  // فاصله‌ها و نویسه‌های جهت‌دهی که از کپی‌پیست می‌آیند.
  s = s.replaceAll(RegExp('[\\s\u200c\u200e\u200f\u202a-\u202e]'), '');

  // فقط اگر واقعاً شماره است شکلش را عوض کن؛ نام کاربری را رها کن.
  if (RegExp(r'^[+0-9()\-.]+$').hasMatch(s) && s.isNotEmpty) {
    s = s.replaceAll(RegExp(r'[()\-.]'), '');
    if (s.startsWith('+98')) {
      s = '0${s.substring(3)}';
    } else if (s.startsWith('0098')) {
      s = '0${s.substring(4)}';
    } else if (s.startsWith('98') && s.length == 12) {
      s = '0${s.substring(2)}';
    } else if (RegExp(r'^9\d{9}$').hasMatch(s)) {
      s = '0$s';
    }
  }
  return s;
}

/// پیامِ فارسیِ قابل نمایش برای یک خطای API.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا این تابع بازنویسی شد
/// ═══════════════════════════════════════════════════════════════════════════
///
/// گزارش مالک: «خطای ارتباط با سرور زیاد شده مخصوصا قسمت چت».
///
/// نسخهٔ قبلی برای **هر** شکستی که پیامِ سرور نداشت، همان یک جملهٔ
/// «خطای ارتباط با سرور» را برمی‌گرداند. یعنی این موارد کاملاً متفاوت
/// همه یک شکل دیده می‌شدند:
///
///   • گوشی اصلاً اینترنت ندارد
///   • سرور در دسترس است ولی کند (تایم‌اوت)
///   • سرور ۵۰۰ داد
///   • پاسخ JSON نبود (صفحهٔ خطای یک پروکسی)
///   • درخواست لغو شد چون کاربر صفحه را بست
///
/// آخری مهم‌ترین است: وقتی کاربر بین تب‌ها جابه‌جا می‌شود، درخواستِ
/// در پرواز لغو می‌شود و این **یک رخدادِ کاملاً عادی** است — ولی به
/// کاربر به‌عنوان «خطای ارتباط با سرور» نشان داده می‌شد. بخش بزرگی از
/// «زیاد شدنِ خطا» دقیقاً همین بود: خطاهایی که اصلاً خطا نبودند.
///
/// حالا هر نوع، پیامِ خودش را دارد و لغو شدن اصلاً پیام ندارد (رشتهٔ
/// خالی برمی‌گرداند تا فراخواننده بتواند نادیده‌اش بگیرد).
String apiError(Object e) {
  // ۱. پیامِ صریحِ سرور همیشه اولویت دارد — فارسی و دقیق است.
  try {
    final data = (e as dynamic).response?.data;
    if (data is Map && data['message'] != null) {
      final m = data['message'].toString().trim();
      if (m.isNotEmpty) return m;
    }
  } catch (_) {/* شکلِ پاسخ غیرمنتظره بود */}

  if (e is DioException) {
    switch (e.type) {
      case DioExceptionType.cancel:
        // یک رخدادِ عادی، نه خطا. رشتهٔ خالی یعنی «چیزی نشان نده».
        return '';
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      // transformTimeout یعنی تبدیلِ بدنهٔ پاسخ طول کشید — از دید
      // کاربر همان «کند بودن» است.
      case DioExceptionType.transformTimeout:
        return 'اتصال کند است؛ دوباره تلاش کنید';
      case DioExceptionType.receiveTimeout:
        return 'پاسخ سرور طول کشید؛ دوباره تلاش کنید';
      case DioExceptionType.connectionError:
        return 'اینترنت وصل نیست';
      case DioExceptionType.badCertificate:
        return 'اتصال امن برقرار نشد';
      case DioExceptionType.badResponse:
        final code = e.response?.statusCode ?? 0;
        if (code == 401) return 'نشست شما منقضی شده؛ دوباره وارد شوید';
        if (code == 403) return 'به این بخش دسترسی ندارید';
        if (code == 404) return 'این مورد پیدا نشد';
        if (code == 429) {
          return 'کمی سریع پیش رفتید؛ چند لحظه صبر کنید';
        }
        if (code >= 500) return 'سرور موقتاً در دسترس نیست';
        return 'درخواست انجام نشد';
      case DioExceptionType.unknown:
        // بیشترِ خطاهای شبکه در اندروید اینجا می‌افتند.
        final msg = '${e.error ?? ''}'.toLowerCase();
        if (msg.contains('socket') ||
            msg.contains('network') ||
            msg.contains('failed host lookup') ||
            msg.contains('connection')) {
          return 'اینترنت وصل نیست';
        }
        return 'خطای ارتباط با سرور';
    }
  }

  return 'خطای ارتباط با سرور';
}

/// آیا این خطا صرفاً لغوِ یک درخواست است؟
///
/// لغو شدن وقتی رخ می‌دهد که کاربر پیش از رسیدنِ پاسخ صفحه را ببندد —
/// یعنی یک رخدادِ عادی که **نباید** به‌عنوان خطا نمایش داده شود.
bool isCanceled(Object e) =>
    e is DioException && e.type == DioExceptionType.cancel;

/// آیا این خطا گذراست و ارزشِ تلاشِ دوباره دارد؟
///
/// برای تصمیم‌گیریِ خودکار دربارهٔ retry استفاده می‌شود: یک تایم‌اوت
/// یا ۵۰۳ احتمالاً دفعهٔ بعد جواب می‌دهد، ولی ۴۰۳ هرگز.
bool isTransient(Object e) {
  if (e is! DioException) return false;
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
    case DioExceptionType.connectionError:
      return true;
    case DioExceptionType.badResponse:
      final code = e.response?.statusCode ?? 0;
      // ۴۲۹ و ۵xx گذرا هستند؛ بقیهٔ ۴xx نه.
      return code == 429 || code >= 500;
    case DioExceptionType.unknown:
      return true;
    case DioExceptionType.cancel:
    case DioExceptionType.badCertificate:
      return false;
  }
}

/// HTTP status code of a failed API call, or null if unavailable. Used by
/// the auth screen to detect "account already exists" (409) so it can offer
/// the current-password field instead of just showing a generic error.
int? apiStatusCode(Object e) {
  try {
    return (e as dynamic).response?.statusCode as int?;
  } catch (_) {
    return null;
  }
}

