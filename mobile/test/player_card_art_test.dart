import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/widgets/player_card.dart';
// `rarityForPoints`/`normalizeRarity` در ماژولِ قاب زندگی می‌کنند؛
// `player_card.dart` آن‌ها را import می‌کند ولی دوباره صادر نمی‌کند.
import 'package:ghelgheli_mobile/widgets/rarity_card_frame.dart';

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

  // کلاسِ کارت = ردهٔ کمیابیِ امتیاز (نردبانِ ۵۰۰/۱۰۰۰/۳۰۰۰). سرور همان را
  // می‌فرستد و `backend/scripts/testCardRarity.js` سه کلاینت را به هم می‌دوزد.
  test('کلاس کارت از چهار کلاسِ تازه خوانده می‌شود', () {
    expect(cardRarityOf({'duel_rarity': 'legendary'}), 'legendary');
    expect(cardRarityOf({'rarity': 'rare'}), 'rare');
    expect(cardRarityOf({'duel_rarity': 'uncommon'}), 'uncommon');
    expect(cardRarityOf({'rarity': 'common'}), 'common');
    expect(cardRarityOf({}), 'common');
  });

  test('کلیدهای نسلِ قبل به کلاسِ تازه نگاشته می‌شوند', () {
    // پاسخِ کش‌شده یا نسخهٔ نصب‌شدهٔ قبلی می‌توانست نامِ قدیمی بفرستد؛
    // بی این نگاشت کارت بی‌قاب و با برچسبِ خامِ انگلیسی دیده می‌شد.
    expect(cardRarityOf({'duel_rarity': 'legend'}), 'legendary');
    expect(cardRarityOf({'rarity': 'premium'}), 'rare');
    expect(cardRarityOf({'duel_rarity': 'gold'}), 'uncommon');
    expect(cardRarityOf({'duel_rarity': 'silver'}), 'uncommon');
    expect(cardRarityOf({'duel_rarity': 'normal'}), 'common');
    expect(cardRarityOf({'duel_rarity': 'نامِ ناشناس'}), 'common');
  });

  test('نردبانِ امتیاز در اندروید با سرور یکی است', () {
    expect(rarityForPoints(0), 'common');
    expect(rarityForPoints(500), 'common');
    expect(rarityForPoints(501), 'uncommon');
    expect(rarityForPoints(1000), 'uncommon');
    expect(rarityForPoints(1001), 'rare');
    expect(rarityForPoints(3000), 'rare');
    expect(rarityForPoints(3001), 'legendary');
    expect(rarityForPoints(50000), 'legendary');
  });
}
