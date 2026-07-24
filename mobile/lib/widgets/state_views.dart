import 'package:flutter/material.dart';
import '../theme/tokens.dart';

/// Friendly, illustrated placeholder for empty lists (no rewards, no cards,
/// no tickets, etc.) — replaces bare `Text('...')` placeholders across the
/// original screens with a consistent, calmer visual treatment.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  const EmptyState(
      {super.key,
      required this.icon,
      required this.title,
      this.message,
      this.action});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding:
          const EdgeInsets.symmetric(vertical: Gaps.xxl, horizontal: Gaps.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: theme.colorScheme.surfaceContainerHighest,
            ),
            child:
                Icon(icon, size: 30, color: theme.colorScheme.onSurfaceVariant),
          ),
          Gaps.vMd,
          Text(title,
              textAlign: TextAlign.center, style: theme.textTheme.titleSmall),
          if (message != null) ...[
            Gaps.vXxs,
            Text(message!,
                textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
          ],
          if (action != null) ...[Gaps.vMd, action!],
        ],
      ),
    );
  }
}

/// Inline error banner with retry affordance — used to surface API errors
/// consistently instead of raw `Text(msg)` scattered through the old code.
class ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorBanner({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final danger = theme.colorScheme.error;
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        color: danger.withValues(alpha: 0.12),
        borderRadius: Corners.rMd,
        border: Border.all(color: danger.withValues(alpha: 0.28)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, color: danger, size: 20),
          Gaps.hSm,
          Expanded(
              child: Text(message,
                  style: theme.textTheme.bodySmall?.copyWith(color: danger))),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(foregroundColor: danger),
              child: const Text('تلاش مجدد'),
            ),
        ],
      ),
    );
  }
}

/// Centered loading affordance for full-page async states.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key});
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}
