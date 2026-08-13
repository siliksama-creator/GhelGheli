import '../../widgets/avatar_image.dart';
// Games hub with 4 Categories: 100 Points, 1000 Points, Bot Practice (Instant), and Private Rooms / Lobbies (Password & Stake up to 10,000)
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/level_badge.dart';
import 'games/memory_board.dart';
import 'games/penalty_board.dart';
import 'games/tap/tap_screen.dart';
import 'games/card_duel_page.dart';

class _GameEntry {
  const _GameEntry(
    this.id,
    this.title,
    this.subtitle,
    this.emoji,
    this.accent,
    this.art,
  );
  final String id;
  final String title;
  final String subtitle;
  final String emoji;
  final Color accent;
  final String art;
}

const _games = <_GameEntry>[
  _GameEntry('tap', 'ضربه‌زن', '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', 'assets/games/tap/skin_1.webp',
      Color(0xFF84CC16), 'assets/games/tap/skin_1.webp'),
  _GameEntry('penalty', 'ضربات پنالتی', 'شوت دقیق و مهار دروازه‌بان', 'assets/games/penalty_icon.png',
      Color(0xFF38BDF8), 'assets/games/penalty.webp'),
  _GameEntry('card_duel', 'دوئل کارت‌ها', 'نبرد پنج‌راندی و کارت‌های کلکسیونی',
      'assets/games/card_duel_glow.png', Color(0xFFFFD166), 'assets/games/card_duel_glow.png'),
  _GameEntry('memory', 'جفت‌یاب', 'جفت‌های فوتبالی را به خاطر بسپار', 'assets/games/memory/medal.webp',
      Color(0xFFA855F7), 'assets/games/memory.webp'),
];

List<_GameEntry> get _multiplayerGames => _games.where((g) => g.id != 'tap').toList();

class GameExternalLaunch {
  const GameExternalLaunch({required this.socket, required this.start, required this.nonce});
  final io.Socket socket;
  final Map<String, dynamic> start;
  final int nonce;
}

class GamesHubPage extends StatefulWidget {
  const GamesHubPage({super.key, required this.api, this.externalLaunch});
  final ApiClient api;
  final GameExternalLaunch? externalLaunch;

  @override
  State<GamesHubPage> createState() => _GamesHubPageState();
}

class _GamesHubPageState extends State<GamesHubPage> {
  String? _active;
  int _activeStake = 0;
  bool _activeVsBot = false;
  String? _activeRoomCode;
  io.Socket? _activeSocket;
  Map<String, dynamic>? _activeInitialStart;

  // 4 Modes: 100, 1000, 0 (تمرین با ربات), -1 (اتاق خصوصی)
  int _selectedMode = 100;
  Map<String, dynamic>? _level;
  Map<String, dynamic>? _user;
  Map<String, dynamic> _cosmetics = const {};

