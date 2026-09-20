'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ماموریت‌های اختصاصی (چندتایی) — اهرمِ ادمین بدونِ آپدیتِ اپ
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
 * ── خواستهٔ بعدی (۲۹ شهریور) ─────────────────────────────────────────────
 *
 * «باید یه کاری کنی که اگه ادمین خواست چند تا ماموریتِ اختصاصی بتونه قرار
 * بده.» → همین فایل از «ماموریتِ یگانه» به «فهرستی از ماموریت‌ها» رفت.
 *
 * ── طراحی ────────────────────────────────────────────────────────────────
 *
 * یک **فهرست** در `app_settings` نشسته است، نه جدولِ تازه: تعدادش حداکثر
 * `MAX_ITEMS` است، ویرایشش اتمیک است (کلِ فهرست با یک `PUT`) و از همان کشِ
 * همگامِ `opsConfig` خوانده می‌شود که بقیهٔ اهرم‌های ادمین. کلید:
 * `custom_mission`.
 *
 *   { items: [ { id, enabled, title, body, points,
 *                link: { url, text, color }, updatedAt, updatedBy } ],
 *     updatedAt, updatedBy }
 *
 * ── سازگاری با داده و کلاینتِ قدیمی (مهم) ───────────────────────────────
 *
 * ۱) شکلِ **قدیمی** (`{ id, enabled, title, ... }` بدونِ `items`) هنوز خوانده
 *    می‌شود و مثلِ فهرستِ تک‌عضوی دیده می‌شود؛ پس دیپلوی بدونِ مایگریشن و
 *    بدونِ لحظهٔ خالی‌شدنِ کارتِ کاربران انجام می‌شود.
 * ۲) `current`/`publicView`/`status`/`claim(userId)` هنوز دقیقاً شکلِ قبلی را
 *    برمی‌گردانند و روی «اولین ماموریتِ فعال» کار می‌کنند. اپلیکیشنِ
 *    اندرویدی که همین حالا روی گوشیِ کاربران است فقط `custom` را می‌شناسد؛
 *    اگر این‌ها را می‌شکستیم، آن کاربران یا کارت را از دست می‌دادند یا
 *    دکمهٔ دریافتشان ۴۰۴ می‌گرفت.
 *
 * ── «دوره» یعنی چه ───────────────────────────────────────────────────────
 *
 * هر ماموریت شناسهٔ خودش را دارد و `mission_key` در دفترِ پیشرفت
 * (`custom:<id>`) از همین شناسه ساخته می‌شود: کاربر برای هر ماموریت یک‌بار
 * می‌تواند امتیاز بگیرد. پس:
 *   • افزودنِ ماموریتِ تازه → همه (حتی کسانی که قبلی را گرفته‌اند) این یکی
 *     را می‌بینند؛
 *   • ویرایشِ متنِ یک ماموریت → شناسه دست‌نخورده می‌ماند و دریافت‌های قبلی
 *     معتبر می‌مانند (اصلاحِ غلطِ تایپی برای همه امتیازِ تازه پخش نمی‌کند)؛
 *   • `resetPeriod` → همان ماموریت با شناسهٔ تازه: کمپینِ دوباره با همان متن.
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
const crypto = require('crypto');
const { pool } = require('../config/db');
const opsConfig = require('./opsConfig');
const points = require('./pointService');
const logger = require('../lib/logger');

const KEY = 'custom_mission';

/**
 * سقفِ تعدادِ ماموریت‌های اختصاصی.
 *
 * چرا سقف دارد: هر ماموریت یک کارتِ تمام‌عرض در بالای «ماموریت‌های امروز»
 * است. بدونِ سقف، ادمینِ خوش‌ذوق می‌تواند صفحهٔ کاربر را با ۳۰ کارت پر کند و
 * خودِ ماموریت‌های روزانه از دید بیرون برود — همان چیزی که مالک بارها از
 * شلوغیِ صفحه شکایت کرده. پنج، عددِ متعادل است و بالا بردنش یک خط تغییر
 * است (هر دو کلاینت فهرست را حلقه می‌زنند، پس چیز دیگری لازم نیست).
 */
const MAX_ITEMS = 5;

/** پروژهٔ کلیدِ کاربر که «این کاربر این ماموریت را گرفته» را نگه می‌دارد. */
const PERIOD = 'custom';
const missionKey = (id) => `custom:${String(id || '').slice(0, 48)}`;

