// Tuning knobs for the tap game.
//
// Everything that a designer might want to change later — the curve, the
// number of levels, the skins, the anti-cheat thresholds, the batch cadence —
// lives HERE and nowhere else. The engine, the UI and the sync layer all read
// from this one object, so changing the difficulty never means hunting through
// widget code.
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

@immutable
class TapGameConfig {
  const TapGameConfig({
    this.levelCount = 50,
    this.totalPoints = 50000,
    this.growthFactor = 1.05,
    this.skins = defaultSkins,
    this.levelsPerSkin = 5,
    this.levelsPerDay = 2,
    this.maxTapsPerSecond = 12,
    this.burstWindow = const Duration(seconds: 1),
    this.minTapInterval = const Duration(milliseconds: 45),
    this.flushInterval = const Duration(seconds: 8),
    this.maxBatchTaps = 400,
  });

  /// How many levels the game has in total.
  final int levelCount;

  /// How many levels a player may clear per calendar day (Asia/Tehran).
  ///
  /// MIRRORS `MAX_LEVELS_PER_DAY` in tapGameService.js and the server is the
  /// authority — this copy exists only so the UI can explain the rule and
  /// stop counting locally instead of showing progress the next sync erases.
  /// Change one, change the other in the same commit.
  final int levelsPerDay;

  /// Points the whole game is worth, spread across [levelCount] levels.
  ///
  /// The owner set this: "کل بازی ۵۰ هزار امتیاز میدهد". One tap is worth
  /// exactly one point, so this is also the total number of taps to finish.
  ///
  /// MIRRORS `TOTAL_POINTS` in tapGameService.js. The server is the
  /// authority; this copy exists so the UI can render a progress bar before
  /// the first sync lands.
  final int totalPoints;

  /// Points required to clear level 1 — the first entry of the curve.
  int get baseTaps => _curve[0];

  /// Multiplier applied per level. 1.05 == each level is ~5% dearer than
  /// the last. The curve is normalised so the fifty levels sum to
  /// [totalPoints], so this controls the SHAPE, not the total.
  ///

  final double growthFactor;

  /// Character artwork, in order. The list length does not have to match
  /// `levelCount / levelsPerSkin` — the lookup clamps.
  final List<String> skins;

  /// هر N لول یک ظاهرِ جدید (۵ ⇒ لول ۱-۴ ظاهر اول، لول ۵ ظاهر دوم، …).
  ///
  /// از ۱۰ به ۵ کم شد: با ۵۰ لول و ۱۰ ظاهر، کاربر ده بار پاداشِ دیداری
  /// می‌گیرد به‌جای پنج بار. تغییرِ ظاهر تنها بازخوردِ بلندمدتِ این بازی
  /// است و دو برابر شدنش مستقیماً یعنی دو برابر انگیزهٔ ادامه دادن.
  final int levelsPerSkin;

  // ── anti-cheat (client side) ─────────────────────────────────────────────

  /// Sustained ceiling. Taps beyond this rate inside [burstWindow] are
  /// rejected. Human thumbs peak around 8-10/s; 12 leaves headroom for a
  /// genuinely fast two-thumb player without letting an autoclicker through.
  final int maxTapsPerSecond;

  /// Sliding window used to measure the sustained rate.
  final Duration burstWindow;

  /// Hard debounce. Two taps closer together than this cannot be human on a
  /// touchscreen (~22 taps/s) and are dropped before they reach the counter.
  final Duration minTapInterval;

  // ── server sync ──────────────────────────────────────────────────────────

  /// How often accumulated taps are flushed to the backend. Taps are never
  /// sent one-by-one: that is both replayable and needlessly chatty.
  final Duration flushInterval;

  /// Safety valve — flush early if this many taps pile up before the timer.
  final int maxBatchTaps;

