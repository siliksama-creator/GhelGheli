// The tappable character plus its feedback layers.
//
// Split out of the screen so the visual language (squash, glow, floating
// "+1"s) can be iterated on without touching game logic.
//
// ─────────────────────────────────────────────────────────────────────────
// MEMORY AND FRAME BUDGET — why this file looks the way it does
//
// This is the screen a player holds open for the longest, tapping several
// times a second, and it was the most expensive screen in the app. Three
// things were paying for that, all of them fixed here:
//
//  1. EVERY "+1" WAS ITS OWN StatefulWidget WITH ITS OWN AnimationController.
//     Fourteen of them can be alive at once, so the screen ran up to
//     fourteen independent Tickers, each waking the scheduler on every
//     frame, each rebuilding an AnimatedBuilder that produced a
//     Transform.translate → Opacity → Transform.scale → Container → Text
//     subtree. `Opacity` with a non-trivial child forces a saveLayer: an
//     offscreen buffer allocated, drawn into, and composited — per floater,
//     per frame. Fourteen saveLayers at 60fps on a budget phone is where the
//     jank and a good part of the memory churn came from.
//
//     Now: ONE Ticker, and the floaters are painted directly by a
//     CustomPainter into the existing canvas. No layers, no per-floater
//     widgets, no per-floater controllers. The text is laid out ONCE at
//     construction — "+۱" never changes — instead of being shaped fourteen
//     times a frame.
//
//  2. THE TICKER RAN FOREVER. Anything animation-driven that ticks while
//     nothing is moving costs a frame callback for no pixels. The ticker
//     here is started when the first floater appears and STOPPED the moment
//     the last one expires, so an idle screen schedules nothing.
//
//  3. THE PREVIOUS SKIN WAS NEVER RELEASED. The cross-fade kept
//     `_previousSkin` set for the life of the screen, so two ~1.3 MB decoded
//     bitmaps stayed pinned in the image cache after every character change
//     — and the cache is 40 MB total. It is now cleared when the fade ends.
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../../../theme/tokens.dart';

/// One short-lived "+1" that drifts up and fades.
///
/// A plain value object rather than a widget: it holds only what the painter
/// needs, and it is born knowing when it dies so the painter can compute its
/// own progress without a controller per instance.
class _FloatingPoint {
  _FloatingPoint({
    required this.offset,
    required this.angle,
    required this.scale,
    required this.bornMs,
  });

  final Offset offset;
  final double angle;
  final double scale;
  final int bornMs;
}

/// How long a "+1" lives. Matches the old per-floater controller duration so
/// the motion is pixel-for-pixel what it was.
const int _floaterLifeMs = 700;

/// Hard cap on simultaneous floaters. A fast tapper must never accumulate
/// hundreds; at 12 taps/s and a 700ms life, nine is the natural steady state,
/// so fourteen leaves headroom without ever being reached in normal play.
const int _maxFloaters = 14;

class TapCharacter extends StatefulWidget {
  const TapCharacter({
    super.key,
    required this.skin,
    required this.onTap,
    required this.accent,
    this.enabled = true,
  });

  final String skin;

  /// Returns true when the tap counted, so the visual reaction can differ for
  /// a rejected tap.
  final bool Function(TapDownDetails details) onTap;

  final Color accent;
  final bool enabled;

  @override
  State<TapCharacter> createState() => TapCharacterState();
}

