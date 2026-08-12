import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/player_card.dart';

void main() {
  test('تصویر واقعی کارت را از image_url می‌گیرد', () {
    expect(
      cardArtOf({'image_url': '/uploads/images/mbappe.webp', 'name': 'Mbappe'}),
      '/uploads/images/mbappe.webp',
    );
  });

  test('توپ و آواتار فوتبال هرگز به‌جای کارت نمی‌نشینند', () {
    expect(
      cardArtOf({
        'imageUrl': 'assets/pass/football_icon.webp',
        'image_url': 'assets/avatars/avatar_1_football.png',
      }),
      isNull,
    );
    expect(cardArtOf({'image_url': 'assets/games/empty_collection.webp'}), isNull);
  });

  test('کلاس کارت از duel_rarity خوانده می‌شود', () {
    expect(cardRarityOf({'duel_rarity': 'legend'}), 'legend');
    expect(cardRarityOf({'rarity': 'premium'}), 'premium');
    expect(cardRarityOf({}), 'normal');
  });
}
