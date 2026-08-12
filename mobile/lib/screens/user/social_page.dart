// "باشگاه" — chat room and games under one roof.
//
// Chat and games are both *social* features and were competing for two
// separate slots in an already-crowded navigation bar. Merging them behind a
// single segmented switcher frees a slot, keeps related things together, and
// lets a player jump from a match straight into the chat without losing
// their place (both tabs stay alive via IndexedStack).
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import 'chat_page.dart';
import 'games_page.dart';
import 'games/growth_panel.dart';

class SocialPage extends StatefulWidget {
  const SocialPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<SocialPage> createState() => _SocialPageState();
}

class _SocialPageState extends State<SocialPage> {
  int _tab = 0;
  int _growthGeneration = 0;
  GameExternalLaunch? _externalLaunch;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.xs, Gaps.md, Gaps.xs),
          child: _Switcher(
            index: _tab,
            onChanged: (i) => setState(() => _tab = i),
          ),
        ),
        Expanded(
          // IndexedStack (not a swap) so the chat's polling timer and the
          // game's socket survive switching tabs.
          child: IndexedStack(
            index: _tab,
            children: [
              ChatPage(api: widget.api),
              GamesHubPage(api: widget.api, externalLaunch: _externalLaunch),
              SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.xs, Gaps.md, Gaps.xxl),
                child: GrowthPanel(
                  key: ValueKey(_growthGeneration),
                  api: widget.api,
                  onJoinGame: (socket, start) {
                    setState(() {
                      _growthGeneration += 1;
                      _externalLaunch = GameExternalLaunch(
                        socket: socket,
                        start: start,
                        nonce: DateTime.now().microsecondsSinceEpoch,
                      );
                      _tab = 1;
                    });
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Pill-shaped segmented control with a sliding highlight.
class _Switcher extends StatelessWidget {
  const _Switcher({required this.index, required this.onChanged});

  final int index;
  final ValueChanged<int> onChanged;

  static const _items = [
    (icon: Icons.chat_bubble_rounded, label: 'چت'),
    (icon: Icons.sports_esports_rounded, label: 'بازی‌ها'),
    (icon: Icons.rocket_launch_rounded, label: 'ماموریت و دوستان'),
  ];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            scheme.surfaceContainerHighest.withValues(alpha: 0.78),
            Color.lerp(scheme.surfaceContainer, BrandColors.blue, 0.08)!,
          ],
        ),
        borderRadius: Corners.rPill,
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: BrandColors.emerald.withValues(alpha: 0.08),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth / _items.length;
          return Stack(
            children: [
              AnimatedAlign(
                duration: Motion.normal,
                curve: Curves.easeOutCubic,
                alignment: switch (index) {
                  0 => Alignment.centerRight,
                  1 => Alignment.center,
                  _ => Alignment.centerLeft,
                },
                child: Container(
                  width: w,
                  height: double.infinity,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [BrandColors.emerald, BrandColors.blue],
                    ),
                    borderRadius: Corners.rPill,
                    boxShadow: [
                      BoxShadow(
                        color: scheme.primary.withValues(alpha: 0.35),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                ),
              ),
              Row(
                children: [
                  for (var i = 0; i < _items.length; i++)
                    Expanded(
                      child: InkWell(
                        borderRadius: Corners.rPill,
                        onTap: () => onChanged(i),
                        child: Center(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _items[i].icon,
                                size: 17,
                                color: index == i
                                    ? scheme.onPrimary
                                    : scheme.onSurfaceVariant,
                              ),
                              Gaps.hXxs,
                              Text(
                                _items[i].label,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: index == i
                                      ? scheme.onPrimary
                                      : scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
