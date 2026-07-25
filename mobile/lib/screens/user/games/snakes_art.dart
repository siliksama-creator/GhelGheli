// Sprite loading + board painting for مار و پله.
//
// The previous version drew everything with strokes, and users reported that
// the snakes and ladders were unrecognisable. Now real transparent PNG
// sprites (a cartoon snake head, a tail and a wooden ladder) are composited
// onto the board, with the snake body painted as a tapered spine between
// them. Sprites are decoded once and cached — decoding on every frame would
// stutter the animation.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Decoded board sprites, loaded once per app run.
class SnakeSprites {
  SnakeSprites._(this.head, this.tail, this.ladder);

  final ui.Image head;
  final ui.Image tail;
  final ui.Image ladder;

  static SnakeSprites? _cached;
  static Future<SnakeSprites>? _loading;

  static SnakeSprites? get cached => _cached;

  static Future<SnakeSprites> load() {
    if (_cached != null) return Future.value(_cached);
    return _loading ??= () async {
      final imgs = await Future.wait([
        _decode('assets/games/pieces/snake_head.png'),
        _decode('assets/games/pieces/snake_tail.png'),
        _decode('assets/games/pieces/ladder.png'),
      ]);
      final s = SnakeSprites._(imgs[0], imgs[1], imgs[2]);
      _cached = s;
      return s;
    }();
  }

  static Future<ui.Image> _decode(String asset) async {
    final data = await rootBundle.load(asset);
    final codec = await ui.instantiateImageCodec(data.buffer.asUint8List());
    final frame = await codec.getNextFrame();
    return frame.image;
  }
}

/// Paints ladders and snakes between board squares using the sprites.
class SnakesBoardPainter extends CustomPainter {
  SnakesBoardPainter({
    required this.cell,
    required this.ladders,
    required this.snakes,
    required this.sprites,
  });

  final double cell;
  final Map<int, int> ladders;
  final Map<int, int> snakes;
  final SnakeSprites? sprites;

  /// Centre of a square. Boustrophedon: 1 bottom-left, rows alternate.
  static Offset centerOf(int square, double cell) {
    if (square < 1) return Offset(cell * 0.5, cell * 9.5 + cell * 0.62);
    final idx = square.clamp(1, 100) - 1;
    final rowFromBottom = idx ~/ 10;
    final within = idx % 10;
    final col = rowFromBottom.isEven ? within : 9 - within;
    return Offset(col * cell + cell / 2, (9 - rowFromBottom) * cell + cell / 2);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final s = sprites;
    for (final e in ladders.entries) {
      _ladder(canvas, centerOf(e.key, cell), centerOf(e.value, cell), s);
    }
    for (final e in snakes.entries) {
      _snake(canvas, centerOf(e.key, cell), centerOf(e.value, cell), s);
    }
  }

  // ── Ladder: the sprite is stretched along the vector and rotated ──
  void _ladder(Canvas canvas, Offset from, Offset to, SnakeSprites? s) {
    final d = to - from;
    final len = d.distance;
    if (len < 1) return;
    final angle = math.atan2(d.dy, d.dx) - math.pi / 2; // sprite points up
    final width = cell * 0.62;

    canvas.save();
    canvas.translate((from.dx + to.dx) / 2, (from.dy + to.dy) / 2);
    canvas.rotate(angle);
    final rect = Rect.fromCenter(
        center: Offset.zero, width: width, height: len + cell * 0.1);
    if (s != null) {
      canvas.drawImageRect(
        s.ladder,
        Rect.fromLTWH(
            0, 0, s.ladder.width.toDouble(), s.ladder.height.toDouble()),
        rect,
        Paint()..filterQuality = FilterQuality.medium,
      );
    } else {
      // Fallback while the sprites are still decoding.
      canvas.drawRect(rect, Paint()..color = const Color(0xFFB45309));
    }
    canvas.restore();
  }

  // ── Snake: tapered body spine + head and tail sprites ──
  void _snake(Canvas canvas, Offset head, Offset tail, SnakeSprites? s) {
    final d = tail - head;
    final len = d.distance;
    if (len < 1) return;
    final unit = d / len;
    final perp = Offset(-unit.dy, unit.dx);
    final amp = math.min(cell * 0.85, len * 0.22);

    // Sample a 3-lobe serpentine curve.
    final pts = <Offset>[];
    const seg = 3;
    for (var i = 0; i < seg; i++) {
      final p0 = Offset.lerp(head, tail, i / seg)!;
      final p1 = Offset.lerp(head, tail, (i + 1) / seg)!;
      final sign = i.isEven ? 1.0 : -1.0;
      final c1 = Offset.lerp(p0, p1, 0.32)! + perp * amp * sign;
      final c2 = Offset.lerp(p0, p1, 0.68)! + perp * amp * sign;
      for (var k = 0; k <= 12; k++) {
        final t = k / 12;
        final mt = 1 - t;
        pts.add(Offset(
          mt * mt * mt * p0.dx +
              3 * mt * mt * t * c1.dx +
              3 * mt * t * t * c2.dx +
              t * t * t * p1.dx,
          mt * mt * mt * p0.dy +
              3 * mt * mt * t * c1.dy +
              3 * mt * t * t * c2.dy +
              t * t * t * p1.dy,
        ));
      }
    }

    // Tapered body drawn as overlapping discs: outline, fill, then a gloss
    // ridge. This keeps a real snake silhouette that thins toward the tail.
    final outline = Paint()..color = const Color(0xFF064E3B);
    final body = Paint()..color = const Color(0xFF10B981);
    final gloss = Paint()..color = const Color(0xFF6EE7B7).withValues(alpha: 0.8);
    final n = pts.length;
    final baseR = cell * 0.20;

    for (var i = 0; i < n; i++) {
      final r = baseR * (1 - 0.45 * i / n);
      canvas.drawCircle(pts[i], r + 1.6, outline);
    }
    for (var i = 0; i < n; i++) {
      final r = baseR * (1 - 0.45 * i / n) * 0.78;
      canvas.drawCircle(pts[i], r, body);
    }
    for (var i = 0; i < n; i += 3) {
      final r = baseR * (1 - 0.45 * i / n) * 0.30;
      canvas.drawCircle(pts[i].translate(0, -r * 0.35), r, gloss);
    }

    if (s == null) return;

    // Tail sprite.
    final tailSize = cell * 0.5;
    canvas.drawImageRect(
      s.tail,
      Rect.fromLTWH(0, 0, s.tail.width.toDouble(), s.tail.height.toDouble()),
      Rect.fromCenter(center: tail, width: tailSize, height: tailSize),
      Paint()..filterQuality = FilterQuality.medium,
    );

    // Head sprite, rotated to face down the body.
    final headSize = cell * 1.0;
    canvas.save();
    canvas.translate(head.dx, head.dy);
    canvas.rotate(math.atan2(d.dy, d.dx) - math.pi / 2);
    canvas.drawImageRect(
      s.head,
      Rect.fromLTWH(0, 0, s.head.width.toDouble(), s.head.height.toDouble()),
      Rect.fromCenter(center: Offset.zero, width: headSize, height: headSize),
      Paint()..filterQuality = FilterQuality.medium,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant SnakesBoardPainter old) =>
      old.cell != cell ||
      old.sprites != sprites ||
      old.ladders != ladders ||
      old.snakes != snakes;
}
