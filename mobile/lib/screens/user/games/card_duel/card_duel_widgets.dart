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
                      style: TextStyle(color: modeColor, fontSize: 9, letterSpacing: 1.2, fontWeight: FontWeight.w900)),
                  Text('دوئل کارت‌ها',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          )),
                  Text('پنج راند مخفی، برخورد زنده و برندهٔ واضح هر راند',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.68), fontSize: 11.5)),
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
            Expanded(child: _RuleStep(number: '۱', title: '۵ کارت بچین', subtitle: 'نقش‌های مکمل')),
            Icon(Icons.chevron_left_rounded, color: Colors.white24),
            Expanded(child: _RuleStep(number: '۲', title: 'مخفی انتخاب کن', subtitle: 'هم‌زمان با حریف')),
            Icon(Icons.chevron_left_rounded, color: Colors.white24),
            Expanded(child: _RuleStep(number: '۳', title: '۳ راند ببر', subtitle: 'قهرمان آرنا شو')),
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
              child: Text(number, style: const TextStyle(color: _gold, fontWeight: FontWeight.w900, fontSize: 10))),
          const SizedBox(height: 4),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900)),
          Text(subtitle, textAlign: TextAlign.center, style: TextStyle(fontSize: 8.5, color: Colors.white.withValues(alpha: 0.46))),
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
              Text('پنج کارت؛ برای حذف روی اسلات بزن', style: TextStyle(fontSize: 9, color: Colors.white54)),
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
            ? Container(
                decoration: BoxDecoration(
                  borderRadius: Corners.rLg,
                  border: Border.all(color: Colors.white24),
                  gradient: const LinearGradient(colors: [Color(0xFF17283D), Color(0xFF050A11)]),
                ),
                child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.add_rounded, color: Colors.white38),
                  Text('کارت ${faNum(index + 1)}', style: const TextStyle(fontSize: 9, color: Colors.white54)),
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
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Colors.white60)),
            Gaps.vMd,
            OutlinedButton(onPressed: onCancel, child: const Text('لغو و ویرایش ترکیب')),
          ]),
        ),
      );
}

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
    final deck = (state['myDeck'] as List? ?? const []).whereType<Map>().toList();
    final remaining = (state['myRemainingCardIds'] as List? ?? const []).map((id) => '$id').toSet();
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
        title: '${state['roundTitle'] ?? 'پایان نبرد'}',
        roundLabel: 'راند ${faNum((roundIndex + 1).clamp(1, total))} از ${faNum(total)}',
      ),
      Gaps.vSm,
      _RoundPips(total: total, current: roundIndex, history: history, mine: mine, color: color),
      Gaps.vMd,
      _ClashStage(round: lastRound, mine: mine, color: color),
      if (session.phase == GamePhase.playing) ...[
        Gaps.vSm,
        AppCard(
            child: Column(children: [
          Row(children: [
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
                  style: const TextStyle(fontSize: 9.5, color: Colors.white54)),
            ])),
            AnimatedBuilder(
                animation: session.clock,
                builder: (_, __) => CircleAvatar(
                    radius: 24,
                    backgroundColor: const Color(0xFF02060C),
                    child: Text(faNum(session.secondsLeft),
                        style: TextStyle(color: color, fontWeight: FontWeight.w900)))),
          ]),
          Gaps.vSm,
          SizedBox(
            height: 168,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: deck.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final card = Map<String, dynamic>.from(deck[index]);
                final id = cardIdOf(card);
                final canPlay = !iChose && remaining.contains(id);
                return SizedBox(
                  width: 112,
                  child: PlayerCard(
                    card: card,
                    compact: true,
                    showStats: false,
                    enabled: canPlay,
                    onTap: canPlay ? () => session.moveObject({'cardId': id}) : null,
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

  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(children: [
          Expanded(child: _Score(name: myName, score: myScore, color: color, player: myPlayer)),
          Column(children: [
            Text(roundLabel, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w900)),
            Text(title, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            Text('${faNum(myScore)}  —  ${faNum(theirScore)}',
                textDirection: TextDirection.ltr,
                style: const TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.w900)),
          ]),
          Expanded(child: _Score(name: theirName, score: theirScore, color: _gold, player: theirPlayer, reverse: true)),
        ]),
      );
}

