import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// The GhelGheli brand mark, animated.
///
/// WHY IT IS BUILT THIS WAY
///
/// The obvious approach — animate the logo PNG as one flat image — can only
/// scale, rotate or fade the whole thing, which reads as a wobbling sticker
/// rather than a designed intro. Splitting the artwork into mascot and
/// wordmark layers was tried and rejected: in this logo the character's arm
/// and foot physically overlap the Persian letters, so any cut leaves torn
/// edges (verified by running a connected-component split — the whole lockup
/// is a single blob).
///
/// So the motion is built as SEPARATE PASSES OVER THE SAME ARTWORK, each with
/// its own timing, composited in one paint:
///
///   1. an aurora glow behind the logo, breathing slowly;
///   2. the logo itself, entering with a settle (overshoot then relax) and
///      then floating on a long sine;
///   3. a specular sweep — a diagonal band of light travelling across the
///      logo, masked to the logo's own alpha so it lights the letters rather
///      than passing over a rectangle;
///   4. sparkles that pop along the top edge, seeded deterministically so
///      they never bunch up.
///
/// Everything is driven by two controllers, not one per effect: an intro that
/// runs once and an ambient loop that runs forever. A widget that keeps
/// several controllers alive on a login screen is a battery cost for no
/// visual gain.
///
/// PERFORMANCE. The image is decoded once and reused by all passes. The sweep
/// and the sparkles are painted with a shader and a handful of circles, not
/// with extra Image widgets, so the whole thing is one texture upload.
class AnimatedLogo extends StatefulWidget {
  const AnimatedLogo({
    super.key,
    this.width = 240,
    this.asset = 'assets/brand/logo.webp',
    this.intro = true,
  });

  final double width;
  final String asset;

  /// Play the entrance. Off for places where the logo is already on screen
  /// (the drawer header), so it does not re-animate on every rebuild.
  final bool intro;

  @override
  State<AnimatedLogo> createState() => _AnimatedLogoState();
}

