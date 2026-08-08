// Games hub. Each board lives in its own file under ./games/ so this screen
// stays a thin launcher rather than growing every time a game is added.
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
    this.singlePlayer = false,
  });
  final String id;
  final String title;
  final String subtitle;
  final String emoji;
  final Color accent;
  final String art;

  /// Whether an empty lobby falls back to a computer opponent. جفت‌یاب says
  /// no — the tile must not advertise a bot that will never appear.
  final bool bot;

  /// Playable alone against the clock (records only, no points).
  final bool solo;

  /// Purely single-player: no lobby, no opponent, no bot. The tile must not
  /// advertise any multiplayer affordance for these.
  final bool singlePlayer;
}

const _games = <_GameEntry>[
  _GameEntry('tap', 'ضربه‌زن', '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', 'assets/games/tap/skin_1.webp',
      Color(0xFF84CC16), 'assets/games/tap/skin_1.webp',
      bot: false, singlePlayer: true),
  // پنالتی دقیقاً **بعد از** ضربه‌زن — درخواست مالک: «بازی پنالتی باید
  // پایین ضربه زن باشه».
  //
  // این فهرست در کلاینت هاردکد است (نه از /api/games)، پس ترتیب سرور
  // اینجا اثر ندارد و باید جداگانه هماهنگ بماند. پنالتی اصلاً در این
  // فهرست نبود — یعنی با وجود آماده بودن سرور و صفحهٔ بازی، از اپ
  // **قابل دسترس نبود**.
  _GameEntry('penalty', 'ضربات پنالتی', 'یکی می‌زند، یکی می‌گیرد', 'assets/pass/football_icon.webp',
      Color(0xFF38BDF8), 'assets/games/penalty.webp'),
  _GameEntry('card_duel', 'دوئل کارت‌ها', 'سه کارت آماده کن؛ Ghost خودکار امتیاز می‌گیرد',
      'assets/games/card_duel_glow.png', Color(0xFFFFD166), 'assets/games/card_duel_glow.png',
      bot: true, solo: true),
  _GameEntry('memory', 'جفت‌یاب', 'جفت‌ها را به خاطر بسپار و ببر', 'assets/games/memory/medal.webp',
      Color(0xFFA855F7), 'assets/games/memory.webp',
      bot: false, solo: true),
  _GameEntry('reversi', 'اتللو', 'مهره‌ها را برگردان', 'assets/games/reversi.webp', Color(0xFF34D399),
      'assets/games/reversi.webp'),
];

class GamesHubPage extends StatefulWidget {
  const GamesHubPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<GamesHubPage> createState() => _GamesHubPageState();
}

class _GamesHubPageState extends State<GamesHubPage> {
  String? _active;

  /// وضعیتِ لولِ کاربر.
  ///
  /// ═══════════════════════════════════════════════════════════════════════
  /// چرا اینجا و نه در داشبورد
  /// ═══════════════════════════════════════════════════════════════════════
  ///
  /// درخواست مالک: «یک سیستم لول بندی هم **در قسمت بازی ها** اضافه کن».
  ///
  /// جای درستش هم همین‌جاست: لول فقط از بازیِ آنلاین می‌آید، پس باید
  /// کنارِ همان کاری باشد که می‌سازدش. گذاشتنش در داشبورد، رابطهٔ
  /// علت-و-معلول را پنهان می‌کرد.
  Map<String, dynamic>? _level;

  @override
  void initState() {
    super.initState();
    unawaited(_loadLevel());
  }

  /// لول را می‌خواند. شکستش صفحه را نمی‌شکند.
  ///
  /// کارتِ لول یک زینت است، نه چیزی که بازی به آن وابسته باشد — اگر
  /// نیامد، صفحه بدونِ آن رندر می‌شود و کاربر همچنان می‌تواند بازی
  /// کند. نمایشِ یک پیامِ خطا برای این، فقط سروصدای بی‌مورد بود.
  Future<void> _loadLevel() async {
    try {
      final d = await widget.api.get('/api/level');
      if (!mounted || d is! Map) return;
      setState(() => _level = Map<String, dynamic>.from(d));
    } catch (_) {
      // بی‌صدا: کارتِ لول اختیاری است.
    }
  }

  void _back() {
    setState(() => _active = null);
    // برگشتن از یک بازی یعنی احتمالاً XP تازه گرفته شده — عددِ کارت
    // باید تازه شود، وگرنه کاربر بازی می‌کند و هیچ تغییری نمی‌بیند.
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
                    Text('باشگاه بازی قلقلی',
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        )),
                    const SizedBox(height: 3),
                    Text(
                      'رقابت آنلاین، رکورد تنها و XP لول در یک مسیر جمع‌وجور.',
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
        Gaps.vMd,
        if (_level != null)
          LevelCard(
            level: (_level!['level'] as num?)?.toInt() ?? 0,
            into: (_level!['into'] as num?)?.toInt() ?? 0,
            needed: (_level!['needed'] as num?)?.toInt() ?? 0,
            progress: (_level!['progress'] as num?)?.toDouble() ?? 0,
            isMax: _level!['isMax'] == true,
            xp: (_level!['xp'] as num?)?.toInt() ?? 0,
          ),
        Gaps.vLg,
        for (final g in _games) ...[
          _GameTile(entry: g, onTap: () => setState(() => _active = g.id)),
          Gaps.vSm,
        ],
      ],
    );
  }
}

