// Sound effects for the games.
//
// Deliberately fire-and-forget: audio must NEVER break gameplay, so every
// call is wrapped and failures are swallowed (an emulator with no audio
// device, a revoked permission, a codec hiccup...). The mute preference is
// persisted so it survives app restarts.
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum Sfx {
  move('move.mp3'),
  moveOpponent('move_opponent.mp3'),
  drop('drop.mp3'),
  flip('flip.mp3'),
  matchFound('match_found.mp3'),
  yourTurn('your_turn.mp3'),
  tick('tick.mp3'),
  tickUrgent('tick_urgent.mp3'),
  timeout('timeout.mp3'),
  win('win.mp3'),
  lose('lose.mp3'),
  draw('draw.mp3'),
  tap('tap.mp3');

  const Sfx(this.file);
  final String file;
}

class GameAudio {
  GameAudio._();
  static final GameAudio instance = GameAudio._();

  static const _prefsKey = 'game_sound_enabled';
  // A small pool: overlapping short clips (e.g. a tick landing on a move)
  // would otherwise cut each other off on a single player.
  static const _poolSize = 3;

  final List<AudioPlayer> _pool = [];
  int _next = 0;
  bool _enabled = true;
  bool _ready = false;

  bool get enabled => _enabled;

  Future<void> load() async {
    try {
      final sp = await SharedPreferences.getInstance();
      _enabled = sp.getBool(_prefsKey) ?? true;
    } catch (_) {
      _enabled = true;
    }
  }

  Future<void> setEnabled(bool v) async {
    _enabled = v;
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setBool(_prefsKey, v);
    } catch (_) {/* preference is cosmetic; ignore storage failures */}
    if (!v) await stopAll();
  }

  void _init() {
    if (_ready) return;
    _ready = true;
    for (var i = 0; i < _poolSize; i++) {
      final p = AudioPlayer()..setReleaseMode(ReleaseMode.stop);
      // Never let game SFX hijack music the user is playing elsewhere.
      p.setPlayerMode(PlayerMode.lowLatency);
      _pool.add(p);
    }
  }

  /// Plays a clip. Safe to call from anywhere, never throws, never awaits
  /// the actual playback.
  void play(Sfx sfx, {double volume = 1.0}) {
    if (!_enabled) return;
    try {
      _init();
      final player = _pool[_next % _pool.length];
      _next++;
      player
        ..setVolume(volume.clamp(0.0, 1.0))
        ..play(AssetSource('sfx/${sfx.file}')).catchError((Object e) {
          debugPrint('sfx ${sfx.file} failed: $e');
        });
    } catch (e) {
      debugPrint('sfx error: $e');
    }
  }

  Future<void> stopAll() async {
    for (final p in _pool) {
      try {
        await p.stop();
      } catch (_) {/* ignore */}
    }
  }

  Future<void> dispose() async {
    for (final p in _pool) {
      try {
        await p.dispose();
      } catch (_) {/* ignore */}
    }
    _pool.clear();
    _ready = false;
  }
}
