import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/match_effect_visual.dart';

void main() {
  const effects = [
    'stadium_spotlight',
    'colored_smoke',
    'card_side_fire',
    'victory_confetti',
    'golden_cup',
    'tunnel_entry',
    'goal_celebration',
    'win_streak',
    'mvp_effect',
    'rematch_effect',
  ];

  test('فاز ورود و پایان هر افکت دقیق اجرا می‌شود', () {
    expect(matchEffectSupports('stadium_spotlight', 'entry'), isTrue);
    expect(matchEffectSupports('stadium_spotlight', 'finish'), isFalse);
    expect(matchEffectSupports('victory_confetti', 'entry'), isFalse);
    expect(matchEffectSupports('victory_confetti', 'finish'), isTrue);
    expect(matchEffectSupports('card_side_fire', 'entry'), isTrue);
    expect(matchEffectSupports('card_side_fire', 'finish'), isTrue);
  });

  testWidgets('هر ده افکت بدون تصویر تبلیغاتی رسم می‌شوند', (tester) async {
    for (final slug in effects) {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              child: MatchEffectVisual(slug: slug, progress: .56),
            ),
          ),
        ),
      ));
      await tester.pump();
      expect(find.byType(MatchEffectVisual), findsOneWidget, reason: slug);
      expect(tester.takeException(), isNull, reason: 'نقاش افکت $slug کرش کرد');
    }
  });

  test('فروشگاه و هر دو زمان اجرای بازی از یک نقاش استفاده می‌کنند', () {
    final shop = File('lib/screens/user/shop_page.dart').readAsStringSync();
    final scaffold = File('lib/screens/user/games/game_scaffold.dart').readAsStringSync();
    final duel = File('lib/screens/user/games/card_duel_page.dart').readAsStringSync();
    final painter = File('lib/widgets/match_effect_visual.dart').readAsStringSync();

    for (final source in [shop, scaffold, duel]) {
      expect(source.contains('match_effect_visual.dart'), isTrue);
      expect(source.contains('MatchEffectVisual('), isTrue);
    }
    expect(painter.contains('Image.asset'), isFalse,
        reason: 'افکت خریدنی باید procedural باشد، نه تصویر مفهومی');
    expect(scaffold.contains(r'''assets/shop/cosmetics/${widget.slug}.webp'''), isFalse);
    expect(duel.contains(r'''assets/shop/cosmetics/${widget.slug}.webp'''), isFalse);
  });
}
