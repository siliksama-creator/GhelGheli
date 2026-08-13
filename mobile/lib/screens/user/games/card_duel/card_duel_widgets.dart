part of '../card_duel_page.dart';
// RarityCardFrame is applied by PlayerCard so inventory, detail and duel share one frame.

class _ArenaHero extends StatelessWidget {
  const _ArenaHero({
    required this.onBack,
    required this.modeColor,
    required this.modeTitle,
    required this.subtitle,
  });
  final VoidCallback onBack;
  final Color modeColor;
  final String modeTitle;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(Gaps.md),
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: LinearGradient(colors: [
            modeColor.withValues(alpha: 0.24),
            const Color(0xFF142742),
            const Color(0xFF050A12),
          ]),
          border: Border.all(color: modeColor.withValues(alpha: 0.55)),
        ),
        child: Row(
          children: [
            IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back_rounded)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('GHELGHELI CARD ARENA',
                      style: TextStyle(color: modeColor, fontSize: 11.5, letterSpacing: 1.2, fontWeight: FontWeight.w900)),
                  Text('دوئل کارت‌ها',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          )),
                  Text('پنج راند مخفی، برخورد زنده و برندهٔ واضح هر راند',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.68), fontSize: 13)),
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
        padding: EdgeInsets.all(Gaps.sm),
        child: Row(
          children: [
            Expanded(child: _RuleStep(number: '۱', title: '۵ کارت بچین', subtitle: 'ترکیب متوازن و حرفه‌ای')),
            Icon(Icons.chevron_left_rounded, color: Colors.white24),
            Expanded(child: _RuleStep(number: '۲', title: 'مخفی انتخاب کن', subtitle: 'هم‌زمان با حریف')),
            Icon(Icons.chevron_left_rounded, color: Colors.white24),
            Expanded(child: _RuleStep(number: '۳', title: '۵ راند نفس‌گیر', subtitle: 'هر راند یک معیار تازه')),
          ],
        ),
      );
}

class _RuleStep extends StatelessWidget {
  const _RuleStep({required this.number, required this.title, required this.subtitle});
  final String number;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Column(
        children: [
          CircleAvatar(
              radius: 13,
              backgroundColor: _gold.withValues(alpha: 0.15),
              child: Text(number, style: const TextStyle(color: _gold, fontWeight: FontWeight.w900, fontSize: 12))),
          const SizedBox(height: 4),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900)),
          Text(subtitle, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.46))),
        ],
      );
}

class _LineupPanel extends StatelessWidget {
  const _LineupPanel({required this.selected, required this.cards, required this.teamPower, required this.onRemove});
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
          Row(children: [
            const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('ترکیب اصلی', style: TextStyle(fontWeight: FontWeight.w900)),
              Text('پنج کارت؛ برای حذف روی اسلات بزن', style: TextStyle(fontSize: 11.5, color: Colors.white54)),
            ])),
            Text('${faNum(teamPower)} قدرت', style: const TextStyle(color: _gold, fontWeight: FontWeight.w900)),
          ]),
          Gaps.vSm,
          SizedBox(
            height: 118,
            child: Row(children: [
              for (var index = 0; index < 5; index++) ...[
                Expanded(
                    child: _LineupSlot(
                  index: index,
                  card: index < selected.length ? byId[selected[index]] : null,
                  onTap: index < selected.length ? () => onRemove(selected[index]) : null,
                )),
                if (index < 4) const SizedBox(width: 4),
              ],
            ]),
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
                  gradient: const LinearGradient(colors: [Color(0xFF17283D), Color(0xFF050A11)]),
                ),
                child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.add_rounded, color: Colors.white38),
                  Text('کارت ${faNum(index + 1)}', style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
                ])),
              )
            : CosmeticCardFrame(
                frame: null,
                child: PlayerCard(card: Map<String, dynamic>.from(card!), compact: true, showStats: false, onTap: onTap),
              ),
      );
}

class _Matchmaking extends StatelessWidget {
  const _Matchmaking({required this.color, required this.vsBot, required this.onCancel});
  final Color color;
  final bool vsBot;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) => AppCard(
        child: SizedBox(
          height: 280,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            SizedBox(
              width: 72,
              height: 72,
              child: CircularProgressIndicator(color: color, strokeWidth: 3),
            ),
            Gaps.vMd,
            Text(vsBot ? 'ربات تاکتیکی وارد آرنا می‌شود…' : 'در جستجوی حریف هم‌سطح…',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            Gaps.vXs,
            const Text('ترکیب تو قفل است؛ کارت‌ها تا لحظه برخورد مخفی می‌مانند.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Colors.white60)),
            Gaps.vMd,
            OutlinedButton(onPressed: onCancel, child: const Text('لغو و ویرایش ترکیب')),
          ]),
        ),
      );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️ چرا _LiveBattle یک حالتِ «پایان» دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// ── گزارشِ مالک (با اسکرین‌شات از همین اپ) ──
//   «اسکوربورد و متن راند ناسازگارند، دو بلوک نتیجه هم‌زمان نشان داده
//    می‌شود، و صفحه اسکرول دارد.»
//
// ── علتِ ریشه‌ای ──
//
// صفحهٔ پایان همان `_LiveBattle`ِ نوشته‌شده برای *وسطِ بازی* را بی‌هیچ
// تغییری بالای `_Finale` رندر می‌کرد:
//
//   ۱. اسکوربورد می‌گفت «راند ۵ از ۵» و زیرش «امتیاز راند قبل برای تو
//      بود». بازی تمام شده و «راند قبل» معنایی ندارد.
//   ۲. `_ClashStage` صحنهٔ برخوردِ راند ۵ را نشان می‌داد و بلافاصله
//      زیرش `VICTORY ۵—۰` می‌آمد — **دو بلوکِ نتیجه هم‌زمان**.
//   ۳. اگر برخوردی نبود، `_ClashStage` یک جعبهٔ ۲۱۰ پیکسلیِ «منتظر
//      برخورد اول…» می‌ساخت که در پایانِ بازی کاملاً بی‌معنی است و فقط
//      اسکرول اضافه می‌کند.
//
// ── چرا پراپ و نه ویجتِ جدا ──
//
// اسکوربورد و پیپ‌های راند باید همان‌ها بمانند وگرنه صفحهٔ نتیجه با
// صفحهٔ بازی ناهماهنگ می‌شود و باید دو جا نگهداری شوند. فقط سه چیز
// عوض می‌شود، پس یک پرچمِ `finalView` کافی است.
class _LiveBattle extends StatelessWidget {
  const _LiveBattle({
    required this.session,
    required this.color,
    this.finalView = false,
  });
  final GameSession session;
  final Color color;
  final bool finalView;

