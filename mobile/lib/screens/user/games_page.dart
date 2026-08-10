// Games hub with 3 Stake Categories + Tap Game Standalone on Top
import 'dart:async';

import 'package:flutter/material.dart';
import '../../api_client.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/level_badge.dart';
import 'games/reversi_board.dart';
import 'games/memory_board.dart';
import 'games/penalty_board.dart';
import 'games/tap/tap_screen.dart';
import 'games/card_duel_page.dart';
import 'games/private_match_dialog.dart';

class _GameEntry {
  const _GameEntry(
    this.id,
    this.title,
    this.subtitle,
    this.emoji,
    this.accent,
    this.art, {
    this.bot = true,
    this.solo = false,
  });
  final String id;
  final String title;
  final String subtitle;
  final String emoji;
  final Color accent;
  final String art;
  final bool bot;
  final bool solo;
}

const _games = <_GameEntry>[
  _GameEntry('tap', 'ضربه‌زن', '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', 'assets/games/tap/skin_1.webp',
      Color(0xFF84CC16), 'assets/games/tap/skin_1.webp'),
  _GameEntry('penalty', 'ضربات پنالتی', 'شوت دقیق و مهار دروازه‌بان ۲۰۲۸', 'assets/pass/football_icon.webp',
      Color(0xFF38BDF8), 'assets/games/penalty.webp'),
  _GameEntry('card_duel', 'دوئل کارت‌ها', 'نبرد سه‌کارتی و استات‌های Ghost',
      'assets/games/card_duel_glow.png', Color(0xFFFFD166), 'assets/games/card_duel_glow.png',
      bot: true, solo: true),
  _GameEntry('memory', 'جفت‌یاب', 'جفت‌های فوتبالی را به خاطر بسپار', 'assets/games/memory/medal.webp',
      Color(0xFFA855F7), 'assets/games/memory.webp',
      bot: true, solo: true),
  _GameEntry('reversi', 'اتللو', 'مهره‌ها را برگردان و تخته را فتح کن', 'assets/games/reversi.webp', Color(0xFF34D399),
      'assets/games/reversi.webp'),
];

List<_GameEntry> get _multiplayerGames => _games.where((g) => g.id != 'tap').toList();

class GamesHubPage extends StatefulWidget {
  const GamesHubPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<GamesHubPage> createState() => _GamesHubPageState();
}

class _GamesHubPageState extends State<GamesHubPage> {
  String? _active;
  int _selectedStake = 100; // 100, 1000, or 0 (تمرین با ربات)
  Map<String, dynamic>? _level;

  @override
  void initState() {
    super.initState();
    unawaited(_loadLevel());
  }

  Future<void> _loadLevel() async {
    try {
      final d = await widget.api.get('/api/level');
      if (!mounted || d is! Map) return;
      setState(() => _level = Map<String, dynamic>.from(d));
    } catch (_) {}
  }

  void _back() {
    setState(() => _active = null);
    unawaited(_loadLevel());
  }

