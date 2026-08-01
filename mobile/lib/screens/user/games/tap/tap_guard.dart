// Client-side anti-cheat for the tap game.
//
// This is the FIRST of two gates, not the only one. Anything running on the
// user's device can be patched out, so the server re-derives the same limits
// from the batch it receives (see backend/src/services/tapGameService.js).
// The point of this class is to (a) stop casual autoclickers cheaply, and
// (b) collect an honest signal — `flagged` — that the server can weigh.
//
// Two independent checks:
//   1. Hard debounce — a single interval shorter than a human can produce.
//   2. Sliding window — sustained rate over the last second.
//
// A tap that fails either check is NOT counted and NOT sent.
import 'dart:collection';

import 'tap_config.dart';

enum TapVerdict {
  /// Counted normally.
  accepted,

  /// Two taps closer together than physically plausible.
  tooFast,

  /// Sustained rate above the ceiling.
  rateLimited,
}

class TapGuard {
  TapGuard({required this.config});

  final TapGameConfig config;

  /// Timestamps (ms since epoch of a monotonic source) inside the window.
  final Queue<int> _window = Queue<int>();
  int _lastTapMs = -1;

  int _accepted = 0;
  int _rejected = 0;

  int get acceptedCount => _accepted;
  int get rejectedCount => _rejected;

  /// Instantaneous taps-per-second over the sliding window — drives the
  /// "slow down" hint in the UI.
  int get currentRate => _window.length;

  /// Feeds one tap through both gates.
  ///
  /// [nowMs] must come from a MONOTONIC source (a Stopwatch), never
  /// DateTime.now() — a user who changes the device clock mid-session would
  /// otherwise be able to reset the window at will.
  TapVerdict register(int nowMs) {
    // Gate 1: hard debounce.
    if (_lastTapMs >= 0) {
      final gap = nowMs - _lastTapMs;
      if (gap < config.minTapInterval.inMilliseconds) {
        _rejected++;
        return TapVerdict.tooFast;
      }
    }

    // Gate 2: sustained rate. Evict everything older than the window first.
    final cutoff = nowMs - config.burstWindow.inMilliseconds;
    while (_window.isNotEmpty && _window.first <= cutoff) {
      _window.removeFirst();
    }
    if (_window.length >= config.maxTapsPerSecond) {
      _rejected++;
      return TapVerdict.rateLimited;
    }

    _window.addLast(nowMs);
    _lastTapMs = nowMs;
    _accepted++;
    return TapVerdict.accepted;
  }

  /// True when the player is pushing right up against the ceiling — used to
  /// show a gentle hint rather than silently eating their taps.
  bool get nearLimit => _window.length >= config.maxTapsPerSecond - 2;

  void reset() {
    _window.clear();
    _lastTapMs = -1;
    _accepted = 0;
    _rejected = 0;
  }
}
