// مار و پله — 10x10 boustrophedon board with animated token movement,
// snake/ladder overlays and a two-dice chooser.
import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import 'game_scaffold.dart';
import 'game_session.dart';
import 'snakes_painter.dart';

const _accent = Color(0xFFA855F7);

class SnakesScreen extends StatefulWidget {
  const SnakesScreen({super.key, required this.api, required this.onBack});
  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<SnakesScreen> createState() => _SnakesScreenState();
}

class _SnakesScreenState extends State<SnakesScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'snakes')..connect();

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
      title: 'مار و پله',
      accent: _accent,
      symbols: const {'X': '🟣', 'O': '🔵'},
      onBack: widget.onBack,
      scoreboard: _Progress(session: _s),
      boardBuilder: (_) => Column(
        children: [
          _Board(session: _s),
          Gaps.vSm,
          _DiceRow(session: _s),
        ],
      ),
    );
  }
}

/// Square-number progress for both players.
class _Progress extends StatelessWidget {
  const _Progress({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final pos = session.state['pos'];
    if (pos is! Map) return const SizedBox.shrink();
    final theme = Theme.of(context);
    Widget tile(String emoji, Object? v) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 17)),
            Gaps.hXxs,
            Text('${faNum(v ?? 0)} / ${faNum(100)}',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ],
        );
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: Gaps.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [tile('🟣', pos['X']), tile('🔵', pos['O'])],
      ),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final st = session.state;
    final pos = (st['pos'] as Map?) ?? const {'X': 0, 'O': 0};
    final ladders = _intMap(st['ladders']);
    final snakes = _intMap(st['snakes']);

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: AspectRatio(
          aspectRatio: 1,
          child: Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              gradient: const LinearGradient(
                colors: [Color(0xFF3B0764), Color(0xFF1E1B4B)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: const Color(0xFFFBBF24), width: 2),
              boxShadow: [
                BoxShadow(
                  color: _accent.withValues(alpha: 0.3),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: LayoutBuilder(
              builder: (context, box) {
                final cell = box.maxWidth / 10;
                return Stack(
                  children: [
                    // squares
                    Column(
                      children: [
                        for (var row = 0; row < 10; row++)
                          Expanded(
                            child: Row(
                              children: [
                                for (var col = 0; col < 10; col++)
                                  Expanded(
                                    child: _Cell(
                                      number: _numberFor(row, col),
                                      ladders: ladders,
                                      snakes: snakes,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                      ],
                    ),
                    // snakes + ladders overlay
                    Positioned.fill(
                      child: CustomPaint(
                        painter: SnakesLaddersPainter(
                          cell: cell,
                          ladders: ladders,
                          snakes: snakes,
                        ),
                      ),
                    ),
                    // tokens
                    _Token(
                      square: _asInt(pos['X']),
                      cell: cell,
                      color: const Color(0xFFC084FC),
                      offset: -0.18,
                    ),
                    _Token(
                      square: _asInt(pos['O']),
                      cell: cell,
                      color: const Color(0xFF38BDF8),
                      offset: 0.18,
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  /// Boustrophedon numbering: 1 starts bottom-left, rows alternate direction.
  static int _numberFor(int row, int col) {
    final fromBottom = 9 - row;
    final leftToRight = fromBottom.isEven;
    return fromBottom * 10 + (leftToRight ? col + 1 : 10 - col);
  }

  static int _asInt(Object? v) => (v as num?)?.toInt() ?? 0;

  static Map<int, int> _intMap(Object? raw) {
    if (raw is! Map) return const {};
    final out = <int, int>{};
    raw.forEach((k, v) {
      final key = int.tryParse('$k');
      final val = (v as num?)?.toInt();
      if (key != null && val != null) out[key] = val;
    });
    return out;
  }
}

class _Cell extends StatelessWidget {
  const _Cell({
    required this.number,
    required this.ladders,
    required this.snakes,
  });

  final int number;
  final Map<int, int> ladders;
  final Map<int, int> snakes;

  @override
  Widget build(BuildContext context) {
    final isLadder = ladders.containsKey(number);
    final isSnake = snakes.containsKey(number);
    final dark = ((number ~/ 10) + number).isEven;

    return Container(
      margin: const EdgeInsets.all(0.5),
      decoration: BoxDecoration(
        color: number == 100
            ? const Color(0xFFFBBF24).withValues(alpha: 0.35)
            : (dark
                ? Colors.white.withValues(alpha: 0.06)
                : Colors.white.withValues(alpha: 0.12)),
        borderRadius: BorderRadius.circular(2),
        border: isLadder
            ? Border.all(color: const Color(0xFFFBBF24), width: 0.8)
            : (isSnake
                ? Border.all(color: const Color(0xFF34D399), width: 0.8)
                : null),
      ),
      child: Center(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Padding(
            padding: const EdgeInsets.all(1),
            child: Text(
              number == 100 ? '🏁' : '$number',
              style: TextStyle(
                fontSize: 8,
                height: 1,
                color: Colors.white.withValues(alpha: 0.55),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Player token that glides between squares.
class _Token extends StatelessWidget {
  const _Token({
    required this.square,
    required this.cell,
    required this.color,
    required this.offset,
  });

  final int square;
  final double cell;
  final Color color;
  final double offset;

  @override
  Widget build(BuildContext context) {
    final p = SnakesLaddersPainter.centerOf(square, cell);
    return AnimatedPositioned(
      duration: Motion.slow,
      curve: Curves.easeInOutCubic,
      left: p.dx - cell * 0.28 + cell * offset,
      top: p.dy - cell * 0.28,
      width: cell * 0.56,
      height: cell * 0.56,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [Colors.white.withValues(alpha: 0.9), color],
            stops: const [0.0, 0.75],
          ),
          border: Border.all(color: Colors.white70, width: 1),
          boxShadow: [
            BoxShadow(color: color.withValues(alpha: 0.7), blurRadius: 8),
          ],
        ),
      ),
    );
  }
}

/// The two dice — tapping one plays it.
class _DiceRow extends StatelessWidget {
  const _DiceRow({required this.session});
  final GameSession session;

  static const _faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dice = (session.state['dice'] as List?) ?? const [];
    final playable = (session.state['playable'] as List?)?.cast<int>() ?? const [];
    final mine = session.myTurn;
    final event = '${session.state['event'] ?? ''}';

    if (dice.length < 2) {
      return Text('در انتظار تاس...', style: theme.textTheme.bodySmall);
    }

    return Column(
      children: [
        if (event.isNotEmpty && event != 'null')
          Padding(
            padding: const EdgeInsets.only(bottom: Gaps.xs),
            child: Text(
              _eventText(event),
              style: theme.textTheme.labelLarge?.copyWith(
                color: _eventColor(event),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        Text(
          mine ? 'یک تاس را انتخاب کن' : 'نوبت حریف...',
          style: theme.textTheme.bodySmall,
        ),
        Gaps.vXs,
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < 2; i++) ...[
              _Die(
                value: (dice[i] as num?)?.toInt() ?? 1,
                face: _faces[((dice[i] as num?)?.toInt() ?? 1).clamp(1, 6)],
                enabled: mine && playable.contains(i),
                onTap: () => session.move(i),
              ),
              if (i == 0) Gaps.hMd,
            ],
          ],
        ),
      ],
    );
  }

  static String _eventText(String e) {
    switch (e) {
      case 'ladder':
        return '🪜 نردبان! بالا رفتی';
      case 'snake':
        return '🐍 مار! پایین افتادی';
      case 'bump':
        return '💥 حریف را به عقب زدی';
      case 'blocked':
        return '⛔ حرکت ممکن نبود، نوبت رد شد';
      case 'win':
        return '🏁 رسیدی!';
      default:
        return '';
    }
  }

  static Color _eventColor(String e) {
    switch (e) {
      case 'ladder':
        return const Color(0xFFFBBF24);
      case 'snake':
        return const Color(0xFFF87171);
      case 'bump':
        return const Color(0xFF38BDF8);
      default:
        return const Color(0xFF94A3B8);
    }
  }
}

class _Die extends StatelessWidget {
  const _Die({
    required this.value,
    required this.face,
    required this.enabled,
    required this.onTap,
  });

  final int value;
  final String face;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: Motion.fast,
      opacity: enabled ? 1 : 0.42,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: Corners.rMd,
        child: AnimatedContainer(
          duration: Motion.normal,
          width: 62,
          height: 62,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: Corners.rMd,
            border: Border.all(
              color: enabled ? _accent : Colors.transparent,
              width: 2.4,
            ),
            boxShadow: enabled
                ? [BoxShadow(color: _accent.withValues(alpha: 0.5), blurRadius: 12)]
                : null,
          ),
          child: Center(
            child: Text(
              face,
              style: const TextStyle(fontSize: 40, color: Color(0xFF1E1B4B), height: 1),
            ),
          ),
        ),
      ),
    );
  }
}
