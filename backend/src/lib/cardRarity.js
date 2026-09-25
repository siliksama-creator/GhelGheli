/**
 * کلاسِ کارت — **تنها منبعِ حقیقت**.
 *
 * ── خواستهٔ مالک (۳ مهر ۱۴۰۵) ─────────────────────────────────────────
 *
 * «کلاسِ کارت این تغییرات رو یکپارچه بده: common: کارت‌های ۵۰۰ امتیازی،
 *  uncommon: کارت‌های ۱۰۰۰ امتیازی، rare: کارت‌های ۳۰۰۰ امتیازی،
 *  legendary: کارت‌های بالای ۳۰۰۰ امتیاز … ما این لیست بر اساسِ میزانِ
 *  کمیابیِ کارت‌ها ساختیم.»
 *
 * ── چرا این فایل وجود دارد ───────────────────────────────────────────
 *
 * پیش از این پنج کلاسِ دلبخواهی داشتیم (normal/silver/gold/premium/legend)
 * که ادمین **دستی** انتخاب می‌کرد و هیچ ربطی به امتیازِ کارت نداشت. نتیجهٔ
 * عملی در کاتالوگِ واقعی: یک کارتِ ۱۰۰۰ امتیازی «لجند» بود و یک کارتِ
 * ۲۰۰۰ امتیازی هم «لجند» — یعنی کاربر کلاسِ «لجند» می‌دید و کارتی کم‌ارزش‌تر
 * از یک «نقره‌ای ۱۰۰۰ امتیازی» می‌گرفت.
 *
 * حالا کلاس **تابعی از امتیاز** است، نه یک برچسبِ سلیقه‌ای. یک تعریف، چهار
 * مصرف‌کننده: مهاجرتِ SQL، سرویسِ دوئل، سرویسِ جعبه، و گاردِ
 * `scripts/testCardRarity.js` که می‌سنجد هر سه یکی می‌گویند.
 *
 * ── نردبان ───────────────────────────────────────────────────────────
 *
 *   common     معمولی     ۰    .. ۵۰۰
 *   uncommon   کمیاب      ۵۰۱  .. ۱۰۰۰
 *   rare       نایاب      ۱۰۰۱ .. ۳۰۰۰
 *   legendary  افسانه‌ای  ۳۰۰۱ و بالاتر
 *
 * مرزها **بازه‌ای**‌اند نه تطبیقِ دقیق: کاتالوگِ واقعی کارتِ ۲۰۰۰ امتیازی
 * دارد و از فردا هر عددی ممکن است ثبت شود. با بازه، هر امتیازی یک کلاس
 * می‌گیرد و هیچ کارتی بی‌کلاس نمی‌ماند.
 */
'use strict';

/** چهار کلاس، از کمترین به بیشترین ارزش. ترتیب در همهٔ گزارش‌ها همین است. */
const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'legendary']);

/**
 * برچسبِ فارسی. عمداً **بدونِ تلفظِ انگلیسی**: «لجند» و «پرمیوم» ترجمه
 * نبودند، آوانویس بودند. نردبانِ کمیابی اکنون یکدست و فارسی است.
 */
const RARITY_LABELS = Object.freeze({
  common: 'معمولی',
  uncommon: 'کمیاب',
  rare: 'نایاب',
  legendary: 'افسانه‌ای',
});

/**
 * پاداشِ قدرتِ دوئل هر کلاس.
 *
 * ⚠️ این اعداد از روی **رفتارِ قبلیِ همان ردهٔ امتیازی** انتخاب شده‌اند، نه
 *    از روی سلیقه — تا بالانسِ بازی نشکند:
 *
 *      کارتِ ۵۰۰  امتیازی قبلاً `normal`  بود → پاداشِ ۰   → common: 0
 *      کارتِ ۱۰۰۰ امتیازی قبلاً `silver`  بود → پاداشِ ۵   → uncommon: 5
 *      کارتِ ۳۰۰۰ امتیازی قبلاً `premium` بود → پاداشِ ۱۶  → rare: 16
 *      کارتِ بالای ۳۰۰۰   قبلاً `legend`  بود → پاداشِ ۲۴  → legendary: 24
 *
 *    نگهبان: `scripts/testCardDuelBalance.js` بازهٔ ۵۵٪–۷۵٪ نرخِ بردِ
 *    کاربر را می‌سنجد و `scripts/testCardRarity.js` صعودی بودنِ نردبان را.
 */
