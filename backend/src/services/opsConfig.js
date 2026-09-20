/**
 * عملیات‌پیکربندی — کشِ همگام برای کلیدهای `app_settings`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این سرویس وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * چند سرویسِ محصول (گذر نبرد، ماموریت، سطح، استریک، موتور تشخیص) تا امروز
 * اعدادشان را از ثابت‌های کد می‌خواندند و هر تغییر = دپلوی. حالا این اعداد
 * در `app_settings` ذخیره می‌شوند، ولی دو شرط باید برقرار بماند:
 *
 *   ۱. توابعِ همگامِ قدیمی (مثل `xpForTier` که داخل حلقه صدا زده می‌شود)
 *      نمی‌توانند `await` بزنند؛ پس مقدار باید از کشِ همگامِ همین پروسه
 *      خوانده شود نه مستقیم از دیتابیس.
 *   ۲. بعد از ری‌استارت سرور، کش باید از دیتابیس پر شود وگرنه تنظیمِ
 *      ادمین با اولین دیپلوی می‌پرد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که این بازنویسی رفع می‌کند (۲۹ شهریور — گزارشِ مالک)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * کامنتِ نسخهٔ قبلی می‌گفت: «چون سرور تک‌پروسه است (PM2 fork) هیچ نگرانیِ
 * همگامی بین پروسه‌ها نیست.» ولی سرورِ امروز **چندپروسه** است: گرهِ بازی
 * (۴۰۰۰) + چهار گرهِ HTTP (۴۰۰۱–۴۰۰۴) و nginx این پنج پورت را round-robin
 * می‌کند (snippet گله‌گلی: `upstream ghelgheli_http` با پنج server).
 *
 * نتیجه: `set()` فقط کشِ **همان پروسه‌ای** را تازه می‌کرد که درخواستِ ذخیره
 * به آن رسیده بود. بقیهٔ پروسه‌ها تا ری‌استارتِ بعدی مقدارِ کهنه را
 * نگه می‌داشتند. بازتولیدِ زنده (۲۹ شهریور، باگِ «ماموریت‌های اختصاصی به
 * دو تا نمی‌رسد و فهرست برمی‌گردد به یکی»):
 *
 *   PUT دو ماموریت → پاسخ: «۲ ماموریت ذخیره شد»
 *   ۱۲ بار GET → [1,1,1,1,2,1,1,1,1,2,1,1]   ← چهار پروسه از پنج، کهنه
 *
 * پس ادمین می‌دید کارتِ دوم ساخته می‌شود و بعد «ناپدید»؛ کاربر هم گاهی
 * ماموریتی را می‌دید که ادمین پاکش کرده بود. همین کلاسِ باگ برای متن‌های
 * زنده، اعدادِ گذر نبرد، سقف‌های عملیاتی و فهرستِ فروشگاه هم وجود داشت.
 *
 * ── راه‌حل (دو لایه، هر دو لازم) ────────────────────────────────────────
 *
 *   ۱. **اعلانِ بین‌پروسه‌ای با Redis Pub/Sub** (لحظه‌ای): هر `set()` یک
 *      پیامِ کوچک روی کانالِ `ghelgheli:ops-invalidate` می‌فرستد و هر
 *      پروسه با شنیدنش همان کلید را از دیتابیس تازه می‌کند. همان الگویی
 *      که `lib/rateLimitStore.js` و آداپتورِ سوکت برای چندپروسه‌ای بودن
 *      استفاده می‌کنند؛ Redis روی سرور فعال است (`redis://127.0.0.1:6379/1`).
 *
 *   ۲. **گاردِ کهنگی با TTL** (تورِ ایمنی، بدونِ هیچ زیرساختی): هر مقدار
 *      زمانِ تازه‌سازی‌اش را نگه می‌دارد. `syncGet` مقدارِ کهنه‌تر از
 *      `TTL_MS` را هم برمی‌گرداند (تا مسیرِ داغ هرگز بلاک/خالی نشود) ولی
 *      هم‌زمان یک تازه‌سازیِ پس‌زمینه می‌زند. پس حتی اگر Redis بخوابد،
 *      پیام گم شود یا پروسه‌ای تازه بالا بیاید، واگرایی حداکثر تا چند
 *      ثانیه خودش جمع می‌شود. `services/featureFlags.js` همین الگو را
 *      (TTL ۵ ثانیه روی `client_config`) از قبل دارد.
 *
 * ⚠️ قاعده: هر مقدارِ پیش‌فرض باید دقیقاً برابرِ ثابتِ قبلی کد باشد تا
 * رفتار محصول بعد از این تغییر ذره‌ای عوض نشود.
 */