  @override
  void initState() {
    super.initState();
    unawaited(_loadLevel());
    if (widget.externalLaunch != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _consumeExternal(widget.externalLaunch!));
    }
  }

  @override
  void didUpdateWidget(covariant GamesHubPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.externalLaunch != null &&
        widget.externalLaunch?.nonce != oldWidget.externalLaunch?.nonce) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _consumeExternal(widget.externalLaunch!);
      });
    }
  }

  void _consumeExternal(GameExternalLaunch launch) {
    if (!mounted) return;
    _launchGame(
      '${launch.start['gameId'] ?? 'card_duel'}',
      stake: (launch.start['stake'] as num?)?.toInt() ?? 0,
      existingSocket: launch.socket,
      initialStart: launch.start,
    );
  }

  Future<void> _loadLevel() async {
    try {
      final boot = await widget.api.get('/api/bootstrap');
      if (!mounted || boot is! Map) return;
      final m = Map<String, dynamic>.from(boot);
      setState(() {
        if (m['user'] is Map) _user = Map<String, dynamic>.from(m['user']);
        if (m['cosmetics'] is Map) _cosmetics = Map<String, dynamic>.from(m['cosmetics']);
      });
      final d = await widget.api.get('/api/level');
      if (!mounted || d is! Map) return;
      setState(() => _level = Map<String, dynamic>.from(d));
    } catch (_) {}
  }

  void _back() {
    setState(() {
      _active = null;
      _activeStake = 0;
      _activeVsBot = false;
      _activeRoomCode = null;
      _activeSocket = null;
      _activeInitialStart = null;
    });
    unawaited(_loadLevel());
  }

  void _launchGame(String gameId, {
    int stake = 0,
    bool vsBot = false,
    String? roomCode,
    io.Socket? existingSocket,
    Map<String, dynamic>? initialStart,
  }) {
    setState(() {
      _active = gameId;
      _activeStake = stake;
      _activeVsBot = vsBot;
      _activeRoomCode = roomCode;
      _activeSocket = existingSocket;
      _activeInitialStart = initialStart;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_active != null) {
      switch (_active) {
        case 'tap':
          return TapGameScreen(api: widget.api, onBack: _back);
        case 'memory':
          return MemoryScreen(
            api: widget.api,
            onBack: _back,
            stake: _activeStake,
            vsBot: _activeVsBot,
            roomCode: _activeRoomCode,
            existingSocket: _activeSocket,
            initialStart: _activeInitialStart,
          );
        case 'penalty':
          return PenaltyScreen(
            api: widget.api,
            onBack: _back,
            stake: _activeStake,
            vsBot: _activeVsBot,
            roomCode: _activeRoomCode,
            existingSocket: _activeSocket,
            initialStart: _activeInitialStart,
          );
        case 'card_duel':
          return CardDuelPage(
            api: widget.api,
            onBack: _back,
            stake: _activeStake,
            vsBot: _activeVsBot,
            roomCode: _activeRoomCode,
            existingSocket: _activeSocket,
            initialStart: _activeInitialStart,
          );
      }
    }

    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        // Header ترکیبی: پروفایل + توضیح XP + نوار لول (۲ باکس قبلی ترکیب شدند)
        Container(
          padding: const EdgeInsets.all(Gaps.md),
          decoration: BoxDecoration(
            borderRadius: Corners.rXl,
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [Color(0xFF16345F), Color(0xFF071521)],
            ),
            border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.35)),
            boxShadow: [
              BoxShadow(
                color: BrandColors.blue.withValues(alpha: 0.16),
                blurRadius: 26,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CosmeticAvatarFrame(
                    frame: _cosmetics['frame'] as String?,
                    padding: 3,
                    child: AvatarImage(
                      keyName: _user?['profile_avatar_key'],
                      imageUrl: _user?['profile_image_url'],
                      radius: 26,
                      ring: true,
                    ),
                  ),
                  Gaps.hSm,
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: DisplayName(
                                name: _user?['nickname'] ?? 'قهرمان قلقلی',
                                cosmetics: _cosmetics,
                                level: (_level?['level'] as num?)?.toInt(),
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                borderRadius: Corners.rPill,
                                color: const Color(0xFFFFD166).withValues(alpha: 0.18),
                                border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: 0.6)),
                              ),
                              child: Text(
                                '${faNum(_user?['current_points'] ?? 0)} امتیاز',
                                style: const TextStyle(
                                  color: Color(0xFFFFD166),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'آنلاین بازی کن، XP بگیر',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: const Color(0xFFE2E8F0),
                            fontSize: 11,
                            height: 1.4,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (_level != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: Colors.white.withValues(alpha: 0.05),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Builder(builder: (_) {
                    final lvl = (_level!['level'] as num?)?.toInt() ?? 0;
                    final into = (_level!['into'] as num?)?.toInt() ?? 0;
                    final needed = (_level!['needed'] as num?)?.toInt() ?? 0;
                    final progress = (_level!['progress'] as num?)?.toDouble() ?? 0;
                    final isMax = _level!['isMax'] == true;
                    String tierLabel = 'تازه‌کار';
                    Color tierColor = theme.colorScheme.primary;
                    if (lvl >= 90) { tierLabel = 'افسانه‌ای'; tierColor = const Color(0xFFA855F7); }
                    else if (lvl >= 60) { tierLabel = 'طلایی'; tierColor = const Color(0xFFFFD166); }
                    else if (lvl >= 30) { tierLabel = 'نقره‌ای'; tierColor = const Color(0xFF38BDF8); }
                    else if (lvl >= 10) { tierLabel = 'برنزی'; tierColor = const Color(0xFF22E7A6); }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            LevelBadge(level: lvl, compact: false),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                tierLabel,
                                style: theme.textTheme.labelLarge?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: tierColor,
                                ),
                              ),
                            ),
                            if (isMax)
                              Icon(Icons.emoji_events_rounded, size: 18, color: tierColor)
                            else
                              Text(
                                '${faNum(into)} / ${faNum(needed)}',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: Colors.white.withValues(alpha: 0.7),
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: Stack(
                            children: [
                              Container(height: 7, color: Colors.white.withValues(alpha: 0.10)),
                              FractionallySizedBox(
                                widthFactor: isMax ? 1.0 : progress.clamp(0.0, 1.0),
                                child: Container(
                                  height: 7,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(colors: [tierColor.withValues(alpha: 0.65), tierColor]),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    );
                  }),
                ),
              ],
            ],
          ),
        ),
        Gaps.vSm,

        // ── ۱. بازی ضربه‌زن: بالای صفحه و مستقل ──
        _TapGameHeroCard(
          onTap: () => setState(() => _active = 'tap'),
        ),
        Gaps.vMd,

        // ── ۲. انتخاب حالت بازی (۴ حالت: ۱۰۰، ۱۰۰۰، تمرین با ربات، اتاق خصوصی) ──
        const Text(
          'حالت مسابقه:',
          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: Color(0xFFF1F5F9)),
        ),
        Gaps.vXs,
        // ── چرا Key دارد ──
        // نگهبانِ `exhaustive_actions_2028_test` باید بتواند «نوارِ
        // انتخابِ حالت» را از بقیهٔ صفحه جدا کند. بدونِ کلید، تست
        // مجبور بود متن را در کلِ صفحه بشمارد — و وقتی کاشی‌ها مربعی
        // شدند و نشانِ حالت را هم نشان دادند، شکست.
        Row(
          key: const Key('gameModeBar'),
          children: [
            Expanded(
              child: _ModePill(
                title: '۱۰۰ امتیاز',
                icon: Icons.bolt_rounded,
                selected: _selectedMode == 100,
                color: const Color(0xFF38BDF8),
                onTap: () => setState(() => _selectedMode = 100),
              ),
            ),
            Gaps.hXs,
            Expanded(
              child: _ModePill(
                title: '۱۰۰۰ امتیاز',
                icon: Icons.stars_rounded,
                selected: _selectedMode == 1000,
                color: const Color(0xFFFFD166),
                onTap: () => setState(() => _selectedMode = 1000),
              ),
            ),
            Gaps.hXs,
            Expanded(
              child: _ModePill(
                title: 'تمرین با ربات',
                icon: Icons.smart_toy_rounded,
                selected: _selectedMode == 0,
                color: const Color(0xFF22E7A6),
                onTap: () => setState(() => _selectedMode = 0),
              ),
            ),
            Gaps.hXs,
            Expanded(
              child: _ModePill(
                title: 'اتاق خصوصی',
                icon: Icons.meeting_room_rounded,
                selected: _selectedMode == -1,
                color: const Color(0xFFA855F7),
                onTap: () => setState(() => _selectedMode = -1),
              ),
            ),
          ],
        ),
        Gaps.vSm,
        _StakeRulesBanner(mode: _selectedMode),
        Gaps.vMd,

        // ── ۳. محتوای حالت انتخاب شده ──
        if (_selectedMode == -1) ...[
          // ── بخش اتاق خصوصی و لابی‌ها (بدون نیاز به اشتراک، با قفل و پسورد) ──
          _PrivateLobbyHub(
            api: widget.api,
            currentPoints: (_user?['current_points'] as num?)?.toInt() ?? 0,
            onJoinGame: (gameId, stake, roomCode, existingSocket, initialStart) {
              _launchGame(
                gameId,
                stake: stake,
                vsBot: false,
                roomCode: roomCode,
                existingSocket: existingSocket,
                initialStart: initialStart,
              );
            },
          ),
        ] else ...[
          // ── فهرست بازی‌های مسابقه‌ای یا تمرین با ربات ──
          //
          // ── خواستهٔ مالک ──
          //
          //   «بجای اینکه بنر بازی‌ها واید باشه بهتره باکس مربعی باشن
          //    که انقدر نیاز به اسکرول نباشه»
          //
          // قبلاً هر بازی یک بنرِ تمام‌عرض بود که روی هم چیده می‌شدند.
          // با شبکهٔ دوستونیِ مربع، سه بازی در **دو ردیف** جا می‌شوند.
          //
          // ⚠️ `shrinkWrap` + `NeverScrollableScrollPhysics` لازم است
          //    چون این شبکه داخلِ یک `ListView` است. بدونِ آن‌ها یا
          //    خطای ارتفاعِ نامحدود می‌گیریم یا دو اسکرولِ تودرتو که
          //    روی گوشی حس می‌شود.
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: Gaps.sm,
            mainAxisSpacing: Gaps.sm,
            childAspectRatio: 1,
            children: [
              for (final g in _multiplayerGames)
                _CleanGameTile(
                  entry: g,
                  mode: _selectedMode,
                  onTap: () {
                    if (_selectedMode > 0 &&
                        ((_user?['current_points'] as num?)?.toInt() ?? 0) < _selectedMode) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(
                          'برای این مسابقه حداقل ${faNum(_selectedMode)} امتیاز لازم داری',
                        ),
                      ));
                      return;
                    }
                    if (_selectedMode == 0) {
                      // تمرین مستقیم با ربات؛ بدون صف و بدون جابه‌جایی امتیاز.
                      _launchGame(g.id, stake: 0, vsBot: true);
                    } else {
                      // مسابقه آنلاین با بازیکن واقعی (بدون ربات)
                      _launchGame(g.id, stake: _selectedMode, vsBot: false);
                    }
                  },
                ),
            ],
          ),
        ],

        Gaps.vLg,
      ],
    );
  }
}

