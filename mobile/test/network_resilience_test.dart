// مقاومت شبکه — پیام‌های خطا، تلاشِ دوباره، و بازیابیِ خودکار.
//
// ═══════════════════════════════════════════════════════════════════════════
// چه چیزی این تست‌ها را ضروری کرد
// ═══════════════════════════════════════════════════════════════════════════
//
// گزارش مالک: «خطای ارتباط با سرور زیاد شده مخصوصا قسمت چت».
//
// اندازه‌گیری روی سرورِ زنده نشان داد مشکل از سرور نیست:
//
//     /api/chat/messages  →  ۸ میلی‌ثانیه، ۱۰ بار پیاپی، همه ۲۰۰
//     pm2 uptime          →  ۸ ساعت، load average 0.06
//
// پس خطاها از **شبکهٔ موبایل** می‌آمدند: یک قطعیِ یک‌ثانیه‌ای هنگام
// جابه‌جایی بین دکل‌ها یا سوییچ Wi‑Fi/داده. چت این را تشدید می‌کرد چون
// هر ۱۰ ثانیه poll می‌کند — در یک ساعت ۳۶۰ فرصت برای دیدنِ یک بلیپ.
//
// سه نقص پیدا شد که هر سه اینجا قفل می‌شوند:
//
//   ۱. `apiError` برای **هر** شکستی یک جملهٔ یکسان می‌داد — حتی برای
//      «درخواست لغو شد» که اصلاً خطا نیست.
//   ۲. هیچ تلاشِ دوباره‌ای نبود؛ یک بلیپ = یک خطای دیده‌شده.
//   ۳. چت بعد از اولین خطا **برای همیشه** از تازه‌سازی دست می‌کشید.
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/api_client.dart';

/// کامنت‌ها را از سورس حذف می‌کند.
///
/// بدون این، تست‌های ساختاری به **توضیحاتِ** کد گیر می‌دهند نه به خودِ
/// کد — و چون کامنت‌های این پروژه عمداً کدِ قدیمی را نقل می‌کنند تا
/// دلیلِ تغییر را ثبت کنند، این یک مثبتِ کاذبِ تضمینی بود.
String _stripComments(String src) => src
    .replaceAll(RegExp(r'^\s*///.*$', multiLine: true), '')
    .replaceAll(RegExp(r'^\s*//.*$', multiLine: true), '');

DioException _err(DioExceptionType type, {int? status, Object? data}) =>
    DioException(
      requestOptions: RequestOptions(path: '/x'),
      type: type,
      response: status == null
          ? null
          : Response<dynamic>(
              requestOptions: RequestOptions(path: '/x'),
              statusCode: status,
              data: data,
            ),
    );

