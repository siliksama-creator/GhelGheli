import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/coin_award.dart';
import 'package:ghelgheli_mobile/widgets/coin_chip.dart';

/// قراردادِ سکه در UI — همان چیزی که سرور در `game:settlement` می‌فرستد.
///
/// ⚠️ مهم‌ترین بندِ این قرارداد: **`coins == 0` یعنی هیچ چیزی رسم نشود.**
/// سکه فقط به برندهٔ یک مسابقهٔ شرط‌دارِ آنلاین مقابل انسان می‌رسد، آن هم
/// اگر سهمیهٔ روزش پر نشده و لیگی فعال باشد. مساوی، بازگشتِ ورودی، بازی
/// با ربات، تمرینِ رایگان و باخت همه صفر می‌دهند. اگر روزی کسی این ویجت
/// را طوری تغییر دهد که «۰ سکه» چاپ کند، کاربر فکر می‌کند سیستم خراب است
/// در حالی که فقط سکه‌ای در کار نبوده. این تست دقیقاً همان را می‌بندد.

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(width: 320, child: child),
        ),
      ),
    );

void main() {
  group('CoinAward', () {
    testWidgets('برنده مقدار سکه را با علامت + می‌بیند', (tester) async {
      await tester.pumpWidget(_wrap(const CoinAward(amount: 20, mine: true)));
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.text('+۲۰ سکه'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('بازنده می‌بیند سکه به حریف رسید', (tester) async {
      await tester.pumpWidget(_wrap(const CoinAward(amount: 2, mine: false)));
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.text('۲ سکه به حریف'), findsOneWidget);
      // متنِ برنده نباید جایی دیده شود؛ بازنده نباید فکر کند سکه گرفته.
      expect(find.textContaining('+'), findsNothing);
    });

    testWidgets('صفر سکه هیچ چیزی رسم نمی‌کند — نه متن، نه آیکون',
        (tester) async {
      for (final mine in [true, false]) {
        await tester.pumpWidget(_wrap(CoinAward(amount: 0, mine: mine)));
        await tester.pump(const Duration(milliseconds: 600));

        expect(find.textContaining('سکه'), findsNothing,
            reason: 'مساوی/refund/ربات/باخت هرگز نباید «۰ سکه» نشان دهد');
        expect(find.byType(Image), findsNothing);
      }
    });

    testWidgets('مقدار منفی هم مثل صفر ساکت می‌ماند', (tester) async {
      // سرور هرگز منفی نمی‌فرستد (سکه فقط اضافه می‌شود و کسر ندارد)، ولی
      // اگر پارسِ خرابی روزی منفی بدهد، UI نباید «-۵ سکه» چاپ کند.
      await tester.pumpWidget(_wrap(const CoinAward(amount: -5, mine: true)));
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.textContaining('سکه'), findsNothing);
    });

    testWidgets('انیمیشنِ برنده در عرضِ باریک overflow نمی‌دهد',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 200,
              child: const CoinAward(amount: 1000, mine: true),
            ),
          ),
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(tester.takeException(), isNull);
    });
  });

  group('CoinChip', () {
    testWidgets('عدد را با رقم فارسی نشان می‌دهد', (tester) async {
      await tester.pumpWidget(_wrap(const CoinChip(value: 1234)));
      await tester.pump();
      expect(find.text('۱٬۲۳۴'), findsOneWidget);
    });

    testWidgets('null مثل صفر خوانده می‌شود و کرش نمی‌کند', (tester) async {
      // ردیف‌های آرشیوِ لیگ‌های قدیمی کلید `coins` را ندارند؛ جدول باید
      // بدون سکه هم رسم شود، نه اینکه صفحه سفید شود.
      await tester.pumpWidget(_wrap(const CoinChip(value: null)));
      await tester.pump();
      expect(find.text('۰'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('مقدار رشته‌ای هم کرش نمی‌کند', (tester) async {
      await tester.pumpWidget(_wrap(const CoinChip(value: 'abc')));
      await tester.pump();
      expect(find.text('۰'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
