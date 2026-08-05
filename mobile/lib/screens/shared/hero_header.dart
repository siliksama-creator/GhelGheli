import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../core/money.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar_image.dart';
import '../../core/cosmetics.dart';

/// Compact dashboard hero: greeting, avatar, points and reward progress.
///
/// Rewritten to be much denser than the original (which used xl padding, a
/// 34pt number and a 68px thumbnail, eating most of the first screen). The
/// avatar/greeting is now a tap target that opens the profile, and an
/// inline "complete your profile" nudge appears while required fields are
/// still missing — so the user can finish their details without hunting
/// through the navigation.
class HeroHeader extends StatelessWidget {
  final int points;
  final String nickname;
  final Map<String, dynamic>? nextReward;

  /// Full user object, used for the avatar and completeness check.
  final Map<String, dynamic>? user;

  /// ظاهرِ خودِ کاربر — ستارهٔ پلاس، نشان باشگاه، رنگ اسم.
  ///
  /// درخواست مالک: «افرادی که اشتراک پلاس گرفتن در همه جای پلتفرم برای
  /// **خودشون** و افراد دیگه ستارشون مشخص باشه».
  ///
  /// «برای خودشون» بخش فراموش‌شده بود: چت و جدول لیگ ستارهٔ بقیه را نشان
  /// می‌دادند، ولی داشبورد نام را خام چاپ می‌کرد — یعنی کسی که پول داده
  /// بود، در اولین صفحه‌ای که بعد از ورود می‌بیند هیچ نشانی از خریدش
  /// نداشت.
  final Map<String, dynamic>? cosmetics;

  /// Opens the profile tab.
  final VoidCallback? onOpenProfile;

  /// باز کردن کیف پول. کیف پول از نوار پایین به «بیشتر» منتقل شد، پس این
  /// ورودی در هدر تنها راه سریع رسیدن به آن است و باید واضح دیده شود.
  final VoidCallback? onOpenWallet;

  // `onToggleTheme` و `isDark` حذف شدند — اپ تک‌تم (تیره) است.
  // توضیحِ کاملِ چراییِ حذفِ تمِ روشن در main.dart.

  const HeroHeader({
    super.key,
    required this.points,
    required this.nickname,
    this.nextReward,
    this.user,
    this.cosmetics,
    this.onOpenProfile,
    this.onOpenWallet,
  });

  /// Profile fields we consider essential for payouts/prizes.
  static const _required = <String, String>{
    'first_name': 'نام',
    'last_name': 'نام خانوادگی',
    'age': 'سن',
    'province': 'استان',
    'city': 'شهر',
    'bank_account': 'شماره کارت',
  };

  List<String> get _missing {
    final u = user;
    if (u == null) return const [];
    return _required.entries
        .where((e) => '${u[e.key] ?? ''}'.trim().isEmpty)
        .map((e) => e.value)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final required = NumberParser.toInt(nextReward?['required_points']);
    final remaining = required > points ? required - points : 0;
    final progress = required > 0 ? (points / required).clamp(0.0, 1.0) : 0.0;
    final brand = context.brand;
    final missing = _missing;
    final done = _required.length - missing.length;

    return Container(
      padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.sm),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: LinearGradient(
            colors: brand.heroGradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        boxShadow: [
          BoxShadow(
              color: brand.heroGradient.last.withValues(alpha: 0.28),
              blurRadius: 22,
              offset: const Offset(0, 10))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── greeting + points + theme switch, all on one line ──
          Row(
            children: [
              InkWell(
                onTap: onOpenProfile,
                borderRadius: Corners.rPill,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AvatarImage(
                      imageUrl: user?['profile_image_url'],
                      keyName: user?['profile_avatar_key'],
                      radius: 19,
                    ),
                    Gaps.hXs,
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 130),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // DisplayName به‌جای Text خام: ستارهٔ پلاس و
                          // رنگ اسم را هم می‌آورد.
                          DisplayName(
                            name: 'سلام $nickname 👋',
                            cosmetics: cosmetics,
                            avatarKey: user?['profile_avatar_key'],
                            maxLines: 1,
                            style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.white),
                          ),
                          const Row(
                            children: [
                              Text('پروفایل من',
                                  style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600)),
                              SizedBox(width: 2),
                              Icon(Icons.chevron_left_rounded,
                                  size: 13, color: Colors.white70),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(faNum(points),
                      style: const TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          height: 1.1)),
                  const Text('امتیاز',
                      style: TextStyle(
                          color: Colors.white70,
                          fontWeight: FontWeight.w600,
                          fontSize: 10.5)),
                ],
              ),
            ],
          ),

