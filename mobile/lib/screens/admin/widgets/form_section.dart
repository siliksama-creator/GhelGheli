import 'package:flutter/material.dart';

import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/section_header.dart';

/// Consistent grouped-form card used throughout the admin console (replaces
/// bare `CardShell(child: Column(...))` blocks with a titled, evenly
/// spaced form group).
class FormSection extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final double spacing;

  const FormSection(
      {super.key,
      required this.title,
      this.subtitle,
      required this.children,
      this.spacing = Gaps.sm});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeader(
              title: title,
              subtitle: subtitle,
              padding: const EdgeInsets.only(bottom: Gaps.md)),
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) SizedBox(height: spacing),
            children[i],
          ],
        ],
      ),
    );
  }
}
