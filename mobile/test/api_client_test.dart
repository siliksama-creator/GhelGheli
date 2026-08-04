// ============================================================================
//  ApiClient — قرارداد بنیادی: هر درخواست باید *تمام* شود
// ============================================================================
//
//   flutter test test/api_client_test.dart
//
// چرا این فایل مهم‌ترین تست پروژه است
//
// مالک گزارش داد «صفحات اپ بعد ورود لود نمیشن» و عکسی فرستاد که پوسته را
// رندرشده نشان می‌داد با یک چرخندهٔ ابدی وسط صفحه.
//
// ریشه در هیچ‌کدام از صفحه‌ها نبود. در لایهٔ کش `ApiClient.get()` بود:
//
//     final future = dio.get(path)
//         .then((r) { _getCache[path] = ...; return r.data; })
//         .whenComplete(() => _inFlight.remove(path));
//
// وقتی درخواست خطا می‌داد، این زنجیره **هرگز settle نمی‌شد** — نه مقدار،
// نه استثنا. `await api.get(...)` برای همیشه معلق می‌ماند.
//
// هر صفحهٔ اپ این شکل نوشته شده:
//
//     try   { await api.get(...); setState(_loading = false); }
//     catch { setState(_loading = false); }
//
// هیچ‌کدام از دو شاخه اجرا نمی‌شد. try/catch اضافه کردن کمکی نمی‌کرد چون
// اصلاً چیزی پرتاب نمی‌شد. تنها راه پیدا کردنش، تستِ خودِ لایهٔ شبکه بود.
//
// ═══════════════════════════════════════════════════════════════════════
// قانون: هر تست این فایل باید timeout داشته باشد.
// ═══════════════════════════════════════════════════════════════════════
// بدون آن، رگرسیونِ همین باگ به‌جای «شکست» به شکل «تست معلق» ظاهر می‌شود
// و در CI به نظر می‌رسد سیستم کند شده، نه خراب.

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/api_client.dart';

