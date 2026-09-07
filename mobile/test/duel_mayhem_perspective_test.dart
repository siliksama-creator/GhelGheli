// نگهبانِ آینگیِ «دوئل طوفان» در اندروید.
//
// چشم‌اندازِ راند (CardDuelRoundPerspective) تنها آداپتری است که payload
// بک‌اند را برای «من/حریف» برمی‌گرداند. این تست ثابت می‌کند فیلدهای تازه
// (راند دو‌امتیازی، وقت اضافه، شانس دیدنی، امتیاز متغیر) درست از سمت X و O
// خوانده می‌شوند — تا با وب (roundForViewer) واگرا نشوند.
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/card_duel_page.dart';

Map<String, dynamic> _otRound() => {
      'round': 3,
      'title': 'دفاع',
      'focusLabel': 'دفاع',
      'winner': 'O',
      'mod': 'storm',
      'awardX': 0,
      'awardO': 2,
      'cardX': {'name': 'کارت من'},
      'cardO': {'name': 'کارت حریف'},
      'powerX': 70,
      'powerO': 70,
      'focusStatX': 70,
      'focusStatO': 70,
      'breakdownX': {'focus': 70, 'total': 70},
      'breakdownO': {'focus': 70, 'total': 70},
      'luckX': 0,
      'luckO': 0,
      'overtime': {
        'winner': 'O',
        'baseX': 74,
        'baseO': 78,
        'luckX': -3,
        'luckO': 6,
        'totalX': 71,
        'totalO': 84,
        'luckRange': 13,
      },
    };

void main() {
  group('چشم‌انداز راند طوفانی', () {
    test('راند دو‌امتیازیِ برنده ۲ امتیاز می‌دهد', () {
      final round = {
        'round': 2,
        'focusLabel': 'حمله',
        'winner': 'X',
        'mod': 'storm',
        'awardX': 2,
        'awardO': 0,
        'cardX': {'name': 'مهاجم'},
        'cardO': {'name': 'مدافع'},
        'powerX': 80,
        'powerO': 70,
        'focusStatX': 80,
        'focusStatO': 70,
        'breakdownX': {'focus': 80, 'total': 80},
        'breakdownO': {'focus': 70, 'total': 70},
        'luckX': 4,
        'luckO': -2,
      };
      final v = CardDuelRoundPerspective.from(round, 'X');
      expect(v.isStorm, isTrue);
      expect(v.myAward, 2);
      expect(v.theirAward, 0);
      expect(v.myLuck, 4);
      expect(v.awardForWinner, 2);
    });

    test('وقت اضافه از دید من (X) قدرت ترکیب و شانس را درست می‌چیند', () {
      final v = CardDuelRoundPerspective.from(_otRound(), 'X');
      expect(v.inOvertime, isTrue);
      expect(v.mySquad, 74);
      expect(v.theirSquad, 78);
      expect(v.myLuck, -3);
      expect(v.theirLuck, 6);
      expect(v.iWon, isFalse);
      expect(v.opponentWon, isTrue);
      expect(v.awardForWinner, 2);
    });

    test('همان وقت اضافه از دید برنده (O) آینه می‌شود', () {
      final v = CardDuelRoundPerspective.from(_otRound(), 'O');
      expect(v.inOvertime, isTrue);
      expect(v.iWon, isTrue);
      expect(v.mySquad, 78);
      expect(v.theirSquad, 74);
      expect(v.myLuck, 6);
      expect(v.theirLuck, -3);
      expect(v.myAward, 2);
    });
  });
}
