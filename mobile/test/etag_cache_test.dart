// نگهبانِ کشِ شرطیِ داده (ETag).
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک دو نیمه دارد و **هر دو** باید هم‌زمان درست باشند:
//
//   ۱. «کش بشه که دیگه به سیستم فشار نیاد»  → نباید بدنه دوباره بیاید
//   ۲. «اگه تغییری در کارت به وجود اومد دوباره خودشو بروز کنه» → باید بیاید
//
// نیمهٔ دوم همان چیزی است که در کشِ بد فراموش می‌شود و بدترین باگ را
// می‌سازد: مدیر عکسِ کارت را عوض می‌کند و کاربر تا نصبِ دوبارهٔ اپ عکسِ
// قدیمی را می‌بیند. پس اینجا هر دو سمت سنجیده می‌شود.
//
// و یک سمتِ سوم که راحت فراموش می‌شود: بعد از خروج از حساب، ETagِ کاربرِ
// قبلی نباید بماند — وگرنه سرور ۳۰۴ می‌دهد و دادهٔ نفرِ قبلی روی صفحهٔ
// نفرِ جدید می‌نشیند.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';

/// آداپترِ ساختگی که مثلِ اکسپرسِ واقعی رفتار می‌کند:
/// اگر `If-None-Match` با ETagِ فعلی جور بود → ۳۰۴ با بدنهٔ خالی.
class _FakeServer implements HttpClientAdapter {
  _FakeServer(this.body, this.etag);

  dynamic body;
  String etag;
  int fullResponses = 0;
  int notModified = 0;
  final List<String?> seenIfNoneMatch = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? _,
      Future<void>? __) async {
    final inm = options.headers['If-None-Match'] as String?;
    seenIfNoneMatch.add(inm);
    if (inm == etag) {
      notModified++;
      return ResponseBody.fromString('', 304, headers: {
        'etag': [etag],
      });
    }
    fullResponses++;
    return ResponseBody.fromString(
      '{"value":"$body"}',
      200,
      headers: {
        'etag': [etag],
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late ApiClient api;
  late _FakeServer server;

  setUp(() {
    api = ApiClient();
    server = _FakeServer('اول', 'W/"v1"');
    api.dio.httpClientAdapter = server;
    api.token = 'test-token';
  });

  group('کش شرطی با ETag', () {
    test('درخواست دوم بدنه را دوباره دانلود نمی‌کند', () async {
      final first = await api.get('/api/cards');
      expect(first['value'], 'اول');
      expect(server.fullResponses, 1);

      // `fresh: true` پنجرهٔ ۱.۲ ثانیه‌ای را دور می‌زند تا واقعاً به شبکه
      // برود — وگرنه این تست کشِ کوتاه‌مدت را می‌سنجید نه ETag را.
      final second = await api.get('/api/cards', fresh: true);

      expect(server.seenIfNoneMatch.last, 'W/"v1"',
          reason: 'باید ETagِ ذخیره‌شده را بفرستد');
      expect(server.notModified, 1, reason: 'سرور باید ۳۰۴ بدهد');
      expect(server.fullResponses, 1, reason: 'بدنه نباید دوباره بیاید');
      expect(second['value'], 'اول', reason: 'دادهٔ کش‌شده برمی‌گردد');
    });

    test('وقتی داده در سرور عوض شود، کلاینت نسخهٔ تازه را می‌گیرد', () async {
      await api.get('/api/cards');
      expect(server.fullResponses, 1);

      // مدیر کارت را ویرایش کرد: هم بدنه هم ETag عوض می‌شود.
      server.body = 'به‌روزشده';
      server.etag = 'W/"v2"';

      final fresh = await api.get('/api/cards', fresh: true);

      expect(server.fullResponses, 2,
          reason: 'ETagِ متفاوت یعنی سرور باید بدنهٔ کامل بدهد');
      expect(fresh['value'], 'به‌روزشده',
          reason: 'این همان نیمهٔ دومِ خواستهٔ مالک است');
    });

    test('بعد از تغییر داده، کشِ تازه هم دوباره ۳۰۴ می‌گیرد', () async {
      await api.get('/api/cards');
      server.body = 'دوم';
      server.etag = 'W/"v2"';
      await api.get('/api/cards', fresh: true);
      final third = await api.get('/api/cards', fresh: true);

      expect(third['value'], 'دوم');
      expect(server.notModified, 1,
          reason: 'ETagِ تازه باید جایگزینِ قبلی شده باشد');
    });

    test('invalidateCache باعث دانلود کاملِ دوباره می‌شود', () async {
      await api.get('/api/cards');
      api.invalidateCache();
      await api.get('/api/cards');

      expect(server.seenIfNoneMatch.last, isNull,
          reason: 'بعد از نوشتن نباید If-None-Match فرستاده شود');
      expect(server.fullResponses, 2);
    });

    test('fresh:true اعتبارسنجی را خاموش نمی‌کند', () async {
      // ۳۰۴ خودش پاسخِ معتبر است، پس `fresh` نباید ETag را دور بیندازد.
      // فقط `invalidateCache()` (بعد از نوشتن) این کار را می‌کند.
      await api.get('/api/cards');
      await api.get('/api/cards', fresh: true);
      expect(server.seenIfNoneMatch.last, 'W/"v1"');
      expect(server.notModified, 1);
      expect(server.fullResponses, 1);
    });

    test('۳۰۴ بدون کشِ محلی باعث کرش نمی‌شود', () async {
      // حالت مرزی: سرور ۳۰۴ می‌دهد ولی ما چیزی ذخیره نکرده‌ایم.
      // نباید استثنا بدهد؛ بدترین حالت باید «بدنهٔ خالی» باشد نه کرش.
      final bare = ApiClient();
      final always304 = _FakeServer('x', 'W/"v1"');
      bare.dio.httpClientAdapter = always304;
      // سرور را وادار می‌کنیم همیشه ۳۰۴ بدهد.
      always304.etag = 'W/"v1"';
      bare.dio.options.headers['If-None-Match'] = 'W/"v1"';

      await expectLater(bare.get('/api/cards'), completes);
    });
  });
}
