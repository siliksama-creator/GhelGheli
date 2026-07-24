// A general-purpose elevated content card used all across the app in place
// of the old ad-hoc `CardShell`. Provides a consistent radius, background,
// border and soft shadow driven by the current [BrandTheme], and adapts
// automatically between light and dark mode.
import 'package:flutter/material.dart';
import '../theme/brand_theme.dart';
import '../theme/tokens.dart';

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? maxWidth;
  final Color? color;
  final VoidCallback? onTap;
  final bool elevated;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Gaps.lg),
    this.maxWidth,
    this.color,
    this.onTap,
    this.elevated = true,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brand = context.brand;
    final content = AnimatedContainer(
      duration: Motion.fast,
      constraints:
          maxWidth != null ? BoxConstraints(maxWidth: maxWidth!) : null,
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        color: color ?? scheme.surfaceContainer,
        border: Border.all(color: brand.subtleBorder),
        boxShadow: elevated ? brand.softShadow : null,
      ),
      child: child,
    );

    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      borderRadius: Corners.rXl,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rXl,
        child: content,
      ),
    );
  }
}
