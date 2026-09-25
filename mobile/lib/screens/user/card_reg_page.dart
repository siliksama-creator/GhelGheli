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
import '../../core/app_config.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/photo_card_box.dart';
import 'inventory_page.dart';

/// استایلِ مشترکِ دو جملهٔ کادرِ راهنمای ثبتِ کارت.
///
/// یک ثابت و نه دو `TextStyle` تکراری: دو جمله از یک کادرِ واحدند و
/// اگر روزی اندازهٔ فونت عوض شود، سطرِ دوم نباید جا بماند — همان
/// اشتباهی که در وب با دو کلاسِ جداگانه رخ می‌دهد.
const TextStyle _cardRegNoteStyle = TextStyle(
  color: Color(0xFFE2E8F0),
  fontSize: 11.5,
  height: 1.7,
  fontWeight: FontWeight.w600,
);

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
                          ListenableBuilder(
                            listenable: AppConfig.instance,
                            builder: (context, _) => Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  liveText('cardReg.lead',
                                      'از کارت عکس بگیرید و کد را وارد کنید'),
                                  style: const TextStyle(
                                    color: Color(0xFFCBD5E1),
                                    fontSize: 11.5,
                                    height: 1.45,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  liveText(
                                      'cardReg.minPointsNote',
                                      'فقط کارت‌های ۵۰۰ امتیازی و بالاتر ثبت می‌شود.'),
                                  style: const TextStyle(
                                    color: Color(0xFFFBBF24),
                                    fontSize: 11.5,
                                    height: 1.45,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
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
            // کادرِ راهنمای ثبتِ کارت (دو جملهٔ زندهٔ پنل) **سرصفحهٔ فهرست**
            // است، نه فرزندِ ثابتِ این Column — دلیلش کامنتِ `header` در
            // `inventory_page.dart`: متنِ زنده هر لحظه می‌تواند بلندتر شود و
            // سرصفحهٔ ثابت روی صفحهٔ کوتاه سرریز می‌کرد (گاردِ CI همین را
            // گرفت: overflow 7px در home_shell_test).
            header: const _CardRegNotes(),
          ),
        ),
      ],
    );
  }
}


/// کادرِ راهنمای ثبتِ کارت — دو جملهٔ **زندهٔ** سرور.
///
/// ── چرا ویجتِ جدا ─────────────────────────────────────────────────────
///
/// این کادر سرصفحهٔ `InventoryPage` است (پارامترِ `header`)، یعنی داخلِ
/// همان `CustomScrollView`ی که کلکسیون را نشان می‌دهد. اگر فرزندِ ثابتِ
/// `Column`ِ بیرونی می‌ماند، با بلندتر شدنِ متن از پنل ارتفاعش از فضای
/// صفحه بیشتر می‌شد و `RenderFlex` سرریز می‌کرد — اتفاقی که همان روزِ
/// افزودنِ جملهٔ دوم در CI افتاد (۷ پیکسل، دو تست).
///
/// `ListenableBuilder` عمدی است: با هر تغییرِ `/api/config` متن بی‌نیاز به
/// رفرشِ صفحه عوض می‌شود، و شرطِ «هر دو خالی ⇒ هیچ چیز» فقط همین‌جا
/// نوشتنی است (اپراتورِ `final` را وسطِ لیستِ فرزندان نمی‌شود گذاشت).
class _CardRegNotes extends StatelessWidget {
  const _CardRegNotes();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppConfig.instance,
      builder: (context, _) {
        final note = liveText(
          'cardReg.duelEffectNote',
          'کارت های قلقلی براساس قدرت بازیکن و درصد کمیاب بودن در بازی Duel card تاثیر میذارن این به این معنیه که ممکنه بازیکن افسانه ای مثل پله از بازیکن جدیدی بخاطر اینکه سبک کارتش کمیاب نبوده و افکت اصلی کارتش ضعیف تر هستش دست رو ببازه با احترام به تمامی بازیکن ها قدیمی و افسانه ای سیستم به این صورت عمل میکنه.',
        );
        final special = liveText(
          'cardReg.specialCardsNote',
          'کارت های خاص نقره ای طلایی پلاتینیوم و غیره فعلا در اپلیکیشن ثبت نمیشن و پشتیبانی روبیکا این کارت هارو ثبت میکنه',
        );
        if (note.isEmpty && special.isEmpty) return const SizedBox.shrink();
        return Padding(
          // هم‌تراز با بقیهٔ صفحه: فهرست با `Gaps.md` حاشیه دارد، این کادر
          // هم باید همان حاشیه را داشته باشد (قبلاً چسبیده به لبه بود).
          padding: const EdgeInsetsDirectional.fromSTEB(Gaps.md, 12, Gaps.md, 0),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              color: BrandColors.info.withValues(alpha: 0.10),
              border: Border.all(color: BrandColors.info.withValues(alpha: 0.30)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsetsDirectional.only(top: 1),
                  child: Icon(Icons.info_outline,
                      size: 16, color: BrandColors.info),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (note.isNotEmpty)
                        Text(note, style: _cardRegNoteStyle),
                      if (note.isNotEmpty && special.isNotEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: Divider(
                            height: 1,
                            thickness: 1,
                            color: Color(0x384EA1FF),
                          ),
                        ),
                      if (special.isNotEmpty)
                        Text(special, style: _cardRegNoteStyle),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
