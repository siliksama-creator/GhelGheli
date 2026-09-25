/**
 * کلاسِ کارت در پنل ادمین — **همان نردبانی که سرور دارد**.
 *
 * ⚠️ این فایل عمداً یک کپیِ کوچک است، نه یک importِ مشترک: پنل و وب و اپ
 *    سه بستهٔ جدا هستند و هیچ‌کدام نمی‌توانند به `backend/` وابسته شوند.
 *    چیزی که از واگرایی جلوگیری می‌کند کپیِ دستی نیست، گاردِ
 *    `backend/scripts/testCardRarity.js` است که همین اعداد و همین
 *    برچسب‌ها را در **سرور و هر سه کلاینت** واژه‌به‌واژه می‌سنجد. اگر روزی
 *    کسی اینجا ۳۰۰۰ را ۲۵۰۰ کند، CI قرمز می‌شود — نه کاربر.
 */
export const RARITY_LABELS = {
  common: 'معمولی',
  uncommon: 'کمیاب',
  rare: 'نایاب',
  legendary: 'افسانه‌ای',
};

export const RARITY_ACCENT = {
  common: '#8FA3B8',
  uncommon: '#34D399',
  rare: '#A78BFA',
  legendary: '#FFD166',
};

/** پاداشِ قدرتِ دوئل هر کلاس — نمایشی؛ منبعِ واقعی سرور است. */
export const RARITY_BONUS = { common: 0, uncommon: 5, rare: 16, legendary: 24 };

/** آستانهٔ بالای هر رده (شامل). `legendary` از ۳۰۰۱ شروع می‌شود. */
export const RARITY_MAX_POINTS = { common: 500, uncommon: 1000, rare: 3000 };

export const RARITY_KEYS = ['common', 'uncommon', 'rare', 'legendary'];

const LEGACY = {
  normal: 'common', silver: 'uncommon', gold: 'uncommon',
  premium: 'rare', legend: 'legendary',
};

export function rarityForPoints(pointValue) {
  const n = Number(pointValue);
  const p = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  if (p <= 500) return 'common';
  if (p <= 1000) return 'uncommon';
  if (p <= 3000) return 'rare';
  return 'legendary';
}

export function normalizeRarity(value) {
  const key = String(value ?? '').trim();
  if (RARITY_LABELS[key]) return key;
  if (LEGACY[key]) return LEGACY[key];
  return 'common';
}
