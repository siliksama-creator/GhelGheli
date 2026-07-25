// Shared socket session for every board game.
//
// All games speak the same protocol (join / waiting / start / update / over),
// so the connection handling lives here once and each board file only draws
// its own grid. Keeps every game screen small.
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../api_client.dart';
import 'game_audio.dart';

enum GamePhase { idle, waiting, playing, over }

class GameSession extends ChangeNotifier {
  GameSession({required this.api, required this.gameId});

  final ApiClient api;
  final String gameId;

  io.Socket? _socket;
  GamePhase phase = GamePhase.idle;
  Map<String, dynamic> state = const {};
  Map? players;
  String? mySymbol;
  String? turn;
  String? winner;
  String? error;
  bool vsBot = false;
  String? _roomId;
  int? lastMove;

  /// Countdown for the player currently on move. Driven by the server's
  /// `deadline` so both clients agree even if one lags.
  int secondsLeft = 0;
  int turnSeconds = 15;
  /// Countdown while hunting for a real opponent (before the bot steps in).
  int searchSecondsLeft = 0;
  int searchSeconds = 15;
  String? timedOutSymbol;
  /// False while the socket is down, so the UI can show a reconnect notice
  /// instead of a silently frozen board.
  bool connected = true;
  Timer? _ticker;
  Timer? _searchTicker;
  int _lastTickPlayed = -1;

  bool get myTurn => phase == GamePhase.playing && turn != null && turn == mySymbol;

  /// Opponent's user id, for opening their public profile.
  Object? get opponentId {
    if (mySymbol == null) return null;
    final other = players?[mySymbol == 'X' ? 'O' : 'X'];
    if (other is Map && other['isBot'] != true) return other['id'];
    return null;
  }

  Map? playerInfo(String symbol) {
    final p = players?[symbol];
    return p is Map ? p : null;
  }

  void connect() {
    if (_socket != null) return;
    final s = io.io(
      api.baseUrl,
      io.OptionBuilder()
          // Allow the polling fallback: some mobile carriers and captive
          // proxies block raw websockets, and a websocket-only client simply
          // never connects on those networks.
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': api.token})
          .enableForceNew()
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(800)
          .setReconnectionDelayMax(5000)
          .setTimeout(10000)
          .build(),
    );
    _socket = s;

    s.onConnectError((e) {
      // Only surface a hard failure before we ever connected; once a game is
      // running a blip is handled by the reconnect logic below.
      if (phase == GamePhase.idle || phase == GamePhase.waiting) {
        _fail('اتصال به سرور بازی برقرار نشد');
      } else {
        _setConnected(false);
      }
    });
    s.onError((e) => debugPrint('game socket error: $e'));

    // CONNECTION RESILIENCE. Previously there was no disconnect handling at
    // all: if the phone changed cell tower or dropped Wi-Fi mid-match the
    // board simply froze with no explanation and no recovery.
    s.onDisconnect((_) {
      _setConnected(false);
      _stopClock();
    });
    s.onConnect((_) => _setConnected(true));
    s.on('reconnect', (_) {
      _setConnected(true);
      // Our room is gone server-side after a real disconnect, so drop back
      // to the lobby rather than showing a stale board.
      if (phase == GamePhase.playing) {
        error = 'اتصال قطع شد؛ لطفاً دوباره شروع کنید';
        phase = GamePhase.idle;
        _stopClock();
        notifyListeners();
      }
    });

    s.on('game:error', (d) => _fail(_msg(d) ?? 'خطا در بازی'));

    s.on('game:waiting', (d) {
      final m = _asMap(d);
      phase = GamePhase.waiting;
      error = null;
      _startSearchClock(m['deadline'], m['waitMs'], m['remainingMs']);
      notifyListeners();
    });

    s.on('game:start', (d) {
      final m = _asMap(d);
      _roomId = m['roomId'] as String?;
      players = m['players'] as Map?;
      mySymbol = m['yourSymbol'] as String?;
      vsBot = m['vsBot'] == true;
      turn = m['turn'] as String?;
      state = _asMap(m['state']);
      winner = null;
      timedOutSymbol = null;
      phase = GamePhase.playing;
      error = null;
      GameAudio.instance.play(Sfx.matchFound);
      _stopSearchClock();
      _startClock(m['deadline'], m['turnMs'], m['remainingMs']);
      notifyListeners();
    });

    s.on('game:update', (d) {
      final m = _asMap(d);
      final wasMyTurn = myTurn;
      state = _asMap(m['state']);
      turn = m['turn'] as String?;
      lastMove = (m['lastMove'] as num?)?.toInt();
      timedOutSymbol = m['timedOut'] as String?;

      if (timedOutSymbol != null) {
        GameAudio.instance.play(Sfx.timeout);
      } else if (!wasMyTurn) {
        // The move we just received came from the opponent.
        GameAudio.instance.play(moveSound, volume: 0.9);
      }
      if (!wasMyTurn && myTurn) GameAudio.instance.play(Sfx.yourTurn);

      _startClock(m['deadline'], m['turnMs'], m['remainingMs']);
      notifyListeners();
    });

    s.on('game:over', (d) {
      final m = _asMap(d);
      if (m['state'] != null) state = _asMap(m['state']);
      winner = m['winner'] as String?;
      phase = GamePhase.over;
      _stopClock();
      GameAudio.instance.play(
        winner == 'DRAW' ? Sfx.draw : (iWon ? Sfx.win : Sfx.lose),
      );
      notifyListeners();
    });
  }