  @override
  Widget build(BuildContext context) {
    final state = session.state;
    final mine = session.mySymbol ?? 'X';
    final opponent = mine == 'X' ? 'O' : 'X';
    final score = state['score'] is Map ? state['score'] as Map : const {};
    final deck = (state['myDeck'] as List? ?? const []).whereType<Map>().toList();
    final remaining = (state['myRemainingCardIds'] as List? ?? const []).map((id) => '$id').toSet();
    final pendingId = '${state['myPendingCardId'] ?? ''}';
    final lastRound = state['lastRound'] is Map ? Map<String, dynamic>.from(state['lastRound'] as Map) : null;
    final history = (state['history'] as List? ?? const []).whereType<Map>().toList();
    final iChose = state['iChose'] == true;
    final total = NumberParser.toInt(state['totalRounds']) == 0 ? 5 : NumberParser.toInt(state['totalRounds']);
    final roundIndex = NumberParser.toInt(state['roundIndex']);
    return Column(children: [
      _Scoreboard(
        myName: session.nameOf(mine),
        theirName: session.nameOf(opponent),
        myScore: NumberParser.toInt(score[mine]),
        theirScore: NumberParser.toInt(score[opponent]),
        color: color,
        myPlayer: session.playerInfo(mine),
        theirPlayer: session.playerInfo(opponent),
        // ⚠️ در پایانِ بازی «راند ۵ از ۵» و «امتیاز راند قبل برای تو
        //    بود» هر دو بی‌معنی‌اند — همان ناسازگاریِ اسکرین‌شات.
        title: finalView
            ? '${faNum(total)} راند تمام شد'
            : '${state['roundTitle'] ?? 'پایان نبرد'}',
        roundLabel: finalView
            ? 'نتیجهٔ نهایی'
            : 'راند ${faNum((roundIndex + 1).clamp(1, total))} از ${faNum(total)}',
        lastWinner: '${lastRound?['winner'] ?? ''}',
        mySymbol: mine,
        finalView: finalView,
      ),
      Gaps.vXs,
      _RoundPips(total: total, current: roundIndex, history: history, mine: mine, color: color),
      Gaps.vXs,
      // ── چرا بنرِ افقی حذف شد ──
      //
      // `_FocusBanner` همین اطلاعات را می‌داد ولی ~۹۰ پیکسل ارتفاع
      // می‌گرفت و باعثِ اسکرول می‌شد. جایش را `_RoundIntroOverlay`
      // گرفته که وسطِ صفحه و روی همه‌چیز می‌آید، دو ثانیه می‌ماند و
      // **هیچ ارتفاعی از چیدمان نمی‌گیرد**.
      //
      // اطلاعاتِ همیشگی (کدام ویژگی مهم است) از بین نرفت: روی تک‌تکِ
      // کارت‌های دست با `_FocusStatRibbon` دیده می‌شود و در نوارِ
      // فشردهٔ زیر هم خلاصه‌اش هست.
      // ⚠️ در صفحهٔ پایان این صحنه دقیقاً بالای پنلِ VICTORY می‌نشست و
      //    «دو بلوک نتیجه هم‌زمان» می‌ساخت. جزئیاتِ راندِ پنجم از بین
      //    نمی‌رود: در «تایم‌لاین کامل ۵ راند» همان پایین هست.
      if (!finalView) _ClashStage(round: lastRound, mine: mine, color: color),
      if (session.phase == GamePhase.playing) ...[
        Gaps.vSm,
        AppCard(
            child: Column(children: [
          Row(children: [
            // نشانِ همیشگیِ ویژگیِ راند — جایگزینِ فشردهٔ بنرِ حذف‌شده.
            // اعلانِ وسطِ صفحه دو ثانیه‌ای است؛ این تا آخرِ راند می‌ماند
            // تا کسی که اعلان را از دست داد هم بداند دنبالِ چه عددی بگردد.
            if ('${(state['roundFocus'] as Map?)?['stat'] ?? ''}'.isNotEmpty) ...[
              Builder(builder: (_) {
                final fs = '${(state['roundFocus'] as Map?)?['stat'] ?? ''}';
                final t = _FocusBannerState._statColors[fs] ?? color;
                return Container(
                  margin: const EdgeInsetsDirectional.only(end: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                  decoration: BoxDecoration(
                    color: t.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: t.withValues(alpha: 0.6)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(_FocusBannerState._statIcons[fs] ?? Icons.stars_rounded,
                        size: 15, color: t),
                    const SizedBox(width: 5),
                    Text(_FocusBannerState._statNames[fs] ?? '',
                        style: TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w900, color: t)),
                  ]),
                );
              }),
            ],
            Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(iChose ? 'انتخابت قفل شد' : 'کارت این راند را انتخاب کن',
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              Text(
                  state['waitingForOpponent'] == true
                      ? 'منتظر انتخاب حریف…'
                      : state['opponentLocked'] == true
                          ? 'حریف انتخاب کرده؛ تصمیم بگیر!'
                          : 'انتخاب‌ها مخفی و هم‌زمان هستند',
                  style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
            ])),
            AnimatedBuilder(
                animation: session.clock,
                builder: (_, __) => CircleAvatar(
                    radius: 24,
                    backgroundColor: const Color(0xFF02060C),
                    // در پنجرهٔ اعلانِ راند ساعت نمی‌رود؛ به‌جای عددِ
                    // ثابت که شبیهِ «هنگ کرده» است، آیکنِ مکث نشان
                    // داده می‌شود تا معلوم باشد عمدی است.
                    child: session.introHolding
                        ? Icon(Icons.visibility_rounded, color: color, size: 20)
                        : Text(faNum(session.secondsLeft),
                            style: TextStyle(
                                color: color, fontWeight: FontWeight.w900)))),
          ]),
          Gaps.vXs,
          // ── دستِ کاربر ──
          //
          // هر کارت حالا «عددِ تعیین‌کنندهٔ همین راند» را زیرِ خودش نشان
          // می‌دهد. قبلاً کاربر شش عدد داشت و نمی‌دانست کدام مهم است، پس
          // معمولاً به عددِ «قدرتِ کلی» نگاه می‌کرد — که در ۱۳٪ مواقع
          // برندهٔ راند را اشتباه پیش‌بینی می‌کند.
          SizedBox(
            height: 196,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: deck.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final card = Map<String, dynamic>.from(deck[index]);
                final id = cardIdOf(card);
                final canPlay = !iChose && remaining.contains(id);
                final focusStat = '${(state['roundFocus'] as Map?)?['stat'] ?? ''}';
                final focusTint =
                    _FocusBannerState._statColors[focusStat] ?? color;
                // بهترین عددِ این راند در میانِ کارت‌های باقی‌مانده —
                // برای اینکه کاربر ببیند کدام انتخاب قوی‌ترین است.
                return SizedBox(
                  width: 112,
                  child: AnimatedSlide(
                    duration: const Duration(milliseconds: 220),
                    offset: pendingId == id ? const Offset(0, -0.05) : Offset.zero,
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
                                ? () => session.moveObject({'cardId': id})
                                : null,
                          ),
                        ),
                        Opacity(
                          opacity: canPlay ? 1 : 0.4,
                          child: _FocusStatRibbon(
                              card: card, stat: focusStat, tint: focusTint),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ])),
      ],
    ]);
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
    this.finalView = false,
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
  final bool finalView;

  @override
  Widget build(BuildContext context) {
    final myLead = myScore > theirScore;
    final theirLead = theirScore > myScore;
    final lastMine = lastWinner == mySymbol;
    final lastTheir = lastWinner.isNotEmpty && lastWinner != 'DRAW' && !lastMine;
    return AppCard(
      child: Column(
        children: [
          Row(children: [
            Expanded(child: _Score(name: myName, score: myScore, color: color, player: myPlayer, highlight: myLead, scoredLast: lastMine)),
            Column(children: [
              Text(roundLabel, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w900)),
              Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
              Text('${faNum(myScore)}  —  ${faNum(theirScore)}',
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.w900)),
              Text(
                finalView
                    // بازی تمام شده؛ حرف زدن از «راند قبل» گمراه‌کننده است.
                    ? (myScore == theirScore
                        ? 'برابر تمام شد'
                        : myLead
                            ? 'تو بردی'
                            : 'حریف برد')
                    : lastWinner == 'DRAW'
                        ? 'راند قبلی مساوی شد'
                        : lastMine
                            ? 'امتیاز راند قبل برای تو بود'
                            : lastTheir
                                ? 'حریف راند قبل را برد'
                                : 'امتیازها را بالا نگه دار',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11.5, color: Colors.white60, fontWeight: FontWeight.w700),
              ),
            ]),
            Expanded(child: _Score(name: theirName, score: theirScore, color: _gold, player: theirPlayer, reverse: true, highlight: theirLead, scoredLast: lastTheir)),
          ]),
        ],
      ),
    );
  }
}

