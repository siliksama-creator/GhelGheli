// Admin-pinned announcement shown at the top of the chat room.
//
// Takes over the slot that used to hold the static "از الفاظ رکیک خودداری
// کنید" warning — which became pointless once users could only send
// predefined canned messages.
import 'package:flutter/material.dart';

import '../../../theme/tokens.dart';

/// Accent palette the admin can pick from, kept in sync with the backend's
/// PIN_ACCENTS list.
const pinAccents = <String, Color>{
  'gold': Color(0xFFFFC53D),
  'green': Color(0xFF34D399),
  'blue': Color(0xFF60A5FA),
  'red': Color(0xFFF87171),
};

Color pinColor(Object? key) => pinAccents[key] ?? pinAccents['gold']!;

class PinnedBanner extends StatelessWidget {
  const PinnedBanner({super.key, required this.pinned});

  /// `{ text, accent, active, pinnedAt, pinnedBy }` from /api/chat/config.
  final Map<String, dynamic>? pinned;

  @override
  Widget build(BuildContext context) {
    final p = pinned;
    final text = '${p?['text'] ?? ''}'.trim();
    if (p == null || p['active'] != true || text.isEmpty) {
      return const SizedBox.shrink();
    }
    final color = pinColor(p['accent']);
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.fromLTRB(Gaps.md, 0, Gaps.md, Gaps.xs),
      padding: const EdgeInsets.symmetric(
          horizontal: Gaps.sm, vertical: Gaps.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: Corners.rMd,
        border: Border.all(color: color.withValues(alpha: 0.55)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.push_pin_rounded, size: 16, color: color),
          Gaps.hXs,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('اعلان مدیریت',
                    style: theme.textTheme.labelSmall?.copyWith(
                        color: color, fontWeight: FontWeight.w800)),
                const SizedBox(height: 1),
                // Distinct colour + weight so a pinned notice never reads as
                // just another chat message.
                Text(
                  text,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
