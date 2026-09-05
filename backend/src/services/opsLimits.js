/**
 * سقف‌ها و اعدادِ عملیاتی — آخرین دسته از ثابت‌هایی که از پنل قابل تنظیم شدند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این ماژول وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این اعداد تا امروز ثابتِ کد بودند و هر تغییر = دپلوی:
 *
 *   • CHAT_KEEP_LIMIT (نگهداری ۲۰۰ پیام آخر چت)
 *   • MAX_FAILS در قفلِ عکس‌کارت (۵ تلاش)
 *   • درصدِ کمیسیون معرف و سقفِ دعوت‌های مؤثر روزانه
 *   • سقفِ برخی rate limitهای مسیرهای بازی/چت
 *   • مدت و تعداد دورِ انیمیشن گردونه (کلاینت‌ها از سرور می‌گیرند)
 *
 * حالا همه در `app_settings` با کلیدِ `ops_limits` ذخیره می‌شوند و با همان
 * کشِ همگامِ opsConfig خوانده می‌شوند — پس مسیرهای داغ (هر پیام چت، هر
 * تلاشِ عکس) هیچ await اضافه‌ای نمی‌گیرند.
 *
 * ⚠️ گاردهای امنیتی عمداً اینجا نیستند: سقفِ OTP، تأییدِ کد، ورودِ ادمین و
 * ورودِ کاربر **از پنل قابل تغییر نیستند**. ضعیف‌کردنِ ضدِ brute-force از
 * داخلِ پنلی که خودش با رمز باز می‌شود یعنی مهاجم با یک رمز، همهٔ
 * گاردها را می‌گیرد. آن‌ها فقط در پاسخِ GET برای «اطلاع» دیده می‌شوند.
 */
const opsConfig = require('./opsConfig');

const KEY = 'ops_limits';

const DEFAULTS = Object.freeze({
  // سقفِ سراسریِ نگه‌داری پیام چت. خواستهٔ مالک: «بیشتر از ۵۰ پیامِ آخر
  // ذخیره نشود — پیام‌ها آماده‌اند و چت اهمیتی ندارد». جدول همیشه حداکثر
  // ۵۰ (+فاصلهٔ پاک‌سازی) ردیف دارد و هرگز رشد نمی‌کند.
  chatKeepLimit: 50,
  photoLockMaxFails: 5,
  referralCommissionPercent: 5,
  referralPurchaseCommissionPercent: 5,
  referralMaxInvitesForDaily: 50,
  referralSpinsPerInvite: 3,
  referralInvitesPerDailySpin: 10,
  referralBaseDailySpins: 1,
  // آستانهٔ برداشتِ درآمد نقدی معرف — قبلاً ثابت ۵۰٬۰۰۰ در referralService
  // بود و تغییرش دپلوی می‌خواست. حالا از همین پنل.
  referralWithdrawalThreshold: 50000,
  // ورودی‌های مجاز مسابقه — قبلاً ثابتِ gameStakeService بودند.
  // کلاینت‌ها از /api/config.stakes می‌خوانند تا بدون آپدیت عوض شوند.
  // 0 = تمرین/رایگان. public بدون 0 هم در UI به‌عنوان «ورودی امتیازی» نشان داده می‌شود.
  publicStakes: [0, 100, 1000],
  lobbyStakes: [0, 100, 1000, 5000],
  bazaarApiBase: 'https://pardakht.cafebazaar.ir',
  wheelSpinMs: 5600,
  wheelSpinRotations: 9,
  // سقف‌هایی که ادمین می‌تواند شل/سفت کند. هر کلید = نامِ limiter در
  // server.js؛ پیش‌فرض دقیقاً ثابتِ قبلی کد است تا رفتار عوض نشود.
  rateLimits: {
    chat: { windowMs: 60_000, limit: 20 },
    tapBatch: { windowMs: 60_000, limit: 20 },
    wheel: { windowMs: 60_000, limit: 20 },
    cardDuel: { windowMs: 60_000, limit: 24 },
    withdrawal: { windowMs: 60_000, limit: 10 },
  },
});

// گاردهای امنیتی — فقط نمایش، هرگز ویرایش از پنل.
const SECURITY_RATE_LIMITS = Object.freeze({
  otp: { windowMs: 10 * 60_000, limit: 5 },
  otpVerify: { windowMs: 10 * 60_000, limit: 10 },
  adminLogin: { windowMs: 15 * 60_000, limit: 10 },
  userLogin: { windowMs: 15 * 60_000, limit: 20 },
  loginStreak: { windowMs: 60_000, limit: 8 },
});

const listeners = new Set();

