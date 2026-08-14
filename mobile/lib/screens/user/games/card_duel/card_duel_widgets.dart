part of '../card_duel_page.dart';

// RarityCardFrame is applied by PlayerCard so inventory, detail and duel share one frame.

/// تنها آداپترِ زاویهٔ دید برای نتیجهٔ راند.
///
/// سرور حقیقت را با X/O می‌فرستد، اما کاربر آنلاین می‌تواند هرکدام باشد.
/// پراکنده کردنِ ternaryهای X/O در چند ویجت علت اصلیِ جابه‌جاییِ کارت،
/// عدد و برنده بود. همهٔ UI حالا فقط این مدلِ «من/حریف» را می‌خواند.
@immutable
class CardDuelRoundPerspective {
  const CardDuelRoundPerspective._({
    required this.mine,
    required this.theirs,
    required this.myPower,
    required this.theirPower,
    required this.myFocus,
    required this.theirFocus,
    required this.myBreakdown,
    required this.theirBreakdown,
    required this.winner,
    required this.mySymbol,
  });

  factory CardDuelRoundPerspective.from(
    Map<String, dynamic> round,
    String mySymbol,
  ) {
    final symbol = mySymbol == 'O' ? 'O' : 'X';
    final mineKey = symbol == 'O' ? 'O' : 'X';
    final theirKey = symbol == 'O' ? 'X' : 'O';
    Map<String, dynamic> map(String key) =>
        Map<String, dynamic>.from((round[key] as Map?) ?? const {});
    return CardDuelRoundPerspective._(
      mine: map('card$mineKey'),
      theirs: map('card$theirKey'),
      myPower: NumberParser.toInt(round['power$mineKey']),
      theirPower: NumberParser.toInt(round['power$theirKey']),
      myFocus: NumberParser.toInt(round['focusStat$mineKey']),
      theirFocus: NumberParser.toInt(round['focusStat$theirKey']),
      myBreakdown: map('breakdown$mineKey'),
      theirBreakdown: map('breakdown$theirKey'),
      winner: '${round['winner'] ?? ''}',
      mySymbol: symbol,
    );
  }

  final Map<String, dynamic> mine;
  final Map<String, dynamic> theirs;
  final int myPower;
  final int theirPower;
  final int myFocus;
  final int theirFocus;
  final Map<String, dynamic> myBreakdown;
  final Map<String, dynamic> theirBreakdown;
  final String winner;
  final String mySymbol;

  bool get draw => winner == 'DRAW';
  bool get iWon => winner == mySymbol;
  bool get opponentWon => !draw && !iWon;
  bool get contractValid => draw
      ? myPower == theirPower
      : iWon
          ? myPower > theirPower
          : theirPower > myPower;
}

class _ArenaHero extends StatelessWidget {
  const _ArenaHero({
    required this.onBack,
    required this.modeColor,
    required this.modeTitle,
  });
  final VoidCallback onBack;
  final Color modeColor;
  final String modeTitle;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(Gaps.md),
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: LinearGradient(
            colors: [
              modeColor.withValues(alpha: 0.24),
              const Color(0xFF142742),
              const Color(0xFF050A12),
            ],
          ),
          border: Border.all(color: modeColor.withValues(alpha: 0.55)),
        ),
        child: Row(
          children: [
            IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'دوئل کارت‌ها',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  Text(
                    modeTitle,
                    style: TextStyle(
                      color: modeColor,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _RuleStrip extends StatelessWidget {
  const _RuleStrip();
  @override
  Widget build(BuildContext context) => const AppCard(
        padding: EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 9),
        child: Row(
          children: [
            Expanded(
                child: _RuleStep(icon: Icons.style_rounded, title: '۵ کارت')),
            Icon(Icons.circle, size: 4, color: Colors.white24),
            Expanded(child: _RuleStep(icon: Icons.lock_rounded, title: 'مخفی')),
            Icon(Icons.circle, size: 4, color: Colors.white24),
            Expanded(
                child: _RuleStep(icon: Icons.bolt_rounded, title: '۵ راند')),
          ],
        ),
      );
}

class _RuleStep extends StatelessWidget {
  const _RuleStep({required this.icon, required this.title});
  final IconData icon;
  final String title;
  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: _gold),
          const SizedBox(width: 4),
          Text(
            title,
            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900),
          ),
        ],
      );
}

class _LineupPanel extends StatelessWidget {
  const _LineupPanel({
    required this.selected,
    required this.cards,
    required this.teamPower,
    required this.onRemove,
  });
  final List<String> selected;
  final List<Map<String, dynamic>> cards;
  final int teamPower;
  final ValueChanged<String> onRemove;
  @override
  Widget build(BuildContext context) {
    final byId = {for (final card in cards) cardIdOf(card): card};
    return AppCard(
      child: Column(
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'ترکیب ۵ کارتی',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              Text(
                '${faNum(teamPower)} قدرت',
                style: const TextStyle(
                  color: _gold,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          Gaps.vSm,
          SizedBox(
            height: 118,
            child: Row(
              children: [
                for (var index = 0; index < 5; index++) ...[
                  Expanded(
                    child: _LineupSlot(
                      index: index,
                      card: index < selected.length
                          ? byId[selected[index]]
                          : null,
                      onTap: index < selected.length
                          ? () => onRemove(selected[index])
                          : null,
                    ),
                  ),
                  if (index < 4) const SizedBox(width: 4),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LineupSlot extends StatelessWidget {
  const _LineupSlot({required this.index, this.card, this.onTap});
  final int index;
  final Map? card;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: Corners.rLg,
        child: card == null
            ? DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: Corners.rLg,
                  border: Border.all(color: Colors.white24),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF17283D), Color(0xFF050A11)],
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.add_rounded, color: Colors.white38),
                      Text(
                        'کارت ${faNum(index + 1)}',
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: Colors.white54,
                        ),
                      ),
                    ],
                  ),
                ),
              )
            : CosmeticCardFrame(
                frame: null,
                child: PlayerCard(
                  card: Map<String, dynamic>.from(card!),
                  compact: true,
                  showStats: false,
                  onTap: onTap,
                ),
              ),
      );
}

class _Matchmaking extends StatelessWidget {
  const _Matchmaking({
    required this.color,
    required this.vsBot,
    required this.onCancel,
  });
  final Color color;
  final bool vsBot;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) => AppCard(
        child: SizedBox(
          height: 230,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 72,
                height: 72,
                child: CircularProgressIndicator(color: color, strokeWidth: 3),
              ),
              Gaps.vMd,
              Text(
                vsBot ? 'آماده‌سازی ربات…' : 'جستجوی حریف…',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              Gaps.vMd,
              OutlinedButton(
                onPressed: onCancel,
                child: const Text('لغو و ویرایش ترکیب'),
              ),
            ],
          ),
        ),
      );
}