/// قانون مالی هر حالت، درست کنار انتخاب حالت؛ کاربر قبل از ورود دقیقاً
/// می‌فهمد چه مقدار لازم دارد و در صورت باخت چه اتفاقی می‌افتد.
class _StakeRulesBanner extends StatelessWidget {
  const _StakeRulesBanner({required this.mode});
  final int mode;

  @override
  Widget build(BuildContext context) {
    final isPractice = mode == 0;
    final isLobby = mode == -1;
    final color = isPractice
        ? const Color(0xFF22E7A6)
        : isLobby
            ? const Color(0xFFA855F7)
            : mode == 1000
                ? const Color(0xFFFFD166)
                : const Color(0xFF38BDF8);
    final title = isPractice
        ? 'تمرین رایگان؛ بدون ریسک امتیاز'
        : isLobby
            ? 'در لابی، سازنده مقدار ورودی را انتخاب می‌کند'
            : 'برای ورود حداقل ${faNum(mode)} امتیاز لازم داری';
    final description = isPractice
        ? 'بدون اثر روی موجودی و لیگ.'
        : isLobby
            ? 'ورودی امتیازی تا پایان بازی امن می‌ماند.'
            : 'باخت: −${faNum(mode)} · برد: پات پس از ۱۰٪ کارمزد.';
    return Container(
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        gradient: LinearGradient(colors: [
          color.withValues(alpha: 0.16),
          Theme.of(context).colorScheme.surfaceContainer.withValues(alpha: 0.72),
        ]),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.15),
            ),
            child: Icon(
              isPractice
                  ? Icons.smart_toy_rounded
                  : isLobby
                      ? Icons.lock_rounded
                      : Icons.warning_amber_rounded,
              color: color,
              size: 21,
            ),
          ),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: color,
                          fontWeight: FontWeight.w900,
                        )),
                const SizedBox(height: 2),
                Text(description,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          height: 1.55,
                          color: Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withValues(alpha: 0.68),
                        )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// دکمه‌های انتخاب حالت (۴ قرص انتخابی)
