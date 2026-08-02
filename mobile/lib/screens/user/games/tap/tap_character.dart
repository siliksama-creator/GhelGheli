// The tappable character plus its feedback layers.
//
// Split out of the screen so the visual language (squash, glow, floating
// "+1"s) can be iterated on without touching game logic.
import 'dart:math';

import 'package:flutter/material.dart';

import '../../../../theme/tokens.dart';

/// One short-lived "+1" that drifts up and fades.
class _FloatingPoint {
  _FloatingPoint({
    required this.id,
    required this.offset,
    required this.angle,
    required this.scale,
  });

  final int id;
  final Offset offset;
  final double angle;
  final double scale;
}

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

  final List<_FloatingPoint> _floaters = [];
  int _floaterId = 0;
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
    );
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

  @override
  void dispose() {
    _squash.removeStatusListener(_onSquashStatus);
    _squash.dispose();
    _glow.dispose();
    _skinFade.dispose();
    super.dispose();
  }

  /// Plays the celebratory pulse — called by the screen on level-up.
  void pulse() {
    if (!mounted) return;
    _glow.forward(from: 0);
  }

  void _handleTapDown(TapDownDetails details) {
    if (!widget.enabled) return;
    final counted = widget.onTap(details);

    // LEAK FIX. This used to be:
    //
    //   _squash.forward().then((_) { if (mounted) _squash.reverse(); });
    //
    // `forward()` returns a TickerFuture, and Flutter deliberately never
    // completes that future when the animation is INTERRUPTED. The squash
    // cycle is 260ms; at a comfortable 6 taps/s a new forward() interrupts
    // the previous one about two times in three, so two thirds of these
    // closures were orphaned and held for the life of the screen. Ten
    // minutes of play left thousands of dead futures and their captured
    // closures on the heap — a leak that grows with time played, which is
    // exactly the "it starts crashing after a while" the owner reported.
    //
    // A status listener attached ONCE in initState has no per-tap
    // allocation and cannot orphan anything.
    _squash.forward(from: 0);

    if (!counted) return;

    // Spawn a floater at the touch point with a little scatter.
    final box = context.findRenderObject() as RenderBox?;
    final local = box?.globalToLocal(details.globalPosition) ??
        Offset(box?.size.width ?? 0 / 2, box?.size.height ?? 0 / 2);

    setState(() {
      _floaters.add(_FloatingPoint(
        id: _floaterId++,
        offset: local,
        angle: (_rnd.nextDouble() - 0.5) * 0.5,
        scale: 0.85 + _rnd.nextDouble() * 0.4,
      ));
      // Hard cap: a fast tapper must never accumulate hundreds of widgets.
      //
      // Eviction is by AGE (index 0 is the oldest) and the evicted widget is
      // disposed by the framework, but its 700ms timer has already been
      // started — so `onDone` still fires later with an id that is no longer
      // in the list. `_removeFloater` therefore has to tolerate an unknown
      // id rather than assume it is present.
      while (_floaters.length > 14) {
        _floaters.removeAt(0);
      }
    });
  }

  void _removeFloater(int id) {
    if (!mounted) return;
    // Skip the rebuild entirely when the id was already evicted by the cap:
    // at high tap rates that fired a pointless full setState several times a
    // second.
    if (!_floaters.any((f) => f.id == id)) return;
    setState(() => _floaters.removeWhere((f) => f.id == id));
  }

  @override
  Widget build(BuildContext context) {
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
            for (final f in _floaters)
              Positioned(
                left: f.offset.dx - 24,
                top: f.offset.dy - 30,
                child: _Floater(
                  key: ValueKey(f.id),
                  angle: f.angle,
                  scale: f.scale,
                  accent: widget.accent,
                  onDone: () => _removeFloater(f.id),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildArtwork() {
    return AnimatedBuilder(
      animation: _skinFade,
      builder: (context, _) {
        return Stack(
          alignment: Alignment.center,
          children: [
            if (_previousSkin != null && _skinFade.value < 1)
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
      // A missing skin must never blank the game area.
      errorBuilder: (_, __, ___) => const Center(
        child: Text('🟢', style: TextStyle(fontSize: 120)),
      ),
    );
  }
}

class _Floater extends StatefulWidget {
  const _Floater({
    super.key,
    required this.angle,
    required this.scale,
    required this.accent,
    required this.onDone,
  });

  final double angle;
  final double scale;
  final Color accent;
  final VoidCallback onDone;

  @override
  State<_Floater> createState() => _FloaterState();
}

class _FloaterState extends State<_Floater>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..forward().then((_) => widget.onDone());
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final t = _c.value;
          return Transform.translate(
            offset: Offset(widget.angle * 60 * t, -80 * Curves.easeOut.transform(t)),
            child: Opacity(
              opacity: (1 - t).clamp(0.0, 1.0),
              child: Transform.scale(
                scale: widget.scale * (0.8 + 0.4 * Curves.easeOut.transform(t)),
                child: child,
              ),
            ),
          );
        },
        child: Builder(builder: (context) {
          // A hardcoded black chip looks pasted-on in the app's light theme,
          // which the web build made obvious. Derive the surface from the
          // active scheme so it works in both.
          final scheme = Theme.of(context).colorScheme;
          final isDark = scheme.brightness == Brightness.dark;
          return Container(
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.xs, vertical: Gaps.xxs),
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.black.withValues(alpha: 0.55)
                  : Colors.white.withValues(alpha: 0.92),
              borderRadius: Corners.rPill,
              border: Border.all(color: widget.accent.withValues(alpha: 0.7)),
            ),
            child: Text(
              '+۱',
              style: TextStyle(
                // The lime accent is too pale to read on white; darken it
                // for the light theme only.
                color: isDark ? widget.accent : const Color(0xFF4D7C0F),
                fontWeight: FontWeight.w900,
                fontSize: 18,
              ),
            ),
          );
        }),
      ),
    );
  }
}