class _GameTile extends StatefulWidget {
  const _GameTile({required this.entry, required this.onTap});
  final _GameEntry entry;
  final VoidCallback onTap;

  @override
  State<_GameTile> createState() => _GameTileState();
}

class _GameTileState extends State<_GameTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entry = widget.entry;
    // ═══════════════════════════════════════════════════════════════════
    // چرا یک GestureDetectorِ تنها، نه AppCard(onTap) + GestureDetector
    // ═══════════════════════════════════════════════════════════════════
    // نسخهٔ قبلی هم `onTap` به `AppCard` (که داخلش یک `InkWell` با
    // `TapGestureRecognizer` می‌سازد) می‌داد و هم این‌جا یک `GestureDetector`
    // (با `TapGestureRecognizer` دیگر) روی کلِ کارت. دو رکگنایزرِ ضربه در
    // گسچرآرنا با هم رقابت می‌کردند و تا تکلیفِ برنده روشن نشود، ضربهٔ
    // کاربر «دیر» به‌نظر می‌رسید — همان تأخیرِ ورود به بازی که گزارش شد.
    //
    // حالا فقط یک رکگنایزرِ ضربه روی کارت هست و `onTap` را خودش صدا می‌زند؛
    // `AppCard` بی‌`onTap` می‌ماند (فقط قابِ بصری). نتیجه: ورودِ فوری به بازی.
    return AnimatedScale(
      scale: _pressed ? 0.97 : 1.0,
      duration: Motion.fast,
      curve: Motion.standard,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) {
          setState(() => _pressed = false);
          widget.onTap();
        },
        onTapCancel: () => setState(() => _pressed = false),
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
                      aspectRatio: 16 / 5.8,
                      child: Image.asset(
                        entry.art,
                        fit: BoxFit.cover,
                        // PERF: هر سه بنر بازی ۷۲۰ پیکسل عرض دارند و هر کدام
                        // ~۱.۱ مگابایت رم موقع دیکد می‌گیرند — یعنی ۳.۳
                        // مگابایت فقط برای صفحهٔ فهرست بازی‌ها. کارت‌ها روی
                        // موبایل حدود ۳۴۰ پیکسل منطقی عرض دارند، پس ۷۲۰ کف
                        // یک نمایشگر ۲x را هم پوشش می‌دهد و بالاترش هدر است.
                        // بقیهٔ بنرهای اپ این راهنما را داشتند؛ همین یکی جا
                        // افتاده بود.
                        cacheWidth: 720,
                        // Never let a missing/corrupt asset blank the whole hub.
                        errorBuilder: (_, __, ___) => Container(
                          color: entry.accent.withValues(alpha: 0.18),
                          alignment: Alignment.center,
                          child: Image.asset(entry.emoji, width: 64, height: 64, fit: BoxFit.contain),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              Colors.black.withValues(alpha: 0.72),
                            ],
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
                          Image.asset(entry.emoji, width: 28, height: 28, fit: BoxFit.contain),
                          Gaps.hXs,
                          Expanded(
                            child: Text(
                              entry.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
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
                            Text(entry.subtitle,
                                style: theme.textTheme.bodySmall),
                            Gaps.vXs,
                            Wrap(spacing: Gaps.xxs,
                                runSpacing: Gaps.xxs,
                                children: [
                                  if (entry.singlePlayer) ...[
                                    _Tag(label: 'تک‌نفره', color: entry.accent),
                                    const _Tag(
                                        label: '۵۰ لول',
                                        color: Color(0xFFF59E0B)),
                                    const _Tag(
                                        label: 'ذخیرهٔ خودکار',
                                        color: Color(0xFF34D399)),
                                  ] else ...[
                                    _Tag(
                                        label: 'دو نفره آنلاین',
                                        color: entry.accent),
                                    if (entry.bot)
                                      _Tag(
                                          label: 'بازی با ربات',
                                          color: entry.accent)
                                    else
                                      const _Tag(
                                          label: 'فقط حریف واقعی',
                                          color: Color(0xFF38BDF8)),
                                    if (entry.solo)
                                      const _Tag(
                                          label: 'بازی تنها · رکوردی',
                                          color: Color(0xFF34D399)),
                                  ],
                                ]),
                          ],
                        ),
                      ),
                      Image.asset('assets/games/play_glow.png',
                          width: 38, height: 38, cacheWidth: 96),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.xs, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: Corners.rPill,
      ),
      child: Text(
        label,
        style: Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
