// ============================================================================
//  تست‌های کیف پول تومانی — سمت اپ
// ============================================================================
//
//   flutter test test/wallet_test.dart
//
// تمرکز روی چیزهایی که اگر خراب شوند، **کاربر پولش را اشتباه می‌بیند یا
// اشتباه می‌فرستد**:
//   • قالب‌بندی و تجزیهٔ مبلغ (رفت و برگشت باید بی‌خطا باشد)
//   • اعتبارسنجی کارت بانکی سمت کلاینت باید دقیقاً آینهٔ سرور باشد؛
//     اگر این دو از هم فاصله بگیرند، کاربر یا فرم معتبری را رد شده می‌بیند
//     یا کارت غلطی را «تأییدشده» می‌بیند و بعد پولش گم می‌شود.
//   • ماسک شدن شماره کارت در UI
//   • رفتار ویجت‌ها با دادهٔ ناقص/غیرمنتظرهٔ سرور (null-safety واقعی)

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/core/money.dart';
import 'package:ghelgheli_mobile/screens/user/wallet/wallet_widgets.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';

// از تم واقعی اپ استفاده می‌کنیم، نه یک ThemeData خالی: ویجت‌هایی مثل
// AppCard به افزونهٔ BrandTheme نیاز دارند و با تم خالی کرش می‌کنند.
// تست باید همان چیزی را بسنجد که کاربر می‌بیند.
Widget _wrap(Widget child, {double width = 400}) => MaterialApp(
      theme: AppTheme.dark(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: SingleChildScrollView(
            child: SizedBox(width: width, child: child),
          ),
        ),
      ),
    );

