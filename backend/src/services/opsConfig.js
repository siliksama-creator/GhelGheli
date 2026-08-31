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
 * راه‌حل: `preload()` در لحظهٔ بالا آمدن سرور صدا زده می‌شود، و هر بار که
 * ادمین تنظیمی را ذخیره می‌کند `set()` هم دیتابیس را می‌نویسد هم کشِ
 * همگام را تازه می‌کند. چون سرور تک‌پروسه است (PM2 fork) هیچ نگرانیِ
 * همگامی بین پروسه‌ها نیست.
 *
 * ⚠️ قاعده: هر مقدارِ پیش‌فرض باید دقیقاً برابرِ ثابتِ قبلی کد باشد تا
 * رفتار محصول بعد از این تغییر ذره‌ای عوض نشود.
 */
const { pool } = require('../config/db');

const cache = new Map();

/** خواندنِ همگام از کش؛ null یعنی هنوز بار نشده → فراخوان باید پیش‌فرض بزند. */
function syncGet(key) {
  return cache.has(key) ? cache.get(key) : null;
}

/** خواندن از کش، و اگر نبود از دیتابیس. */
async function get(key) {
  if (cache.has(key)) return cache.get(key);
  const { rows } = await pool.query(
    'SELECT value FROM app_settings WHERE key=$1 LIMIT 1', [key]);
  const value = rows[0]?.value ?? null;
  cache.set(key, value);
  return value;
}

/** پیش‌بارگذاری چند کلید در لحظهٔ بالا آمدن سرور. */
async function preload(keys) {
  const { rows } = await pool.query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::varchar[])', [keys]);
  for (const row of rows) cache.set(row.key, row.value);
  for (const key of keys) if (!cache.has(key)) cache.set(key, null);
}

/** نوشتن + تازه‌کردن کش. بدون `adminId` برای مسیرهای غیرادمینی (تست/بوت). */
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

module.exports = { syncGet, get, preload, set, merge };
