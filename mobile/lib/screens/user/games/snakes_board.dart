// مار و پله — 10x10 boustrophedon board with animated token movement,
// snake/ladder overlays and a two-dice chooser.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import 'game_scaffold.dart';
import 'game_session.dart';
import 'snakes_art.dart';

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
  SnakeSprites? _sprites;

  @override
  void initState() {
    super.initState();
    // Decode the board artwork once; the painter falls back to plain shapes
    // for the frame or two before it is ready.
    SnakeSprites.load().then((v) {
      if (mounted) setState(() => _sprites = v);
    });
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
      title: 'مار و پله',
      accent: _accent,
      symbols: const {'X': '🟣', 'O': '🔵'},
      onBack: widget.onBack,
      scoreboard: _Progress(session: _s),
      boardBuilder: (_) => Column(
        children: [
          _Board(session: _s, sprites: _sprites),
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
  const _Board({required this.session, this.sprites});
  final GameSession session;
  final SnakeSprites? sprites;

  @override
  Widget build(BuildContext context) {
    final st = session.state;
    final pos = (st['pos'] as Map?) ?? const {'X': 0, 'O': 0};
    final ladders = _intMap(st['ladders']);
    final snakes = _intMap(st['snakes']);

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
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
                    // snakes + ladders overlay (real sprites)
                    Positioned.fill(
                      child: CustomPaint(
                        painter: SnakesBoardPainter(
                          cell: cell,
                          ladders: ladders,
                          snakes: snakes,
                          sprites: sprites,
                        ),
                      ),
                    ),
                    // Tokens. The player's own piece is bigger, ringed in
                    // white and marked "شما" — users could not tell which
                    // token was theirs before.
                    _Token(
                      square: _asInt(pos['X']),
                      cell: cell,
                      color: const Color(0xFFC084FC),
                      offset: -0.18,
                      isMine: session.mySymbol == 'X',
                    ),
                    _Token(
                      square: _asInt(pos['O']),
                      cell: cell,
                      color: const Color(0xFF38BDF8),
                      offset: 0.18,
                      isMine: session.mySymbol == 'O',
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

    // Chute endpoints get a tinted square so the player can see WHERE a
    // snake/ladder starts even where the artwork overlaps a neighbour.
    Color bg;
    if (number == 100) {
      bg = const Color(0xFFFBBF24).withValues(alpha: 0.42);
    } else if (isLadder) {
      bg = const Color(0xFFFBBF24).withValues(alpha: 0.20);
    } else if (isSnake) {
      bg = const Color(0xFF34D399).withValues(alpha: 0.20);
    } else {
      bg = dark
          ? Colors.white.withValues(alpha: 0.05)
          : Colors.white.withValues(alpha: 0.11);
    }

    return Container(
      margin: const EdgeInsets.all(0.6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(3),
        border: isLadder
            ? Border.all(color: const Color(0xFFFBBF24), width: 1)
            : (isSnake
                ? Border.all(color: const Color(0xFF34D399), width: 1)
                : null),
      ),
      child: Stack(
        children: [
          Positioned(
            top: 1,
            right: 2,
            child: Text(
              '$number',
              style: TextStyle(
                fontSize: 7.5,
                height: 1,
                color: Colors.white.withValues(alpha: 0.5),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (number == 100)
            const Center(child: Text('🏁', style: TextStyle(fontSize: 13)))
          else if (isLadder)
            Align(
              alignment: Alignment.bottomLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 1, bottom: 1),
                child: Text('🪜',
                    style: TextStyle(
                        fontSize: 7,
                        color: Colors.white.withValues(alpha: 0.9))),
              ),
            )
          else if (isSnake)
            Align(
              alignment: Alignment.bottomLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 1, bottom: 1),
                child: Text('🐍',
                    style: TextStyle(
                        fontSize: 7,
                        color: Colors.white.withValues(alpha: 0.9))),
              ),
            ),
        ],
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
    required this.isMine,
  });

  final int square;
  final double cell;
  final Color color;
  final double offset;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final p = SnakesBoardPainter.centerOf(square, cell);
    final size = cell * (isMine ? 0.68 : 0.54);
    return AnimatedPositioned(
      duration: Motion.slow,
      curve: Curves.easeInOutCubic,
      left: p.dx - size / 2 + cell * offset,
      top: p.dy - size / 2,
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [Colors.white.withValues(alpha: 0.95), color],
                stops: const [0.0, 0.78],
              ),
              border: Border.all(
                color: isMine ? Colors.white : Colors.white38,
                width: isMine ? 2.6 : 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: isMine ? 0.95 : 0.5),
                  blurRadius: isMine ? 14 : 6,
                ),
              ],
            ),
          ),
          if (isMine)
            Positioned(
              bottom: -cell * 0.20,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'شما',
                  style: TextStyle(
                    fontSize: cell * 0.17,
                    height: 1.1,
                    fontWeight: FontWeight.w900,
                    color: const Color(0xFF1E1B4B),
                  ),
                ),
              ),
            ),
        ],
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
        onTap: enabled
            ? () {
                // Tactile feedback makes the dice feel physical — a small
                // 2026 polish detail that costs nothing.
                HapticFeedback.selectionClick();
                onTap();
              }
            : null,
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
            // Cross-fade + slight scale when the value changes, so a new
            // roll reads as a roll rather than a silent swap.
            child: AnimatedSwitcher(
              duration: Motion.normal,
              transitionBuilder: (child, anim) => ScaleTransition(
                scale: Tween(begin: 0.72, end: 1.0).animate(
                    CurvedAnimation(parent: anim, curve: Curves.easeOutBack)),
                child: FadeTransition(opacity: anim, child: child),
              ),
              child: Text(
                face,
                key: ValueKey(value),
                style: const TextStyle(
                    fontSize: 40, color: Color(0xFF1E1B4B), height: 1),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
