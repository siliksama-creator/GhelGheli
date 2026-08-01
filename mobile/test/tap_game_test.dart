// Tap-game unit tests: the curve, the anti-cheat guard, persistence and the
// engine's level machine. No widgets, no network — fast and deterministic.
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_engine.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_guard.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_storage.dart';

void main() {
  const config = TapGameConfig();

  group('level curve', () {
    test('level 1 costs the base amount', () {
      expect(config.requiredTaps(1), 100);
    });

    test('matches round(100 * 1.15^(n-1)) for every level', () {
      var expected = 100.0;
      for (var lv = 1; lv <= config.levelCount; lv++) {
        expect(config.requiredTaps(lv), expected.round(), reason: 'level $lv');
        expected *= 1.15;
      }
    });

    test('known checkpoints — must equal the server', () {
      expect(config.requiredTaps(2), 115);
      expect(config.requiredTaps(10), 352);
      expect(config.requiredTaps(25), 2863);
      expect(config.requiredTaps(50), 94231);
    });

    test('is strictly increasing', () {
      for (var lv = 2; lv <= config.levelCount; lv++) {
        expect(config.requiredTaps(lv), greaterThan(config.requiredTaps(lv - 1)));
      }
    });

    test('the growth factor is tunable without touching game code', () {
      final easy = config.copyWith(growthFactor: 1.05);
      expect(easy.requiredTaps(1), 100);
      expect(easy.requiredTaps(2), 105);
      expect(easy.requiredTaps(10), (100 * 1.05 * 1.05 * 1.05 * 1.05 * 1.05 *
              1.05 * 1.05 * 1.05 * 1.05)
          .round());
      // A gentler curve must be strictly easier from level 2 on.
      for (var lv = 2; lv <= 50; lv++) {
        expect(easy.requiredTaps(lv), lessThan(config.requiredTaps(lv)));
      }
    });
  });

  group('skins', () {
    test('the character changes ON level 10, 20, 30, 40', () {
      // Levels 1-9 are the first character; arriving AT level 10 already
      // shows the second. A previous version changed one level late.
      for (var lv = 1; lv <= 9; lv++) {
        expect(config.skinForLevel(lv), config.skins[0], reason: 'level $lv');
      }
      for (var lv = 10; lv <= 19; lv++) {
        expect(config.skinForLevel(lv), config.skins[1], reason: 'level $lv');
      }
      for (var lv = 20; lv <= 29; lv++) {
        expect(config.skinForLevel(lv), config.skins[2], reason: 'level $lv');
      }
      for (var lv = 30; lv <= 39; lv++) {
        expect(config.skinForLevel(lv), config.skins[3], reason: 'level $lv');
      }
      for (var lv = 40; lv <= 50; lv++) {
        expect(config.skinForLevel(lv), config.skins[4], reason: 'level $lv');
      }
    });

    test('exactly four changes across the whole game', () {
      var changes = 0;
      for (var lv = 2; lv <= config.levelCount; lv++) {
        if (config.skinIndexForLevel(lv) != config.skinIndexForLevel(lv - 1)) {
          changes++;
          expect(lv % config.levelsPerSkin, 0,
              reason: 'a change must land on a multiple of 10, got $lv');
        }
      }
      expect(changes, 4);
    });

    test('the skin index never goes backwards', () {
      for (var lv = 2; lv <= config.levelCount; lv++) {
        expect(config.skinIndexForLevel(lv),
            greaterThanOrEqualTo(config.skinIndexForLevel(lv - 1)));
      }
    });

    test('all five skins are reachable within 50 levels', () {
      final seen = <String>{};
      for (var lv = 1; lv <= 50; lv++) {
        seen.add(config.skinForLevel(lv));
      }
      expect(seen.length, 5);
    });

    test('a level beyond the last skin clamps instead of crashing', () {
      expect(config.skinForLevel(999), config.skins.last);
      expect(config.skinForLevel(0), config.skins.first);
      expect(config.skinForLevel(-5), config.skins.first);
      // Level 51 (the "finished" sentinel) must still resolve to artwork.
      expect(config.skinForLevel(config.levelCount + 1), config.skins.last);
    });

    test('skin count can change without breaking the lookup', () {
      final three = config.copyWith(skins: const ['a', 'b', 'c']);
      expect(three.skinForLevel(1), 'a');
      expect(three.skinForLevel(10), 'b');
      expect(three.skinForLevel(20), 'c');
      expect(three.skinForLevel(50), 'c'); // clamped
    });

    test('levelsPerSkin is tunable', () {
      final every5 = config.copyWith(levelsPerSkin: 5);
      expect(every5.skinIndexForLevel(4), 0);
      expect(every5.skinIndexForLevel(5), 1);
      expect(every5.skinIndexForLevel(10), 2);
    });
  });

  group('anti-cheat guard', () {
    test('a human cadence is fully accepted', () {
      final guard = TapGuard(config: config);
      // 6 taps/second for 3 seconds.
      for (var i = 0; i < 18; i++) {
        expect(guard.register(i * 166), TapVerdict.accepted, reason: 'tap $i');
      }
      expect(guard.rejectedCount, 0);
    });

    test('taps closer than the debounce are dropped', () {
      final guard = TapGuard(config: config);
      expect(guard.register(0), TapVerdict.accepted);
      // 10ms apart == 100 taps/s, impossible on a touchscreen.
      expect(guard.register(10), TapVerdict.tooFast);
      expect(guard.register(20), TapVerdict.tooFast);
      expect(guard.acceptedCount, 1);
      expect(guard.rejectedCount, 2);
    });

    test('a sustained rate above the ceiling is rate-limited', () {
      final guard = TapGuard(config: config);
      var accepted = 0;
      // 50ms apart == 20 taps/s, above the 12/s ceiling but past the debounce,
      // so only the sliding window can catch it.
      const count = 40;
      const spacingMs = 50;
      for (var i = 0; i < count; i++) {
        if (guard.register(i * spacingMs) == TapVerdict.accepted) accepted++;
      }
      // The window SLIDES, so the budget is per second of wall time, not per
      // burst: 40 taps at 50ms spans 2s and therefore earns ~2 windows worth.
      const spanSeconds = (count * spacingMs) / 1000;
      final budget = (config.maxTapsPerSecond * spanSeconds).ceil() + 1;
      expect(accepted, lessThanOrEqualTo(budget));
      // The real assertion: a 20/s stream must lose a meaningful share.
      expect(accepted, lessThan(count));
      expect(guard.rejectedCount, greaterThan(0));
    });

    test('an autoclicker at 100/s gets almost nothing through', () {
      final guard = TapGuard(config: config);
      var accepted = 0;
      for (var i = 0; i < 500; i++) {
        if (guard.register(i * 10) == TapVerdict.accepted) accepted++;
      }
      // 5 seconds of wall time => at most ~12/s may pass.
      expect(accepted, lessThanOrEqualTo(config.maxTapsPerSecond * 5 + 2));
    });

    test('the window slides — a pause restores full capacity', () {
      final guard = TapGuard(config: config);
      for (var i = 0; i < config.maxTapsPerSecond; i++) {
        guard.register(i * 60);
      }
      expect(guard.register(config.maxTapsPerSecond * 60),
          TapVerdict.rateLimited);
      // Two seconds later the window is empty again.
      expect(guard.register(3000), TapVerdict.accepted);
    });

    test('reset clears all counters', () {
      final guard = TapGuard(config: config);
      guard.register(0);
      guard.register(5);
      guard.reset();
      expect(guard.acceptedCount, 0);
      expect(guard.rejectedCount, 0);
      expect(guard.currentRate, 0);
    });
  });

  group('progress persistence', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('round-trips through storage', () async {
      final storage = TapStorage(key: 'test_progress');
      await storage.save(const TapProgress(
        level: 7,
        taps: 42,
        totalTaps: 900,
        pendingTaps: 12,
        flaggedTaps: 3,
      ));

      final loaded = await storage.load();
      expect(loaded.level, 7);
      expect(loaded.taps, 42);
      expect(loaded.totalTaps, 900);
      expect(loaded.pendingTaps, 12);
      expect(loaded.flaggedTaps, 3);
    });

    test('an empty store starts a fresh game', () async {
      final loaded = await TapStorage(key: 'nothing_here').load();
      expect(loaded.level, 1);
      expect(loaded.taps, 0);
    });

    test('corrupt JSON does not brick the game', () async {
      SharedPreferences.setMockInitialValues({'broken': 'not json at all {{{'});
      final loaded = await TapStorage(key: 'broken').load();
      expect(loaded.level, 1);
      expect(loaded.taps, 0);
    });

    test('a hand-edited negative level is normalised', () {
      final p = TapProgress.fromJson({'level': -3, 'taps': -10});
      expect(p.level, 1);
      expect(p.taps, 0);
    });
  });

  group('engine', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    Future<TapEngine> freshEngine({TapGameConfig? cfg}) async {
      final engine = TapEngine(
        config: cfg ?? config,
        storage: TapStorage(key: 'engine_test_${DateTime.now().microsecondsSinceEpoch}'),
        // No sync: these tests are about local logic only.
      );
      await engine.init();
      return engine;
    }

    test('starts at level 1 with nothing banked', () async {
      final engine = await freshEngine();
      expect(engine.level, 1);
      expect(engine.taps, 0);
      expect(engine.requiredTaps, 100);
      expect(engine.levelProgress, 0);
      engine.dispose();
    });

    test('accepted taps advance the counter', () async {
      final engine = await freshEngine();
      // Spaced beyond the debounce so the guard accepts them.
      for (var i = 0; i < 5; i++) {
        engine.tap();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(engine.taps, greaterThan(0));
      expect(engine.totalTaps, engine.taps);
      engine.dispose();
    });

    test('reaching the threshold advances the level', () async {
      // A 3-tap level makes this fast and readable.
      final engine = await freshEngine(
        cfg: const TapGameConfig(baseTaps: 3, growthFactor: 1.0, levelCount: 5),
      );
      for (var i = 0; i < 3; i++) {
        engine.tap();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(engine.level, 2);
      expect(engine.taps, 0);
      engine.dispose();
    });

    test('finishing the last level marks the game complete', () async {
      final engine = await freshEngine(
        cfg: const TapGameConfig(baseTaps: 1, growthFactor: 1.0, levelCount: 3),
      );
      for (var i = 0; i < 3; i++) {
        engine.tap();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(engine.isComplete, isTrue);
      expect(engine.levelProgress, 1.0);
      // Further taps must not push past the end.
      engine.tap();
      expect(engine.level, 4);
      engine.dispose();
    });

    test('progress survives a restart', () async {
      const key = 'persist_across_restart';
      final first = TapEngine(config: config, storage: TapStorage(key: key));
      await first.init();
      for (var i = 0; i < 4; i++) {
        first.tap();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      final banked = first.taps;
      await first.flushNow();
      first.dispose();
      // Give the debounced write a chance to land.
      await Future<void>.delayed(const Duration(milliseconds: 700));

      final second = TapEngine(config: config, storage: TapStorage(key: key));
      await second.init();
      expect(second.taps, banked);
      second.dispose();
    });

    test('machine-gun taps are rejected, not counted', () async {
      final engine = await freshEngine();
      // No delay at all: the debounce must eat nearly all of these.
      for (var i = 0; i < 100; i++) {
        engine.tap();
      }
      expect(engine.taps, lessThan(20));
      expect(engine.flaggedTaps, greaterThan(50));
      engine.dispose();
    });

    test('levelsUntilNextSkin counts down to the boundary', () async {
      final engine = await freshEngine();
      // Level 1 with the next change AT level 10 => 9 levels to go.
      expect(engine.levelsUntilNextSkin, 9);
      engine.dispose();
    });

    test('the countdown agrees with skinIndexForLevel at every level', () async {
      // Guards against the countdown and the lookup drifting apart, which is
      // exactly what happened when the boundary formula was corrected in one
      // place but not the other.
      for (final startLevel in [1, 5, 9, 10, 15, 19, 20, 35, 45, 49]) {
        SharedPreferences.setMockInitialValues({
          'cd': '{"level":$startLevel,"taps":0,"totalTaps":0}',
        });
        final engine = TapEngine(config: config, storage: TapStorage(key: 'cd'));
        await engine.init();
        final n = engine.levelsUntilNextSkin;
        if (n != null) {
          expect(config.skinIndexForLevel(startLevel + n),
              isNot(config.skinIndexForLevel(startLevel)),
              reason: 'from level $startLevel, +$n must change the skin');
          expect(config.skinIndexForLevel(startLevel + n - 1),
              config.skinIndexForLevel(startLevel),
              reason: 'from level $startLevel, +${n - 1} must NOT change it yet');
        }
        engine.dispose();
      }
    });


    test('a rapid double flush does not lose taps', () async {
      // REGRESSION: two flushes back-to-back meant the second carried a full
      // batch with a near-zero window, the server called it impossible, and
      // the taps were burned. The engine now caps each batch to what its own
      // window supports and CARRIES the remainder.
      final engine = await freshEngine();
      for (var i = 0; i < 6; i++) {
        engine.tap();
        await Future<void>.delayed(const Duration(milliseconds: 60));
      }
      final banked = engine.taps;
      // Two flushes in immediate succession, the second with no new taps.
      await engine.flushNow();
      await engine.flushNow();
      // Nothing may vanish from the local count as a result of flushing.
      expect(engine.taps, banked);
      expect(engine.totalTaps, banked);
      engine.dispose();
    });

    test('level-up carry-over is exact across a skin boundary', () async {
      // Level 9 -> 10 is both a level-up AND a character change, the busiest
      // moment in the game: it forces an extra flush while state is moving.
      SharedPreferences.setMockInitialValues({
        'boundary': '{"level":9,"taps":0,"totalTaps":0}',
      });
      final cfg = const TapGameConfig(baseTaps: 2, growthFactor: 1.0);
      final engine = TapEngine(config: cfg, storage: TapStorage(key: 'boundary'));
      await engine.init();
      expect(cfg.skinIndexForLevel(9), 0);

      engine.tap();
      await Future<void>.delayed(const Duration(milliseconds: 60));
      engine.tap();
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(engine.level, 10);
      expect(engine.taps, 0);
      // The character must have changed exactly here.
      expect(cfg.skinIndexForLevel(engine.level), 1);
      expect(engine.skin, cfg.skins[1]);
      engine.dispose();
    });

    test('a corrupt saved level is clamped on load', () async {
      SharedPreferences.setMockInitialValues({
        'cheater': '{"level":99999,"taps":0,"totalTaps":0}',
      });
      final engine = TapEngine(config: config, storage: TapStorage(key: 'cheater'));
      await engine.init();
      expect(engine.level, lessThanOrEqualTo(config.levelCount + 1));
      engine.dispose();
    });
  });
}
