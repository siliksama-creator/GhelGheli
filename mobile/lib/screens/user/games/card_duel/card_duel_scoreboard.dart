part of '../card_duel_page.dart';

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
    required this.tension,
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

  /// حرارتِ نبرد — فقط شدتِ نور و ضربان را تعیین می‌کند، هیچ متنی اضافه
  /// نمی‌کند.
  final DuelTension tension;

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

    // ── حرارتِ نبرد روی قابِ امتیاز ──
    //
    // در لحظهٔ سرنوشت‌ساز، قابِ نوارِ امتیاز رنگ و هالهٔ حرارت می‌گیرد.
    // این دقیقاً همان کاری است که `.tension-*` در CSS وب می‌کند تا هر دو
    // پلتفرم یک حس بدهند. متن دست‌نخورده می‌ماند.
    final heatColor = switch (tension.level) {
      DuelTensionLevel.decider => const Color(0xFFF43F5E),
      DuelTensionLevel.critical => _rose,
      DuelTensionLevel.heated => _gold,
      DuelTensionLevel.calm => color,
    };
    final heat = switch (tension.level) {
      DuelTensionLevel.decider => 1.0,
      DuelTensionLevel.critical => .78,
      DuelTensionLevel.heated => .45,
      DuelTensionLevel.calm => 0.0,
    };

    return Semantics(
      label:
          'امتیاز تو ${faNum(myScore)}، امتیاز $opponentRole ${faNum(theirScore)}. $status',
      child: _HeatFrame(
        heat: heat,
        color: heatColor,
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
                  matchPoint: tension.matchPoint == 'mine',
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
                  matchPoint: tension.matchPoint == 'theirs',
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

/// قابِ حرارت — هالهٔ نفس‌کشندهٔ دورِ نوارِ امتیاز.
///
/// معادلِ `@keyframes duelHeatFrame` در وب. هرچه نبرد حساس‌تر، ضربان
/// تندتر و هاله روشن‌تر. در حرارتِ صفر **هیچ ویجتی اضافه نمی‌شود** تا
/// درختِ ویجت در حالتِ عادی سنگین‌تر نشود.
///
/// ⚠️ احترام به `disableAnimations` اجباری است: کاربری که در تنظیماتِ
/// سیستم کاهشِ حرکت را روشن کرده، هاله را ثابت می‌بیند نه متحرک.
class _HeatFrame extends StatefulWidget {
  const _HeatFrame({
    required this.heat,
    required this.color,
    required this.child,
  });
  final double heat;
  final Color color;
  final Widget child;

  @override
  State<_HeatFrame> createState() => _HeatFrameState();
}

class _HeatFrameState extends State<_HeatFrame>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );

  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    _sync();
  }

  @override
  void didUpdateWidget(covariant _HeatFrame old) {
    super.didUpdateWidget(old);
    if (old.heat != widget.heat) _sync();
  }

  /// سرعتِ ضربان با حرارت بالا می‌رود؛ در حرارتِ صفر — یا وقتی کاربر
  /// کاهشِ حرکت را روشن کرده — کنترلر کلاً **متوقف** می‌شود، نه اینکه فقط
  /// نتیجه‌اش نادیده گرفته شود. یک `repeat()` فراموش‌شده هر فریم را برای
  /// انیمیشنی می‌سوزاند که هیچ‌کس نمی‌بیند.
  void _sync() {
    if (widget.heat <= 0 || _reduceMotion) {
      _c.stop();
      _c.value = 0;
      return;
    }
    _c.duration = Duration(
      milliseconds: (2400 - widget.heat * 900).round(),
    );
    if (!_c.isAnimating) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.heat <= 0) return widget.child;
    // کاربرِ حساس به حرکت: هاله بله، ضربان نه.
    if (_reduceMotion) {
      return DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: widget.color.withValues(alpha: .22 * widget.heat),
              blurRadius: 22,
            ),
          ],
        ),
        child: widget.child,
      );
    }
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) => DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: widget.color.withValues(
                alpha: (.14 + .20 * _c.value) * widget.heat,
              ),
              blurRadius: 18 + 16 * _c.value * widget.heat,
              spreadRadius: _c.value * widget.heat,
            ),
          ],
        ),
        child: child,
      ),
      child: widget.child,
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
    this.matchPoint = false,
  });
  final String role;
  final String name;
  final int score;
  final Color color;
  final Map? player;
  final bool reverse;
  final bool highlight;
  final bool scoredLast;

  /// این طرف با بردِ همین راند نبرد را قفل می‌کند. حبابِ امتیازش تپش
  /// می‌گیرد — رنگ خودش پیام است، بدونِ یک کلمه متنِ اضافه.
  final bool matchPoint;
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
        boxShadow: highlight || scoredLast || matchPoint
            ? [
                BoxShadow(
                  color: color.withValues(
                    alpha: matchPoint ? .48 : (scoredLast ? .36 : .20),
                  ),
                  blurRadius: matchPoint ? 24 : (scoredLast ? 18 : 12),
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
    this.storm,
    this.tension = const DuelTension.calm(),
  });
  final int total;
  final int current;
  final List<Map> history;
  final String mine;
  final Color color;
  /// الگوی راندهای دو‌امتیازی (از بک‌اند)؛ روی پیپِ طوفانی هالهٔ آتشی.
  final List<dynamic>? storm;

  /// پیپِ راندِ جاری در لحظهٔ سرنوشت‌ساز رنگ و هالهٔ حرارت می‌گیرد.
  /// کوچک‌ترین عنصرِ صحنه است ولی همانی که «کجای نبردیم» را می‌گوید.
  final DuelTension tension;

  bool _isStorm(int i) => storm != null && i < storm!.length && storm![i] == true;

  @override
  Widget build(BuildContext context) {
    final hot = tension.level == DuelTensionLevel.critical ||
        tension.level == DuelTensionLevel.decider;
    final liveColor = switch (tension.level) {
      DuelTensionLevel.decider => const Color(0xFFF43F5E),
      DuelTensionLevel.critical => _rose,
      _ => color,
    };
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < total; i++)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            padding: const EdgeInsets.all(1.4),
            decoration: _isStorm(i)
                ? BoxDecoration(
                    borderRadius: Corners.rPill,
                    border: Border.all(
                      color: const Color(0xFFFF7A1A).withValues(alpha: .7),
                      width: 1.4,
                    ),
                  )
                : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 280),
              width: i == current && hot ? 36 : 30,
              height: i == current && hot ? 9 : 8,
              decoration: BoxDecoration(
                borderRadius: Corners.rPill,
                color: i < history.length
                    ? (_isStorm(i) && '${history[i]['winner']}' != 'DRAW'
                        ? const Color(0xFFFF7A1A)
                        : '${history[i]['winner']}' == mine
                            ? _emerald
                            : '${history[i]['winner']}' == 'DRAW'
                                ? _gold
                                : _rose)
                    : i == current
                        ? (_isStorm(i) ? const Color(0xFFFF7A1A) : liveColor)
                        : Colors.white12,
                boxShadow: i == current && hot
                    ? [
                        BoxShadow(
                          color: (_isStorm(i)
                                  ? const Color(0xFFFF7A1A)
                                  : liveColor)
                              .withValues(alpha: .55),
                          blurRadius: 14,
                        ),
                      ]
                    : const [],
              ),
            ),
          ),
      ],
    );
  }
}