class _ModePill extends StatelessWidget {
  const _ModePill({
    required this.title,
    required this.icon,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  final String title;
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
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: selected ? color.withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.04),
          border: Border.all(color: selected ? color : Colors.white12, width: selected ? 1.8 : 1),
          boxShadow: selected ? [BoxShadow(color: color.withValues(alpha: 0.25), blurRadius: 10)] : null,
        ),
        child: Column(
          children: [
            Icon(icon, size: 20, color: selected ? color : Colors.white70),
            const SizedBox(height: 4),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w900,
                color: selected ? Colors.white : Colors.white70,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// بنر ضربه‌زن در بالای صفحه
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

/// کارت تمیز بازی‌های ۱۰۰، ۱۰۰۰ و تمرین با ربات (بدون زیرنویس‌های شلوغ)
/// کاشیِ مربعیِ بازی.
///
/// ── خواستهٔ مالک ──
///
///   «بجای اینکه بنر بازی‌ها واید باشه بهتره باکس مربعی باشن که انقدر
///    نیاز به اسکرول نباشه»
///
/// نسخهٔ قبل `AspectRatio(16/5.6)` داشت — یعنی بنرِ پهن. داخلِ یک خانهٔ
/// مربعیِ شبکه، آن نسبت یعنی تصویر فقط نوارِ باریکی از بالا را می‌گیرد و
/// بقیهٔ مربع خالی می‌ماند.
///
/// حالا تصویر با `Expanded` تمامِ فضای باقی‌مانده را پر می‌کند و متن
/// روی گرادیانِ پایینش می‌نشیند — همان چیدمانی که در وب هم پیاده شد تا
/// دو کلاینت یکی باشند.
class _CleanGameTile extends StatelessWidget {
  const _CleanGameTile({
    required this.entry,
    required this.mode,
    required this.onTap,
  });

  final _GameEntry entry;
  final int mode; // 100, 1000, 0
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isBot = mode == 0;
    final modeColor = isBot
        ? const Color(0xFF22E7A6)
        : (mode == 1000 ? const Color(0xFFFFD166) : const Color(0xFF38BDF8));

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: entry.accent.withValues(alpha: 0.30)),
          color: const Color(0xFF0B1622),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // تصویر، تمامِ مربع
            Image.asset(
              entry.art,
              fit: BoxFit.cover,
              cacheWidth: 460,
              errorBuilder: (_, __, ___) => Container(
                color: entry.accent.withValues(alpha: 0.18),
                alignment: Alignment.center,
                child: Image.asset(entry.emoji, width: 48, height: 48, fit: BoxFit.contain),
              ),
            ),
            // گرادیانِ پایین تا متن خوانا بماند
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0xE6050B13), Color(0xF7050B13)],
                  stops: [0.34, 0.70, 1.0],
                ),
              ),
            ),
            // نشانِ حالت، بالا
            Positioned(
              top: 7,
              right: 7,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: Corners.rPill,
                  color: const Color(0xCC050B13),
                  border: Border.all(color: modeColor),
                ),
                child: Text(
                  isBot ? 'تمرین' : '${faNum(mode)} امتیاز',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: modeColor,
                  ),
                ),
              ),
            ),
            // متن و دکمه، پایین
            Positioned(
              left: 9,
              right: 9,
              bottom: 9,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Image.asset(entry.emoji, width: 20, height: 20,
                          fit: BoxFit.contain, cacheWidth: 60),
                      Gaps.hXs,
                      Expanded(
                        child: Text(
                          entry.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    entry.subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11.5,
                      height: 1.4,
                      color: Colors.white.withValues(alpha: 0.72),
                    ),
                  ),
                  const SizedBox(height: 7),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      color: entry.accent,
                    ),
                    child: const Text(
                      'شروع',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF04101C),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrivateLobbyHub extends StatefulWidget {
  const _PrivateLobbyHub({
    required this.api,
    required this.currentPoints,
    required this.onJoinGame,
  });

  final ApiClient api;
  final int currentPoints;
  final void Function(
    String gameId,
    int stake,
    String? roomCode,
    io.Socket? existingSocket,
    Map<String, dynamic>? initialStart,
  ) onJoinGame;

  @override
  State<_PrivateLobbyHub> createState() => _PrivateLobbyHubState();
}

