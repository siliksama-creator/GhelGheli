// جفت‌یاب — competitive memory with a real 3D card flip.
//
// Chosen over the old Snakes & Ladders because it needs ZERO image assets:
// every card is emoji + gradient, so nothing has to be drawn, scaled or kept
// legible on a small screen. The flip is a genuine Y-axis rotation with a
// perspective matrix, which is the kind of thing Flutter renders beautifully
// for free.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import 'game_scaffold.dart';
import 'game_session.dart';

const _accent = Color(0xFFA855F7);

class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key, required this.api, required this.onBack});
  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'memory')..connect();

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
      title: 'جفت‌یاب',
      accent: _accent,
      symbols: const {'X': '🟣', 'O': '🔵'},
      onBack: widget.onBack,
      scoreboard: _Scoreboard(session: _s),
      boardBuilder: (_) => _Board(session: _s),
    );
  }
}

/// Pair counts for both players, with the leader highlighted.
class _Scoreboard extends StatelessWidget {
  const _Scoreboard({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final scores = session.state['scores'];
    if (scores is! Map) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final x = (scores['X'] as num?)?.toInt() ?? 0;
    final o = (scores['O'] as num?)?.toInt() ?? 0;

    Widget side(String sym, int value, bool leading) => Expanded(
          child: AnimatedContainer(
            duration: Motion.fast,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              borderRadius: Corners.rMd,
              color: leading
                  ? _accent.withValues(alpha: 0.16)
                  : Colors.transparent,
            ),
            child: Column(
              children: [
                Text(
                  session.mySymbol == sym ? 'شما' : 'حریف',
                  style: theme.textTheme.labelSmall,
                ),
                Text(
                  '${faNum(value)} جفت',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
        );

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
      child: Row(
        children: [
          side('X', x, x > o),
          const Text('•', style: TextStyle(color: Colors.white24)),
          side('O', o, o > x),
        ],
      ),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final cards = (session.state['cards'] as List?) ?? const [];
    final playable =
        (session.state['playable'] as List?)?.cast<int>() ?? const [];
    final cols = (session.state['cols'] as num?)?.toInt() ?? 4;
    final result = '${session.state['lastResult'] ?? ''}';

    return Column(
      children: [
        if (result == 'match' || result == 'miss')
          Padding(
            padding: const EdgeInsets.only(bottom: Gaps.xs),
            child: Text(
              result == 'match' ? '✅ جفت شد! دوباره بزن' : '❌ جفت نشد',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: result == 'match'
                        ? const Color(0xFF34D399)
                        : const Color(0xFFF87171),
                  ),
            ),
          ),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: cols,
                mainAxisSpacing: Gaps.xs,
                crossAxisSpacing: Gaps.xs,
                childAspectRatio: 0.82,
              ),
              itemCount: cards.length,
              itemBuilder: (context, i) {
                final c = cards[i];
                final map = c is Map ? c : const {};
                return _Card(
                  face: map['face'] as String?,
                  matchedBy: map['matched'] as String?,
                  isUp: map['up'] == true,
                  mySymbol: session.mySymbol,
                  enabled: session.myTurn && playable.contains(i),
                  onTap: () {
                    HapticFeedback.selectionClick();
                    session.move(i);
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// A single card with a real 3D Y-axis flip.
class _Card extends StatelessWidget {
  const _Card({
    required this.face,
    required this.matchedBy,
    required this.isUp,
    required this.mySymbol,
    required this.enabled,
    required this.onTap,
  });

  final String? face;
  final String? matchedBy;
  final bool isUp;
  final String? mySymbol;
  final bool enabled;
  final VoidCallback onTap;

  bool get _revealed => isUp || matchedBy != null;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: _revealed ? 1.0 : 0.0),
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeInOutCubic,
        builder: (context, t, _) {
          // Past the halfway point we show the front, counter-rotated so the
          // emoji isn't mirrored.
          final angle = t * math.pi;
          final showFront = t >= 0.5;
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0016) // perspective
              ..rotateY(angle),
            child: showFront
                ? Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()..rotateY(math.pi),
                    child: _front(context),
                  )
                : _back(context),
          );
        },
      ),
    );
  }

  Widget _back(BuildContext context) {
    return AnimatedContainer(
      duration: Motion.fast,
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        gradient: const LinearGradient(
          colors: [Color(0xFF6D28D9), Color(0xFF3B0764)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: enabled ? _accent : Colors.white12,
          width: enabled ? 2 : 1,
        ),
        boxShadow: enabled
            ? [BoxShadow(color: _accent.withValues(alpha: 0.45), blurRadius: 10)]
            : null,
      ),
      child: const Center(
        child: Text('⚽', style: TextStyle(fontSize: 20, color: Colors.white24)),
      ),
    );
  }

  Widget _front(BuildContext context) {
    final claimed = matchedBy != null;
    final mine = claimed && matchedBy == mySymbol;
    final tint = !claimed
        ? Colors.white
        : (mine ? const Color(0xFFC084FC) : const Color(0xFF38BDF8));

    return Container(
      decoration: BoxDecoration(
        borderRadius: Corners.rMd,
        color: claimed ? tint.withValues(alpha: 0.22) : Colors.white,
        border: Border.all(color: tint, width: claimed ? 2 : 1.2),
        boxShadow: [
          BoxShadow(
            color: tint.withValues(alpha: claimed ? 0.5 : 0.25),
            blurRadius: 9,
          ),
        ],
      ),
      child: Stack(
        children: [
          Center(
            child: Text(face ?? '', style: const TextStyle(fontSize: 30)),
          ),
          if (claimed)
            Positioned(
              top: 2,
              right: 3,
              child: Text(
                mine ? '🟣' : '🔵',
                style: const TextStyle(fontSize: 10),
              ),
            ),
        ],
      ),
    );
  }
}
