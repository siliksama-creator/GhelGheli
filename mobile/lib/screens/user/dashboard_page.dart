import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import '../shared/hero_header.dart';
import 'inventory_page.dart';
import 'login_streak_card.dart';
import '../../widgets/photo_card_box.dart';

/// Home / dashboard tab: points header, card-code redemption and card
/// inventory carousel. Same three API calls as the legacy `DashboardPage`.
class DashboardPage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() reloadProfile;

  /// Jumps to the profile tab (used by the hero header + completion nudge).
  final VoidCallback? onOpenProfile;

  /// پرش مستقیم به کیف پول از هدر داشبورد.
  final VoidCallback? onOpenWallet;

  /// میان‌برهای گردونه و دعوت دوستان روی داشبورد.
  final VoidCallback? onOpenWheel;
  final VoidCallback? onOpenReferral;

  /// رفتن به تبِ «کلکسیون». داشبورد فقط پیش‌نمایش نشان می‌دهد.
  final VoidCallback? onOpenInventory;

  // `onToggleTheme` و `isDark` حذف شدند — اپ تک‌تم است (توضیح در main.dart).

  const DashboardPage({
    super.key,
    required this.api,
    required this.reloadProfile,
    this.onOpenProfile,
    this.onOpenWallet,
    this.onOpenWheel,
    this.onOpenReferral,
    this.onOpenInventory,
  });

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _rewards = [];
  // `_code`/`_message`/`_messageIsError`/`_sending` همگی حذف شدند:
  // فرمِ «فقط کد» برداشته شد و ثبتِ کارت کاملاً به PhotoCardBox منتقل
  // شد (عکس + کد با هم). آن ویجت بازخوردِ خودش را نشان می‌دهد، پس
  // بنرِ پیامِ این صفحه هم بی‌مصرف شده بود.
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }


  Future<void> _load() async {
    // try/catch لازم است، نه یک احتیاط اضافه.
    //
    // این متد قبلاً هیچ محافظتی نداشت. هر شکستی — توکن منقضی، شبکهٔ لرزان،
    // یک ۵۰۰ گذرا، حتی تایم‌اوت — استثنا پرتاب می‌کرد و خط `_loading =
    // false` **هرگز** اجرا نمی‌شد. داشبورد صفحهٔ اول بعد از ورود است، پس
    // کاربر تا ابد روی چرخنده می‌ماند بدون پیام و بدون دکمهٔ تلاش دوباره.
    // این همان «صفحات اپ بعد ورود لود نمیشن» است.
    //
    // یک درخواست به‌جای دو تا.
    //
    // موازی کردنشان قبلاً کمک کرد، ولی کف همچنان یک رفت‌وبرگشت کامل بود —
    // و تا ایران آن کف حدود نیم ثانیه است. /api/bootstrap همان داده را در
    // یک پاسخ می‌دهد.
    try {
      final boot = await widget.api.get('/api/bootstrap');
      if (!mounted) return;
      final m = boot is Map
          ? Map<String, dynamic>.from(boot)
          : <String, dynamic>{};
      // اگر پاسخ شکل درستی ندارد، آن را «موفق» حساب نکن.
      //
      // بدون این، یک پاسخ ناقص (پراکسی که body را بُرید، استقرار
      // نیمه‌کاره، پاسخ کش‌شدهٔ غلط) `_data` را غیرnull می‌کرد و شرط
      // «خطا و دادهٔ خالی» رد می‌شد — نتیجه یک صفحهٔ نیمه‌خالی بدون هیچ
      // راه خروجی. بهتر است صریحاً خطا بدهیم و دکمهٔ تلاش دوباره نشان
      // دهیم.
      if (m['user'] is! Map) {
        setState(() {
          _error = 'پاسخ سرور ناقص بود';
          _loading = false;
        });
        return;
      }
      setState(() {
        _data = <String, dynamic>{
          'user': m['user'],
          'inventory': m['inventory'] ?? const [],
          'leaguePayouts': m['leaguePayouts'] ?? const [],
          // وضعیت استریک هم از bootstrap می‌آید تا کارتِ روزانه با یک
          // درخواست اضافه و دیرتر از بقیهٔ داشبورد روی صفحه نپرد.
          if (m['loginStreak'] != null) 'loginStreak': m['loginStreak'],
          // ظاهرِ خودِ کاربر (ستارهٔ پلاس، رنگ اسم) — تا هدر داشبورد هم
          // نشانِ اشتراکش را نشان دهد، نه فقط چت و لیگ.
          if (m['cosmetics'] != null) 'cosmetics': m['cosmetics'],
        };
        _rewards = List<Map<String, dynamic>>.from(
            ((m['rewards'] as List?) ?? const [])
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e)));
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = apiError(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    // خطا و هیچ دادهٔ قبلی: راه خروج بده، نه صفحهٔ خالی یا چرخندهٔ ابدی.
    if (_error != null && _data == null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(Gaps.lg),
          children: [
            const SizedBox(height: 40),
            ErrorBanner(message: _error!, onRetry: _load),
          ],
        ),
      );
    }

    final user = _data?['user'];
    final inventory =
        List<Map<String, dynamic>>.from(_data?['inventory'] ?? []);
    final points = NumberParser.toInt(user?['current_points']);
    final sorted = [..._rewards]..sort((a, b) =>
        NumberParser.toInt(a['required_points'])
            .compareTo(NumberParser.toInt(b['required_points'])));
    Map<String, dynamic>? nextReward;
    for (final r in sorted) {
      if (points < NumberParser.toInt(r['required_points'])) {
        nextReward = r;
        break;
      }
    }
    nextReward ??= sorted.isNotEmpty ? sorted.last : null;

    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          HeroHeader(
            points: points,
            nickname: user?['nickname'] ?? 'قهرمان',
            nextReward: nextReward,
            user: user is Map ? Map<String, dynamic>.from(user) : null,
            cosmetics: _data?['cosmetics'] as Map<String, dynamic>?,
            onOpenProfile: widget.onOpenProfile,
            onOpenWallet: widget.onOpenWallet,
          ),
          Gaps.vMd,
          // دو میان‌بر: گردونهٔ روزانه و دعوت دوستان. روی داشبورد هستند چون
          // هر دو کاری‌اند که کاربر باید هر روز انجام دهد؛ اگر فقط از نوار
          // بالا باز می‌شدند، بیشترِ کاربرها هیچ‌وقت پیدایشان نمی‌کردند.
          Row(
            children: [
              Expanded(
                child: _QuickTile(
                  icon: Image.asset('assets/pass/wheel_icon.webp', width: 30, height: 30),
                  title: 'گردونهٔ شانس',
                  subtitle: 'هر روز یک چرخش رایگان',
                  tint: const Color(0xFFF59E0B),
                  onTap: widget.onOpenWheel,
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: _QuickTile(
                  icon: const Icon(Icons.group_add_rounded, size: 30),
                  title: 'دعوت دوستان',
                  subtitle: '۵٪ امتیازشان + ۳ چرخش',
                  tint: const Color(0xFF84CC16),
                  onTap: widget.onOpenReferral,
                ),
              ),
            ],
          ),
          Gaps.vMd,
          LoginStreakCard(
            api: widget.api,
            initialData: _data?['loginStreak'] is Map
                ? Map<String, dynamic>.from(_data!['loginStreak'] as Map)
                : null,
            onClaimed: () {
              _load();
              widget.reloadProfile();
            },
          ),
          Gaps.vMd,
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: Corners.rLg,
                  // cacheWidth, not cacheHeight. With BoxFit.cover in a box
                  // WIDER than the source, the scale is set by WIDTH and the
                  // height is cropped — so the old `cacheHeight: 390`
                  // constrained the axis that does not bind. It produced a
                  // 700px-wide bitmap for a box needing ~1050px on a 412dp
                  // screen at 3x: softer than necessary AND still carrying
                  // the cropped-away rows.
                  //
                  // The asset itself is now pre-cropped to the displayed
                  // aspect (see tools/crop_banners.py), so decoding at its
                  // native 820 width costs less than the old hint did while
                  // being sharp instead of upscaled.
                  child: Image.asset('assets/brand/card_pack_banner.webp',
                      height: 130, fit: BoxFit.cover, cacheWidth: 820),
                ),
                Gaps.vMd,
                Text('ثبت کارت‌های قلقلی',
                    style: theme.textTheme.titleLarge),
                Gaps.vXxs,
                Text(
                  'پک کارت‌های قلقلی به‌صورت فیزیکی در فروشگاه‌ها و '
                  'سوپرمارکت‌ها به فروش می‌رسند.',
                  style: theme.textTheme.bodySmall,
                ),

                // ═══════════════════════════════════════════════════════
                // چرا فرمِ «فقط کد» حذف شد
                // ═══════════════════════════════════════════════════════
                //
                // خواستهٔ صریح مالک: «در هر صورت کاربر باید عکس و کد رو
                // باهم بفرسته».
                //
                // دو مسیرِ موازی دو مشکل داشت:
                //
                //   ۱. کاربر نمی‌دانست کدامش را بزند. دو کادرِ «کد» پشت
                //      سر هم روی یک صفحه، با دو دکمهٔ متفاوت.
                //
                //   ۲. مهم‌تر: مسیرِ «فقط کد» عکس نمی‌خواست، پس هیچ
                //      مدرکی نبود که کاربر کارتِ فیزیکی را دارد. کسی که
                //      فقط رشتهٔ کد را از دوستش گرفته بود امتیاز
                //      می‌گرفت — و آن مسیر بانکِ کدِ جدا داشت که هرگز
                //      با تشخیصِ تصویر بررسی نمی‌شد.
                //
                // حالا یک مسیر: همیشه عکس + کد. مسیرِ `/api/cards/redeem`
                // در سرور دست‌نخورده باقی مانده (کدهای قدیمیِ در گردش)
                // ولی دیگر از اپ صدا زده نمی‌شود.
                PhotoCardBox(
                  api: widget.api,
                  // همان دو کاری که مسیر «ثبت کد» بعد از موفقیت می‌کند:
                  // اینونتوریِ این صفحه و امتیازِ نوارِ بالا. اگر فقط
                  // یکی صدا زده شود، کارت اضافه می‌شود ولی امتیاز قدیمی
                  // می‌ماند و کاربر فکر می‌کند چیزی نگرفته.
                  onRegistered: () {
                    _load();
                    widget.reloadProfile();
                  },
                ),
              ],
            ),
          ),
          Gaps.vXl,
          // ── چرا داشبورد فقط پیش‌نمایش می‌دهد ──
          //
          // قبلاً کلِ اینونتوری اینجا در یک نوارِ افقی بود. با ۵۰ کارت
          // یعنی ۵۰ تصویرِ شبکه‌ای که همگی روی صفحهٔ **اصلی** بارگذاری
          // می‌شدند — هم کند، هم پرمصرف، و هم عملاً غیرقابل‌مرور.
          //
          // حالا شش کارتِ تازه به‌عنوان طعمه و یک دکمه به صفحهٔ کامل.
          SectionHeader(
            title: 'کلکسیون من',
            trailing: inventory.length > 6 && widget.onOpenInventory != null
                ? TextButton(
                    onPressed: widget.onOpenInventory,
                    child: Text('همه (${faNum(inventory.length)})'),
                  )
                : null,
          ),
          if (inventory.isEmpty)
            const AppCard(
              child: EmptyState(
                  icon: Icons.style_outlined,
                  title: 'هنوز کارتی در کلکسیون شما نیست',
                  message: 'یک کد کارت را ثبت کن یا از کارتت عکس بگیر '
                      'تا اینجا نمایش داده شود.',
                  image: 'assets/games/empty_collection.webp'),
            )
          else
            Builder(builder: (_) {
              // همان مرتب‌سازیِ صفحهٔ کلکسیون تا ترتیب بینشان نپرد.
              final recent =
                  filterAndSort(inventory, sort: InvSort.recent).take(6).toList();
              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: EdgeInsets.zero,
                gridDelegate:
                    const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 200,
                  mainAxisSpacing: Gaps.sm,
                  crossAxisSpacing: Gaps.sm,
                  childAspectRatio: 0.66,
                ),
                itemCount: recent.length,
                itemBuilder: (_, i) => InventoryTile(item: recent[i]),
              );
            }),
        ],
      ),
    );
  }
}


/// کاشی میان‌بر روی داشبورد.
class _QuickTile extends StatelessWidget {
  const _QuickTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.tint,
    this.onTap,
  });

  final Widget icon;
  final String title;
  final String subtitle;
  final Color tint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      borderRadius: Corners.rLg,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rLg,
        child: Container(
          // ۴۸ کف اندازهٔ هدف لمسی طبق راهنمای دسترس‌پذیری متریال.
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(
              horizontal: Gaps.sm, vertical: Gaps.md),
          decoration: BoxDecoration(
            borderRadius: Corners.rLg,
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                tint.withValues(alpha: 0.22),
                Theme.of(context).colorScheme.surfaceContainerHigh
                    .withValues(alpha: 0.72),
              ],
            ),
            border: Border.all(color: tint.withValues(alpha: 0.28)),
            boxShadow: [
              BoxShadow(
                color: tint.withValues(alpha: 0.10),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              icon,
              Gaps.vXxs,
              Text(title,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              Text(subtitle,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
