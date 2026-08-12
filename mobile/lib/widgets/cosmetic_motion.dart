import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../core/cosmetic_palette.dart';

class CosmeticAvatarFrame extends StatefulWidget {
  const CosmeticAvatarFrame({
    super.key,
    required this.frame,
    required this.child,
    this.padding = 3,
  });

  final String? frame;
  final Widget child;
  final double padding;

  @override
  State<CosmeticAvatarFrame> createState() => _CosmeticAvatarFrameState();
}

class _CosmeticAvatarFrameState extends State<CosmeticAvatarFrame>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant CosmeticAvatarFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.frame != widget.frame) _syncTicker();
  }

  void _syncTicker() {
    if (frameColors.containsKey(widget.frame)) {
      if (!_controller.isAnimating) _controller.repeat();
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _royal => const {
    'holo', 'pro_holographic', 'animated_gold', 'annual_royal_frame',
  }.contains(widget.frame);

  String? get _cornerMark => switch (widget.frame) {
    'season_champion' => '★',
    'champions_night' => '✦',
    'annual_royal_frame' => '♛',
    _ => null,
  };

  Widget _paint(double t) {
    final colors = frameColors[widget.frame];
    if (colors == null) return widget.child;
    final wave = (math.sin(t * math.pi * 2) + 1) / 2;
    final gradient = _royal
        ? SweepGradient(
            transform: GradientRotation(t * math.pi * 2),
            colors: [...colors, colors.first],
          )
        : LinearGradient(
            begin: Alignment(-1 + t * 2, -1),
            end: Alignment(1 - t * 2, 1),
            colors: [...colors, colors.first],
          );
    final mark = _cornerMark;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: EdgeInsets.all(widget.padding),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: gradient,
            boxShadow: [
              BoxShadow(
                color: colors.last.withValues(alpha: .30 + wave * .34),
                blurRadius: 11 + wave * 11,
                spreadRadius: wave * 1.2,
              ),
            ],
          ),
          child: widget.child,
        ),
        if (mark != null)
          PositionedDirectional(
            top: -5,
            end: -4,
            child: Transform.scale(
              scale: .92 + wave * .18,
              child: Container(
                width: 18,
                height: 18,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color(0xFFFFD166),
                  boxShadow: [BoxShadow(color: Color(0xAAFFD166), blurRadius: 8)],
                ),
                child: Text(mark,
                    style: const TextStyle(fontSize: 9, color: Color(0xFF071522), fontWeight: FontWeight.w900)),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (frameColors[widget.frame] == null) return widget.child;
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return _paint(.35);
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (_, __) => _paint(_controller.value),
      ),
    );
  }
}

class CosmeticCardFrame extends StatefulWidget {
  const CosmeticCardFrame({
    super.key,
    required this.frame,
    required this.child,
    this.borderRadius = 22,
    this.padding = 3,
  });
  final String? frame;
  final Widget child;
  final double borderRadius;
  final double padding;

  @override
  State<CosmeticCardFrame> createState() => _CosmeticCardFrameState();
}

