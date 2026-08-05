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
      expect(config.requiredTaps(1), config.baseTaps);
      expect(config.baseTaps, 239);
    });

    test('the whole game sums to exactly totalPoints', () {
      var sum = 0;
      for (var lv = 1; lv <= config.levelCount; lv++) {
        sum += config.requiredTaps(lv);
      }
      expect(sum, config.totalPoints);
      expect(sum, 50000);
    });

    test('follows the 1.05 curve, allowing for rounding', () {
      // Checked as a RATIO, not against hardcoded integers: the exact values
      // depend on how the rounding drift is distributed, but the SHAPE is
      // the contract.
      for (var lv = 2; lv < config.levelCount; lv++) {
        final ratio = config.requiredTaps(lv) / config.requiredTaps(lv - 1);
        expect(ratio, greaterThan(1.03), reason: 'level $lv');
        expect(ratio, lessThan(1.07), reason: 'level $lv');
      }
    });

    test('known checkpoints — must equal the server', () {
      expect(config.requiredTaps(2), 251);
      expect(config.requiredTaps(10), 371);
      expect(config.requiredTaps(25), 770);
      expect(config.requiredTaps(50), 2611);
    });

    test('is strictly increasing', () {
      for (var lv = 2; lv <= config.levelCount; lv++) {
        expect(config.requiredTaps(lv), greaterThan(config.requiredTaps(lv - 1)));
      }
    });

    test('the growth factor is tunable without touching game code', () {
      // A FLATTER curve spreads the same total more evenly: cheaper at the
      // end, dearer at the start. That is the useful invariant now that the
      // total is fixed — "uniformly easier" is impossible when both curves
      // must sum to 50,000.
      final flat = config.copyWith(growthFactor: 1.01);
      var sum = 0;
      for (var lv = 1; lv <= flat.levelCount; lv++) {
        sum += flat.requiredTaps(lv);
      }
      expect(sum, flat.totalPoints, reason: 'a tuned curve still totals right');
      expect(flat.requiredTaps(1), greaterThan(config.requiredTaps(1)));
      expect(flat.requiredTaps(50), lessThan(config.requiredTaps(50)));
    });
  });

  group('skins', () {
    // ⚠️ این تست‌ها عمداً هیچ عددی را هاردکد نمی‌کنند.
    //
    // نسخهٔ قبلی «۱۰»، «۴ تغییر» و «۵ اسکین» را مستقیم نوشته بود. وقتی
    // مالک خواست ظاهر هر ۵ لول عوض شود (و ۱۰ ظاهر شد)، پنج تست شکستند
    // بدون اینکه هیچ باگی وجود داشته باشد — یعنی تست‌ها داشتند یک
    // **تصمیمِ محصول** را قفل می‌کردند، نه یک **قاعده** را.
    //
    // حالا هر ادعا از `config.levelsPerSkin` و `config.skins.length`
    // مشتق می‌شود. اگر فردا هر ۳ لول شد، همین‌ها بدون تغییر سبز می‌مانند
    // و فقط اگر منطق واقعاً بشکند قرمز می‌شوند.

    test('ظاهر دقیقاً روی مضرب‌های levelsPerSkin عوض می‌شود', () {
      final n = config.levelsPerSkin;
      for (var lv = 1; lv <= config.levelCount; lv++) {
        final expected =
            (lv ~/ n).clamp(0, config.skins.length - 1);
        expect(config.skinIndexForLevel(lv), expected, reason: 'لول $lv');
      }
    });

    test('لول‌های قبل از اولین مرز، ظاهر اول را دارند', () {
      for (var lv = 1; lv < config.levelsPerSkin; lv++) {
        expect(config.skinForLevel(lv), config.skins[0], reason: 'لول $lv');
      }
      // و دقیقاً روی مرز عوض می‌شود، نه یکی دیرتر.
      expect(config.skinForLevel(config.levelsPerSkin), config.skins[1]);
    });

    test('تعداد تغییرها با تعداد ظاهرهای قابل‌دسترس می‌خواند', () {
      var changes = 0;
      for (var lv = 2; lv <= config.levelCount; lv++) {
        if (config.skinIndexForLevel(lv) != config.skinIndexForLevel(lv - 1)) {
          changes++;
          expect(lv % config.levelsPerSkin, 0,
              reason: 'تغییر باید روی مضربِ ${config.levelsPerSkin} بیفتد، '
                  'ولی روی $lv افتاد');
        }
      }
      final reachable =
          (config.levelCount ~/ config.levelsPerSkin) + 1;
      final expected =
          (reachable > config.skins.length ? config.skins.length : reachable) - 1;
      expect(changes, expected);
    });

    test('اندیس ظاهر هرگز عقب نمی‌رود', () {
      for (var lv = 2; lv <= config.levelCount; lv++) {
        expect(config.skinIndexForLevel(lv),
            greaterThanOrEqualTo(config.skinIndexForLevel(lv - 1)));
      }
    });

    test('همهٔ ظاهرها در طول بازی دیده می‌شوند', () {
      // اگر ظاهری هرگز دیده نشود یعنی داراییِ مرده در اپ داریم: حجمِ
      // APK را بالا می‌برد و هیچ‌کس نمی‌بیندش.
      final seen = <String>{};
      for (var lv = 1; lv <= config.levelCount; lv++) {
        seen.add(config.skinForLevel(lv));
      }
      expect(seen.length, config.skins.length,
          reason: 'با ${config.levelCount} لول و هر ${config.levelsPerSkin} '
              'لول یک ظاهر، همهٔ ${config.skins.length} ظاهر باید برسند');
    });

    test('همهٔ فایل‌های ظاهر مسیرِ یکتا دارند', () {
      // کپیِ تصادفیِ یک مسیر یعنی کاربر دو بار پشت سر هم همان لباس را
      // می‌بیند و فکر می‌کند ارتقا نگرفته.
      expect(config.skins.toSet().length, config.skins.length);
    });

    test('لولِ بیرون از بازه clamp می‌شود و کرش نمی‌دهد', () {
      expect(config.skinForLevel(999), config.skins.last);
      expect(config.skinForLevel(0), config.skins.first);
      expect(config.skinForLevel(-5), config.skins.first);
      expect(config.skinForLevel(config.levelCount + 1), config.skins.last);
    });

    test('تعداد ظاهر می‌تواند عوض شود بدون شکستنِ جست‌وجو', () {
      final three = config.copyWith(skins: const ['a', 'b', 'c']);
      final n = three.levelsPerSkin;
      expect(three.skinForLevel(1), 'a');
      expect(three.skinForLevel(n), 'b');
      expect(three.skinForLevel(n * 2), 'c');
      expect(three.skinForLevel(config.levelCount), 'c'); // clamp
    });

    test('levelsPerSkin قابل تنظیم است', () {
      final every3 = config.copyWith(levelsPerSkin: 3);
      expect(every3.skinIndexForLevel(2), 0);
      expect(every3.skinIndexForLevel(3), 1);
      expect(every3.skinIndexForLevel(6), 2);
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
      expect(engine.requiredTaps, config.requiredTaps(1));
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
        // ۵ لول × ۳ امتیاز = ۱۵. با growthFactor=1 همهٔ لول‌ها برابرند.
        cfg: const TapGameConfig(
            growthFactor: 1.0, levelCount: 5, totalPoints: 15),
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
        // ۳ لول × ۱ امتیاز = ۳. levelsPerDay بالا برده شده چون این تست
        // دربارهٔ *پایان بازی* است نه سقف روزانه؛ با سقف پیش‌فرض ۲، بازی
        // هرگز به لول ۴ نمی‌رسید و تست به دلیل غلط شکست می‌خورد.
        cfg: const TapGameConfig(
            growthFactor: 1.0, levelCount: 3, totalPoints: 3,
            levelsPerDay: 99),
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
      // از لول ۱ تا اولین مرز. عدد از config مشتق می‌شود نه هاردکد،
      // وگرنه هر بار که levelsPerSkin عوض شود این تست بی‌دلیل می‌شکند.
      expect(engine.levelsUntilNextSkin, config.levelsPerSkin - 1);
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
      // مرزِ اولین تغییرِ شخصیت هم‌زمان یک level-up است — شلوغ‌ترین لحظهٔ
      // بازی: وسطِ جابه‌جاییِ state یک flush اضافه هم اجرا می‌شود.
      //
      // ⚠️ عددِ مرز از خودِ config مشتق می‌شود. نسخهٔ قبلی «۹ → ۱۰» را
      //    هاردکد کرده بود و وقتی levelsPerSkin از ۱۰ به ۵ رسید شکست،
      //    بدون اینکه هیچ باگی وجود داشته باشد.
      const cfg = TapGameConfig(
          growthFactor: 1.0, totalPoints: 50, levelsPerDay: 99);
      final boundary = cfg.levelsPerSkin;      // اولین لولی که ظاهر عوض می‌شود
      final before = boundary - 1;
      SharedPreferences.setMockInitialValues({
        'boundary': '{"level":$before,"taps":0,"totalTaps":0}',
      });
      final engine = TapEngine(config: cfg, storage: TapStorage(key: 'boundary'));
      await engine.init();
      expect(cfg.skinIndexForLevel(before), 0);

      // هر لول ۱ امتیاز (۵۰ امتیاز ÷ ۵۰ لول)، پس یک ضربه یک لول.
      engine.tap();
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(engine.level, boundary);
      expect(engine.taps, 0);
      // شخصیت باید دقیقاً همین‌جا عوض شده باشد.
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
