'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ماموریتِ اختصاصی (همگانی) — اهرمِ ادمین بدونِ آپدیتِ اپ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۱۷ شهریور) ──────────────────────────────────────────────
 *
 * «قبلِ ماموریتِ امروز یک قسمتِ ماموریتِ اختصاصی قرار می‌گیرد؛ این ماموریت را
 * ادمین در پنل مشخص و امتیازدهی می‌کند. اگر ادمین فعالش کند، به همهٔ
 * کاربران نشان داده می‌شود. مدیر حتی اجازه دارد لینکِ قابلِ کلیک بسازد و
 * حتی می‌تواند لینک را پشتِ کلمهٔ «اینجا کلیک کنید» بگذارد، به رنگِ مثلاً
 * آبی یا سبز.»
 *
 * ── طراحی ────────────────────────────────────────────────────────────────
 *
 * یک ماموریتِ **یگانه** (نه فهرست) در `app_settings` نشسته است، نه جدولِ
 * تازه: تعدادش یکی است، ویرایشش اتمیک است و از همان کشِ همگامِ `opsConfig`
 * خوانده می‌شود که بقیهٔ اهرم‌های ادمین. کلید: `custom_mission`.
 *
 *   { id, enabled, title, body, points,
 *     link: { url, text, color }, updatedAt, updatedBy }
 *
 * `id` با هر ذخیرهٔ ادمین **عوض می‌شود** (UUID تازه) و همین، «دوره»ی
 * ماموریت را مشخص می‌کند: کاربر برای هر ماموریت یک‌بار می‌تواند امتیاز
 * بگیرد. پس ادمین با ساختنِ کمپینِ تازه، همان کاربران را دوباره درگیر
 * می‌کند؛ و با روشن‌وخاموش‌کردنِ ساده، امتیازِ دو بار نمی‌دهیم.
 *
 * ── چرا «دریافت امتیاز» و نه واریزِ خودکار ────────────────────────────────
 *
 * اگر با فعال‌کردنِ ماموریت، به **همهٔ** کاربران بی‌درنگ امتیاز واریز شود:
 *   • با یک اشتباهِ تایپی در عنوان، امتیاز غیرقابل‌برگشت پخش می‌شود؛
 *   • «۵۰۰ امتیاز برای بازدیدِ کانال» بدونِ هیچ عملِ کاربر واریز می‌شد؛
 *   • کاربرِ غیرفعال (که ماه‌ها نیامده) هم امتیاز می‌گرفت.
 * با دکمهٔ «دریافت»، امتیاز در لحظه‌ای داده می‌شود که کاربر ماموریت را
 * دیده و کار (مثلاً کلیکِ لینک) را انجام داده — و ثبتش با منبعِ `mission`
 * در دفترِ امتیاز می‌نشیند.
 *
 * ── قاعدهٔ دفتر ──────────────────────────────────────────────────────────
 *
 * امتیاز از `pointService.credit` با منبعِ `mission` داده می‌شود — همان
 * منبعی که ماموریت‌های روزانه دارند. پس در دفترِ امتیازِ کاربر، ردیفِ
 * «ماموریت اختصاصی: <عنوان>» با توضیحِ خودش دیده می‌شود.
 */
const { pool } = require('../config/db');
const opsConfig = require('./opsConfig');
const points = require('./pointService');
const logger = require('../lib/logger');

const KEY = 'custom_mission';

/** پروژهٔ کلیدِ کاربر که «این کاربر این ماموریت را گرفته» را نگه می‌دارد. */
const PERIOD = 'custom';
const missionKey = (id) => `custom:${String(id || '').slice(0, 48)}`;

const COLORS = Object.freeze(['blue', 'green']);

/** محافظِ لینک: فقط http/https. `javascript:`/`data:` هرگز به کلاینت نمی‌رود. */
function safeLinkUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length > 300) return '';
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

