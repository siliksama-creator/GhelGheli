part of '../card_duel_page.dart';

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
          boxShadow: [
            BoxShadow(color: modeColor.withValues(alpha: 0.16), blurRadius: 34, offset: const Offset(0, 15)),
          ],
        ),
        child: Column(
          children: [
            Row(
              children: [
                IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back_rounded)),
                Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: modeColor.withValues(alpha: 0.34), blurRadius: 26)],
                  ),
                  child: Image.asset('assets/games/card_duel_glow.png', cacheWidth: 190),
                ),
                Gaps.hSm,
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
                      Text('انتخاب مخفی، ضدترکیب هوشمند و سه راند نفس‌گیر',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.68), fontSize: 11.5)),
                    ],
                  ),
                ),
              ],
            ),
            Gaps.vSm,
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xs),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.28),
                borderRadius: Corners.rLg,
                border: Border.all(color: modeColor.withValues(alpha: 0.38)),
              ),
              child: Row(
                children: [
                  Icon(modeTitle.contains('ربات') ? Icons.smart_toy_rounded : Icons.bolt_rounded, color: modeColor),
                  Gaps.hXs,
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(modeTitle, style: TextStyle(color: modeColor, fontWeight: FontWeight.w900)),
                    Text(subtitle, style: TextStyle(color: Colors.white.withValues(alpha: 0.62), fontSize: 10)),
                  ])),
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
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(Gaps.sm),
        child: Row(
          children: const [
            Expanded(child: _RuleStep(number: '۱', title: 'تیم بچین', subtitle: 'سه نقش مکمل')),
            Icon(Icons.chevron_left_rounded, color: Colors.white24),
            Expanded(child: _RuleStep(number: '۲', title: 'مخفی انتخاب کن', subtitle: 'هم‌زمان با حریف')),
            Icon(Icons.chevron_left_rounded, color: Colors.white24),
            Expanded(child: _RuleStep(number: '۳', title: 'دو راند ببر', subtitle: 'قهرمان آرنا شو')),
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
          CircleAvatar(radius: 13, backgroundColor: _gold.withValues(alpha: 0.15),
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
    final byId = {for (final card in cards) '${card['cardTypeId'] ?? card['id']}': card};
    return AppCard(
      child: Column(
        children: [
          Row(children: [
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('ترکیب اصلی', style: TextStyle(fontWeight: FontWeight.w900)),
              Text('برای حذف، روی کارت ترکیب بزن', style: TextStyle(fontSize: 9, color: Colors.white54)),
            ])),
            Text('${faNum(teamPower)} قدرت', style: const TextStyle(color: _gold, fontWeight: FontWeight.w900)),
          ]),
          Gaps.vSm,
          Row(children: [
            for (var index = 0; index < 3; index++) ...[
              Expanded(child: _LineupSlot(
                index: index,
                card: index < selected.length ? byId[selected[index]] : null,
                onTap: index < selected.length ? () => onRemove(selected[index]) : null,
              )),
              if (index < 2) Gaps.hXs,
            ],
          ]),
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
        child: Container(
          height: 112,
          decoration: BoxDecoration(
            borderRadius: Corners.rLg,
            border: Border.all(color: card == null ? Colors.white24 : _gold.withValues(alpha: 0.55)),
            gradient: const LinearGradient(colors: [Color(0xFF17283D), Color(0xFF050A11)]),
          ),
          clipBehavior: Clip.antiAlias,
          child: card == null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.add_rounded, color: Colors.white38),
                  Text('کارت ${faNum(index + 1)}', style: const TextStyle(fontSize: 9, color: Colors.white54)),
                ]))
              : Stack(fit: StackFit.expand, children: [
                  SafeImage(url: card!['imageUrl'], fit: BoxFit.cover, fallbackEmoji: '🃏'),
                  const DecoratedBox(decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.center, end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xF2050910)]),
                  )),
                  Positioned(right: 5, left: 5, bottom: 5,
                    child: Text('${card!['name']}', maxLines: 1, overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900))),
                ]),
        ),
      );
}

class _HoloCard extends StatelessWidget {
  const _HoloCard({required this.card, this.selected = false, this.compact = false, this.enabled = true, this.onTap});
  final Map card;
  final bool selected;
  final bool compact;
  final bool enabled;
  final VoidCallback? onTap;

