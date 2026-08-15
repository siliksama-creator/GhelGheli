// Shared chrome for every game screen: header, versus bar, status banners
// and the end-of-game panel. Each individual board only supplies its grid.
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import 'coin_award.dart';
import 'game_audio.dart';
import 'game_session.dart';
import 'versus_bar.dart';

class GameScaffold extends StatelessWidget {
  const GameScaffold({
    super.key,
    required this.session,
    required this.api,
    required this.title,
    required this.accent,
    required this.symbols,
    required this.onBack,
    required this.boardBuilder,
    this.scoreboard,
    this.soloOffer,
  });

  final GameSession session;
  final ApiClient api;
  final String title;
  final Color accent;
  final Map<String, String> symbols; // X/O -> transparent asset path
  final VoidCallback onBack;
  final WidgetBuilder boardBuilder;
  final Widget? scoreboard;

  /// Escape hatch for games with NO bot (جفت‌یاب): shown in the lobby and
  /// while hunting, so an empty lobby offers solo play instead of silently
  /// starting a fake "opponent".
  final Widget? soloOffer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Stack(
      children: [
        AnimatedBuilder(
          animation: session,
          builder: (context, _) {
            return Padding(
              padding:
                  const EdgeInsets.fromLTRB(Gaps.md, Gaps.md, Gaps.md, Gaps.xs),
              child: Column(
                children: [
                  Row(
                    children: [
                      IconButton(
                        onPressed: () {
                          session.leave();
                          onBack();
                        },
                        icon: const Icon(Icons.arrow_back_rounded),
                        tooltip: 'بازگشت',
                      ),
                      Expanded(
                        child: Text(title,
                            style: theme.textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800)),
                      ),
                      if (session.vsBot && session.phase == GamePhase.playing)
                        _Chip(label: 'با ربات', color: accent),
                      const _SoundToggle(),
                    ],
                  ),
                  if (!session.connected || session.connectionNotice != null)
                    Padding(
                      padding: const EdgeInsets.only(top: Gaps.xs),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: Gaps.sm, vertical: 6),
                        decoration: BoxDecoration(
                          color:
                              const Color(0xFFF59E0B).withValues(alpha: 0.16),
                          borderRadius: Corners.rMd,
                          border: Border.all(
                              color: const Color(0xFFF59E0B)
                                  .withValues(alpha: 0.6)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(
                                width: 13,
                                height: 13,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Color(0xFFF59E0B))),
                            const SizedBox(width: 8),
                            Flexible(
                                child: Text(
                                    session.connectionNotice ??
                                        'اتصال قطع شد؛ در حال بازیابی مسابقه…',
                                    style: const TextStyle(
                                        color: Color(0xFFF59E0B),
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700))),
                          ],
                        ),
                      ),
                    ),
                  Gaps.vSm,
                  Expanded(child: _body(context, theme)),
                ],
              ),
            );
          },
        ),
        if (session.phase == GamePhase.over && session.iWon)
          const Positioned.fill(
            child: IgnorePointer(
              child: _ConfettiOverlay(),
            ),
          ),
      ],
    );
  }

  Widget _body(BuildContext context, ThemeData theme) {
    if (session.error != null) {
      return _Centered(
        icon: Icons.wifi_off_rounded,
        title: session.error!,
        action: FilledButton.icon(
          onPressed: session.join,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('تلاش دوباره'),
        ),
      );
    }

    switch (session.phase) {
      case GamePhase.idle:
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: Gaps.lg),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _Centered(
                icon: Icons.sports_esports_rounded,
                title: 'آماده‌ای شروع کنیم؟',
                subtitle:
                    'می‌توانی آنلاین با حریف واقعی رقابت کنی یا بلافاصله با ربات بازی کنی.',
                action: Column(
                  children: [
                    FilledButton.icon(
                      onPressed: () => session.join(vsBot: false),
                      style: FilledButton.styleFrom(
                        backgroundColor: accent,
                        minimumSize: const Size(240, 50),
                      ),
                      icon: const Icon(Icons.people_rounded),
                      label: const Text('پیدا کردن حریف آنلاین'),
                    ),
                    Gaps.vSm,
                    OutlinedButton.icon(
                      onPressed: () => session.join(vsBot: true),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(240, 48),
                        side: BorderSide(color: accent.withValues(alpha: 0.65)),
                      ),
                      icon: const Icon(Icons.smart_toy_rounded),
                      label: const Text('بازی فوری با ربات (بدون انتظار)'),
                    ),
                  ],
                ),
              ),
              if (soloOffer != null) ...[
                Gaps.vMd,
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Gaps.md),
                  child: soloOffer!,
                ),
              ],
            ],
          ),
        );

      case GamePhase.waiting:
        if (session.vsBot) {
          // تمرین با ربات: مستقیم به بازی بدون صفحه انتظار
          return const SizedBox.shrink();
        }
        final left = session.searchSecondsLeft;
        final total = session.searchSeconds <= 0 ? 15 : session.searchSeconds;
        // With no bot to fall back on the countdown is meaningless once it
        // hits zero — we keep looking, so show a live pulse instead of a
        // number frozen at ۰.
        final open =
            session.stillSearching || !session.botFallback && left <= 0;
        return SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(Gaps.lg),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 96,
                  height: 96,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox.expand(
                        child: CircularProgressIndicator(
                          // Indeterminate spinner once the window is open.
                          value: open ? null : (left / total).clamp(0.0, 1.0),
                          strokeWidth: 6,
                          backgroundColor:
                              theme.colorScheme.outline.withValues(alpha: 0.2),
                          valueColor: AlwaysStoppedAnimation(accent),
                        ),
                      ),
                      open
                          ? Icon(Icons.person_search_rounded,
                              size: 34, color: accent)
                          : Text(
                              faNum(left),
                              style: theme.textTheme.headlineMedium?.copyWith(
                                fontWeight: FontWeight.w900,
                                color: accent,
                              ),
                            ),
                    ],
                  ),
                ),
                Gaps.vLg,
                Builder(builder: (_) {
                  final isOnlineMatch =
                      session.stake == 100 || session.stake == 1000;
                  if (isOnlineMatch) {
                    return const Text(
                      'در جستجوی حریف ....',
                      textAlign: TextAlign.center,
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    );
                  }
                  return Column(
                    children: [
                      Text(
                          open
                              ? 'هنوز در صف حریف واقعی هستی'
                              : 'در حال جستجوی حریف واقعی...',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      Gaps.vXxs,
                      Text(
                        _waitHint(session, left),
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  );
                }),
                if (soloOffer != null) ...[Gaps.vMd, soloOffer!],
                Gaps.vLg,
                Builder(builder: (_) {
                  final isOnlineMatch =
                      session.stake == 100 || session.stake == 1000;
                  if (isOnlineMatch) {
                    return OutlinedButton.icon(
                      onPressed: session.leave,
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size(140, 46)),
                      icon: const Icon(Icons.close_rounded, size: 18),
                      label: const Text('لغو'),
                    );
                  }
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      FilledButton.icon(
                        onPressed: session.playWithBotImmediately,
                        style: FilledButton.styleFrom(
                          backgroundColor: accent,
                          minimumSize: const Size(160, 46),
                        ),
                        icon: const Icon(Icons.smart_toy_rounded, size: 20),
                        label: const Text('شروع با ربات'),
                      ),
                      Gaps.hSm,
                      OutlinedButton.icon(
                        onPressed: session.leave,
                        style: OutlinedButton.styleFrom(
                            minimumSize: const Size(100, 46)),
                        icon: const Icon(Icons.close_rounded, size: 18),
                        label: const Text('لغو'),
                      ),
                    ],
                  );
                }),
              ],
            ),
          ),
        );

      case GamePhase.playing:
      case GamePhase.over:
        return Column(
          children: [
            VersusBar(
                session: session, api: api, symbols: symbols, accent: accent),
            if (session.stake > 0) ...[
              Container(
                margin: const EdgeInsets.symmetric(vertical: 4),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                decoration: BoxDecoration(
                  borderRadius: Corners.rPill,
                  gradient: const LinearGradient(
                      colors: [Color(0x3DFFD700), Color(0x1AFF9F43)]),
                  border:
                      Border.all(color: const Color(0xFFFFD166), width: 1.2),
                  boxShadow: [
                    BoxShadow(
                        color: const Color(0xFFFFD166).withValues(alpha: 0.25),
                        blurRadius: 10),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.emoji_events_rounded,
                        size: 14, color: Color(0xFFFFD166)),
                    const SizedBox(width: 5),
                    Text(
                      'جایزهٔ برنده: ${faNum(session.netPot > 0 ? session.netPot : netPotFor(session.stake))} امتیاز',
                      style: const TextStyle(
                          color: Color(0xFFFFD166),
                          fontSize: 11.5,
                          fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            ],
            Gaps.vXxs,
            if (scoreboard != null) ...[scoreboard!, Gaps.vXxs],
            if (session.phase == GamePhase.over) ...[
              _ResultStrip(session: session, accent: accent),
              // سکهٔ لیگ. `coinsWinner` نمادِ برنده است (X/O) و با
              // `mySymbol` مقایسه می‌شود نه با `winner` — چون در قطعِ
              // ارتباط، `winner` می‌تواند چیز دیگری باشد در حالی که تسویه
              // واقعاً یک برنده داشته. نمادِ خودِ تسویه همیشه درست است.
              if (session.coinsAwarded > 0) ...[
                Gaps.vXxs,
                CoinAward(
                  amount: session.coinsAwarded,
                  mine: session.coinsWinner == session.mySymbol,
                ),
              ],
            ]
            else
              _TurnBanner(session: session, accent: accent),
            if (session.timedOutSymbol != null &&
                session.phase == GamePhase.playing) ...[
              Gaps.vXxs,
              Text(
                session.timedOutSymbol == session.mySymbol
                    ? 'وقت شما تمام شد؛ حرکت خودکار انجام شد'
                    : 'وقت حریف تمام شد',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: const Color(0xFFEF4444),
                    fontWeight: FontWeight.w800),
              ),
            ],
            Gaps.vXxs,
            Expanded(
              child: LayoutBuilder(
                builder: (context, box) => ClipRect(
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.topCenter,
                      child: SizedBox(
                        width: box.maxWidth,
                        child: boardBuilder(context),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Gaps.vXxs,
            SizedBox(
              height: 40,
              child: session.phase == GamePhase.over
                  ? _ResultActions(session: session, accent: accent)
                  : OutlinedButton.icon(
                      onPressed: session.leave,
                      icon: const Icon(Icons.flag_outlined, size: 18),
                      label: const Text('خروج از بازی'),
                    ),
            ),
          ],
        );
    }
  }
}

/// The line under the search spinner. Three honest variants: counting down
/// to a bot, counting down to "we'll suggest solo", or still hunting.
String _waitHint(GameSession session, int left) {
  if (session.stillSearching || (!session.botFallback && left <= 0)) {
    return 'به محض اینکه بازیکنی وارد شود، بازی شروع می‌شود.\n'
        'می‌توانی منتظر بمانی یا همین حالا تنها بازی کنی.';
  }
  if (!session.botFallback) {
    return 'در این بازی ربات نداریم — فقط حریف واقعی.';
  }
  return left > 0
      ? 'اگر حریفی پیدا نشود، بعد از ${faNum(left)} ثانیه با ربات شروع می‌کنیم.'
      : 'در حال آماده‌سازی بازی با ربات...';
}

class _TurnBanner extends StatelessWidget {
  const _TurnBanner({required this.session, required this.accent});
  final GameSession session;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    if (session.phase != GamePhase.playing) return const SizedBox.shrink();
    final mine = session.myTurn;
    final theme = Theme.of(context);
    return AnimatedContainer(
      duration: Motion.fast,
      padding:
          const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.xs),
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        color:
            (mine ? accent : theme.colorScheme.outline).withValues(alpha: 0.16),
        border: Border.all(
          color: (mine ? accent : theme.colorScheme.outline)
              .withValues(alpha: 0.65),
          width: 1.5,
        ),
        boxShadow: mine
            ? [
                BoxShadow(
                  color: accent.withValues(alpha: 0.35),
                  blurRadius: 10,
                  spreadRadius: 1,
                )
              ]
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(mine ? Icons.touch_app_rounded : Icons.hourglass_top_rounded,
              size: 16, color: mine ? accent : theme.colorScheme.outline),
          Gaps.hXs,
          Text(
            mine ? 'نوبت شماست' : 'نوبت حریف...',
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: mine ? accent : theme.colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultStrip extends StatelessWidget {
  const _ResultStrip({required this.session, required this.accent});
  final GameSession session;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final won = session.iWon;
    final draw = session.winner == 'DRAW';
    final color = won
        ? accent
        : draw
            ? theme.colorScheme.outline
            : const Color(0xFFEF4444);
    final icon = won
        ? Icons.emoji_events_rounded
        : draw
            ? Icons.handshake_rounded
            : Icons.close_rounded;
    return AnimatedContainer(
      duration: Motion.fast,
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: Corners.rPill,
        color: color.withValues(alpha: 0.16),
        border: Border.all(
          color: color.withValues(alpha: 0.70),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.20), blurRadius: 12)
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 18, color: color),
          Gaps.hXs,
          Flexible(
            child: Text(
              session.resultText,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultActions extends StatelessWidget {
  const _ResultActions({required this.session, required this.accent});
  final GameSession session;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            onPressed:
                session.rematchAvailable ? session.rematch : session.join,
            style: FilledButton.styleFrom(backgroundColor: accent),
            icon: const Icon(Icons.replay_rounded, size: 18),
            label: Text(session.rematchWaiting
                ? 'منتظر حریف…'
                : session.rematchAvailable
                    ? 'دوباره با همین حریف'
                    : 'بازی دوباره'),
          ),
        ),
        Gaps.hXs,
        IconButton.filledTonal(
          tooltip: 'اشتراک نتیجه در تلگرام/اینستاگرام',
          // share_plus ۱۳: API تازه. توضیحِ چراییِ ارتقا در card_duel_page.
          onPressed: () => SharePlus.instance.share(ShareParams(
            text:
                '${session.resultText}\n${session.nameOf('X')} مقابل ${session.nameOf('O')}\n'
                'تو هم به باشگاه بازی‌های قلقلی بیا: https://ghelghelishop.ir',
            subject: 'نتیجه بازی قلقلی',
          )),
          icon: const Icon(Icons.ios_share_rounded, size: 18),
        ),
        Gaps.hXs,
        Expanded(
          child: OutlinedButton(
            onPressed: session.leave,
            child: const Text('پایان'),
          ),
        ),
      ],
    );
  }
}

class _Centered extends StatelessWidget {
  const _Centered({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Gaps.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 56, color: theme.colorScheme.outline),
            Gaps.vMd,
            Text(title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            if (subtitle != null) ...[
              Gaps.vXxs,
              Text(subtitle!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall),
            ],
            if (action != null) ...[Gaps.vLg, action!],
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: Corners.rPill,
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.smart_toy_rounded, size: 14, color: color),
        Gaps.hXxs,
        Text(label,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: color, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

/// Mute button. Lives in the game header so players can silence SFX
/// instantly without digging through settings.
class _SoundToggle extends StatefulWidget {
  const _SoundToggle();

  @override
  State<_SoundToggle> createState() => _SoundToggleState();
}

class _SoundToggleState extends State<_SoundToggle> {
  @override
  Widget build(BuildContext context) {
    final on = GameAudio.instance.enabled;
    return IconButton(
      tooltip: on ? 'قطع صدا' : 'وصل صدا',
      icon: Icon(on ? Icons.volume_up_rounded : Icons.volume_off_rounded),
      onPressed: () async {
        await GameAudio.instance.setEnabled(!on);
        if (mounted) setState(() {});
      },
    );
  }
}

class _ConfettiOverlay extends StatefulWidget {
  const _ConfettiOverlay();

  @override
  State<_ConfettiOverlay> createState() => _ConfettiOverlayState();
}

class _ConfettiOverlayState extends State<_ConfettiOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_Particle> _particles;
  final _random = math.Random();

  @override
  void initState() {
    super.initState();
    // Epic victory vibrations!
    HapticFeedback.heavyImpact();
    Future.delayed(
        const Duration(milliseconds: 150), () => HapticFeedback.heavyImpact());
    Future.delayed(
        const Duration(milliseconds: 300), () => HapticFeedback.heavyImpact());
    Future.delayed(
        const Duration(milliseconds: 450), () => HapticFeedback.heavyImpact());

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();

    // ── حافظه و کیفیت ──
    // تعداد ذرات به‌جای عددِ ثابت ۶۵، به مساحت صفحه مقیاس می‌شود: یک
    // گوشی کوچک به ۴۵ ذره نیاز دارد نه ۶۵ — و ۶۵ ذرهٔ بیهوده یعنی یک
    // حلقهٔ ترسیمِ تمام‌صفحهٔ اضافه در هر فریم. روی صفحات بزرگ هم
    // طبیعی‌تر دیده می‌شود (تراکم یکسان). به همین ترتیب اندازهٔ ذره
    // به عرض صفحه گره می‌خورد تا در موبایل‌های بزرگ‌تر شناورِ کوچکی
    // به نظر نرسد.
    final count =
        (45 + (MediaQuery.sizeOf(context).width / 18)).round().clamp(45, 90);
    final colors = [
      const Color(0xFFB5EF58), // Green
      const Color(0xFF38BDF8), // Blue
      const Color(0xFFFFD36B), // Gold
      const Color(0xFFEF4444), // Red
      const Color(0xFFEC4899), // Pink
    ];

    _particles = List.generate(
        count,
        (_) => _Particle(
              x: _random.nextDouble(),
              y: _random.nextDouble() * -0.5, // Start slightly above screen
              speed: 0.05 + _random.nextDouble() * 0.1,
              angle: _random.nextDouble() * math.pi * 2,
              rotationSpeed: _random.nextDouble() * 4 + 1.0,
              size: 7.0 + _random.nextDouble() * 9.0,
              color: colors[_random.nextInt(colors.length)],
              shape: _random.nextInt(4), // 4 distinct shapes!
            ));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // `size` را یک بار بیرون از AnimatedBuilder می‌گیریم: اندازهٔ صفحه در
    // طولِ انیمیشنِ ۴ ثانیه‌ای عوض نمی‌شود و گرفتنِ MediaQuery در هر فریم
    // فقط هزینهٔ re-layout/rebuild بی‌مورد است.
    final size = MediaQuery.sizeOf(context);
    return RepaintBoundary(
      // RepaintBoundary انیمیشنِ ذرات را از بقیهٔ صفحه جدا می‌کند؛ وقتی
      // هر ذره canvas را لمس می‌کند، لایه‌ی شناورها را دوباره نمی‌کشد —
      // فقط همین لایه. این بزرگ‌ترین تک‌قدمِ حافظه/عملکرد در این صفحه است.
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => CustomPaint(
          size: size,
          painter: _ConfettiPainter(
            particles: _particles,
            progress: _controller.value,
            screenSize: size,
          ),
        ),
      ),
    );
  }
}

class _Particle {
  _Particle({
    required this.x,
    required this.y,
    required this.speed,
    required this.angle,
    required this.rotationSpeed,
    required this.size,
    required this.color,
    required this.shape,
  });

  double x; // 0.0 to 1.0 (screen width fraction)
  double y; // 0.0 to 1.0 (screen height fraction)
  final double speed;
  final double angle;
  final double rotationSpeed;
  final double size;
  final Color color;
  final int shape; // 0 = rect, 1 = circle, 2 = triangle, 3 = star
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter({
    required this.particles,
    required this.progress,
    required this.screenSize,
  });

  final List<_Particle> particles;
  final double progress;
  final Size screenSize;

  // مسیرهای ستاره و مثلث را یک بار می‌سازیم و با transform (translate +
  // scale + rotate روی canvas) هر ذره را بدونِ ساخت Path تازه رسم می‌کنیم.
  static final Path _starUnit = _unitStar();
  static final Path _triangleUnit = _unitTriangle();

  static Path _unitStar() {
    final path = Path();
    const points = 5;
    const outer = 1.0;
    const inner = 0.45;
    for (var i = 0; i < points * 2; i++) {
      final r = i % 2 == 0 ? outer : inner;
      final angle = (i * math.pi) / points;
      final x = r * math.cos(angle);
      final y = r * math.sin(angle);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    return path..close();
  }

  static Path _unitTriangle() {
    return Path()
      ..moveTo(0, -0.5)
      ..lineTo(0.5, 0.5)
      ..lineTo(-0.5, 0.5)
      ..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;

    for (var i = 0; i < particles.length; i++) {
      final p = particles[i];
      // Move particles downwards based on speed and frame tick
      p.y += p.speed * 0.05;
      p.x += math.sin(p.y * 8 + p.angle) * 0.004; // zigzag path

      // Reset when particle goes off screen bottom
      if (p.y > 1.2) {
        p.y = -0.1;
        // یک PRNG تازه نمی‌سازیم؛ از seedِ ثابتِ خودِ ذره (تعیین‌شده در
        // سازنده) برای یک xِ تازه ولی ارزان استفاده می‌کنیم.
        p.x = _pseudoRandom(i);
      }

      final px = p.x * size.width;
      final py = p.y * size.height;

      canvas.save();
      canvas.translate(px, py);

      // Simulate highly advanced 3D rotation by scaling width/scale!
      final rotationAngle = p.y * p.rotationSpeed * math.pi;
      final scale3d = math.cos(rotationAngle).abs();
      canvas.scale(scale3d, 1.0);
      canvas.rotate(rotationAngle);

      // Dynamic shiny metallic glint reflection!
      if (scale3d < 0.15) {
        paint.color = Colors.white.withValues(alpha: 0.85);
      } else {
        paint.color = p.color;
      }

      if (p.shape == 0) {
        // Rectangle Confetti
        canvas.drawRect(
          Rect.fromCenter(
              center: Offset.zero, width: p.size, height: p.size * 0.5),
          paint,
        );
      } else if (p.shape == 1) {
        // Circular Confetti
        canvas.drawCircle(Offset.zero, p.size * 0.4, paint);
      } else if (p.shape == 2) {
        // Triangular Confetti — ترسیمِ واحدِ کشیده‌شده، نه Path تازه
        canvas.save();
        canvas.scale(p.size, p.size);
        canvas.drawPath(_triangleUnit, paint);
        canvas.restore();
      } else {
        // Shimmering Star Confetti — unit-path با مقیاسِ p.size
        canvas.save();
        canvas.scale(p.size, p.size);
        canvas.drawPath(_starUnit, paint);
        canvas.restore();
      }

      canvas.restore();
    }
  }

  /// یک مقدارِ شبه‌تصادفیِ ارزان بین ۰ و ۱ از اندیسِ ذره (بدون تخصیص).
  double _pseudoRandom(int i) => ((i * 2654435761) % 1000000) / 1000000;

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