  /// ده مرحلهٔ ظاهریِ کاراکتر — قوسِ «از فقر تا ثروت».
  ///
  /// ═══════════════════════════════════════════════════════════════════════
  /// چرا ترتیب دقیقاً همین است
  /// ═══════════════════════════════════════════════════════════════════════
  ///
  /// خواستهٔ مالک: «کاراکتر اول فقیر باشه بعد کم کم کلاس کاری و لباساش
  /// بهتر شن»، و تغییر هر ۵ لول به‌جای هر ۱۰ لول.
  ///
  /// هر پله باید از پلهٔ قبلی **در یک نگاه** ثروتمندتر دیده شود، وگرنه
  /// حسِ پیشرفت از بین می‌رود. ترتیب بر پایهٔ سه نشانه چیده شده: جنسِ
  /// لباس، تمیزی/کهنگی، و مقدارِ طلا.
  ///
  ///   ۱  پیژامهٔ کهنه و دمپایی      → بی‌کار
  ///   ۲  اورکالِ کارگری و کلاه ایمنی → اولین کار
  ///   ۳  ژاکتِ کهنه و شلوار چهارخانه → کارگرِ ثابت
  ///   ۴  هودی و جین و کتانی          → درآمدِ منظم
  ///   ۵  پیراهن و جلیقه              → کارمند
  ///   ۶  ورزشکارِ حرفه‌ای            → سرمایه‌گذاری روی خود
  ///   ۷  بمبرِ برند و ساعتِ طلا       → کاسبِ موفق
  ///   ۸  کتِ مخملیِ زرشکی            → تاجر
  ///   ۹  کت‌وشلوارِ مشکیِ رسمی        → رئیس
  ///   ۱۰ تاکسیدوی طلایی و جواهر      → میلیاردر
  ///
  /// ⚠️ اگر روزی این فهرست کوتاه‌تر شد، `skinIndexForLevel` خودش clamp
  ///    می‌کند و کرش نمی‌دهد — ولی چند لولِ آخر ظاهرِ تکراری می‌گیرند.
  static const List<String> defaultSkins = [
    'assets/games/tap/skin_1.webp',
    'assets/games/tap/skin_2.webp',
    'assets/games/tap/skin_3.webp',
    'assets/games/tap/skin_4.webp',
    'assets/games/tap/skin_5.webp',
    'assets/games/tap/skin_6.webp',
    'assets/games/tap/skin_7.webp',
    'assets/games/tap/skin_8.webp',
    'assets/games/tap/skin_9.webp',
    'assets/games/tap/skin_10.webp',
  ];

  /// Taps needed to clear [level] (1-based).
  ///
  /// CRASH FIX. The old version was `(baseTaps * pow).round()` over a raw
  /// double, with no bound on `level`:
  ///
  ///   * around level 300 the product exceeds 2^63 and `.round()` returns an
  ///     undefined int — in practice a negative one, which makes the
  ///     level-up `while` loop in the engine run forever;
  ///   * around level 1100 the double reaches Infinity and `.round()` throws
  ///     `UnsupportedError`, killing the frame.
  ///
  /// A player cannot legitimately pass [levelCount], but the engine adopts
  /// whatever `level` the SERVER reports after a sync and nothing clamped the
  /// upper end there. One bad response, one edited prefs file, or one large
  /// offline batch and the game starts throwing on every rebuild — which is
  /// exactly the reported "after a while it starts crashing".
  ///
  /// Clamping to [levelCount] is correct rather than defensive: beyond the
  /// last level the game is complete and the requirement is meaningless.
  int requiredTaps(int level) {
    if (level < 1) return baseTaps;
    final capped = level > levelCount ? levelCount : level;
    return _curve[capped - 1];
  }

  /// The whole curve, computed once per distinct configuration.
  ///
  /// `requiredTaps` used to run an O(level) multiply loop, and it is called
  /// several times per rebuild — and the screen rebuilds on EVERY tap. At
  /// level 50 that was ~150 float operations per frame to answer a question
  /// whose inputs never change. A lookup table makes it O(1).
  ///
  /// The cache is STATIC rather than an instance field because this class
  /// must stay `const`-constructible: it is a default parameter value on
  /// TapGameScreen, and Dart requires those to be compile-time constants.
  /// The key covers every input to the curve, so two configs that differ in
  /// difficulty never share a table.
  static final Map<String, List<int>> _curveCache = {};

