// "باشگاه" — chat room and games under one roof.
//
// Chat and games are both *social* features and were competing for two
// separate slots in an already-crowded navigation bar. Merging them behind a
// single segmented switcher frees a slot, keeps related things together, and
// lets a player jump from a match straight into the chat without losing
// their place (both tabs stay alive via IndexedStack).
import 'package:flutter/material.dart';

import '../../api_client.dart';
// تورِ آموزشِ صوتی — زیرتب‌ها از بیرون و از راهِ همین گذرگاه عوض می‌شوند.
import '../../tour/tour_anchors.dart';
import '../../tour/tour_service.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import 'chat_page.dart';
import 'games_page.dart';
import 'games/growth_panel.dart';
import 'pass_page.dart';

class SocialPage extends StatefulWidget {
  const SocialPage({
    super.key,
    required this.api,
    this.onOpenShop,
    this.passClaimable = 0,
    this.externalGameId,
    this.externalGameNonce = 0,
  });

  /// درخواستِ بازکردنِ مستقیمِ یک بازی از کاشیِ خانه — به GamesHubPage
  /// پاس می‌شود و تبِ «بازی‌ها» را هم فعال می‌کند (خواستهٔ مالک،
  /// ۳۱ شهریور ۱۴۰۵).
  final String? externalGameId;
  final int externalGameNonce;
  final ApiClient api;

  /// تعداد جایزهٔ آمادهٔ دریافت در گذر نبرد.
  ///
  /// وقتی > ۰ باشد، تبِ «گذر نبرد» یک نشانِ **قرمز** با همین عدد
  /// می‌گیرد و آرام نبض می‌زند. درخواست مالک: «وقتی گذر نبرد برای
  /// کاربر باز می‌شود با آلرت قرمز جلب توجه شود» — قرمز عمدی است و
  /// با سبز/آبیِ خودِ نوار تضاد دارد تا در گوشهٔ چشم هم دیده شود.
  final int passClaimable;

  /// برای تبِ «گذر نبرد»: وقتی کاربر روی «خرید پلاس» می‌زند باید به
  /// فروشگاه برود. اگر داده نشود، دکمه بی‌اثر می‌شود نه اینکه کرش کند.
  final VoidCallback? onOpenShop;

  @override
  State<SocialPage> createState() => _SocialPageState();
}

class _SocialPageState extends State<SocialPage> {
  int _tab = 0;
  int _growthGeneration = 0;
  GameExternalLaunch? _externalLaunch;

  /// زیرتب‌هایی که تا حالا باز شده‌اند.
  ///
  /// ── چرا لازم شد ─────────────────────────────────────────────────────────
  ///
  /// `IndexedStack` همهٔ فرزندانش را **هم‌زمان** می‌سازد. پس بازکردنِ تبِ
  /// «چت و بازی» هر چهار زیرتب را بیدار می‌کرد: چت (سوکت + بارگذاری +
  /// polling)، بازی‌ها (زنجیرهٔ bootstrap→config→level)، ماموریت (سوکت) و
  /// گذر نبرد. کاربر زیرتبِ چت را می‌دید ولی صفِ شبکه را با سه صفحهٔ
  /// نامرئی تقسیم می‌کرد — روی اینترنتِ کند، همان «چرا این تب انقدر دیر
  /// لود می‌شود».
  ///
  /// حالا هر زیرتب **بارِ اولی که انتخاب شود** ساخته می‌شود؛ بعد از آن هم
  /// مثل قبل زنده می‌ماند (سوکت و timer از دست نمی‌روند و برگشت به چت جای
  /// کاربر را از دست نمی‌دهد) — همان دلیلی که از اول `IndexedStack` بود.
  final Set<int> _visited = <int>{0};

  /// ── پلِ زیرتب برای تورِ آموزشِ صوتی ──────────────────────────────
  /// تور در شلِ خانه است و به State این صفحه دسترسی ندارد؛ برای «ماموریت» و
  /// «گذر نبرد» باید خودِ این صفحه زیرتب را عوض کند — آینهٔ رویدادِ
  /// `gg:tour-sub` وب.
  void _onTourSub() {
    final want = TourBus.instance.socialTab.value;
    if (want == null || !mounted) return;
    _goTo(want);
  }

  /// رفتن به یک زیرتب + ثبتِ بازدیدش (تنها راهِ عوض‌کردنِ `_tab`).
  void _goTo(int index) {
    setState(() {
      _tab = index;
      _visited.add(index);
    });
  }

  @override
  void initState() {
    super.initState();
    // اگر پوسته با نیتِ بازکردنِ بازی ساخته‌مان کند، مستقیم روی تبِ
    // «بازی‌ها» باز می‌شویم (کاشیِ ضربه‌زن در خانه).
    if (widget.externalGameId != null && widget.externalGameNonce > 0) {
      _tab = 1;
      _visited.add(1);
    }
    TourBus.instance.socialTab.addListener(_onTourSub);
  }

