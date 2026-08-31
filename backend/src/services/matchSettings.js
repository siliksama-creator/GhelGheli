/**
 * آستانه‌های موتور تشخیص کارت با عکس — پیکربندی‌پذیر از پنل ادمین.
 *
 * مقادیرِ پیش‌فرض دقیقاً همان ثابت‌های قبلی کد هستند (۰.۵۵ / ۰.۴۵ /
 * ۰.۲۰ / ۰.۴۰ / ۰.۹۳). از این پس از کلید `photo_match_settings`
 * در app_settings خوانده می‌شوند و ادمین می‌تواند بدون دپلوی
 * سخت‌گیری/نرمی موتور را تنظیم کند.
 */
const ops = require('./opsConfig');

const DEFAULTS = Object.freeze({
  acceptScore: 0.55,
  reviewScore: 0.45,
  boundAcceptScore: 0.20,
  freeAcceptScore: 0.40,
  duplicateSimilarity: 0.93,
});

function clamp01(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** مقادیرِ مؤثرِ فعلی (همگام، از کش). */
function current() {
  const v = ops.syncGet('photo_match_settings');
  if (!v || typeof v !== 'object') return { ...DEFAULTS };
  return {
    acceptScore: clamp01(v.acceptScore, DEFAULTS.acceptScore),
    reviewScore: clamp01(v.reviewScore, DEFAULTS.reviewScore),
    boundAcceptScore: clamp01(v.boundAcceptScore, DEFAULTS.boundAcceptScore),
    freeAcceptScore: clamp01(v.freeAcceptScore, DEFAULTS.freeAcceptScore),
    duplicateSimilarity: clamp01(v.duplicateSimilarity, DEFAULTS.duplicateSimilarity),
  };
}

module.exports = { current, DEFAULTS };