  /// The level costs, derived so they sum to EXACTLY [totalPoints].
  ///
  /// Mirrors the same construction in tapGameService.js. Fifty independently
  /// rounded geometric terms do not sum to a round number, so the rounding
  /// drift is folded into the last level — otherwise the game would be worth
  /// 49,997 or 50,004 points instead of the figure the owner specified, and
  /// the two ends would disagree about when the game is finished.
  List<int> get _curve {
    final key = '$levelCount|$totalPoints|$growthFactor';
    return _curveCache.putIfAbsent(key, () {
      // Guard against a nonsensical tuning pass rather than producing NaN.
      if (levelCount <= 0 || totalPoints <= 0 || growthFactor <= 0) {
        return List<int>.filled(levelCount > 0 ? levelCount : 1, 1);
      }
      final terms = List<double>.generate(
          levelCount, (i) => math.pow(growthFactor, i).toDouble());
      final sum = terms.fold<double>(0, (a, b) => a + b);
      if (!sum.isFinite || sum <= 0) {
        return List<int>.filled(levelCount, (totalPoints / levelCount).ceil());
      }
      final base = totalPoints / sum;
      final table = terms.map((t) {
        final v = base * t;
        if (!v.isFinite || v > 1e9) return 1000000000;
        // Never zero: a free level would make the engine's level-up loop
        // spin forever.
        final r = v.round();
        return r < 1 ? 1 : r;
      }).toList();
      final drift = totalPoints - table.fold<int>(0, (a, b) => a + b);
      table[table.length - 1] += drift;
      if (table[table.length - 1] < 1) table[table.length - 1] = 1;
      return table;
    });
  }

  /// Total points across the whole game — [totalPoints] by construction,
  /// but read from the table so a clamped/guarded curve reports the truth.
  int get gameTotalPoints => _curve.fold<int>(0, (a, b) => a + b);

  /// Points banked in total at a given position on the curve.
  ///
  /// Mirrors `cumulativePoints` on the server. Used for the "points so far"
  /// readout, which is what the owner asked to show instead of a tap count.
  int cumulativePoints(int level, int levelTaps) {
    final lv = level < 1 ? 1 : (level > levelCount + 1 ? levelCount + 1 : level);
    var sum = 0;
    for (var i = 0; i < lv - 1 && i < levelCount; i++) {
      sum += _curve[i];
    }
    if (lv > levelCount) return sum;
    final inside = levelTaps < 0
        ? 0
        : (levelTaps > _curve[lv - 1] ? _curve[lv - 1] : levelTaps);
    return sum + inside;
  }

  /// Artwork for [level], clamped to the available skins so a level beyond
  /// the last skin still resolves instead of throwing.
  String skinForLevel(int level) {
    if (skins.isEmpty) return '';
    return skins[skinIndexForLevel(level)];
  }

  /// 0-based skin index for [level].
  ///
  /// The character changes **on arrival at** level 5, 10, 15, … — so
  /// levels 1-4 use skin 1, level 5 is already skin 2, and so on. An
  /// earlier version divided `(level - 1)`, which pushed every change one
  /// level late (skin 2 only appeared at level 6).
  int skinIndexForLevel(int level) {
    if (skins.isEmpty) return 0;
    if (level < levelsPerSkin) return 0;
    // clamp() on a negative or absurd level would still be well-defined, but
    // guarding here keeps every caller safe without repeating the check.
    if (level < 0) return 0;
    return (level ~/ levelsPerSkin).clamp(0, skins.length - 1);
  }

  /// Total taps needed to go from level 1 all the way through [level].
  ///
  /// Bounded by [levelCount] for the same reason as [requiredTaps]: an
  /// out-of-range level used to spin this loop millions of times on the UI
  /// thread.
  int cumulativeTaps(int level) {
    final capped = level > levelCount ? levelCount : level;
    var sum = 0;
    for (var i = 1; i <= capped; i++) {
      sum += requiredTaps(i);
    }
    return sum;
  }

  TapGameConfig copyWith({
    int? levelCount,
    int? totalPoints,
    double? growthFactor,
    List<String>? skins,
    int? levelsPerSkin,
    int? levelsPerDay,
    int? maxTapsPerSecond,
    Duration? burstWindow,
    Duration? minTapInterval,
    Duration? flushInterval,
    int? maxBatchTaps,
  }) {
    return TapGameConfig(
      levelCount: levelCount ?? this.levelCount,
      totalPoints: totalPoints ?? this.totalPoints,
      growthFactor: growthFactor ?? this.growthFactor,
      skins: skins ?? this.skins,
      levelsPerSkin: levelsPerSkin ?? this.levelsPerSkin,
      levelsPerDay: levelsPerDay ?? this.levelsPerDay,
      maxTapsPerSecond: maxTapsPerSecond ?? this.maxTapsPerSecond,
      burstWindow: burstWindow ?? this.burstWindow,
      minTapInterval: minTapInterval ?? this.minTapInterval,
      flushInterval: flushInterval ?? this.flushInterval,
      maxBatchTaps: maxBatchTaps ?? this.maxBatchTaps,
    );
  }
}