void main() {
  group('پیامِ خطا با نوعِ خطا تطبیق دارد', () {
    test('پیامِ صریحِ سرور همیشه اولویت دارد', () {
      // سرور پیام‌های فارسیِ دقیق می‌فرستد («چرخش امروزت تمام شده»).
      // هیچ‌وقت نباید با یک پیامِ عمومی جایگزین شود.
      final e = _err(DioExceptionType.badResponse,
          status: 400, data: {'message': 'موجودی کافی نیست'});
      expect(apiError(e), 'موجودی کافی نیست');
    });

    test('پیامِ خالیِ سرور نادیده گرفته می‌شود', () {
      final e = _err(DioExceptionType.badResponse,
          status: 500, data: {'message': '   '});
      expect(apiError(e), isNot('   '));
      expect(apiError(e), isNotEmpty);
    });

    test('لغو شدن پیامِ خالی می‌دهد — چون خطا نیست', () {
      // ═══════════════════════════════════════════════════════════════
      // مهم‌ترین موردِ این گروه
      // ═══════════════════════════════════════════════════════════════
      //
      // وقتی کاربر پیش از رسیدنِ پاسخ تب را عوض می‌کند، درخواست لغو
      // می‌شود. این یک رخدادِ **کاملاً عادی** است، ولی قبلاً به
      // کاربر «خطای ارتباط با سرور» نشان داده می‌شد.
      //
      // بخش بزرگی از «زیاد شدنِ خطا» دقیقاً همین بود: خطاهایی که
      // اصلاً خطا نبودند.
      expect(apiError(_err(DioExceptionType.cancel)), isEmpty);
      expect(isCanceled(_err(DioExceptionType.cancel)), isTrue);
    });

    test('قطعیِ اینترنت پیامِ خودش را دارد', () {
      final m = apiError(_err(DioExceptionType.connectionError));
      expect(m, contains('اینترنت'));
      expect(m, isNot(contains('سرور')),
          reason: 'وقتی اینترنت نیست، مقصر سرور نیست');
    });

    test('تایم‌اوت‌ها از قطعی تفکیک می‌شوند', () {
      expect(apiError(_err(DioExceptionType.connectionTimeout)),
          contains('کند'));
      expect(apiError(_err(DioExceptionType.receiveTimeout)),
          contains('طول کشید'));
    });

    test('کدهای HTTP پیامِ معنادار دارند', () {
      final cases = {
        401: 'منقضی',
        403: 'دسترسی',
        404: 'پیدا نشد',
        429: 'صبر',
        500: 'سرور',
        503: 'سرور',
      };
      cases.forEach((code, needle) {
        final m = apiError(_err(DioExceptionType.badResponse, status: code));
        expect(m, contains(needle),
            reason: 'کد $code پیامِ مناسب نمی‌دهد: «$m»');
      });
    });

    test('خطای سوکتِ خام هم «اینترنت وصل نیست» می‌شود', () {
      // بیشترِ خطاهای شبکه در اندروید به‌صورت unknown با یک
      // SocketException داخلش می‌آیند.
      final e = DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.unknown,
        error: 'SocketException: Failed host lookup',
      );
      expect(apiError(e), contains('اینترنت'));
    });

    test('خطای غیر‌Dio هم پیامِ آبرومند دارد', () {
      expect(apiError(StateError('x')), isNotEmpty);
      expect(apiError('یک رشتهٔ خام'), isNotEmpty);
    });
  });

  group('تشخیصِ خطای گذرا برای تلاشِ دوباره', () {
    test('تایم‌اوت و قطعی گذرا هستند', () {
      for (final t in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.connectionError,
        DioExceptionType.unknown,
      ]) {
        expect(isTransient(_err(t)), isTrue, reason: '$t باید گذرا باشد');
      }
    });

    test('۵xx و ۴۲۹ گذرا هستند', () {
      expect(isTransient(_err(DioExceptionType.badResponse, status: 500)),
          isTrue);
      expect(isTransient(_err(DioExceptionType.badResponse, status: 503)),
          isTrue);
      expect(isTransient(_err(DioExceptionType.badResponse, status: 429)),
          isTrue);
    });

    test('۴xxِ منطقی گذرا نیستند — تلاشِ دوباره بی‌فایده است', () {
      // ═══════════════════════════════════════════════════════════════
      // چرا این سمتِ قرارداد هم مهم است
      // ═══════════════════════════════════════════════════════════════
      //
      // اگر ۴۰۳ را هم retry کنیم، کاربر دو برابر منتظر می‌ماند تا
      // همان جوابِ «دسترسی نداری» را بگیرد. بدتر: روی ۴۰۱ یعنی دو
      // درخواست با توکنِ مرده.
      for (final code in [400, 401, 403, 404, 409, 422]) {
        expect(isTransient(_err(DioExceptionType.badResponse, status: code)),
            isFalse,
            reason: 'کد $code نباید retry شود');
      }
    });

    test('لغو شدن گذرا نیست', () {
      // کاربر عمداً رفته؛ تلاشِ دوباره یعنی یک درخواستِ بی‌صاحبِ دیگر.
      expect(isTransient(_err(DioExceptionType.cancel)), isFalse);
    });

    test('خطای گواهی گذرا نیست', () {
      // مشکلِ پیکربندی است، نه شبکه.
      expect(isTransient(_err(DioExceptionType.badCertificate)), isFalse);
    });

    test('خطای غیر‌Dio گذرا حساب نمی‌شود', () {
      expect(isTransient(StateError('x')), isFalse);
    });
  });

  group('قرارداد retry در ApiClient', () {
    test('فقط GET تلاشِ دوباره دارد، نه POST', () {
      // ═══════════════════════════════════════════════════════════════
      // چرا این تستِ متنی است
      // ═══════════════════════════════════════════════════════════════
      //
      // تستِ رفتاری‌اش نیازمند یک سرورِ ساختگی است که بار اول شکست
      // بخورد و بار دوم موفق شود. ارزشش را ندارد وقتی چیزی که واقعاً
      // می‌خواهیم تضمین کنیم یک **قانونِ طراحی** است: هرگز POST را
      // retry نکن.
      //
      // یک پیامِ چتِ دوبار ارسال‌شده بدتر از یک خطاست، و همین‌طور یک
      // برداشتِ دوبار ثبت‌شده.
      // کامنت‌ها حذف می‌شوند: متنِ توضیحی این فایل عمداً همان
      // عبارت‌هایی را نقل می‌کند که دنبالشان می‌گردیم، و بدون این
      // پاک‌سازی تست به توضیحاتِ خودش گیر می‌دهد نه به کد.
      final src = _stripComments(
          File('lib/api_client.dart').readAsStringSync());

      final getBody = src.substring(
        src.indexOf('Future<dynamic> get('),
        src.indexOf('void invalidateCache('),
      );
      expect(getBody, contains('isTransient'),
          reason: 'GET باید فقط خطاهای گذرا را retry کند');
      expect(getBody, contains('Duration(milliseconds: 400)'),
          reason: 'باید یک مکثِ کوتاه پیش از تلاشِ دوباره باشد');

      // در متدهای نوشتنی نباید هیچ retryی باشد.
      //
      // مرزِ پایانی مهم است: توابعِ کمکیِ سطحِ فایل (مثل خودِ
      // `isTransient`) بعد از کلاس تعریف شده‌اند و اگر تا انتهای فایل
      // بخوانیم، تعریفِ تابع را با **استفاده**‌اش اشتباه می‌گیریم.
      final classEnd = src.indexOf('String apiError(');
      final writeBody =
          src.substring(src.indexOf('Future<dynamic> post('), classEnd);
      expect(writeBody.contains('isTransient'), isFalse,
          reason: 'POST/PATCH هرگز نباید retry شود — خطرِ ارسالِ دوباره');
      expect(writeBody.contains('Duration(milliseconds: 400)'), isFalse,
          reason: 'مکثِ retry نباید در مسیرِ نوشتن باشد');
      expect(writeBody, contains('dio.post'),
          reason: 'مرزها درست انتخاب نشده‌اند — بدنهٔ post پیدا نشد');
    });

    test('فقط یک تلاشِ دوباره، نه حلقه', () {
      // تلاشِ بی‌پایان یعنی کاربر ثانیه‌ها منتظرِ چیزی که واقعاً قطع
      // است. باید سریع تسلیم شویم و پیام بدهیم.
      final src = _stripComments(
          File('lib/api_client.dart').readAsStringSync());
      final getBody = src.substring(
        src.indexOf('Future<dynamic> get('),
        src.indexOf('void invalidateCache('),
      );
      // ⚠️ الگو عمداً `await dio.get(path` است، بدونِ پرانتزِ بسته.
      //
      // نسخهٔ قبلی دنبالِ `await dio.get(path)` دقیق می‌گشت. وقتی کشِ
      // شرطیِ ETag اضافه شد، فراخوانی به
      // `dio.get(path, options: opts)` تبدیل شد و این تست قرمز شد —
      // در حالی که رفتار (یک تلاشِ دوباره، بدونِ حلقه) اصلاً عوض نشده
      // بود. آن یک شکنندگیِ تست بود، نه باگِ محصول.
      //
      // این شکل هر دو حالت را می‌گیرد و همچنان جلوی حلقه را می‌گیرد،
      // چون دو بررسیِ بعدی وجودِ for/while را رد می‌کنند.
      expect('await dio.get(path'.allMatches(getBody).length, 2,
          reason: 'باید دقیقاً دو فراخوانی باشد: اصلی + یک تلاشِ دوباره');
      expect(getBody, isNot(contains('for (')),
          reason: 'نباید حلقهٔ retry باشد');
      expect(getBody, isNot(contains('while (')));
    });
  });

  group('چت خودش را از خطا بازیابی می‌کند', () {
    test('تازه‌سازی روی حالتِ خطا متوقف نمی‌شود', () {
      // ═══════════════════════════════════════════════════════════════
      // باگی که این تست قفلش می‌کند
      // ═══════════════════════════════════════════════════════════════
      //
      // `_refreshMessages` با `if (_error != null) return;` شروع
      // می‌شد. یعنی یک بلیپِ یک‌ثانیه‌ایِ شبکه هنگام باز کردنِ صفحه،
      // چت را تا بستن و باز کردنِ دوبارهٔ آن **مرده** می‌کرد: پیام‌ها
      // دیگر نمی‌آمدند.
      //
      // این «خطای زیاد» را دو برابر بد می‌کرد: هم خطا دیده می‌شد، هم
      // خودش را درمان نمی‌کرد.
      final src = _stripComments(
          File('lib/screens/user/chat_page.dart').readAsStringSync());
      final fn = src.substring(
        src.indexOf('Future<void> _refreshMessages()'),
        src.indexOf('void _scrollToBottom('),
      );
      expect(fn.contains('if (_error != null) return'), isFalse,
          reason: 'تازه‌سازی نباید به‌خاطر خطای قبلی متوقف بماند');
      expect(fn, contains('_error = null'),
          reason: 'تازه‌سازیِ موفق باید حالتِ خطا را پاک کند');
    });

    test('خطای لغو شده در چت نمایش داده نمی‌شود', () {
      final src = _stripComments(
          File('lib/screens/user/chat_page.dart').readAsStringSync());
      expect(src, contains('if (msg.isNotEmpty) _error = msg'),
          reason: 'پیامِ خالی (لغو) نباید به‌عنوان خطا نشان داده شود');
    });
  });
}
