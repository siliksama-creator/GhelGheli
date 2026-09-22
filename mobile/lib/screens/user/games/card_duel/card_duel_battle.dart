part of '../card_duel_page.dart';

// RarityCardFrame is applied by PlayerCard so inventory, detail and duel share one frame.

/// ═══════════════════════════════════════════════════════════════════════
/// حرارتِ نبرد — دوقلوی دقیقِ `matchTension()` در وب
/// ═══════════════════════════════════════════════════════════════════════
///
/// مشکلی که حل می‌کند: راندِ پنجم با امتیازِ ۲-۲ دقیقاً همان‌قدر آرام دیده
/// می‌شد که راندِ اول. کاربر باید خودش امتیازها را جمع می‌زد تا بفهمد
/// لحظهٔ حساس است.
///
/// این مدل «حرارتِ» راندِ پیشِ‌رو را از وضعیتِ واقعیِ نبرد حساب می‌کند و
/// UI فقط شدتِ نور و ضربان را بالا می‌برد. ❗ هیچ متنِ تازه‌ای اضافه
/// نمی‌شود — خواستهٔ صریحِ مالک.
///
/// ⚠️ این فایل و `userweb/src/lib/cardDuelLogic.js` باید همیشه یک خروجی
/// بدهند؛ وگرنه بازیکنِ اندروید و بازیکنِ وب در یک نبردِ مشترک دو حسِ
/// متفاوت می‌گیرند. تستِ هر دو سمت همین جدول را می‌آزماید.
enum DuelTensionLevel { calm, heated, critical, decider }

@immutable
class DuelTension {
  const DuelTension._(this.level, this.matchPoint, this.decider);

  /// حالتِ آرام — مقدارِ پیش‌فرضِ ویجت‌هایی که هنوز حرارت نمی‌گیرند.
  const DuelTension.calm()
      : level = DuelTensionLevel.calm,
        matchPoint = null,
        decider = false;

  final DuelTensionLevel level;

  /// 'mine' | 'theirs' | null — طرفی که بردِ همین راند نبرد را برایش قفل
  /// می‌کند. فقط برای کسی که جلوتر است معنا دارد.
  final String? matchPoint;

  /// راندِ آخر با امتیازِ برابر: یک کارت همه‌چیز را تعیین می‌کند.
  final bool decider;

  /// قواعدِ واقعیِ بازی (از `backend/src/games/rules/cardDuel.js`):
  /// ۵ راند، هر راند یک امتیاز، مساوی ممکن است، برنده = امتیاز بیشتر.
  factory DuelTension.from({
    required int myScore,
    required int theirScore,
    required int roundIndex,
    int totalRounds = 5,
    List<dynamic>? storm,
    int playedRounds = -1,
  }) {
    final total = totalRounds == 0 ? 5 : totalRounds;
    final played = playedRounds >= 0 ? playedRounds : roundIndex;
    // راندهای بازی‌نشده، شاملِ همینی که در جریان است.
    final remaining = math.max(0, total - played);
    if (remaining <= 0) {
      return const DuelTension._(DuelTensionLevel.calm, null, false);
    }

    // حداکثر امتیازِ راندهای باقی‌مانده: راند دو‌امتیازی ۲ می‌دهد، بقیه ۱.
    var pointsLeft = 0;
    for (var i = played; i < total; i++) {
      pointsLeft += (storm != null && i < storm.length && storm[i] == true)
          ? 2
          : 1;
    }
    if (storm == null) pointsLeft = remaining;

    final lead = (myScore - theirScore).abs();
    // بیشترین امتیازِ ممکن هم فاصله را پر نکند: نتیجه قفل شده.
    if (lead > pointsLeft) {
      return const DuelTension._(DuelTensionLevel.calm, null, false);
    }

    final thisRoundMax =
        (storm != null && played < storm.length && storm[played] == true)
            ? 2
            : 1;

    if (remaining == 1 && myScore == theirScore) {
      return const DuelTension._(DuelTensionLevel.decider, null, true);
    }

    // توپِ مسابقه: فردِ جلو با بردِ این راند به امتیازی برسد که حریف حتی
    // با همهٔ راندهای بعدی نتواند جبران کند.
    final leader = myScore > theirScore
        ? 'mine'
        : myScore < theirScore
            ? 'theirs'
            : null;
    if (leader != null && (lead + thisRoundMax) > (pointsLeft - thisRoundMax)) {
      return DuelTension._(
        DuelTensionLevel.critical,
        leader,
        false,
      );
    }

    if (remaining <= 2 || (lead == 0 && played >= 2)) {
      return const DuelTension._(DuelTensionLevel.heated, null, false);
    }
    return const DuelTension._(DuelTensionLevel.calm, null, false);
  }
}

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
    required this.isStorm,
    required this.overtime,
    required this.myLuck,
    required this.theirLuck,
    required this.myAward,
    required this.theirAward,
    required this.mySquad,
    required this.theirSquad,
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
    // وقت اضافه روی همین راند می‌نشیند (نه راند کارتی تازه).
    final ot = round['overtime'] is Map
        ? Map<String, dynamic>.from(round['overtime'] as Map)
        : const <String, dynamic>{};
    final inOvertime = ot.isNotEmpty;
    int luck(String side) => inOvertime
        ? NumberParser.toInt(ot['luck$side'])
        : NumberParser.toInt(round['luck$side']);
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
      isStorm: '${round['mod'] ?? ''}' == 'storm',
      overtime: ot,
      myLuck: luck(mineKey),
      theirLuck: luck(theirKey),
      myAward: NumberParser.toInt(round['award$mineKey']),
      theirAward: NumberParser.toInt(round['award$theirKey']),
      mySquad: inOvertime ? NumberParser.toInt(ot['base$mineKey']) : 0,
      theirSquad: inOvertime ? NumberParser.toInt(ot['base$theirKey']) : 0,
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
  final bool isStorm;
  final Map<String, dynamic> overtime;
  final int myLuck;
  final int theirLuck;
  final int myAward;
  final int theirAward;
  final int mySquad;
  final int theirSquad;

  bool get inOvertime => overtime.isNotEmpty;
  bool get draw => winner == 'DRAW';
  bool get iWon => winner == mySymbol;
  bool get opponentWon => !draw && !iWon;
  bool get contractValid => inOvertime
      ? iWon || opponentWon // وقت اضافه همیشه برنده دارد
      : draw
          ? myPower == theirPower
          : iWon
              ? myPower > theirPower
              : theirPower > myPower;
  /// امتیازی که از این راند به برنده رسید (عادی ۱، طوفانی/وقت اضافه ۲).
  int get awardForWinner => inOvertime
      ? 2
      : isStorm
          ? 2
          : 1;
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