/** پیش‌فرضِ خاموش — ماموریتی که ادمین نساخته. */
const EMPTY = Object.freeze({
  id: '',
  enabled: false,
  title: '',
  body: '',
  points: 0,
  link: { url: '', text: '', color: 'blue' },
  updatedAt: null,
  updatedBy: null,
});

function normalize(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const link = v.link && typeof v.link === 'object' ? v.link : {};
  const color = COLORS.includes(String(link.color)) ? String(link.color) : 'blue';
  return {
    id: clip(v.id, 48),
    enabled: v.enabled === true,
    title: clip(v.title, 60),
    body: clip(v.body, 300),
    points: Math.max(0, Math.min(1_000_000, Math.trunc(Number(v.points) || 0))),
    link: {
      url: safeLinkUrl(link.url),
      text: clip(link.text, 24),
      color,
    },
    updatedAt: v.updatedAt || null,
    updatedBy: v.updatedBy || null,
  };
}

/**
 * خواندنِ زندهٔ ماموریت.
 *
 * ⚠️ `syncGet` و نه `get`: این تابع در مسیرِ داغِ `GET /api/missions` و در
 *    ساختِ همان پاسخ صدا زده می‌شود؛ `get` پرامیسه است و اگر کش سرد باشد
 *    یک کوئریِ اضافه به هر درخواست می‌چسباند. `custom_mission` در بوت
 *    `preload` می‌شود (server.js)، پس کش همیشه گرم است و `set` هم بعد از
 *    هر ذخیرهٔ ادمین همان کلید را تازه می‌کند.
 */
function current() {
  try {
    const raw = opsConfig.syncGet(KEY);
    return normalize(raw || EMPTY);
  } catch {
    return { ...EMPTY, link: { ...EMPTY.link } };
  }
}

/**
 * متنی که کاربر می‌بیند. اگر ادمین لینک گذاشته ولی متنِ لینک خالی است،
 * «اینجا کلیک کنید» — همان جمله‌ای که مالک خواست.
 */
function publicView() {
  const m = current();
  if (!m.enabled || !m.title) return null;
  const link = m.link.url
    ? {
      url: m.link.url,
      text: m.link.text || 'اینجا کلیک کنید',
      color: m.link.color,
    }
    : null;
  return {
    id: m.id,
    title: m.title,
    body: m.body,
    points: m.points,
    link,
  };
}

/**
 * ساخت/ویرایشِ ماموریت. هر ذخیره یک `id` تازه می‌گیرد تا «دورهٔ» تازه باشد.
 * @returns {Promise<object>} نسخهٔ ذخیره‌شده (شکلِ خام)
 */
async function save(adminId, payload) {
  const next = normalize({ ...(payload || {}), id: require('crypto').randomUUID(),
    updatedAt: new Date().toISOString(), updatedBy: adminId || null });

  if (next.enabled && !next.title) {
    const e = new Error('برای فعال‌کردن، عنوانِ ماموریت لازم است');
    e.status = 400;
    throw e;
  }
  if (next.points > 0 && !next.title) {
    const e = new Error('برای امتیازدهی، عنوانِ ماموریت لازم است');
    e.status = 400;
    throw e;
  }
  const rawLink = payload?.link?.url;
  if (rawLink && !next.link.url) {
    const e = new Error('لینک باید با http:// یا https:// شروع شود');
    e.status = 400;
    throw e;
  }

  await opsConfig.set(KEY, next, adminId || null);
  logger.info(`[customMission] ذخیره شد — enabled=${next.enabled} points=${next.points} admin=${adminId || '-'}`);
  return next;
}

/**
 * وضعیتِ ماموریت برای یک کاربر: متن + گرفته/نگرفته.
 * خواستهٔ صریح مالک: «وقتی دکمه دریافت رو زد باید امتیاز رو بگیره و
 * دیگه اون ماموریت اختصاصی قبلی به اون کاربر نمایش داده نشه تا زمانی که
 * ماموریت اختصاصی دیگه ای قرار بگیره».
 * پس اگر ماموریت توسط این کاربر دریافت شده باشد (claimed_at)، مقدارِ null
 * برمی‌گردانیم تا کارتی به کاربر نشان داده نشود.
 *
 * @returns {Promise<object|null>}
 */