class TapCharacterState extends State<TapCharacter>
    with TickerProviderStateMixin {
  late final AnimationController _squash;
  late final AnimationController _glow;
  late final AnimationController _skinFade;

  /// The single clock for every floater.
  Ticker? _floaterTicker;

  /// Monotonic time base for floater ages. A Stopwatch rather than
  /// DateTime.now() so changing the device clock cannot make a floater
  /// immortal or make it vanish instantly.
  final Stopwatch _clock = Stopwatch()..start();

  final List<_FloatingPoint> _floaters = [];

  /// Repaint signal for the floater layer ONLY.
  ///
  /// Driving the painter from a Listenable instead of setState means a
  /// floater frame repaints the floater layer and nothing else — the
  /// character image, the glow and the gesture detector are all untouched.
  /// setState would mark the whole subtree dirty sixty times a second.
  final ValueNotifier<int> _floaterTick = ValueNotifier<int>(0);

  final Random _rnd = Random();

  String _currentSkin = '';
  String? _previousSkin;

  @override
  void initState() {
    super.initState();
    _currentSkin = widget.skin;
    _squash = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 90),
      reverseDuration: const Duration(milliseconds: 170),
    )..addStatusListener(_onSquashStatus);
    _glow = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _skinFade = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
      value: 1,
    )..addStatusListener(_onSkinFadeStatus);
  }

  @override
  void didUpdateWidget(covariant TapCharacter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.skin != _currentSkin) {
      // Cross-fade rather than a hard swap: the skin change is a reward
      // moment and should feel like one.
      _previousSkin = _currentSkin;
      _currentSkin = widget.skin;
      _skinFade
        ..value = 0
        ..forward();
    }
  }

  void _onSquashStatus(AnimationStatus status) {
    // Auto-reverse once the squash lands. Attached once, so no allocation
    // per tap and nothing to orphan when a tap interrupts the animation.
    if (status == AnimationStatus.completed && mounted) {
      _squash.reverse();
    }
  }

  void _onSkinFadeStatus(AnimationStatus status) {
    // RELEASE THE OLD ARTWORK. Without this the outgoing skin stayed
    // referenced for the life of the screen, pinning a second ~1.3 MB
    // decoded bitmap in a 40 MB cache for a frame nobody will ever see
    // again. Four character changes meant four dead bitmaps.
    if (status == AnimationStatus.completed && _previousSkin != null) {
      setState(() => _previousSkin = null);
    }
  }

  @override
  void dispose() {
    _squash.removeStatusListener(_onSquashStatus);
    _skinFade.removeStatusListener(_onSkinFadeStatus);
    _floaterTicker?.dispose();
    _floaterTick.dispose();
    _squash.dispose();
    _glow.dispose();
    _skinFade.dispose();
    _clock.stop();
    super.dispose();
  }

  /// Plays the celebratory pulse — called by the screen on level-up.
  void pulse() {
    if (!mounted) return;
    _glow.forward(from: 0);
  }

  // ── floaters ─────────────────────────────────────────────────────────────

  void _onFloaterFrame(Duration _) {
    final cutoff = _clock.elapsedMilliseconds - _floaterLifeMs;
    // The list is append-only and every floater has the same lifetime, so it
    // is sorted by birth: the expired ones are always a prefix. Removing
    // from the front while the front is dead is O(dead), not O(n) per frame.
    var dead = 0;
    while (dead < _floaters.length && _floaters[dead].bornMs <= cutoff) {
      dead++;
    }
    if (dead > 0) _floaters.removeRange(0, dead);

    if (_floaters.isEmpty) {
      // STOP THE CLOCK. An idle screen must not schedule frames.
      _floaterTicker?.stop();
      // One final repaint to clear the last floater off the canvas.
      _floaterTick.value++;
      return;
    }
    _floaterTick.value++;
  }

  void _spawnFloater(Offset at) {
    _floaters.add(_FloatingPoint(
      offset: at,
      angle: (_rnd.nextDouble() - 0.5) * 0.5,
      scale: 0.85 + _rnd.nextDouble() * 0.4,
      bornMs: _clock.elapsedMilliseconds,
    ));
    // Eviction by age; index 0 is the oldest.
    while (_floaters.length > _maxFloaters) {
      _floaters.removeAt(0);
    }

    // Lazily create the ticker on first use, then start/stop it as needed.
    _floaterTicker ??= createTicker(_onFloaterFrame);
    if (!_floaterTicker!.isActive) _floaterTicker!.start();
    _floaterTick.value++;
  }

  void _handleTapDown(TapDownDetails details) {
    if (!widget.enabled) return;
    final counted = widget.onTap(details);

    // LEAK FIX (kept from the earlier pass). This used to be:
    //
    //   _squash.forward().then((_) { if (mounted) _squash.reverse(); });
    //
    // `forward()` returns a TickerFuture, and Flutter deliberately never
    // completes that future when the animation is INTERRUPTED. The squash
    // cycle is 260ms; at a comfortable 6 taps/s a new forward() interrupts
    // the previous one about two times in three, so two thirds of these
    // closures were orphaned and held for the life of the screen.
    //
    // A status listener attached ONCE in initState has no per-tap
    // allocation and cannot orphan anything.
    _squash.forward(from: 0);

    if (!counted) return;

    // Spawn a floater at the touch point with a little scatter.
    final box = context.findRenderObject() as RenderBox?;
    if (box == null) return;
    _spawnFloater(box.globalToLocal(details.globalPosition));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: _handleTapDown,
      child: AnimatedBuilder(
        animation: Listenable.merge([_squash, _glow]),
        builder: (context, child) {
          final t = Curves.easeOut.transform(_squash.value);
          final g = Curves.easeOut.transform(_glow.value);
          return Transform.scale(
            scaleX: 1 + t * 0.06 + g * 0.05,
            scaleY: 1 - t * 0.08 + g * 0.05,
            child: Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                if (g > 0)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: widget.accent
                                  .withValues(alpha: 0.45 * (1 - g)),
                              blurRadius: 60 * g,
                              spreadRadius: 20 * g,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                child!,
              ],
            ),
          );
        },
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            _buildArtwork(),
            // The floater layer sits in its own RepaintBoundary so its 60fps
            // repaints never dirty the character image underneath — which
            // would otherwise re-composite a 1.3 MB bitmap every frame.
            Positioned.fill(
              child: IgnorePointer(
                child: RepaintBoundary(
                  child: CustomPaint(
                    painter: _FloaterPainter(
                      floaters: _floaters,
                      clock: _clock,
                      repaint: _floaterTick,
                      accent: isDark
                          ? widget.accent
                          : const Color(0xFF4D7C0F),
                      chip: isDark
                          ? const Color(0x8C000000)
                          : const Color(0xEBFFFFFF),
                      border: widget.accent.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildArtwork() {
    // Skip the AnimatedBuilder entirely when no cross-fade is running, which
    // is almost always. Otherwise every frame of the squash animation walked
    // through a builder that had nothing to say.
    if (_previousSkin == null) return _SkinImage(path: _currentSkin);

    return AnimatedBuilder(
      animation: _skinFade,
      builder: (context, _) {
        return Stack(
          alignment: Alignment.center,
          children: [
            Opacity(
              opacity: 1 - _skinFade.value,
              child: _SkinImage(path: _previousSkin!),
            ),
            Opacity(
              opacity: _skinFade.value,
              child: _SkinImage(path: _currentSkin),
            ),
          ],
        );
      },
    );
  }
}

/// Paints every live "+1" in one pass.
///
/// Replaces fourteen widgets, fourteen AnimationControllers and fourteen
/// saveLayers with one canvas walk over a list of value objects.
class _FloaterPainter extends CustomPainter {
  _FloaterPainter({
    required this.floaters,
    required this.clock,
    required this.accent,
    required this.chip,
    required this.border,
    required Listenable repaint,
  }) : super(repaint: repaint);

  final List<_FloatingPoint> floaters;
  final Stopwatch clock;
  final Color accent;
  final Color chip;
  final Color border;

  /// Pre-laid-out "+۱" glyphs, one per opacity step.
  ///
  /// WHY QUANTISED RATHER THAN EXACT. A TextPainter bakes its colour into the
  /// shaped run, so fading the text means a new painter — and `layout()` is
  /// among the most expensive calls you can make inside `paint`. Laying out
  /// once per floater per frame would have been fourteen shapes per frame,
  /// which is worse than the widget tree this replaces.
  ///
  /// Eight steps over a 700 ms fade is a change every 87 ms; at 18 px the
  /// difference between adjacent steps is invisible, and the alternative —
  /// a saveLayer to apply opacity — is exactly the allocation this painter
  /// exists to avoid.
  ///
  /// The cache is static and bounded at 2 themes x 8 steps = 16 entries, all
  /// of them two glyphs wide, so it is a few kilobytes for the life of the
  /// process.
  static const int _alphaSteps = 8;
  static final Map<int, TextPainter> _labels = {};

  static TextPainter _labelFor(Color base, int step) {
    // The key has to cover the colour too: the light and dark themes use
    // different accents and would otherwise share a cache entry.
    final key = (base.toARGB32() & 0x00FFFFFF) * (_alphaSteps + 1) + step;
    return _labels.putIfAbsent(key, () {
      final a = step / _alphaSteps;
      return TextPainter(
        text: TextSpan(
          text: '+۱',
          style: TextStyle(
            color: base.withValues(alpha: base.a * a),
            fontWeight: FontWeight.w900,
            fontSize: 18,
            fontFamily: 'Vazirmatn',
          ),
        ),
        textDirection: TextDirection.rtl,
      )..layout();
    });
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (floaters.isEmpty) return;

    // Any step gives the same metrics — the glyphs differ only in colour —
    // so measure once and reuse for the chip geometry.
    final metrics = _labelFor(accent, _alphaSteps);
    final chipW = metrics.width + Gaps.xs * 2;
    final chipH = metrics.height + Gaps.xxs * 2;

    final fill = Paint()..color = chip;
    final stroke = Paint()
      ..color = border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    final nowMs = clock.elapsedMilliseconds;

    for (final f in floaters) {
      final age = nowMs - f.bornMs;
      // Guard both ends: a floater spawned in the same millisecond as this
      // frame has age 0, and one about to be swept has age slightly over the
      // lifetime. Clamping keeps the maths inside the curve's domain.
      final t = (age / _floaterLifeMs).clamp(0.0, 1.0);
      final eased = Curves.easeOut.transform(t);

      // Identical motion to the widget version it replaces: drift up by 80,
      // sideways by the scatter angle, fading and growing as it goes.
      final dx = f.offset.dx - 24 + f.angle * 60 * t;
      final dy = f.offset.dy - 30 - 80 * eased;
      final scale = f.scale * (0.8 + 0.4 * eased);
      final opacity = 1 - t;
      if (opacity <= 0) continue;

      canvas.save();
      canvas.translate(dx, dy);
      canvas.scale(scale);

      // Alpha is applied per-colour rather than with saveLayer. This is the
      // whole reason the painter is cheap: a saveLayer allocates an
      // offscreen buffer the size of the affected area, and the widget
      // version did that once per floater per frame.
      final a = opacity.clamp(0.0, 1.0);
      fill.color = chip.withValues(alpha: chip.a * a);
      stroke.color = border.withValues(alpha: border.a * a);

      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, chipW, chipH),
        Radius.circular(chipH / 2),
      );
      canvas.drawRRect(rect, fill);
      canvas.drawRRect(rect, stroke);

      // The glyph's alpha comes from a pre-shaped variant rather than a
      // saveLayer — see the note on _labels.
      final step = (a * _alphaSteps).round().clamp(1, _alphaSteps);
      _labelFor(accent, step).paint(canvas, const Offset(Gaps.xs, Gaps.xxs));

      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _FloaterPainter old) =>
      // The Listenable drives repaints; this only has to catch a theme flip.
      old.accent != accent || old.chip != chip || old.border != border;
}

class _SkinImage extends StatelessWidget {
  const _SkinImage({required this.path});
  final String path;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      path,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.medium,
      gaplessPlayback: true,
      // The skins are ~620x900 and the character is never drawn wider than
      // about a third of a phone screen — roughly 130 logical px, so 320
      // physical px covers a 2.5x display with room to spare. At the old 480
      // each skin cost 1.3 MB decoded; at 320 it is 0.57 MB, and during a
      // cross-fade two are alive at once. Against a 40 MB cache shared with
      // avatars, banners and crests, that difference is the game screen
      // going from "evicts other screens" to "barely registers".
      cacheWidth: 320,
      // A missing skin must never blank the game area.
      errorBuilder: (_, __, ___) => const Center(
        child: const Icon(Icons.circle_rounded, size: 120, color: Color(0xFF22C55E)),
      ),
    );
  }
}
