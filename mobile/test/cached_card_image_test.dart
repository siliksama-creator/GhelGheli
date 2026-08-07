// تست‌های ویجتِ `CachedCardImage` — با تمرکز روی باگِ مسابقه.
//
// ═══════════════════════════════════════════════════════════════════════════
// باگی که این فایل برای گرفتنش نوشته شد
// ═══════════════════════════════════════════════════════════════════════════
//
// ویجت یک `didUpdateWidget` داشت که بازاستفادهٔ ویجت در لیست را مدیریت
// می‌کرد. ولی خودش با callbackِ ناهمگامِ `fetch` خنثی می‌شد:
//
//   t0  ویجت URL «الف» را می‌خواهد → fetch(الف) شروع (کندِ شبکه)
//   t1  فلاتر ویجت را برای URL «ب» بازاستفاده می‌کند
//   t2  fetch(الف) تمام می‌شود و نتیجه‌اش را روی «ب» می‌نشاند
//
// و چون `_syncHit` نقشه‌ای **استاتیک و مشترک** است، کلیدِ «ب» برای همیشه
// به فایلِ «الف» اشاره می‌کرد — یعنی یک مسابقهٔ لحظه‌ای به خرابیِ ماندگار
// تبدیل می‌شد که همهٔ صفحه‌های دیگر را هم مسموم می‌کرد.
//
// ⚠️ این باگ روی اینترنتِ سریع تقریباً هرگز دیده نمی‌شود. روی اینترنتِ
//    کندِ موبایلِ ایران با اسکرولِ سریع در اینونتوری، همان حالتِ عادی
//    است.
//
// ── چرا تست‌ها روی قرارداد و نه رندرِ واقعی‌اند ──
//
// رندرِ واقعی به `path_provider` (پلاگینِ بومی) و شبکه نیاز دارد که در
// تستِ واحد هیچ‌کدام نیستند. جایگزین‌ها یا mock کردنِ کانالِ پلتفرم است
// (شکننده) یا تزریقِ وابستگی به ویجت — یعنی عوض کردنِ API محصول برای
// راحتیِ تست. درسِ تکرارشدهٔ این پروژه: محصول را برای تست خراب نکن.
//
// پس منطقِ مسابقه اینجا **بازسازی** می‌شود، و یک گروهِ جدا مطمئن می‌شود
// کدِ واقعی هنوز همان محافظ را دارد.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/cached_card_image.dart';