class _Score extends StatelessWidget {
  const _Score({
    required this.name,
    required this.score,
    required this.color,
    required this.player,
    this.reverse = false,
    this.highlight = false,
    this.scoredLast = false,
  });
  final String name;
  final int score;
  final Color color;
  final Map? player;
  final bool reverse;
  final bool highlight;
  final bool scoredLast;
  @override
  Widget build(BuildContext context) {
    final cosmetics = player?['cosmetics'] is Map ? player!['cosmetics'] as Map : const {};
    final isBot = player?['isBot'] == true;
    final scoreBubble = AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(99),
        boxShadow: highlight || scoredLast
            ? [BoxShadow(color: color.withValues(alpha: scoredLast ? .36 : .20), blurRadius: scoredLast ? 18 : 12)]
            : const [],
      ),
      child: TweenAnimationBuilder<int>(
        tween: IntTween(begin: 0, end: score),
        duration: const Duration(milliseconds: 420),
        builder: (_, value, __) => CircleAvatar(
          radius: 18,
          backgroundColor: const Color(0xFF02060C),
          child: Text(faNum(value), style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.w900)),
        ),
      ),
    );
    final parts = [
      Stack(
        clipBehavior: Clip.none,
        children: [
          scoreBubble,
          if (scoredLast)
            const PositionedDirectional(
              top: -7,
              end: -7,
              child: _PointBurst(),
            ),
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
          crossAxisAlignment: reverse ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            DisplayName(
              name: name,
              cosmetics: cosmetics,
              level: (player?['level'] as num?)?.toInt(),
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
            ),
            if (scoredLast)
              Text('+۱ امتیاز راند', style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    ];
    return Row(mainAxisAlignment: reverse ? MainAxisAlignment.end : MainAxisAlignment.start, children: reverse ? parts.reversed.toList() : parts);
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
          boxShadow: const [BoxShadow(color: Color(0x6622E7A6), blurRadius: 14)],
        ),
        child: const Text('+1', style: TextStyle(color: Color(0xFF04101A), fontWeight: FontWeight.w900, fontSize: 11.5)),
      );
}

class _RoundPips extends StatelessWidget {
  const _RoundPips({required this.total, required this.current, required this.history, required this.mine, required this.color});
  final int total;
  final int current;
  final List<Map> history;
  final String mine;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(mainAxisAlignment: MainAxisAlignment.center, children: [
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
      ]);
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
  const _ClashStage({required this.round, required this.mine, required this.color});
  final Map<String, dynamic>? round;
  final String mine;
  final Color color;

  @override
  State<_ClashStage> createState() => _ClashStageState();
}

