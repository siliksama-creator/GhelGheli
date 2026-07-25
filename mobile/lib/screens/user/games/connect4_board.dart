// چهار در یک ردیف — tap a COLUMN and the disc drops to the lowest free cell.
import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import 'game_scaffold.dart';
import 'game_session.dart';

const _accent = Color(0xFFF59E0B);
const _red = Color(0xFFEF4444);
const _yellow = Color(0xFFFACC15);
const _cols = 7;
const _rows = 6;

class Connect4Screen extends StatefulWidget {
  const Connect4Screen({super.key, required this.api, required this.onBack});
  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<Connect4Screen> createState() => _Connect4ScreenState();
}

class _Connect4ScreenState extends State<Connect4Screen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'connect4')..connect();

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
      title: 'چهار در یک ردیف',
      accent: _accent,
      symbols: const {'X': '🔴', 'O': '🟡'},
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
    final board = (session.state['board'] as List?) ?? List.filled(42, null);
    final winLine = (session.state['winLine'] as List?)?.cast<int>() ?? const [];

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: AspectRatio(
          aspectRatio: _cols / _rows,
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1D4ED8), Color(0xFF1E3A8A)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: Corners.rLg,
            ),
            child: LayoutBuilder(
              builder: (context, box) {
                final cell = box.maxWidth / _cols;
                return Row(
                  children: List.generate(_cols, (c) {
                    return Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => session.move(c),
                        child: Column(
                          children: List.generate(_rows, (r) {
                            final i = r * _cols + c;
                            final v = board.length > i ? board[i] : null;
                            return SizedBox(
                              height: cell,
                              child: Padding(
                                padding: const EdgeInsets.all(3),
                                child: _Disc(
                                  value: v as String?,
                                  highlight: winLine.contains(i),
                                ),
                              ),
                            );
                          }),
                        ),
                      ),
                    );
                  }),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _Disc extends StatelessWidget {
  const _Disc({required this.value, required this.highlight});
  final String? value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final color = value == 'X' ? _red : (value == 'O' ? _yellow : null);
    return AnimatedContainer(
      duration: Motion.normal,
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color ?? const Color(0xFF0F172A).withValues(alpha: 0.55),
        border: highlight
            ? Border.all(color: Colors.white, width: 2.5)
            : Border.all(color: Colors.black.withValues(alpha: 0.18)),
        boxShadow: color == null
            ? null
            : [
                BoxShadow(
                  color: color.withValues(alpha: 0.5),
                  blurRadius: highlight ? 14 : 5,
                ),
              ],
      ),
    );
  }
}
