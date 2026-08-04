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
        //
        // 4px on a 230px mark is 1.7% — below the threshold where motion
        // reads as deliberate, so it registered only as a vague instability.
        // 9px with a matching scale breath is unmistakably intentional while
        // still calm.
        final float = math.sin(t * 2 * math.pi) * 9.0;
        final breathe = 1 + math.sin(t * 2 * math.pi) * 0.012;

        // Glow breathes at half the float's rate, so the two drift apart.
        final glow = 0.5 + 0.5 * math.sin(t * math.pi);

        return Opacity(
          opacity: _fade.value,
          child: Transform.translate(
            offset: Offset(0, float),
            child: Transform.scale(
              scale: _scale.value * breathe,
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

                  // 4 ── one glint on the mascot's eye
                  Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(
                        painter: _GlintPainter(progress: t),
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

/// A single glint on the mascot's eye.
///
/// The first version scattered six generic dots over the logo's bounding box
/// for 8% of every cycle. They were unrelated to anything in the artwork —
/// the visual language of a stock template. A crafted mark puts light on a
/// SPECIFIC feature.
///
/// The position was found by overlaying a coordinate grid on the logo and
/// reading the mascot's eye off it, not by guessing: an earlier attempt
/// derived it from "the brightest pixels in the mascot's quadrant" and
/// landed on his white vest, producing a blurry splodge on his chest.
///
/// Mirrors `.heroGlint` in userweb/src/style.css, same position and timing.
class _GlintPainter extends CustomPainter {
  _GlintPainter({required this.progress});

  final double progress;

  /// The mascot's eye, as a fraction of the lockup.
  static const _x = 0.19;
  static const _y = 0.22;

  /// Fires just after the sweep has crossed that point, so it reads as the
  /// light catching a highlight rather than a second unrelated effect.
  static const _start = 0.33;
  static const _len = 0.10;

  @override
  void paint(Canvas canvas, Size size) {
    final local = (progress - _start) / _len;
    if (local < 0 || local > 1) return;

    // Rise fast, fall slower — a spark, not a pulse.
    final a = local < 0.35
        ? local / 0.35
        : 1 - (local - 0.35) / 0.65;
    if (a <= 0) return;

    final centre = Offset(_x * size.width, _y * size.height);
    final len = 13.0 * a;
    final thick = 1.4 * a + 0.6;
    final angle = math.pi / 4 * local;

    canvas.save();
    canvas.translate(centre.dx, centre.dy);
    canvas.rotate(angle);

    final paint = Paint()
      ..color = Colors.white.withValues(alpha: a.clamp(0.0, 1.0))
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.2);

    // Two crossed tapered bars. A plain dot with a large glow reads as a
    // smudge; the cross is what makes it read as a sparkle.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: len * 2, height: thick),
        Radius.circular(thick),
      ),
      paint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: thick, height: len * 2),
        Radius.circular(thick),
      ),
      paint,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_GlintPainter old) => old.progress != progress;
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
      RenderBlendMask(blendMode);

  @override
  void updateRenderObject(
      BuildContext context, RenderBlendMask renderObject) {
    renderObject.blendMode = blendMode;
  }
}

/// عمومی است، نه خصوصی.
///
/// `updateRenderObject` یک متدِ عمومیِ override شده است و امضایش این نوع
/// را افشا می‌کند. تا وقتی کلاس خصوصی بود، تحلیلگر
/// `library_private_types_in_public_api` می‌داد — تنها هشدارِ باقی‌ماندهٔ
/// کل پروژه. عمومی کردنِ کلاس، درست‌ترین رفع است: نوع واقعاً بخشی از
/// قرارداد عمومیِ این ویجت است.
class RenderBlendMask extends RenderProxyBox {
  RenderBlendMask(this._blendMode);

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