/// آداپتوری که هر بار همان کد وضعیت را برمی‌گرداند.
class _Status implements HttpClientAdapter {
  _Status(this.code, {this.body = '{"message":"خطای آزمایشی"}'});
  final int code;
  final String body;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s,
      Future<void>? c) async {
    calls++;
    return ResponseBody.fromString(body, code, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(HttpClientAdapter a) {
  final api = ApiClient()..token = 'test-token';
  api.dio.httpClientAdapter = a;
  return api;
}

/// نتیجهٔ یک فراخوانی: 'ok' یا 'threw' یا 'HUNG'.
Future<String> probe(Future<dynamic> f) => f
    .then((_) => 'ok')
    .catchError((Object _) => 'threw')
    .timeout(const Duration(seconds: 3), onTimeout: () => 'HUNG');

void main() {
  const t = Timeout(Duration(seconds: 10));

  group('هر درخواست باید تمام شود — نه معلق بماند', () {
    // این حلقه دقیقاً باگی را می‌گیرد که کاربر دید. هر کد خطایی که سرور
    // ممکن است بدهد باید به یک استثنا تبدیل شود، نه به سکوت.
    for (final code in [400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
      test('GET با پاسخ $code استثنا می‌دهد (نه معلق)', () async {
        final api = _client(_Status(code));
        expect(await probe(api.get('/x')), 'threw',
            reason: 'پاسخ $code باعث چرخندهٔ ابدی می‌شود');
      }, timeout: t);
    }

    test('GET موفق مقدار برمی‌گرداند', () async {
      final api = _client(_Status(200, body: '{"a":1}'));
      expect(await probe(api.get('/x')), 'ok');
    }, timeout: t);

    test('بدنهٔ غیر-JSON هم معلق نمی‌ماند', () async {
      // صفحهٔ خطای پراکسی یا کپچای اپراتور — روی موبایل ایران رایج است.
      final api = _client(_Status(200, body: '<html>503</html>'));
      final r = await probe(api.get('/x'));
      expect(r, isNot('HUNG'), reason: 'HTML به‌جای JSON نباید معلق کند');
    }, timeout: t);

    test('بدنهٔ خالی معلق نمی‌ماند', () async {
      final api = _client(_Status(200, body: ''));
      expect(await probe(api.get('/x')), isNot('HUNG'));
    }, timeout: t);
  });

  group('کش و coalescing نباید خطا را ببلعند', () {
    test('دو صداکنندهٔ هم‌زمان هر دو استثنا می‌گیرند', () async {
      // پوسته و داشبورد هم‌زمان یک مسیر را می‌خوانند و future مشترک
      // می‌شود. اگر فقط یکی خطا بگیرد، آن یکی صفحه تا ابد می‌چرخد.
      final api = _client(_Status(500));
      final results = await Future.wait([
        probe(api.get('/same')),
        probe(api.get('/same')),
      ]);
      expect(results, ['threw', 'threw']);
    }, timeout: t);

    test('پاسخ خطا کش نمی‌شود', () async {
      // اگر یک ۵۰۰ کش شود، کاربر تا پایان پنجرهٔ کش نمی‌تواند دوباره
      // تلاش کند — دکمهٔ «تلاش مجدد» بی‌اثر می‌شود.
      //
      // ═══════════════════════════════════════════════════════════════
      // چرا انتظار «۲» به «بیش از ۲» تغییر کرد
      // ═══════════════════════════════════════════════════════════════
      //
      // ApiClient حالا خطاهای **گذرا** را یک بار دوباره تلاش می‌کند
      // (رفعِ گزارشِ «خطای ارتباط با سرور زیاد شده»). ۵۰۰ گذرا حساب
      // می‌شود، پس هر `get` دو فراخوانیِ HTTP می‌سازد.
      //
      // چیزی که این تست واقعاً می‌سنجد عوض نشده: **درخواستِ دوم باید
      // واقعاً برود**، یعنی پاسخِ خطا کش نشده. اگر کش می‌شد، شمارنده
      // روی عددِ اولین فراخوانی می‌ماند.
      final a = _Status(500);
      final api = _client(a);
      await probe(api.get('/x'));
      final afterFirst = a.calls;
      await probe(api.get('/x'));
      expect(a.calls, greaterThan(afterFirst),
          reason: 'خطا نباید کش شود — فراخوانی دوم باید واقعاً برود');
    }, timeout: t);

    test('خطای غیرِگذرا تلاشِ دوباره ندارد', () async {
      // ۴۰۳ دفعهٔ دوم هم همان جواب را می‌دهد؛ تلاشِ دوباره فقط کاربر
      // را دو برابر منتظر می‌گذارد.
      final a = _Status(403);
      final api = _client(a);
      await probe(api.get('/x'));
      expect(a.calls, 1,
          reason: 'خطای منطقی (۴۰۳) نباید retry شود');
    }, timeout: t);

    test('خطای گذرا دقیقاً یک بار تلاشِ دوباره دارد', () async {
      // نه صفر (وگرنه بلیپ‌ها به کاربر می‌رسند)، نه بیشتر (وگرنه
      // کاربر ثانیه‌ها منتظرِ چیزی می‌ماند که واقعاً قطع است).
      final a = _Status(503);
      final api = _client(a);
      await probe(api.get('/x'));
      expect(a.calls, 2,
          reason: 'باید دقیقاً یک تلاشِ دوباره باشد');
    }, timeout: t);

    test('بعد از خطا، درخواست بعدی واقعاً می‌رود', () async {
      // یعنی _inFlight پاک شده باشد. اگر نشود، مسیر برای همیشه قفل است.
      final a = _Status(500);
      final api = _client(a);
      await probe(api.get('/x'));
      final before = a.calls;
      await probe(api.get('/x'));
      expect(a.calls, greaterThan(before),
          reason: '_inFlight بعد از خطا پاک نشده — مسیر قفل شده');
    }, timeout: t);

    test('پاسخ موفق در پنجرهٔ کوتاه کش می‌شود', () async {
      final a = _Status(200, body: '{"a":1}');
      final api = _client(a);
      await api.get('/x');
      await api.get('/x');
      expect(a.calls, 1, reason: 'دو خواندن پشت سر هم باید یک درخواست باشد');
    }, timeout: t);

    test('fresh:true کش را دور می‌زند', () async {
      final a = _Status(200, body: '{"a":1}');
      final api = _client(a);
      await api.get('/x');
      await api.get('/x', fresh: true);
      expect(a.calls, 2);
    }, timeout: t);

    test('getAll هم روی خطا معلق نمی‌ماند', () async {
      final api = _client(_Status(503));
      expect(await probe(api.getAll(['/a', '/b'])), 'threw');
    }, timeout: t);
  });

  group('apiError پیام قابل فهم می‌دهد', () {
    test('پیام فارسی سرور بیرون کشیده می‌شود', () async {
      final api = _client(_Status(400, body: '{"message":"کد نامعتبر است"}'));
      try {
        await api.get('/x');
        fail('باید استثنا می‌داد');
      } catch (e) {
        expect(apiError(e), 'کد نامعتبر است');
      }
    }, timeout: t);

    test('بدون message یک پیام عمومی می‌دهد، نه رشتهٔ خالی', () async {
      final api = _client(_Status(500, body: '{}'));
      try {
        await api.get('/x');
        fail('باید استثنا می‌داد');
      } catch (e) {
        expect(apiError(e).trim(), isNotEmpty);
      }
    }, timeout: t);

    test('کد وضعیت قابل خواندن است', () async {
      final api = _client(_Status(409));
      try {
        await api.get('/x');
        fail('باید استثنا می‌داد');
      } catch (e) {
        expect(apiStatusCode(e), 409);
      }
    }, timeout: t);
  });
}