  @override
  Widget build(BuildContext context) {
    switch (_active) {
      case 'tap':
        return TapGameScreen(api: widget.api, onBack: _back);
      case 'memory':
        return MemoryScreen(api: widget.api, onBack: _back);
      case 'reversi':
        return ReversiScreen(api: widget.api, onBack: _back);
      case 'penalty':
        return PenaltyScreen(api: widget.api, onBack: _back);
      case 'card_duel':
        return CardDuelPage(api: widget.api, onBack: _back);
    }

    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(Gaps.md),
          decoration: BoxDecoration(
            borderRadius: Corners.rXl,
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [Color(0xFF16345F), Color(0xFF071521)],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            boxShadow: [
              BoxShadow(
                color: BrandColors.blue.withValues(alpha: 0.12),
                blurRadius: 26,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Row(
            children: [
              Image.asset('assets/games/play_glow.png', width: 58, height: 58, cacheWidth: 150),
              Gaps.hSm,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('باشگاه بازی‌های قلقلی',
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        )),
                    const SizedBox(height: 3),
                    Text(
                      'مسابقات آنلاین با امتیاز، نبرد با دوستان و ارتقای لول',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.72),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Gaps.vSm,
        if (_level != null)
          LevelCard(
            level: (_level!['level'] as num?)?.toInt() ?? 0,
            into: (_level!['into'] as num?)?.toInt() ?? 0,
            needed: (_level!['needed'] as num?)?.toInt() ?? 0,
            progress: (_level!['progress'] as num?)?.toDouble() ?? 0,
            isMax: _level!['isMax'] == true,
            xp: (_level!['xp'] as num?)?.toInt() ?? 0,
          ),
        Gaps.vSm,

        // ── ۱. بازی ضربه‌زن: بالای صفحه و مستقل ──
        _TapGameHeroCard(
          onTap: () => setState(() => _active = 'tap'),
        ),
        Gaps.vMd,

        // ── ۲. سه دسته‌بندی مسابقات (۱۰۰ امتیاز، ۱۰۰۰ امتیاز، تمرین با ربات) ──
        const Text(
          'سطح مسابقه:',
          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: Color(0xFFF1F5F9)),
        ),
        Gaps.vXs,
        Row(
          children: [
            Expanded(
              child: _ModePill(
                title: '۱۰۰',
                subtitle: '۱۰٪ کارمزد',
                icon: Icons.bolt_rounded,
                selected: _selectedStake == 100,
                color: const Color(0xFF38BDF8),
                onTap: () => setState(() => _selectedStake = 100),
              ),
            ),
            Gaps.hXs,
            Expanded(
              child: _ModePill(
                title: '۱۰۰۰',
                subtitle: '۱۰٪ کارمزد',
                icon: Icons.stars_rounded,
                selected: _selectedStake == 1000,
                color: const Color(0xFFFFD166),
                onTap: () => setState(() => _selectedStake = 1000),
              ),
            ),
            Gaps.hXs,
            Expanded(
              child: _ModePill(
                title: 'ربات',
                subtitle: 'تمرین',
                icon: Icons.smart_toy_rounded,
                selected: _selectedStake == 0,
                color: const Color(0xFF22E7A6),
                onTap: () => setState(() => _selectedStake = 0),
              ),
            ),
          ],
        ),
        Gaps.vSm,

        // Info Banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: Colors.white.withValues(alpha: 0.04),
            border: Border.all(color: Colors.white12),
          ),
          child: Row(
            children: [
              Icon(
                _selectedStake == 0 ? Icons.info_outline_rounded : Icons.timer_outlined,
                size: 16,
                color: _selectedStake == 1000 ? const Color(0xFFFFD166) : (_selectedStake == 100 ? const Color(0xFF38BDF8) : const Color(0xFF22E7A6)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _selectedStake == 0
                      ? 'تمرین رایگان با هوش مصنوعی بدون کسر امتیاز (آماده‌سازی برای مسابقات)'
                      : '۳۰ ثانیه جستجوی حریف آنلاین · ۱۰٪ کارمزد مسابقه کسر و برنده تمام پات را می‌برد!',
                  style: const TextStyle(fontSize: 11, color: Color(0xFFCBD5E1), fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
        Gaps.vMd,

        // ── ۳. فهرست بازی‌های مسابقه‌ای ──
        for (final g in _multiplayerGames) ...[
          _StakedGameTile(
            entry: g,
            stake: _selectedStake,
            onTap: () => setState(() => _active = g.id),
          ),
          Gaps.vSm,
        ],

        Gaps.vSm,
        // ── ۴. دوئل ۱ به ۱ با دوستان ──
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => PrivateMatchDialog.show(
            context,
            api: widget.api,
            onJoinRoom: (gameId, roomCode) {
              setState(() => _active = gameId);
            },
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: const LinearGradient(
                colors: [Color(0xFF064E3B), Color(0xFF0F172A)],
              ),
              border: Border.all(color: const Color(0xFF22E7A6).withValues(alpha: 0.5)),
            ),
            child: const Row(
              children: [
                Icon(Icons.person_add_alt_1_rounded, color: Color(0xFF22E7A6), size: 24),
                SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('دوئل مستقیم با دوست (کد اتاق / لینک)',
                          style: TextStyle(fontWeight: FontWeight.w900, color: Colors.white, fontSize: 13)),
                      Text('اتاق خصوصی بساز و دوستانت را به چالش بکش',
                          style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 10.5)),
                    ],
                  ),
                ),
                Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Color(0xFF22E7A6)),
              ],
            ),
          ),
        ),
        Gaps.vLg,
      ],
    );
  }
}

