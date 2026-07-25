// دوز — 3x3 board. Only the grid lives here; chrome comes from GameScaffold.
import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import 'game_scaffold.dart';
import 'game_session.dart';

const _accent = Color(0xFF22D3EE);

class TicTacToeScreen extends StatefulWidget {
  const TicTacToeScreen({super.key, required this.api, required this.onBack});
  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<TicTacToeScreen> createState() => _TicTacToeScreenState();
}

class _TicTacToeScreenState extends State<TicTacToeScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'tictactoe')..connect();

  @override
  void dispose() {
    _s.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GameScaffold(
      session: _s,
      title: 'دوز',
      accent: _accent,
      symbols: const {'X': '❌', 'O': '⭕'},
      onBack: widget.onBack,
      boardBuilder: (_) => _Board(session: _s),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final board = (session.state['board'] as List?) ?? List.filled(9, null);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320),
        child: AspectRatio(
          aspectRatio: 1,
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: scheme.onSurface.withValues(alpha: 0.85),
              borderRadius: Corners.rLg,
            ),
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate:
                  const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
              ),
              itemCount: 9,
              itemBuilder: (context, i) {
                final v = board.length > i ? board[i] : null;
                final isLast = session.lastMove == i;
                return GestureDetector(
                  onTap: v == null ? () => session.move(i) : null,
                  child: AnimatedContainer(
                    duration: Motion.fast,
                    decoration: BoxDecoration(
                      color: isLast
                          ? _accent.withValues(alpha: 0.22)
                          : scheme.surface,
                      borderRadius: Corners.rSm,
                    ),
                    child: Center(
                      child: AnimatedScale(
                        duration: Motion.normal,
                        curve: Curves.easeOutBack,
                        scale: v == null ? 0.4 : 1,
                        child: Text(
                          v == 'X' ? '❌' : (v == 'O' ? '⭕' : ''),
                          style: const TextStyle(fontSize: 44),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
