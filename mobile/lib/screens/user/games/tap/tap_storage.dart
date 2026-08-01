// Local persistence for tap-game progress.
//
// SharedPreferences (already a dependency — no new package) is enough here:
// the payload is four integers. Writes are debounced by the engine so a fast
// tapper does not hit the disk on every frame.
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

@immutable
class TapProgress {
  const TapProgress({
    this.level = 1,
    this.taps = 0,
    this.totalTaps = 0,
    this.pendingTaps = 0,
    this.flaggedTaps = 0,
  });

  /// Current level (1-based).
  final int level;

  /// Taps banked toward the CURRENT level.
  final int taps;

  /// Lifetime taps across all levels — the number worth showing off.
  final int totalTaps;

  /// Taps counted locally but not yet acknowledged by the server. Survives a
  /// kill so an offline session is not lost.
  final int pendingTaps;

  /// Taps rejected by the anti-cheat guard. Kept for telemetry; a large value
  /// is a strong signal of an autoclicker.
  final int flaggedTaps;

  TapProgress copyWith({
    int? level,
    int? taps,
    int? totalTaps,
    int? pendingTaps,
    int? flaggedTaps,
  }) {
    return TapProgress(
      level: level ?? this.level,
      taps: taps ?? this.taps,
      totalTaps: totalTaps ?? this.totalTaps,
      pendingTaps: pendingTaps ?? this.pendingTaps,
      flaggedTaps: flaggedTaps ?? this.flaggedTaps,
    );
  }

  Map<String, dynamic> toJson() => {
        'level': level,
        'taps': taps,
        'totalTaps': totalTaps,
        'pendingTaps': pendingTaps,
        'flaggedTaps': flaggedTaps,
      };

  static TapProgress fromJson(Map<String, dynamic> json) {
    int readInt(String key) {
      final v = json[key];
      if (v is int) return v < 0 ? 0 : v;
      if (v is num) return v.toInt().clamp(0, 1 << 40);
      return 0;
    }

    final level = readInt('level');
    return TapProgress(
      // A corrupt/absent level must never render an empty screen.
      level: level < 1 ? 1 : level,
      taps: readInt('taps'),
      totalTaps: readInt('totalTaps'),
      pendingTaps: readInt('pendingTaps'),
      flaggedTaps: readInt('flaggedTaps'),
    );
  }
}

class TapStorage {
  TapStorage({this.key = 'tap_game_progress_v1'});

  final String key;

  Future<TapProgress> load() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(key);
      if (raw == null || raw.isEmpty) return const TapProgress();
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return const TapProgress();
      return TapProgress.fromJson(Map<String, dynamic>.from(decoded));
    } catch (e) {
      // Corrupt storage must not brick the game — start fresh instead.
      debugPrint('tap progress load failed: $e');
      return const TapProgress();
    }
  }

  Future<void> save(TapProgress progress) async {
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setString(key, jsonEncode(progress.toJson()));
    } catch (e) {
      debugPrint('tap progress save failed: $e');
    }
  }

  Future<void> clear() async {
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.remove(key);
    } catch (_) {/* nothing to recover from */}
  }
}