          // ── reward progress ──
          Gaps.vXs,
          ClipRRect(
            borderRadius: Corners.rPill,
            child: TweenAnimationBuilder<double>(
              duration: Motion.hero,
              curve: Motion.emphasized,
              tween: Tween(begin: 0, end: progress),
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 6,
                color: Colors.white,
                backgroundColor: Colors.white.withValues(alpha: 0.22),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            nextReward == null
                ? 'هنوز جایزه‌ای تعریف نشده است'
                : remaining == 0
                    ? 'به جایزه ${nextReward!['name']} رسیدی 🎉'
                    : 'تا ${nextReward!['name']}: ${faNum(remaining)} امتیاز',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 11.5),
          ),

          // ── ورودی کیف پول ──
          if (onOpenWallet != null) ...[
            const SizedBox(height: 9),
            _WalletStrip(
              balance: NumberParser.toInt(user?['wallet_balance']),
              onTap: onOpenWallet!,
            ),
          ],

          // ── profile completion nudge (only while something is missing) ──
          if (missing.isNotEmpty) ...[
            const SizedBox(height: 7),
            _CompletionBar(
              done: done,
              total: _required.length,
              missing: missing,
              onTap: onOpenProfile,
            ),
          ],
        ],
      ),
    );
  }
}

class _CompletionBar extends StatelessWidget {
  const _CompletionBar({
    required this.done,
    required this.total,
    required this.missing,
    this.onTap,
  });

  final int done;
  final int total;
  final List<String> missing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Show at most two field names inline; the rest become "+N مورد".
    final shown = missing.take(2).join('، ');
    final extra = missing.length - 2;
    return Material(
      color: Colors.black.withValues(alpha: 0.22),
      borderRadius: Corners.rMd,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rMd,
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: Gaps.xs, vertical: 6),
          child: Row(
            children: [
              const Icon(Icons.badge_outlined,
                  size: 15, color: Color(0xFFFFD36B)),
              Gaps.hXxs,
              Expanded(
                child: Text(
                  'تکمیل پروفایل ($done از $total): $shown'
                  '${extra > 0 ? ' +$extra مورد' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700),
                ),
              ),
              const Text('تکمیل',
                  style: TextStyle(
                      color: Color(0xFFFFD36B),
                      fontSize: 11,
                      fontWeight: FontWeight.w800)),
              const Icon(Icons.chevron_left_rounded,
                  size: 15, color: Color(0xFFFFD36B)),
            ],
          ),
        ),
      ),
    );
  }
}

/// نوار ورود به کیف پول در هدر داشبورد.
///
/// طراحی عمداً «طلایی» است تا از سبز/آبی خود هدر جدا شود و چشم فوراً پیدایش
/// کند — کیف پول تنها جای اپ است که پول واقعی در آن است و نباید مثل بقیهٔ
/// بخش‌ها دیده شود. موجودی همین‌جا نمایش داده می‌شود، پس کاربر برای دانستن
/// «چقدر پول دارم» لازم نیست هیچ‌جا برود.
class _WalletStrip extends StatelessWidget {
  const _WalletStrip({required this.balance, required this.onTap});

  final int balance;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xFFFFD36B);
    final hasMoney = balance > 0;

    return Material(
      color: Colors.transparent,
      borderRadius: Corners.rLg,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rLg,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: Corners.rLg,
            // لایهٔ تیرهٔ نیمه‌شفاف روی گرادیان هدر + حاشیهٔ طلایی
            color: Colors.black.withValues(alpha: 0.24),
            border: Border.all(
              color: gold.withValues(alpha: hasMoney ? 0.55 : 0.28),
              width: 1.1,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.sm, vertical: Gaps.xs),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: hasMoney
                          ? const [Color(0xFFFFE9A8), Color(0xFFD4A227)]
                          : [
                              Colors.white.withValues(alpha: 0.22),
                              Colors.white.withValues(alpha: 0.10),
                            ],
                    ),
                  ),
                  child: Icon(
                    Icons.account_balance_wallet_rounded,
                    size: 18,
                    color: hasMoney
                        ? const Color(0xFF6B4E00)
                        : Colors.white.withValues(alpha: 0.85),
                  ),
                ),
                Gaps.hSm,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'کیف پول من',
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 1),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: AlignmentDirectional.centerStart,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Text(
                              Money.format(balance),
                              style: TextStyle(
                                color: hasMoney ? gold : Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                                height: 1.1,
                              ),
                            ),
                            const SizedBox(width: 3),
                            Text(
                              'تومان',
                              style: TextStyle(
                                color: (hasMoney ? gold : Colors.white)
                                    .withValues(alpha: 0.75),
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Gaps.hXs,
                // وقتی پول دارد، دعوت به برداشت؛ وقتی ندارد، راهنمای ورود.
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: Gaps.xs, vertical: 4),
                  decoration: BoxDecoration(
                    color: hasMoney
                        ? gold.withValues(alpha: 0.20)
                        : Colors.white.withValues(alpha: 0.12),
                    borderRadius: Corners.rPill,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        hasMoney ? 'برداشت' : 'مشاهده',
                        style: TextStyle(
                          color: hasMoney ? gold : Colors.white,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Icon(Icons.chevron_left_rounded,
                          size: 15, color: hasMoney ? gold : Colors.white),
                    ],
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
