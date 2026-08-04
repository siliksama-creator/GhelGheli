// اتللو — 8x8. The server sends this player's legal squares, which we
// render as hint dots so the rules stay discoverable.
import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import 'game_scaffold.dart';
import 'game_session.dart';

const _accent = Color(0xFF34D399);
const _felt = Color(0xFF15803D);
const _n = 8;

class ReversiScreen extends StatefulWidget {
  const ReversiScreen({super.key, required this.api, required this.onBack});
  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<ReversiScreen> createState() => _ReversiScreenState();
}

class _ReversiScreenState extends State<ReversiScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'reversi')..connect();

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
      symbols: const {'X': '⚫', 'O': '⚪'},
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
    final scores = session.state['scores'];
    if (scores is! Map) return const SizedBox.shrink();
    final theme = Theme.of(context);
    Widget tile(String emoji, Object? n) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 20)),
            Gaps.hXxs,
            Text(faNum(n ?? 0),
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ],
        );
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: Gaps.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [tile('⚫', scores['X']), tile('⚪', scores['O'])],
      ),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final board = (session.state['board'] as List?) ?? List.filled(64, null);
    final legal = (session.state['legal'] as List?)?.cast<int>() ?? const [];
    final canPlay = session.myTurn;

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: AspectRatio(
          aspectRatio: 1,
          child: Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              color: _felt,
              borderRadius: Corners.rLg,
              border: Border.all(color: const Color(0xFF14532D), width: 3),
            ),
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: _n,
                mainAxisSpacing: 1.5,
                crossAxisSpacing: 1.5,
              ),
              itemCount: _n * _n,
              itemBuilder: (context, i) {
                final v = board.length > i ? board[i] as String? : null;
                final hint = canPlay && legal.contains(i);
                return GestureDetector(
                  onTap: hint ? () => session.move(i) : null,
                  // DecoratedBox و نه Container: این ویجت در یک شبکهٔ ۸×۸
                  // (۶۴ خانه) ساخته می‌شود و هر بار که حریف حرکت می‌کند
                  // کل شبکه دوباره ساخته می‌شود. Container خودش یک
                  // ویجتِ ترکیبی است که برای هر خانه چند لایهٔ اضافه
                  // می‌سازد؛ وقتی فقط decoration می‌خواهیم، آن لایه‌ها
                  // خالص هزینه‌اند.
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFF16A34A).withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(3),
                      border: session.lastMove == i
                          ? Border.all(color: _accent, width: 1.6)
                          : null,
                    ),
                    child: Center(
                      child: v == null
                          ? (hint
                              ? Container(
                                  width: 9,
                                  height: 9,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color:
                                        Colors.white.withValues(alpha: 0.55),
                                  ),
                                )
                              : const SizedBox.shrink())
                          : AnimatedScale(
                              duration: Motion.fast,
                              scale: 1,
                              child: Container(
                                margin: const EdgeInsets.all(2),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: v == 'X'
                                      ? const Color(0xFF111827)
                                      : Colors.white,
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black
                                          .withValues(alpha: 0.35),
                                      blurRadius: 3,
                                      offset: const Offset(0, 1),
                                    ),
                                  ],
                                ),
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