const COLORS = Object.freeze(['blue', 'green']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(String(v || ''));

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

/** نرمال‌سازیِ یک ماموریت (بدونِ شناسهٔ تازه). */
function normalizeItem(raw) {
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
 * نرمال‌سازیِ چیزی که در `app_settings` نشسته.
 *
 * دو شکلِ مجاز: فهرستِ تازه (`{items:[...]}`) و شکلِ قدیمیِ تک‌ماموریتی
 * (خودِ شیء با `title`/`enabled`). دومی به فهرستِ یک‌عضوی تبدیل می‌شود تا
 * داده‌های روی سرورِ زنده بدونِ مایگریشن زنده بمانند.
 */
function normalizeStored(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  if (Array.isArray(v.items)) {
    return { items: v.items.map(normalizeItem), updatedAt: v.updatedAt || null, updatedBy: v.updatedBy || null };
  }
  // شکلِ قدیمی: فقط اگر واقعاً چیزی در آن باشد به فهرست تبدیل می‌شود.
  const single = normalizeItem(v);
  const hasContent = Boolean(single.id || single.title || single.enabled || single.points);
  return {
    items: hasContent ? [single] : [],
    updatedAt: v.updatedAt || null,
    updatedBy: v.updatedBy || null,
  };
}

/** فهرستِ کاملِ ماموریت‌ها (خاموش و روشن، با همان ترتیبِ ادمین). */
function list() {
  try {
    return normalizeStored(opsConfig.syncGet(KEY)).items;
  } catch {
    return [];
  }
}

/** ماموریت‌هایی که کاربر باید ببیند: روشن + دارای عنوان. */
function activeItems() {
  return list().filter((m) => m.enabled && m.title);
}

/** شکلِ کارت برای کاربر (بدونِ وضعیتِ دریافت). */
function viewOf(item) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    points: item.points,
    link: item.link.url
      ? { url: item.link.url, text: item.link.text || 'اینجا کلیک کنید', color: item.link.color }
      : null,
  };
}

/**
 * اولین ماموریتِ فعال، با شکلِ دقیقاً قدیمی — برای مسیرهای ادمین و برای
 * کلاینت‌هایی که فقط یک ماموریت می‌شناسند.
 */
function current() {
  const first = activeItems()[0];
  if (!first) return { ...EMPTY, link: { ...EMPTY.link } };
  return { ...first, enabled: true, link: { ...first.link } };
}

/** پیش‌نمایشِ اولین ماموریتِ فعال (شکلِ کاربر). `null` اگر ادمین نساخته. */
function publicView() {
  const first = activeItems()[0];
  return first ? viewOf(first) : null;
}

/**
 * وضعیتِ **یک** ماموریت برای یک کاربر: متن + گرفته/نگرفته.
 *
 * خواستهٔ صریح مالک: «وقتی دکمه دریافت رو زد باید امتیاز رو بگیره و
 * دیگه اون ماموریت اختصاصی قبلی به اون کاربر نمایش داده نشه تا زمانی که
 * ماموریت اختصاصی دیگه ای قرار بگیره».
 * پس اگر این کاربر ماموریت را گرفته باشد (claimed_at)، مقدارِ null
 * برمی‌گردانیم تا کارتی نشان داده نشود.
 *
 * ⚠️ کوئریِ این تابع عمداً همان متنِ قبلی است: `testPointsCoinsNickname.js`
 *    آن را با یک استابِ رشته‌ای می‌شکند و اگر متن عوض شود، تستِ «پس از
 *    دریافت کارت پنهان می‌شود» بی‌صدا از کار می‌افتد.
 *
 * @returns {Promise<object|null>}
 */
async function status(userId) {
  const first = activeItems()[0];
  if (!first) return null;
  const view = viewOf(first);
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
  if (claimed) return null;
  return { ...view, claimed: false, claimable: view.points > 0 };
}

/**
 * وضعیتِ **همهٔ** ماموریت‌های فعال برای یک کاربر — همان قاعده، ولی برای
 * فهرست: هر ماموریتی که کاربر گرفته باشد از فهرست حذف می‌شود.
 *
 * یک کوئری برای همه (نه یکی-یکی) تا افزودنِ ماموریتِ بیشتر به تعدادِ
 * کوئری‌های هر بازدیدِ کاربر اضافه نکند.
 *
 * @returns {Promise<Array<object>>}
 */
