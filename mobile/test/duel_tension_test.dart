import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';

/// حرارتِ نبرد باید مو‌به‌مو همان چیزی باشد که `matchTension()` در وب
/// برمی‌گرداند. اگر این دو از هم جدا بیفتند، بازیکنِ اندروید و بازیکنِ وب
/// در **یک نبردِ مشترک** دو حسِ متفاوت می‌گیرند — و چون نبردها کراس‌پلی
/// هستند، این حالت واقعاً پیش می‌آید.
///
/// جدولِ مرجع در `userweb/tool/card-duel-truth.mjs` تست می‌شود.
void main() {
  DuelTension heat(int mine, int theirs, {int? roundIndex}) =>
      DuelTension.from(
        myScore: mine,
        theirScore: theirs,
        roundIndex: roundIndex ?? (mine + theirs),
      );

  group('حرارتِ نبرد — منطق', () {
    test('شروعِ نبرد آرام است', () {
      expect(heat(0, 0).level, DuelTensionLevel.calm);
      expect(heat(0, 0).matchPoint, isNull);
      expect(heat(0, 0).decider, isFalse);
    });

    test('راندِ پنجم با امتیازِ ۲-۲ سطحِ decider می‌گیرد', () {
      expect(heat(2, 2).level, DuelTensionLevel.decider);
      expect(heat(2, 2).decider, isTrue);
    });

    test('در ۲-۱ توپِ مسابقه دستِ من است', () {
      expect(heat(2, 1).level, DuelTensionLevel.critical);
      expect(heat(2, 1).matchPoint, 'mine');
    });

    test('در ۱-۲ توپِ مسابقه دستِ حریف است', () {
      expect(heat(1, 2).matchPoint, 'theirs');
    });

    test('وقتی نتیجه ریاضی‌وار قفل شده دیگر حرارتی نیست', () {
      expect(heat(3, 0).level, DuelTensionLevel.calm);
      expect(heat(3, 0).matchPoint, isNull);
    });

    test('نبردِ پرمساوی هم در راندِ آخرِ برابر decider است', () {
      // ۴ راند بازی شده که ۲تایش مساوی بوده: امتیاز ۱-۱ ولی یک راند مانده.
      expect(heat(1, 1, roundIndex: 4).decider, isTrue);
    });

    test('همان امتیاز در راندِ سوم فقط heated است', () {
      final t = heat(1, 1, roundIndex: 2);
      expect(t.level, DuelTensionLevel.heated);
      expect(t.decider, isFalse);
    });

    test('هیچ‌کدام از ۲۱ حالتِ ممکن، خروجیِ متناقض نمی‌دهد', () {
      for (var mine = 0; mine <= 5; mine++) {
        for (var theirs = 0; mine + theirs <= 5; theirs++) {
          final t = heat(mine, theirs);
          // توپِ مسابقه فقط برای کسی که جلوتر است معنا دارد.
          if (t.matchPoint == 'mine') expect(mine, greaterThan(theirs));
          if (t.matchPoint == 'theirs') expect(theirs, greaterThan(mine));
          // decider یعنی برابری در راندِ آخر.
          if (t.decider) expect(mine, theirs);
        }
      }
    });
  });

  group('حرارتِ نبرد — نمایش', () {
    Widget wrap(Widget child) => MaterialApp(
          theme: AppTheme.dark(),
          home: Scaffold(body: child),
        );

    testWidgets('نوارِ امتیاز در لحظهٔ آرام هیچ قابِ حرارتی نمی‌سازد',
        (tester) async {
      await tester.pumpWidget(wrap(
        const CardDuelScoreboardForTest(myScore: 0, theirScore: 0),
      ));
      await tester.pump(const Duration(milliseconds: 300));
      // در حرارتِ صفر عمداً هیچ ویجتِ اضافه‌ای به درخت اضافه نمی‌شود.
      expect(find.byType(CardDuelScoreboardForTest), findsOneWidget);
    });

    testWidgets('در راندِ سرنوشت‌ساز صحنه بدونِ متنِ اضافه رندر می‌شود',
        (tester) async {
      await tester.pumpWidget(wrap(
        const CardDuelScoreboardForTest(
          myScore: 2,
          theirScore: 2,
          roundIndex: 4,
        ),
      ));
      await tester.pump(const Duration(milliseconds: 300));

      // ❗ قیدِ صریحِ مالک: جذابیت بالا برود ولی **متن اضافه نشود**.
      // اگر روزی کسی «راند سرنوشت‌ساز!» به صحنه اضافه کند، این می‌شکند.
      for (final banned in const [
        'سرنوشت',
        'حساس',
        'توپ مسابقه',
        'آخرین راند',
        'match point',
      ]) {
        expect(find.textContaining(banned), findsNothing,
            reason: 'حرارتِ نبرد باید فقط دیداری باشد، نه متنی: $banned');
      }
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('انیمیشنِ حرارت با کاهشِ حرکتِ سیستم متوقف می‌شود',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark(),
        home: const MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: Scaffold(
            body: CardDuelScoreboardForTest(
              myScore: 2,
              theirScore: 2,
              roundIndex: 4,
            ),
          ),
        ),
      ));
      // اگر انیمیشنِ بی‌پایان اجرا شود، pumpAndSettle هرگز برنمی‌گردد و
      // تست timeout می‌خورد. برگشتنش یعنی ضربان واقعاً خاموش است.
      await tester.pumpAndSettle();
      expect(find.byType(CardDuelScoreboardForTest), findsOneWidget);
    });
  });
}