void main() {
  final src =
      File('lib/widgets/cached_card_image.dart').readAsStringSync();
  // کامنت‌ها حذف می‌شوند: توضیحاتِ همین باگ نامِ متغیرها را ذکر می‌کنند
  // و بدونِ این کار، تست کامنت را با کد اشتباه می‌گیرد.
  final code = src
      .replaceAll(RegExp(r'//.*'), '')
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '');

  group('محافظِ مسابقه در کدِ واقعی', () {
    test('URL قبل از شروعِ fetch در متغیرِ محلی قفل می‌شود', () {
      expect(code.contains('final requested = _resolved'), isTrue,
          reason: 'بدونِ قفلِ محلی، نتیجهٔ کهنه روی URL تازه می‌نشیند');
    });

    test('نتیجهٔ کهنه دور ریخته می‌شود', () {
      expect(
          RegExp(r'if \(requested != _resolved\)\s*return').hasMatch(code),
          isTrue,
          reason: 'بدونِ این نگهبان، کارتِ ب تصویرِ کارتِ الف را می‌گیرد');
    });

    test('نگهبان **قبل** از setState است، نه داخلش', () {
      // اگر داخلِ setState باشد، یک rebuildِ بی‌دلیل رخ می‌دهد و بدتر:
      // ممکن است شاخه‌ای مقدار را بنویسد.
      final i = code.indexOf('requested != _resolved');
      final j = code.indexOf('setState', code.indexOf('.then('));
      expect(i > 0 && j > 0 && i < j, isTrue,
          reason: 'نگهبان باید قبل از setState اجرا شود');
    });

    test('نقشهٔ مشترک با کلیدِ قفل‌شده پر می‌شود نه فیلدِ کلاس', () {
      expect(code.contains('_rememberHit(requested'), isTrue);
      // نوشتنِ مستقیم با `_resolved` دقیقاً همان باگ بود.
      expect(RegExp(r'_syncHit\[_resolved\]\s*=').hasMatch(code), isFalse,
          reason: 'نوشتن با فیلدِ کلاس داخلِ callback = بازگشتِ باگ');
    });

    test('mounted هم بررسی می‌شود', () {
      expect(code.contains('if (!mounted) return'), isTrue,
          reason: 'setState بعد از dispose، باگِ تاریخیِ این پروژه است');
    });
  });

  group('کرانِ نقشهٔ مشترک', () {
    test('سقف تعریف شده است', () {
      final m = RegExp(r'_kSyncHitMax\s*=\s*(\d+)').firstMatch(code);
      expect(m, isNotNull, reason: 'نقشهٔ بدونِ سقف بی‌نهایت رشد می‌کند');
      final n = int.parse(m!.group(1)!);
      expect(n, greaterThanOrEqualTo(100),
          reason: 'کمتر از ۱۰۰ یعنی کلکسیونِ بزرگ مدام از کش می‌افتد');
    });

    test('هنگامِ پر شدن، ورودی حذف می‌شود', () {
      expect(code.contains('_syncHit.remove'), isTrue);
    });

    test('پاکسازی به زیرِ سقف می‌رسد نه دقیقاً روی سقف', () {
      // اگر تا خودِ سقف پاک شود، هر درجِ بعدی دوباره پاکسازی را
      // راه می‌اندازد.
      expect(code.contains('_kSyncHitMax * 3 ~/ 4'), isTrue);
    });
  });

  group('منطقِ مسابقه — بازسازی‌شده', () {
    test('نتیجهٔ کهنه نباید اعمال شود', () async {
      // شبیه‌سازیِ دقیقِ سناریو با دو Completer.
      String resolved = 'الف';
      String? applied;
      final Map<String, String> shared = {};

      Future<void> start(String url, Completer<String> c) async {
        final requested = url;
        final f = await c.future;
        if (requested != resolved) return;   // ← همان نگهبان
        shared[requested] = f;
        applied = f;
      }

      final slowA = Completer<String>();
      final fastB = Completer<String>();

      final jobA = start('الف', slowA);       // t0
      resolved = 'ب';                          // t1 بازاستفاده
      final jobB = start('ب', fastB);

      fastB.complete('فایلِ-ب');
      await jobB;
      slowA.complete('فایلِ-الف');            // t2 نتیجهٔ کهنه
      await jobA;

      expect(applied, 'فایلِ-ب',
          reason: 'تصویرِ نهایی باید مالِ URL فعلی باشد');
      expect(shared['ب'], 'فایلِ-ب',
          reason: 'نقشهٔ مشترک نباید با فایلِ کهنه مسموم شود');
      expect(shared.containsKey('الف'), isFalse,
          reason: 'درخواستِ رهاشده نباید چیزی در نقشه بگذارد');
    });

    test('بدونِ نگهبان همان تست شکست می‌خورد (اثباتِ اینکه تست بی‌اثر نیست)',
        () async {
      // ⚠️ این تست عمداً نسخهٔ **معیوب** را اجرا می‌کند تا ثابت شود
      //    تستِ بالا واقعاً چیزی را می‌گیرد. تستی که با کدِ خراب هم
      //    سبز بماند، ارزشی ندارد.
      String resolved = 'الف';
      final Map<String, String> shared = {};

      Future<void> buggy(String url, Completer<String> c) async {
        final f = await c.future;
        shared[resolved] = f;               // ← بدونِ نگهبان: فیلدِ کلاس
      }

      final slowA = Completer<String>();
      final jobA = buggy('الف', slowA);
      resolved = 'ب';
      slowA.complete('فایلِ-الف');
      await jobA;

      expect(shared['ب'], 'فایلِ-الف',
          reason: 'نسخهٔ معیوب باید دقیقاً همین خرابی را بسازد');
    });

    test('حذف از نقشه وقتی از سقف رد شود', () {
      const maxN = 300;
      final m = <String, int>{};
      for (var i = 0; i < 400; i++) {
        if (m.length >= maxN) {
          final drop = m.keys.take(m.length - (maxN * 3 ~/ 4)).toList();
          for (final k in drop) {
            m.remove(k);
          }
        }
        m['u$i'] = i;
      }
      expect(m.length, lessThanOrEqualTo(maxN));
      expect(m.containsKey('u399'), isTrue, reason: 'تازه‌ترین باید بماند');
      expect(m.containsKey('u0'), isFalse, reason: 'قدیمی‌ترین باید رفته باشد');
    });
  });

  group('رندرِ امن بدونِ شبکه و پلاگین', () {
    // در تستِ واحد `path_provider` پلاگینِ بومی ندارد، پس `fetch` استثنا
    // می‌دهد و کلاس آن را می‌بلعد و null برمی‌گرداند. یعنی ویجت باید به
    // `Image.network` عقب بنشیند — و مهم‌تر، **نباید کرش کند**.
    testWidgets('URL خالی کرش نمی‌دهد', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(body: CachedCardImage(url: '', width: 60, height: 80)),
      ));
      await t.pump();
      expect(testerOk(t), isTrue);
    });

    testWidgets('URL نامعتبر کرش نمی‌دهد', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: CachedCardImage(
                url: '/uploads/images/x.webp', width: 60, height: 80)),
      ));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      expect(testerOk(t), isTrue);
    });

    testWidgets('placeholder وقتی داده شود نمایش می‌یابد', (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: CachedCardImage(
              url: '', width: 60, height: 80, placeholder: Text('⚽')),
        ),
      ));
      await t.pump();
      expect(find.text('⚽'), findsOneWidget);
    });

    testWidgets('عوض شدنِ URL ویجت را نمی‌شکند', (t) async {
      // مسیرِ didUpdateWidget — همان جایی که باگ در آن زندگی می‌کرد.
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: CachedCardImage(
                url: '/uploads/images/a.webp', width: 60, height: 80)),
      ));
      await t.pump();
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: CachedCardImage(
                url: '/uploads/images/b.webp', width: 60, height: 80)),
      ));
      await t.pump();
      await t.pump(const Duration(milliseconds: 300));
      expect(testerOk(t), isTrue);
    });

    testWidgets('حذفِ ویجت وسطِ بارگذاری، setState بعد از dispose نمی‌دهد',
        (t) async {
      await t.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: CachedCardImage(
                url: '/uploads/images/c.webp', width: 60, height: 80)),
      ));
      await t.pump();
      await t.pumpWidget(const MaterialApp(home: Scaffold(body: SizedBox())));
      await t.pump(const Duration(milliseconds: 400));
      expect(testerOk(t), isTrue);
    });
  });
}

/// آیا تست تا اینجا استثنایی ندیده؟
bool testerOk(WidgetTester t) =>
    TestWidgetsFlutterBinding.instance.takeException() == null;