/// افسانهٔ همیشگیِ «دوئل طوفان» — فقط وقتی پرچم زنده روشن است روی صفحهٔ
/// پیش از بازی می‌آید و سه مفهوم تازه را به‌زبانِ آشنا و با همان آیکون‌های
/// بازی توضیح می‌دهد (شعله = راند دو‌امتیازی، ساعت = وقت اضافه، شبدر = شانس روز).
class _MayhemLegend extends StatelessWidget {
  const _MayhemLegend({this.onHelp});

  /// با ضربهٔ «راهنما» همان آموزش بار اول دوباره باز می‌شود.
  final VoidCallback? onHelp;

  static const List<(IconData, String)> _items = [
    (Icons.local_fire_department_rounded,
        'در راند دو‌امتیازی برنده ۲ امتیاز می‌برد'),
    (Icons.timer_rounded,
        'تساویِ آن راند وقت اضافه دارد؛ قدرت کل ترکیب تعیین می‌کند'),
    (Icons.eco_rounded,
        'شانس روز روی کارت است: سبز به سودت، قرمز به ضررت'),
  ];

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: Gaps.xs),
        padding: const EdgeInsets.all(Gaps.sm),
        decoration: BoxDecoration(
          borderRadius: Corners.rLg,
          gradient: const LinearGradient(
            colors: [Color(0x1FFF7A1A), Color(0x1438BDF8)],
          ),
          border: Border.all(color: const Color(0x59FF7A1A)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.local_fire_department_rounded,
                    size: 16, color: Color(0xFFFFB066)),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'قانون دوئل طوفان',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFFFFB066),
                    ),
                  ),
                ),
                if (onHelp != null)
                  GestureDetector(
                    onTap: onHelp,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0x1AFF7A1A),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: const Color(0x66FF7A1A)),
                      ),
                      child: const Text(
                        'راهنما',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFFFFB066),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            for (final item in _items)
              Padding(
                padding: const EdgeInsets.only(bottom: 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(item.$1, size: 15, color: const Color(0xFFFFB066)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        item.$2,
                        style: const TextStyle(
                          fontSize: 11.5,
                          height: 1.55,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFFE7F2FB),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
}

/// آموزشِ یک‌صفحه‌ایِ بار اولِ دوئل طوفان (bottom sheet). فقط وقتی از صفحه
/// صدا زده می‌شود که طوفان در تمرین فعال است (پرچم=۱ و مرحله≥۱)؛ با پرچم
/// خاموش هیچ‌وقت باز نمی‌شود. متن‌ها آینهٔ وب‌اند (همان چهار کارت).
class _MayhemIntroSheet extends StatelessWidget {
  const _MayhemIntroSheet();

  static const List<(IconData, Color, String, String)> _cards = [
    (
      Icons.local_fire_department_rounded,
      Color(0xFFFF7A1A),
      'راند دو‌امتیازی',
      'در هر نبرد ۱ تا ۲ راند با علامت شعله اعلام می‌شود؛ برندهٔ آن راند به‌جای ۱، ۲ امتیاز می‌گیرد.'
    ),
    (
      Icons.timer_rounded,
      Color(0xFF38BDF8),
      'وقت اضافه',
      'اگر راند دو‌امتیازی مساوی شود، کارتی مصرف نمی‌شود؛ قدرتِ کلِ ترکیبِ هر دو طرف سنجیده می‌شود و برنده همان ۲ امتیاز را می‌برد.'
    ),
    (
      Icons.eco_rounded,
      Color(0xFF22E7A6),
      'شانس روز',
      'روی هر کارت عددی سبز (به سودت) یا قرمز (به ضررت) می‌نشیند. میانگین شانس صفر است؛ در راندهای طوفانی کمی بزرگ‌تر می‌شود ولی کارتِ خیلی قوی‌تر هرگز نمی‌بازد.'
    ),
    (
      Icons.sports_soccer_rounded,
      Color(0xFFF7C948),
      'قانون قدیم پابرجاست',
      'بقیهٔ راندها مثل همیشه ۱ امتیازی‌اند؛ همان ۵ کارت، همان انتخاب مخفی، همان ۵ راند. طوفان فقط فرصتِ جبران و فاصله‌گرفتن است.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.88,
        ),
        decoration: const BoxDecoration(
          color: Color(0xFF141C2B),
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
          border: Border.fromBorderSide(BorderSide(color: Color(0x66FF7A1A))),
        ),
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 44, height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: const Color(0x559FB4C9),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const Icon(Icons.local_fire_department_rounded,
                    size: 30, color: Color(0xFFFFB066)),
                const SizedBox(height: 8),
                const Text(
                  'دوئل طوفان رسید!',
                  style: TextStyle(
                    fontSize: 19, fontWeight: FontWeight.w900, color: Colors.white),
                ),
                const SizedBox(height: 4),
                const Text(
                  'همان بازی همیشگی، با چند راندِ آتشین‌تر',
                  style: TextStyle(fontSize: 12.5, color: Color(0xFF9FB4C9)),
                ),
                const SizedBox(height: 16),
                for (final c in _cards)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 38, height: 38,
                          margin: const EdgeInsets.only(left: 4),
                          decoration: BoxDecoration(
                            color: const Color(0x0FFFFFFF),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(c.$1, size: 20, color: c.$2),
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                c.$3,
                                style: const TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFFEEF6FF),
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                c.$4,
                                style: const TextStyle(
                                  fontSize: 12,
                                  height: 1.7,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFFA9BDCF),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.all(11),
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: const Color(0x1422E7A6),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0x4022E7A6)),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.auto_awesome_rounded,
                          size: 15, color: Color(0xFF22E7A6)),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'نکته: راند دو‌امتیازی پیش از قفلِ انتخاب اعلام می‌شود؛ کارتِ قویِ هماهنگ با تمرکزِ همان راند را نگه دار.',
                          style: TextStyle(
                            fontSize: 11.5,
                            height: 1.7,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF8FE6C4),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFFF7A1A),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text(
                      'فهمیدم، بریم طوفان!',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF1A0F00),
                      ),
                    ),
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
    // الگوی راندهای دو‌امتیازی (دوئل طوفان) از بک‌اند.
    final storm = (state['storm'] as List?)?.cast<dynamic>();
    final roundMod = '${state['roundMod'] ?? ''}';
    // شمارهٔ راندِ جاری — همان فرمولی که اعلانِ سینمایی و بک‌اند می‌گویند.
    final roundNumber = NumberParser.toInt(state['roundIndex']) + 1;
    final modAnnounce = state['roundModAnnounce'] is Map
        ? Map<String, dynamic>.from(state['roundModAnnounce'] as Map)
        : const <String, dynamic>{};
    final iChose = state['iChose'] == true;
    final total = NumberParser.toInt(state['totalRounds']) == 0
        ? 5
        : NumberParser.toInt(state['totalRounds']);
    final roundIndex = NumberParser.toInt(state['roundIndex']);
    // حرارتِ نبرد: راندِ سرنوشت‌ساز باید *حس* شود، نه اینکه کاربر خودش
    // امتیازها را جمع بزند. دقیقاً همان مدلی که وب استفاده می‌کند.
    final tension = DuelTension.from(
      myScore: NumberParser.toInt(score[mine]),
      theirScore: NumberParser.toInt(score[opponent]),
      roundIndex: roundIndex,
      totalRounds: total,
      storm: storm,
      playedRounds: history.length,
    );
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
          tension: tension,
        ),
        Gaps.vXs,
        _RoundPips(
          total: total,
          current: roundIndex,
          history: history,
          mine: mine,
          color: color,
          storm: storm,
          tension: tension,
        ),
        // روبانِ ماندگارِ راند دو‌امتیازی در نوار بازی (تا پایان راند می‌ماند).
        if (roundMod == 'storm')
          Padding(
            padding: const EdgeInsets.only(bottom: 4, top: 2),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                gradient: const LinearGradient(
                  colors: [Color(0xFFFF7A1A), Color(0xFFFF4D2E)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFF4D2E).withValues(alpha: .4),
                    blurRadius: 12,
                  ),
                ],
              ),
              child: Text(
                '${modAnnounce['text'] ?? 'راند دو‌امتیازی؛ برنده ۲ امتیاز می‌برد'}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 11.5,
                ),
              ),
            ),
          ),
        Gaps.vXs,
        // ── چرا بنرِ افقیِ تمام‌عرض حذف شد ──
        //
        // نسخهٔ اولِ `_FocusBanner` ~۹۰ پیکسل ارتفاع می‌گرفت و صفحه را
        // اسکرول‌دار می‌کرد. جایش را `_RoundIntroOverlay` گرفته که وسطِ
        // صفحه و روی همه‌چیز می‌آید، ۲.۸ ثانیه می‌ماند و **هیچ ارتفاعی از
        // چیدمان نمی‌گیرد**.
        // ⚠️ در دورِ ۲۹ شهریور، خودِ `_FocusBanner` با حالتِ `dense` برگشت —
        //    ولی این بار داخلِ **ردیفِ ساعت** (بالا) و بدونِ خطِ راهنما، پس
        //    همان قراردادِ «بدونِ ارتفاعِ اضافه» نقض نمی‌شود. مالک خواست
        //    معیارِ راند درشت و همیشه‌در‌چشم باشد، نه فقط ۲.۸ ثانیه.
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
        // ── صحنهٔ وقتِ اضافه (خواستهٔ مالک، ۸ مهر ۱۴۰۵) ──
        // گزارشِ مالک: «راند شش بدون هیچ اکشنی و توضیحی سریع تموم میشه.»
        // وقتِ اضافه خودکار داوری می‌شود؛ بدونِ این کارت، کاربرِ اندروید
        // فقط پرشِ امتیاز می‌دید. این کارت با جملهٔ خودِ سرور
        // (narrX/narrO → overtime) زیرِ صحنهٔ برخورد می‌نشیند و تمامِ
        // مکثِ وقت اضافه (otHoldMs سرور) روی صفحه می‌ماند. آینهٔ وب:
        // فازِ 'overtime' در cardDuelGame.jsx.
        if (session.resultHolding &&
            lastRound != null &&
            lastRound['overtime'] is Map)
          _OvertimePanel(round: lastRound, mine: mine),
        if (session.phase == GamePhase.playing) ...[
          Gaps.vSm,
          AppCard(
            child: Column(
              children: [
                Row(
                  children: [
                    // ── کادرِ «معیارِ این راند» ──
                    // قبلاً یک قرصِ ۱۲پیکسلی با نامِ ویژگی بود («سرعت»).
                    // مالک: «اونجا که نشون می‌ده هر راند سر چی قراره بازی بشه،
                    // اون رو یه کادر و زیباسازی کن که خیلی تو چشم باشه» —
                    // حالا همان کادرِ درشتِ وب است (شمارهٔ راند + نامِ معیارِ
                    // رنگ‌آمیزی‌شده + نشانِ ×۲ در راندِ طوفانی) و چون داخلِ
                    // همین ردیف می‌نشیند، ارتفاعِ صفحه بالا نمی‌رود.
                    if ('${(state['roundFocus'] as Map?)?['stat'] ?? ''}'
                        .isNotEmpty) ...[
                      Expanded(
                        flex: 3,
                        child: _FocusBanner(
                          key: ValueKey(
                            'focus-$roundNumber-${state['roundFocus']?['stat']}',
                          ),
                          focus: state['roundFocus'] is Map
                              ? Map<String, dynamic>.from(
                                  state['roundFocus'] as Map,
                                )
                              : null,
                          fallbackTitle: '',
                          roundNumber: roundNumber,
                          dense: true,
                          storm: roundMod == 'storm',
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: Text(
                        iChose
                            ? 'قفل شد'
                            : state['opponentLocked'] == true
                                ? 'حریف آماده‌ست'
                                : 'کارت را بزن',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
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
                                      !session.resultHolding &&
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
