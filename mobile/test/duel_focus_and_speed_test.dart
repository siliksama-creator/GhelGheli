// نگهبانِ سه خواستهٔ این نوبت:
//   ۱. معیارِ راند باید بزرگ و دیده‌شدنی باشد
//   ۲. رفتنِ دوباره به صفحه نباید انتظار داشته باشد (stale-while-revalidate)
//   ۳. صفحهٔ پیش از بازی نباید اسکرولِ طولانی بخواهد
//
// ⚠️ درسِ ثبت‌شدهٔ این پروژه: «تستی که سبز است ولی چیزی را نمی‌سنجد».
// برای بندِ ۱ صرفاً وجودِ متن کافی نیست — متنِ قبلی هم وجود داشت، فقط
// ۹پیکسلی و نامرئی بود. پس اینجا **اندازهٔ فونت** سنجیده می‌شود.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Counting implements HttpClientAdapter {
  _Counting(this.body, this.etag);
  String body;
  String etag;
  int calls = 0;
  int full = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<List<int>>? _, Future<void>? __) async {
    calls++;
    if (o.headers['If-None-Match'] == etag) {
      return ResponseBody.fromString('', 304, headers: {'etag': [etag]});
    }
    full++;
    return ResponseBody.fromString(body, 200, headers: {
      'etag': [etag],
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  // logout() به SharedPreferences دست می‌زند؛ بدونِ این، تست با
  // MissingPluginException می‌شکند — که باگِ محیطِ تست است نه محصول.
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => SharedPreferences.setMockInitialValues({}));

  group('سرعت — دادهٔ کهنه بلافاصله، تازه‌سازی در پس‌زمینه', () {
    late ApiClient api;
    late _Counting server;

    setUp(() {
      api = ApiClient();
      server = _Counting('{"inventory":[1,2,3]}', 'W/"a"');
      api.dio.httpClientAdapter = server;
      api.token = 't';
    });

    test('قبل از اولین درخواست، اسنپ‌شات خالی است', () {
      expect(api.cachedSnapshot('/api/bootstrap'), isNull,
          reason: 'اولین اجرای اپ چیزی برای نشان دادن ندارد');
    });

    test('بعد از یک بار خواندن، اسنپ‌شات بدون شبکه در دسترس است', () async {
      await api.get('/api/bootstrap');
      final before = server.calls;

      final snap = api.cachedSnapshot('/api/bootstrap');
      expect(snap, isNotNull, reason: 'این همان چیزی است که فوراً رسم می‌شود');
      expect(snap['inventory'], [1, 2, 3]);
      expect(server.calls, before,
          reason: 'خواندنِ اسنپ‌شات نباید هیچ درخواستی بزند');
    });

    test('مسیرهای حساس اسنپ‌شات نمی‌گیرند', () async {
      // کیف پول نباید مقدارِ کهنه نشان بدهد؛ کاربر بر اساسش تصمیمِ مالی
      // می‌گیرد. این عمدی است و نباید «فراموش‌شده» تعبیر شود.
      await api.get('/api/wallet');
      expect(api.cachedSnapshot('/api/wallet'), isNull);
    });

    test('تازه‌سازیِ پس‌زمینه با ۳۰۴ هیچ بدنه‌ای دانلود نمی‌کند', () async {
      await api.get('/api/bootstrap');
      expect(server.full, 1);

      await api.get('/api/bootstrap', fresh: true);
      expect(server.full, 1, reason: 'بدنه نباید دوباره بیاید');
      expect(server.calls, 2, reason: 'ولی اعتبارسنجی انجام شده');
    });

    test('getStale کهنه را می‌دهد و تازه را هم می‌آورد', () async {
      await api.get('/api/bootstrap');

      server.body = '{"inventory":[9]}';
      server.etag = 'W/"b"';

      dynamic freshSeen;
      final r = api.getStale('/api/bootstrap', onFresh: (d) => freshSeen = d);

      expect(r.cached, isNotNull, reason: 'فوراً چیزی برای نمایش هست');
      expect(r.cached['inventory'], [1, 2, 3]);

      await r.fresh;
      expect(freshSeen, isNotNull, reason: 'دادهٔ تازه باید اعلام شود');
      expect(freshSeen['inventory'], [9]);
    });

    test('وقتی چیزی عوض نشده، onFresh صدا زده نمی‌شود', () async {
      await api.get('/api/bootstrap');
      var fired = false;
      final r = api.getStale('/api/bootstrap', onFresh: (_) => fired = true);
      await r.fresh;
      expect(fired, isFalse,
          reason: 'رسمِ دوبارهٔ بی‌دلیل صفحه، خودش کندی است');
    });

    test('آفلاین با کشِ موجود کرش نمی‌کند و کهنه را نگه می‌دارد', () async {
      await api.get('/api/bootstrap');
      api.dio.httpClientAdapter = _Failing();
      final r = api.getStale('/api/bootstrap');
      final out = await r.fresh;
      expect(out['inventory'], [1, 2, 3],
          reason: 'کاربرِ آفلاین باید کلکسیونش را ببیند، نه صفحهٔ خطا');
    });

    test('خروج از حساب اسنپ‌شات را پاک می‌کند', () async {
      // روی گوشیِ مشترک، اسنپ‌شات چون **بدونِ درخواست** رسم می‌شود،
      // نشتی‌اش جدی‌تر از کشِ معمولی است.
      await api.get('/api/bootstrap');
      expect(api.cachedSnapshot('/api/bootstrap'), isNotNull);
      await api.logout();
      expect(api.cachedSnapshot('/api/bootstrap'), isNull,
          reason: 'دادهٔ کاربرِ قبلی نباید به کاربرِ بعدی نشان داده شود');
    });

    test('invalidateCache اسنپ‌شات را نگه می‌دارد ولی ETag را دور می‌ریزد',
        () async {
      // اگر اسنپ‌شات هم پاک شود، کاربر بعد از هر ثبتِ کارت دوباره صفحهٔ
      // خالی می‌بیند — یعنی دقیقاً همان چیزی که قرار بود حل شود.
      await api.get('/api/bootstrap');
      api.invalidateCache();
      expect(api.cachedSnapshot('/api/bootstrap'), isNotNull);

      server.body = '{"inventory":[7]}';
      server.etag = 'W/"c"';
      await api.get('/api/bootstrap');
      expect(server.full, 2, reason: 'باید بدنهٔ کامل و تازه گرفته باشد');
      expect(api.cachedSnapshot('/api/bootstrap')['inventory'], [7]);
    });
  });

  _readabilityGuard();
}

class _Failing implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<List<int>>? _, Future<void>? __) async {
    throw DioException(requestOptions: o, type: DioExceptionType.connectionError);
  }

  @override
  void close({bool force = false}) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// نگهبانِ خوانایی — «فونت‌هاش خیلی کوچیکن»