const { pool } = require('../config/db');
const logger = require('../lib/logger');

/**
 * حداکثر عمرِ قابلِ اعتمادِ یک مقدارِ کش‌شده.
 *
 * عددِ کوچک = سرعتِ کم‌تر و کوئریِ بیشتر؛ عددِ بزرگ = پنجرهٔ واگراییِ
 * بلندتر. چهار ثانیه انتخاب شد چون: (الف) مسیرهای محصول (ماموریت‌ها،
 * استریک، گذر نبرد) هر بار مقادیر را همگام می‌خوانند و با TTL کمتر
 * بارِ کوئری زیاد می‌شود؛ (ب) لایهٔ اول (Redis) در حالتِ عادی صفر ثانیه
 * واگرایی دارد و TTL فقط تورِ ایمنی است؛ (ج) تستِ بازتولید نشان داد
 * کاربر در همین بازه هم چیزی از دست نمی‌دهد.
 */
const TTL_MS = Math.max(500, Number(process.env.OPS_CACHE_TTL_MS) || 4000);

/** کانالِ اعلانِ بین‌پروسه‌ای. */
const CHANNEL = 'ghelgheli:ops-invalidate';

const cache = new Map();
/** زمانِ آخرین تازه‌سازیِ هر کلید — برای گاردِ TTL. */
const meta = new Map();
/** تازه‌سازی‌های در جریان، تا یک کلید در یک لحظه چند کوئری نزند. */
const inflight = new Map();

/** خواندنِ خام از دیتابیس + به‌روزرسانیِ کش. */
async function readDb(key) {
  const { rows } = await pool.query(
    'SELECT value FROM app_settings WHERE key=$1 LIMIT 1', [key]);
  const value = rows[0]?.value ?? null;
  cache.set(key, value);
  meta.set(key, { at: Date.now() });
  return value;
}

