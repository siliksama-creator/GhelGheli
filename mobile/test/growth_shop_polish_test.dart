import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('پلاس بدون باز کردن کشو دیده می‌شود و پیش‌نمایش‌ها واقعی‌اند', () {
    final shop = File('lib/screens/user/shop_page.dart').readAsStringSync();
    expect(shop.contains('bool _showPlans = true;'), isTrue);
    expect(shop.contains("level: 72"), isFalse,
        reason: 'عدد لول نباید پیش از امضای پروفایل در ویترین نمایش داده شود');
    expect(shop.contains("avatar_10_crown.webp"), isTrue);
    expect(shop.contains('_ShopFrameArtwork'), isTrue);
    expect(shop.contains('_ShopNameArtwork'), isTrue);
    expect(shop.contains('_ShopBadgeArtwork'), isTrue);
    expect(shop.contains('_ShopEmoteArtwork'), isTrue);
    expect(shop.contains('result_template'), isFalse);
    expect(shop.contains('match_effect'), isFalse);
  });

  test('ماموریت و دوستان یک تب مستقل کنار بازی است', () {
    final social = File('lib/screens/user/social_page.dart').readAsStringSync();
    final games = File('lib/screens/user/games_page.dart').readAsStringSync();
    final growth =
        File('lib/screens/user/games/growth_panel.dart').readAsStringSync();
    // با اضافه شدن تب چهارم («گذر نبرد») لیبل بلند سرریز می‌کرد،
    // پس به «ماموریت» کوتاه شد. خودِ تب همچنان مستقل است.
    expect(social.contains("label: 'ماموریت'"), isTrue);
    expect(social.contains("label: 'گذر نبرد'"), isTrue);
    expect(social.contains('GrowthPanel('), isTrue);
    expect(social.contains('PassPage('), isTrue);
    expect(games.contains('GrowthPanel('), isFalse);
    expect(growth.contains('دعوت از یک دوست'), isTrue);
    expect(growth.contains('/api/missions/daily-bonus/claim'), isTrue);
  });

  test('پروفایل واقعی در هدر بازی آنلاین نمایش داده می‌شود', () {
    final games = File('lib/screens/user/games_page.dart').readAsStringSync();
    expect(games.contains("_cosmetics['frame']"), isTrue);
    expect(games.contains('DisplayName('), isTrue);
    expect(games.contains('CosmeticAvatarFrame('), isTrue);
  });

  test('میان‌بر داشبورد نام درآمدی روشن دارد', () {
    final dashboard =
        File('lib/screens/user/dashboard_page.dart').readAsStringSync();
    expect(dashboard.contains("title: 'دعوت و کسب درآمد'"), isTrue);
  });
}