class _CosmeticCardFrameState extends State<CosmeticCardFrame>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2800),
  );

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant CosmeticCardFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.frame != widget.frame) _syncTicker();
  }

  void _syncTicker() {
    if (frameColors.containsKey(widget.frame)) {
      if (!_controller.isAnimating) _controller.repeat();
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _paint(double t) {
    final colors = frameColors[widget.frame];
    if (colors == null) return widget.child;
    final wave = math.sin(t * math.pi).abs();
    return Container(
      padding: EdgeInsets.all(widget.padding),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(widget.borderRadius),
        gradient: SweepGradient(
          transform: GradientRotation(t * math.pi * 2),
          colors: [...colors, colors.first],
        ),
        boxShadow: [BoxShadow(
          color: colors.last.withValues(alpha: .25 + wave * .35),
          blurRadius: 11 + wave * 13,
        )],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(widget.borderRadius - widget.padding),
        child: widget.child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (frameColors[widget.frame] == null) return widget.child;
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return _paint(.35);
    return RepaintBoundary(
      child: AnimatedBuilder(animation: _controller, builder: (_, __) => _paint(_controller.value)),
    );
  }
}

class AnimatedProfileBackground extends StatefulWidget {
  const AnimatedProfileBackground({
    super.key,
    required this.slug,
    required this.child,
  });
  final String? slug;
  final Widget child;

  @override
  State<AnimatedProfileBackground> createState() => _AnimatedProfileBackgroundState();
}

class _AnimatedProfileBackgroundState extends State<AnimatedProfileBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _buildSurface(double t) {
    final decoration = profileBackgroundDecoration(widget.slug);
    if (decoration == null) return widget.child;
    return Container(
      decoration: decoration,
      clipBehavior: Clip.antiAlias,
      child: Stack(fit: StackFit.passthrough, children: [
        Positioned.fill(
          child: IgnorePointer(
            child: Transform.rotate(
              angle: t * math.pi * 2,
              child: FractionallySizedBox(
                widthFactor: 1.8,
                heightFactor: 1.8,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: SweepGradient(colors: [
                      Colors.transparent,
                      const Color(0xFFFFFFFF).withValues(alpha: .055),
                      Colors.transparent,
                      const Color(0xFF38BDF8).withValues(alpha: .045),
                      Colors.transparent,
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ),
        widget.child,
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.slug == null) return widget.child;
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return _buildSurface(.2);
    return RepaintBoundary(
      child: AnimatedBuilder(animation: _controller, builder: (_, __) => _buildSurface(_controller.value)),
    );
  }
}

class AnimatedNameText extends StatefulWidget {
  const AnimatedNameText({
    super.key,
    required this.name,
    required this.effect,
    this.style,
    this.maxLines = 1,
  });

  final String name;
  final String? effect;
  final TextStyle? style;
  final int maxLines;

  @override
  State<AnimatedNameText> createState() => _AnimatedNameTextState();
}

class _AnimatedNameTextState extends State<AnimatedNameText>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2800),
  );

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant AnimatedNameText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.effect != widget.effect) _syncTicker();
  }

  void _syncTicker() {
    if (widget.effect != null && widget.effect!.isNotEmpty) {
      if (!_controller.isAnimating) _controller.repeat();
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _render(BuildContext context, double t) {
    final onLight = Theme.of(context).brightness == Brightness.light;
    final effect = widget.effect;
    final colors = nameGradientColors[effect];
    final base = widget.style ?? const TextStyle();
    final useGradient = colors != null && !(onLight && (effect?.startsWith('#') ?? false));
    final isDigital = effect == 'digital_typing';
    final isMvp = effect == 'mvp_name';
    final cursor = isDigital && t < .55 ? ' ▌' : '';
    final shown = '${isMvp ? '♛ ' : ''}${widget.name}$cursor';
    final glow = colors?.last ?? nameColorOf(effect) ?? Colors.transparent;
    const pulseEffects = {'#F87171', 'green_neon', 'animated_fire', 'mvp_name'};
    final scale = pulseEffects.contains(effect)
        ? 1 + math.sin(t * math.pi * 2).abs() * .035
        : 1.0;
    final text = Text(
      shown,
      maxLines: widget.maxLines,
      overflow: TextOverflow.ellipsis,
      style: base.copyWith(
        color: nameColorOf(effect, onLight: onLight) ?? Colors.white,
        fontWeight: base.fontWeight ?? FontWeight.w900,
        shadows: effect == null ? base.shadows : [
          Shadow(color: glow.withValues(alpha: .32 + .30 * math.sin(t * math.pi).abs()), blurRadius: 4 + 5 * math.sin(t * math.pi).abs()),
        ],
      ),
    );
    Widget painted = text;
    if (useGradient) {
      final palette = onLight && effect == 'rainbow' ? rainbowColorsOnLight : colors;
      painted = ShaderMask(
        shaderCallback: (bounds) => LinearGradient(
          begin: Alignment(-1 + t * 2, 0),
          end: Alignment(1 + t * 2, 0),
          colors: [...palette, palette.first],
        ).createShader(bounds),
        blendMode: BlendMode.srcIn,
        child: text,
      );
    }
    return Transform.scale(scale: scale, alignment: Alignment.centerRight, child: painted);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.effect == null || widget.effect!.isEmpty) {
      return Text(widget.name, maxLines: widget.maxLines, overflow: TextOverflow.ellipsis, style: widget.style);
    }
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return _render(context, .35);
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => _render(context, _controller.value),
      ),
    );
  }
}

class ProfileBadgeVisual extends StatefulWidget {
  const ProfileBadgeVisual({super.key, required this.badge, this.compact = false});
  final String? badge;
  final bool compact;

  @override
  State<ProfileBadgeVisual> createState() => _ProfileBadgeVisualState();
}

class _ProfileBadgeVisualState extends State<ProfileBadgeVisual>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2300),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _render(double t) {
    final colors = profileBadgeColors[widget.badge];
    final label = profileBadgeLabels[widget.badge];
    final icon = profileBadgeIcons[widget.badge];
    if (colors == null || label == null || icon == null) return const SizedBox.shrink();
    final pulse = math.sin(t * math.pi).abs();
    return Transform.scale(
      scale: 1 + pulse * .045,
      child: Container(
        padding: widget.compact
            ? const EdgeInsetsDirectional.fromSTEB(2, 1.5, 4, 1.5)
            : const EdgeInsetsDirectional.fromSTEB(3, 2, 7, 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          gradient: LinearGradient(
            begin: Alignment(-1 + t * 2, 0),
            end: Alignment(1 - t * 2, 0),
            colors: [const Color(0xFF071522), colors.last.withValues(alpha: .58)],
          ),
          border: Border.all(color: colors.last.withValues(alpha: .72)),
          boxShadow: [BoxShadow(color: colors.last.withValues(alpha: .25 + pulse * .28), blurRadius: 5 + pulse * 6)],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: colors)),
            child: Text(icon, style: const TextStyle(fontSize: 7.5, color: Color(0xFF071522), fontWeight: FontWeight.w900)),
          ),
          SizedBox(width: widget.compact ? 2 : 3),
          Text(label, textDirection: TextDirection.ltr,
              style: TextStyle(fontSize: widget.compact ? 6.2 : 7.5, color: colors.first, fontWeight: FontWeight.w900)),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!profileBadgeLabels.containsKey(widget.badge)) return const SizedBox.shrink();
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return _render(.35);
    return RepaintBoundary(
      child: AnimatedBuilder(animation: _controller, builder: (_, __) => _render(_controller.value)),
    );
  }
}

/// Small club crest drawn before a name.
