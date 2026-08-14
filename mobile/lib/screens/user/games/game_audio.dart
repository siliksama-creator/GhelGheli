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
  tap('tap.mp3'),
  duelLock('duel_lock.mp3'),
  duelIntro('duel_intro.mp3'),
  duelRoundWin('duel_round_win.mp3'),
  duelRoundLose('duel_round_lose.mp3'),
  duelRoundDraw('duel_round_draw.mp3'),
  duelPoints('duel_points.mp3'),
  duelFinalDraw('duel_final_draw.mp3'),
  duelVictory('duel_victory.mp3'),
  duelDefeat('duel_defeat.mp3');

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
  final AudioPlayer _musicPlayer = AudioPlayer();
  int _next = 0;
  bool _enabled = true;
  bool _ready = false;
  bool _duelMusicRequested = false;
  bool _duelMusicPlaying = false;

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
    if (!v) {
      await stopAll();
    } else if (_duelMusicRequested) {
      startDuelMusic();
    }
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

  /// Starts the original card-duel soundtrack at a restrained level. The
  /// request survives a temporary mute, so unmuting during a duel resumes it.
  void startDuelMusic() {
    _duelMusicRequested = true;
    if (!_enabled || _duelMusicPlaying) return;
    _duelMusicPlaying = true;
    () async {
      try {
        await _musicPlayer.setReleaseMode(ReleaseMode.loop);
        await _musicPlayer.setVolume(0.20);
        await _musicPlayer.play(AssetSource('sfx/duel_music.mp3'));
      } catch (e) {
        _duelMusicPlaying = false;
        debugPrint('duel music failed: $e');
      }
    }();
  }

  Future<void> stopDuelMusic() async {
    _duelMusicRequested = false;
    _duelMusicPlaying = false;
    try {
      await _musicPlayer.stop();
    } catch (_) {/* ignore */}
  }

  Future<void> stopAll() async {
    _duelMusicPlaying = false;
    try {
      await _musicPlayer.stop();
    } catch (_) {/* ignore */}
    for (final p in _pool) {
      try {
        await p.stop();
      } catch (_) {/* ignore */}
    }
  }

  Future<void> dispose() async {
    _duelMusicRequested = false;
    _duelMusicPlaying = false;
    try {
      await _musicPlayer.dispose();
    } catch (_) {/* ignore */}
    for (final p in _pool) {
      try {
        await p.dispose();
      } catch (_) {/* ignore */}
    }
    _pool.clear();
    _ready = false;
  }
}
