// Widget tests for جفت‌یاب: card art, and the solo (time-attack) panels.
//
// These exist because the previous card faces were EMOJI, and emoji render
// from a font that not every device ships — two different cards could draw
// the same empty box. A test that asserts real image assets makes that
// regression impossible to reintroduce silently.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ghelgheli_mobile/screens/user/games/memory_cards.dart';
import 'package:ghelgheli_mobile/screens/user/games/solo_session.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: ThemeData(useMaterial3: true, brightness: Brightness.dark),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: SizedBox(width: 90, height: 110, child: child))),
      ),
    );

void main() {
  group('memory card art', () {
    test('every server face key has a bundled illustration', () {
      // Must stay in lockstep with backend/src/games/rules/memory.js FACES.
      const serverFaces = [
        'ball', 'trophy', 'medal', 'jersey',
        'glove', 'boot', 'whistle', 'stopwatch',
      ];
      for (final f in serverFaces) {
        expect(memoryFaceArt[f], isNotNull, reason: 'missing art for "$f"');
        expect(memoryFaceArt[f], endsWith('.webp'));
        expect(memoryFaceTint[f], isNotNull, reason: 'missing tint for "$f"');
      }
      expect(memoryFaceArt.length, serverFaces.length,
          reason: 'no orphan art keys');
    });

    test('no two faces share a tint (they must be distinguishable)', () {
      expect(memoryFaceTint.values.toSet().length, memoryFaceTint.length);
    });

    testWidgets('a face-down card shows no artwork', (t) async {
      await t.pumpWidget(_wrap(const MemoryCard(
        face: null, matchedBy: null, isUp: false, mySymbol: 'X',
        enabled: true, onTap: _noop,
      )));
      await t.pump(const Duration(milliseconds: 600));
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('a revealed card renders its illustration, not a glyph',
        (t) async {
      await t.pumpWidget(_wrap(const MemoryCard(
        face: 'trophy', matchedBy: null, isUp: true, mySymbol: 'X',
        enabled: false, onTap: _noop,
      )));
      await t.pump(const Duration(milliseconds: 600));
      final img = t.widget<Image>(find.byType(Image));
      expect((img.image as AssetImage).assetName,
          'assets/games/memory/trophy.webp');
    });

    testWidgets('a disabled card does not fire onTap', (t) async {
      var taps = 0;
      await t.pumpWidget(_wrap(MemoryCard(
        face: null, matchedBy: null, isUp: false, mySymbol: 'X',
        enabled: false, onTap: () => taps++,
      )));
      await t.tap(find.byType(MemoryCard));
      expect(taps, 0);
    });

    testWidgets('an enabled card fires onTap once', (t) async {
      var taps = 0;
      await t.pumpWidget(_wrap(MemoryCard(
        face: null, matchedBy: null, isUp: false, mySymbol: 'X',
        enabled: true, onTap: () => taps++,
      )));
      await t.tap(find.byType(MemoryCard));
      expect(taps, 1);
    });

    testWidgets('solo mode never draws the opponent badge', (t) async {
      await t.pumpWidget(_wrap(const MemoryCard(
        face: 'ball', matchedBy: 'X', isUp: false, mySymbol: 'X',
        enabled: false, onTap: _noop, soloMode: true,
      )));
      await t.pump(const Duration(milliseconds: 600));
      expect(find.byIcon(Icons.people_alt_rounded), findsNothing);
      expect(find.byIcon(Icons.check_rounded), findsOneWidget);
    });
  });

  group('run time formatting', () {
    test('sub-minute runs read as seconds and hundredths', () {
      expect(formatRunTime(0), '۰٫۰۰');
      expect(formatRunTime(3421), '۳٫۴۲');
      expect(formatRunTime(34210), '۳۴٫۲۱');
      expect(formatRunTime(59990), '۵۹٫۹۹');
    });

    test('a run past a minute grows a minutes field', () {
      expect(formatRunTime(60000), '۱:۰۰٫۰۰');
      expect(formatRunTime(83214), '۱:۲۳٫۲۱');
      expect(formatRunTime(605000), '۱۰:۰۵٫۰۰');
    });

    test('missing or nonsense values degrade to a dash, not a crash', () {
      expect(formatRunTime(null), '—');
      expect(formatRunTime(-5), '—');
    });

    test('digits are Persian, never Latin', () {
      expect(formatRunTime(12340), isNot(matches(RegExp(r'[0-9]'))));
    });
  });
}

void _noop() {}