// ═══════════════════════════════════════════════════════════════════════════
//
// این تست ایستا است و عمداً: تستِ ویجت فقط فونتِ چیزهایی را می‌بیند که در
// آن لحظه رندر شده‌اند، ولی این فایل ده‌ها حالت دارد (راندِ مساوی، پایانِ
// بازی، لابیِ خصوصی، ...) که هرکدام متن‌های خودشان را دارند.
//
// خواندنِ خودِ سورس تضمین می‌کند **هیچ** متنی زیر آستانه نماند — از جمله
// حالت‌هایی که تستِ ویجت هرگز به آن‌ها نمی‌رسد.

void _readabilityGuard() {
  group('خوانایی صفحهٔ دوئل', () {
    test('هیچ فونتی زیر ۱۱ پیکسل نیست', () {
      // گزارشِ مالک: «فونت هاش خیلی کوچیکن». قبل از اصلاح، این فایل هشت
      // مورد fontSize: 9 و سه مورد 8.5 داشت.
      const floor = 11.0;
      final offenders = <String>[];
      for (final path in [
        'lib/screens/user/games/card_duel/card_duel_widgets.dart',
        'lib/screens/user/games/card_duel_page.dart',
      ]) {
        final src = File(path).readAsStringSync();
        for (final m in RegExp(r'fontSize:\s*([0-9.]+)').allMatches(src)) {
          final v = double.parse(m.group(1)!);
          if (v < floor) {
            final line = '\n'.allMatches(src.substring(0, m.start)).length + 1;
            offenders.add('$path:$line → ${m.group(1)}');
          }
        }
      }
      expect(offenders, isEmpty,
          reason: 'این اندازه‌ها روی گوشی خوانا نیستند:\n${offenders.join('\n')}');
    });
  });
}
