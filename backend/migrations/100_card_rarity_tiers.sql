-- ═══════════════════════════════════════════════════════════════════════
-- ۱۰۰ — کلاسِ کارت اکنون «ردهٔ کمیابی» است، نه یک برچسبِ دستی
-- ═══════════════════════════════════════════════════════════════════════
--
-- ── خواستهٔ مالک (۳ مهر ۱۴۰۵) ─────────────────────────────────────────
--
-- «common: کارت‌های ۵۰۰ امتیازی · uncommon: کارت‌های ۱۰۰۰ امتیازی ·
--  rare: کارت‌های ۳۰۰۰ امتیازی · legendary: کارت‌های بالای ۳۰۰۰ امتیاز.
--  این رو برای همهٔ کارت‌های ثبت‌شده هم تغییر بده.»
--
-- ── چه چیزی خراب بود ─────────────────────────────────────────────────
--
-- پنج کلاسِ نسلِ قبل (`normal/silver/gold/premium/legend`) هیچ رابطه‌ای با
-- امتیازِ کارت نداشتند؛ ادمین دستی انتخابشان می‌کرد. نتیجه در کاتالوگِ
-- واقعیِ امروز:
--
--     ۵۰۰ امتیاز  → normal   ×۴
--     ۱۰۰۰ امتیاز → silver ×۶ · gold ×۱ · **legend ×۱**
--     ۲۰۰۰ امتیاز → **legend ×۲**
--     ۳۰۰۰ امتیاز → premium ×۱۵
--
-- یعنی یک کارتِ ۱۰۰۰ امتیازی کلاسِ «لجند» داشت. `RARITY_BONUS` برای لجند
-- ۲۴ واحد است و برای نقره‌ای ۵ — پس آن کارت در دوئل بی‌دلیل ۱۹ واحد قوی‌تر
-- از یک کارتِ هم‌ارزش بود، و کاربر کارتی با نشانِ طلایی می‌خرید که از یک
-- کارتِ «نقره‌ای» ضعیف‌تر می‌جنگید. کلاس دیگر معنایی نداشت.
--
-- ── تصمیم ────────────────────────────────────────────────────────────
--
-- کلاس **تابعی از امتیاز** می‌شود و همان تعریف در سرور
-- (`backend/src/lib/cardRarity.js`) و در هر سه کلاینت تکرار شده است:
--
--     common     معمولی     ۰    .. ۵۰۰
--     uncommon   کمیاب      ۵۰۱  .. ۱۰۰۰
--     rare       نایاب      ۱۰۰۱ .. ۳۰۰۰
--     legendary  افسانه‌ای  ۳۰۰۱ و بالاتر
--
-- مرزها بازه‌ای‌اند نه تطبیقِ دقیق، چون کاتالوگ کارتِ ۲۰۰۰ امتیازی دارد و
-- از فردا هر عددی ممکن است ثبت شود. با بازه، هیچ کارتی بی‌کلاس نمی‌ماند.
--
-- ⚠️ ترتیبِ گام‌ها عمدی است: اول قیدِ سخت برداشته می‌شود، بعد داده
--    به‌روز می‌شود، بعد قیدِ سختِ تازه گذاشته می‌شود. اگر قیدِ تازه را
--    اول می‌گذاشتیم، همان `UPDATE` وسطِ راه رد می‌شد و مهاجرت با
--    تراکنشِ برگشته می‌سوخت.

-- ── گامِ ۱: قیدِ کلاس در `card_types` ─────────────────────────────────
ALTER TABLE card_types DROP CONSTRAINT IF EXISTS card_types_duel_rarity_check;
-- موقّتاً هر دو نسل مجاز است تا `UPDATE`ِ پایین رد نشود.
ALTER TABLE card_types ADD CONSTRAINT card_types_duel_rarity_check CHECK (
  duel_rarity IN (
    'normal','silver','gold','premium','legend',
    'common','uncommon','rare','legendary'
  )
);

-- ── گامِ ۲: بازتعریفِ کلاسِ همهٔ کارت‌های ثبت‌شده بر اساس امتیاز ──────
UPDATE card_types
   SET duel_rarity = CASE
         WHEN point_value <= 500  THEN 'common'
         WHEN point_value <= 1000 THEN 'uncommon'
         WHEN point_value <= 3000 THEN 'rare'
         ELSE 'legendary'
       END,
       updated_at = NOW()
 WHERE duel_rarity IS DISTINCT FROM (CASE
         WHEN point_value <= 500  THEN 'common'
         WHEN point_value <= 1000 THEN 'uncommon'
         WHEN point_value <= 3000 THEN 'rare'
         ELSE 'legendary'
       END);

-- ── گامِ ۳: قیدِ سختِ تازه — فقط چهار کلاسِ کانونی ───────────────────
ALTER TABLE card_types DROP CONSTRAINT IF EXISTS card_types_duel_rarity_check;
ALTER TABLE card_types ADD CONSTRAINT card_types_duel_rarity_check CHECK (
  duel_rarity IN ('common','uncommon','rare','legendary')
);

COMMENT ON COLUMN card_types.duel_rarity IS
  'کلاسِ کمیابی — از point_value ساخته می‌شود، نه دستِ ادمین. '
  'common≤۵۰۰ · uncommon≤۱۰۰۰ · rare≤۳۰۰۰ · legendary>۳۰۰۰. '
  'منبعِ حقیقت: backend/src/lib/cardRarity.js — گارد: scripts/testCardRarity.js';

