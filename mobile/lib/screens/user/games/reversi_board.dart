// اتللو — 8x8.
import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import 'game_scaffold.dart';
import 'game_session.dart';

const _accent = Color(0xFF34D399);
const _felt = Color(0xFF15803D);
const _n = 8;

class ReversiScreen extends StatefulWidget {
  const ReversiScreen({
    super.key,
    required this.api,
    required this.onBack,
    this.stake = 0,
    this.vsBot = false,
    this.roomCode,
  });

  final ApiClient api;
  final VoidCallback onBack;
  final int stake;
  final bool vsBot;
  final String? roomCode;

  @override
  State<ReversiScreen> createState() => _ReversiScreenState();
}

class _ReversiScreenState extends State<ReversiScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'reversi')..connect();

  @override
  void initState() {
    super.initState();
    if (widget.vsBot) {
      _s.playWithBotImmediately();
    } else if (widget.roomCode != null && widget.roomCode!.isNotEmpty) {
      _s.joinRoom(widget.roomCode!);
    } else if (widget.stake > 0) {
      _s.join(stake: widget.stake, vsBot: false);
    }
  }

  @override
  void dispose() {
    _s.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GameScaffold(
      session: _s,
      api: widget.api,
      title: 'اتللو',
      accent: _accent,
      symbols: const {'X': 'assets/pass/football_icon.webp', 'O': 'assets/games/reversi.webp'},
      onBack: widget.onBack,
      scoreboard: _Score(session: _s),
      boardBuilder: (_) => _Board(session: _s),
    );
  }
}

class _Score extends StatelessWidget {
  const _Score({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final s = session.state;
    final scores = s['scores'] as Map?;
    final x = (scores?['X'] as num?)?.toInt() ?? 2;
    final o = (scores?['O'] as num?)?.toInt() ?? 2;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('توپ: $x', style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.white)),
        const SizedBox(width: 20),
        Text('مهره: $o', style: const TextStyle(fontWeight: FontWeight.w900, color: _accent)),
      ],
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final s = session.state;
    final board = (s['board'] as List?) ?? List.filled(_n * _n, null);
    final legal = List<int>.from(s['legalMoves'] ?? []);

    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: _felt,
          borderRadius: Corners.rLg,
          border: Border.all(color: Colors.black45, width: 4),
        ),
        child: GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: _n,
            mainAxisSpacing: 2,
            crossAxisSpacing: 2,
          ),
          itemCount: _n * _n,
          itemBuilder: (ctx, i) {
            final cell = board[i];
            final isLegal = legal.contains(i) && session.myTurn;
            return InkWell(
              onTap: isLegal ? () => session.move(i) : null,
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF166534),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Center(
                  child: cell == 'X'
                      ? Image.asset('assets/pass/football_icon.webp', width: 24, height: 24)
                      : (cell == 'O'
                          ? Image.asset('assets/games/reversi.webp', width: 24, height: 24)
                          : (isLegal
                              ? Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white60))
                              : null)),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