class _Score extends StatelessWidget {
  const _Score({required this.name, required this.score, required this.color, required this.player, this.reverse = false});
  final String name;
  final int score;
  final Color color;
  final Map? player;
  final bool reverse;
  @override
  Widget build(BuildContext context) {
    final cosmetics = player?['cosmetics'] is Map ? player!['cosmetics'] as Map : const {};
    final isBot = player?['isBot'] == true;
    final parts = [
      TweenAnimationBuilder<int>(
        tween: IntTween(begin: 0, end: score),
        duration: const Duration(milliseconds: 420),
        builder: (_, value, __) => CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFF02060C),
            child: Text(faNum(value), style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.w900))),
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
          child: DisplayName(
        name: name,
        cosmetics: cosmetics,
        level: (player?['level'] as num?)?.toInt(),
        style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800),
      )),
    ];
    return Row(mainAxisAlignment: reverse ? MainAxisAlignment.end : MainAxisAlignment.start, children: reverse ? parts.reversed.toList() : parts);
  }
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

class _ClashStage extends StatelessWidget {
  const _ClashStage({required this.round, required this.mine, required this.color});
  final Map<String, dynamic>? round;
  final String mine;
  final Color color;

  @override
  Widget build(BuildContext context) {
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
    final myCard = Map<String, dynamic>.from((mine == 'O' ? round!['cardO'] : round!['cardX']) as Map? ?? const {});
    final otherCard = Map<String, dynamic>.from((mine == 'O' ? round!['cardX'] : round!['cardO']) as Map? ?? const {});
    final myPower = mine == 'O' ? round!['powerO'] : round!['powerX'];
    final otherPower = mine == 'O' ? round!['powerX'] : round!['powerO'];
    final winner = '${round!['winner']}';
    final iWon = winner == mine;
    final draw = winner == 'DRAW';
    return TweenAnimationBuilder<double>(
      key: ValueKey(round!['round']),
      tween: Tween(begin: 0.86, end: 1),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutBack,
      builder: (_, value, child) => Opacity(
        opacity: ((value - 0.86) / 0.14).clamp(0.0, 1.0),
        child: Transform.scale(scale: value, child: child),
      ),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: Corners.rXl,
          gradient: LinearGradient(colors: [
            (draw ? _gold : iWon ? _emerald : _rose).withValues(alpha: 0.16),
            const Color(0xFF07111D),
          ]),
          border: Border.all(color: (draw ? _gold : iWon ? _emerald : _rose).withValues(alpha: 0.55), width: 1.4),
        ),
        child: Column(children: [
          Row(children: [
            Expanded(child: AspectRatio(aspectRatio: 0.68, child: PlayerCard(card: myCard, compact: true, showStats: false, winner: iWon, loser: !draw && !iWon))),
            Expanded(
                child: Column(children: [
              Text('راند ${faNum(round!['round'])}', style: const TextStyle(fontSize: 10, color: Colors.white54)),
              Text('${round!['title']}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text('${faNum(myPower)}  VS  ${faNum(otherPower)}',
                  textDirection: TextDirection.ltr, style: const TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: (draw ? _gold : iWon ? _emerald : _rose).withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  draw ? 'برخورد برابر' : iWon ? 'WINNER' : 'باخت راند',
                  style: TextStyle(color: draw ? _gold : iWon ? _emerald : _rose, fontWeight: FontWeight.w900, letterSpacing: 0.6),
                ),
              ),
            ])),
            Expanded(child: AspectRatio(aspectRatio: 0.68, child: PlayerCard(card: otherCard, compact: true, showStats: false, winner: !draw && !iWon, loser: iWon))),
          ]),
          Gaps.vXs,
          Text('${round!['reason'] ?? round!['text'] ?? ''}',
              textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }
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
          style: const TextStyle(fontSize: 10.5, color: Colors.white60),
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
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
                ),
            ],
          ),
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
            style: TextStyle(fontSize: 10, color: Colors.white54),
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
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
                      Text(
                          '${faNum(raw['userScore'])} - ${faNum(raw['opponentScore'])} · '
                          '${_settlementLabel('${raw['settlementStatus'] ?? 'settled'}')}',
                          style: const TextStyle(fontSize: 9, color: Colors.white54)),
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
