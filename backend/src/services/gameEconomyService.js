// ═══════════════════════════════════════════════════════════════════════════
// سرویس اقتصاد بازی — منبعِ واحدِ حقیقت برای سکه و امتیازِ بازی‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک:
//   ۱. «در پنل ادمین کنترلِ سکه در حالت برد، کسر امتیاز در حالت برد و
//      غیره تمامی این‌ها بشه توسط ادمین مشخص بشه» — همهٔ اعدادِ اقتصاد
//      (سکهٔ برد/مساوی/باخت، سهمیهٔ روزانهٔ سکه، سکهٔ هر لولِ ضربه‌زن،
//      امتیازِ برد/باخت/مساوی) از یک تنظیمِ واحد خوانده می‌شوند.
//   ۲. «نوشته‌های توی اپلیکیشن‌ها هم‌زمان تغییر کنن حتی اگه نسخهٔ جدید
//      نصب نکرده باشن» — کلاینت‌ها این اعداد را از `GET /api/config`
//      (بدون آپدیت اپ) می‌خوانند و متن‌ها را با همان می‌سازند.
//   ۳. «مشخص کنه چند درصد از سکه به لیگ بعدی منتقل شه … ممکنه ۰ قرار
//      بده» — `coinCarryoverPercent` (صفر مجاز است).
//
// مقدارهای پیش‌فرض دقیقاً همان اعدادِ قبلیِ هاردکد هستند تا تا وقتی
// ادمین چیزی را تغییر نداده، اقتصاد ذره‌ای عوض نشود.
const { pool } = require('../config/db');

const DEFAULTS = Object.freeze({
  // درصدِ سکهٔ منتقل‌شده از لیگِ بسته به لیگِ بعدی (۰..۱۰۰)
  coinCarryoverPercent: 10,
  // سکهٔ هر نتیجه در هر سطحِ ورودی — ساختار همان COIN_TABLE قبلی
  coinRewards: Object.freeze({
    card_duel: Object.freeze({
      100: Object.freeze({ win: 10, draw: 3, loss: 1 }),
      1000: Object.freeze({ win: 30, draw: 9, loss: 3 }),
    }),
    penalty: Object.freeze({
      100: Object.freeze({ win: 10, draw: 3, loss: 1 }),
      1000: Object.freeze({ win: 30, draw: 9, loss: 3 }),
    }),
    memory: Object.freeze({
      100: Object.freeze({ win: 10, draw: 3, loss: 1 }),
      1000: Object.freeze({ win: 30, draw: 9, loss: 3 }),
    }),
  }),
  // سهمیهٔ روزانهٔ مسابقهٔ سکه‌دار (تعداد بازی، مشترک بین هر سه بازی)
  dailyCoinQuota: Object.freeze({ 100: 30, 1000: 15 }),
  // سکهٔ هر لولِ تمام‌شدهٔ بازی ضربه‌زن — خواستهٔ مالک: «هر لول ۵ سکه»
  tapCoinsPerLevel: 5,
});

const GAME_IDS = ['card_duel', 'penalty', 'memory'];
const STAKE_LEVELS = [100, 1000];
const OUTCOMES = ['win', 'draw', 'loss'];

// کشِ سبک: خواندنِ تنظیمات در مسیرهای داغ (رزرو مسابقه، هر بستهٔ ضربه‌زن)
// نباید هر بار یک کوئریِ جدا بزند. ادمین که ذخیره می‌کند کش باطل می‌شود.
let cache = { at: 0, value: null };
const CACHE_TTL_MS = 15_000;

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** تنظیمِ خام را روی پیش‌فرض‌ها مرج می‌کند تا کلیدِ جاافتاده همیشه مقدار داشته باشد. */
function merge(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const coinRewards = {};
  for (const gameId of GAME_IDS) {
    const src = v.coinRewards?.[gameId] || DEFAULTS.coinRewards[gameId];
    coinRewards[gameId] = {};
    for (const stake of STAKE_LEVELS) {
      const s = src[stake] || DEFAULTS.coinRewards[gameId][stake];
      coinRewards[gameId][stake] = {};
      for (const outcome of OUTCOMES) {
        coinRewards[gameId][stake][outcome] = clampInt(
          s[outcome], 0, 10000, DEFAULTS.coinRewards[gameId][stake][outcome],
        );
      }
    }
  }
  const quotaSrc = v.dailyCoinQuota || {};
  return {
    coinCarryoverPercent: clampInt(
      v.coinCarryoverPercent, 0, 100, DEFAULTS.coinCarryoverPercent,
    ),
    coinRewards,
    dailyCoinQuota: {
      100: clampInt(quotaSrc[100], 0, 1000, DEFAULTS.dailyCoinQuota[100]),
      1000: clampInt(quotaSrc[1000], 0, 1000, DEFAULTS.dailyCoinQuota[1000]),
    },
    tapCoinsPerLevel: clampInt(
      v.tapCoinsPerLevel, 1, 1000, DEFAULTS.tapCoinsPerLevel,
    ),
  };
}

async function load() {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_TTL_MS) return cache.value;
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key='game_economy_settings' LIMIT 1",
  );
  const value = merge(rows[0]?.value);
  cache = { at: now, value };
  return value;
}

/** فقط خواندن، با ساختارِ امن برای کلاینت‌ها (`GET /api/config`). */
async function publicView() {
  const cfg = await load();
  return {
    coinCarryoverPercent: cfg.coinCarryoverPercent,
    coinRewards: cfg.coinRewards,
    dailyCoinQuota: cfg.dailyCoinQuota,
    tapCoinsPerLevel: cfg.tapCoinsPerLevel,
  };
}

/** اعتبارسنجی و ذخیره — از پنل ادمین (وب و اندروید). */
async function save(body, adminId) {
  const next = merge(body);
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('game_economy_settings',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,
       updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(next), adminId],
  );
  cache = { at: 0, value: null };
  return next;
}

/** آیا مقدارِ داده‌شده با پیش‌فرض‌ها فرق دارد؟ (برای نمایشِ وضعیتِ «سفارشی»). */
function isCustom(cfg) {
  const d = DEFAULTS;
  if (cfg.coinCarryoverPercent !== d.coinCarryoverPercent) return true;
  if (cfg.tapCoinsPerLevel !== d.tapCoinsPerLevel) return true;
  if (cfg.dailyCoinQuota[100] !== d.dailyCoinQuota[100]) return true;
  if (cfg.dailyCoinQuota[1000] !== d.dailyCoinQuota[1000]) return true;
  for (const gameId of GAME_IDS) {
    for (const stake of STAKE_LEVELS) {
      for (const outcome of OUTCOMES) {
        if (cfg.coinRewards[gameId][stake][outcome]
          !== d.coinRewards[gameId][stake][outcome]) return true;
      }
    }
  }
  return false;
}

/** تست‌ها و سرویس‌های دیگر: کش را باطل/تزریق کن. */
function invalidateCache() { cache = { at: 0, value: null }; }
function setCachedForTest(value) { cache = { at: Date.now(), value: merge(value) }; }

module.exports = {
  DEFAULTS,
  GAME_IDS,
  STAKE_LEVELS,
  load,
  publicView,
  save,
  merge,
  isCustom,
  invalidateCache,
  setCachedForTest,
};
