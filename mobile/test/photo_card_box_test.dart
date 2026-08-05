/// تست‌های ویجتِ «ثبت کارت با عکس» در اپ اندروید.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا این تست‌ها وجود دارند
/// ═══════════════════════════════════════════════════════════════════════════
///
/// این ویجت روی **صفحهٔ اصلیِ** کاربر می‌نشیند — همان صفحه‌ای که مسیرِ
/// «ثبت کد کارت» هم آنجاست و روی پول واقعی کار می‌کند. اگر این ویجت
/// استثنا پرتاب کند، کلِ داشبورد سفید می‌شود، نه فقط این بخش.
///
/// دقیقاً همین یک بار در وب‌اپ اتفاق افتاد (`React is not defined`) در
/// حالی که build سبز بود. پس اینجا حالت‌های خطا و مرزی تست می‌شوند، نه
/// فقط «حالت خوش‌بینانه».
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/api_client.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';
import 'package:ghelgheli_mobile/widgets/photo_card_box.dart';

/// آداپتور ساختگی: پاسخِ هر مسیر را دیکته می‌کند.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.routes);
  final Map<String, (int, String)> routes;
  final List<String> calls = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add(options.path);
    final r = routes[options.path];
    if (r == null) {
      return ResponseBody.fromString('{"message":"یافت نشد"}', 404, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      });
    }
    return ResponseBody.fromString(r.$2, r.$1, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _api(Map<String, (int, String)> routes) {
  final api = ApiClient()..token = 'fake';
  api.dio.httpClientAdapter = _FakeAdapter(routes);
  return api;
}

Widget _wrap(ApiClient api, {bool dark = true}) => MaterialApp(
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(child: PhotoCardBox(api: api)),
      ),
    );

const _on = '{"available":true,"designCount":2,"pendingCount":0}';
const _off = '{"available":false,"designCount":0,"pendingCount":0}';

/// آیا در این فریم استثنایی رخ داده؟
bool _clean() =>
    TestWidgetsFlutterBinding.instance.takeException() == null;

void main() {
  group('نمایش شرطی', () {
    testWidgets('وقتی طرحی ثبت نشده، هیچ‌چیز نشان نمی‌دهد', (t) async {
      // بهتر از نشان دادن بخشی که همیشه شکست می‌خورد.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _off)})));
      await t.pumpAndSettle();
      expect(find.text('دوربین'), findsNothing);
    });

    testWidgets('وقتی طرح هست، بخش دیده می‌شود', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect(find.text('دوربین'), findsOneWidget);
      expect(find.text('گالری'), findsOneWidget);
    });

    testWidgets('خطای شبکه صفحه را نمی‌شکند', (t) async {
      // ── مهم‌ترین تستِ این فایل ──
      // اگر خطای این درخواستِ فرعی بالا برود، کاربر به‌جای «یک بخشِ
      // غایب» یک داشبوردِ خراب می‌بیند.
      //
      // نکتهٔ زمان‌بندی: ApiClient برای خطاهای گذرا (۵xx) عمداً یک بار
      // بعد از ۴۰۰ms دوباره تلاش می‌کند؛ تست باید آن تایمر را جلو ببرد.
      await t.pumpWidget(
          _wrap(_api({'/api/photo-cards/status': (500, '{"message":"خطا"}')})));
      await t.pump(const Duration(milliseconds: 500));
      await t.pumpAndSettle();
      expect(_clean(), isTrue);
      expect(find.text('دوربین'), findsNothing);
    });

    testWidgets('پاسخِ بدشکل کرش نمی‌کند', (t) async {
      await t.pumpWidget(
          _wrap(_api({'/api/photo-cards/status': (200, '{"x":1}')})));
      await t.pumpAndSettle();
      expect(find.text('دوربین'), findsNothing);
    });
  });

  group('راهنمای حروفِ مبهم', () {
    // خواستهٔ صریح مالک: کاربر باید بداند 0/O و 1/I/L شبیه‌اند و
    // بزرگ/کوچک بودن مهم نیست.
    testWidgets('راهنما بدون نیاز به خطا دیده می‌شود', (t) async {
      // اگر فقط بعد از شکست نشان داده می‌شد، کاربر یکی از پنج تلاشش را
      // بی‌دلیل سوزانده بود.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect(find.textContaining('دقت کنید'), findsOneWidget);
    });

    testWidgets('هر پنج نویسهٔ مبهم نام برده شده‌اند', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      for (final ch in ['0', 'O', '1', 'I', 'L']) {
        expect(find.text(ch), findsWidgets, reason: 'نویسهٔ $ch نام برده نشده');
      }
    });

    testWidgets('گفته شده بزرگ/کوچک بودن مهم نیست', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect(find.textContaining('بزرگ یا کوچک'), findsOneWidget);
    });
  });

  group('دکمهٔ ثبت', () {
    Future<FilledButton> btn(WidgetTester t) async => t.widget<FilledButton>(
          find.ancestor(
            of: find.text('ثبت کارت'),
            matching: find.byType(FilledButton),
          ),
        );

    testWidgets('بدون عکس و کد غیرفعال است', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect((await btn(t)).onPressed, isNull);
    });

    testWidgets('فقط با کد و بدون عکس هم غیرفعال می‌ماند', (t) async {
      // ── قلبِ ضدتقلب ──
      // کد به‌تنهایی کافی نیست. اگر روزی کسی این شرط را بردارد، همان
      // نقصی برمی‌گردد که این قابلیت برای رفعش ساخته شد.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), 'GHP-A2B3-C4D5');
      await t.pump();
      expect((await btn(t)).onPressed, isNull,
          reason: 'کد بدون عکس نباید کافی باشد');
    });
  });

  group('هر دو تم', () {
    for (final dark in [true, false]) {
      testWidgets('در تم ${dark ? 'تیره' : 'روشن'} سالم رندر می‌شود', (t) async {
        await t.pumpWidget(
            _wrap(_api({'/api/photo-cards/status': (200, _on)}), dark: dark));
        await t.pumpAndSettle();
        expect(find.text('دوربین'), findsOneWidget);
        expect(_clean(), isTrue);
      });
    }
  });

  group('چرخهٔ عمر', () {
    testWidgets('حذف ویجت وسطِ درخواست، setState بعد از dispose نمی‌دهد',
        (t) async {
      // باگ تاریخی این پروژه: «setState() called after dispose()» که در
      // حالت release به‌صورت صفحهٔ قرمز ظاهر می‌شد. کاربر می‌تواند
      // بلافاصله بعد از باز شدن صفحه به تب دیگری برود.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pump(const Duration(milliseconds: 1));
      await t.pumpWidget(const MaterialApp(home: SizedBox()));
      await t.pump(const Duration(milliseconds: 500));
      await t.pumpAndSettle();
      expect(_clean(), isTrue);
    });
  });
}