class _ClashStageState extends State<_ClashStage> with SingleTickerProviderStateMixin {
  // ── زمان‌بندیِ نمایشِ نتیجه ──
  //
  // مجموعِ فازها: ۶۰۰ + ۴۰۰ + ۹۰۰ = ۱۹۰۰ms تا حکم.
  //
  // ⚠️ باید کمتر از `resultHoldMs` سرور (۳۸۰۰ms) بماند وگرنه راندِ
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

  late final AnimationController _c =
      AnimationController(vsync: this, duration: _total);

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
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (context, _) => _build(context),
      );

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
          gradient: RadialGradient(colors: [color.withValues(alpha: 0.16), const Color(0xFF07111D)]),
          border: Border.all(color: Colors.white10),
        ),
        child: const Text('منتظر برخورد اول…', style: TextStyle(color: Colors.white54, fontWeight: FontWeight.w800)),
      );
    }
    final myCard = Map<String, dynamic>.from((mine == 'O' ? round['cardO'] : round['cardX']) as Map? ?? const {});
    final otherCard = Map<String, dynamic>.from((mine == 'O' ? round['cardX'] : round['cardO']) as Map? ?? const {});
    final myPower = mine == 'O' ? round['powerO'] : round['powerX'];
    final otherPower = mine == 'O' ? round['powerX'] : round['powerO'];
    final myFocus = mine == 'O' ? round['focusStatO'] : round['focusStatX'];
    final otherFocus = mine == 'O' ? round['focusStatX'] : round['focusStatO'];
    final winner = '${round['winner']}';
    final iWon = winner == mine;
    final draw = winner == 'DRAW';
    final phase = _phase;
    final outcome = draw ? _gold : iWon ? _emerald : _rose;
    final showNumbers = phase == _RevealPhase.numbers || phase == _RevealPhase.verdict;
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
    final countT = Curves.easeOutCubic.transform(_span(_impactEnd, _numbersEnd));

    return Transform.translate(
      offset: Offset(shake, 0),
      child: Stack(children: [
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
                      border: Border.all(color: outcome, width: 2.5 * (1 - ringT) + 0.5),
                      gradient: RadialGradient(colors: [
                        Colors.white.withValues(alpha: 0.30 * (1 - impactT)),
                        Colors.transparent,
                      ]),
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
            gradient: LinearGradient(colors: [
              outcome.withValues(alpha: 0.16),
              const Color(0xFF07111D),
            ]),
            border: Border.all(color: outcome.withValues(alpha: 0.55), width: 1.4),
            boxShadow: [
              BoxShadow(
                color: outcome.withValues(alpha: showVerdict ? .30 : .16),
                blurRadius: showVerdict ? 34 : 22,
              ),
            ],
          ),
          child: Column(children: [
            Row(children: [
              // کارتِ من از راست هجوم می‌آورد.
              Expanded(
                child: Opacity(
                  opacity: charge,
                  child: Transform.translate(
                    offset: Offset(38 * (1 - charge), 0),
                    child: Transform.rotate(
                      angle: 0.12 * (1 - charge),
                      child: AspectRatio(
                        aspectRatio: 0.68,
                        child: PlayerCard(
                          card: myCard, compact: true, showStats: false,
                          winner: showVerdict && iWon,
                          loser: showVerdict && !draw && !iWon,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Column(children: [
                  Text('راند ${faNum(round['round'])} · ${round['focusLabel'] ?? round['title']}',
                      style: const TextStyle(fontSize: 12, color: Colors.white54, fontWeight: FontWeight.w800),
                      textAlign: TextAlign.center),
                  Text('${round['title']}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  // ── عددها: تا فازِ numbers پنهان، بعد شمارشِ صعودی ──
                  // برندهٔ نهایی بزرگ‌تر و طلایی می‌شود تا بدونِ خواندن هم
                  // معلوم باشد چه شد.
                  DefaultTextStyle(
                    style: const TextStyle(
                      fontFamily: 'Vazirmatn', fontSize: 22, fontWeight: FontWeight.w900,
                    ),
                    // ⚠️ FittedBox اجباری است. عددِ برنده در فازِ verdict به
                    // ۲۶px بزرگ می‌شود و روی صفحهٔ باریک (یا وقتی هر دو عدد
                    // سه‌رقمی‌اند) ردیف ۱.۶px سرریز می‌کرد — تستِ ویجت
                    // همین را گرفت. کوچک‌کردنِ متناسب بهتر از شکستنِ چیدمان
                    // یا کوچک نگه داشتنِ عددِ برنده است.
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      textDirection: TextDirection.ltr,
                      children: [
                        _PowerNumber(
                          value: showNumbers ? (num.tryParse('$myPower') ?? 0) * countT : 0,
                          visible: showNumbers,
                          lead: showVerdict && iWon,
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 8),
                          child: Text('VS', style: TextStyle(fontSize: 13, color: Colors.white38)),
                        ),
                        _PowerNumber(
                          value: showNumbers ? (num.tryParse('$otherPower') ?? 0) * countT : 0,
                          visible: showNumbers,
                          lead: showVerdict && !draw && !iWon,
                        ),
                      ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _RoundChip(
                          label: '${round['focusLabel'] ?? 'ویژگی'}',
                          value: '${faNum(myFocus)} - ${faNum(otherFocus)}',
                          tint: color),
                      if (showNumbers)
                        _RoundChip(
                            label: 'اختلاف قدرت',
                            value: faNum(round['powerGap'] ??
                                ((num.tryParse('$myPower') ?? 0) - (num.tryParse('$otherPower') ?? 0)).abs()),
                            tint: outcome),
                    ],
                  ),
                  const SizedBox(height: 8),
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
                          child: Transform.scale(scale: 0.6 + 0.4 * t + 1.2 * (1 - t) * (1 - t), child: child),
                        ),
                      ),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: outcome.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(99),
                          border: Border.all(color: outcome.withValues(alpha: 0.5)),
                        ),
                        child: Text(
                          draw ? 'برخورد برابر' : iWon ? 'WINNER' : 'باخت راند',
                          style: TextStyle(color: outcome, fontWeight: FontWeight.w900, letterSpacing: 0.6),
                        ),
                      ),
                    ),
                ]),
              ),
              // کارتِ حریف از چپ.
              Expanded(
                child: Opacity(
                  opacity: charge,
                  child: Transform.translate(
                    offset: Offset(-38 * (1 - charge), 0),
                    child: Transform.rotate(
                      angle: -0.12 * (1 - charge),
                      child: AspectRatio(
                        aspectRatio: 0.68,
                        child: PlayerCard(
                          card: otherCard, compact: true, showStats: false,
                          winner: showVerdict && !draw && !iWon,
                          loser: showVerdict && iWon,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ]),
            if (showVerdict) ...[
              Gaps.vXs,
              Text('${round['reason'] ?? round['text'] ?? ''}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w700)),
              if ('${round['cinematic'] ?? ''}'.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text('${round['cinematic']}',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: outcome, fontWeight: FontWeight.w900)),
              ],
            ],
          ]),
        ),
      ]),
    );
  }
}

/// عددِ قدرت با شمارشِ صعودی.
///
/// جدا شد چون دو بار استفاده می‌شود و منطقِ «برنده بزرگ‌تر و طلایی» نباید
/// در دو جا کپی شود.
class _PowerNumber extends StatelessWidget {
  const _PowerNumber({required this.value, required this.visible, required this.lead});
  final num value;
  final bool visible;
  final bool lead;

  @override
  Widget build(BuildContext context) => AnimatedDefaultTextStyle(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutBack,
        style: TextStyle(
          fontFamily: 'Vazirmatn',
          fontSize: lead ? 26 : 22,
          fontWeight: FontWeight.w900,
          color: !visible
              ? Colors.white38          // هنوز فاش نشده
              : lead
                  ? _gold
                  : Colors.white,
          shadows: lead
              ? [const Shadow(color: Color(0x88FFD166), blurRadius: 18)]
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

class _RoundChip extends StatelessWidget {
  const _RoundChip({required this.label, required this.value, required this.tint});
  final String label;
  final String value;
  final Color tint;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tint.withValues(alpha: .32)),
        ),
        child: RichText(
          text: TextSpan(
            style: const TextStyle(fontFamily: 'Vazirmatn', fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w700),
            children: [
              TextSpan(text: '$label: '),
              TextSpan(text: value, style: TextStyle(color: tint, fontWeight: FontWeight.w900)),
            ],
          ),
          textAlign: TextAlign.center,
        ),
      );
}

class _Finale extends StatelessWidget {
  const _Finale({
    required this.session,
    required this.color,
    required this.resultColors,
    required this.resultTemplate,
    required this.onAgain,
    required this.onEdit,
    required this.onShare,
    required this.sharing,
    required this.mvp,
    required this.privateLobby,
  });
  final GameSession session;
  final Color color;
  final List<Color>? resultColors;
  final String? resultTemplate;
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
    final history = (session.state['history'] as List? ?? const []).whereType<Map>().toList();
    final score = session.state['score'] is Map ? session.state['score'] as Map : const {};
    final me = session.mySymbol ?? 'X';
    final other = me == 'X' ? 'O' : 'X';
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: LinearGradient(colors: resultColors ?? const [Color(0xFF17304C), Color(0xFF050A12)]),
        image: resultTemplate == null
            ? null
            : DecorationImage(
                image: AssetImage('assets/shop/cosmetics/$resultTemplate.webp'),
                fit: BoxFit.cover,
                opacity: .18,
              ),
        border: Border.all(color: color),
      ),
      child: Column(children: [
        Text(draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT',
            style: TextStyle(
              fontSize: 34,
              fontWeight: FontWeight.w900,
              letterSpacing: 3,
              color: draw ? _gold : won ? _emerald : _rose,
            )),
        Text('${faNum(score[me])}  —  ${faNum(score[other])}',
            textDirection: TextDirection.ltr, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        Gaps.vXs,
        Text(
          session.vsBot
              ? 'تمرین تمام شد؛ امتیازی جابه‌جا نشد.'
              : draw
                  ? 'ورودی کامل هر دو نفر برمی‌گردد.'
                  : won
                      ? 'پات مسابقه پس از کسر کارمزد تسویه می‌شود.'
                      : '${faNum(session.stake)} امتیاز ورودی از دست رفت.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12.5, color: Colors.white60),
        ),
        Gaps.vSm,
        if (history.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              for (final raw in history)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    color: ('${raw['winner']}' == me
                            ? _emerald
                            : '${raw['winner']}' == 'DRAW'
                                ? _gold
                                : _rose)
                        .withValues(alpha: 0.18),
                  ),
                  child: Text('راند ${faNum(raw['round'])} · ${raw['title'] ?? ''}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                ),
            ],
          ),
        if (history.isNotEmpty) ...[
          Gaps.vSm,
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              collapsedIconColor: Colors.white70,
              iconColor: Colors.white,
              title: const Text('تایم‌لاین کامل ۵ راند', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900, color: Colors.white)),
              subtitle: const Text('جزئیات کامل دلیل، اختلاف قدرت و سهم هر کارت', style: TextStyle(fontSize: 12, color: Colors.white54)),
              children: [
                for (final raw in history)
                  _FinalRoundBreakdown(round: Map<String, dynamic>.from(raw), mySymbol: me),
              ],
            ),
          ),
        ],
        if (mvp != null) ...[
          Gaps.vSm,
          SizedBox(width: 140, height: 196, child: PlayerCard(card: mvp!, compact: true, showStats: false, winner: true)),
          Text('MVP · ${mvp!['name']}', style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
        Gaps.vSm,
        OutlinedButton.icon(
            onPressed: sharing ? null : onShare,
            icon: const Icon(Icons.ios_share_rounded, size: 17),
            label: Text(sharing ? 'در حال ساخت لینک…' : 'اشتراک نتیجه و دعوت به چالش')),
        Gaps.vSm,
        Row(children: [
          Expanded(
              child: FilledButton(
                  onPressed: session.rematchWaiting ? null : onAgain,
                  child: Text(session.rematchWaiting
                      ? 'منتظر قبول حریف…'
                      : session.rematchAvailable
                          ? 'دوباره با همین حریف'
                          : privateLobby
                              ? 'بازگشت به لابی'
                              : 'نبرد دوباره'))),
          Gaps.hXs,
          Expanded(child: OutlinedButton(onPressed: onEdit, child: const Text('تغییر ترکیب'))),
        ]),
      ]),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.message, required this.onBack});
  final String message;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) => AppCard(
          child: Column(children: [
        Icon(Icons.error_outline_rounded, color: Theme.of(context).colorScheme.error, size: 34),
        Gaps.vXs,
        Text(message, textAlign: TextAlign.center),
        Gaps.vSm,
        FilledButton(onPressed: onBack, child: const Text('بازگشت به ترکیب')),
      ]));
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
    final insights = activeInsights ?? (suggestedDeck?['insights'] is Map
        ? Map<String, dynamic>.from(suggestedDeck!['insights'] as Map)
        : null);
    if (insights == null) return const SizedBox.shrink();
    final strengths = (insights['strengths'] as List? ?? const []).map((e) => '$e').where((e) => e.isNotEmpty).toList(growable: false);
    final warnings = (insights['warnings'] as List? ?? const []).map((e) => '$e').where((e) => e.isNotEmpty).toList(growable: false);
    final recommendedOrder = (insights['recommendedOrder'] as List? ?? const []).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('تحلیل بالانس ترکیب', style: TextStyle(fontWeight: FontWeight.w900)),
                    Text('هوشِ آرنا قبل از شروع ضعف و قوت deck را می‌گوید', style: TextStyle(fontSize: 11.5, color: Colors.white60)),
                  ],
                ),
              ),
              if (suggestedDeck != null)
                OutlinedButton.icon(
                  onPressed: onApplySuggested,
                  icon: const Icon(Icons.auto_fix_high_rounded, size: 16),
                  label: const Text('چیدن خودکار'),
                ),
            ],
          ),
          // ═══════════════════════════════════════════════════════════════
          // چرا فهرست‌ها بریده می‌شوند
          // ═══════════════════════════════════════════════════════════════
          //
          // گزارشِ مالک: «قسمت تحلیل ترکیب یه اسکرول طولانی داره که
          // حذفش کن اسکرول رو».
          //
          // این پنل چهار بلوکِ پشتِ سرِ هم داشت: نقاطِ قوت (تا ۵ چیپ)،
          // هشدارها (تا ۵ چیپ)، جعبهٔ اوپنر، و فهرستِ ۵ راند. روی
          // گوشیِ معمولی مجموعاً ~۴۲۰ پیکسل می‌شد.
          //
          // مهم‌ترین اطلاعات دو مورد اولِ هر فهرست است؛ بقیه تکرارِ
          // همان مضمون‌اند. حالا حداکثر دو چیپ از هر دسته نشان داده
          // می‌شود و اگر بیشتر بود، تعدادش کنارش می‌آید.
          if (strengths.isNotEmpty || warnings.isNotEmpty) ...[
            Gaps.vXs,
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final item in strengths.take(2))
                  _IntelChip(text: item, tint: _emerald),
                for (final item in warnings.take(2))
                  _IntelChip(text: item, tint: _rose),
                if (strengths.length + warnings.length > 4)
                  _IntelChip(
                      text: '+${faNum(strengths.length + warnings.length - 4)} نکتهٔ دیگر',
                      tint: Colors.white54),
              ],
            ),
          ],
          if ('${insights['recommendedLeadReason'] ?? ''}'.trim().isNotEmpty) ...[
            Gaps.vSm,
            Container(
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                color: _cyan.withValues(alpha: .10),
                borderRadius: Corners.rLg,
                border: Border.all(color: _cyan.withValues(alpha: .28)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('اوپنر پیشنهادی', style: TextStyle(fontSize: 12.5, color: _cyan, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  // دو خط کافی است؛ متنِ بلندتر فقط ارتفاع می‌گیرد.
                  Text('${insights['recommendedLeadReason']}',
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Colors.white70, height: 1.5, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ],
          if (recommendedOrder.isNotEmpty) ...[
            Gaps.vSm,
            const Text('ترتیب پیشنهادی راندها', style: TextStyle(fontSize: 12.5, color: Colors.white70, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            SizedBox(
              height: 54,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemBuilder: (_, index) {
                  final item = recommendedOrder[index];
                  return Container(
                    width: 138,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: .05),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.white.withValues(alpha: .10)),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('راند ${faNum(item['round'])} · ${item['focus'] ?? ''}', style: const TextStyle(fontSize: 11, color: Colors.white54, fontWeight: FontWeight.w800)),
                        Text('${item['name'] ?? 'کارت'}', style: const TextStyle(fontSize: 12.5, color: Colors.white, fontWeight: FontWeight.w900)),
                        if ('${item['reason'] ?? ''}'.trim().isNotEmpty)
                          Text('${item['reason']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: Colors.white54, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  );
                },
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemCount: recommendedOrder.length,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _IntelChip extends StatelessWidget {
  const _IntelChip({required this.text, required this.tint});
  final String text;
  final Color tint;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tint.withValues(alpha: .32)),
        ),
        child: Text(text, style: TextStyle(color: tint, fontSize: 12, fontWeight: FontWeight.w800)),
      );
}

class _FinalRoundBreakdown extends StatelessWidget {
  const _FinalRoundBreakdown({required this.round, required this.mySymbol});
  final Map<String, dynamic> round;
  final String mySymbol;

  @override
  Widget build(BuildContext context) {
    final mineWon = '${round['winner']}' == mySymbol;
    final draw = '${round['winner']}' == 'DRAW';
    final mine = mySymbol == 'O'
        ? Map<String, dynamic>.from((round['cardO'] as Map?) ?? const {})
        : Map<String, dynamic>.from((round['cardX'] as Map?) ?? const {});
    final theirs = mySymbol == 'O'
        ? Map<String, dynamic>.from((round['cardX'] as Map?) ?? const {})
        : Map<String, dynamic>.from((round['cardO'] as Map?) ?? const {});
    final breakdownMine = mySymbol == 'O'
        ? Map<String, dynamic>.from((round['breakdownO'] as Map?) ?? const {})
        : Map<String, dynamic>.from((round['breakdownX'] as Map?) ?? const {});
    final breakdownTheirs = mySymbol == 'O'
        ? Map<String, dynamic>.from((round['breakdownX'] as Map?) ?? const {})
        : Map<String, dynamic>.from((round['breakdownO'] as Map?) ?? const {});
    final headline = draw ? _gold : mineWon ? _emerald : _rose;
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
              Expanded(child: Text('راند ${faNum(round['round'])} · ${round['focusLabel'] ?? round['title']}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: headline.withValues(alpha: .16), borderRadius: BorderRadius.circular(999)),
                child: Text(draw ? 'DRAW' : mineWon ? 'WIN' : 'LOSS', style: TextStyle(color: headline, fontSize: 11.5, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('${mine['name'] ?? 'کارت تو'} در برابر ${theirs['name'] ?? 'کارت حریف'}', style: const TextStyle(fontSize: 12, color: Colors.white70)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _MiniBreakChip(label: 'ویژگی', value: '${round['focusLabel'] ?? round['title']}', tint: _cyan),
              _MiniBreakChip(label: 'قدرت تو', value: faNum(mySymbol == 'O' ? round['powerO'] : round['powerX']), tint: mineWon ? _emerald : _cyan),
              _MiniBreakChip(label: 'قدرت حریف', value: faNum(mySymbol == 'O' ? round['powerX'] : round['powerO']), tint: !draw && !mineWon ? _rose : _gold),
              _MiniBreakChip(label: 'اختلاف', value: faNum(round['powerGap'] ?? 0), tint: headline),
            ],
          ),
          const SizedBox(height: 8),
          _BreakdownRow(title: 'تو', data: breakdownMine),
          const SizedBox(height: 6),
          _BreakdownRow(title: 'حریف', data: breakdownTheirs),
          const SizedBox(height: 8),
          Text('${round['reason'] ?? ''}', style: const TextStyle(fontSize: 12, color: Colors.white70, height: 1.5, fontWeight: FontWeight.w700)),
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
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 12, color: Colors.white54, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              _MiniBreakChip(label: 'base', value: '${data['base'] ?? 0}', tint: Colors.white70),
              _MiniBreakChip(label: 'focus', value: '${data['focus'] ?? 0}', tint: _cyan),
              _MiniBreakChip(label: 'effect', value: '${data['effectBonus'] ?? 0}', tint: _emerald),
              _MiniBreakChip(label: 'luck', value: '${data['luck'] ?? 0}', tint: _gold),
              if ((data['wallAdjustment'] as num?) != null && (data['wallAdjustment'] as num) != 0)
                _MiniBreakChip(label: 'wall', value: '${data['wallAdjustment']}', tint: _rose),
            ],
          ),
        ],
      );
}

class _MiniBreakChip extends StatelessWidget {
  const _MiniBreakChip({required this.label, required this.value, required this.tint});
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
        child: Text('$label: $value', style: TextStyle(fontSize: 11.5, color: tint, fontWeight: FontWeight.w800)),
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
          childrenPadding: const EdgeInsets.fromLTRB(Gaps.sm, 0, Gaps.sm, Gaps.sm),
          title: Text(
            rows.isEmpty ? 'آخرین نبردها' : 'آخرین نبردها (${faNum(rows.length)})',
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
                child: Text('هنوز نبرد آنلاینی نداری. تاریخچه اینجا جمع نمی‌شود تا صفحه سبک بماند.'),
              ),
            for (final raw in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: Gaps.xs),
                child: AppCard(
                  padding: const EdgeInsets.all(Gaps.sm),
                  elevated: false,
                  child: Row(children: [
                    Icon(
                        NumberParser.toInt(raw['userDelta']) > 0
                            ? Icons.trending_up_rounded
                            : NumberParser.toInt(raw['userDelta']) < 0
                                ? Icons.trending_down_rounded
                                : Icons.diamond_outlined,
                        color: NumberParser.toInt(raw['userDelta']) >= 0 ? _emerald : BrandColors.danger),
                    Gaps.hSm,
                    Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(labels['${raw['mode']}'] ?? 'دوئل کارت',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
                      Text(
                          '${faNum(raw['userScore'])} - ${faNum(raw['opponentScore'])} · '
                          '${_settlementLabel('${raw['settlementStatus'] ?? 'settled'}')}',
                          style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
                    ])),
                    Text(NumberParser.toInt(raw['userDelta']) > 0 ? '+${faNum(raw['userDelta'])}' : faNum(raw['userDelta']),
                        style: TextStyle(
                            color: NumberParser.toInt(raw['userDelta']) >= 0 ? _emerald : BrandColors.danger,
                            fontWeight: FontWeight.w900)),
                  ]),
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
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
        ..forward();
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
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(
                    colors: [tint.withValues(alpha: 0.26), const Color(0xFF07111D)],
                  ),
                  border: Border.all(color: tint.withValues(alpha: glow + 0.25), width: 1.5),
                  boxShadow: [
                    BoxShadow(color: tint.withValues(alpha: glow * 0.5), blurRadius: 24),
                  ],
                ),
                child: Row(children: [
                  // آیکونِ ویژگی، با هالهٔ نبض‌دار.
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: tint.withValues(alpha: 0.18),
                      border: Border.all(color: tint.withValues(alpha: 0.55), width: 1.5),
                      boxShadow: [
                        BoxShadow(color: tint.withValues(alpha: glow * 0.7), blurRadius: 16),
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
                        Text('راند ${faNum(widget.roundNumber)} — نبرد بر سر',
                            style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: Colors.white.withValues(alpha: 0.72))),
                        const SizedBox(height: 1),
                        Text(
                          statName.isEmpty ? label : '$statName!',
                          style: TextStyle(
                            fontSize: 21,
                            fontWeight: FontWeight.w900,
                            color: tint,
                            height: 1.25,
                            shadows: [
                              Shadow(color: tint.withValues(alpha: glow), blurRadius: 14),
                            ],
                          ),
                        ),
                        if (text.isNotEmpty)
                          Text(text,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12,
                                  height: 1.5,
                                  color: Colors.white70,
                                  fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ]),
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
  const _FocusStatRibbon({required this.card, required this.stat, required this.tint});
  final Map card;
  final String stat;
  final Color tint;

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
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(99),
        color: tint.withValues(alpha: 0.18),
        border: Border.all(color: tint.withValues(alpha: 0.5)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(_FocusBannerState._statIcons[stat] ?? Icons.stars_rounded,
            size: 13, color: tint),
        const SizedBox(width: 4),
        Text(faNum(value),
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: tint)),
      ]),
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
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Icon(widget.icon, size: 20, color: _gold),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(widget.title,
                          style: const TextStyle(
                              fontSize: 13.5, fontWeight: FontWeight.w900)),
                      Text(widget.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
                    ],
                  ),
                ),
                AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(Icons.expand_more_rounded, color: Colors.white54),
                ),
              ]),
            ),
          ),
          // فرزند فقط وقتی باز است اصلاً ساخته می‌شود.
          if (_open) ...[
            const SizedBox(height: Gaps.xs),
            widget.child,
          ],
        ]),
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
/// یک overlay تمام‌صفحه که با شروعِ هر راند دو ثانیه می‌آید و می‌رود:
/// پس‌زمینه تار می‌شود، آیکنِ ویژگی از دور می‌آید و می‌چرخد، شعار
/// («سریع‌ترین کارتت را بفرست!») بزرگ نوشته می‌شود و یک راهنمای یک‌خطی
/// برای گروهِ سنیِ پایین زیرش می‌آید.
///
/// چون overlay است، **هیچ ارتفاعی از چیدمان نمی‌گیرد** — یعنی هم‌زمان
/// مشکلِ اسکرول را هم حل می‌کند.
///
/// `IgnorePointer`: کاربر باید بتواند وسطِ انیمیشن کارتش را بزند؛ اعلان
/// نباید جلوی بازی را بگیرد.
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
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2000),
  );

  @override
  void initState() {
    super.initState();
    if (_hasFocus) _c.forward();
  }

  bool get _hasFocus => '${widget.focus?['stat'] ?? ''}'.isNotEmpty;

  @override
  void didUpdateWidget(covariant _RoundIntroOverlay old) {
    super.didUpdateWidget(old);
    // راندِ تازه → اعلانِ تازه. بدونِ این، فقط راندِ اول اعلان داشت.
    if (old.roundNumber != widget.roundNumber && _hasFocus) {
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

  @override
  Widget build(BuildContext context) {
    if (!_hasFocus) return const SizedBox.shrink();
    final stat = '${widget.focus?['stat'] ?? ''}';
    final cry = '${widget.focus?['cry'] ?? widget.focus?['label'] ?? ''}';
    final hint = '${widget.focus?['hint'] ?? ''}';
    final emoji = '${widget.focus?['emoji'] ?? ''}';
    final tint = _FocusBannerState._statColors[stat] ?? _cyan;
    final icon = _FocusBannerState._statIcons[stat] ?? Icons.stars_rounded;
    final statName = _FocusBannerState._statNames[stat] ?? '';

    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final v = _c.value;
        if (v >= 1.0) return const SizedBox.shrink();
        // سه فاز: ورود (۰–۰.۲۵)، ماندن (۰.۲۵–۰.۷۵)، خروج (۰.۷۵–۱).
        final enter = Curves.easeOutBack.transform((v / 0.25).clamp(0.0, 1.0));
        final exit = Curves.easeIn.transform(((v - 0.75) / 0.25).clamp(0.0, 1.0));
        final opacity = (1 - exit).clamp(0.0, 1.0);
        // آیکن از دور می‌آید و یک دورِ کامل می‌چرخد.
        final spin = (1 - enter) * math.pi * 2;
        final scale = 0.4 + 0.6 * enter;

        return IgnorePointer(
          child: Opacity(
            opacity: opacity,
            child: Container(
              // پردهٔ تیره تا متن روی هر پس‌زمینه‌ای خوانا بماند.
              color: Colors.black.withValues(alpha: 0.55 * opacity),
              alignment: Alignment.center,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('راند ${faNum(widget.roundNumber)} از ${faNum(widget.totalRounds)}',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: Colors.white.withValues(alpha: 0.75))),
                  const SizedBox(height: 14),
                  Transform.rotate(
                    angle: spin,
                    child: Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 104,
                        height: 104,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [
                            tint.withValues(alpha: 0.38),
                            Colors.transparent,
                          ]),
                          border: Border.all(color: tint, width: 2.5),
                          boxShadow: [
                            BoxShadow(color: tint.withValues(alpha: 0.55), blurRadius: 40),
                          ],
                        ),
                        child: Icon(icon, color: tint, size: 52),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // شعار: بزرگ‌ترین متنِ صفحه در این لحظه.
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 26),
                    child: Transform.scale(
                      scale: 0.86 + 0.14 * enter,
                      child: Text(
                        emoji.isEmpty ? cry : '$emoji  $cry',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 27,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          height: 1.3,
                          shadows: [
                            Shadow(color: tint, blurRadius: 26),
                            const Shadow(color: Colors.black, blurRadius: 8),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (statName.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 7),
                      decoration: BoxDecoration(
                        color: tint.withValues(alpha: 0.20),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: tint.withValues(alpha: 0.75)),
                      ),
                      child: Text('بالاترین «$statName» برنده است',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w900, color: tint)),
                    ),
                  ],
                  // ── راهنمای گروهِ سنیِ پایین ──
                  // یک جملهٔ ساده بدونِ اصطلاحِ فنی. بچه‌ای که تازه
                  // خواندن یاد گرفته باید بفهمد چه کار کند.
                  if (hint.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 34),
                      child: Text(hint,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              fontSize: 13.5,
                              height: 1.6,
                              color: Colors.white70,
                              fontWeight: FontWeight.w700)),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════
/// درگاهِ تستِ اعلانِ راند
/// ═══════════════════════════════════════════════════════════════════════
///
/// همان الگوی `CardDuelClashStageForTest`: کلاس خصوصی می‌ماند ولی تست
/// می‌تواند بسازدش. بدونِ این، انیمیشنِ اعلان هیچ نگهبانی نداشت.
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
        child: Row(children: [
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
            child: Text(modeTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w900, color: modeColor)),
          ),
        ]),
      );
}