  @override
  void dispose() {
    TourBus.instance.socialTab.removeListener(_onTourSub);
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant SocialPage old) {
    super.didUpdateWidget(old);
    if (widget.externalGameId != null &&
        widget.externalGameNonce != old.externalGameNonce) {
      _goTo(1);
    }
  }

  /// فرزندِ زیرتبِ [index]: اگر تا حالا باز نشده، جای خالیِ ارزان.
  Widget _lazyTab(int index, Widget Function() build) =>
      _visited.contains(index) ? build() : const SizedBox.shrink();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.xs, Gaps.md, Gaps.xs),
          child: TourAnchor(
            id: 'club:subtabs',
            child: _Switcher(
            index: _tab,
            onChanged: _goTo,
            passClaimable: widget.passClaimable,
            ),
          ),
        ),
        Expanded(
          // IndexedStack (not a swap) so the chat's polling timer and the
          // game's socket survive switching tabs — ولی ساختنِ هر فرزند تا
          // بارِ اولی که باز شود عقب می‌افتد (_lazyTab).
          child: IndexedStack(
            index: _tab,
            children: [
              _lazyTab(0, () => ChatPage(api: widget.api)),
              _lazyTab(1, () => GamesHubPage(
                api: widget.api,
                externalLaunch: _externalLaunch,
                externalGameId: widget.externalGameId,
                externalGameNonce: widget.externalGameNonce,
              )),
              _lazyTab(2, () => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.xs, Gaps.md, Gaps.xxl),
                child: GrowthPanel(
                  key: ValueKey(_growthGeneration),
                  api: widget.api,
                  onJoinGame: (socket, start) {
                    setState(() {
                      _growthGeneration += 1;
                      _externalLaunch = GameExternalLaunch(
                        socket: socket,
                        start: start,
                        nonce: DateTime.now().microsecondsSinceEpoch,
                      );
                      _tab = 1;
                      _visited.add(1);
                    });
                  },
                ),
              )),
              _lazyTab(3, () => PassPage(
                api: widget.api,
                onOpenShop: widget.onOpenShop ?? () {},
              )),
            ],
          ),
        ),
      ],
    );
  }
}

/// Pill-shaped segmented control with a sliding highlight.
class _Switcher extends StatelessWidget {
  const _Switcher({
    required this.index,
    required this.onChanged,
    this.passClaimable = 0,
  });

  final int index;
  final ValueChanged<int> onChanged;

  /// جایزه‌های آمادهٔ گذر نبرد — منبعِ نشانِ قرمزِ تبِ آخر.
  final int passClaimable;

  /// شمارهٔ تبِ گذر نبرد. عدد ثابت ننوشتیم تا اگر ترتیب تب‌ها عوض شد،
  /// نشان روی تبِ اشتباه ننشیند.
  static const _passTab = 3;

