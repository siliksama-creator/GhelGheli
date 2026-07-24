import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';

/// Compact KPI card used on the admin dashboard grid.
class StatCard extends StatelessWidget {
  final String title;
  final Object value;
  final IconData icon;
  final Color? accent;

  const StatCard(this.title, this.value,
      {super.key, this.icon = Icons.insights_rounded, this.accent});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = accent ?? theme.colorScheme.primary;
    return AppCard(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                borderRadius: Corners.rSm),
            child: Icon(icon, size: 18, color: color),
          ),
          Gaps.vSm,
          Text(faNum(value), style: theme.textTheme.headlineSmall),
          const SizedBox(height: 2),
          Text(title,
              style: theme.textTheme.bodySmall,
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