class _PrivateLobbyHubState extends State<_PrivateLobbyHub> {
  io.Socket? _socket;
  List<Map<String, dynamic>> _lobbies = [];
  bool _loadingLobbies = true;
  bool _socketTransferred = false;

  String _selectedGame = 'penalty';
  int _stake = 500;
  final _passCtrl = TextEditingController();
  final _joinCodeCtrl = TextEditingController();

  final _games = const [
    ('penalty', 'ضربات پنالتی', 'assets/pass/football_icon.webp'),
    ('card_duel', 'دوئل کارت‌ها', 'assets/games/card_duel_glow.png'),
    ('memory', 'جفت‌یاب', 'assets/games/memory/medal.webp'),
  ];

  final _presetStakes = const [0, 100, 1000, 5000];

  @override
  void initState() {
    super.initState();
    _initSocket();
  }

  void _initSocket() {
    try {
      final s = io.io(
        widget.api.baseUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': widget.api.token})
            .enableForceNew()
            .build(),
      );
      _socket = s;

      s.onConnect((_) {
        s.emit('game:lobby_list');
      });

      s.on('game:lobby_list', (data) {
        if (!mounted || data is! List) return;
        setState(() {
          _lobbies = data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          _loadingLobbies = false;
        });
      });

      s.on('game:lobby_updated', (_) {
        s.emit('game:lobby_list');
      });

      s.on('game:error', (data) {
        if (!mounted) return;
        final message = data is Map && data['message'] != null
            ? '${data['message']}'
            : 'عملیات اتاق ناموفق بود';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      });

      s.on('game:lobby_created', (data) {
        if (!mounted) return;
        final message = data is Map && data['message'] != null
            ? '${data['message']}'
            : 'لابی ساخته شد؛ منتظر حریف بمان';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
      });

      s.on('game:start', (data) {
        if (!mounted || data is! Map) return;
        final start = Map<String, dynamic>.from(data);
        final gameId = '${start['gameId'] ?? _selectedGame}';
        final stake = (start['stake'] as num?)?.toInt() ?? 0;

        // Ownership now moves to GameSession. Remove bootstrap/list listeners
        // first, otherwise a reconnect during play would request lobby data or
        // repeat create/join on the same game socket.
        for (final event in [
          'connect', 'game:lobby_list', 'game:lobby_updated',
          'game:error', 'game:lobby_created', 'game:start',
        ]) {
          s.off(event);
        }
        _socketTransferred = true;
        widget.onJoinGame(gameId, stake, null, s, start);
      });
    } catch (_) {
      if (mounted) setState(() => _loadingLobbies = false);
    }
  }

