part of '../card_duel_page.dart';

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
  // ⚠️ `super.key` لازم است: `_LiveBattle` کادر را با کلیدِ مخصوصِ هر راند
  // می‌سازد تا انیمیشنِ ورود در هر راند تازه اجرا شود. سازندهٔ قبلی این
  // پارامتر را نداشت (ویجت هیچ‌جا استفاده نمی‌شد و کسی متوجه نشده بود) و
  // پاس‌دادنِ `key:` خطای کامپایل می‌داد — همان چیزی که Flutter Check را
  // در رانِ نخستِ این دور قرمز کرد.
  const _FocusBanner({
    super.key,
    required this.focus,
    required this.fallbackTitle,
    required this.roundNumber,
    this.dense = false,
    this.storm = false,
  });

  final Map<String, dynamic>? focus;
  final String fallbackTitle;
  final int roundNumber;

  /// حالتِ فشرده: همان کادرِ درشت، ولی داخلِ ردیفِ ساعتِ نبرد زنده جا می‌شود
  /// (خطِ راهنمای «عدد نهایی = …» پنهان می‌شود تا ارتفاع اضافه نشود).
  /// خواستهٔ مالک ۲۹ شهریور: «اونجا که نشون می‌ده هر راند سر چی قراره بازی بشه،
  /// اون رو یه کادر و زیباسازی کن که خیلی تو چشم باشه» — نشانِ قبلی یک قرصِ
  /// ۱۲پیکسلی بود که فقط نامِ ویژگی را می‌گفت (بدونِ راند، بدونِ همانندی با وب).
  final bool dense;

  /// راندِ دو‌امتیازیِ «دوئل طوفان» ⇒ نشانِ نارنجیِ ×۲ کنارِ متن.
  final bool storm;

  @override
  State<_FocusBanner> createState() => _FocusBannerState();
}

class _FocusBannerState extends State<_FocusBanner>
    // ⚠️ `TickerProviderStateMixin` و نه `SingleTickerProviderStateMixin`:
    // این ویجت **دو** کنترلر دارد (`_c` برای ورود، `_pulse` برای درخششِ
    // بی‌پایان). با نسخهٔ Single، لحظه‌ای که ویجت واقعاً ساخته شود assertِ
    // فریم‌ورک می‌پرد («can only be used as a TickerProvider once»).
    // دلیلِ اینکه کسی این را ندیده بود: `_FocusBanner` تا قبل از دورِ
    // ۲۹ شهریور هیچ‌جا استفاده نمی‌شد و فقط نگاشت‌های static‌اش مصرف داشت.
    with TickerProviderStateMixin {
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
    final tint = widget.storm
        ? const Color(0xFFFF7A1A)
        : _statColors[stat] ?? const Color(0xFF38BDF8);
    final icon = _statIcons[stat] ?? Icons.stars_rounded;
    final statName = _statNames[stat] ?? '';
    // ⚠️ متنِ درشت = برچسبِ خودِ راند از بک‌اند («ضدحمله سرعتی»)، نه نامِ
    // خشکِ ویژگی («سرعت»). دلیلش آینه‌گی است: کادرِ وب همین برچسب را نشان
    // می‌دهد و مالک هم با همین مثال («مثلاً ضدحمله سرعتی») خواسته را گفت.
    // نامِ ویژگی از بین نمی‌رود: در برچسبِ دسترس‌پذیری و (در حالتِ معمولی)
    // در خطِ راهنما می‌آید.
    final bigLabel = label.trim().isNotEmpty
        ? label
        : (statName.isEmpty ? '—' : '$statName!');
    // اندازه‌های حالتِ فشرده — هیچ فونتی زیرِ ۱۱.۵ نیست (نگهبانِ خوانایی:
    // mobile/test/duel_focus_and_speed_test.dart).
    final iconSize = widget.dense ? 34.0 : 44.0;
    // ⚠️ `const`: وگرنه لینتِ `prefer_const_declarations` رویش گیر می‌دهد.
    const roundFont = 11.5;
    final labelFont = widget.dense ? 16.5 : 21.0;

    return Semantics(
      label: [
        'راند ${faNum(widget.roundNumber)} — نبرد بر سر',
        if (statName.isNotEmpty) statName,
        if (widget.storm) 'راند دو‌امتیازی',
        if (text.isNotEmpty) text,
      ].join('. '),
      child: AnimatedBuilder(
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
                  padding: EdgeInsets.symmetric(
                    horizontal: widget.dense ? 9 : 14,
                    vertical: widget.dense ? 6 : 11,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(widget.dense ? 16 : 18),
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
                        width: iconSize,
                        height: iconSize,
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
                          child: Icon(
                            icon,
                            color: tint,
                            size: widget.dense ? 19 : 24,
                          ),
                        ),
                      ),
                      SizedBox(width: widget.dense ? 8 : 12),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    'راند ${faNum(widget.roundNumber)} — نبرد بر سر',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: roundFont,
                                      fontWeight: FontWeight.w700,
                                      color:
                                          Colors.white.withValues(alpha: 0.72),
                                    ),
                                  ),
                                ),
                                if (widget.storm) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 7,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(999),
                                      gradient: const LinearGradient(
                                        colors: [
                                          Color(0xFFFF7A1A),
                                          Color(0xFFFF4D2E),
                                        ],
                                      ),
                                    ),
                                    child: const Text(
                                      '×۲ دو‌امتیازی',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w900,
                                        color: Color(0xFFFFF6E8),
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 1),
                            Text(
                              bigLabel,
                              style: TextStyle(
                                fontSize: labelFont,
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
                            if (text.isNotEmpty && !widget.dense)
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
      ),
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
