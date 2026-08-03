import 'dart:io';

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
    _getCache.clear();
    SharedPreferences.getInstance().then((sp) {
      sp.remove('token');
      sp.remove('isAdmin');
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

  Future<void> loadToken() async {
    final sp = await SharedPreferences.getInstance();
    token = sp.getString('token');
    isAdmin = sp.getBool('isAdmin') ?? false;
  }

  Future<void> saveToken(String t, {bool admin = false}) async {
    // ورود با حساب دیگر یعنی هر پاسخِ کش‌شده مال شخص اشتباهی است.
    invalidateCache();
    token = t;
    isAdmin = admin;
    final sp = await SharedPreferences.getInstance();
    await sp.setString('token', t);
    await sp.setBool('isAdmin', admin);
  }

  Future<void> logout() async {
    token = null;
    isAdmin = false;
    final sp = await SharedPreferences.getInstance();
    await sp.remove('token');
    await sp.remove('isAdmin');
    // Per-user game saves must not survive a sign-out: on a shared phone the
    // next person saw the previous user's tap-game level until the server
    // reconciled it.
    await sp.remove('tap_game_progress_v1');
    // و کشِ پاسخ‌ها. روی یک گوشی مشترک، بدون این، نفر بعدی برای یک ثانیه
    // پروفایل و امتیاز نفر قبلی را می‌دید — همان دلیلی که ذخیرهٔ بازی هم
    // بالا پاک می‌شود.
    invalidateCache();
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
        final r = await dio.get(path);
        _getCache[path] = (at: DateTime.now(), body: r.data);
        return r.data;
      } finally {
        _inFlight.remove(path);
      }
    }

    final future = run();
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

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final r = await dio.patch(path, data: body);
    invalidateCache();
    return r.data;
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

String apiError(Object e) {
  try {
    final data = (e as dynamic).response?.data;
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
  } catch (_) {}
  return 'خطای ارتباط با سرور';
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