  Color get rarity => switch ('${card['rarity']}') {
        'legend' => const Color(0xFFFF6B35),
        'premium' || 'gold' => _gold,
        'silver' => const Color(0xFFC7D2FE),
        _ => _emerald,
      };

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: enabled ? 1 : 0.34,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: Corners.rXl,
          child: AnimatedContainer(
            duration: Motion.fast,
            padding: EdgeInsets.all(compact ? 6 : 8),
            decoration: BoxDecoration(
              borderRadius: Corners.rXl,
              gradient: LinearGradient(colors: [
                rarity.withValues(alpha: selected ? 0.26 : 0.14),
                const Color(0xFF101C2B),
                const Color(0xFF04080F),
              ]),
              border: Border.all(color: rarity.withValues(alpha: selected ? 0.95 : 0.34), width: selected ? 2 : 1),
              boxShadow: selected ? [BoxShadow(color: rarity.withValues(alpha: 0.25), blurRadius: 25)] : null,
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: Stack(fit: StackFit.expand, children: [
                ClipRRect(borderRadius: Corners.rLg,
                    child: SafeImage(url: card['imageUrl'], fit: BoxFit.cover, fallbackEmoji: '${card['id']}'.startsWith('bot-') ? '🤖' : '🃏')),
                const DecoratedBox(decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.center, end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xD902050A)]),
                )),
                Positioned(right: 6, bottom: 6,
                  child: CircleAvatar(radius: compact ? 14 : 18, backgroundColor: const Color(0xDD02060C),
                    child: Text(faNum(card['power']), style: TextStyle(color: rarity, fontSize: compact ? 9 : 11, fontWeight: FontWeight.w900)))),
                if (selected) const Positioned(right: 6, top: 6,
                  child: CircleAvatar(radius: 13, backgroundColor: _gold,
                    child: Icon(Icons.check_rounded, color: Color(0xFF07111B), size: 17))),
              ])),
              const SizedBox(height: 5),
              Text('${card['name'] ?? 'کارت'}', maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: compact ? 10 : 12.5, fontWeight: FontWeight.w900)),
              if (!compact) ...[
                Text('${card['rarityLabel'] ?? ''} · ${card['effectLabel'] ?? ''}', maxLines: 1,
                    overflow: TextOverflow.ellipsis, style: TextStyle(color: rarity, fontSize: 8.5)),
                const SizedBox(height: 4),
                Wrap(spacing: 3, runSpacing: 3, children: [
                  _Stat('ح', card['attack']), _Stat('د', card['defense']), _Stat('س', card['speed']),
                  _Stat('ت', card['technique']), _Stat('گل', card['goalChance']),
                ]),
              ],
            ]),
          ),
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);
  final String label;
  final Object? value;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), borderRadius: Corners.rSm),
        child: Text('$label ${faNum(value)}', style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800)),
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
          height: 350,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 130, height: 130,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: color),
                boxShadow: [BoxShadow(color: color.withValues(alpha: 0.26), blurRadius: 36)]),
              padding: const EdgeInsets.all(24),
              child: Image.asset('assets/games/card_duel_glow.png'),
            ),
            Gaps.vMd,
            Text(vsBot ? 'ربات تاکتیکی وارد آرنا می‌شود…' : 'در جستجوی حریف هم‌سطح…',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            Gaps.vXs,
            const Text('ترکیب تو قفل و محفوظ است؛ کارت‌ها تا لحظه برخورد مخفی می‌مانند.',
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
    final lastRound = state['lastRound'] is Map ? state['lastRound'] as Map : null;
    final iChose = state['iChose'] == true;
    return Column(children: [
      AppCard(child: Row(children: [
        Expanded(child: _Score(name: session.nameOf(mine), score: NumberParser.toInt(score[mine]), color: color)),
        Column(children: [
          Text('راند ${faNum((NumberParser.toInt(state['roundIndex']) + 1).clamp(1, 3))} از ۳',
              style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w900)),
          Text('${state['roundTitle'] ?? 'پایان نبرد'}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        ]),
        Expanded(child: _Score(name: session.nameOf(opponent), score: NumberParser.toInt(score[opponent]), color: _gold, reverse: true)),
      ])),
      Gaps.vXs,
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (var i = 0; i < 3; i++) Container(
          width: 38, height: 4, margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(borderRadius: Corners.rPill,
            color: i < NumberParser.toInt(state['roundIndex']) ? _emerald
                : i == NumberParser.toInt(state['roundIndex']) ? color : Colors.white12),
        ),
      ]),
      Gaps.vMd,
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (var i = 0; i < NumberParser.toInt(state['opponentRemainingCount']); i++)
          Transform.rotate(angle: (i - 1) * 0.08,
            child: Container(width: 55, height: 75, margin: const EdgeInsets.symmetric(horizontal: 2),
              decoration: BoxDecoration(borderRadius: Corners.rMd,
                gradient: const LinearGradient(colors: [Color(0xFF19304A), Color(0xFF050A11)]),
                border: Border.all(color: _gold.withValues(alpha: 0.55))),
              child: Image.asset('assets/games/card_duel_glow.png', width: 42))),
      ]),
      if (lastRound != null) ...[Gaps.vSm, _RoundReveal(round: lastRound, mine: mine)],
      if (session.phase == GamePhase.playing) ...[
        Gaps.vSm,
        AppCard(child: Column(children: [
          Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(iChose ? 'انتخابت قفل شد' : 'کارت این راند را انتخاب کن',
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              Text(state['waitingForOpponent'] == true ? 'منتظر انتخاب حریف…'
                  : state['opponentLocked'] == true ? 'حریف انتخاب کرده؛ تصمیم بگیر!'
                  : 'انتخاب‌ها مخفی و هم‌زمان هستند',
                  style: const TextStyle(fontSize: 9.5, color: Colors.white54)),
            ])),
            AnimatedBuilder(animation: session.clock, builder: (_, __) => CircleAvatar(
              radius: 25, backgroundColor: const Color(0xFF02060C),
              child: Text(faNum(session.secondsLeft), style: TextStyle(color: color, fontWeight: FontWeight.w900)))),
          ]),
          Gaps.vSm,
          Row(children: [
            for (var i = 0; i < deck.length; i++) ...[
              Expanded(child: AspectRatio(aspectRatio: 0.72,
                child: _HoloCard(card: deck[i], compact: true,
                  enabled: !iChose && remaining.contains('${deck[i]['cardTypeId'] ?? deck[i]['id']}'),
                  onTap: () => session.moveObject({'cardId': '${deck[i]['cardTypeId'] ?? deck[i]['id']}'})))),
              if (i < deck.length - 1) Gaps.hXs,
            ],
          ]),
        ])),
      ],
    ]);
  }
}

