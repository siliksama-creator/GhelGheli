// ============================================================================
//  تست ورودی کیف پول از هدر داشبورد
// ============================================================================
//
//   flutter test test/wallet_entry_test.dart
//
// کیف پول از نوار پایین به «بیشتر» منتقل شد. یعنی نوار طلایی داخل هدر
// داشبورد **تنها راه سریع** رسیدن به آن است؛ اگر این نوار نمایش داده نشود
// یا کلیکش کار نکند، کاربر عملاً به پولش دسترسی ندارد. پس اینجا سخت‌گیرانه
// آزموده می‌شود.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/shared/hero_header.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';

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

HeroHeader _hero({
  int points = 100,
  Map<String, dynamic>? user,
  VoidCallback? onOpenWallet,
  VoidCallback? onOpenProfile,
}) =>
    HeroHeader(
      points: points,
      nickname: 'قهرمان',
      nextReward: const {'name': 'جایزه اول', 'required_points': 500},
      user: user ??
          const {
            'first_name': 'علی',
            'last_name': 'رضایی',
            'age': 25,
            'province': 'تهران',
            'city': 'تهران',
            'bank_account': '6037',
            'wallet_balance': 0,
          },
      onOpenProfile: onOpenProfile,
      onOpenWallet: onOpenWallet,
    );

void main() {
  group('نوار کیف پول در هدر', () {
    testWidgets('وقتی onOpenWallet داده شود نمایش داده می‌شود',
        (tester) async {
      await tester.pumpWidget(_wrap(_hero(onOpenWallet: () {})));
      await tester.pumpAndSettle();
      expect(find.text('کیف پول من'), findsOneWidget);
    });

    testWidgets('بدون onOpenWallet اصلاً رندر نمی‌شود', (tester) async {
      // مثلاً در جایی که هدر بدون قابلیت پرش استفاده شود، نباید نوار مرده
      // و بی‌فایده نشان داده شود.
      await tester.pumpWidget(_wrap(_hero()));
      await tester.pumpAndSettle();
      expect(find.text('کیف پول من'), findsNothing);
    });

    testWidgets('کلیک روی نوار، کیف پول را باز می‌کند', (tester) async {
      var opened = 0;
      await tester.pumpWidget(_wrap(_hero(onOpenWallet: () => opened++)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('کیف پول من'));
      await tester.pumpAndSettle();
      expect(opened, 1, reason: 'کلیک باید دقیقاً یک بار callback را صدا بزند');
    });

    testWidgets('کلیک روی دکمهٔ کناری هم همان کار را می‌کند', (tester) async {
      var opened = 0;
      await tester.pumpWidget(_wrap(_hero(
        user: const {'wallet_balance': 250000},
        onOpenWallet: () => opened++,
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.text('برداشت'));
      await tester.pumpAndSettle();
      expect(opened, 1);
    });
  });

  group('نمایش موجودی', () {
    testWidgets('موجودی با جداکنندهٔ فارسی نشان داده می‌شود', (tester) async {
      await tester.pumpWidget(_wrap(_hero(
        user: const {'wallet_balance': 250000},
        onOpenWallet: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('۲۵۰٬۰۰۰'), findsOneWidget);
      expect(find.text('تومان'), findsOneWidget);
    });

    testWidgets('موجودی صفر «مشاهده» می‌گوید نه «برداشت»', (tester) async {
      // دعوت به برداشت وقتی پولی نیست، کاربر را به بن‌بست می‌برد.
      await tester.pumpWidget(_wrap(_hero(
        user: const {'wallet_balance': 0},
        onOpenWallet: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('مشاهده'), findsOneWidget);
      expect(find.text('برداشت'), findsNothing);
    });

    testWidgets('با موجودی مثبت «برداشت» نشان داده می‌شود', (tester) async {
      await tester.pumpWidget(_wrap(_hero(
        user: const {'wallet_balance': 75000},
        onOpenWallet: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('برداشت'), findsOneWidget);
      expect(find.text('مشاهده'), findsNothing);
    });

    testWidgets('موجودی به‌صورت رشته (BIGINT سرور) هم درست خوانده می‌شود',
        (tester) async {
      // درایور pg گاهی BIGINT را رشته برمی‌گرداند
      await tester.pumpWidget(_wrap(_hero(
        user: const {'wallet_balance': '340000'},
        onOpenWallet: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('۳۴۰٬۰۰۰'), findsOneWidget);
    });

    testWidgets('نبودِ کلید wallet_balance باعث کرش نمی‌شود', (tester) async {
      // اپ جدید مقابل سرور قدیمی (قبل از مایگریشن کیف پول)
      await tester.pumpWidget(_wrap(_hero(
        user: const {'first_name': 'علی'},
        onOpenWallet: () {},
      )));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('۰'), findsOneWidget);
    });
  });

  group('چیدمان', () {
    testWidgets('روی گوشی باریک سرریز نمی‌کند', (tester) async {
      await tester.pumpWidget(_wrap(
        _hero(user: const {'wallet_balance': 987654321}, onOpenWallet: () {}),
        width: 320,
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('همراه با نوار تکمیل پروفایل هم جا می‌شود', (tester) async {
      // هر دو نوار با هم نمایش داده می‌شوند؛ این بیشترین ارتفاع ممکن هدر است.
      await tester.pumpWidget(_wrap(
        _hero(
          user: const {'wallet_balance': 120000}, // پروفایل ناقص
          onOpenWallet: () {},
          onOpenProfile: () {},
        ),
        width: 320,
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('کیف پول من'), findsOneWidget);
      expect(find.textContaining('تکمیل پروفایل'), findsOneWidget);
    });
  });
}