  static const _items = [
    (icon: Icons.chat_bubble_rounded, label: 'چت'),
    (icon: Icons.sports_esports_rounded, label: 'بازی‌ها'),
    (icon: Icons.rocket_launch_rounded, label: 'ماموریت'),
    // گذر نبرد این‌جا هم می‌آید. تنها راه ورودش یک آیکون کوچک در نوار
    // بالا بود و عملاً دیده نمی‌شد — در حالی که مهم‌ترین دلیلِ خریدِ
    // «پلاس» است و باید کنار بازی‌ها (جایی که XP جمع می‌شود) باشد.
    (icon: Icons.emoji_events_rounded, label: 'گذر نبرد'),
  ];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            scheme.surfaceContainerHighest.withValues(alpha: 0.78),
            Color.lerp(scheme.surfaceContainer, BrandColors.blue, 0.08)!,
          ],
        ),
        borderRadius: Corners.rPill,
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: BrandColors.emerald.withValues(alpha: 0.08),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth / _items.length;
          return Stack(
            children: [
              AnimatedAlign(
                duration: Motion.normal,
                curve: Curves.easeOutCubic,
                // ⚠️ این‌جا قبلاً یک `switch` سه‌حالته بود که فقط برای سه
                //    تب درست کار می‌کرد: ۰ راست، ۱ وسط، و «هر چیز دیگر»
                //    چپ. با اضافه شدنِ تبِ چهارم (گذر نبرد)، تبِ ۲
                //    (ماموریت) و تبِ ۳ هر دو به `centerLeft` می‌افتادند —
                //    یعنی با انتخابِ «ماموریت»، قرصِ سبز روی «گذر نبرد»
                //    می‌نشست و تبِ اشتباه انتخاب‌شده به نظر می‌رسید.
                //    تبِ ۱ هم کمی جابه‌جا بود (۰ به‌جای ۰٫۳۳).
                //
                // فرمولِ عمومی برای n تب و قرصی به عرضِ W/n:
                //   x = 2·(n − i − 1)/(n − 1) − 1
                // که برای n=۴ می‌دهد: ۱ ، ۰٫۳۳ ، −۰٫۳۳ ، −۱.
                // چون بر حسب n نوشته شده، تبِ پنجم هم اگر اضافه شود
                // بی‌سروصدا خراب نمی‌کند.
                alignment: Alignment(
                  _items.length == 1
                      ? 0
                      : 2 * (_items.length - index - 1) /
                                (_items.length - 1) -
                            1,
                  0,
                ),
                child: Container(
                  width: w,
                  height: double.infinity,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [BrandColors.emerald, BrandColors.blue],
                    ),
                    borderRadius: Corners.rPill,
                    boxShadow: [
                      BoxShadow(
                        color: scheme.primary.withValues(alpha: 0.35),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                ),
              ),
              Row(
                children: [
                  for (var i = 0; i < _items.length; i++)
                    Expanded(
                      child: InkWell(
                        borderRadius: Corners.rPill,
                        onTap: () => onChanged(i),
                        child: Center(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _TabIcon(
                                icon: _items[i].icon,
                                selected: index == i,
                                // نشانِ قرمز فقط روی تبِ گذر نبرد و فقط
                                // وقتی واقعاً جایزه‌ای منتظر است.
                                badge: i == _passTab ? passClaimable : 0,
                              ),
                              Gaps.hXxs,
                              // با چهار تب، عرض هر خانه کم می‌شود.
                              // Flexible + ellipsis تضمین می‌کند لیبل
                              // روی گوشی باریک سرریز نکند (overflow زرد).
                              Flexible(
                                child: Text(
                                  _items[i].label,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: index == i
                                        ? scheme.onPrimary
                                        : scheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// آیکونِ یک تب، با نشانِ قرمزِ اختیاری.
///
/// چرا یک ویجتِ جدا و چرا Stateful: نشان باید **نبض بزند**. یک نقطهٔ
/// قرمزِ ساکن در نواری که خودش رنگارنگ است گم می‌شود؛ حرکتِ آرام همان
/// چیزی است که گوشهٔ چشم می‌گیرد. کنترلرِ انیمیشن فقط وقتی ساخته و
/// اجرا می‌شود که نشان واقعاً دیده شود، پس روی تب‌های بی‌نشان هیچ
/// هزینه‌ای ندارد.
class _TabIcon extends StatefulWidget {
  const _TabIcon({
    required this.icon,
    required this.selected,
    this.badge = 0,
  });

  final IconData icon;
  final bool selected;
  final int badge;

  @override
  State<_TabIcon> createState() => _TabIconState();
}

class _TabIconState extends State<_TabIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    _syncPulse();
  }

  @override
  void didUpdateWidget(covariant _TabIcon old) {
    super.didUpdateWidget(old);
    if ((widget.badge > 0) != (old.badge > 0)) _syncPulse();
  }

  void _syncPulse() {
    if (widget.badge > 0) {
      // ⚠️ `repeat` روی کنترلری که همین حالا هم در حال تکرار است، انیمیشن
      //    را از اول شروع می‌کند و یک پرشِ دیداری می‌سازد.
      if (!_pulse.isAnimating) _pulse.repeat(reverse: true);
    } else {
      _pulse.stop();
      _pulse.value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final icon = Icon(
      widget.icon,
      size: 17,
      color: widget.selected ? scheme.onPrimary : scheme.onSurfaceVariant,
    );
    if (widget.badge <= 0) return icon;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        icon,
        // بیرونِ کادرِ آیکون می‌نشیند (clipBehavior: none) تا آیکون را
        // نپوشاند. سقفِ نمایش ۹ است؛ بیشتر از آن در این اندازه خوانا نیست.
        Positioned(
          top: -6,
          left: -7,
          child: FadeTransition(
            opacity: Tween(begin: 0.62, end: 1.0).animate(_pulse),
            child: ScaleTransition(
              scale: Tween(begin: 0.9, end: 1.12).animate(
                CurvedAnimation(parent: _pulse, curve: Curves.easeOutCubic),
              ),
              child: Container(
                constraints: const BoxConstraints(minWidth: 15),
                height: 15,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 3.5),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444),
                  borderRadius: BorderRadius.circular(99),
                  // حلقهٔ تیره: روی هر دو حالتِ «انتخاب‌شده» (پس‌زمینهٔ
                  // سبز/آبی) و «انتخاب‌نشده» لبهٔ قرمز را جدا نگه می‌دارد.
                  border: Border.all(color: const Color(0xFF0B1220), width: 1.4),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.65),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: Text(
                  faNum(widget.badge > 9 ? 9 : widget.badge),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w900,
                    height: 1.05,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