async function statuses(userId) {
  const active = activeItems();
  if (!active.length) return [];
  let claimed = new Set();
  if (userId) {
    try {
      const { rows } = await pool.query(
        `SELECT mission_key FROM user_mission_progress
          WHERE user_id=$1 AND period_key=$2 AND claimed_at IS NOT NULL
            AND mission_key = ANY($3::varchar[])`,
        [userId, PERIOD, active.map((m) => missionKey(m.id))]);
      claimed = new Set(rows.map((r) => String(r.mission_key)));
    } catch (e) {
      // همان قاعدهٔ `status`: خطای گذرا نباید کارتِ کاربر را بترکاند.
      logger.warn(`[customMission] خواندنِ فهرستِ وضعیت ناموفق: ${e.message}`);
    }
  }
  return active
    .filter((m) => !claimed.has(missionKey(m.id)))
    .map((m) => ({ ...viewOf(m), claimed: false, claimable: m.points > 0 }));
}

/** اعتبارسنجیِ یک ماموریت پیش از ذخیره — خطای ۴۰۰ با پیامِ روشن. */
function assertValid(item, rawLinkUrl) {
  if ((item.enabled || item.points > 0) && !item.title) {
    const e = new Error(item.enabled
      ? 'برای فعال‌کردن، عنوانِ ماموریت لازم است'
      : 'برای امتیازدهی، عنوانِ ماموریت لازم است');
    e.status = 400;
    throw e;
  }
  if (rawLinkUrl && !item.link.url) {
    const e = new Error('لینک باید با http:// یا https:// شروع شود');
    e.status = 400;
    throw e;
  }
}

const stamp = (adminId) => ({ updatedAt: new Date().toISOString(), updatedBy: adminId || null });

/**
 * ذخیرهٔ **فهرستِ** ماموریت‌ها (مسیر تازهٔ پنل).
 *
 * شناسه‌ها حفظ می‌شوند: ماموریتی که ادمین ویرایش می‌کند همان دوره می‌ماند و
 * امتیازِ گرفته‌شدهٔ کاربران دوباره قابلِ دریافت نمی‌شود. شناسهٔ تازه فقط
 * برای ماموریتی ساخته می‌شود که ادمین تازه اضافه کرده.
 *
 * @returns {Promise<Array<object>>} فهرستِ ذخیره‌شده
 */
async function saveMany(adminId, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : null;
  if (!items) return [await save(adminId, payload)]; // سازگاری با پنلِ قدیمی
  if (items.length > MAX_ITEMS) {
    const e = new Error(`حداکثر ${MAX_ITEMS} ماموریت اختصاصی می‌شود ساخت`);
    e.status = 400;
    throw e;
  }

  const next = [];
  const seen = new Set();
  for (const raw of items) {
    const item = normalizeItem({
      ...raw,
      // شناسه: اگر معتبر و تکراری‌نباشد همان می‌ماند، وگرنه تازه ساخته می‌شود
      // (ماموریتِ تازه یا شناسهٔ خرابِ دستکاری‌شده).
      id: isUuid(raw?.id) && !seen.has(String(raw.id)) ? String(raw.id) : crypto.randomUUID(),
      ...stamp(adminId),
    });
    seen.add(item.id);
    assertValid(item, raw?.link?.url);
    next.push(item);
  }

  await opsConfig.set(KEY, { items: next, ...stamp(adminId) }, adminId || null);
  logger.info(`[customMission] فهرست ذخیره شد — ${next.length} ماموریت (فعال: ${next.filter((m) => m.enabled).length}) admin=${adminId || '-'}`);
  return next;
}

/**
 * ذخیرهٔ **تک‌ماموریتی** — شکلِ قدیمیِ همان API.
 *
 * هر ذخیره یک `id` تازه می‌گیرد (رفتارِ قبلی: «دورهٔ تازه») و کلِ فهرست را با
 * یک عضو جای‌گزین می‌کند. کلاینتِ تازه دقیقاً همین کار را با «حذفِ بقیه و
 * ساختنِ یکی» انجام می‌دهد؛ این تابع برای سازگاری و برای تست‌ها می‌ماند.
 *
 * @returns {Promise<object>} نسخهٔ ذخیره‌شده (شکلِ خام)
 */
