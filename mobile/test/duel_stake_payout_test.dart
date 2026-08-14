import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(
        body: SizedBox(width: 320, height: 520, child: child),
      ),
    );

void main() {
  testWidgets('واریز برنده با مبلغ و موجودی authoritative پرواز می‌کند',
      (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelStakePayoutForTest(
      amount: 180,
      mineWon: true,
      balanceAfter: 2480,
    )));
    await tester.pump(const Duration(milliseconds: 520));

    expect(find.text('+۱۸۰'), findsOneWidget);
    expect(find.text('موجودی جدید: ۲٬۴۸۰'), findsOneWidget);
    expect(find.text('+'), findsNWidgets(14));
    expect(tester.takeException(), isNull,
        reason: 'انیمیشن روی گوشی باریک نباید overflow یا paint error بدهد');
  });

  testWidgets('بازنده واریز را صریحاً متعلق به حریف می‌بیند', (tester) async {
    await tester.pumpWidget(_wrap(const CardDuelStakePayoutForTest(
      amount: 180,
      mineWon: false,
      opponentRole: 'حریف',
    )));
    await tester.pump(const Duration(milliseconds: 520));
    expect(find.text('امتیاز به حریف اضافه شد'), findsOneWidget);
    expect(find.textContaining('موجودی جدید'), findsNothing);
  });

  test('دست زنده ListView افقی ندارد', () {
    final source = File(
      'lib/screens/user/games/card_duel/card_duel_widgets.dart',
    ).readAsStringSync();
    final live = source.substring(
      source.indexOf('class _LiveBattle'),
      source.indexOf('class _Scoreboard'),
    );
    expect(live.contains('ListView.separated'), isFalse);
    expect(live.contains('PositionedDirectional'), isTrue);
    expect(live.contains('final step ='), isTrue,
        reason: 'کارت‌ها باید در fan ثابتِ متناسب با عرض پخش شوند');
  });
}