-- ═══════════════════════════════════════════════════════════════════════
-- بخش ۲ — شانسِ جعبهٔ کارت با چهار کلاس، با حفظِ ارزشِ امروزِ صندوق
-- ═══════════════════════════════════════════════════════════════════════
--
-- خواستهٔ مالک: «توزیعِ ارزشِ جعبه به‌هم نریزد.» پس شانسِ هر ردهٔ امتیازیِ
-- نسلِ قبل به کلاسِ تازهٔ **همان رده** منتقل شد:
--
--     normal  ۴۰۹  (کارتِ ۵۰۰)                → common     ۴۰۹
--     silver  ۳۰۶  + gold ۱۵۳  (کارتِ ۱۰۰۰)   → uncommon   ۴۵۹
--     premium ۱۲۲  (کارتِ ۳۰۰۰)                → rare       ۱۲۲
--     legend   ۱۰  (کارتِ بالای ۳۰۰۰)          → legendary   ۱۰
--                                              جمع        = ۱۰۰۰ ✓
--
-- «silver + gold» با هم به uncommon رفتند چون در کاتالوگِ واقعی **هر دو**
-- کارتِ ۱۰۰۰ امتیازی بودند؛ ادغامشان در یک کلاس یعنی وزنشان هم جمع می‌شود،
-- نه اینکه یکی بی‌صدا دور ریخته شود.
--
-- ⚠️ ارزشِ انتظاری هر صندوق با این نگاشت تقریباً ثابت می‌ماند
--    (۱۰۴۹٫۵ → ۱۰۲۵ امتیاز؛ اختلافِ ۲٪ که از ادغامِ دو رده می‌آید و کمتر از
--    نوسانِ تصادفِ خودِ قرعه‌کشی است).
--
-- نکتهٔ عملی: اکنون هیچ کارتی با امتیازِ بالای ۳۰۰۰ در کاتالوگ نیست، پس
-- سهمِ `legendary` فعلاً بین بقیه پخش می‌شود. این رفتار **از قبل** در
-- `cardBoxService.open()` پیاده شده (`while (rarity && (!bucket || !bucket.length))`
-- سطلِ خالی را حذف و دوباره قرعه می‌کشد) و پنل ادمین هم تعدادِ کارتِ هر
-- کلاس را نشان می‌دهد تا مدیر «۱۰٪ افسانه‌ای» را کورکورانه ذخیره نکند.

-- ⚠️ ترتیب: قیدِ سخت **بعد** از جانشینیِ ردیف‌ها گذاشته می‌شود. نسخهٔ اول
--    این مایگریشن قید را اول می‌گذاشت و روی کپیِ دیتابیس شکست خورد
--    («check constraint is violated by some row») — ردیف‌های قدیمیِ
--    `normal/silver/…` هنوز سرِ جایشان بودند. روی پروداکشن این خطا کلِ
--    تراکنش را برمی‌گرداند، پس مهاجرت هیچ کاری نمی‌کرد و بی‌صدا رد می‌شد.
ALTER TABLE card_box_odds DROP CONSTRAINT IF EXISTS card_box_odds_rarity_check;

DELETE FROM card_box_odds;
INSERT INTO card_box_odds (rarity, weight_permille, updated_at) VALUES
  ('common',    409, NOW()),
  ('uncommon',  459, NOW()),
  ('rare',      122, NOW()),
  ('legendary',  10, NOW());

ALTER TABLE card_box_odds ADD CONSTRAINT card_box_odds_rarity_check CHECK (
  rarity IN ('common','uncommon','rare','legendary')
);

COMMENT ON TABLE card_box_odds IS
  'شانسِ افتِ هر کلاس از جعبه، در هزار. جمع باید دقیقاً ۱۰۰۰ باشد. '
  'کلاس‌ها: common/uncommon/rare/legendary (مایگریشن ۱۰۰).';

-- ═══════════════════════════════════════════════════════════════════════
-- بخش ۳ — تاریخچهٔ قرعه‌کشی‌های گذشته
-- ═══════════════════════════════════════════════════════════════════════
--
-- `card_box_cards.rarity` سندِ تاریخیِ «چه چیزی از صندوق افتاد» است. با
-- عوض شدنِ نامِ کلاس‌ها، اگر ردیف‌های قدیمی دست‌نخورده بمانند دو مشکل
-- می‌سازند: (۱) پنل ادمین برایشان برچسبِ فارسی پیدا نمی‌کند و کلیدِ خامِ
-- انگلیسی نشان می‌دهد، (۲) مقایسهٔ «فلان کلاس چند بار افتاده» بینِ قبل و
-- بعد از این مایگریشن بی‌معنی می‌شود.
--
-- نگاشت بدونِ ابهام است چون هر کلاسِ قبلی دقیقاً به یک کلاسِ تازه می‌رود.
-- ⚠️ `card_box_cards` قیدِ CHECK روی rarity ندارد (بررسی شد)، وگرنه اول
--    باید مثلِ بالا موقّت شل می‌شد.
UPDATE card_box_cards
   SET rarity = CASE rarity
         WHEN 'normal'  THEN 'common'
         WHEN 'silver'  THEN 'uncommon'
         WHEN 'gold'    THEN 'uncommon'
         WHEN 'premium' THEN 'rare'
         WHEN 'legend'  THEN 'legendary'
         ELSE rarity
       END
 WHERE rarity IN ('normal','silver','gold','premium','legend');