class _AnimatedLogoState extends State<AnimatedLogo>
    with TickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
  );

  /// One long loop drives every ambient effect. Each reads it at a different
  /// rate, so the float, the glow and the sweep never line up into an
  /// obvious repeating beat.
  late final AnimationController _ambient = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 6000),
  )..repeat();

  // Overshoot then settle: the mark arrives with weight instead of just
  // fading in.
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween(begin: 0.72, end: 1.06)
          .chain(CurveTween(curve: Curves.easeOutCubic)),
      weight: 62,
    ),
    TweenSequenceItem(
      tween: Tween(begin: 1.06, end: 1.0)
          .chain(CurveTween(curve: Curves.easeOutBack)),
      weight: 38,
    ),
  ]).animate(_intro);

  late final Animation<double> _fade = CurvedAnimation(
    parent: _intro,
    curve: const Interval(0, 0.45, curve: Curves.easeOut),
  );

  @override
  void initState() {
    super.initState();
    if (widget.intro) {
      _intro.forward();
    } else {
      _intro.value = 1;
    }
  }

  @override
  void dispose() {
    _intro.dispose();
    _ambient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // RESPECT THE USER'S SETTING. Someone who has asked the OS to reduce
    // motion gets the finished frame and nothing moving — required by
    // WCAG 2.3.3, and for people with vestibular disorders the difference
    // between a usable screen and a nauseating one. The web build does the
    // same via `prefers-reduced-motion`.
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

    final image = Image.asset(
      widget.asset,
      width: widget.width,
      fit: BoxFit.contain,
      // The logo is decorative; the app name is announced by the text under
      // it, so a screen reader should skip this rather than read "image".
      excludeFromSemantics: true,
    );

    if (reduceMotion) {
      if (_ambient.isAnimating) _ambient.stop();
      return image;
    }

    return AnimatedBuilder(
      animation: Listenable.merge([_intro, _ambient]),
      builder: (context, _) {
        final t = _ambient.value;

        // Slow vertical float. 2π so it is continuous across the loop seam.
        final float = math.sin(t * 2 * math.pi) * 4.0;

        // Glow breathes at half the float's rate, so the two drift apart.
        final glow = 0.5 + 0.5 * math.sin(t * math.pi);

        return Opacity(
          opacity: _fade.value,
          child: Transform.translate(
            offset: Offset(0, float),
            child: Transform.scale(
              scale: _scale.value,
              child: Stack(
                alignment: Alignment.center,
                clipBehavior: Clip.none,
                children: [
                  // 1 ── aurora behind the mark
                  IgnorePointer(
                    child: Container(
                      width: widget.width * 1.15,
                      height: widget.width * 0.85,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(colors: [
                          const Color(0xFFB5EF58)
                              .withValues(alpha: 0.13 + 0.10 * glow),
                          const Color(0xFF00D49A)
                              .withValues(alpha: 0.06 + 0.05 * glow),
                          Colors.transparent,
                        ], stops: const [0.0, 0.45, 1.0]),
                      ),
                    ),
                  ),

                  // 2 ── the logo
                  image,

                  // 3 ── specular sweep, clipped to the logo's own shape
                  //
                  // ShaderMask with dstIn on a copy of the artwork means the
                  // band only lights actual pixels of the mark. Without that
                  // the highlight crosses the empty corners too and looks
                  // like a scanline over a rectangle.
                  //
                  // The band is deliberately NARROW and ADDITIVE. A first
                  // version used a wide band composited normally and it
                  // washed the whole mark pale — the brand green vanished
                  // for a third of a second on each pass, which read as a
                  // rendering fault rather than a highlight. `plus` adds
                  // light instead of painting over, so the green underneath
                  // stays green and simply brightens.
                  Positioned.fill(
                    child: IgnorePointer(
                      child: ClipRect(
                        child: BlendMask(
                          blendMode: BlendMode.plus,
                          child: ShaderMask(
                            blendMode: BlendMode.dstIn,
                            shaderCallback: (rect) => LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: const [
                                Colors.transparent,
                                Colors.white,
                                Colors.transparent,
                              ],
                              stops: _sweepStops(t),
                            ).createShader(rect),
                            child: ColorFiltered(
                              colorFilter: ColorFilter.mode(
                                Colors.white.withValues(alpha: 0.30),
                                BlendMode.srcATop,
                              ),
                              child: image,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),

                  // 4 ── sparkles
                  Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(
                        painter: _SparklePainter(progress: t),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  /// Moves a narrow bright band across the gradient.
  ///
  /// The band only travels during the first third of the loop; the rest of
  /// the cycle it is parked off-screen. A sweep that runs constantly draws
  /// the eye away from the form the user is trying to fill in.
  List<double> _sweepStops(double t) {
    const travel = 0.30;
    final p = t < travel ? t / travel : 1.0;
    // -0.3 → 1.3 so the band fully enters and fully leaves.
    final centre = -0.3 + p * 1.6;
    // Narrow: a wide band covers the whole mark at once, which is what made
    // the earlier version look washed out rather than lit.
    const half = 0.07;
    return [
      (centre - half).clamp(0.0, 1.0),
      centre.clamp(0.0, 1.0),
      (centre + half).clamp(0.0, 1.0),
    ];
  }
}

/// Small points of light that pop around the top of the mark.
///
/// Positions and phases come from a fixed seed rather than `Random()`, so
/// the pattern is identical every launch — a login screen that sparkles
/// differently each time looks unstable, not lively.
class _SparklePainter extends CustomPainter {
  _SparklePainter({required this.progress});

  final double progress;

  // x, y as fractions of the box; phase offset within the loop.
  static const _points = <List<double>>[
    [0.16, 0.22, 0.00],
    [0.38, 0.10, 0.28],
    [0.62, 0.16, 0.55],
    [0.84, 0.30, 0.13],
    [0.28, 0.72, 0.41],
    [0.72, 0.80, 0.68],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;

    for (final p in _points) {
      // Each sparkle has its own phase, so they twinkle in sequence rather
      // than blinking in unison.
      final local = (progress + p[2]) % 1.0;
      // Visible for a short window, invisible the rest of the time.
      if (local > 0.22) continue;
      final k = local / 0.22;
      // Rise and fall within that window.
      final a = math.sin(k * math.pi);

      final centre = Offset(p[0] * size.width, p[1] * size.height);
      final r = 1.6 + 2.4 * a;

      paint.color = const Color(0xFFEFFFC9).withValues(alpha: 0.85 * a);
      canvas.drawCircle(centre, r, paint);

      // A soft four-point flare, which reads as "sparkle" where a plain dot
      // reads as "dust".
      paint.color = const Color(0xFFB5EF58).withValues(alpha: 0.45 * a);
      final len = r * 3.2;
      canvas.drawOval(
        Rect.fromCenter(center: centre, width: len, height: r * 0.7),
        paint,
      );
      canvas.drawOval(
        Rect.fromCenter(center: centre, width: r * 0.7, height: len),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_SparklePainter old) => old.progress != progress;
}


/// Applies a blend mode to a subtree.
///
/// Flutter has no `mix-blend-mode`, and `BackdropFilter` blends against what
/// is BEHIND the widget rather than compositing the child additively. Pushing
/// a layer with the mode set is the supported way to get an additive
/// highlight that brightens the artwork instead of covering it.
class BlendMask extends SingleChildRenderObjectWidget {
  const BlendMask({super.key, required this.blendMode, super.child});

  final BlendMode blendMode;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderBlendMask(blendMode);

  @override
  void updateRenderObject(BuildContext context, _RenderBlendMask renderObject) {
    renderObject.blendMode = blendMode;
  }
}

class _RenderBlendMask extends RenderProxyBox {
  _RenderBlendMask(this._blendMode);

  BlendMode _blendMode;
  set blendMode(BlendMode v) {
    if (v == _blendMode) return;
    _blendMode = v;
    markNeedsPaint();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    if (child == null) return;
    context.canvas.saveLayer(offset & size, Paint()..blendMode = _blendMode);
    super.paint(context, offset);
    context.canvas.restore();
  }
}