class _Score extends StatelessWidget {
  const _Score({required this.name, required this.score, required this.color, this.reverse = false});
  final String name; final int score; final Color color; final bool reverse;
  @override
  Widget build(BuildContext context) {
    final parts = [
      CircleAvatar(radius: 19, backgroundColor: const Color(0xFF02060C), child: Text(faNum(score), style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w900))),
      Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800))),
    ];
    return Row(mainAxisAlignment: reverse ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: reverse ? parts.reversed.toList() : parts);
  }
}

class _RoundReveal extends StatelessWidget {
  const _RoundReveal({required this.round, required this.mine});
  final Map round; final String mine;
  @override
  Widget build(BuildContext context) {
    final myCard = (mine == 'O' ? round['cardO'] : round['cardX']) as Map? ?? const {};
    final otherCard = (mine == 'O' ? round['cardX'] : round['cardO']) as Map? ?? const {};
    final myPower = mine == 'O' ? round['powerO'] : round['powerX'];
    final otherPower = mine == 'O' ? round['powerX'] : round['powerO'];
    final winner = '${round['winner']}';
    return AppCard(child: Row(children: [
      Expanded(child: AspectRatio(aspectRatio: 0.72, child: _HoloCard(card: myCard, compact: true))),
      Gaps.hXs,
      Expanded(child: Column(children: [
        Text('راند ${faNum(round['round'])}', style: const TextStyle(fontSize: 9, color: Colors.white54)),
        Text('${round['title']}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
        Text('${faNum(myPower)}  VS  ${faNum(otherPower)}', textDirection: TextDirection.ltr,
            style: const TextStyle(color: _gold, fontSize: 17, fontWeight: FontWeight.w900)),
        Text(winner == 'DRAW' ? 'برخورد برابر!' : winner == mine ? 'این راند مال تو شد!' : 'حریف راند را برد',
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 9.5, color: Colors.white60)),
      ])),
      Gaps.hXs,
      Expanded(child: AspectRatio(aspectRatio: 0.72, child: _HoloCard(card: otherCard, compact: true))),
    ]));
  }
}

