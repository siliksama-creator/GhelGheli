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
  // ── منحنیِ بازی ضربه‌زن (دورِ ۳۳) ──────────────────────────────────────
  // خواستهٔ مالک: «بتونه امتیازها و سکه به‌ازای هر لول بازی ضربه‌زن رو
  // بصورت کامل مدیریت کنه» و «هر تغییر بدون آپدیت اپ اعمال بشه».
  //
  // تا امروز این چهار عدد ثابتِ هاردکد در سه فایل بودند (سرور + وب +
  // اندروید) و تغییرشان یعنی انتشارِ نسخهٔ جدید. حالا منبعِ حقیقت اینجا
  // است و کلاینت‌ها آن را از GET /api/config می‌خوانند؛ مقدارهای
  // پیش‌فرض دقیقاً همان اعدادِ قبلی‌اند تا تا وقتی ادمین دست نزده،
  // اقتصادی ذره‌ای عوض نشود.
  tapCurve: Object.freeze({
    levelCount: 50,      // تعداد لول‌های بازی
    totalPoints: 50000,  // کل امتیاز بازی (خواستهٔ مالک: ۵۰ هزار)
    growthFactor: 1.05,  // شیب گران‌شدن لول‌ها (شکل منحنی، نه جمع آن)
    levelsPerDay: 2,     // سقف لول در روز (تقویم تهران)
  }),
});

const GAME_IDS = ['card_duel', 'penalty', 'memory'];
// پیش‌فرض تاریخی؛ در runtime از ops_limits.publicStakes (امتیازی >0) می‌آید
// تا پنل اقتصاد با ورودی‌های زنده هم‌خوان باشد.
const DEFAULT_STAKE_LEVELS = Object.freeze([100, 1000]);
const OUTCOMES = ['win', 'draw', 'loss'];

function stakeLevels() {
  try {
    const ops = require('./opsLimits').get();
    const scored = (ops.publicStakes || [])
      .map(Number)
      .filter((n) => Number.isSafeInteger(n) && n > 0 && n <= 1_000_000);
    if (scored.length) return [...new Set(scored)].sort((a, b) => a - b);
  } catch { /* */ }
  return [...DEFAULT_STAKE_LEVELS];
}

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
  const stakes = stakeLevels();
  for (const gameId of GAME_IDS) {
    const src = v.coinRewards?.[gameId] || DEFAULTS.coinRewards[gameId] || {};
    const defGame = DEFAULTS.coinRewards[gameId] || {};
    coinRewards[gameId] = {};
    for (const stake of stakes) {
      const s = src[stake] || src[String(stake)] || defGame[stake] || defGame[String(stake)] || {};
      const defS = defGame[stake] || defGame[String(stake)] || { win: 0, draw: 0, loss: 0 };
      coinRewards[gameId][stake] = {};
      for (const outcome of OUTCOMES) {
        coinRewards[gameId][stake][outcome] = clampInt(
          s[outcome], 0, 10000, defS[outcome] || 0,
        );
      }
    }
  }
  const quotaSrc = v.dailyCoinQuota || {};
  const tc = v.tapCurve && typeof v.tapCurve === 'object' ? v.tapCurve : {};
  return {
    coinCarryoverPercent: clampInt(
      v.coinCarryoverPercent, 0, 100, DEFAULTS.coinCarryoverPercent,
    ),
    coinRewards,
    dailyCoinQuota: Object.fromEntries(
      stakes.map((stake) => [
        stake,
        clampInt(
          quotaSrc[stake] ?? quotaSrc[String(stake)],
          0,
          1000,
          DEFAULTS.dailyCoinQuota[stake] ?? DEFAULTS.dailyCoinQuota[String(stake)] ?? 15,
        ),
      ]),
    ),
    tapCoinsPerLevel: clampInt(
      v.tapCoinsPerLevel, 1, 1000, DEFAULTS.tapCoinsPerLevel,
    ),
    // ── منحنیِ ضربه‌زن (دورِ ۳۳) ──
    // محدوده‌ها عمداً محافظه‌کارانه‌اند: levelCount از ۵ (بازیِ نمایشی)
    // تا ۲۰۰، totalPoints تا ده میلیون (سقفِ bigintِ ستونِ points_awarded
    // بسیار بالاتر است ولی سرور جدولِ منحنی را در هر بسته بازمی‌سازد و
    // سقفِ منطقی همین است)، growthFactor بین ۱ و ۱٫۵ تا منحنی همیشه
    // صعودی و معقول بماند.
    tapCurve: {
      levelCount: clampInt(tc.levelCount, 5, 200, DEFAULTS.tapCurve.levelCount),
      totalPoints: clampInt(
        tc.totalPoints, 1000, 10_000_000, DEFAULTS.tapCurve.totalPoints),
      growthFactor: Math.min(
        1.5,
        Math.max(1, Number(tc.growthFactor) || DEFAULTS.tapCurve.growthFactor),
      ),
      levelsPerDay: clampInt(
        tc.levelsPerDay, 0, 50, DEFAULTS.tapCurve.levelsPerDay),
    },
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
    tapCurve: cfg.tapCurve,
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
  for (const stake of stakeLevels()) {
    if (Number(cfg.dailyCoinQuota?.[stake]) !== Number(d.dailyCoinQuota?.[stake] ?? 15)) return true;
  }
  for (const k of Object.keys(d.tapCurve)) {
    if (Number(cfg.tapCurve[k]) !== Number(d.tapCurve[k])) return true;
  }
  for (const gameId of GAME_IDS) {
    for (const stake of stakeLevels()) {
      for (const outcome of OUTCOMES) {
        const a = cfg.coinRewards?.[gameId]?.[stake]?.[outcome];
        const b = d.coinRewards?.[gameId]?.[stake]?.[outcome];
        if (Number(a || 0) !== Number(b || 0)) return true;
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
  // سازگاری: آرایهٔ زنده — هر بار stakeLevels() تازه
  get STAKE_LEVELS() { return stakeLevels(); },
  stakeLevels,
  load,
  publicView,
  save,
  merge,
  isCustom,
  invalidateCache,
  setCachedForTest,
};