  void _startClock(dynamic deadline, dynamic turnMs, dynamic remainingMs) {
    _ticker?.cancel();
    final ms = (turnMs as num?)?.toInt();
    if (ms != null && ms > 0) turnSeconds = (ms / 1000).round();

    // Use the server's REMAINING milliseconds against a local stopwatch
    // rather than `deadline - DateTime.now()`. A device with a wrong clock
    // (extremely common on Android) produced a nonsense difference that
    // clamped to the maximum, so the countdown sat frozen at 15 and never
    // moved. A stopwatch is monotonic and immune to that.
    final remaining = (remainingMs as num?)?.toInt() ??
        ((deadline as num?) != null
            ? (deadline as num).toInt() - DateTime.now().millisecondsSinceEpoch
            : null);
    if (remaining == null) {
      secondsLeft = 0;
      notifyListeners();
      return;
    }

    final total = remaining < 0 ? 0 : remaining;
    final watch = Stopwatch()..start();
    _lastTickPlayed = -1;

    void tick() {
      final leftMs = total - watch.elapsedMilliseconds;
      final left = (leftMs / 1000).ceil();
      final clamped = left < 0 ? 0 : (left > turnSeconds ? turnSeconds : left);
      if (clamped != secondsLeft) {
        secondsLeft = clamped;
        if (myTurn && clamped <= 5 && clamped > 0 && clamped != _lastTickPlayed) {
          _lastTickPlayed = clamped;
          GameAudio.instance
              .play(clamped <= 3 ? Sfx.tickUrgent : Sfx.tick, volume: 0.65);
        }
        notifyListeners();
      }
      if (leftMs <= 0) _ticker?.cancel();
    }

    tick();
    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) => tick());
  }

  /// Ticks down the "looking for a real opponent" window.
  void _startSearchClock(dynamic deadline, dynamic waitMs, dynamic remainingMs) {
    _searchTicker?.cancel();
    final ms = (waitMs as num?)?.toInt();
    if (ms != null && ms > 0) searchSeconds = (ms / 1000).round();

    // Same monotonic approach as the turn clock — this is exactly the timer
    // that was reported stuck on 15.
    final remaining = (remainingMs as num?)?.toInt() ??
        ((deadline as num?) != null
            ? (deadline as num).toInt() - DateTime.now().millisecondsSinceEpoch
            : searchSeconds * 1000);
    final total = remaining < 0 ? 0 : remaining;
    final watch = Stopwatch()..start();

    void tick() {
      final leftMs = total - watch.elapsedMilliseconds;
      final left = (leftMs / 1000).ceil();
      final clamped =
          left < 0 ? 0 : (left > searchSeconds ? searchSeconds : left);
      if (clamped != searchSecondsLeft) {
        searchSecondsLeft = clamped;
        notifyListeners();
      }
      if (leftMs <= 0) _searchTicker?.cancel();
    }

    tick();
    _searchTicker =
        Timer.periodic(const Duration(milliseconds: 200), (_) => tick());
  }

  void _stopSearchClock() {
    _searchTicker?.cancel();
    _searchTicker = null;
  }

  void _stopClock() {
    _ticker?.cancel();
    _ticker = null;
    secondsLeft = 0;
  }

  void join() {
    connect();
    error = null;
    winner = null;
    lastMove = null;
    timedOutSymbol = null;
    _socket?.emit('game:join', {'gameId': gameId});
    phase = GamePhase.waiting;
    notifyListeners();
  }

  /// Piece-placement sound, chosen per game so each board feels distinct.
  Sfx get moveSound {
    switch (gameId) {
      case 'connect4':
        return Sfx.drop;
      case 'reversi':
        return Sfx.flip;
      case 'snakes':
        return Sfx.drop;
      default:
        return Sfx.move;
    }
  }

  void move(int index) {
    if (!myTurn) return;
    GameAudio.instance.play(moveSound);
    _socket?.emit('game:move', {'roomId': _roomId, 'move': index});
  }

  void leave() {
    _socket?.emit('game:leave', {'roomId': _roomId});
    phase = GamePhase.idle;
    winner = null;
    state = const {};
    timedOutSymbol = null;
    _stopClock();
    _stopSearchClock();
    notifyListeners();
  }

  /// Result line shown when the game ends.
  String get resultText {
    switch (winner) {
      case 'DRAW':
        return 'مساوی شد!';
      case 'DISCONNECT':
        return 'حریف بازی را ترک کرد';
      case null:
        return 'پایان بازی';
      default:
        if (mySymbol == null) return 'برنده: $winner';
        return winner == mySymbol ? 'شما بردید! 🎉' : 'شما باختید';
    }
  }

  bool get iWon => winner != null && winner == mySymbol;

  String nameOf(String symbol) {
    final p = players?[symbol];
    if (p is Map && p['nickname'] != null) return '${p['nickname']}';
    return 'کاربر';
  }

  void _setConnected(bool v) {
    if (connected == v) return;
    connected = v;
    notifyListeners();
  }

  void _fail(String m) {
    error = m;
    phase = GamePhase.idle;
    _stopClock();
    _stopSearchClock();
    notifyListeners();
  }

  static String? _msg(dynamic d) =>
      d is Map && d['message'] != null ? '${d['message']}' : null;

  static Map<String, dynamic> _asMap(dynamic d) =>
      d is Map ? d.map((k, v) => MapEntry('$k', v)) : <String, dynamic>{};

  @override
  void dispose() {
    _ticker?.cancel();
    _searchTicker?.cancel();
    _socket?.dispose();
    _socket = null;
    super.dispose();
  }
}
