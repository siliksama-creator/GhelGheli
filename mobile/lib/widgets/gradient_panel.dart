import 'package:flutter/material.dart';
import '../theme/tokens.dart';

/// A rounded, gradient-filled hero surface with a soft glow shadow — used
/// for the dashboard points header, league banner and similar "showcase"
/// blocks that need to stand out from ordinary cards.
class GradientPanel extends StatelessWidget {
  final List<Color> colors;
  final Widget child;
  final EdgeInsetsGeometry padding;
  final AlignmentGeometry begin;
  final AlignmentGeometry end;
  final double radius;
  final List<BoxShadow>? shadow;

  const GradientPanel({
    super.key,
    required this.colors,
    required this.child,
    this.padding = const EdgeInsets.all(Gaps.xl),
    this.begin = Alignment.topLeft,
    this.end = Alignment.bottomRight,
    this.radius = Corners.xxl,
    this.shadow,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(colors: colors, begin: begin, end: end),
        boxShadow: shadow ??
            [
              BoxShadow(
                  color: colors.last.withValues(alpha: 0.28),
                  blurRadius: 30,
                  offset: const Offset(0, 14)),
            ],
      ),
      child: child,
    );
  }
}

/// Soft glow orb used as decorative background bokeh (login, splash).
class GlowOrb extends StatelessWidget {
  final Color color;
  final double size;
  const GlowOrb({super.key, required this.color, required this.size});

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: 0.20),
            boxShadow: [
              BoxShadow(
                  color: color.withValues(alpha: 0.35),
                  blurRadius: 90,
                  spreadRadius: 30)
            ],
          ),
        ),
      );
}