async function save(adminId, payload) {
  const next = normalizeItem({
    ...(payload || {}),
    id: crypto.randomUUID(),
    ...stamp(adminId),
  });
  assertValid(next, payload?.link?.url);
  await opsConfig.set(KEY, { items: [next], ...stamp(adminId) }, adminId || null);
  logger.info(`[customMission] ذخیره شد — enabled=${next.enabled} points=${next.points} admin=${adminId || '-'}`);
  return next;
}

/**
 * «دورهٔ تازه» برای یک ماموریت: شناسهٔ تازه، همان متن.
 *
 * با این کار همهٔ کاربران (حتی کسانی که این ماموریت را گرفته بودند) می‌توانند
 * دوباره امتیاز بگیرند — بدونِ اینکه ادمین مجبور شود متن را از نو بنویسد.
 * ردیف‌های دفترِ دورهٔ قبل پاک نمی‌شوند: تاریخِ دریافت‌ها می‌ماند و فقط دیگر
 * با شناسهٔ جاری مطابقت نمی‌کند.
 *
 * @returns {Promise<Array<object>>} فهرستِ تازه
 */
async function resetPeriod(adminId, id) {
  const wanted = String(id || '');
  const items = list();
  const index = items.findIndex((m) => m.id === wanted);
  if (index === -1) {
    const e = new Error('این ماموریت پیدا نشد — شاید هم‌زمانِ شما پنل دیگری آن را پاک کرده');
    e.status = 404;
    throw e;
  }
  items[index] = { ...items[index], id: crypto.randomUUID(), ...stamp(adminId) };
  await opsConfig.set(KEY, { items, ...stamp(adminId) }, adminId || null);
  logger.info(`[customMission] دورهٔ تازه — «${items[index].title}» admin=${adminId || '-'}`);
  return items;
}

/**
 * دریافتِ امتیازِ ماموریتِ اختصاصی — برای هر کاربر و هر ماموریت یک‌بار.
 *
 * @param {string} userId
 * @param {string} [missionId] شناسهٔ ماموریت. اگر نیامد (کلاینتِ قدیمی)،
 *   اولین ماموریتِ فعال گرفته می‌شود — همان رفتارِ قبل از چندتایی‌شدن.
 * @returns {Promise<{ok:boolean, message:string, points?:number, balance?:number}>}
 */
async function claim(userId, missionId) {
  const active = activeItems();
  const wanted = missionId ? active.find((m) => m.id === String(missionId)) : active[0];
  if (!wanted) {
    const e = new Error(missionId
      ? 'این ماموریت اختصاصی دیگر فعال نیست'
      : 'الان ماموریتِ اختصاصی فعالی وجود ندارد');
    e.status = 404;
    throw e;
  }
  const view = viewOf(wanted);
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
         (user_id, mission_key, period_key, progress, claimed_at, updated_at)
       VALUES ($1,$2,$3,1,NOW(),NOW())
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

/**
 * آمارِ دریافتِ هر ماموریت برای پنل ادمین: «چند نفر این یکی را گرفته‌اند؟»
 *
 * بدونِ این، ادمینِ چند ماموریت نمی‌داند کدام کمپین جواب داده. اگر
 * دیتابیس در دسترس نباشد، `{}` برمی‌گردد (پنل نباید به‌خاطرِ آمار ۵۰۰ بدهد).
 *
 * @returns {Promise<Record<string, {claims:number, lastClaim:string|null}>>}
 */
async function stats() {
  try {
    const { rows } = await pool.query(
      `SELECT mission_key, COUNT(*)::int AS claims, MAX(claimed_at) AS last_claim
         FROM user_mission_progress
        WHERE period_key=$1 AND claimed_at IS NOT NULL
        GROUP BY mission_key`, [PERIOD]);
    const out = {};
    for (const row of rows) {
      const key = String(row.mission_key || '');
      if (!key.startsWith('custom:')) continue;
      out[key.slice('custom:'.length)] = {
        claims: Number(row.claims) || 0,
        lastClaim: row.last_claim || null,
      };
    }
    return out;
  } catch (e) {
    logger.warn(`[customMission] خواندنِ آمارِ دریافت ناموفق: ${e.message}`);
    return {};
  }
}

module.exports = {
  KEY, PERIOD, MAX_ITEMS, COLORS,
  list, activeItems, current, publicView, status, statuses,
  save, saveMany, resetPeriod, claim, stats,
  missionKey, safeLinkUrl,
};