class _ModePill extends StatelessWidget {
  const _ModePill({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  final String title, subtitle;
  final IconData icon;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: selected ? color.withValues(alpha: 0.20) : Colors.white.withValues(alpha: 0.04),
          border: Border.all(color: selected ? color : Colors.white12, width: selected ? 1.8 : 1),
          boxShadow: selected ? [BoxShadow(color: color.withValues(alpha: 0.25), blurRadius: 10)] : null,
        ),
        child: Column(
          children: [
            Icon(icon, size: 18, color: selected ? color : Colors.white70),
            const SizedBox(height: 3),
            Text(title, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: selected ? Colors.white : Colors.white70)),
            Text(subtitle, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: selected ? color : Colors.white54)),
          ],
        ),
      ),
    );
  }
}

class _TapGameHeroCard extends StatelessWidget {
  const _TapGameHeroCard({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0xFF2E5B09), Color(0xFF132A04), Color(0xFF0B1702)],
          ),
          border: Border.all(color: const Color(0xFF84CC16).withValues(alpha: 0.6), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF84CC16).withValues(alpha: 0.25),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            Image.asset('assets/games/tap/skin_1.webp', width: 56, height: 56, cacheWidth: 150),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('بازی ضربه‌زن (تک‌نفره)', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white)),
                      SizedBox(width: 6),
                      DecoratedBox(
                        decoration: BoxDecoration(color: Color(0xFF84CC16), borderRadius: BorderRadius.all(Radius.circular(6))),
                        child: Padding(
                          padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          child: Text('۵۰ لول', style: TextStyle(color: Color(0xFF1E0A00), fontSize: 9.5, fontWeight: FontWeight.w900)),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 3),
                  Text('ضربه بزن، شخصیت‌های مخفی را باز کن و امتیاز بگیر', style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 11)),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios_rounded, size: 16, color: Color(0xFF84CC16)),
          ],
        ),
      ),
    );
  }
}

class _StakedGameTile extends StatelessWidget {
  const _StakedGameTile({required this.entry, required this.stake, required this.onTap});
  final _GameEntry entry;
  final int stake;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final winPoints = stake == 1000 ? 1800 : (stake == 100 ? 180 : 0);

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: AppCard(
        padding: EdgeInsets.zero,
        child: ClipRRect(
          borderRadius: Corners.rXl,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                children: [
                  AspectRatio(
                    aspectRatio: 16 / 5.6,
                    child: Image.asset(
                      entry.art,
                      fit: BoxFit.cover,
                      cacheWidth: 720,
                      errorBuilder: (_, __, ___) => Container(
                        color: entry.accent.withValues(alpha: 0.18),
                        alignment: Alignment.center,
                        child: Image.asset(entry.emoji, width: 56, height: 56, fit: BoxFit.contain),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Colors.black.withValues(alpha: 0.75)],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    right: Gaps.md,
                    bottom: Gaps.xs,
                    left: Gaps.md,
                    child: Row(
                      children: [
                        Image.asset(entry.emoji, width: 26, height: 26, fit: BoxFit.contain),
                        Gaps.hXs,
                        Expanded(
                          child: Text(
                            entry.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(Gaps.sm),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(entry.subtitle, style: theme.textTheme.bodySmall),
                          Gaps.vXs,
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  borderRadius: Corners.rPill,
                                  color: stake == 0 ? const Color(0xFF22E7A6).withValues(alpha: 0.15) : const Color(0xFFFFD166).withValues(alpha: 0.18),
                                  border: Border.all(color: stake == 0 ? const Color(0xFF22E7A6) : const Color(0xFFFFD166)),
                                ),
                                child: Text(
                                  stake == 0 ? 'تمرین با هوش مصنوعی' : 'جایزه برنده: ${faNum(winPoints)} امتیاز',
                                  style: TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w900,
                                    color: stake == 0 ? const Color(0xFF22E7A6) : const Color(0xFFFFD166),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Image.asset('assets/games/play_glow.png', width: 36, height: 36, cacheWidth: 96),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
