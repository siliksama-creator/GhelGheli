import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';
import 'package:ghelgheli_mobile/theme/app_theme.dart';

void main() {
  group('حقیقتِ زاویهٔ دید دوئل Android', () {
    final round = <String, dynamic>{
      'winner': 'X',
      'cardX': {'name': 'Jude Bellingham'},
      'cardO': {'name': 'ربات وینگر'},
      'powerX': 95,
      'powerO': 80,
      'focusStatX': 95,
      'focusStatO': 80,
      'breakdownX': {'focus': 95, 'effectBonus': 0, 'total': 95},
      'breakdownO': {'focus': 80, 'effectBonus': 0, 'total': 80},
    };

    test('کاربر X، Jude و ۹۵ را مال خود و برنده می‌بیند', () {
      final view = CardDuelRoundPerspective.from(round, 'X');
      expect(view.mine['name'], 'Jude Bellingham');
      expect(view.myPower, 95);
      expect(view.iWon, isTrue);
      expect(view.contractValid, isTrue);
    });

    test('همان payload برای کاربر O بی‌جهت flip نمی‌شود', () {
      final view = CardDuelRoundPerspective.from(round, 'O');
      expect(view.mine['name'], 'ربات وینگر');
      expect(view.myPower, 80);
      expect(view.iWon, isFalse);
      expect(view.contractValid, isTrue);
    });

    test('تناقضِ عدد و winner شناسایی می‌شود', () {
      final broken = {...round, 'winner': 'O'};
      expect(CardDuelRoundPerspective.from(broken, 'X').contractValid, isFalse);
      expect(CardDuelRoundPerspective.from(broken, 'O').contractValid, isFalse);
    });
  });

  testWidgets('اسکوربورد، عدد تو را سمت راست و عدد ربات را سمت چپ نگه می‌دارد',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark(),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: SizedBox(
            width: 420,
            child: CardDuelScoreboardForTest(
              myScore: 2,
              theirScore: 1,
              lastWinner: 'X',
            ),
          ),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    final myScore = find.descendant(
      of: find.byType(CircleAvatar),
      matching: find.text('۲'),
    );
    final robotScore = find.descendant(
      of: find.byType(CircleAvatar),
      matching: find.text('۱'),
    );
    expect(myScore, findsOneWidget);
    expect(robotScore, findsOneWidget);
    expect(tester.getCenter(myScore).dx,
        greaterThan(tester.getCenter(robotScore).dx));
    expect(find.text('+۱ امتیاز برای تو'), findsOneWidget);
  });

  testWidgets('برد فنی آنلاین از امتیاز ناقص راندها جدا و صریح است',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark(),
      home: const Scaffold(
        body: CardDuelScoreboardForTest(
          myScore: 1,
          theirScore: 3,
          finalWinner: 'X',
          finalView: true,
          finishedByDisconnect: true,
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('برد فنی برای تو'), findsOneWidget,
        reason: 'قطع اتصال نباید با مقایسهٔ score، برنده را برعکس کند');
  });

  testWidgets(
      'نوارِ کارت قبل از انتخاب، ویژگی + افکت = عدد نهایی را نشان می‌دهد',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark(),
      home: const Scaffold(
        body: Center(
          child: CardDuelFocusRibbonForTest(
            card: {'speed': 70, 'effect': 'speedster'},
            stat: 'speed',
            roundIndex: 0,
            previousRoundWon: false,
          ),
        ),
      ),
    ));
    expect(find.text('۷۰+۶=۷۶'), findsOneWidget,
        reason: 'کاربر باید پیش از انتخاب دقیقاً همان عدد موتور را ببیند');
  });
}
