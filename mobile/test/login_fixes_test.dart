// تست‌های سه باگِ «وارد اپ نمی‌شوم».
//
// هر سه با تست روی سرور زنده کشف شدند، نه با حدس:
//
//   ۱. ارقام فارسی → سرور ۴۰۱ می‌داد با پیام «رمز نادرست» (رمز درست بود).
//   ۲. توکن منقضی → هیچ‌جای اپ ۴۰۱ را مدیریت نمی‌کرد، کاربر در پوستهٔ
//      خالی حبس می‌شد و هرگز صفحهٔ ورود را نمی‌دید.
//   ۳. ورودِ ناموفق نباید با «انقضای جلسه» اشتباه گرفته شود، وگرنه پیام
//      «رمز نادرست» هم به کاربر نشان داده نمی‌شد.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// آداپتور جعلی: بدون شبکهٔ واقعی، کد وضعیتِ دلخواه برمی‌گرداند.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.status, {this.body = '{}'});
  final int status;
  final String body;
  final List<String> seenPaths = [];
  final List<String?> seenAuthHeaders = [];

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<List<int>>? requestStream, Future<void>? cancelFuture) async {
    seenPaths.add(options.path);
    seenAuthHeaders.add(options.headers['Authorization'] as String?);
    return ResponseBody.fromString(body, status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType]
        });
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('نرمال‌سازی شمارهٔ موبایل', () {
    test('ارقام فارسی به لاتین تبدیل می‌شوند — باگ اصلیِ ورود', () {
      // این دقیقاً همان چیزی است که کیبورد فارسی اندروید تایپ می‌کند.
      expect(normalizeMobileInput('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
    });

    test('ارقام عربی-هندی هم پشتیبانی می‌شوند', () {
      expect(normalizeMobileInput('٠٩١٢٣٤٥٦٧٨٩'), '09123456789');
    });

    test('پیش‌شمارهٔ +۹۸ به صفر تبدیل می‌شود', () {
      expect(normalizeMobileInput('+989123456789'), '09123456789');
      expect(normalizeMobileInput('+۹۸۹۱۲۳۴۵۶۷۸۹'), '09123456789');
      expect(normalizeMobileInput('00989123456789'), '09123456789');
      expect(normalizeMobileInput('989123456789'), '09123456789');
    });

    test('شمارهٔ بدون صفر ابتدایی درست می‌شود', () {
      expect(normalizeMobileInput('9123456789'), '09123456789');
    });

    test('خط تیره، پرانتز و فاصله حذف می‌شوند', () {
      expect(normalizeMobileInput('0912-345-6789'), '09123456789');
      expect(normalizeMobileInput('(0912) 345 6789'), '09123456789');
      expect(normalizeMobileInput('  09123456789  '), '09123456789');
    });

    test('نیم‌فاصله و نویسه‌های جهت‌دهی از کپی‌پیست حذف می‌شوند', () {
      expect(normalizeMobileInput('0912\u200c345\u200f6789'), '09123456789');
    });

    test('نام کاربری غیرعددی دست‌نخورده می‌ماند', () {
      // اگر این بشکند، ورود مدیر از کار می‌افتد.
      expect(normalizeMobileInput('Admin'), 'Admin');
      expect(normalizeMobileInput('  Admin  '), 'Admin');
    });

    test('ورودی خالی کرش نمی‌کند', () {
      expect(normalizeMobileInput(''), '');
      expect(normalizeMobileInput('   '), '');
    });

    test('شمارهٔ درستِ لاتین بدون تغییر عبور می‌کند', () {
      expect(normalizeMobileInput('09123456789'), '09123456789');
    });
  });

  group('انقضای جلسه (۴۰۱)', () {
    test('۴۰۱ توکن را پاک می‌کند و callback را می‌زند', () async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(401);
      await api.saveToken('dead-token');
      var fired = false;
      api.onSessionExpired = () => fired = true;

      await expectLater(api.get('/api/bootstrap'), throwsA(isA<DioException>()));

      expect(fired, isTrue, reason: 'اپ باید به صفحهٔ ورود برگردد');
      expect(api.token, isNull, reason: 'توکن مرده نباید بماند');
      final sp = await SharedPreferences.getInstance();
      expect(sp.getString('token'), isNull,
          reason: 'توکن باید از حافظهٔ دائمی هم پاک شود');
    }, timeout: const Timeout(Duration(seconds: 10)));

    test('ورودِ ناموفق «انقضای جلسه» حساب نمی‌شود', () async {
      // وگرنه صفحهٔ ورود ری‌ست می‌شد و کاربر پیام «رمز نادرست» را
      // هرگز نمی‌دید.
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(401);
      await api.saveToken('some-token');
      var fired = false;
      api.onSessionExpired = () => fired = true;

      await expectLater(
          api.post('/api/auth/login', {'mobile': 'x', 'password': 'y'}),
          throwsA(isA<DioException>()));

      expect(fired, isFalse);
      expect(api.token, isNotNull);
    }, timeout: const Timeout(Duration(seconds: 10)));

    test('۵۰۰ جلسه را منقضی نمی‌کند', () async {
      // یک خطای گذرای سرور نباید کاربر را بیرون بیندازد.
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(500);
      await api.saveToken('good-token');
      var fired = false;
      api.onSessionExpired = () => fired = true;

      await expectLater(api.get('/api/bootstrap'), throwsA(isA<DioException>()));

      expect(fired, isFalse);
      expect(api.token, 'good-token');
    }, timeout: const Timeout(Duration(seconds: 10)));

    test('۴۰۳ (حساب مسدود) جلسه را پاک نمی‌کند', () async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(403);
      await api.saveToken('good-token');
      var fired = false;
      api.onSessionExpired = () => fired = true;

      await expectLater(api.get('/api/profile'), throwsA(isA<DioException>()));

      expect(fired, isFalse);
      expect(api.token, 'good-token');
    }, timeout: const Timeout(Duration(seconds: 10)));

    test('بعد از ۴۰۱ درخواست بعدی دیگر توکن مرده را نمی‌فرستد', () async {
      final api = ApiClient();
      final adapter = _FakeAdapter(401);
      api.dio.httpClientAdapter = adapter;
      await api.saveToken('dead-token');

      await expectLater(api.get('/api/bootstrap'), throwsA(isA<DioException>()));
      await expectLater(api.get('/api/profile'), throwsA(isA<DioException>()));

      expect(adapter.seenAuthHeaders.first, 'Bearer dead-token');
      expect(adapter.seenAuthHeaders.last, isNull,
          reason: 'توکن مرده نباید دوباره فرستاده شود');
    }, timeout: const Timeout(Duration(seconds: 10)));

    test('۴۰۱ پشت‌سرهم فقط یک بار callback می‌زند', () async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(401);
      await api.saveToken('dead');
      var count = 0;
      api.onSessionExpired = () => count++;

      await expectLater(api.get('/api/a'), throwsA(isA<DioException>()));
      await expectLater(api.get('/api/b'), throwsA(isA<DioException>()));

      expect(count, 1, reason: 'نباید صفحهٔ ورود چند بار ری‌ست شود');
    }, timeout: const Timeout(Duration(seconds: 10)));
  });

  group('get() هرگز معلق نمی‌ماند — باگ ریشه‌ای چرخندهٔ ابدی', () {
    for (final code in [400, 401, 403, 404, 500, 502, 503]) {
      test('کد $code استثنا می‌دهد و معلق نمی‌ماند', () async {
        final api = ApiClient();
        api.dio.httpClientAdapter = _FakeAdapter(code);
        if (code == 401) await api.saveToken('t');
        await expectLater(
            api.get('/api/anything'), throwsA(isA<DioException>()));
      }, timeout: const Timeout(Duration(seconds: 10)));
    }

    test('پاسخ موفق مقدار برمی‌گرداند', () async {
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(200, body: '{"ok":true}');
      final r = await api.get('/api/ok');
      expect((r as Map)['ok'], isTrue);
    }, timeout: const Timeout(Duration(seconds: 10)));

    test('بعد از خطا، _inFlight پاک می‌شود و تلاش دوباره ممکن است', () async {
      // اگر finally کار نکند، «تلاش مجدد» همان futureِ شکست‌خورده را
      // برمی‌گرداند و دکمه بی‌اثر می‌شود.
      final api = ApiClient();
      api.dio.httpClientAdapter = _FakeAdapter(500);
      await expectLater(api.get('/api/x'), throwsA(isA<DioException>()));
      await expectLater(api.get('/api/x'), throwsA(isA<DioException>()));
    }, timeout: const Timeout(Duration(seconds: 10)));
  });
}
