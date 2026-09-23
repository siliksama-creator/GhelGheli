// تبِ «ثبت کارت» — جایگزینِ تبِ «جوایز» (خواستهٔ مالک، ۳۱ شهریور ۱۴۰۵).
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه ساخته شد
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «قسمت جوایز کلاً در پنل ادمین و در وب و موبایل حذف بشه و
// بجاش ثبت کارت قرار بگیره.» یعنی:
//
//   • تبِ «جوایز» (RewardsPage) از نوار پایین رفت — صفحهٔ rewards_page.dart
//     هم حذف شد. endpointهای بک‌اند دست‌نخورده و خفته‌اند (تاریخچهٔ claimها
//     در دیتابیس دست‌نخورده می‌ماند).
//   • هر چه در داشبورد از «بخش ثبت کارت‌های قلقلی» به بعد بود (خودِ فرمِ
//     ثبت با عکس + پیش‌نمایشِ کلکسیون) از خانه بیرون آمد و اینجا نشست؛
//     دقیقاً همان کاری که در وب با تبِ cardreg کردیم — یک بخشِ ثبتِ تمام‌عرض
//     بالای صفحه و زیرش کلکسیونِ کامل (همان InventoryPage قبلی با جست‌وجو،
//     ترتیب، آمار و صندوق‌های برنده).
//
// ایندکسِ صفحه عمداً همان ۱ است (home_shell.cardRegIndex) تا هیچ شمارهٔ
// دیگری جابه‌جا نشود — همان درسِ RangeError که navigation_test گرفت.
//
// داده از پوسته می‌آید (bootstrap → _inventory/_pendingGrants) و بعد از هر
// ثبتِ موفق، `onRefresh` (= `_loadProfile` پوسته) کلکسیون را تازه می‌کند؛
// چون slot/key در page-cache ثابت می‌ماند، search/sort/scroll کاربر در
// InventoryPage حفظ می‌شود و فقط items نو می‌شود.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/photo_card_box.dart';
import 'inventory_page.dart';

class CardRegPage extends StatelessWidget {
  const CardRegPage({
    super.key,
    required this.api,
    required this.items,
    this.grants = const [],
    this.onRefresh,
  });

  final ApiClient api;
  final List<Map<String, dynamic>> items;
  final List<Map<String, dynamic>> grants;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        // ── بخش ثبت کارت‌های قلقلی (همان JSX… یعنی همان ویجتِ قبلیِ داشبورد،
        // بدونِ هیچ تغییرِ ظاهری) ──
        Padding(
          padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.md, Gaps.md, 0),
          child: AppCard(
            padding: const EdgeInsets.all(Gaps.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        borderRadius: Corners.rLg,
                        gradient: LinearGradient(
                          colors: [
                            BrandColors.emerald.withValues(alpha: 0.22),
                            BrandColors.blue.withValues(alpha: 0.12),
                          ],
                        ),
                        border: Border.all(
                            color: BrandColors.emerald.withValues(alpha: 0.35)),
                      ),
                      child: Image.asset('assets/brand/card_scan_glow.webp',
                          cacheWidth: 150),
                    ),
                    Gaps.hSm,
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text('ثبت کارت‌های قلقلی',
                                    style: theme.textTheme.titleMedium
                                        ?.copyWith(
                                            fontWeight: FontWeight.w900,
                                            fontSize: 14)),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  borderRadius: Corners.rPill,
                                  color: BrandColors.amber
                                      .withValues(alpha: 0.16),
                                  border: Border.all(
                                      color: BrandColors.amber
                                          .withValues(alpha: 0.45)),
                                ),
                                child: const Text('ثبت سریع',
                                    style: TextStyle(
                                        color: BrandColors.amber,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'دقت کنید فقط کارت‌های بالای ۵۰۰ امتیاز ثبت می‌شود.',
                            style: TextStyle(
                              color: Color(0xFFCBD5E1),
                              fontSize: 11.5,
                              height: 1.45,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Gaps.vSm,
                PhotoCardBox(
                  api: api,
                  embedded: true,
                  onRegistered: () => onRefresh?.call(),
                ),
              ],
            ),
          ),
        ),
        // ── کلکسیونِ کامل (همان صفحهٔ قبلی؛ با جست‌وجو/ترتیب/آمار/صندوق‌ها) ──
        Expanded(
          child: InventoryPage(
            items: items,
            grants: grants,
            api: api,
            onRefresh: onRefresh,
          ),
        ),
      ],
    );
  }
}
