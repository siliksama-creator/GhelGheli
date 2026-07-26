// Solo (time-attack) session: same board, no opponent, scored on the clock.
//
// Deliberately awards NO points — the reward is your personal record and a
// place on the leaderboard. All authority lives on the server: it owns the
// deck, the timer and the flip counter, so a tampered client cannot post a
// half-second "record".
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import 'game_audio.dart';

enum SoloPhase { idle, playing, over }

class SoloSession extends ChangeNotifier {
  SoloSession({required this.api, required this.gameId});

  final ApiClient api;
  final String gameId;

  /// Reuses the multiplayer socket when the caller already has one open, so
  /// switching between "find an opponent" and "play alone" never costs a
  /// second handshake.
  io.Socket? _socket;
  bool _ownsSocket = false;

  SoloPhase phase = SoloPhase.idle;
  Map<String, dynamic> state = const {};
  String? error;

  int flips = 0;
  /// Elapsed milliseconds, driven by a LOCAL monotonic stopwatch and
  /// re-synced from the server on every update. Never `DateTime.now()`
  /// arithmetic against a server timestamp — a wrong device clock froze the
  /// old game clocks solid.
  final Stopwatch _watch = Stopwatch();
  Timer? _ticker;
  int elapsedMs = 0;

  // Final result.
  int? finalMs;
  int? finalFlips;
  bool perfect = false;
  bool isRecord = false;
  int? rank;
  int? bestMs;
  int? bestFlips;
  int? previousMs;

  bool get running => phase == SoloPhase.playing;

  void attachSocket(io.Socket socket) {
    if (_socket != null) return;
    _socket = socket;
    _ownsSocket = false;
    _bind();
  }

  void connect() {
    if (_socket != null) return;
    _ownsSocket = true;
    _socket = io.io(
      api.baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': api.token})
          .enableForceNew()
          .enableReconnection()
          .setTimeout(10000)
          .build(),
    );
    _bind();
  }

  void _bind() {
    final s = _socket;
    if (s == null) return;

    s.on('solo:error', (d) {
      error = d is Map && d['message'] != null ? '${d['message']}' : 'خطا در بازی';
      phase = SoloPhase.idle;
      _stopClock();
      notifyListeners();
    });

    s.on('solo:start', (d) {
      final m = _asMap(d);
      state = _asMap(m['state']);
      flips = (state['flips'] as num?)?.toInt() ?? 0;
      error = null;
      finalMs = null;
      phase = SoloPhase.playing;
      _startClock();
      GameAudio.instance.play(Sfx.matchFound);
      notifyListeners();
    });

    s.on('solo:update', (d) {
      final m = _asMap(d);
      state = _asMap(m['state']);
      flips = (state['flips'] as num?)?.toInt() ?? flips;
      GameAudio.instance.play(Sfx.flip, volume: 0.85);
      notifyListeners();
    });

    s.on('solo:over', (d) {
      final m = _asMap(d);
      if (m['state'] != null) state = _asMap(m['state']);
      finalMs = (m['durationMs'] as num?)?.toInt();
      finalFlips = (m['flips'] as num?)?.toInt();
      perfect = m['perfect'] == true;
      isRecord = m['isRecord'] == true;
      rank = (m['rank'] as num?)?.toInt();
      final best = m['best'];
      if (best is Map) {
        bestMs = (best['durationMs'] as num?)?.toInt();
        bestFlips = (best['flips'] as num?)?.toInt();
      }
      final prev = m['previous'];
      previousMs = prev is Map ? (prev['durationMs'] as num?)?.toInt() : null;
      phase = SoloPhase.over;
      _stopClock();
      GameAudio.instance.play(isRecord ? Sfx.win : Sfx.draw);
      notifyListeners();
    });
  }

  void start() {
    connect();
    error = null;
    isRecord = false;
    rank = null;
    finalMs = null;
    _socket?.emit('solo:start', {'gameId': gameId});
  }

  void move(int index) {
    if (phase != SoloPhase.playing) return;
    _socket?.emit('solo:move', {'move': index});
  }

  void leave() {
    _socket?.emit('solo:leave', {});
    phase = SoloPhase.idle;
    state = const {};
    _stopClock();
    notifyListeners();
  }

  void _startClock() {
    _ticker?.cancel();
    _watch
      ..reset()
      ..start();
    elapsedMs = 0;
    // 100ms is plenty for a centisecond readout and costs almost nothing;
    // a 16ms timer here would repaint the whole board 60×/s for no gain.
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      elapsedMs = _watch.elapsedMilliseconds;
      notifyListeners();
    });
  }

  void _stopClock() {
    _ticker?.cancel();
    _ticker = null;
    _watch.stop();
  }

  static Map<String, dynamic> _asMap(dynamic d) =>
      d is Map ? d.map((k, v) => MapEntry('$k', v)) : <String, dynamic>{};

  @override
  void dispose() {
    _ticker?.cancel();
    _socket?.off('solo:start');
    _socket?.off('solo:update');
    _socket?.off('solo:over');
    _socket?.off('solo:error');
    // Only tear down a socket we opened ourselves; the shared one belongs to
    // the multiplayer session.
    if (_ownsSocket) _socket?.dispose();
    _socket = null;
    super.dispose();
  }
}

/// `83214` -> `۱:۲۳٫۲۱` — a stopwatch readout, in Persian digits.
String formatRunTime(int? ms) {
  if (ms == null || ms < 0) return '—';
  final total = ms ~/ 10; // centiseconds
  final cs = total % 100;
  final secs = (total ~/ 100) % 60;
  final mins = total ~/ 6000;
  String two(int n) => faNum(n.toString().padLeft(2, '0'));
  if (mins > 0) return '${faNum(mins)}:${two(secs)}٫${two(cs)}';
  return '${faNum(secs)}٫${two(cs)}';
}
