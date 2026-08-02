// Tuning knobs for the tap game.
//
// Everything that a designer might want to change later — the curve, the
// number of levels, the skins, the anti-cheat thresholds, the batch cadence —
// lives HERE and nowhere else. The engine, the UI and the sync layer all read
// from this one object, so changing the difficulty never means hunting through
// widget code.
import 'package:flutter/foundation.dart';

@immutable
class TapGameConfig {
  const TapGameConfig({
    this.levelCount = 50,
    this.baseTaps = 100,
    this.growthFactor = 1.15,
    this.skins = defaultSkins,
    this.levelsPerSkin = 10,
    this.maxTapsPerSecond = 12,
    this.burstWindow = const Duration(seconds: 1),
    this.minTapInterval = const Duration(milliseconds: 45),
    this.flushInterval = const Duration(seconds: 8),
    this.maxBatchTaps = 400,
  });

  /// How many levels the game has in total.
  final int levelCount;

  /// Taps required to clear level 1.
  final int baseTaps;

  /// Multiplier applied per level. 1.15 == each level is ~15% harder.
  ///
  /// required(level) = round(baseTaps * growthFactor^(level-1))
  final double growthFactor;

  /// Character artwork, in order. The list length does not have to match
  /// `levelCount / levelsPerSkin` — the lookup clamps.
  final List<String> skins;

  /// A new skin unlocks every N levels (10 => levels 1-10, 11-20, ...).
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

  static const List<String> defaultSkins = [
    'assets/games/tap/skin_1.webp',
    'assets/games/tap/skin_2.webp',
    'assets/games/tap/skin_3.webp',
    'assets/games/tap/skin_4.webp',
    'assets/games/tap/skin_5.webp',
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

  List<int> get _curve {
    final key = '$levelCount|$baseTaps|$growthFactor';
    return _curveCache.putIfAbsent(key, () {
      return List<int>.generate(levelCount, (i) {
        var v = baseTaps.toDouble();
        for (var n = 0; n < i; n++) {
          v *= growthFactor;
        }
        // Belt and braces: an operator could set an absurd growthFactor in a
        // future tuning pass and the same overflow would return.
        if (!v.isFinite || v > 1e15) return 1000000000;
        return v.round();
      });
    });
  }

  /// Artwork for [level], clamped to the available skins so level 50 with
  /// 5 skins still resolves.
  String skinForLevel(int level) {
    if (skins.isEmpty) return '';
    return skins[skinIndexForLevel(level)];
  }

  /// 0-based skin index for [level].
  ///
  /// The character changes **on arrival at** level 10, 20, 30, 40 — so
  /// levels 1-9 use skin 1, level 10 is already skin 2, and so on. An
  /// earlier version divided `(level - 1)`, which pushed every change one
  /// level late (skin 2 only appeared at level 11).
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
    int? baseTaps,
    double? growthFactor,
    List<String>? skins,
    int? levelsPerSkin,
    int? maxTapsPerSecond,
    Duration? burstWindow,
    Duration? minTapInterval,
    Duration? flushInterval,
    int? maxBatchTaps,
  }) {
    return TapGameConfig(
      levelCount: levelCount ?? this.levelCount,
      baseTaps: baseTaps ?? this.baseTaps,
      growthFactor: growthFactor ?? this.growthFactor,
      skins: skins ?? this.skins,
      levelsPerSkin: levelsPerSkin ?? this.levelsPerSkin,
      maxTapsPerSecond: maxTapsPerSecond ?? this.maxTapsPerSecond,
      burstWindow: burstWindow ?? this.burstWindow,
      minTapInterval: minTapInterval ?? this.minTapInterval,
      flushInterval: flushInterval ?? this.flushInterval,
      maxBatchTaps: maxBatchTaps ?? this.maxBatchTaps,
    );
  }
}