  @override
  void dispose() {
    if (!_socketTransferred) _socket?.dispose();
    _passCtrl.dispose();
    _joinCodeCtrl.dispose();
    super.dispose();
  }

  void _createLobby() {
    if (_stake > widget.currentPoints) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('برای این لابی حداقل ${faNum(_stake)} امتیاز لازم داری'),
      ));
      return;
    }
    final pass = _passCtrl.text.trim();
    _socket?.emit('game:create_lobby', {
      'gameId': _selectedGame,
      'stake': _stake,
      'password': pass,
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('لابی شما ساخته شد و در لیست اتاق‌ها قرار گرفت')),
    );
  }

  void _promptPasswordAndJoin(Map<String, dynamic> lobby) {
    final hasPass = lobby['hasPassword'] == true;
    final lobbyId = lobby['lobbyId'] as String? ?? '';
    final stake = (lobby['stake'] as num?)?.toInt() ?? 100;

    if (stake > widget.currentPoints) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('برای این مسابقه حداقل ${faNum(stake)} امتیاز لازم داری'),
      ));
      return;
    }

    if (!hasPass) {
      _socket?.emit('game:join_lobby', {'lobbyId': lobbyId});
      return;
    }

    final passCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.lock_rounded, color: Color(0xFFFFD166), size: 20),
            SizedBox(width: 8),
            Text('اتاق دارای رمز عبور است', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
          ],
        ),
        content: TextField(
          controller: passCtrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'رمز عبور اتاق را وارد کنید'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('انصراف')),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              _socket?.emit('game:join_lobby', {
                'lobbyId': lobbyId,
                'password': passCtrl.text.trim(),
              });
            },
            child: const Text('ورود به اتاق'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── ۱. فرم ساخت لابی جدید ──
        Container(
          padding: const EdgeInsets.all(Gaps.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2E1065), Color(0xFF0F172A)],
            ),
            border: Border.all(color: const Color(0xFFA855F7).withValues(alpha: 0.5)),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFA855F7).withValues(alpha: 0.20),
                blurRadius: 16,
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.add_circle_outline_rounded, color: Color(0xFFA855F7), size: 22),
                  SizedBox(width: 8),
                  Text(
                    'ساخت اتاق و لابی اختصاصی',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14.5, color: Colors.white),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Game picker
              Row(
                children: [
                  for (final g in _games)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => setState(() => _selectedGame = g.$1),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              color: _selectedGame == g.$1
                                  ? const Color(0xFFA855F7).withValues(alpha: 0.35)
                                  : Colors.white.withValues(alpha: 0.05),
                              border: Border.all(
                                color: _selectedGame == g.$1 ? const Color(0xFFA855F7) : Colors.white12,
                              ),
                            ),
                            child: Column(
                              children: [
                                Image.asset(g.$3, width: 22, height: 22, fit: BoxFit.contain),
                                const SizedBox(height: 3),
                                Text(
                                  g.$2,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.w800,
                                    color: _selectedGame == g.$1 ? Colors.white : Colors.white70,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),

              // Stake presets (Up to 10,000)
              const Text('تعیین امتیاز مسابقه:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11.5, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final s in _presetStakes)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: ChoiceChip(
                          label: Text(s == 0 ? 'رایگان' : faNum(s), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
                          selected: _stake == s,
                          selectedColor: const Color(0xFFA855F7),
                          onSelected: (val) {
                            if (val) setState(() => _stake = s);
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // Password field (Optional)
              TextField(
                controller: _passCtrl,
                decoration: const InputDecoration(
                  hintText: 'رمز عبور اتاق (اختیاری)',
                  prefixIcon: Icon(Icons.lock_outline_rounded, size: 18),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
              ),
              const SizedBox(height: 12),

              FilledButton.icon(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(46),
                  backgroundColor: const Color(0xFFA855F7),
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.rocket_launch_rounded, size: 18),
                label: const Text('ساخت لابی و ثبت در لیست اتاق‌ها', style: TextStyle(fontWeight: FontWeight.w900)),
                onPressed: _createLobby,
              ),
            ],
          ),
        ),

        Gaps.vMd,

        // ── ۲. لیست لابی‌های فعال ──
        Row(
          children: [
            const Icon(Icons.format_list_bulleted_rounded, size: 18, color: Color(0xFF38BDF8)),
            const SizedBox(width: 6),
            const Text(
              'اتاق‌ها و لابی‌های آماده بازی:',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: Colors.white),
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh_rounded, size: 18),
              onPressed: () => _socket?.emit('game:lobby_list'),
            ),
          ],
        ),
        const SizedBox(height: 6),

        if (_loadingLobbies)
          const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
        else if (_lobbies.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: Colors.white.withValues(alpha: 0.04),
              border: Border.all(color: Colors.white12),
            ),
            child: const Center(
              child: Text(
                'در حال حاضر اتاقی وجود ندارد. اولین لابی را بسازید!',
                style: TextStyle(color: Colors.white60, fontSize: 12),
              ),
            ),
          )
        else
          for (final l in _lobbies) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: const Color(0xFF1E293B),
                border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.06),
                    ),
                    child: Center(
                      child: Icon(
                        l['hasPassword'] == true ? Icons.lock_rounded : Icons.sports_esports_rounded,
                        color: l['hasPassword'] == true ? const Color(0xFFFFD166) : const Color(0xFF38BDF8),
                        size: 20,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              l['hostName'] ?? 'کاربر',
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Colors.white),
                            ),
                            if (l['hasPassword'] == true) ...[
                              const SizedBox(width: 4),
                              const Icon(Icons.lock_rounded, size: 13, color: Color(0xFFFFD166)),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'بازی: ${l['gameId']} · ${l['stake'] == 0 ? 'رایگان' : '${faNum(l['stake'] ?? 100)} امتیاز'}',
                          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF22E7A6),
                      foregroundColor: const Color(0xFF00281D),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      minimumSize: Size.zero,
                    ),
                    onPressed: () => _promptPasswordAndJoin(l),
                    child: const Text('پیوستن', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                  ),
                ],
              ),
            ),
          ],

        Gaps.vMd,

        // ── ۳. ورود مستقیم با کد اتاق ──
        Container(
          padding: const EdgeInsets.all(Gaps.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            color: Colors.white.withValues(alpha: 0.04),
            border: Border.all(color: Colors.white12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'ورود مستقیم با کد اتاق دوست:',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Colors.white),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _joinCodeCtrl,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 3),
                      decoration: const InputDecoration(
                        hintText: 'کد ۴ رقمی',
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(80, 46)),
                    onPressed: () {
                      final code = _joinCodeCtrl.text.trim();
                      if (code.isNotEmpty) {
                        // gameId واقعی را از game:start می‌گیریم؛ انتخابِ
                        // محلی ممکن است با اتاق دوست فرق داشته باشد.
                        _socket?.emit('game:join_room', {'roomCode': code});
                      }
                    },
                    child: const Text('ورود'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
