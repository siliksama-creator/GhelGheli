// Board artwork for مار و پله.
//
// Rewritten because the first version drew snakes as a thin S-curve and
// ladders as two hairlines, which read as random scribbles on a phone
// screen. Snakes now have a tapered body with scale banding, a proper head
// with eyes and tongue, and a rattle tail; ladders have shaded side rails
// with 3D rungs. Everything scales from `cell` so it stays crisp at any
// board size.
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

  /// Centre of a board square (boustrophedon: 1 bottom-left, rows alternate).
  static Offset centerOf(int square, double cell) {
    if (square < 1) {
      // Off-board tokens sit just under the first square.
      return Offset(cell * 0.5, cell * 9.5 + cell * 0.62);
    }
    final idx = square.clamp(1, 100) - 1;
    final rowFromBottom = idx ~/ 10;
    final within = idx % 10;
    final col = rowFromBottom.isEven ? within : 9 - within;
    final row = 9 - rowFromBottom;
    return Offset(col * cell + cell / 2, row * cell + cell / 2);
  }

  @override
  void paint(Canvas canvas, Size size) {
    for (final e in ladders.entries) {
      _ladder(canvas, centerOf(e.key, cell), centerOf(e.value, cell));
    }
    for (final e in snakes.entries) {
      _snake(canvas, centerOf(e.key, cell), centerOf(e.value, cell));
    }
  }

  // ── Ladder ────────────────────────────────────────────────────────────
  void _ladder(Canvas canvas, Offset bottom, Offset top) {
    final dir = top - bottom;
    final len = dir.distance;
    if (len < 1) return;
    final unit = dir / len;
    final perp = Offset(-unit.dy, unit.dx);
    final halfW = cell * 0.19;

    final railW = math.max(2.4, cell * 0.085);
    final rungW = math.max(1.8, cell * 0.062);

    // Drop shadow lifts the ladder off the board.
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.45)
      ..strokeWidth = railW + 1.5
      ..strokeCap = StrokeCap.round;
    const off = Offset(1.2, 1.6);
    canvas.drawLine(bottom + perp * halfW + off, top + perp * halfW + off, shadow);
    canvas.drawLine(bottom - perp * halfW + off, top - perp * halfW + off, shadow);

    // Rails: darker base then a bright highlight for a rounded wooden look.
    final railDark = Paint()
      ..color = const Color(0xFFB45309)
      ..strokeWidth = railW
      ..strokeCap = StrokeCap.round;
    final railLite = Paint()
      ..color = const Color(0xFFFCD34D)
      ..strokeWidth = railW * 0.45
      ..strokeCap = StrokeCap.round;

    for (final side in [halfW, -halfW]) {
      canvas.drawLine(bottom + perp * side, top + perp * side, railDark);
      canvas.drawLine(
        bottom + perp * side - perp * (railW * 0.16),
        top + perp * side - perp * (railW * 0.16),
        railLite,
      );
    }

    // Rungs, evenly spaced, with a highlight edge.
    final steps = math.max(3, (len / (cell * 0.46)).round());
    final rungDark = Paint()
      ..color = const Color(0xFF92400E)
      ..strokeWidth = rungW
      ..strokeCap = StrokeCap.round;
    final rungLite = Paint()
      ..color = const Color(0xFFFDE68A)
      ..strokeWidth = rungW * 0.5
      ..strokeCap = StrokeCap.round;

    for (var i = 1; i < steps; i++) {
      final p = Offset.lerp(bottom, top, i / steps)!;
      canvas.drawLine(p + perp * halfW, p - perp * halfW, rungDark);
      canvas.drawLine(
        p + perp * halfW - unit * (rungW * 0.22),
        p - perp * halfW - unit * (rungW * 0.22),
        rungLite,
      );
    }
  }

  // ── Snake ─────────────────────────────────────────────────────────────
  void _snake(Canvas canvas, Offset head, Offset tail) {
    final dir = tail - head;
    final len = dir.distance;
    if (len < 1) return;
    final unit = dir / len;
    final perp = Offset(-unit.dy, unit.dx);

    // Serpentine spine: three control lobes so it reads as a snake, not an S.
    final amp = math.min(cell * 1.05, len * 0.26);
    final path = Path()..moveTo(head.dx, head.dy);
    const seg = 3;
    for (var i = 0; i < seg; i++) {
      final t0 = i / seg, t1 = (i + 1) / seg;
      final p0 = Offset.lerp(head, tail, t0)!;
      final p1 = Offset.lerp(head, tail, t1)!;
      final sign = i.isEven ? 1.0 : -1.0;
      final c1 = Offset.lerp(p0, p1, 0.32)! + perp * amp * sign;
      final c2 = Offset.lerp(p0, p1, 0.68)! + perp * amp * sign;
      path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p1.dx, p1.dy);
    }

    final bodyW = math.max(4.5, cell * 0.26);

    // Shadow, dark outline, body, then a glossy top highlight.
    canvas.drawPath(
      path.shift(const Offset(1.5, 2)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = bodyW
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFF064E3B)
        ..style = PaintingStyle.stroke
        ..strokeWidth = bodyW
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFF10B981)
        ..style = PaintingStyle.stroke
        ..strokeWidth = bodyW * 0.72
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFF6EE7B7).withValues(alpha: 0.75)
        ..style = PaintingStyle.stroke
        ..strokeWidth = bodyW * 0.26
        ..strokeCap = StrokeCap.round,
    );

    // Scale banding along the body.
    final metrics = path.computeMetrics().toList();
    if (metrics.isNotEmpty) {
      final m = metrics.first;
      final bands = math.max(5, (m.length / (cell * 0.32)).round());
      final band = Paint()
        ..color = const Color(0xFF047857).withValues(alpha: 0.75)
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(1.0, cell * 0.035)
        ..strokeCap = StrokeCap.round;
      for (var i = 1; i < bands; i++) {
        final d = m.length * i / bands;
        final tan = m.getTangentForOffset(d);
        if (tan == null) continue;
        final n = Offset(-tan.vector.dy, tan.vector.dx);
        final w = bodyW * 0.3 * (1 - i / bands * 0.45);
        canvas.drawLine(tan.position + n * w, tan.position - n * w, band);
      }
    }

    // Tail taper.
    canvas.drawCircle(
        tail, bodyW * 0.22, Paint()..color = const Color(0xFF065F46));

    // Head: rounded, slightly larger than the body, facing along the spine.
    final headR = bodyW * 0.78;
    canvas.drawCircle(
        head + const Offset(1, 1.5),
        headR,
        Paint()..color = Colors.black.withValues(alpha: 0.35));
    canvas.drawCircle(head, headR, Paint()..color = const Color(0xFF059669));
    canvas.drawCircle(
      head - unit * (headR * 0.2),
      headR * 0.72,
      Paint()..color = const Color(0xFF34D399),
    );

    // Eyes with pupils.
    final eyeOff = perp * (headR * 0.42);
    final eyeFwd = -unit * (headR * 0.28);
    for (final e in [eyeOff, -eyeOff]) {
      canvas.drawCircle(head + e + eyeFwd, headR * 0.3, Paint()..color = Colors.white);
      canvas.drawCircle(head + e + eyeFwd, headR * 0.15,
          Paint()..color = const Color(0xFF0F172A));
    }

    // Forked tongue flicking away from the body.
    final tongueBase = head - unit * (headR * 0.9);
    final tongueTip = head - unit * (headR * 1.9);
    final tonguePaint = Paint()
      ..color = const Color(0xFFEF4444)
      ..strokeWidth = math.max(1.0, cell * 0.03)
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(tongueBase, tongueTip, tonguePaint);
    canvas.drawLine(tongueTip, tongueTip + perp * (headR * 0.32) - unit * (headR * 0.3),
        tonguePaint);
    canvas.drawLine(tongueTip, tongueTip - perp * (headR * 0.32) - unit * (headR * 0.3),
        tonguePaint);
  }

  @override
  bool shouldRepaint(covariant SnakesLaddersPainter old) =>
      old.cell != cell || old.ladders != ladders || old.snakes != snakes;
}