const RARITY_BONUS = Object.freeze({
  common: 0,
  uncommon: 5,
  rare: 16,
  legendary: 24,
});

/** رنگِ نشانهٔ هر کلاس — یک جا، تا سرور و همهٔ کلاینت‌ها یکدست بمانند. */
const RARITY_ACCENT = Object.freeze({
  common: '#8FA3B8',
  uncommon: '#34D399',
  rare: '#A78BFA',
  legendary: '#FFD166',
});

/** آستانهٔ بالای هر رده (شامل). `legendary` آخرین است و سقف ندارد. */
const RARITY_MAX_POINTS = Object.freeze({
  common: 500,
  uncommon: 1000,
  rare: 3000,
});

/**
 * کلیدهای نسلِ قبل → کلیدهای تازه.
 *
 * چرا نگه داشته می‌شود: کلاینتِ ادمینِ کش‌شده در مرورگرِ کسی ممکن است
 * هنوز `legend` بفرستد، و ردیف‌های تاریخیِ `card_box_cards` هم همان نام‌ها
 * را دارند. بی این نگاشت، یک درخواستِ کهنه به‌جای «نگاشتِ درست» با خطای
 * ۴۰۰ برمی‌گشت یا بی‌صدا به `common` می‌افتاد — و کارتِ لجندِ کاربر
 * تبدیل به معمولی می‌شد.
 */
const LEGACY_RARITY = Object.freeze({
  normal: 'common',
  silver: 'uncommon',
  gold: 'uncommon',
  premium: 'rare',
  legend: 'legendary',
});

function intOf(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** آیا این رشته یک کلیدِ کلاسِ معتبر (نسلِ تازه) است؟ */
function isRarity(value) {
  return RARITIES.includes(String(value || ''));
}

/**
 * کلاس را از امتیازِ کارت می‌سازد. **تنها راهِ تعیینِ کلاس.**
 *
 * امتیازِ منفی/نامعتبر = `common` (امن‌ترین رده) تا یک ورودیِ خراب
 * هرگز کارت را به ردهٔ بالا نبرد.
 */
function rarityForPoints(pointValue) {
  const p = Math.max(0, intOf(pointValue));
  if (p <= RARITY_MAX_POINTS.common) return 'common';
  if (p <= RARITY_MAX_POINTS.uncommon) return 'uncommon';
  if (p <= RARITY_MAX_POINTS.rare) return 'rare';
  return 'legendary';
}

/**
 * هر ورودیِ رشته‌ای را به یک کلیدِ معتبر تبدیل می‌کند.
 * ترتیب: کلیدِ تازه → نگاشتِ نسلِ قبل → `fallback`.
 */
function rarityInput(value, fallback = 'common') {
  const s = String(value === undefined || value === null ? '' : value).trim();
  if (RARITIES.includes(s)) return s;
  if (LEGACY_RARITY[s]) return LEGACY_RARITY[s];
  return RARITIES.includes(fallback) ? fallback : 'common';
}

/** رتبهٔ عددی (۰ = معمولی). برای میانگین‌گیری و مقایسه. */
function rarityRank(value) {
  return RARITIES.indexOf(rarityInput(value));
}

/** برچسبِ فارسی با fallbackِ امن. */
function rarityLabel(value) {
  return RARITY_LABELS[rarityInput(value)];
}

module.exports = {
  RARITIES, RARITY_LABELS, RARITY_BONUS, RARITY_ACCENT, RARITY_MAX_POINTS,
  LEGACY_RARITY, isRarity, rarityForPoints, rarityInput, rarityRank, rarityLabel,
};
