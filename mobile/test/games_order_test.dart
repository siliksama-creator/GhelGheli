// ترتیب و کامل بودن فهرست بازی‌ها.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// فهرست بازی‌ها در اپ **هاردکد** است (`_games` در games_page.dart) و از
// `/api/games` خوانده نمی‌شود. این یعنی هر بازی جدیدی که در سرور اضافه
// شود، باید جداگانه اینجا هم اضافه شود — و دقیقاً همین یک بار فراموش شد:
//
//   بازی «ضربات پنالتی» در سرور ثبت شده بود، صفحهٔ بازی‌اش نوشته شده
//   بود، مسیرش در `switch` وجود داشت — ولی چون در `_games` نبود،
//   **هیچ راهی برای باز کردنش از اپ وجود نداشت**. کاملاً نامرئی.
//
// این تست هر دو چیز را قفل می‌کند: اینکه همهٔ بازی‌ها در فهرست باشند، و
// اینکه ترتیبشان همانی باشد که مالک خواست («بازی پنالتی باید پایین
// ضربه زن باشه»).
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

/// شناسه‌های بازی را به ترتیبِ ظاهر شدن از سورس در می‌آورد.
List<String> _idsFrom(String src, RegExp re) =>
    re.allMatches(src).map((m) => m.group(1)!).toList();

void main() {
  final hub = File('lib/screens/user/games_page.dart').readAsStringSync();
  final catalog = File('../backend/src/games/index.js').readAsStringSync();

  // `_GameEntry('penalty', ...)` → penalty
  final appIds = _idsFrom(hub, RegExp(r"_GameEntry\('([a-z0-9_]+)'"));
  // `id: 'penalty',` داخل CATALOG
  final serverIds = _idsFrom(
      catalog.substring(catalog.indexOf('const CATALOG')),
      RegExp(r"id: '([a-z0-9_]+)'"));

  group('فهرست بازی‌های اپ', () {
    test('خالی نیست', () {
      expect(appIds, isNotEmpty);
    });

    test('پنالتی در فهرست هست — یک بار کاملاً جا افتاده بود', () {
      expect(appIds, contains('penalty'),
          reason: 'بدون این، بازی از اپ قابل دسترس نیست');
    });

    test('پنالتی دقیقاً بعد از ضربه‌زن است — درخواست مالک', () {
      final iTap = appIds.indexOf('tap');
      final iPen = appIds.indexOf('penalty');
      expect(iTap, greaterThanOrEqualTo(0), reason: 'ضربه‌زن باید باشد');
      expect(iPen, greaterThan(iTap),
          reason: '«بازی پنالتی باید پایین ضربه زن باشه»');
    });

    test('هیچ شناسهٔ تکراری نیست', () {
      expect(appIds.toSet().length, appIds.length);
    });

    test('هر بازی مسیر باز شدن دارد', () {
      // اگر شناسه‌ای در `_games` باشد ولی در `switch` نه، کارت نمایش
      // داده می‌شود و زدنش هیچ کاری نمی‌کند.
      for (final id in appIds) {
        expect(hub, contains("case '$id':"),
            reason: '$id در switch باز کردن صفحه نیست');
      }
    });
  });

  group('هماهنگی با سرور', () {
    test('هر بازی سرور در اپ هم هست', () {
      for (final id in serverIds) {
        expect(appIds, contains(id),
            reason: '$id در سرور هست ولی در فهرست اپ نیست');
      }
    });

    test('در سرور هم پنالتی بعد از ضربه‌زن است', () {
      final iTap = serverIds.indexOf('tap');
      final iPen = serverIds.indexOf('penalty');
      expect(iPen, greaterThan(iTap),
          reason: 'ترتیب سرور و اپ باید یکی بماند');
    });
  });
}