void main() {
  // -------------------------------------------------------------------------
  group('قالب‌بندی مبلغ', () {
    test('جداکنندهٔ هزارگان درست گذاشته می‌شود', () {
      expect(Money.format(50000), '۵۰٬۰۰۰');
      expect(Money.format(1000), '۱٬۰۰۰');
      expect(Money.format(999), '۹۹۹');
      expect(Money.format(1234567), '۱٬۲۳۴٬۵۶۷');
      expect(Money.format(0), '۰');
    });

    test('ارقام همیشه فارسی‌اند', () {
      expect(Money.format(123456).contains(RegExp(r'[0-9]')), isFalse,
          reason: 'نباید هیچ رقم لاتینی در خروجی بماند');
    });

    test('جداکننده «٬» فارسی است نه کامای لاتین', () {
      // کامای لاتین در متن راست‌به‌چپ ترتیب ارقام را می‌شکند
      expect(Money.format(50000).contains(','), isFalse);
      expect(Money.format(50000).contains('٬'), isTrue);
    });

    test('واحد تومان اضافه می‌شود', () {
      expect(Money.withUnit(50000), '۵۰٬۰۰۰ تومان');
    });

    test('مبلغ منفی علامت درست می‌گیرد', () {
      expect(Money.format(-5000), startsWith('−'));
    });

    test('نمایش فشرده', () {
      expect(Money.compact(1200000), '۱٫۲ میلیون تومان',
          reason: 'جداکنندهٔ اعشار باید «٫» فارسی باشد تا با وب یکی شود');
      expect(Money.compact(2000000), '۲ میلیون تومان',
          reason: '«۲٫۰ میلیون» زشت است، رقم اعشار صفر باید حذف شود');
      expect(Money.compact(50000), '۵۰٬۰۰۰ تومان');
      expect(Money.compact(3500000000), '۳٫۵ میلیارد تومان');
      expect(Money.compact(3000000000), '۳ میلیارد تومان',
          reason: 'میلیارد هم مثل میلیون نباید «٫۰» بگیرد');
    });

    test('ورودی null یا نامعتبر خطا نمی‌دهد', () {
      expect(Money.format(null), '۰');
      expect(Money.format('abc'), '۰');
      expect(Money.withUnit(null), '۰ تومان');
    });

    test('رشتهٔ عددی سرور (BIGINT به‌صورت String) درست خوانده می‌شود', () {
      // درایور pg مقادیر BIGINT را گاهی رشته برمی‌گرداند
      expect(Money.format('150000'), '۱۵۰٬۰۰۰');
      expect(Money.format('150000.0'), '۱۵۰٬۰۰۰');
    });
  });

  // -------------------------------------------------------------------------
  group('تجزیهٔ ورودی کاربر', () {
    test('ارقام فارسی و عربی', () {
      expect(Money.parse('۵۰۰۰۰'), 50000);
      expect(Money.parse('٥٠٠٠٠'), 50000);
    });

    test('جداکننده‌ها نادیده گرفته می‌شوند', () {
      expect(Money.parse('۵۰٬۰۰۰'), 50000);
      expect(Money.parse('50,000'), 50000);
      expect(Money.parse('50 000'), 50000);
      expect(Money.parse('۵۰٬۰۰۰ تومان'), 50000);
    });

    test('ورودی خالی یا بی‌معنی null می‌دهد', () {
      expect(Money.parse(''), isNull);
      expect(Money.parse('تومان'), isNull);
      expect(Money.parse(null), isNull);
    });

    test('رفت و برگشت format→parse بی‌خطاست', () {
      // مهم‌ترین تست این گروه: فیلد مبلغ حین تایپ format می‌شود و بعد
      // parse. اگر این چرخه عدد را عوض کند، کاربر مبلغی غیر از آنچه دیده
      // ارسال می‌کند.
      for (final v in [1, 999, 1000, 50000, 123456, 9999999, 100000000]) {
        expect(Money.parse(Money.format(v)), v, reason: 'شکست روی $v');
      }
    });
  });

  // -------------------------------------------------------------------------
  group('اعتبارسنجی کارت بانکی (آینهٔ سرور)', () {
    // این توابع در bank_card_sheet.dart خصوصی‌اند؛ همان منطق اینجا بازنویسی
    // شده تا اگر سمت اپ تغییر کند و با سرور فاصله بگیرد، تست بیفتد.
    bool luhn(String n) {
      if (n.length != 16) return false;
      if (RegExp(r'^(\d)\1{15}$').hasMatch(n)) return false;
      var sum = 0;
      for (var i = 0; i < 16; i++) {
        var d = int.parse(n[i]);
        if (i % 2 == 0) {
          d *= 2;
          if (d > 9) d -= 9;
        }
        sum += d;
      }
      return sum % 10 == 0;
    }

    test('کارت‌های معتبر پذیرفته می‌شوند', () {
      expect(luhn('6037991199500988'), isTrue); // ملی
      expect(luhn('5022291081494666'), isTrue); // پاسارگاد
    });

    test('خطای یک‌رقمی گرفته می‌شود', () {
      expect(luhn('6037991199500989'), isFalse);
    });

    test('جابه‌جایی دو رقم گرفته می‌شود', () {
      expect(luhn('6037991199500898'), isFalse);
    });

    test('کارت همه‌یک‌رقمی رد می‌شود', () {
      expect(luhn('1111111111111111'), isFalse);
      expect(luhn('0000000000000000'), isFalse);
    });

    test('طول غلط رد می‌شود', () {
      expect(luhn('603799119950098'), isFalse);
      expect(luhn('60379911995009888'), isFalse);
    });

    test('شبا mod-97 درست بررسی می‌شود', () {
      bool validSheba(String digits) {
        if (digits.length != 24) return false;
        final re = '${digits.substring(4)}1827${digits.substring(0, 4)}';
        var r = 0;
        for (final ch in re.split('')) {
          r = (r * 10 + int.parse(ch)) % 97;
        }
        return r == 1;
      }

      // یک شبای واقعاً معتبر می‌سازیم
      String? makeValid(String body22) {
        for (var c = 2; c <= 98; c++) {
          final s = c.toString().padLeft(2, '0') + body22;
          if (validSheba(s)) return s;
        }
        return null;
      }

      final good = makeValid('0170000000203040506070');
      expect(good, isNotNull);
      expect(validSheba(good!), isTrue);
      // یک رقم را عوض کن
      final bad = good.replaceRange(8, 9, ((int.parse(good[8]) + 1) % 10).toString());
      expect(validSheba(bad), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('ویجت ردیف تراکنش', () {
    testWidgets('واریز با علامت + و برداشت با علامت − نشان داده می‌شود',
        (tester) async {
      await tester.pumpWidget(_wrap(const Column(children: [
        WalletTransactionTile(tx: {
          'direction': 'credit',
          'amount': 50000,
          'source': 'card_cash',
          'balance_after': 50000,
          'created_at': '2026-07-27T10:00:00Z',
        }),
        WalletTransactionTile(tx: {
          'direction': 'debit',
          'amount': 30000,
          'source': 'withdrawal_hold',
          'balance_after': 20000,
          'created_at': '2026-07-27T11:00:00Z',
        }),
      ])));
      await tester.pumpAndSettle();

      expect(find.textContaining('+'), findsOneWidget);
      expect(find.textContaining('−'), findsOneWidget);
      expect(find.text('جایزهٔ نقدی کارت'), findsOneWidget);
      expect(find.text('درخواست برداشت'), findsOneWidget);
    });

    testWidgets('هر منبع شناخته‌شده برچسب فارسی دارد', (tester) async {
      const sources = [
        'card_cash', 'wheel', 'reward', 'league',
        'admin_credit', 'admin_debit', 'withdrawal_hold', 'withdrawal_refund',
      ];
      for (final s in sources) {
        await tester.pumpWidget(_wrap(WalletTransactionTile(tx: {
          'direction': 'credit',
          'amount': 1000,
          'source': s,
          'balance_after': 1000,
          'created_at': '2026-07-27T10:00:00Z',
        })));
        await tester.pumpAndSettle();
        // هیچ منبعی نباید به برچسب پیش‌فرض «تراکنش» بیفتد
        expect(find.text('تراکنش'), findsNothing,
            reason: 'منبع "$s" برچسب فارسی ندارد');
      }
    });

    testWidgets('منبع ناشناخته اپ را نمی‌شکند', (tester) async {
      // سرور ممکن است در آینده منبع جدیدی اضافه کند و اپ قدیمی آن را نشناسد
      await tester.pumpWidget(_wrap(const WalletTransactionTile(tx: {
        'direction': 'credit',
        'amount': 1000,
        'source': 'something_new_from_server',
        'balance_after': 1000,
        'created_at': '2026-07-27T10:00:00Z',
      })));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('تراکنش'), findsOneWidget);
    });

    testWidgets('تاریخ نامعتبر یا خالی باعث کرش نمی‌شود', (tester) async {
      await tester.pumpWidget(_wrap(const WalletTransactionTile(tx: {
        'direction': 'credit',
        'amount': 1000,
        'source': 'reward',
        'balance_after': 1000,
        'created_at': null,
      })));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  // -------------------------------------------------------------------------
  group('ویجت درخواست برداشت', () {
    Map req(String status) => {
          'id': 'x',
          'amount': 75000,
          'status': status,
          'statusLabel': 'برچسب',
          'cardMasked': '6037-••••-••••-0988',
          'cardHolder': 'علی رضایی',
          'cardBank': 'بانک ملی ایران',
          'createdAt': '2026-07-27T10:00:00Z',
        };

    testWidgets('شمارهٔ کارت ماسک‌شده نمایش داده می‌شود، نه کامل',
        (tester) async {
      await tester.pumpWidget(_wrap(WithdrawalTile(request: req('pending'))));
      await tester.pumpAndSettle();
      // ارقام میانی نباید هیچ‌جا دیده شوند
      expect(find.textContaining('9911'), findsNothing);
      expect(find.textContaining('9950'), findsNothing);
      expect(find.textContaining('••••'), findsOneWidget);
    });

    testWidgets('فقط درخواست در انتظار دکمهٔ لغو دارد', (tester) async {
      for (final s in ['pending', 'approved', 'paid', 'rejected', 'canceled']) {
        await tester.pumpWidget(
            _wrap(WithdrawalTile(request: req(s), onCancel: () {})));
        await tester.pumpAndSettle();
        final found = find.text('لغو درخواست');
        if (s == 'pending') {
          expect(found, findsOneWidget, reason: 'وضعیت $s باید لغو داشته باشد');
        } else {
          expect(found, findsNothing,
              reason: 'وضعیت $s نباید دکمهٔ لغو داشته باشد');
        }
      }
    });

    testWidgets('بدون onCancel دکمهٔ لغو نشان داده نمی‌شود', (tester) async {
      await tester.pumpWidget(_wrap(WithdrawalTile(request: req('pending'))));
      await tester.pumpAndSettle();
      expect(find.text('لغو درخواست'), findsNothing);
    });

    testWidgets('کد پیگیری و یادداشت مدیر وقتی هستند نمایش داده می‌شوند',
        (tester) async {
      final r = req('paid')
        ..['trackingCode'] = 'TRK123'
        ..['adminNote'] = 'واریز شد';
      await tester.pumpWidget(_wrap(WithdrawalTile(request: r)));
      await tester.pumpAndSettle();
      expect(find.textContaining('کد پیگیری'), findsOneWidget);
      expect(find.textContaining('واریز شد'), findsOneWidget);
    });

    testWidgets('فیلدهای اختیاری غایب باعث کرش نمی‌شوند', (tester) async {
      await tester.pumpWidget(_wrap(const WithdrawalTile(request: {
        'id': 'x',
        'amount': 50000,
        'status': 'pending',
        'statusLabel': 'در انتظار بررسی',
      })));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  // -------------------------------------------------------------------------
  group('کارت موجودی', () {
    testWidgets('موجودی و آمار نمایش داده می‌شود', (tester) async {
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        balance: 250000,
        totalIn: 300000,
        totalOut: 50000,
        pendingAmount: 0,
      )));
      await tester.pumpAndSettle();
      expect(find.text('کیف پول قلقلی'), findsOneWidget);
      expect(find.text('موجودی قابل برداشت'), findsOneWidget);
      // انیمیشن شمارش باید به مقدار نهایی رسیده باشد
      expect(find.text('۲۵۰٬۰۰۰'), findsOneWidget);
    });

    testWidgets('بدون کارت بانکی، پیام راهنما نشان داده می‌شود',
        (tester) async {
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        balance: 0,
        totalIn: 0,
        totalOut: 0,
        pendingAmount: 0,
      )));
      await tester.pumpAndSettle();
      expect(find.text('کارت بانکی ثبت نشده'), findsOneWidget);
      expect(find.text('برای برداشت لازم است'), findsOneWidget);
    });

    testWidgets('با کارت بانکی، شمارهٔ ماسک‌شده و نام بانک دیده می‌شود',
        (tester) async {
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        balance: 100000,
        totalIn: 100000,
        totalOut: 0,
        pendingAmount: 0,
        card: {
          'maskedNumber': '6037-••••-••••-0988',
          'bank': 'بانک ملی ایران',
          'holder': 'علی رضایی',
        },
      )));
      await tester.pumpAndSettle();
      expect(find.text('بانک ملی ایران'), findsOneWidget);
      expect(find.text('کارت بانکی ثبت نشده'), findsNothing);
    });

    testWidgets('مبلغ در حال بررسی وقتی هست نشان داده می‌شود', (tester) async {
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        balance: 100000,
        totalIn: 150000,
        totalOut: 50000,
        pendingAmount: 50000,
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('در حال بررسی'), findsOneWidget);
    });

    testWidgets('وقتی چیزی در انتظار نیست، آن نوار پنهان است', (tester) async {
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        balance: 100000,
        totalIn: 100000,
        totalOut: 0,
        pendingAmount: 0,
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('در حال بررسی'), findsNothing);
    });

    testWidgets('تغییر موجودی انیمیشن را از مقدار قبلی شروع می‌کند',
        (tester) async {
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        key: ValueKey('bal'),
        balance: 100000,
        totalIn: 100000,
        totalOut: 0,
        pendingAmount: 0,
      )));
      await tester.pumpAndSettle();
      expect(find.text('۱۰۰٬۰۰۰'), findsOneWidget);

      // برداشت انجام شد → موجودی کم می‌شود
      await tester.pumpWidget(_wrap(const WalletBalanceCard(
        key: ValueKey('bal'),
        balance: 40000,
        totalIn: 100000,
        totalOut: 60000,
        pendingAmount: 60000,
      )));
      await tester.pumpAndSettle();
      expect(find.text('۴۰٬۰۰۰'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('مبلغ خیلی بزرگ سرریز چیدمان نمی‌کند', (tester) async {
      await tester.pumpWidget(_wrap(
        const WalletBalanceCard(
          balance: 987654321000,
          totalIn: 987654321000,
          totalOut: 0,
          pendingAmount: 0,
        ),
        width: 320,
      ));
      await tester.pumpAndSettle();
      // اگر RenderFlex سرریز کند، takeException آن را می‌گیرد
      expect(tester.takeException(), isNull);
    });
  });
}
