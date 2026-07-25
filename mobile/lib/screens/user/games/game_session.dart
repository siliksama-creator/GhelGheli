// Shared socket session for every board game.
//
// All games speak the same protocol (join / waiting / start / update / over),
// so the connection handling lives here once and each board file only draws
// its own grid. Keeps every game screen small.
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../api_client.dart';

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

  bool get myTurn => phase == GamePhase.playing && turn != null && turn == mySymbol;

  void connect() {
    if (_socket != null) return;
    final s = io.io(
      api.baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': api.token})
          .enableForceNew()
          .build(),
    );
    _socket = s;

    s.onConnectError((e) => _fail('اتصال به سرور بازی برقرار نشد'));
    s.onError((e) => debugPrint('game socket error: $e'));

    s.on('game:error', (d) => _fail(_msg(d) ?? 'خطا در بازی'));

    s.on('game:waiting', (_) {
      phase = GamePhase.waiting;
      error = null;
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
      phase = GamePhase.playing;
      error = null;
      notifyListeners();
    });

    s.on('game:update', (d) {
      final m = _asMap(d);
      state = _asMap(m['state']);
      turn = m['turn'] as String?;
      lastMove = (m['lastMove'] as num?)?.toInt();
      notifyListeners();
    });

    s.on('game:over', (d) {
      final m = _asMap(d);
      if (m['state'] != null) state = _asMap(m['state']);
      winner = m['winner'] as String?;
      phase = GamePhase.over;
      notifyListeners();
    });
  }

  void join() {
    connect();
    error = null;
    winner = null;
    lastMove = null;
    _socket?.emit('game:join', {'gameId': gameId});
    phase = GamePhase.waiting;
    notifyListeners();
  }

  void move(int index) {
    if (!myTurn) return;
    _socket?.emit('game:move', {'roomId': _roomId, 'move': index});
  }

  void leave() {
    _socket?.emit('game:leave', {'roomId': _roomId});
    phase = GamePhase.idle;
    winner = null;
    state = const {};
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

  void _fail(String m) {
    error = m;
    phase = GamePhase.idle;
    notifyListeners();
  }

  static String? _msg(dynamic d) =>
      d is Map && d['message'] != null ? '${d['message']}' : null;

  static Map<String, dynamic> _asMap(dynamic d) =>
      d is Map ? d.map((k, v) => MapEntry('$k', v)) : <String, dynamic>{};

  @override
  void dispose() {
    _socket?.dispose();
    _socket = null;
    super.dispose();
  }
}
