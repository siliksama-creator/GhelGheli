import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/core/cosmetics.dart';

void main() {
  testWidgets('قاب، نام و امضای خریدنی همان ویجت زمان اجرا هستند', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CosmeticAvatarFrame(
              frame: 'pro_holographic',
              child: CircleAvatar(radius: 24, child: Icon(Icons.person)),
            ),
            AnimatedNameText(
              name: 'hotcat',
              effect: 'animated_fire',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            ProfileBadgeVisual(badge: 'cr7'),
          ]),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.textContaining('hotcat'), findsOneWidget);
    expect(find.text('CR7'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('هر شش امضای پروفایل واقعاً رندر می‌شود', (tester) async {
    for (final badge in profileBadgeLabels.keys) {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: Center(child: ProfileBadgeVisual(badge: badge))),
      ));
      await tester.pump(const Duration(milliseconds: 80));
      expect(find.text(profileBadgeLabels[badge]!), findsOneWidget, reason: badge);
      expect(tester.takeException(), isNull, reason: badge);
    }
  });

  test('فروشگاه، چت، پروفایل و بازی از renderer مشترک استفاده می‌کنند', () {
    final shop = File('lib/screens/user/shop_page.dart').readAsStringSync();
    final chat = File('lib/screens/user/chat_page.dart').readAsStringSync();
    final profile = File('lib/screens/user/profile_page.dart').readAsStringSync();
    final versus = File('lib/screens/user/games/versus_bar.dart').readAsStringSync();
    final duel = File('lib/screens/user/games/card_duel/card_duel_widgets.dart').readAsStringSync();

    expect(shop.contains('AnimatedNameText('), isTrue);
    expect(shop.contains('_ShopBadgeArtwork'), isTrue);
    for (final source in [shop, chat, profile, versus, duel]) {
      expect(source.contains('CosmeticAvatarFrame('), isTrue);
    }
    expect(duel.contains('CosmeticCardFrame('), isTrue);
    expect(duel.contains('DisplayName('), isTrue);
  });
}