/** تازه‌سازیِ یک کلید از دیتابیس (با ادغامِ درخواست‌های موازی). */
function refresh(key) {
  const running = inflight.get(key);
  if (running) return running;
  const p = readDb(key)
    .catch((e) => {
      // خطا نباید مقدارِ سالمِ قبلی را دور بریزد و نباید هر فراخوانیِ بعدی
      // یک کوئریِ تازه بزند؛ پس فقط ساعت را جلو می‌بریم (throttle).
      meta.set(key, { at: Date.now() });
      throw e;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * خواندنِ همگام از کش؛ null یعنی هنوز بار نشده → فراخوان باید پیش‌فرض بزند.
 *
 * اگر مقدار کهنه باشد، همان مقدار برگردانده می‌شود (مسیرِ داغ بلاک نمی‌شود)
 * و یک تازه‌سازیِ پس‌زمینه راه می‌افتد.
 */
function syncGet(key) {
  const m = meta.get(key);
  const fresh = cache.has(key) && m && Date.now() - m.at < TTL_MS;
  if (!fresh) refresh(key).catch(() => {});
  return cache.has(key) ? cache.get(key) : null;
}

/** خواندن از کش (اگر تازه باشد) وگرنه از دیتابیس. */
async function get(key) {
  const m = meta.get(key);
  if (cache.has(key) && m && Date.now() - m.at < TTL_MS) return cache.get(key);
  return refresh(key);
}

/** پیش‌بارگذاری چند کلید در لحظهٔ بالا آمدن سرور. */
async function preload(keys) {
  const { rows } = await pool.query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::varchar[])', [keys]);
  const at = Date.now();
  for (const row of rows) {
    cache.set(row.key, row.value);
    meta.set(row.key, { at });
  }
  for (const key of keys) {
    if (!cache.has(key)) {
      cache.set(key, null);
      meta.set(key, { at });
    }
  }
}

/**
 * تازه‌کردنِ یک کلید از دیتابیس — همان کاری که پیامِ Redis می‌کند.
 * برای تست و برای مسیرهایی که بعد از نوشتن می‌خواهند مطمئن شوند.
 */
async function invalidate(key) {
  try {
    return await refresh(key);
  } catch (e) {
    logger.warn(`[opsConfig] تازه‌سازیِ «${key}» ناموفق: ${e.message}`);
    return cache.has(key) ? cache.get(key) : null;
  }
}

// ── لایهٔ اول: اعلانِ بین‌پروسه‌ای ────────────────────────────────────────
// یک کلاینت برای انتشار و یک کلاینت جدا برای اشتراک (Redis در حالتِ
// subscribe اجازهٔ فرمانِ معمولی نمی‌دهد). اگر REDIS_URL نباشد، هیچ‌کدام
// ساخته نمی‌شوند و محصول درست مثلِ حالتِ تک‌پروسه کار می‌کند.
let pubClient = null;
let subClient = null;

function redisPair() {
  if (pubClient !== null) return { pub: pubClient, sub: subClient };
  let enabled = false;
  let makeClient = null;
  try {
    ({ redisEnabled: enabled, makeClient } = require('../lib/redis'));
    enabled = enabled();
  } catch {
    enabled = false;
  }
  if (!enabled || !makeClient) {
    pubClient = false;
    subClient = false;
    return { pub: null, sub: null };
  }
  pubClient = makeClient('ops-pub');
  subClient = makeClient('ops-sub');
  return { pub: pubClient, sub: subClient };
}

/** اعلامِ تغییر به بقیهٔ پروسه‌ها. خطا بی‌صدا است: کشِ ما همین حالا تازه است. */
function announce(key) {
  try {
    const { pub } = redisPair();
    if (pub) pub.publish(CHANNEL, String(key)).catch(() => {});
  } catch {
    /* بدون Redis هم همه چیز کار می‌کند (لایهٔ دوم) */
  }
}

function startSubscriber() {
  try {
    const { sub } = redisPair();
    if (!sub) return;
    sub.on('message', (channel, key) => {
      if (channel !== CHANNEL || !key) return;
      // خودِ فرستنده هم پیام را می‌گیرد؛ تازه‌سازی برایش بی‌ضرر است.
      invalidate(String(key));
    });
    sub.subscribe(CHANNEL).catch((e) => {
      logger.warn(`[opsConfig] اشتراکِ کانال ناموفق: ${e.message}`);
    });
  } catch (e) {
    logger.warn(`[opsConfig] راه‌اندازیِ اشتراک ناموفق: ${e.message}`);
  }
}

startSubscriber();

/** نوشتن + تازه‌کردن کشِ همین پروسه + اعلان به بقیه. */
async function set(key, value, adminId = null) {
  await pool.query(
    `INSERT INTO app_settings(key, value, updated_by_admin_id, updated_at)
     VALUES($1, $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by_admin_id = EXCLUDED.updated_by_admin_id,
           updated_at = NOW()`,
    [key, JSON.stringify(value), adminId]);
  cache.set(key, value);
  meta.set(key, { at: Date.now() });
  announce(key);
  return value;
}

/** خواندن + مرج + نوشتن — الگوی رایج مسیرهای PATCH پنل. */
async function merge(key, patch, adminId = null) {
  const current = (await get(key)) || {};
  const next = {
    ...(typeof current === 'object' && !Array.isArray(current) ? current : {}),
    ...(patch && typeof patch === 'object' ? patch : {}),
  };
  return set(key, next, adminId);
}

module.exports = {
  syncGet, get, preload, set, merge, invalidate,
  TTL_MS, CHANNEL,
};