// HUD زنده فقط هنگام بازی رندر می‌شود. صفحهٔ پایان یک Finale مستقل دارد
// تا اسکوربورد، برخورد آخر و نتیجهٔ نهایی دوباره روی هم تکرار نشوند.
class _LiveBattle extends StatelessWidget {
  const _LiveBattle({required this.session, required this.color});
  final GameSession session;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final state = session.state;
    final mine = session.mySymbol ?? 'X';
    final opponent = mine == 'X' ? 'O' : 'X';
    final score = state['score'] is Map ? state['score'] as Map : const {};
    final deck =
        (state['myDeck'] as List? ?? const []).whereType<Map>().toList();
    final remaining = (state['myRemainingCardIds'] as List? ?? const [])
        .map((id) => '$id')
        .toSet();
    final pendingId = '${state['myPendingCardId'] ?? ''}';
    final lastRound = state['lastRound'] is Map
        ? Map<String, dynamic>.from(state['lastRound'] as Map)
        : null;
    final history =
        (state['history'] as List? ?? const []).whereType<Map>().toList();
    final iChose = state['iChose'] == true;
    final total = NumberParser.toInt(state['totalRounds']) == 0
        ? 5
        : NumberParser.toInt(state['totalRounds']);
    final roundIndex = NumberParser.toInt(state['roundIndex']);
    return Column(
      children: [
        _Scoreboard(
          myName: session.nameOf(mine),
          theirName: session.nameOf(opponent),
          myScore: NumberParser.toInt(score[mine]),
          theirScore: NumberParser.toInt(score[opponent]),
          color: color,
          myPlayer: session.playerInfo(mine),
          theirPlayer: session.playerInfo(opponent),
          title: '${state['roundTitle'] ?? 'پایان نبرد'}',
          roundLabel:
              '${faNum((roundIndex + 1).clamp(1, total))}/${faNum(total)}',
          lastWinner: '${lastRound?['winner'] ?? ''}',
          mySymbol: mine,
          opponentRole: session.vsBot ? 'ربات' : 'حریف',
        ),
        Gaps.vXs,
        _RoundPips(
          total: total,
          current: roundIndex,
          history: history,
          mine: mine,
          color: color,
        ),
        Gaps.vXs,
        // ── چرا بنرِ افقی حذف شد ──
        //
        // `_FocusBanner` همین اطلاعات را می‌داد ولی ~۹۰ پیکسل ارتفاع
        // می‌گرفت و باعثِ اسکرول می‌شد. جایش را `_RoundIntroOverlay`
        // گرفته که وسطِ صفحه و روی همه‌چیز می‌آید، ۲.۸ ثانیه می‌ماند و
        // **هیچ ارتفاعی از چیدمان نمی‌گیرد**.
        //
        // اطلاعاتِ همیشگی (کدام ویژگی مهم است) از بین نرفت: روی تک‌تکِ
        // کارت‌های دست با `_FocusStatRibbon` دیده می‌شود و در نوارِ
        // فشردهٔ زیر هم خلاصه‌اش هست.
        // ⚠️ در صفحهٔ پایان این صحنه دقیقاً بالای پنلِ VICTORY می‌نشست و
        //    «دو بلوک نتیجه هم‌زمان» می‌ساخت. جزئیاتِ راندِ پنجم از بین
        //    نمی‌رود: در «جزئیات راندها» همان پایین هست.
        // برخورد کامل فقط در مکثِ نتیجه دیده می‌شود. بعد از آن score و
        // پیپ‌ها حکم را نگه می‌دارند؛ نگه‌داشتن کارت‌های راند قبلی ۲۱۰dp
        // از صفحهٔ انتخاب می‌گرفت و کاربر را دوباره مجبور به اسکرول می‌کرد.
        if (session.resultHolding)
          _ClashStage(
            round: lastRound,
            mine: mine,
            color: color,
            opponentRole: session.vsBot ? 'ربات' : 'حریف',
          ),
        if (session.phase == GamePhase.playing) ...[
          Gaps.vSm,
          AppCard(
            child: Column(
              children: [
                Row(
                  children: [
                    // نشانِ همیشگیِ ویژگیِ راند — جایگزینِ فشردهٔ بنرِ حذف‌شده.
                    // اعلانِ وسطِ صفحه ۲.۸ ثانیه‌ای است؛ این تا آخرِ راند می‌ماند
                    // تا کسی که اعلان را از دست داد هم بداند دنبالِ چه عددی بگردد.
                    if ('${(state['roundFocus'] as Map?)?['stat'] ?? ''}'
                        .isNotEmpty) ...[
                      Builder(
                        builder: (_) {
                          final fs =
                              '${(state['roundFocus'] as Map?)?['stat'] ?? ''}';
                          final t = _FocusBannerState._statColors[fs] ?? color;
                          return Container(
                            margin: const EdgeInsetsDirectional.only(end: 8),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: t.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: t.withValues(alpha: 0.6),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  _FocusBannerState._statIcons[fs] ??
                                      Icons.stars_rounded,
                                  size: 15,
                                  color: t,
                                ),
                                const SizedBox(width: 5),
                                Text(
                                  _FocusBannerState._statNames[fs] ?? '',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                    color: t,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                    Expanded(
                      child: Text(
                        iChose
                            ? 'قفل شد'
                            : state['opponentLocked'] == true
                                ? 'حریف آماده‌ست'
                                : 'کارت را بزن',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    AnimatedBuilder(
                      animation: session.clock,
                      builder: (_, __) => CircleAvatar(
                        radius: 24,
                        backgroundColor: const Color(0xFF02060C),
                        // در پنجرهٔ اعلانِ راند ساعت نمی‌رود؛ به‌جای عددِ
                        // ثابت که شبیهِ «هنگ کرده» است، آیکنِ مکث نشان
                        // داده می‌شود تا معلوم باشد عمدی است.
                        child: session.introHolding
                            ? Icon(
                                Icons.visibility_rounded,
                                color: color,
                                size: 20,
                              )
                            : Text(
                                faNum(session.secondsLeft),
                                style: TextStyle(
                                  color: color,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
                Gaps.vXs,
                // ── دستِ کاربر ──
                //
                // هر کارت حالا «عددِ تعیین‌کنندهٔ همین راند» را زیرِ خودش نشان
                // می‌دهد. قبلاً کاربر شش عدد داشت و نمی‌دانست کدام مهم است، پس
                // معمولاً به عددِ «قدرتِ کلی» نگاه می‌کرد — که در ۱۳٪ مواقع
                // برندهٔ راند را اشتباه پیش‌بینی می‌کند.
                SizedBox(
                  height: 164,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final hand = deck
                          .where((raw) {
                            final id = cardIdOf(raw);
                            return remaining.contains(id) || pendingId == id;
                          })
                          .map((raw) => Map<String, dynamic>.from(raw))
                          .toList();
                      if (hand.isEmpty) return const SizedBox.shrink();
                      final cardWidth = math.min(
                        104.0,
                        math.max(84.0, constraints.maxWidth * .30),
                      );
                      final step = hand.length == 1
                          ? 0.0
                          : (constraints.maxWidth - cardWidth) /
                              (hand.length - 1);
                      return Stack(
                        clipBehavior: Clip.none,
                        children: [
                          for (var index = 0; index < hand.length; index++)
                            PositionedDirectional(
                              start: step * index,
                              top: 0,
                              bottom: 0,
                              width: cardWidth,
                              child: Builder(
                                builder: (_) {
                                  final card = hand[index];
                                  final id = cardIdOf(card);
                                  final canPlay = !session.introHolding &&
                                      !iChose &&
                                      remaining.contains(id);
                                  final focusStat =
                                      '${(state['roundFocus'] as Map?)?['stat'] ?? ''}';
                                  final focusTint = _FocusBannerState
                                          ._statColors[focusStat] ??
                                      color;
                                  return AnimatedSlide(
                                    duration: const Duration(milliseconds: 240),
                                    curve: Curves.easeOutBack,
                                    offset: pendingId == id
                                        ? const Offset(0, -.06)
                                        : Offset.zero,
                                    child: Transform.rotate(
                                      angle: (index - (hand.length - 1) / 2) *
                                          .018,
                                      alignment: Alignment.bottomCenter,
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Expanded(
                                            child: PlayerCard(
                                              card: card,
                                              compact: true,
                                              showStats: false,
                                              enabled: canPlay,
                                              selected: pendingId == id,
                                              onTap: canPlay
                                                  ? () => session.moveObject(
                                                        {'cardId': id},
                                                      )
                                                  : null,
                                            ),
                                          ),
                                          Opacity(
                                            opacity: canPlay ? 1 : .4,
                                            child: _FocusStatRibbon(
                                              card: card,
                                              stat: focusStat,
                                              tint: focusTint,
                                              roundIndex: roundIndex,
                                              previousRoundWon:
                                                  lastRound?['winner'] == mine,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _Scoreboard extends StatelessWidget {
  const _Scoreboard({
    required this.myName,
    required this.theirName,
    required this.myScore,
    required this.theirScore,
    required this.color,
    required this.myPlayer,
    required this.theirPlayer,
    required this.title,
    required this.roundLabel,
    required this.lastWinner,
    required this.mySymbol,
    required this.opponentRole,
  });
  final String myName;
  final String theirName;
  final int myScore;
  final int theirScore;
  final Color color;
  final Map? myPlayer;
  final Map? theirPlayer;
  final String title;
  final String roundLabel;
  final String lastWinner;
  final String mySymbol;
  final String opponentRole;

  @override
  Widget build(BuildContext context) {
    final myLead = myScore > theirScore;
    final theirLead = theirScore > myScore;
    final lastMine = lastWinner == mySymbol;
    final lastTheir =
        lastWinner.isNotEmpty && lastWinner != 'DRAW' && !lastMine;
    final status = lastWinner == 'DRAW'
        ? 'راند قبل مساوی شد'
        : lastMine
            ? 'امتیاز راند قبل برای تو بود'
            : lastTheir
                ? 'امتیاز راند قبل برای $opponentRole بود'
                : 'هنوز راندی تمام نشده';

    return Semantics(
      label:
          'امتیاز تو ${faNum(myScore)}، امتیاز $opponentRole ${faNum(theirScore)}. $status',
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Row(
            children: [
              Expanded(
                child: _Score(
                  role: 'تو',
                  name: myName,
                  score: myScore,
                  color: _emerald,
                  player: myPlayer,
                  highlight: myLead,
                  scoredLast: lastMine,
                ),
              ),
              Container(
                constraints: const BoxConstraints(maxWidth: 118),
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: color.withValues(alpha: .30)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      roundLabel,
                      style: TextStyle(
                        color: color,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _Score(
                  role: opponentRole,
                  name: theirName,
                  score: theirScore,
                  color: _rose,
                  player: theirPlayer,
                  reverse: true,
                  highlight: theirLead,
                  scoredLast: lastTheir,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Score extends StatelessWidget {
  const _Score({
    required this.role,
    required this.name,
    required this.score,
    required this.color,
    required this.player,
    this.reverse = false,
    this.highlight = false,
    this.scoredLast = false,
  });
  final String role;
  final String name;
  final int score;
  final Color color;
  final Map? player;
  final bool reverse;
  final bool highlight;
  final bool scoredLast;
  @override
  Widget build(BuildContext context) {
    final cosmetics =
        player?['cosmetics'] is Map ? player!['cosmetics'] as Map : const {};
    final isBot = player?['isBot'] == true;
    final scoreBubble = AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(99),
        boxShadow: highlight || scoredLast
            ? [
                BoxShadow(
                  color: color.withValues(alpha: scoredLast ? .36 : .20),
                  blurRadius: scoredLast ? 18 : 12,
                ),
              ]
            : const [],
      ),
      child: TweenAnimationBuilder<int>(
        tween: IntTween(begin: 0, end: score),
        duration: const Duration(milliseconds: 420),
        builder: (_, value, __) => CircleAvatar(
          radius: 18,
          backgroundColor: const Color(0xFF02060C),
          child: Text(
            faNum(value),
            style: TextStyle(
              color: color,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
    final parts = [
      Stack(
        clipBehavior: Clip.none,
        children: [
          scoreBubble,
          if (scoredLast)
            const PositionedDirectional(top: -7, end: -7, child: _PointBurst()),
        ],
      ),
      if (isBot)
        Icon(Icons.smart_toy_rounded, size: 22, color: color)
      else
        CosmeticAvatarFrame(
          frame: cosmetics['frame'] as String?,
          padding: 2,
          child: AvatarImage(
            imageUrl: player?['profileImageUrl'],
            keyName: player?['profileAvatarKey'],
            radius: 13,
          ),
        ),
      Flexible(
        child: Column(
          crossAxisAlignment:
              reverse ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              role,
              style: TextStyle(
                color: color,
                fontSize: 11.5,
                fontWeight: FontWeight.w900,
              ),
            ),
            DisplayName(
              name: name,
              cosmetics: cosmetics,
              level: (player?['level'] as num?)?.toInt(),
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    ];
    return Row(
      mainAxisAlignment:
          reverse ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: reverse ? parts.reversed.toList() : parts,
    );
  }
}

class _PointBurst extends StatelessWidget {
  const _PointBurst();
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: _emerald,
          borderRadius: BorderRadius.circular(99),
          boxShadow: const [
            BoxShadow(color: Color(0x6622E7A6), blurRadius: 14)
          ],
        ),
        child: const Text(
          '+1',
          style: TextStyle(
            color: Color(0xFF04101A),
            fontWeight: FontWeight.w900,
            fontSize: 11.5,
          ),
        ),
      );
}

class _RoundPips extends StatelessWidget {
  const _RoundPips({
    required this.total,
    required this.current,
    required this.history,
    required this.mine,
    required this.color,
  });
  final int total;
  final int current;
  final List<Map> history;
  final String mine;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < total; i++)
            Container(
              width: 34,
              height: 8,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              decoration: BoxDecoration(
                borderRadius: Corners.rPill,
                color: i < history.length
                    ? ('${history[i]['winner']}' == mine
                        ? _emerald
                        : '${history[i]['winner']}' == 'DRAW'
                            ? _gold
                            : _rose)
                    : i == current
                        ? color
                        : Colors.white12,
              ),
            ),
        ],
      );
}

/// ═══════════════════════════════════════════════════════════════════════
/// نمایشِ سینماتیکِ راند — چهار فاز، مو‌به‌مو مثلِ نسخهٔ وب
/// ═══════════════════════════════════════════════════════════════════════
///
/// نسخهٔ قبلی یک `TweenAnimationBuilder` ساده بود: کلِ کارت با هم بزرگ
/// می‌شد و همهٔ اطلاعات از فریمِ اول روی صفحه بود. کامل ولی بی‌تعلیق —
/// کاربر نتیجه را می‌دید قبل از اینکه بفهمد چه شد.
///
/// حالا دقیقاً همان چهار فازِ وب:
///   ۱. charge  (۴۵۰ms) — دو کارت از دو طرف هجوم می‌آورند
///   ۲. impact  (۳۰۰ms) — فلاش، حلقهٔ ضربه، لرزش، و ویژگیِ راند
///   ۳. numbers (۵۵۰ms) — دو عددِ قدرت با شمارشِ صعودی
///   ۴. verdict          — مهرِ برنده و توضیح
///
/// ── چرا StatefulWidget و نه فقط TweenAnimationBuilder ──
///
/// فازها باید محتوا را **از درخت حذف** کنند نه فقط شفافش کنند، وگرنه
/// TalkBack عددِ برنده را قبل از موعد می‌خواند و تعلیق بی‌معنی می‌شود.
/// این با تویین تنها ممکن نیست.
///
/// ⚠️ درسِ ثبت‌شدهٔ این پروژه: `late final AnimationController` روی فیلد
/// یک بار باگ داد. اینجا کنترلر در `initState` ساخته و در `dispose` بسته
/// می‌شود، و `didUpdateWidget` برای راندِ تازه ریستش می‌کند — بدونِ آن،
/// راندِ دوم به بعد اصلاً انیمیشن نداشت (همان باگی که در وب با `key` حل شد).
enum _RevealPhase { charge, impact, numbers, verdict }

class _ClashStage extends StatefulWidget {
  const _ClashStage({
    required this.round,
    required this.mine,
    required this.color,
    this.opponentRole = 'حریف',
  });
  final Map<String, dynamic>? round;
  final String mine;
  final Color color;
  final String opponentRole;

  @override
  State<_ClashStage> createState() => _ClashStageState();
}

class _ClashStageState extends State<_ClashStage>
    with SingleTickerProviderStateMixin {
  // ── زمان‌بندیِ نمایشِ نتیجه ──
  //
  // مجموعِ فازها: ۶۰۰ + ۴۰۰ + ۹۰۰ = ۱۹۰۰ms تا حکم.
  //
  // ⚠️ باید کمتر از `resultHoldMs` سرور (۳۲۰۰ms) بماند وگرنه راندِ
  //    بعد وسطِ انیمیشن شروع می‌شود — دقیقاً همان چیزی که مالک گزارش
  //    کرد: «سریع میاد بدون اینکه لود بشه میره». با این عدد، فازِ
  //    «حکم» ۱٫۹ ثانیه فرصتِ دیده‌شدن دارد.
  //
  //    نسخهٔ قبل ۱۳۰۰ms بود و سرور هیچ مکثی نداشت، پس نتیجه عملاً
  //    بلافاصله با اعلانِ راندِ بعد پوشانده می‌شد.
  static const _total = Duration(milliseconds: 1900);
  static const _chargeEnd = 600 / 1900;
  static const _impactEnd = 1000 / 1900;
  // ⚠️ حتماً `1.0` و نه `1`: استنتاجِ نوع آن را int می‌کرد و
  // `Curves.transform(int)` خطای کامپایل می‌داد.
  static const _numbersEnd = 1.0;

  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: _total,
  );

  @override
  void initState() {
    super.initState();
    if (widget.round != null) _c.forward();
  }

  @override
  void didUpdateWidget(covariant _ClashStage old) {
    super.didUpdateWidget(old);
    // راندِ تازه = انیمیشن از اول. بدونِ این مقایسه، هر rebuildِ بی‌ربط
    // (مثلاً تیک ساعت) انیمیشن را ریست می‌کرد و صحنه می‌لرزید.
    final before = old.round?['round'];
    final now = widget.round?['round'];
    if (before != now && widget.round != null) {
      _c
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  _RevealPhase get _phase {
    final t = _c.value;
    if (t < _chargeEnd) return _RevealPhase.charge;
    if (t < _impactEnd) return _RevealPhase.impact;
    if (t < _numbersEnd) return _RevealPhase.numbers;
    return _RevealPhase.verdict;
  }

  /// پیشرفتِ ۰..۱ داخلِ یک بازهٔ مشخص — برای انیمیشنِ هر فاز جداگانه.
  double _span(double from, double to) =>
      ((_c.value - from) / (to - from)).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) =>
      AnimatedBuilder(animation: _c, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final round = widget.round;
    final mine = widget.mine;
    final color = widget.color;
    if (round == null) {
      return Container(
        height: 210,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: RadialGradient(
            colors: [color.withValues(alpha: 0.16), const Color(0xFF07111D)],
          ),
          border: Border.all(color: Colors.white10),
        ),
        child: const Text(
          'منتظر برخورد اول…',
          style: TextStyle(color: Colors.white54, fontWeight: FontWeight.w800),
        ),
      );
    }
    final view = CardDuelRoundPerspective.from(round, mine);
    final myCard = view.mine;
    final otherCard = view.theirs;
    final myPower = view.myPower;
    final otherPower = view.theirPower;
    final iWon = view.iWon;
    final draw = view.draw;
    final opponentRole = widget.opponentRole;
    final verdictText = !view.contractValid
        ? 'خطای همگام‌سازی'
        : draw
            ? 'مساوی'
            : iWon
                ? '+۱ تو'
                : '+۱ $opponentRole';
    final winnerSummary = draw
        ? 'عدد نهایی تو و $opponentRole هر دو ${faNum(myPower)} شد؛ امتیازی اضافه نشد.'
        : iWon
            ? 'کارت تو «${myCard['name'] ?? 'بدون نام'}» با ${faNum(myPower)} در برابر ${faNum(otherPower)} برد؛ یک امتیاز به تو اضافه شد.'
            : 'کارت $opponentRole «${otherCard['name'] ?? 'بدون نام'}» با ${faNum(otherPower)} در برابر ${faNum(myPower)} برد؛ یک امتیاز به $opponentRole اضافه شد.';
    final phase = _phase;
    final outcome = draw
        ? _gold
        : iWon
            ? _emerald
            : _rose;
    final showNumbers =
        phase == _RevealPhase.numbers || phase == _RevealPhase.verdict;
    final showVerdict = phase == _RevealPhase.verdict;

    // فاز ۱ — هجوم از دو طرف.
    final charge = Curves.easeOutCubic.transform(_span(0, _chargeEnd));
    // فاز ۲ — لرزش و فلاش.
    final impactT = _span(_chargeEnd, _impactEnd);
    // موجِ دایره‌ای که از مرکز بیرون می‌زند.
    final ringT = Curves.easeOut.transform(impactT);
    // لرزشِ میرا: دامنه با پیشرفتِ فاز کم می‌شود.
    final shake = phase == _RevealPhase.impact
        ? math.sin(impactT * math.pi * 6) * 5 * (1 - impactT)
        : 0.0;
    // فاز ۳ — شمارشِ صعودی عددها.
    final countT = Curves.easeOutCubic.transform(
      _span(_impactEnd, _numbersEnd),
    );

    return Semantics(
      label: 'نتیجه راند ${faNum(round['round'])}. $winnerSummary',
      child: Transform.translate(
        offset: Offset(shake, 0),
        child: Stack(
          children: [
            // فلاشِ سفیدِ لحظهٔ برخورد + حلقهٔ ضربه.
            if (phase == _RevealPhase.impact)
              Positioned.fill(
                child: IgnorePointer(
                  child: Center(
                    child: Opacity(
                      opacity: (1 - impactT).clamp(0.0, 1.0) * 0.9,
                      child: Container(
                        width: 26 + ringT * 320,
                        height: 26 + ringT * 320,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: outcome,
                            width: 2.5 * (1 - ringT) + 0.5,
                          ),
                          gradient: RadialGradient(
                            colors: [
                              Colors.white.withValues(
                                alpha: 0.30 * (1 - impactT),
                              ),
                              Colors.transparent,
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                borderRadius: Corners.rXl,
                gradient: LinearGradient(
                  colors: [
                    outcome.withValues(alpha: 0.16),
                    const Color(0xFF07111D),
                  ],
                ),
                border: Border.all(
                  color: outcome.withValues(alpha: 0.55),
                  width: 1.4,
                ),
                boxShadow: [
                  BoxShadow(
                    color: outcome.withValues(alpha: showVerdict ? .30 : .16),
                    blurRadius: showVerdict ? 34 : 22,
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    textDirection: TextDirection.rtl,
                    children: [
                      // کارتِ من همیشه سمت راست؛ حریف همیشه سمت چپ.
                      Expanded(
                        child: Opacity(
                          opacity: charge,
                          child: Transform.translate(
                            offset: Offset(38 * (1 - charge), 0),
                            child: Transform.rotate(
                              angle: 0.12 * (1 - charge),
                              child: _ClashCardOwner(
                                owner: 'تو',
                                tint: _emerald,
                                card: myCard,
                                winner: showVerdict && iWon,
                                loser: showVerdict && !draw && !iWon,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              '${faNum(round['round'])} • ${round['focusLabel'] ?? round['title']}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.white60,
                                fontWeight: FontWeight.w900,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 7),
                            Column(
                              children: [
                                _RoundPowerLine(
                                  owner: 'تو',
                                  value: showNumbers ? myPower * countT : 0,
                                  visible: showNumbers,
                                  lead: showVerdict && iWon,
                                  color: _emerald,
                                ),
                                const SizedBox(height: 3),
                                _RoundPowerLine(
                                  owner: opponentRole,
                                  value: showNumbers ? otherPower * countT : 0,
                                  visible: showNumbers,
                                  lead: showVerdict && !draw && !iWon,
                                  color: _rose,
                                ),
                              ],
                            ),
                            const SizedBox(height: 7),
                            // مهرِ برنده: از بزرگ و چرخیده می‌کوبد روی جایش.
                            if (showVerdict)
                              TweenAnimationBuilder<double>(
                                key: ValueKey('stamp-${round['round']}'),
                                tween: Tween(begin: 0, end: 1),
                                duration: const Duration(milliseconds: 420),
                                curve: Curves.easeOutBack,
                                builder: (_, t, child) => Opacity(
                                  opacity: t.clamp(0.0, 1.0),
                                  child: Transform.rotate(
                                    angle: -0.22 * (1 - t),
                                    child: Transform.scale(
                                      scale: 0.6 +
                                          0.4 * t +
                                          1.2 * (1 - t) * (1 - t),
                                      child: child,
                                    ),
                                  ),
                                ),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: outcome.withValues(alpha: 0.18),
                                    borderRadius: BorderRadius.circular(99),
                                    border: Border.all(
                                      color: outcome.withValues(alpha: 0.5),
                                    ),
                                  ),
                                  child: Text(
                                    verdictText,
                                    style: TextStyle(
                                      color: outcome,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.6,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      // کارتِ حریف از چپ.
                      Expanded(
                        child: Opacity(
                          opacity: charge,
                          child: Transform.translate(
                            offset: Offset(-38 * (1 - charge), 0),
                            child: Transform.rotate(
                              angle: -0.12 * (1 - charge),
                              child: _ClashCardOwner(
                                owner: opponentRole,
                                tint: _rose,
                                card: otherCard,
                                winner: showVerdict && !draw && !iWon,
                                loser: showVerdict && iWon,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (showVerdict && !draw)
              Positioned.fill(
                child: _VictoryBurst(
                  key: ValueKey('burst-${round['round']}'),
                  color: outcome,
                  towardRight: iWon,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _VictoryBurst extends StatelessWidget {
  const _VictoryBurst({
    super.key,
    required this.color,
    required this.towardRight,
  });
  final Color color;
  final bool towardRight;

  static const _rays = <Offset>[
    Offset(-72, -58),
    Offset(-86, 4),
    Offset(-58, 58),
    Offset(-8, -82),
    Offset(12, 78),
    Offset(62, -62),
    Offset(84, 2),
    Offset(62, 58),
  ];

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 850),
          curve: Curves.easeOutCubic,
          builder: (_, t, __) => Stack(
            children: [
              for (var i = 0; i < _rays.length; i++)
                Align(
                  alignment: Alignment(towardRight ? .62 : -.62, 0),
                  child: Transform.translate(
                    offset: _rays[i] * t,
                    child: Opacity(
                      opacity: (1 - t).clamp(0.0, 1.0),
                      child: Icon(
                        i.isEven ? Icons.star_rounded : Icons.circle,
                        size: i.isEven ? 13 : 7,
                        color: i % 3 == 0 ? _gold : color,
                        shadows: [Shadow(color: color, blurRadius: 12)],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class _ClashCardOwner extends StatelessWidget {
  const _ClashCardOwner({
    required this.owner,
    required this.tint,
    required this.card,
    required this.winner,
    required this.loser,
  });
  final String owner;
  final Color tint;
  final Map<String, dynamic> card;
  final bool winner;
  final bool loser;

  @override
  Widget build(BuildContext context) => Semantics(
        label:
            '$owner، ${card['name'] ?? 'کارت بدون نام'}${winner ? '، برندهٔ این راند' : loser ? '، بازندهٔ این راند' : ''}',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: tint.withValues(alpha: .16),
                borderRadius: BorderRadius.circular(99),
                border: Border.all(color: tint.withValues(alpha: .55)),
                boxShadow: winner
                    ? [
                        BoxShadow(
                            color: tint.withValues(alpha: .42), blurRadius: 18)
                      ]
                    : const [],
              ),
              child: Text(
                owner,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: tint,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(height: 5),
            AspectRatio(
              aspectRatio: 0.68,
              child: PlayerCard(
                card: card,
                compact: true,
                showStats: false,
                winner: winner,
                loser: loser,
              ),
            ),
          ],
        ),
      );
}

class _RoundPowerLine extends StatelessWidget {
  const _RoundPowerLine({
    required this.owner,
    required this.value,
    required this.visible,
    required this.lead,
    required this.color,
  });
  final String owner;
  final num value;
  final bool visible;
  final bool lead;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
        label: visible
            ? 'عدد نهایی $owner ${faNum(value.round())}'
            : 'عدد $owner پنهان است',
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: color.withValues(alpha: lead ? .20 : .09),
            borderRadius: BorderRadius.circular(10),
            border:
                Border.all(color: color.withValues(alpha: lead ? .62 : .24)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            textDirection: TextDirection.rtl,
            children: [
              Text(
                '$owner:',
                style: TextStyle(
                  color: color,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: 4),
              _PowerNumber(
                value: value,
                visible: visible,
                lead: lead,
                color: color,
              ),
            ],
          ),
        ),
      );
}

/// عددِ قدرت با شمارشِ صعودی.
///
/// جدا شد چون دو بار استفاده می‌شود و منطقِ «برنده بزرگ‌تر و طلایی» نباید
/// در دو جا کپی شود.
class _PowerNumber extends StatelessWidget {
  const _PowerNumber({
    required this.value,
    required this.visible,
    required this.lead,
    required this.color,
  });
  final num value;
  final bool visible;
  final bool lead;
  final Color color;

  @override
  Widget build(BuildContext context) => AnimatedDefaultTextStyle(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutBack,
        style: TextStyle(
          fontFamily: 'Vazirmatn',
          fontSize: lead ? 26 : 22,
          fontWeight: FontWeight.w900,
          color: !visible ? Colors.white38 : color,
          shadows: lead
              ? [Shadow(color: color.withValues(alpha: .70), blurRadius: 18)]
              : const <Shadow>[],
        ),
        // ⚠️ چرا «؟» به‌جای Opacity(0)
        //
        // نسخهٔ قبلی عدد را نامرئی می‌کرد ولی جایش خالی می‌ماند، پس در
        // فازهای charge/impact وسطِ صحنه یک حفرهٔ بی‌معنی بود. حالا
        // علامتِ سؤال نشان می‌دهد «عدد هست ولی هنوز فاش نشده» — همان
        // قراردادی که نسخهٔ وب هم دارد، تا دو پلتفرم یک حس بدهند.
        //
        // عرض هم ثابت می‌ماند، پس در لحظهٔ فاش شدنِ عدد ردیف نمی‌پرد.
        child: Text(
          visible ? faNum(value.round()) : '؟',
          textDirection: TextDirection.ltr,
        ),
      );
}

class _Finale extends StatelessWidget {
  const _Finale({
    required this.session,
    required this.color,
    required this.onAgain,
    required this.onEdit,
    required this.onShare,
    required this.sharing,
    required this.mvp,
    required this.privateLobby,
  });
  final GameSession session;
  final Color color;
  final VoidCallback onAgain;
  final VoidCallback onEdit;
  final VoidCallback onShare;
  final bool sharing;
  final Map<String, dynamic>? mvp;
  final bool privateLobby;

  @override
  Widget build(BuildContext context) {
    final won = session.iWon;
    final draw = session.winner == 'DRAW';
    final history = (session.state['history'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    final score = session.state['score'] is Map
        ? session.state['score'] as Map
        : const {};
    final me = session.mySymbol ?? 'X';
    final other = me == 'X' ? 'O' : 'X';
    return Stack(
      clipBehavior: Clip.hardEdge,
      children: [
        Container(
          padding: const EdgeInsets.all(Gaps.md),
          decoration: BoxDecoration(
            borderRadius: Corners.rXl,
            gradient: const LinearGradient(
              colors: [Color(0xFF17304C), Color(0xFF050A12)],
            ),
            border: Border.all(color: color),
          ),
          child: Column(
            children: [
              Text(
                draw
                    ? 'DRAW'
                    : won
                        ? 'VICTORY'
                        : 'DEFEAT',
                style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 3,
                  color: draw
                      ? _gold
                      : won
                          ? _emerald
                          : _rose,
                ),
              ),
              Text(
                'تو ${faNum(score[me])} — ${session.vsBot ? 'ربات' : 'حریف'} ${faNum(score[other])}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (!session.vsBot || session.finishReason == 'disconnect') ...[
                Gaps.vXs,
                Text(
                  session.finishReason == 'disconnect'
                      ? session.resultText
                      : draw
                          ? 'ورودی برگشت خورد'
                          : won
                              ? 'تسویه شد'
                              : '−${faNum(session.stake)} امتیاز',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: Colors.white60),
                ),
              ],
              Gaps.vSm,
              if (history.isNotEmpty)
                _RoundPips(
                  total: 5,
                  current: 5,
                  history: history,
                  mine: me,
                  color: color,
                ),
              if (history.isNotEmpty) ...[
                Gaps.vSm,
                Theme(
                  data: Theme.of(context)
                      .copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    collapsedIconColor: Colors.white70,
                    iconColor: Colors.white,
                    title: const Text(
                      'جزئیات راندها',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    children: [
                      for (final raw in history)
                        _FinalRoundBreakdown(
                          round: Map<String, dynamic>.from(raw),
                          mySymbol: me,
                          opponentRole: session.vsBot ? 'ربات' : 'حریف',
                        ),
                    ],
                  ),
                ),
              ],
              if (mvp != null) ...[
                Gaps.vSm,
                SizedBox(
                  width: 140,
                  height: 196,
                  child: PlayerCard(
                    card: mvp!,
                    compact: true,
                    showStats: false,
                    winner: true,
                  ),
                ),
                Text(
                  'MVP · ${mvp!['name']}',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ],
              Gaps.vSm,
              OutlinedButton.icon(
                onPressed: sharing ? null : onShare,
                icon: const Icon(Icons.ios_share_rounded, size: 17),
                label: Text(
                  sharing ? 'در حال ساخت…' : 'اشتراک',
                ),
              ),
              Gaps.vSm,
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: session.rematchWaiting ? null : onAgain,
                      child: Text(
                        session.rematchWaiting
                            ? 'منتظر حریف…'
                            : session.rematchAvailable
                                ? 'دوباره'
                                : privateLobby
                                    ? 'بازگشت به لابی'
                                    : 'دوباره',
                      ),
                    ),
                  ),
                  Gaps.hXs,
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onEdit,
                      child: const Text('ترکیب'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (session.stakePayoutSequence > 0)
          Positioned.fill(
            child: IgnorePointer(
              child: _StakePayoutFlight(
                key: ValueKey(session.stakePayoutSequence),
                amount: session.stakePayoutAmount,
                mineWon: session.stakePayoutWinner == me,
                balanceAfter: session.stakeWinnerBalanceAfter,
                opponentRole: session.vsBot ? 'ربات' : 'حریف',
              ),
            ),
          ),
      ],
    );
  }
}

class _StakePayoutFlight extends StatefulWidget {
  const _StakePayoutFlight({
    super.key,
    required this.amount,
    required this.mineWon,
    required this.balanceAfter,
    required this.opponentRole,
  });

  final int amount;
  final bool mineWon;
  final int? balanceAfter;
  final String opponentRole;

  @override
  State<_StakePayoutFlight> createState() => _StakePayoutFlightState();
}

class _StakePayoutFlightState extends State<_StakePayoutFlight>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2650),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final owner = widget.mineWon ? 'تو' : widget.opponentRole;
    return Semantics(
      liveRegion: true,
      label: '${faNum(widget.amount)} امتیاز به $owner اضافه شد',
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => LayoutBuilder(
          builder: (context, constraints) {
            final v = _controller.value;
            final fade = v < .80 ? 1.0 : (1 - (v - .80) / .20).clamp(0.0, 1.0);
            final center =
                Offset(constraints.maxWidth / 2, constraints.maxHeight * .42);
            return Opacity(
              opacity: fade,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: const Alignment(0, -.05),
                          colors: [
                            _gold.withValues(alpha: .24 * fade),
                            Colors.transparent,
                          ],
                          radius: .72,
                        ),
                      ),
                    ),
                  ),
                  for (var index = 0; index < 14; index++)
                    Builder(
                      builder: (_) {
                        final delay = index * .018;
                        final p = ((v - delay) / .62).clamp(0.0, 1.0);
                        final eased = Curves.easeOutCubic.transform(p);
                        final start = Offset(
                          constraints.maxWidth * (.06 + index * .068),
                          constraints.maxHeight * .92,
                        );
                        final arc =
                            math.sin(math.pi * eased) * (42 + (index % 4) * 9);
                        final point = Offset.lerp(start, center, eased)! +
                            Offset((index.isEven ? -1 : 1) * arc * .38, -arc);
                        return Positioned(
                          left: point.dx - 11,
                          top: point.dy - 11,
                          child: Transform.rotate(
                            angle: eased * math.pi * (3 + index % 3),
                            child: Transform.scale(
                              scale: .45 + .55 * math.sin(math.pi * p).abs(),
                              child: Container(
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: const LinearGradient(
                                    colors: [
                                      Color(0xFFFFF2A8),
                                      Color(0xFFF59E0B)
                                    ],
                                  ),
                                  border: Border.all(color: Colors.white54),
                                  boxShadow: const [
                                    BoxShadow(color: _gold, blurRadius: 13),
                                  ],
                                ),
                                alignment: Alignment.center,
                                child: const Text(
                                  '+',
                                  style: TextStyle(
                                    color: Color(0xFF5B3700),
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  Align(
                    alignment: const Alignment(0, -.08),
                    child: Transform.translate(
                      offset: Offset(
                          0,
                          95 -
                              Curves.easeOutBack
                                      .transform(v.clamp(0.0, .55) / .55) *
                                  112),
                      child: Transform.scale(
                        scale: .45 +
                            .55 *
                                Curves.easeOutBack
                                    .transform((v / .30).clamp(0.0, 1.0)),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 17, vertical: 8),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    Color(0xFFFFF2A8),
                                    _gold,
                                    Color(0xFFF59E0B)
                                  ],
                                ),
                                borderRadius: Corners.rLg,
                                border: Border.all(color: Colors.white70),
                                boxShadow: const [
                                  BoxShadow(
                                      color: _gold,
                                      blurRadius: 36,
                                      spreadRadius: 3),
                                  BoxShadow(
                                      color: Colors.black54,
                                      blurRadius: 20,
                                      offset: Offset(0, 12)),
                                ],
                              ),
                              child: Text(
                                '+${faNum(widget.amount)}',
                                textDirection: TextDirection.ltr,
                                style: const TextStyle(
                                  color: Color(0xFF3B2500),
                                  fontSize: 34,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            const SizedBox(height: 7),
                            Text(
                              widget.mineWon && widget.balanceAfter != null
                                  ? 'موجودی جدید: ${faNum(widget.balanceAfter)}'
                                  : 'امتیاز به $owner اضافه شد',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                shadows: [
                                  Shadow(color: Colors.black, blurRadius: 9)
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.message, required this.onBack});
  final String message;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(
          children: [
            Icon(
              Icons.error_outline_rounded,
              color: Theme.of(context).colorScheme.error,
              size: 34,
            ),
            Gaps.vXs,
            Text(message, textAlign: TextAlign.center),
            Gaps.vSm,
            FilledButton(
                onPressed: onBack, child: const Text('بازگشت به ترکیب')),
          ],
        ),
      );
}

String _settlementLabel(String status) {
  switch (status) {
    case 'pending':
      return 'تسویه در انتظار';
    case 'refunded':
      return 'برگشت‌خورده';
    default:
      return 'تسویه‌شده';
  }
}

class _DeckIntelPanel extends StatelessWidget {
  const _DeckIntelPanel({
    required this.activeInsights,
    required this.suggestedDeck,
    required this.onApplySuggested,
  });

  final Map<String, dynamic>? activeInsights;
  final Map<String, dynamic>? suggestedDeck;
  final VoidCallback onApplySuggested;

  @override
  Widget build(BuildContext context) {
    final insights = activeInsights ??
        (suggestedDeck?['insights'] is Map
            ? Map<String, dynamic>.from(suggestedDeck!['insights'] as Map)
            : null);
    if (insights == null) return const SizedBox.shrink();
    final warnings = (insights['warnings'] as List? ?? const [])
        .map((e) => '$e')
        .where((e) => e.isNotEmpty)
        .toList(growable: false);
    final strengths = (insights['strengths'] as List? ?? const [])
        .map((e) => '$e')
        .where((e) => e.isNotEmpty)
        .toList(growable: false);
    final order = (insights['recommendedOrder'] as List? ?? const [])
        .whereType<Map>()
        .toList(growable: false);
    final warning = warnings.isEmpty ? null : warnings.first;
    final strength = strengths.isEmpty ? null : strengths.first;
    final opener = order.isEmpty ? null : '${order.first['name'] ?? ''}';
    final tint = warning == null ? _emerald : _gold;
    final summary = warning ?? strength ?? 'ترکیب متعادل';

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: tint.withValues(alpha: .14),
            ),
            child: Icon(
              warning == null ? Icons.verified_rounded : Icons.bolt_rounded,
              color: tint,
              size: 20,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  warning == null ? 'ترکیب آماده' : 'یک اصلاح پیشنهادی',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  opener == null ? summary : '$summary  •  شروع: $opener',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Colors.white60,
                  ),
                ),
              ],
            ),
          ),
          if (suggestedDeck != null)
            IconButton(
              onPressed: onApplySuggested,
              icon: const Icon(Icons.auto_fix_high_rounded, size: 20),
              color: _cyan,
              tooltip: 'چیدن خودکار',
            ),
        ],
      ),
    );
  }
}

class _FinalRoundBreakdown extends StatelessWidget {
  const _FinalRoundBreakdown({
    required this.round,
    required this.mySymbol,
    required this.opponentRole,
  });
  final Map<String, dynamic> round;
  final String mySymbol;
  final String opponentRole;

  @override
  Widget build(BuildContext context) {
    final view = CardDuelRoundPerspective.from(round, mySymbol);
    final mineWon = view.iWon;
    final draw = view.draw;
    final mine = view.mine;
    final theirs = view.theirs;
    final breakdownMine = view.myBreakdown;
    final breakdownTheirs = view.theirBreakdown;
    final headline = draw
        ? _gold
        : mineWon
            ? _emerald
            : _rose;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(Gaps.sm),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .04),
        borderRadius: Corners.rLg,
        border: Border.all(color: headline.withValues(alpha: .22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'راند ${faNum(round['round'])} · ${round['focusLabel'] ?? round['title']}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: headline.withValues(alpha: .16),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  draw
                      ? 'مساوی'
                      : mineWon
                          ? '+۱ برای تو'
                          : '+۱ برای $opponentRole',
                  style: TextStyle(
                    color: headline,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'کارت تو: ${mine['name'] ?? 'بدون نام'}  •  کارت $opponentRole: ${theirs['name'] ?? 'بدون نام'}',
            style: const TextStyle(fontSize: 12, color: Colors.white70),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _MiniBreakChip(
                label: 'ویژگی',
                value: '${round['focusLabel'] ?? round['title']}',
                tint: _cyan,
              ),
              _MiniBreakChip(
                label: 'عدد نهایی تو',
                value: faNum(view.myPower),
                tint: mineWon ? _emerald : _cyan,
              ),
              _MiniBreakChip(
                label: 'عدد نهایی $opponentRole',
                value: faNum(view.theirPower),
                tint: !draw && !mineWon ? _rose : _gold,
              ),
              _MiniBreakChip(
                label: 'اختلاف',
                value: faNum(round['powerGap'] ?? 0),
                tint: headline,
              ),
            ],
          ),
          const SizedBox(height: 8),
          _BreakdownRow(title: 'تو', data: breakdownMine),
          const SizedBox(height: 6),
          _BreakdownRow(title: opponentRole, data: breakdownTheirs),
          const SizedBox(height: 8),
          Text(
            '${round['reason'] ?? ''}',
            style: const TextStyle(
              fontSize: 12,
              color: Colors.white70,
              height: 1.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({required this.title, required this.data});
  final String title;
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final focus = NumberParser.toInt(data['focus']);
    final effect = NumberParser.toInt(data['effectBonus']);
    final total = NumberParser.toInt(data['total']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$title:  ${faNum(focus)}${effect == 0 ? '' : ' + افکت ${faNum(effect)}'} = ${faNum(total)}',
          style: const TextStyle(
            fontSize: 12,
            color: Colors.white70,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _MiniBreakChip extends StatelessWidget {
  const _MiniBreakChip({
    required this.label,
    required this.value,
    required this.tint,
  });
  final String label;
  final String value;
  final Color tint;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tint.withValues(alpha: .18)),
        ),
        child: Text(
          '$label: $value',
          style: TextStyle(
            fontSize: 11.5,
            color: tint,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}

class _History extends StatelessWidget {
  const _History({required this.battles});
  final List battles;
  @override
  Widget build(BuildContext context) {
    const labels = {'online': 'نبرد آنلاین', 'lobby': 'لابی خصوصی'};
    final rows = battles
        .whereType<Map>()
        .where((raw) => raw['mode'] != 'bot')
        .take(5)
        .toList(growable: false);
    return AppCard(
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: false,
          tilePadding: const EdgeInsets.symmetric(horizontal: Gaps.sm),
          childrenPadding: const EdgeInsets.fromLTRB(
            Gaps.sm,
            0,
            Gaps.sm,
            Gaps.sm,
          ),
          title: Text(
            rows.isEmpty
                ? 'آخرین نبردها'
                : 'آخرین نبردها (${faNum(rows.length)})',
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
          subtitle: const Text(
            'فقط پنج بازی آنلاین اخیر؛ تمرین با ربات ثبت نمی‌شود',
            style: TextStyle(fontSize: 12, color: Colors.white54),
          ),
          children: [
            if (rows.isEmpty)
              const Padding(
                padding: EdgeInsets.only(bottom: Gaps.sm),
                child: Text(
                  'هنوز نبرد آنلاینی نداری. تاریخچه اینجا جمع نمی‌شود تا صفحه سبک بماند.',
                ),
              ),
            for (final raw in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: Gaps.xs),
                child: AppCard(
                  padding: const EdgeInsets.all(Gaps.sm),
                  elevated: false,
                  child: Row(
                    children: [
                      Icon(
                        NumberParser.toInt(raw['userDelta']) > 0
                            ? Icons.trending_up_rounded
                            : NumberParser.toInt(raw['userDelta']) < 0
                                ? Icons.trending_down_rounded
                                : Icons.diamond_outlined,
                        color: NumberParser.toInt(raw['userDelta']) >= 0
                            ? _emerald
                            : BrandColors.danger,
                      ),
                      Gaps.hSm,
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              labels['${raw['mode']}'] ?? 'دوئل کارت',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              'تو ${faNum(raw['userScore'])} · حریف ${faNum(raw['opponentScore'])} · '
                              '${_settlementLabel('${raw['settlementStatus'] ?? 'settled'}')}',
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: Colors.white54,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        NumberParser.toInt(raw['userDelta']) > 0
                            ? '+${faNum(raw['userDelta'])}'
                            : faNum(raw['userDelta']),
                        style: TextStyle(
                          color: NumberParser.toInt(raw['userDelta']) >= 0
                              ? _emerald
                              : BrandColors.danger,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════
/// بنرِ معیارِ راند — «این راند سرِ چه چیزی است»
/// ═══════════════════════════════════════════════════════════════════════
///
/// ── گزارشِ مالک ──
///
///   «هر راند نوشته میشه که اون راند سر چی مبارزه میشه ولی انقدر کوچیک
///    بدون هیچ انیمیشنی هستش که باعث میشه اصلا دیده نشه. باید خیلی زیبا و
///    جذاب و انیمییشنی مشخص شه هر راند سر چی قراره مبارزه بشه»
///
/// قبلاً این اطلاعات یک `Text` با فونت ۹ و رنگ `white54` بود، چسبیده به
/// بقیهٔ متن‌ها. عملاً نامرئی.
///
/// ── چرا این فقط «زیباسازی» نیست ──
///
/// مالک شکایتِ دیگری هم داشت: «عدد ربات با اینکه پایین‌تر نشون داده میشه
/// راند رو اون میبره». بازتولید کردم و علتش دقیقاً همین نامرئی بودن است:
///
///   • روی کارت عددِ «قدرتِ کلی» نوشته می‌شود (میانگینِ وزنیِ همهٔ آمار)
///   • ولی راند روی **یک ویژگیِ خاص** داوری می‌شود (سرعت، تکنیک، ...)
///
/// اندازه‌گیریِ آماری روی ۵۰۷۵ راند: **۱۳.۴٪ مواقع** کارتی که عددِ کلیِ
/// بزرگ‌تری دارد راند را می‌بازد. این باگِ موتور نیست — موتور درست کار
/// می‌کند — باگِ ارتباط است. کاربر معیارِ اشتباهی را نگاه می‌کرد.
///
/// پس این بنر هم مشکلِ «دیده نمی‌شود» را حل می‌کند و هم مشکلِ «چرا باختم؟»
/// را: معیار را بزرگ اعلام می‌کند و `_FocusStatRibbon` روی هر کارت همان
/// عدد را نشان می‌دهد.
class _FocusBanner extends StatefulWidget {
  const _FocusBanner({
    required this.focus,
    required this.fallbackTitle,
    required this.roundNumber,
  });

  final Map<String, dynamic>? focus;
  final String fallbackTitle;
  final int roundNumber;

  @override
  State<_FocusBanner> createState() => _FocusBannerState();
}

class _FocusBannerState extends State<_FocusBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..forward();
  // درخششِ آرامِ بی‌پایان تا وقتی کاربر انتخاب نکرده — چشم را می‌کشد
  // بدونِ اینکه آزاردهنده باشد.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat(reverse: true);

  @override
  void didUpdateWidget(covariant _FocusBanner old) {
    super.didUpdateWidget(old);
    // راندِ تازه = اعلانِ تازه. بدونِ این، بنر فقط یک بار در کلِ بازی
    // انیمیشن داشت و بقیهٔ راندها بی‌صدا عوض می‌شدند.
    if (old.roundNumber != widget.roundNumber) {
      _c
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _pulse.dispose();
    super.dispose();
  }

  static const _statIcons = <String, IconData>{
    'speed': Icons.bolt_rounded,
    'technique': Icons.auto_awesome_rounded,
    'attack': Icons.local_fire_department_rounded,
    'defense': Icons.shield_rounded,
    'goalChance': Icons.sports_soccer_rounded,
  };
  static const _statColors = <String, Color>{
    'speed': Color(0xFF38BDF8),
    'technique': Color(0xFFA855F7),
    'attack': Color(0xFFFB7185),
    'defense': Color(0xFF22E7A6),
    'goalChance': Color(0xFFFFD166),
  };
  static const _statNames = <String, String>{
    'speed': 'سرعت',
    'technique': 'تکنیک',
    'attack': 'حمله',
    'defense': 'دفاع',
    'goalChance': 'شانس گل',
  };

  @override
  Widget build(BuildContext context) {
    final stat = '${widget.focus?['stat'] ?? ''}';
    final label = '${widget.focus?['label'] ?? widget.fallbackTitle}';
    final text = '${widget.focus?['text'] ?? ''}';
    if (label.trim().isEmpty) return const SizedBox.shrink();
    final tint = _statColors[stat] ?? const Color(0xFF38BDF8);
    final icon = _statIcons[stat] ?? Icons.stars_rounded;
    final statName = _statNames[stat] ?? '';

    return AnimatedBuilder(
      animation: Listenable.merge([_c, _pulse]),
      builder: (context, _) {
        final t = Curves.easeOutBack.transform(_c.value.clamp(0.0, 1.0));
        final glow = 0.30 + 0.28 * _pulse.value;
        return Opacity(
          opacity: _c.value.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, 18 * (1 - t)),
            child: Transform.scale(
              scale: 0.92 + 0.08 * t,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(
                    colors: [
                      tint.withValues(alpha: 0.26),
                      const Color(0xFF07111D),
                    ],
                  ),
                  border: Border.all(
                    color: tint.withValues(alpha: glow + 0.25),
                    width: 1.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: tint.withValues(alpha: glow * 0.5),
                      blurRadius: 24,
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    // آیکونِ ویژگی، با هالهٔ نبض‌دار.
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: tint.withValues(alpha: 0.18),
                        border: Border.all(
                          color: tint.withValues(alpha: 0.55),
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: tint.withValues(alpha: glow * 0.7),
                            blurRadius: 16,
                          ),
                        ],
                      ),
                      child: Transform.scale(
                        scale: 0.9 + 0.14 * _pulse.value,
                        child: Icon(icon, color: tint, size: 24),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'راند ${faNum(widget.roundNumber)} — نبرد بر سر',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white.withValues(alpha: 0.72),
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            statName.isEmpty ? label : '$statName!',
                            style: TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.w900,
                              color: tint,
                              height: 1.25,
                              shadows: [
                                Shadow(
                                  color: tint.withValues(alpha: glow),
                                  blurRadius: 14,
                                ),
                              ],
                            ),
                          ),
                          if (text.isNotEmpty)
                            Text(
                              text,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                height: 1.5,
                                color: Colors.white70,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// نوارِ کوچکِ «عددِ تعیین‌کنندهٔ این راند» که روی کارت‌های دست می‌نشیند.
///
/// بدونِ این، کاربر باید حدس می‌زد کدام یک از شش عددِ کارت مهم است. با
/// این، انتخابِ کارت یک تصمیمِ آگاهانه می‌شود نه قرعه‌کشی.
class _FocusStatRibbon extends StatelessWidget {
  const _FocusStatRibbon({
    required this.card,
    required this.stat,
    required this.tint,
    required this.roundIndex,
    required this.previousRoundWon,
  });
  final Map card;
  final String stat;
  final Color tint;
  final int roundIndex;
  final bool previousRoundWon;

  static const _fallbackKeys = <String, String>{
    'speed': 'duel_speed',
    'technique': 'duel_technique',
    'attack': 'duel_attack',
    'defense': 'duel_defense',
    'goalChance': 'duel_goal_chance',
  };

  @override
  Widget build(BuildContext context) {
    if (stat.isEmpty) return const SizedBox.shrink();
    final raw = card[stat] ?? card[_fallbackKeys[stat] ?? ''] ?? 0;
    final value = NumberParser.toInt(raw);
    final effect = '${card['effect'] ?? card['duel_effect'] ?? 'none'}';
    final bonus = switch (effect) {
      'speedster' when roundIndex == 0 => 6,
      'playmaker' when roundIndex > 0 && previousRoundWon => 4,
      'wall' when roundIndex == 3 => 6,
      'finisher' when roundIndex == 4 => 6,
      'lucky_star' when roundIndex >= 2 => 3,
      _ => 0,
    };
    final finalValue = value + bonus;
    return Semantics(
      label: bonus == 0
          ? 'عدد نهایی این راند ${faNum(finalValue)}'
          : '${faNum(value)} به‌علاوه افکت ${faNum(bonus)} برابر ${faNum(finalValue)}',
      child: Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          color: tint.withValues(alpha: 0.18),
          border: Border.all(color: tint.withValues(alpha: 0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _FocusBannerState._statIcons[stat] ?? Icons.stars_rounded,
              size: 13,
              color: tint,
            ),
            const SizedBox(width: 4),
            Text(
              bonus == 0
                  ? faNum(finalValue)
                  : '${faNum(value)}+${faNum(bonus)}=${faNum(finalValue)}',
              style: TextStyle(
                fontSize: bonus == 0 ? 14 : 11.5,
                fontWeight: FontWeight.w900,
                color: tint,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// بخشِ جمع‌شونده — برای محتوایی که مفید است ولی برای شروعِ بازی لازم نیست.
///
/// ── چرا ساخته شد ──
///
/// صفحهٔ پیش از بازی چهار پنلِ پشتِ سر هم داشت و دکمهٔ «ورود به آرنا»
/// جایی وسطشان دفن شده بود؛ مالک گزارش کرد برای شروعِ بازی با ربات باید
/// «یه اسکرول طولانی» بزند.
///
/// قوانین و تحلیلِ ترکیب با هم حدود ۳۲۰ پیکسل می‌گرفتند و هیچ‌کدام برای
/// شروع لازم نبودند. حالا جمع‌شده‌اند و فقط یک ردیفِ ۵۶پیکسلی می‌گیرند.
///
/// ⚠️ `AnimatedCrossFade` عمداً استفاده **نشده**: درسِ ثبت‌شدهٔ این پروژه
/// می‌گوید آن ویجت فرزندِ پنهان را در درخت نگه می‌دارد، پس تست‌هایی که
/// `find.text()` می‌زنند سبز می‌مانند در حالی که کاربر چیزی نمی‌بیند —
/// و مهم‌تر، آن فرزند همچنان build و layout می‌شود که دقیقاً همان هزینه‌ای
/// است که می‌خواستیم حذف کنیم.
class _CollapsibleSection extends StatefulWidget {
  const _CollapsibleSection({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Widget child;

  @override
  State<_CollapsibleSection> createState() => _CollapsibleSectionState();
}

class _CollapsibleSectionState extends State<_CollapsibleSection> {
  bool _open = false;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(Gaps.sm),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            InkWell(
              onTap: () => setState(() => _open = !_open),
              borderRadius: BorderRadius.circular(10),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Icon(widget.icon, size: 20, color: _gold),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            widget.title,
                            style: const TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            widget.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: Colors.white54,
                            ),
                          ),
                        ],
                      ),
                    ),
                    AnimatedRotation(
                      turns: _open ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: const Icon(
                        Icons.expand_more_rounded,
                        color: Colors.white54,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // فرزند فقط وقتی باز است اصلاً ساخته می‌شود.
            if (_open) ...[const SizedBox(height: Gaps.xs), widget.child],
          ],
        ),
      );
}

/// ═══════════════════════════════════════════════════════════════════════
/// اعلانِ سینماییِ شروعِ راند — وسطِ صفحه، بزرگ، دو ثانیه
/// ═══════════════════════════════════════════════════════════════════════
///
/// ── خواستهٔ مالک ──
///
///   «وقتی راند شروع میشه اینکه مبارزه هر راند سر چی هستش باید با
///    انیمیشن زیبا وسط صفحه نشون داده بشه»
///
/// ── چرا بنرِ قبلی کافی نبود ──
///
/// `_FocusBanner` یک نوارِ افقی در جریانِ ستون است. سه اشکال داشت:
///
///   ۱. **دیده نمی‌شد.** بینِ تابلوی امتیاز و صحنهٔ برخورد گم بود و
///      چشم مستقیم سراغِ کارت‌ها می‌رفت.
///   ۲. **ارتفاع می‌گرفت.** حدود ۹۰ پیکسل از بودجهٔ عمودیِ صفحه را
///      مصرف می‌کرد و همان چیزی بود که کاربر را مجبور به اسکرول می‌کرد.
///   ۳. **حسِ رویداد نداشت.** شروعِ راند یک لحظهٔ دراماتیک است، نه یک
///      برچسبِ ثابت.
///
/// ── این ویجت ──
///
/// یک overlay تمام‌صفحه که با شروعِ هر راند ۲.۸ ثانیه دیده می‌شود:
/// پس‌زمینه تار می‌شود، آیکنِ ویژگی با مدار، پرتو و ذرات وارد می‌شود،
/// («سریع‌ترین کارتت را بفرست!») بزرگ نوشته می‌شود و یک راهنمای یک‌خطی
/// برای گروهِ سنیِ پایین زیرش می‌آید.
///
/// چون overlay است، **هیچ ارتفاعی از چیدمان نمی‌گیرد** — یعنی هم‌زمان
/// مشکلِ اسکرول را هم حل می‌کند.
///
/// `AbsorbPointer`: انتخاب تا پایان معرفی عمداً قفل است؛ تایمر هم روی
/// سرور یخ می‌ماند، پس کاربر نه زمان از دست می‌دهد و نه اشتباهی می‌زند.
class _RoundIntroOverlay extends StatefulWidget {
  const _RoundIntroOverlay({
    required this.focus,
    required this.roundNumber,
    required this.totalRounds,
  });

  final Map<String, dynamic>? focus;
  final int roundNumber;
  final int totalRounds;

  @override
  State<_RoundIntroOverlay> createState() => _RoundIntroOverlayState();
}

class _RoundIntroOverlayState extends State<_RoundIntroOverlay>
    with SingleTickerProviderStateMixin {
  // ⚠️ چرا `late final` نیست:
  //
  // قبلاً این فیلد `late final AnimationController _c = AnimationController(...)`
  // بود. مقداردهیِ تنبل یعنی کنترلر فقط در **اولین دسترسی** ساخته
  // می‌شود. اگر ویجت بدونِ `focus` رندر می‌شد، `build` زودتر
  // `SizedBox.shrink` برمی‌گرداند و هیچ‌وقت به `_c` دست نمی‌زد.
  //
  // بعد در `dispose()` خطِ `_c.dispose()` برای اولین بار به `_c`
  // دسترسی می‌گرفت و **همان‌جا** کنترلر را می‌ساخت — روی یک ویجتِ
  // از قبل غیرفعال‌شده. `AnimationController` برای `vsync: this` باید
  // `TickerMode` را از درختِ والد بخواند و آن موقع درخت دیگر پایدار
  // نیست:
  //
  //     Looking up a deactivated widget's ancestor is unsafe.
  //
  // یعنی «آزاد کردنِ منبع» خودش منبع می‌ساخت. کنترلر حالا مشتاقانه در
  // `initState` ساخته می‌شود تا همیشه دقیقاً یک بار ساخته و یک بار
  // آزاد شود.
  AnimationController? _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    );
    if (_hasFocus) _c!.forward();
  }

  bool get _hasFocus => '${widget.focus?['stat'] ?? ''}'.isNotEmpty;

  @override
  void didUpdateWidget(covariant _RoundIntroOverlay old) {
    super.didUpdateWidget(old);
    // راندِ تازه → اعلانِ تازه. بدونِ این، فقط راندِ اول اعلان داشت.
    if (old.roundNumber != widget.roundNumber && _hasFocus) {
      _c
        ?..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _c?.dispose();
    _c = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasFocus) return const SizedBox.shrink();
    final stat = '${widget.focus?['stat'] ?? ''}';
    final hint = '${widget.focus?['hint'] ?? ''}';
    final tint = _FocusBannerState._statColors[stat] ?? _cyan;
    final icon = _FocusBannerState._statIcons[stat] ?? Icons.stars_rounded;
    final statName = _FocusBannerState._statNames[stat] ?? '';

    return Semantics(
      label:
          'راند ${widget.roundNumber} از ${widget.totalRounds}. نبرد $statName. $hint',
      child: AnimatedBuilder(
        animation: _c!,
        builder: (context, _) {
          final v = _c!.value;
          if (v >= 1.0) return const SizedBox.shrink();
          final enter =
              Curves.easeOutBack.transform((v / 0.22).clamp(0.0, 1.0));
          final exit = Curves.easeInCubic.transform(
            ((v - 0.88) / 0.12).clamp(0.0, 1.0),
          );
          final opacity = (1 - exit).clamp(0.0, 1.0);
          final spin = (1 - enter) * .55;
          final scale = 0.48 + 0.52 * enter;
          final beat = v < .50
              ? '۳'
              : v < .64
                  ? '۲'
                  : v < .78
                      ? '۱'
                      : 'انتخاب!';
          final beatPhase = v < .50
              ? (v / .50)
              : v < .64
                  ? ((v - .50) / .14)
                  : v < .78
                      ? ((v - .64) / .14)
                      : ((v - .78) / .22);
          final beatScale = 1 + .18 * (1 - beatPhase.clamp(0.0, 1.0));

          return AbsorbPointer(
            absorbing: true,
            child: Opacity(
              opacity: opacity,
              child: Container(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      tint.withValues(alpha: .28 * opacity),
                      const Color(0xF20A0F1D),
                    ],
                    stops: const [.02, .82],
                    radius: .95,
                  ),
                ),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 13,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: tint.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: tint.withValues(alpha: .46)),
                      ),
                      child: Text(
                        'راند ${faNum(widget.roundNumber)} از ${faNum(widget.totalRounds)}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          color: Colors.white70,
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Transform.rotate(
                      angle: spin,
                      child: Transform.scale(
                        scale: scale,
                        child: SizedBox(
                          width: 126,
                          height: 126,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              CustomPaint(
                                size: const Size.square(126),
                                painter: _RoundIntroEmblemPainter(
                                  progress: v,
                                  color: tint,
                                ),
                              ),
                              Transform.rotate(
                                angle: v * 3.2,
                                child: Container(
                                  width: 122,
                                  height: 122,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: tint.withValues(alpha: .30),
                                      width: 1,
                                    ),
                                  ),
                                ),
                              ),
                              Container(
                                width: 96,
                                height: 96,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: tint.withValues(alpha: .18),
                                  border: Border.all(color: tint, width: 3),
                                  boxShadow: [
                                    BoxShadow(
                                      color: tint.withValues(alpha: .68),
                                      blurRadius: 44,
                                      spreadRadius: 4,
                                    ),
                                  ],
                                ),
                                child: Icon(icon, color: tint, size: 50),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'معیار این راند',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: tint.withValues(alpha: .86),
                        letterSpacing: .2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Transform.scale(
                      scale: .84 + .16 * enter,
                      child: Text(
                        statName,
                        style: TextStyle(
                          fontSize: 34,
                          height: 1.15,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          shadows: [
                            Shadow(color: tint, blurRadius: 28),
                            const Shadow(color: Colors.black, blurRadius: 8),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 7),
                    const Text(
                      'بالاترین عدد برنده است',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white70,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Transform.scale(
                      scale: beatScale,
                      child: Text(
                        beat,
                        key: ValueKey(beat),
                        style: TextStyle(
                          fontSize: beat == 'انتخاب!' ? 18 : 24,
                          fontWeight: FontWeight.w900,
                          color: beat == 'انتخاب!' ? _emerald : tint,
                          shadows: [Shadow(color: tint, blurRadius: 18)],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════
/// درگاهِ تستِ اعلانِ راند
/// ═══════════════════════════════════════════════════════════════════════
///
/// همان الگوی `CardDuelClashStageForTest`: کلاس خصوصی می‌ماند ولی تست
/// می‌تواند بسازدش. بدونِ این، انیمیشنِ اعلان هیچ نگهبانی نداشت.
class _RoundIntroEmblemPainter extends CustomPainter {
  const _RoundIntroEmblemPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final pulse = math.sin(math.pi * progress).abs();
    final rayPaint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2
      ..color = color.withValues(alpha: .18 + .48 * pulse);
    for (var index = 0; index < 12; index++) {
      final angle = index * math.pi / 6 + progress * .9;
      final inner = 51.0 + 3 * math.sin(progress * math.pi * 4 + index);
      final outer = 59.0 + 5 * pulse + (index.isEven ? 4 : 0);
      canvas.drawLine(
        center + Offset(math.cos(angle), math.sin(angle)) * inner,
        center + Offset(math.cos(angle), math.sin(angle)) * outer,
        rayPaint,
      );
    }
    final arcPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.2
      ..color = color.withValues(alpha: .58);
    final rect = Rect.fromCircle(center: center, radius: 58);
    canvas.drawArc(
        rect, progress * math.pi * 2, math.pi * .78, false, arcPaint);
    canvas.drawArc(
        rect, progress * math.pi * 2 + math.pi, math.pi * .42, false, arcPaint);
    final dotPaint = Paint()
      ..color = Colors.white.withValues(alpha: .35 + .5 * pulse);
    for (var index = 0; index < 6; index++) {
      final angle = -progress * 2.2 + index * math.pi / 3;
      canvas.drawCircle(
        center + Offset(math.cos(angle), math.sin(angle)) * 61,
        index.isEven ? 2.2 : 1.4,
        dotPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RoundIntroEmblemPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.color != color;
}

@visibleForTesting
class CardDuelRoundIntroForTest extends StatelessWidget {
  const CardDuelRoundIntroForTest({
    super.key,
    required this.focus,
    required this.roundNumber,
    required this.totalRounds,
  });

  final Map<String, dynamic>? focus;
  final int roundNumber;
  final int totalRounds;

  @override
  Widget build(BuildContext context) => _RoundIntroOverlay(
        focus: focus,
        roundNumber: roundNumber,
        totalRounds: totalRounds,
      );
}

@visibleForTesting
class CardDuelScoreboardForTest extends StatelessWidget {
  const CardDuelScoreboardForTest({
    super.key,
    required this.myScore,
    required this.theirScore,
    this.lastWinner = '',
  });

  final int myScore;
  final int theirScore;
  final String lastWinner;

  @override
  Widget build(BuildContext context) => _Scoreboard(
        myName: 'بازیکن من',
        theirName: 'ربات تست',
        myScore: myScore,
        theirScore: theirScore,
        color: _cyan,
        myPlayer: const {},
        theirPlayer: const {'isBot': true},
        title: 'نبرد تکنیکی',
        roundLabel: '۲/۵',
        lastWinner: lastWinner,
        mySymbol: 'X',
        opponentRole: 'ربات',
      );
}

@visibleForTesting
class CardDuelFocusRibbonForTest extends StatelessWidget {
  const CardDuelFocusRibbonForTest({
    super.key,
    required this.card,
    required this.stat,
    required this.roundIndex,
    required this.previousRoundWon,
  });

  final Map card;
  final String stat;
  final int roundIndex;
  final bool previousRoundWon;

  @override
  Widget build(BuildContext context) => _FocusStatRibbon(
        card: card,
        stat: stat,
        tint: _cyan,
        roundIndex: roundIndex,
        previousRoundWon: previousRoundWon,
      );
}

/// نوارِ باریکِ بالای صفحه حین نبرد — جایگزینِ `_ArenaHero`.
///
/// `_ArenaHero` ۹۶dp ارتفاع می‌گیرد و عنوان/توضیحِ حالت را نشان می‌دهد.
/// آن اطلاعات قبل از شروعِ بازی لازم است، نه وسطش. تنها چیزی که حین
/// نبرد واقعاً لازم است دکمهٔ برگشت است.
///
/// این نوار ۳۴dp است — یعنی ۶۲dp از سرریزِ عمودیِ صفحه کم می‌کند و
/// بخشِ بزرگی از دلیلِ اسکرول را حذف می‌کند.
class _CompactMatchBar extends StatelessWidget {
  const _CompactMatchBar({
    required this.onBack,
    required this.modeColor,
    required this.modeTitle,
  });

  final VoidCallback onBack;
  final Color modeColor;
  final String modeTitle;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 34,
        child: Row(
          children: [
            IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded, size: 20),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
              tooltip: 'خروج از نبرد',
            ),
            const SizedBox(width: 6),
            Icon(Icons.sports_mma_rounded, size: 15, color: modeColor),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                modeTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                  color: modeColor,
                ),
              ),
            ),
          ],
        ),
      );
}

@visibleForTesting
class CardDuelStakePayoutForTest extends StatelessWidget {
  const CardDuelStakePayoutForTest({
    super.key,
    required this.amount,
    required this.mineWon,
    this.balanceAfter,
    this.opponentRole = 'حریف',
  });

  final int amount;
  final bool mineWon;
  final int? balanceAfter;
  final String opponentRole;

  @override
  Widget build(BuildContext context) => _StakePayoutFlight(
        amount: amount,
        mineWon: mineWon,
        balanceAfter: balanceAfter,
        opponentRole: opponentRole,
      );
}
