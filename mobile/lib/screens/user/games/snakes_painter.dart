// Draws the snakes and ladders on top of the board grid.
//
// Kept in its own file (and as a CustomPainter rather than widgets) so the
// board file stays readable and the overlay costs one paint pass instead of
// dozens of positioned widgets.
import 'dart:math' as math;

import 'package:flutter/material.dart';

class SnakesLaddersPainter extends CustomPainter {
  SnakesLaddersPainter({
    required this.cell,
    required this.ladders,
    required this.snakes,
  });

  final double cell;
  final Map<int, int> ladders;
  final Map<int, int> snakes;

  /// Centre point of a board square, using boustrophedon numbering
  /// (1 at bottom-left, alternating direction each row).
  static Offset centerOf(int square, double cell) {
    if (square < 1) {
      // Off-board: park just below the first square.
      return Offset(cell * 0.5, cell * 10 - cell * 0.5 + cell * 0.62);
    }
    final s = square.clamp(1, 100);
    final idx = s - 1;
    final rowFromBottom = idx ~/ 10;
    final within = idx % 10;
    final col = rowFromBottom.isEven ? within : 9 - within;
    final row = 9 - rowFromBottom;
    return Offset(col * cell + cell / 2, row * cell + cell / 2);
  }

  @override
  void paint(Canvas canvas, Size size) {
    _drawLadders(canvas);
    _drawSnakes(canvas);
  }

  void _drawLadders(Canvas canvas) {
    final rail = Paint()
      ..color = const Color(0xFFFBBF24)
      ..strokeWidth = math.max(2.0, cell * 0.07)
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final rung = Paint()
      ..color = const Color(0xFFFDE68A)
      ..strokeWidth = math.max(1.4, cell * 0.05)
      ..strokeCap = StrokeCap.round;

    ladders.forEach((from, to) {
      final a = centerOf(from, cell);
      final b = centerOf(to, cell);
      final dir = (b - a);
      final len = dir.distance;
      if (len == 0) return;
      // Perpendicular offset gives the ladder its two rails.
      final perp = Offset(-dir.dy, dir.dx) / len * (cell * 0.16);

      canvas.drawLine(a + perp, b + perp, rail);
      canvas.drawLine(a - perp, b - perp, rail);

      final steps = math.max(2, (len / (cell * 0.42)).floor());
      for (var i = 1; i < steps; i++) {
        final t = i / steps;
        final p = Offset.lerp(a, b, t)!;
        canvas.drawLine(p + perp, p - perp, rung);
      }
    });
  }

  void _drawSnakes(Canvas canvas) {
    snakes.forEach((from, to) {
      final a = centerOf(from, cell);
      final b = centerOf(to, cell);
      final dir = b - a;
      final len = dir.distance;
      if (len == 0) return;
      final perp = Offset(-dir.dy, dir.dx) / len;

      // A gentle S-curve reads as a snake without expensive path maths.
      final wobble = cell * 0.85;
      final c1 = Offset.lerp(a, b, 0.28)! + perp * wobble;
      final c2 = Offset.lerp(a, b, 0.68)! - perp * wobble;

      final path = Path()
        ..moveTo(a.dx, a.dy)
        ..cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, b.dx, b.dy);

      // Body: dark outline then a brighter core for a rounded look.
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xFF065F46)
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(3.5, cell * 0.20)
          ..strokeCap = StrokeCap.round,
      );
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xFF34D399)
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(2.0, cell * 0.12)
          ..strokeCap = StrokeCap.round,
      );

      // Head at the top (the square you land on) and a tapered tail.
      canvas.drawCircle(a, cell * 0.16, Paint()..color = const Color(0xFF10B981));
      final eye = Paint()..color = Colors.white;
      canvas.drawCircle(a + perp * (cell * 0.06), cell * 0.045, eye);
      canvas.drawCircle(a - perp * (cell * 0.06), cell * 0.045, eye);
      final pupil = Paint()..color = const Color(0xFF064E3B);
      canvas.drawCircle(a + perp * (cell * 0.06), cell * 0.02, pupil);
      canvas.drawCircle(a - perp * (cell * 0.06), cell * 0.02, pupil);
      canvas.drawCircle(b, cell * 0.07, Paint()..color = const Color(0xFF065F46));
    });
  }

  @override
  bool shouldRepaint(covariant SnakesLaddersPainter old) =>
      old.cell != cell || old.ladders != ladders || old.snakes != snakes;
}
