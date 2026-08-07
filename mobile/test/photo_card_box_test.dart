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
import 'package:ghelgheli_mobile/widgets/card_frame_guide.dart';
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
      // اپ تک‌تم است؛ پارامتر `dark` فقط برای سازگاریِ امضا مانده.
      theme: AppTheme.dark(),
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
    testWidgets('وقتی طرحی ثبت نشده، پیامِ روشن می‌دهد نه سکوت', (t) async {
      // ══════════════════════════════════════════════════════════════
      // ⚠️ این تست **برعکس** شد و دلیلش مهم است
      // ══════════════════════════════════════════════════════════════
      //
      // نسخهٔ قبلی انتظار داشت «هیچ‌چیز نشان نمی‌دهد» با استدلالِ
      // «بهتر از نشان دادنِ بخشی که همیشه شکست می‌خورد».
      //
      // آن استدلال یک چیز را نادیده می‌گرفت: بنرِ «ثبت کارت‌های قلقلی»
      // و متنِ تبلیغاتی‌اش در `dashboard_page` هستند نه در این ویجت.
      // پس آن‌ها می‌ماندند و فقط این بخش ناپدید می‌شد.
      //
      // چیزی که کاربر می‌دید: بنرِ بزرگ، توضیحِ اینکه کارت‌ها در
      // فروشگاه‌ها فروخته می‌شوند، و **هیچ راهی برای ثبت**. مالک با
      // اسکرین‌شات پرسید «الان کاربر چطوری کارت ثبت کنه؟!»
      //
      // این تست داشت رفتارِ غلط را قفل می‌کرد — بدترین کاری که یک تست
      // می‌تواند بکند، چون هر تلاشی برای اصلاح را قرمز نشان می‌داد.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _off)})));
      await t.pumpAndSettle();
      // فرمِ ثبت نباید باشد…
      expect(find.text('دوربین'), findsNothing);
      // …ولی کاربر باید بفهمد چرا.
      expect(find.textContaining('هنوز فعال نشده'), findsOneWidget);
      expect(find.textContaining('کارتی در سیستم تعریف نشده'), findsOneWidget);
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
    //
    // ═════════════════════════════════════════════════════════════════
    // چرا این تست‌ها بازنویسی شدند
    // ═════════════════════════════════════════════════════════════════
    //
    // فرم برای شکایتِ مالک («نوارش خیلی دراز شده») جمع‌وجور شد و این
    // راهنما از سه خطِ همیشه‌باز به یک خلاصهٔ یک‌خطی + جزئیاتِ تاشو
    // تبدیل شد.
    //
    // ⚠️ نکتهٔ مهمی که هنگام بازنویسی معلوم شد: از سه تستِ قبلی فقط
    //    **یکی** شکست. دو تای دیگر سبز ماندند — نه چون درست بودند،
    //    بلکه چون `AnimatedCrossFade` فرزندِ پنهان را در درختِ ویجت
    //    نگه می‌دارد. یعنی `find.text('0')` چیزی را پیدا می‌کرد که
    //    کاربر اصلاً نمی‌دید.
    //
    //    این همان دسته تستی است که «سبز بودنش هیچ چیزی را ثابت
    //    نمی‌کند». حالا با `hitTestable()` بررسی می‌شود که واقعاً
    //    قابلِ دیدن و لمس باشد.
    testWidgets('خلاصهٔ راهنما بدون نیاز به خطا دیده می‌شود', (t) async {
      // اگر فقط بعد از شکست نشان داده می‌شد، کاربر یکی از پنج تلاشش را
      // بی‌دلیل سوزانده بود و به قفلِ سه‌ساعته نزدیک‌تر شده بود.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect(find.textContaining('صفر و O'), findsOneWidget,
          reason: 'خلاصهٔ هشدار باید همیشه دیده شود، نه فقط بعد از خطا');
    });

    testWidgets('جزئیات پیش‌فرض بسته است — فرم باید کوتاه بماند', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      // `hitTestable` و نه صرفاً `findsNothing`: AnimatedCrossFade
      // فرزندِ پنهان را در درخت نگه می‌دارد، پس تنها راهِ صادقانهٔ
      // پرسیدنِ «کاربر می‌بیندش؟» همین است.
      expect(find.text('بزرگ یا کوچک بودنِ حروف مهم نیست. ').hitTestable(),
          findsNothing);
    });

    testWidgets('با ضربه باز می‌شود و هر پنج نویسه دیده می‌شود', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      await t.tap(find.textContaining('صفر و O'));
      await t.pumpAndSettle();
      for (final ch in ['0', 'O', '1', 'I', 'L']) {
        expect(find.text(ch).hitTestable(), findsWidgets,
            reason: 'نویسهٔ $ch بعد از باز شدن دیده نمی‌شود');
      }
    });

    testWidgets('بعد از باز شدن، بزرگ/کوچک بودن هم گفته می‌شود', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      await t.tap(find.textContaining('صفر و O'));
      await t.pumpAndSettle();
      expect(find.textContaining('بزرگ یا کوچک').hitTestable(), findsOneWidget);
    });

    testWidgets('دوباره زدن می‌بنددش', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      await t.tap(find.textContaining('صفر و O'));
      await t.pumpAndSettle();
      await t.tap(find.textContaining('صفر و O'));
      await t.pumpAndSettle();
      expect(find.textContaining('بزرگ یا کوچک').hitTestable(), findsNothing);
    });
  });

  group('جمع‌وجور بودنِ فرم', () {
    // ── چرا ارتفاع تست می‌شود ──
    //
    // شکایتِ مالک عددی نبود («نوارش خیلی دراز شده») ولی اگر تستی نگذاریم،
    // اولین قابلیتِ بعدی دوباره درازش می‌کند و کسی متوجه نمی‌شود. این
    // تست سقفی می‌گذارد که رد شدن از آن باید تصمیمِ آگاهانه باشد.
    testWidgets('فرمِ خالی از ۴۲۰ پیکسل بلندتر نیست', (t) async {
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      final h = t.getSize(find.byType(PhotoCardBox)).height;
      expect(h, lessThan(420),
          reason: 'فرم دوباره دراز شده — ارتفاع $h پیکسل');
    });

    testWidgets('جایگاهِ عکس و فیلدِ کد در یک ردیف‌اند', (t) async {
      // این چیدمان بزرگ‌ترین صرفه‌جوییِ ارتفاع است (~۱۶۰ پیکسل). اگر
      // کسی دوباره عمودی‌شان کند، فرم بی‌صدا بلند می‌شود.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      // ⚠️ روی خودِ `SizedBox` کلیددار و نه روی متنِ «عکس کارت».
      //    نسخهٔ اولِ این تست متن را می‌گرفت و شکست — چون آن متن در
      //    مرکزِ عمودیِ جایگاهِ ۱۱۰ پیکسلی است و پایین‌تر از فیلدِ کد
      //    می‌افتد، حتی وقتی چیدمان کاملاً درست است. تست باید مرزِ
      //    خودِ عنصر را بسنجد نه محتوایش.
      final slot = t.getRect(find.byKey(const ValueKey('pcPhotoSlot')));
      final field = t.getRect(find.byType(TextField));
      // هم‌پوشانیِ عمودی یعنی کنارِ هم‌اند، نه زیرِ هم.
      expect(slot.top < field.bottom && field.top < slot.bottom, isTrue,
          reason: 'عکس و فیلدِ کد دیگر در یک ردیف نیستند');
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

  // ═══════════════════════════════════════════════════════════════════════
  // چند نسخه از یک کارت
  // ═══════════════════════════════════════════════════════════════════════
  //
  // این گروه رفتاری را قفل می‌کند که یک بار اشتباه پیاده شده بود:
  // ویجت بعد از هر ثبتِ موفق عکس را پاک می‌کرد، با این فرض که «کارتِ
  // بعدی عکسِ دیگری دارد».
  //
  // آن فرض غلط بود. کارت‌ها سری‌ای چاپ می‌شوند و پنج نسخهٔ یک کارت پنج
  // عکسِ **کاملاً یکسان** دارند که فقط کدشان فرق می‌کند. با پاک شدنِ
  // عکس، کاربر مجبور می‌شد پنج بار از پنج کارتِ یکسان عکس بگیرد.
  group('چند نسخه از یک کارت', () {
    testWidgets('راهنمای «چند نسخه» به کاربر نشان داده می‌شود', (t) async {
      // بدونِ این جمله، کاربر یا بی‌دلیل چند بار عکس می‌گیرد یا فکر
      // می‌کند فقط یک کد قابل ثبت است و بقیه را دور می‌ریزد.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect(find.textContaining('چند نسخه از یک کارت'), findsOneWidget);
      expect(find.textContaining('پشت‌سرهم'), findsOneWidget);
    });

    testWidgets('فیلدِ کد FocusNode دارد تا بعد از ثبت دوباره فوکوس بگیرد',
        (t) async {
      // ── چرا این تست ارزش دارد ──
      //
      // بدونِ `focusNode`، فراخوانیِ `_codeFocus.requestFocus()` بعد از
      // ثبتِ موفق بی‌اثر است: نودی که به هیچ ویجتی وصل نیست فوکوس
      // نمی‌گیرد و کیبورد بسته می‌ماند. خطایی هم پرتاب نمی‌شود، پس
      // باگ کاملاً بی‌صدا می‌ماند و فقط در دستِ کاربرِ واقعی حس می‌شود.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      final field = t.widget<TextField>(find.byType(TextField));
      expect(field.focusNode, isNotNull,
          reason: 'بدون FocusNode، فوکوسِ خودکار بعد از ثبت کار نمی‌کند');
    });

    testWidgets('حالتِ duplicate_pending دیگر در کد وجود ندارد', (t) async {
      // اگر روزی کسی گاردِ «عکسِ تکراری» را برگرداند «تا امن‌تر شود»،
      // این متن دوباره ظاهر می‌شود و تست قرمز می‌گردد.
      await t.pumpWidget(_wrap(_api({'/api/photo-cards/status': (200, _on)})));
      await t.pumpAndSettle();
      expect(find.textContaining('این عکس قبلاً ارسال شده'), findsNothing);
    });
  });

  group('راهنمای کادرِ دوربین', () {
    // ── چرا این تست‌ها ──
    //
    // راهنما بینِ کاربر و دوربین می‌ایستد. اگر خراب شود، کاربر اصلاً
    // نمی‌تواند عکس بگیرد — یعنی کلِ قابلیت از کار می‌افتد. و چون
    // مسیرِ دوربین در تستِ خودکار قابلِ اجرا نیست، دستِ‌کم باید
    // مطمئن شویم خودِ شیت سالم رندر می‌شود.
    testWidgets('شیتِ راهنما بدونِ خطا باز می‌شود', (t) async {
      await t.pumpWidget(MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showCardFrameGuide(ctx),
                child: const Text('باز کن'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('باز کن'));
      await t.pumpAndSettle();
      expect(find.textContaining('عکسِ خوب'), findsOneWidget);
      expect(_clean(), isTrue);
    });

    testWidgets('هر دو نمونهٔ درست و اشتباه نشان داده می‌شوند', (t) async {
      // نشان دادنِ «اشتباه» عمدی است: کاربر اشتباهِ خودش را در آن
      // می‌بیند و سریع‌تر می‌فهمد تا از توضیحِ «درست».
      await t.pumpWidget(MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showCardFrameGuide(ctx),
                child: const Text('باز کن'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('باز کن'));
      await t.pumpAndSettle();
      expect(find.text('درست'), findsOneWidget);
      expect(find.text('اشتباه'), findsOneWidget);
    });

    testWidgets('«بی‌خیال» false برمی‌گرداند تا دوربین باز نشود', (t) async {
      // ⚠️ اگر این بشکند، کاربری که منصرف شده باز هم دوربینش باز
      //    می‌شود — رفتاری که کاملاً غیرمنتظره است.
      bool? result;
      await t.pumpWidget(MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  result = await showCardFrameGuide(ctx);
                },
                child: const Text('باز کن'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('باز کن'));
      await t.pumpAndSettle();
      // ⚠️ اسکرول لازم است و این خودش یافتهٔ مهمی است: روی صفحهٔ
      //    ۸۰۰×۶۰۰ (و گوشیِ کوچک) دکمه‌ها زیرِ لبه می‌افتند. شیت
      //    `SingleChildScrollView` دارد پس کاربر می‌تواند برسد، ولی
      //    تست باید همان کار را بکند وگرنه چیزی را می‌سنجد که کاربر
      //    نمی‌بیند.
      await t.scrollUntilVisible(find.text('بی‌خیال'), 200,
          scrollable: find.byType(Scrollable).last);
      await t.pumpAndSettle();
      await t.tap(find.text('بی‌خیال'));
      await t.pumpAndSettle();
      expect(result, isFalse);
    });

    testWidgets('«متوجه شدم» true برمی‌گرداند', (t) async {
      bool? result;
      await t.pumpWidget(MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  result = await showCardFrameGuide(ctx);
                },
                child: const Text('باز کن'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('باز کن'));
      await t.pumpAndSettle();
      await t.scrollUntilVisible(find.textContaining('متوجه شدم'), 200,
          scrollable: find.byType(Scrollable).last);
      await t.pumpAndSettle();
      await t.tap(find.textContaining('متوجه شدم'));
      await t.pumpAndSettle();
      expect(result, isTrue);
    });
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
