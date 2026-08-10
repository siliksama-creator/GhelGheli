// Games hub with 4 Categories: 100 Points, 1000 Points, Bot Practice (Instant), and Private Rooms / Lobbies (Password & Stake up to 10,000)
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/level_badge.dart';
import 'games/reversi_board.dart';
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
  _GameEntry('penalty', 'ضربات پنالتی', 'شوت دقیق و مهار دروازه‌بان', 'assets/pass/football_icon.webp',
      Color(0xFF38BDF8), 'assets/games/penalty.webp'),
  _GameEntry('card_duel', 'دوئل کارت‌ها', 'نبرد سه‌کارتی و کارت‌های کلکسیونی',
      'assets/games/card_duel_glow.png', Color(0xFFFFD166), 'assets/games/card_duel_glow.png'),
  _GameEntry('memory', 'جفت‌یاب', 'جفت‌های فوتبالی را به خاطر بسپار', 'assets/games/memory/medal.webp',
      Color(0xFFA855F7), 'assets/games/memory.webp'),
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
  int _activeStake = 0;
  bool _activeVsBot = false;
  String? _activeRoomCode;

  // 4 Modes: 100, 1000, 0 (تمرین با ربات), -1 (اتاق خصوصی)
  int _selectedMode = 100;
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
    setState(() {
      _active = null;
      _activeStake = 0;
      _activeVsBot = false;
      _activeRoomCode = null;
    });
    unawaited(_loadLevel());
  }

  void _launchGame(String gameId, {int stake = 0, bool vsBot = false, String? roomCode}) {
    setState(() {
      _active = gameId;
      _activeStake = stake;
      _activeVsBot = vsBot;
      _activeRoomCode = roomCode;
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
          );
        case 'reversi':
          return ReversiScreen(
            api: widget.api,
            onBack: _back,
            stake: _activeStake,
            vsBot: _activeVsBot,
            roomCode: _activeRoomCode,
          );
        case 'penalty':
          return PenaltyScreen(
            api: widget.api,
            onBack: _back,
            stake: _activeStake,
            vsBot: _activeVsBot,
            roomCode: _activeRoomCode,
          );
        case 'card_duel':
          return CardDuelPage(api: widget.api, onBack: _back);
      }
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
                      'مسابقات آنلاین، تمرین با ربات و ساخت اتاق اختصاصی',
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

        // ── ۲. انتخاب حالت بازی (۴ حالت: ۱۰۰، ۱۰۰۰، تمرین با ربات، اتاق خصوصی) ──
        const Text(
          'حالت مسابقه:',
          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: Color(0xFFF1F5F9)),
        ),
        Gaps.vXs,
        Row(
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
        Gaps.vMd,

        // ── ۳. محتوای حالت انتخاب شده ──
        if (_selectedMode == -1) ...[
          // ── بخش اتاق خصوصی و لابی‌ها (بدون نیاز به اشتراک، با قفل و پسورد) ──
          _PrivateLobbyHub(
            api: widget.api,
            onJoinGame: (gameId, stake, roomCode) {
              _launchGame(gameId, stake: stake, vsBot: false, roomCode: roomCode);
            },
          ),
        ] else ...[
          // ── فهرست بازی‌های مسابقه‌ای یا تمرین با ربات ──
          for (final g in _multiplayerGames) ...[
            _CleanGameTile(
              entry: g,
              mode: _selectedMode,
              onTap: () {
                if (_selectedMode == 0) {
                  // تمرین فوری با هوش مصنوعی (بدون شمارنده، بدون معطلی، بدون آنلاین)
                  _launchGame(g.id, stake: 0, vsBot: true);
                } else {
                  // مسابقه آنلاین با بازیکن واقعی (بدون ربات)
                  _launchGame(g.id, stake: _selectedMode, vsBot: false);
                }
              },
            ),
            Gaps.vSm,
          ],
        ],

        Gaps.vLg,
      ],
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
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              borderRadius: Corners.rPill,
                              color: isBot
                                  ? const Color(0xFF22E7A6).withValues(alpha: 0.15)
                                  : (mode == 1000
                                      ? const Color(0xFFFFD166).withValues(alpha: 0.18)
                                      : const Color(0xFF38BDF8).withValues(alpha: 0.18)),
                              border: Border.all(
                                color: isBot
                                    ? const Color(0xFF22E7A6)
                                    : (mode == 1000 ? const Color(0xFFFFD166) : const Color(0xFF38BDF8)),
                              ),
                            ),
                            child: Text(
                              isBot ? 'تمرین فوری با هوش مصنوعی' : 'مسابقه آنلاین (${faNum(mode)} امتیاز)',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w900,
                                color: isBot
                                    ? const Color(0xFF22E7A6)
                                    : (mode == 1000 ? const Color(0xFFFFD166) : const Color(0xFF38BDF8)),
                              ),
                            ),
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

/// هاب جامع اتاق خصوصی و لابی‌ها (ساخت لابی، پسورد، نمایش لابی‌ها با قفل)
class _PrivateLobbyHub extends StatefulWidget {
  const _PrivateLobbyHub({
    required this.api,
    required this.onJoinGame,
  });

  final ApiClient api;
  final void Function(String gameId, int stake, String? roomCode) onJoinGame;

  @override
  State<_PrivateLobbyHub> createState() => _PrivateLobbyHubState();
}

class _PrivateLobbyHubState extends State<_PrivateLobbyHub> {
  io.Socket? _socket;
  List<Map<String, dynamic>> _lobbies = [];
  bool _loadingLobbies = true;

  String _selectedGame = 'penalty';
  int _stake = 500;
  final _passCtrl = TextEditingController();
  final _joinCodeCtrl = TextEditingController();

  final _games = const [
    ('penalty', 'ضربات پنالتی', 'assets/pass/football_icon.webp'),
    ('card_duel', 'دوئل کارت‌ها', 'assets/games/card_duel_glow.png'),
    ('memory', 'جفت‌یاب', 'assets/games/memory/medal.webp'),
    ('reversi', 'اتللو', 'assets/games/reversi.webp'),
  ];

  final _presetStakes = const [100, 200, 500, 1000, 2000, 5000, 10000];

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
    } catch (_) {
      if (mounted) setState(() => _loadingLobbies = false);
    }
  }

  @override
  void dispose() {
    _socket?.dispose();
    _passCtrl.dispose();
    _joinCodeCtrl.dispose();
    super.dispose();
  }

  void _createLobby() {
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
    final gameId = lobby['gameId'] as String? ?? 'penalty';
    final stake = (lobby['stake'] as num?)?.toInt() ?? 100;

    if (!hasPass) {
      _socket?.emit('game:join_lobby', {'lobbyId': lobbyId});
      widget.onJoinGame(gameId, stake, null);
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
              _socket?.emit('game:join_lobby', {'lobbyId': lobbyId, 'password': passCtrl.text.trim()});
              widget.onJoinGame(gameId, stake, null);
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
                          label: Text('${faNum(s)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
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
                  hintText: 'رمز عبور اتاق (اختیاری — در صورت خالی بودن عمومی است)',
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
                          'بازی: ${l['gameId']} · ${faNum(l['stake'] ?? 100)} امتیاز',
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
                        widget.onJoinGame(_selectedGame, _stake, code);
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