async function status(userId) {
  const view = publicView();
  if (!view) return null;
  let claimed = false;
  if (userId) {
    try {
      const { rows } = await pool.query(
        `SELECT claimed_at FROM user_mission_progress
          WHERE user_id=$1 AND mission_key=$2 AND period_key=$3`,
        [userId, missionKey(view.id), PERIOD]);
      claimed = Boolean(rows[0]?.claimed_at);
    } catch (e) {
      // بدونِ دیتابیس (تست) یا خطای گذرا: «نگرفته» نشان بده ولی ادعا نکن
      // که دفتر سالم است.
      logger.warn(`[customMission] خواندنِ وضعیت ناموفق: ${e.message}`);
    }
  }
  // اگر کاربر قبلاً امتیازِ این دوره را گرفته، دیگر به او نشان داده نمی‌شود
  // تا زمانی که ادمین با ذخیرهٔ ماموریتِ جدید، شناسهٔ تازه‌ای بسازد.
  if (claimed) return null;

  return { ...view, claimed: false, claimable: view.points > 0 };
}

/**
 * دریافتِ امتیازِ ماموریتِ اختصاصی — برای هر کاربر و هر دوره یک‌بار.
 *
 * @returns {Promise<{ok:boolean, message:string, points?:number, balance?:number}>}
 */
async function claim(userId) {
  const view = publicView();
  if (!view) {
    const e = new Error('الان ماموریتِ اختصاصی فعالی وجود ندارد');
    e.status = 404;
    throw e;
  }
  if (view.points <= 0) {
    const e = new Error('این ماموریت امتیازِ نقدی ندارد');
    e.status = 400;
    throw e;
  }
  const key = missionKey(view.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // «یک‌بار برای هر دوره» — قفلِ ردیفِ کاربر تا دو درخواستِ هم‌زمان هر دو
    // فکر نکنند اولی هستند (همان درسِ دفترِ امتیاز).
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);

    const { rows: existing } = await client.query(
      `SELECT 1 FROM user_mission_progress
        WHERE user_id=$1 AND mission_key=$2 AND period_key=$3 AND claimed_at IS NOT NULL`,
      [userId, key, PERIOD]);
    if (existing.length) {
      await client.query('ROLLBACK');
      return { ok: false, message: 'قبلاً امتیازِ این ماموریت را گرفته‌اید' };
    }

    await client.query(
      `INSERT INTO user_mission_progress
         (user_id, mission_key, period_key, progress, target, claimed_at, updated_at)
       VALUES ($1,$2,$3,1,1,NOW(),NOW())
       ON CONFLICT (user_id, mission_key, period_key)
       DO UPDATE SET claimed_at = COALESCE(user_mission_progress.claimed_at, NOW()),
                     progress = 1, updated_at = NOW()`,
      [userId, key, PERIOD]);

    const credited = await points.credit(client, {
      userId,
      points: view.points,
      source: 'mission',
      referenceType: 'custom_mission',
      referenceId: view.id,
      description: `ماموریت اختصاصی: ${view.title}`,
    });

    await client.query('COMMIT');
    // شکلِ خروجی عیناً مثلِ `missionService.claim` است (`reward`/`balance`)
    // تا کلاینت‌ها یک مسیرِ کد برای هر سه نوع ماموریت داشته باشند.
    return {
      ok: true,
      message: `${view.points} امتیاز ماموریت اختصاصی دریافت شد`,
      reward: view.points,
      balance: credited?.balanceAfter ?? null,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { KEY, COLORS, current, publicView, status, save, claim, missionKey, safeLinkUrl };
