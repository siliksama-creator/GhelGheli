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
  /// Kept as a pure function so it can be unit-tested and so the server can
  /// mirror the exact same formula.
  int requiredTaps(int level) {
    if (level < 1) return baseTaps;
    final raw = baseTaps * _pow(growthFactor, level - 1);
    return raw.round();
  }

  /// Artwork for [level], changing every [levelsPerSkin] levels and clamped
  /// to the available skins so level 50 with 5 skins still resolves.
  String skinForLevel(int level) {
    if (skins.isEmpty) return '';
    final index = ((level - 1) ~/ levelsPerSkin).clamp(0, skins.length - 1);
    return skins[index];
  }

  /// 0-based skin index, for change detection.
  int skinIndexForLevel(int level) {
    if (skins.isEmpty) return 0;
    return ((level - 1) ~/ levelsPerSkin).clamp(0, skins.length - 1);
  }

  /// Total taps needed to go from level 1 all the way through [level].
  int cumulativeTaps(int level) {
    var sum = 0;
    for (var i = 1; i <= level; i++) {
      sum += requiredTaps(i);
    }
    return sum;
  }

  static double _pow(double base, int exp) {
    var result = 1.0;
    for (var i = 0; i < exp; i++) {
      result *= base;
    }
    return result;
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