class _Finale extends StatelessWidget {
  const _Finale({required this.session, required this.color, required this.onAgain, required this.onEdit, required this.privateLobby});
  final GameSession session; final Color color; final VoidCallback onAgain; final VoidCallback onEdit; final bool privateLobby;
  @override
  Widget build(BuildContext context) {
    final won = session.iWon;
    final draw = session.winner == 'DRAW';
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(borderRadius: Corners.rXl,
        gradient: const LinearGradient(colors: [Color(0xFF17304C), Color(0xFF050A12)]),
        border: Border.all(color: color)),
      child: Column(children: [
        Text(draw ? '🤝' : won ? '🏆' : '🛡️', style: const TextStyle(fontSize: 44)),
        Text(draw ? 'نبرد برابر!' : won ? 'فرمانروای آرنا شدی!' : 'این نبرد تمام شد؛ ترکیبت را هوشمندتر کن',
            textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
        Gaps.vXs,
        Text(session.vsBot ? 'تمرین تمام شد؛ امتیازی جابه‌جا نشد.'
            : draw ? 'ورودی کامل هر دو نفر برمی‌گردد.'
            : won ? 'پات مسابقه پس از کسر کارمزد تسویه می‌شود.'
            : '${faNum(session.stake)} امتیاز ورودی از دست رفت.',
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, color: Colors.white60)),
        Gaps.vSm,
        Row(children: [
          Expanded(child: FilledButton(onPressed: onAgain, child: Text(privateLobby ? 'بازگشت به لابی' : 'نبرد دوباره'))),
          Gaps.hXs,
          Expanded(child: OutlinedButton(onPressed: onEdit, child: const Text('تغییر ترکیب'))),
        ]),
      ]),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.message, required this.onBack});
  final String message; final VoidCallback onBack;
  @override
  Widget build(BuildContext context) => AppCard(child: Column(children: [
    Icon(Icons.error_outline_rounded, color: Theme.of(context).colorScheme.error, size: 34),
    Gaps.vXs,
    Text(message, textAlign: TextAlign.center),
    Gaps.vSm,
    FilledButton(onPressed: onBack, child: const Text('بازگشت به ترکیب')),
  ]));
}

class _History extends StatelessWidget {
  const _History({required this.battles});
  final List battles;
  @override
  Widget build(BuildContext context) {
    const labels = {'bot': 'تمرین با ربات', 'online': 'نبرد آنلاین', 'lobby': 'لابی خصوصی'};
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('آخرین نبردها', style: TextStyle(fontWeight: FontWeight.w900)),
      Gaps.vXs,
      if (battles.isEmpty) const AppCard(child: Text('اولین نبردت را شروع کن؛ تاریخچه اینجا ساخته می‌شود.')),
      for (final raw in battles.whereType<Map>().take(6))
        Padding(padding: const EdgeInsets.only(bottom: Gaps.xs), child: AppCard(
          padding: const EdgeInsets.all(Gaps.sm), elevated: false,
          child: Row(children: [
            Icon(NumberParser.toInt(raw['userDelta']) > 0 ? Icons.trending_up_rounded
                : NumberParser.toInt(raw['userDelta']) < 0 ? Icons.trending_down_rounded : Icons.diamond_outlined,
                color: NumberParser.toInt(raw['userDelta']) >= 0 ? _emerald : BrandColors.danger),
            Gaps.hSm,
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(labels['${raw['mode']}'] ?? 'دوئل کارت', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              Text('${faNum(raw['userScore'])} - ${faNum(raw['opponentScore'])}', style: const TextStyle(fontSize: 9, color: Colors.white54)),
            ])),
            Text(NumberParser.toInt(raw['userDelta']) > 0 ? '+${faNum(raw['userDelta'])}' : faNum(raw['userDelta']),
                style: TextStyle(color: NumberParser.toInt(raw['userDelta']) >= 0 ? _emerald : BrandColors.danger,
                    fontWeight: FontWeight.w900)),
          ]),
        )),
    ]);
  }
}
