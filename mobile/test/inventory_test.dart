// منطقِ صفحهٔ کلکسیون: مرتب‌سازی، جست‌وجو و آمار.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست
// ═══════════════════════════════════════════════════════════════════════════
//
// اینونتوری از یک نوارِ افقیِ سه‌کارتی به صفحه‌ای بازطراحی شد که باید با
// ~۵۰ نوع کارت کار کند. سه چیز اینجا می‌تواند بی‌صدا خراب شود و کاربر
// فقط حس کند «یک جای کار می‌لنگد»:
//
//   ۱. **آمار.** اگر `quantity` در ضرب فراموش شود، کاربری که سه نسخه از
//      یک کارت دارد ارزشش را یک‌سوم می‌بیند. هیچ خطایی هم نمی‌دهد.
//
//   ۲. **پایداریِ ترتیب.** اگر تساویِ زمان شکسته نشود، دو بارگذاری دو
//      ترتیب می‌دهد و لیست جلوی چشمِ کاربر می‌پرد.
//
//   ۳. **ورودیِ خراب.** دیتابیس `point_value` را گاهی رشته و
//      `cash_amount` را با اعشار برمی‌گرداند. تبدیلِ ساده با یک
//      FormatException کلِ صفحه را سفید می‌کند.
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/inventory_page.dart';

Map<String, dynamic> card(
  String name, {
  int qty = 1,
  Object points = 100,
  String? updated,
}) =>
    {
      'name': name,
      'quantity': qty,
      'point_value': points,
      'updated_at': updated,
    };

void main() {
  group('مرتب‌سازی', () {
    final items = [
      card('بلینگام', points: 300, updated: '2026-08-01T10:00:00Z'),
      card('آلوارز', points: 900, updated: '2026-08-03T10:00:00Z'),
      card('کین', points: 100, updated: '2026-08-02T10:00:00Z'),
    ];

    test('تازه‌ترین: جدیدترین اول', () {
      final r = filterAndSort(items, sort: InvSort.recent);
      expect(r.map((e) => e['name']), ['آلوارز', 'کین', 'بلینگام']);
    });

    test('باارزش‌ترین: بیشترین امتیاز اول', () {
      final r = filterAndSort(items, sort: InvSort.value);
      expect(r.map((e) => e['name']), ['آلوارز', 'بلینگام', 'کین']);
    });

    test('الفبا', () {
      final r = filterAndSort(items, sort: InvSort.name);
      expect(r.first['name'], 'آلوارز');
    });

    test('ورودی دست‌نخورده می‌ماند', () {
      // اگر sort روی آرایهٔ اصلی اجرا شود، ترتیبِ داده‌ای که بقیهٔ اپ
      // (مثلاً پیش‌نمایشِ داشبورد) از آن می‌خواند هم عوض می‌شود.
      final before = items.map((e) => e['name']).toList();
      filterAndSort(items, sort: InvSort.value);
      expect(items.map((e) => e['name']).toList(), before);
    });

    test('ترتیبِ مساوی پایدار است — لیست بین دو بارگذاری نمی‌پرد', () {
      final same = [
        card('ج', updated: '2026-08-01T10:00:00Z'),
        card('الف', updated: '2026-08-01T10:00:00Z'),
        card('ب', updated: '2026-08-01T10:00:00Z'),
      ];
      final a = filterAndSort(same, sort: InvSort.recent)
          .map((e) => e['name'])
          .toList();
      final b = filterAndSort(same.reversed.toList(), sort: InvSort.recent)
          .map((e) => e['name'])
          .toList();
      expect(a, b, reason: 'با زمانِ یکسان باید نامی مرتب شود');
      expect(a, ['الف', 'ب', 'ج']);
    });

    test('نبودِ تاریخ کرش نمی‌دهد', () {
      final r = filterAndSort([card('بی‌تاریخ'), card('دار', updated: 'xx')],
          sort: InvSort.recent);
      expect(r.length, 2);
    });
  });

  group('جست‌وجو', () {
    final items = [card('هری کین'), card('بلینگام'), card('کیمیش')];

    test('زیررشته پیدا می‌شود', () {
      expect(filterAndSort(items, query: 'کی').length, 2);
    });

    test('فاصلهٔ اضافه نادیده گرفته می‌شود', () {
      expect(filterAndSort(items, query: '  بلینگام  ').length, 1);
    });

    test('خالی یعنی همه', () {
      expect(filterAndSort(items, query: '   ').length, 3);
    });

    test('بی‌نتیجه لیست خالی می‌دهد نه خطا', () {
      expect(filterAndSort(items, query: 'مسی'), isEmpty);
    });
  });

  group('آمار کلکسیون', () {
    test('تعداد و ارزش با احتساب quantity', () {
      final s = collectionStats([
        card('الف', qty: 3, points: 100),
        card('ب', qty: 2, points: 250),
      ]);
      expect(s.kinds, 2);
      expect(s.total, 5);
      // ۳×۱۰۰ + ۲×۲۵۰ = ۸۰۰. اگر quantity فراموش شود ۳۵۰ می‌شود.
      expect(s.points, 800);
    });

    test('کلکسیون خالی صفر می‌دهد', () {
      final s = collectionStats([]);
      expect(s.kinds, 0);
      expect(s.total, 0);
      expect(s.points, 0);
    });

    test('مقدارِ رشته‌ای و اعشاری از دیتابیس کرش نمی‌دهد', () {
      // pg برای NUMERIC رشته برمی‌گرداند و برای بعضی ستون‌ها '250.00'.
      final s = collectionStats([
        card('الف', qty: 2, points: '150'),
        card('ب', qty: 1, points: '250.00'),
      ]);
      expect(s.points, 550);
    });

    test('مقدارِ null صفر حساب می‌شود نه کرش', () {
      final s = collectionStats([
        {'name': 'خراب', 'quantity': null, 'point_value': null},
      ]);
      expect(s.total, 0);
      expect(s.points, 0);
    });
  });

  group('نشانِ «جدید»', () {
    test('کارتِ امروز جدید است', () {
      expect(
          isNewCard({
            'updated_at':
                DateTime.now().subtract(const Duration(hours: 2)).toIso8601String()
          }),
          isTrue);
    });

    test('کارتِ دیروز هنوز جدید است — پنجرهٔ ۴۸ ساعته', () {
      // کاربری که شب ثبت می‌کند و فردا شب اپ را باز می‌کند باید نشان را
      // ببیند. با پنجرهٔ ۲۴ ساعته دقیقاً همین کاربر از قلم می‌افتاد.
      expect(
          isNewCard({
            'updated_at': DateTime.now()
                .subtract(const Duration(hours: 30))
                .toIso8601String()
          }),
          isTrue);
    });

    test('کارتِ هفتهٔ پیش جدید نیست', () {
      expect(
          isNewCard({
            'updated_at':
                DateTime.now().subtract(const Duration(days: 7)).toIso8601String()
          }),
          isFalse);
    });

    test('بدون تاریخ یا با تاریخِ خراب، جدید نیست', () {
      expect(isNewCard({}), isFalse);
      expect(isNewCard({'updated_at': 'not-a-date'}), isFalse);
    });
  });
}
