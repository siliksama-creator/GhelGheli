// The card face itself: art, palette and the 3D flip.
//
// Split out of memory_board.dart so neither file grows unwieldy — the board
// owns layout and the session, this file owns one card's look and motion.
import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Server sends an ASSET KEY (`ball`, `trophy`, …) rather than an emoji.
/// Emoji were a real bug source: every Android/browser renders them from a
/// different font, so on some devices two different cards drew the *same*
/// flat glyph and the game became unplayable. These are purpose-made 3D
/// football icons that look identical everywhere.
const memoryFaceArt = <String, String>{
  'ball': 'assets/games/memory/ball.webp',
  'trophy': 'assets/games/memory/trophy.webp',
  'medal': 'assets/games/memory/medal.webp',
  'jersey': 'assets/games/memory/jersey.webp',
  'glove': 'assets/games/memory/glove.webp',
  'boot': 'assets/games/memory/boot.webp',
  'whistle': 'assets/games/memory/whistle.webp',
  'stopwatch': 'assets/games/memory/stopwatch.webp',
};

/// A soft per-face tint so a revealed card reads instantly even before the
/// eye resolves the artwork — a real help in a memory game.
const memoryFaceTint = <String, Color>{
  'ball': Color(0xFF38BDF8),
  'trophy': Color(0xFFFBBF24),
  'medal': Color(0xFF60A5FA),
  'jersey': Color(0xFFF87171),
  'glove': Color(0xFFFB923C),
  'boot': Color(0xFF818CF8),
  'whistle': Color(0xFFF472B6),
  'stopwatch': Color(0xFF2DD4BF),
};

const memoryAccent = Color(0xFFA855F7);

/// Fallback glyph if an asset ever fails to decode, so a broken file can
/// never blank the whole board.
const _fallback = '🎴';

/// One card: face-down crest, face-up illustration, real Y-axis flip.
class MemoryCard extends StatelessWidget {
  const MemoryCard({
    super.key,
    required this.face,
    required this.matchedBy,
    required this.isUp,
    required this.mySymbol,
    required this.enabled,
    required this.onTap,
    this.soloMode = false,
  });

  final String? face;
  final String? matchedBy;
  final bool isUp;
  final String? mySymbol;
  final bool enabled;
  final VoidCallback onTap;

  /// Solo has no opponent, so "who claimed it" colouring is meaningless —
  /// a matched card just settles into a calm won state.
  final bool soloMode;

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
          final angle = t * math.pi;
          final showFront = t >= 0.5;
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0016) // perspective
              ..rotateY(angle),
            child: showFront
                // Counter-rotated so the artwork isn't mirrored.
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
      duration: const Duration(milliseconds: 180),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          colors: [Color(0xFF7C3AED), Color(0xFF4C1D95), Color(0xFF2E1065)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: enabled ? memoryAccent : Colors.white12,
          width: enabled ? 1.8 : 1,
        ),
        boxShadow: enabled
            ? [
                BoxShadow(
                  color: memoryAccent.withValues(alpha: 0.42),
                  blurRadius: 12,
                  spreadRadius: -2,
                ),
              ]
            : const [BoxShadow(color: Colors.black26, blurRadius: 5)],
      ),
      child: const _CardCrest(),
    );
  }

  Widget _front(BuildContext context) {
    final claimed = matchedBy != null;
    final mine = claimed && (soloMode || matchedBy == mySymbol);
    final tint = memoryFaceTint[face] ?? Colors.white;
    final ring = !claimed
        ? tint
        : (soloMode
            ? const Color(0xFF34D399)
            : (mine ? const Color(0xFFC084FC) : const Color(0xFF38BDF8)));
    final art = memoryFaceArt[face];

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withValues(alpha: claimed ? 0.94 : 1),
            tint.withValues(alpha: claimed ? 0.26 : 0.16),
          ],
        ),
        border: Border.all(color: ring, width: claimed ? 2.2 : 1.4),
        boxShadow: [
          BoxShadow(
            color: ring.withValues(alpha: claimed ? 0.5 : 0.28),
            blurRadius: claimed ? 14 : 9,
            spreadRadius: -2,
          ),
        ],
      ),
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.all(6),
            child: art == null
                ? const Center(
                    child: Text(_fallback, style: TextStyle(fontSize: 26)))
                : Image.asset(
                    art,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.medium,
                    // PERF: هر کارتِ جفت‌یاب هرگز بزرگ‌تر از ~۱/۴ صفحه رسم
                    // نمی‌شود (~۱۲۰ پیکسل منطقی). بدون cacheWidth هر آیکنِ
                    // ۵۱۲×۵۱۲ کارت ~۱MB رم می‌گرفت؛ با سقف ۲۵۶، ~۲۶۰KB —
                    // و در یک تختهٔ ۱۶ کارتی یعنی چند مگابایت کمتر در حافظه.
                    cacheWidth: 256,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Text(_fallback, style: TextStyle(fontSize: 26)),
                    ),
                  ),
          ),
          // Claimed badge: whose pair it is (multiplayer) or a simple tick.
          if (claimed)
            Positioned(
              top: 3,
              right: 4,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: ring,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: ring.withValues(alpha: 0.55), blurRadius: 6),
                  ],
                ),
                child: Icon(
                  soloMode
                      ? Icons.check_rounded
                      : (mine ? Icons.person_rounded : Icons.people_alt_rounded),
                  size: 10,
                  color: Colors.white,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Back-of-card crest, drawn in code so it costs nothing to ship.
class _CardCrest extends StatelessWidget {
  const _CardCrest();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24, width: 1.4),
          gradient: LinearGradient(
            colors: [
              Colors.white.withValues(alpha: 0.16),
              Colors.white.withValues(alpha: 0.02),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: const Icon(Icons.sports_soccer_rounded,
            size: 16, color: Colors.white38),
      ),
    );
  }
}
