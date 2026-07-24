import 'package:flutter/material.dart';
import '../theme/tokens.dart';

/// Small pill-shaped badge used for feature highlights on the auth screen
/// and lightweight tags elsewhere (replaces the old `_FeaturePill`).
class FeaturePill extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color? foreground;
  final Color? background;

  const FeaturePill(
      {super.key,
      required this.icon,
      required this.text,
      this.foreground,
      this.background});

  @override
  Widget build(BuildContext context) {
    final fg = foreground ?? Colors.white;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: Gaps.sm, vertical: Gaps.xxs + 2),
      decoration: BoxDecoration(
        color: background ?? Colors.white.withValues(alpha: 0.12),
        borderRadius: Corners.rPill,
        border: Border.all(color: fg.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: fg),
          const SizedBox(width: 6),
          Text(text,
              style: TextStyle(
                  color: fg, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ],
      ),
    );
  }
}

/// Compact status badge (active / blocked / pending / etc.) with automatic
/// color mapping for the most common backend status strings.
class StatusBadge extends StatelessWidget {
  final String status;
  final Map<String, String>? labels;

  const StatusBadge({super.key, required this.status, this.labels});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    late Color color;
    switch (status) {
      case 'active':
      case 'approved':
      case 'paid':
      case 'resolved':
        color = const Color(0xFF22C58B);
        break;
      case 'blocked':
      case 'rejected':
      case 'closed':
        color = scheme.error;
        break;
      case 'pending':
      case 'open':
      default:
        color = const Color(0xFFF2A93B);
    }
    final text = labels?[status] ?? status;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.16), borderRadius: Corners.rPill),
      child: Text(text,
          style: theme.textTheme.labelSmall
              ?.copyWith(color: color, fontWeight: FontWeight.w800)),
    );
  }
}