/** مقادیرِ فعلی (کشِ همگام) روی پیش‌فرض‌ها — همیشه یک آبجکتِ کامل برمی‌گرداند. */
/** فهرست stake را پاک‌سازی می‌کند: عدد صحیح یکتا، مرتب، در بازهٔ امن. */
function normalizeStakeList(input, fallback) {
  const src = Array.isArray(input) ? input : fallback;
  const out = [];
  const seen = new Set();
  for (const raw of src) {
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => a - b);
  return out.length ? out : [...fallback];
}

function get() {
  const stored = opsConfig.syncGet(KEY);
  const s = stored && typeof stored === 'object' ? stored : {};
  const storedRl = s.rateLimits && typeof s.rateLimits === 'object' ? s.rateLimits : {};
  return {
    ...DEFAULTS,
    ...s,
    publicStakes: normalizeStakeList(s.publicStakes, DEFAULTS.publicStakes),
    lobbyStakes: normalizeStakeList(s.lobbyStakes, DEFAULTS.lobbyStakes),
    rateLimits: { ...DEFAULTS.rateLimits, ...storedRl },
  };
}

/**
 * اعتبارسنجیِ ورودی پنل. مقادیرِ نامعتبر همان پیش‌فرض/مقدارِ فعلی را
 * نگه می‌دارند — هیچ ذخیره‌ای نباید سقفی را به صفر یا بی‌نهایت ببرد.
 */
function sanitize(input, current) {
  const b = input && typeof input === 'object' ? input : {};
  const num = (v, cur, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : cur;
  };
  const rlIn = b.rateLimits && typeof b.rateLimits === 'object' ? b.rateLimits : {};
  const rateLimits = { ...current.rateLimits };
  for (const name of Object.keys(rateLimits)) {
    const row = rlIn[name] && typeof rlIn[name] === 'object' ? rlIn[name] : {};
    rateLimits[name] = {
      windowMs: num(row.windowMs, rateLimits[name].windowMs, 1_000, 60 * 60_000),
      limit: num(row.limit, rateLimits[name].limit, 1, 10_000),
    };
  }
  return {
    chatKeepLimit: num(b.chatKeepLimit, current.chatKeepLimit, 20, 1000),
    photoLockMaxFails: num(b.photoLockMaxFails, current.photoLockMaxFails, 1, 20),
    referralCommissionPercent: num(b.referralCommissionPercent, current.referralCommissionPercent, 0, 50),
    referralPurchaseCommissionPercent: num(b.referralPurchaseCommissionPercent, current.referralPurchaseCommissionPercent, 0, 50),
    referralMaxInvitesForDaily: num(b.referralMaxInvitesForDaily, current.referralMaxInvitesForDaily, 1, 500),
    referralSpinsPerInvite: num(b.referralSpinsPerInvite, current.referralSpinsPerInvite, 0, 50),
    referralInvitesPerDailySpin: num(b.referralInvitesPerDailySpin, current.referralInvitesPerDailySpin, 1, 100),
    referralBaseDailySpins: num(b.referralBaseDailySpins, current.referralBaseDailySpins, 0, 50),
    referralWithdrawalThreshold: num(
      b.referralWithdrawalThreshold,
      current.referralWithdrawalThreshold,
      1000,
      50_000_000,
    ),
    publicStakes: normalizeStakeList(
      b.publicStakes !== undefined ? b.publicStakes : current.publicStakes,
      DEFAULTS.publicStakes,
    ),
    lobbyStakes: normalizeStakeList(
      b.lobbyStakes !== undefined ? b.lobbyStakes : current.lobbyStakes,
      DEFAULTS.lobbyStakes,
    ),
    bazaarApiBase: String(b.bazaarApiBase || current.bazaarApiBase).trim().slice(0, 300) || current.bazaarApiBase,
    wheelSpinMs: num(b.wheelSpinMs, current.wheelSpinMs, 500, 20_000),
    wheelSpinRotations: num(b.wheelSpinRotations, current.wheelSpinRotations, 1, 20),
    rateLimits,
  };
}

/** ذخیرهٔ مقادیر تازه و خبرکردنِ شنونده‌ها (مثلاً limiterهای server.js). */
async function save(input, adminId) {
  const current = get();
  const next = sanitize(input, current);
  await opsConfig.set(KEY, next, adminId);
  for (const fn of listeners) {
    try { fn(next); } catch (e) { console.error('[opsLimits] listener failed:', e.message); }
  }
  return next;
}

/** ثبتِ شنونده برای اعمالِ بی‌درنگِ تغییرات (rebuild limiterها). */
function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** نمای پنل: مقادیرِ قابل ویرایش + گاردهای امنیتیِ فقط‌خواندنی. */
function panelView() {
  const current = get();
  return {
    ...current,
    securityRateLimits: SECURITY_RATE_LIMITS,
  };
}

module.exports = { KEY, DEFAULTS, SECURITY_RATE_LIMITS, get, sanitize, save, onChange, panelView };
