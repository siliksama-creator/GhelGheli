/**
 * ── کلاسِ کارت = ردهٔ کمیابی، نه یک برچسبِ دستی ───────────────────────
 *
 * خواستهٔ مالک (۳ مهر ۱۴۰۵): «common: ۵۰۰ امتیازی · uncommon: ۱۰۰۰ امتیازی ·
 * rare: ۳۰۰۰ امتیازی · legendary: بالای ۳۰۰۰ … این لیست بر اساسِ میزانِ
 * کمیابیِ کارت‌هاست.»
 *
 * پیش از این پنج کلاسِ دلبخواهی داشتیم که ادمین انتخاب می‌کرد و هیچ ربطی
 * به امتیاز نداشت (کارتِ ۱۰۰۰ امتیازی با نشانِ «لجند» در کاتالوگ بود).
 * حالا نردبان **بازه‌ای** است و منبعش سرور است؛ این نقشه فقط برچسب و رنگِ
 * نمایشی را می‌داند. گاردِ `backend/scripts/testCardRarity.js` هر سه کلاینت
 * و سرور را واژه‌به‌واژه به هم می‌دوزد.
 */
export const CARD_RARITY_META = {
  common: { label: 'معمولی', accent: '#8FA3B8', icon: '●' },
  uncommon: { label: 'کمیاب', accent: '#34D399', icon: '◆' },
  rare: { label: 'نایاب', accent: '#A78BFA', icon: '✦' },
  legendary: { label: 'افسانه‌ای', accent: '#FFD166', icon: '♛' },
};

/** آستانهٔ بالای هر رده — همان اعدادی که در `lib/cardRarity.js` سرور است. */
export const CARD_RARITY_MAX_POINTS = { common: 500, uncommon: 1000, rare: 3000 };

/** کلیدهای نسلِ قبل → کلیدهای تازه. */
export const LEGACY_CARD_RARITY = {
  normal: 'common', silver: 'uncommon', gold: 'uncommon',
  premium: 'rare', legend: 'legendary',
};

/**
 * کلاس را از امتیازِ کارت می‌سازد.
 * مرزها بازه‌ای‌اند نه تطبیقِ دقیق: کاتالوگ کارتِ ۲۰۰۰ امتیازی دارد و هر
 * عددی ممکن است ثبت شود. پس هیچ کارتی بی‌کلاس نمی‌ماند.
 */
export function cardRarityForPoints(pointValue) {
  const n = Number(pointValue);
  const p = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  if (p <= 500) return 'common';
  if (p <= 1000) return 'uncommon';
  if (p <= 3000) return 'rare';
  return 'legendary';
}

/** هر رشته‌ای (تازه یا نسلِ قبل) → کلیدِ معتبر. */
export function normalizeCardRarity(value) {
  const key = String(value ?? '').trim();
  if (CARD_RARITY_META[key]) return key;
  if (LEGACY_CARD_RARITY[key]) return LEGACY_CARD_RARITY[key];
  return 'common';
}

const BAD_ART = ['football', 'ball.webp', 'empty_collection', 'avatar_1_football'];

export function cardArtOf(item) {
  if (!item) return '';
  for (const key of ['imageUrl', 'image_url', 'frontImageUrl', 'front_image_url']) {
    const value = item[key];
    if (!value) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (BAD_ART.some(mark => text.includes(mark))) continue;
    return text;
  }
  return '';
}

export function cardIdOf(item) {
  return String(item?.cardTypeId || item?.card_type_id || item?.id || '');
}

export function cardNameOf(item) {
  return String(item?.name || 'کارت');
}

export function cardQtyOf(item) {
  const raw = item?.quantity ?? item?.registered_count ?? 1;
  const n = Number.parseInt(String(raw).split('.')[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function cardRarityOf(item) {
  const raw = String(item?.duel_rarity || item?.rarity || '');
  if (CARD_RARITY_META[raw]) return raw;
  // کلیدِ نسلِ قبل → کلاسِ تازه. بی این، کارتی که با نامِ قدیمی ذخیره شده
  // بی‌قاب و با برچسبِ خامِ انگلیسی دیده می‌شد.
  return normalizeCardRarity(raw);
}

export function cardStatsOf(item) {
  return [
    ['حمله', item?.duel_attack ?? item?.attack ?? 0],
    ['دفاع', item?.duel_defense ?? item?.defense ?? 0],
    ['سرعت', item?.duel_speed ?? item?.speed ?? 0],
    ['تکنیک', item?.duel_technique ?? item?.technique ?? 0],
    ['گل', item?.duel_goal_chance ?? item?.goalChance ?? 0],
    ['انرژی', item?.duel_energy ?? item?.energy ?? 0],
  ];
}

export function cardPointValueOf(item) {
  const n = Number.parseInt(String(item?.point_value ?? item?.pointValue ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}

export function cardPowerOf(item) {
  const n = Number.parseInt(String(item?.power ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}
