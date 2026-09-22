const fs = require('fs');
const { pool } = require('../config/db');

let firebase = null;
let firebaseTried = false;

function serviceAccountRaw() {
  if (process.env.FCM_SERVICE_ACCOUNT_JSON) return process.env.FCM_SERVICE_ACCOUNT_JSON;
  const p = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return '';
}

function getFirebase() {
  if (firebase) return firebase;
  if (firebaseTried) return null;
  firebaseTried = true;
  const raw = serviceAccountRaw();
  if (!raw) return null;
  try {
    // firebase-admin v14 removed the old namespace API
    // (`admin.credential.cert`, `admin.apps`, `admin.messaging()`). Use the
    // modular entry points and keep a tiny wrapper so the delivery code and
    // its transport mock have one stable interface.
    const { cert, getApps, initializeApp } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const apps = getApps();
    const app = apps[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
    firebase = { app, messaging: () => getMessaging(app) };
    return firebase;
  } catch (e) {
    console.warn('FCM disabled:', e.message);
    return null;
  }
}

const isFirebaseConfigured = () => Boolean(serviceAccountRaw());

// Narrow test seam: Firebase's SDK is otherwise a module-level singleton.
// Keeping this out of the public service surface lets the transport-failure
// contract be exercised without credentials or network access in CI.
function setFirebaseForTests(value) {
  firebase = value;
  firebaseTried = true;
}

/**
 * ساختِ اعلان.
 *
 * @param {string|null} userId
 * @param {string} type      kind («card»، «wallet»، …)
 * @param {string} title
 * @param {string} body
 * @param {{push?: boolean}} [opts]
 *   `push:false` یعنی اعلان **فقط در زنگولهٔ اعلان‌ها ثبت شود و نوتیفیکیشن
 *   گوشی نرود**. چرا لازم است: وقتی نتیجه همان لحظه در پاسخِ همان درخواست
 *   به کاربر نشان داده می‌شود (تأییدِ درون‌درخواستیِ کارت)، فرستادنِ پوش
 *   چند صد میلی‌ثانیه بعد = اعلانِ تکراری و آزاردهنده. ولی همان اتفاق باید
 *   در فهرستِ اعلان‌ها بماند تا کاربر بعداً بتواند تاریخچه را ببیند.
 *   مسیرهای **غیرِهم‌زمان** (تأییدِ خودکارِ سرور، تصمیمِ ادمین، تلاشِ مجدد)
 *   پوش را می‌فرستند، چون کاربر آن لحظه جلوی صفحه نیست.
 */
async function createNotification(userId, type, title, body, opts = {}) {
  const cleanTitle = String(title || '').trim().slice(0, 160);
  const cleanBody = String(body || '').trim().slice(0, 4000);
  if (!cleanTitle || !cleanBody) {
    throw Object.assign(new Error('عنوان و متن اعلان لازم است'), { status: 400 });
  }
  let rows;
  try {
    ({ rows } = await pool.query(
      'INSERT INTO notifications(user_id,type,title,body) VALUES ($1,$2,$3,$4) RETURNING *',
      [userId || null, type, cleanTitle, cleanBody]
    ));
  } catch (e) {
    // کاربرِ مقصد حذف شده (FK 23503): اعلان ارزشِ شکستنِ اقدامِ اصلی
    // (بنِ چت، پاسخِ تیکت، نتیجهٔ بازی…) را ندارد و ردیفِ یتیم هم نمی‌سازیم.
    if (e.code === '23503') {
      console.warn('[notify] مقصد وجود ندارد — اعلان رد شد:', type);
      return null;
    }
    throw e;
  }
  if (opts.push === false) return rows[0];
  // لایهٔ موبایل (FCM) و لایهٔ وب (Web Push) موازی فرستاده می‌شوند؛
  // هیچ‌کدام نباید دیگری را بلوک یا خراب کند (allSettled — خطای هر کدام
  // در تابعِ خودش فقط warn می‌شود).
  if (userId) {
    await Promise.allSettled([
      sendPushToUser(userId, cleanTitle, cleanBody, { type }),
      sendWebPushToUser(userId, cleanTitle, cleanBody, { type }),
    ]);
  } else {
    await Promise.allSettled([
      sendPushToAll(cleanTitle, cleanBody, { type }),
      sendWebPushToAll(cleanTitle, cleanBody, { type }),
    ]);
  }
  return rows[0];
}

async function sendPushToUser(userId, title, body, data = {}) {
  const fb = getFirebase();
  if (!fb) return { sent: 0, failed: 0, configured: false };
  const { rows } = await pool.query(
    "SELECT fcm_token FROM users WHERE id=$1 AND fcm_token IS NOT NULL AND fcm_token<>''",
    [userId]);
  if (!rows[0]?.fcm_token) return { sent: 0, failed: 0, configured: true };
  try {
    await fb.messaging().send({
      token: rows[0].fcm_token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
    return { sent: 1, failed: 0, configured: true };
  } catch (e) {
    console.warn('[FCM] send user failed:', e.message);
    if (INVALID_TOKEN_CODES.has(e?.code)) {
      await clearInvalidTokens([rows[0].fcm_token]).catch(cleanupError =>
        console.warn('[FCM] stale-token cleanup failed:', cleanupError.message));
    }
    return { sent: 0, failed: 1, configured: true };
  }
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

async function clearInvalidTokens(tokens) {
  const uniq = [...new Set(tokens.filter(Boolean))];
  if (!uniq.length) return;
  await pool.query(
    'UPDATE users SET fcm_token=NULL WHERE fcm_token = ANY($1::text[])',
    [uniq]);
}

async function sendTokens(tokens, title, body, data = {}) {
  const fb = getFirebase();
  if (!fb) return { sent: 0, failed: 0, configured: false, transportErrors: 0 };
  const uniq = [...new Set(tokens.filter(Boolean))];
  let sent = 0, failed = 0, transportErrors = 0;
  for (let i = 0; i < uniq.length; i += 500) {
    const batch = uniq.slice(i, i + 500);
    try {
      const response = await fb.messaging().sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      });
      sent += response.successCount;
      failed += response.failureCount;

      // FCM explicitly tells us which installations no longer exist. Keeping
      // those tokens makes every later campaign noisier and more expensive.
      const stale = [];
      response.responses?.forEach((item, index) => {
        if (!item.success && INVALID_TOKEN_CODES.has(item.error?.code)) {
          stale.push(batch[index]);
        }
      });
      if (stale.length) {
        await clearInvalidTokens(stale).catch(e =>
          console.warn('[FCM] stale-token cleanup failed:', e.message));
      }
    } catch (e) {
      // In-app rows were already committed before push starts. A transient
      // Firebase/network outage must be reported as failed delivery, never
      // reject sendSegmented and turn a successful campaign into HTTP 500.
      failed += batch.length;
      transportErrors += 1;
      console.warn('[FCM] multicast transport failed:', e.message);
    }
  }
  return { sent, failed, configured: true, transportErrors };
}

async function sendPushToAll(title, body, data = {}) {
  // کلِ توکن‌ها یک‌جا خوانده نمی‌شد؛ با چند ده‌هزار کاربر، SELECT بدونِ
  // صفحه‌بندی همه ردیف‌ها را در حافظهٔ پروسه می‌ریخت. حالا با keyset روی
  // u.id دسته‌دسته خوانده و ارسال می‌شود.
  const base = `SELECT u.id, u.fcm_token FROM users u
                 WHERE u.fcm_token IS NOT NULL AND u.fcm_token<>'' AND u.status='active'`;
  const totals = { sent: 0, failed: 0, transportErrors: 0 };
  await forEachUserPage(base, async (rows) => {
    const r = await sendTokens(rows.map(x => x.fcm_token), title, body, data);
    totals.sent += r.sent || 0;
    totals.failed += r.failed || 0;
    totals.transportErrors += r.transportErrors || 0;
  });
  return { ...totals, configured: true };
}

// ── صفحه‌بندیِ keyset روی شناسهٔ کاربر ────────────────────────────────
// حافظه را به یک صفحهٔ PUSH_PAGE_SIZE ردیفی محدود می‌کند. `base` باید
// u.id و u.fcm_token را برگرداند و شرط‌هایش روی سطحِ بیرونی باشند تا
// افزودنِ `AND u.id > $cursor` معتبر بماند.
const PUSH_PAGE_SIZE = 2000;
async function forEachUserPage(base, onPage) {
  let cursor = null;
  for (;;) {
    const params = [PUSH_PAGE_SIZE];
    let where = '';
    if (cursor) { params.push(cursor); where = ` AND u.id > $${params.length}`; }
    const { rows } = await pool.query(
      `${base}${where} ORDER BY u.id LIMIT $1`, params);
    if (!rows.length) break;
    await onPage(rows);
    if (rows.length < PUSH_PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
}

const SEGMENTS = Object.freeze([
  'all', 'inactive_3d', 'top20_league', 'near_cash_reward',
  'plus_users', 'free_users',
]);

function segmentSql(segment) {
  const base = "u.status='active'";
  switch (segment) {
    case 'all':
      return `SELECT u.id,u.fcm_token FROM users u WHERE ${base}`;
    case 'inactive_3d':
      // users.updated_at پروفایل را می‌سنجد، نه فعالیت. آخرین رخداد واقعی از
      // چهار منبع داغ خوانده می‌شود؛ نبودِ هر رخداد هم غیرفعال محسوب می‌شود.
      return `SELECT u.id,u.fcm_token FROM users u
               WHERE ${base}
                 AND GREATEST(
                   u.joined_at,
                   COALESCE((SELECT MAX(p.created_at) FROM point_transactions p WHERE p.user_id=u.id), '-infinity'),
                   COALESCE((SELECT MAX(c.sent_at) FROM chat_messages c WHERE c.user_id=u.id), '-infinity'),
                   COALESCE((SELECT MAX(g.created_at) FROM game_results g WHERE g.user_id=u.id), '-infinity'),
                   COALESCE((SELECT MAX(w.created_at) FROM wheel_spins w WHERE w.user_id=u.id), '-infinity')
                 ) < NOW() - INTERVAL '3 days'`;
    case 'top20_league':
      return `SELECT u.id,u.fcm_token FROM users u
               JOIN (
                 SELECT e.user_id
                   FROM league_leaderboard_entries e
                   JOIN league_seasons s ON s.id=e.league_season_id
                  WHERE s.status='active' AND s.league_type='monthly'
                  ORDER BY e.points DESC, e.updated_at ASC LIMIT 20
               ) topu ON topu.user_id=u.id
              WHERE ${base}`;
    case 'near_cash_reward':
      return `SELECT u.id,u.fcm_token FROM users u
               WHERE ${base} AND EXISTS (
                 SELECT 1 FROM reward_tiers r
                  WHERE r.is_active=true AND r.reward_type='cash'
                    AND r.required_points > u.current_points
                    AND r.required_points - u.current_points <= 100
               )`;
    case 'plus_users':
      return `SELECT u.id,u.fcm_token FROM users u
               WHERE ${base} AND EXISTS (
                 SELECT 1 FROM user_subscriptions s
                  WHERE s.user_id=u.id AND s.expires_at>NOW()
               )`;
    case 'free_users':
      return `SELECT u.id,u.fcm_token FROM users u
               WHERE ${base} AND NOT EXISTS (
                 SELECT 1 FROM user_subscriptions s
                  WHERE s.user_id=u.id AND s.expires_at>NOW()
               )`;
    default:
      throw Object.assign(new Error('گروه هدف معتبر نیست'), { status: 400 });
  }
}

/** اعلان درون‌برنامه‌ای + push برای اعضای دقیق یک segment. */
async function sendSegmented({ segment, title, body }) {
  if (!SEGMENTS.includes(segment)) {
    throw Object.assign(new Error('گروه هدف معتبر نیست'), { status: 400 });
  }
  const cleanTitle = String(title || '').trim().slice(0, 160);
  const cleanBody = String(body || '').trim().slice(0, 4000);
  if (!cleanTitle || !cleanBody) {
    throw Object.assign(new Error('عنوان و متن اعلان لازم است'), { status: 400 });
  }

  // صفحه‌بندیِ keyset: نه INSERT میلیون‌ها شناسه در یک آرایه، نه بارگذاریِ
  // همهٔ توکن‌ها در حافظه. هر صفحه در یک رخدادِ یکجا نوشته و دسته‌ای push
  // می‌شود.
  let targetCount = 0;
  const totals = { sent: 0, failed: 0, transportErrors: 0, configured: true };
  await forEachUserPage(segmentSql(segment), async (rows) => {
    targetCount += rows.length;
    if (rows.length) {
      // یک round-trip برای کل صفحه، نه N بار INSERT. هر کاربر ردیف خودش
      // را دارد تا read status یک نفر، اعلان دیگران را خوانده نزند.
      await pool.query(
        `INSERT INTO notifications(user_id,type,title,body)
         SELECT x::uuid,'segmented',$2,$3 FROM unnest($1::uuid[]) AS x`,
        [rows.map(u => u.id), cleanTitle, cleanBody]);
    }
    const r = await sendTokens(
      rows.map(u => u.fcm_token), cleanTitle, cleanBody,
      { type: 'segmented', segment });
    totals.sent += r.sent || 0;
    totals.failed += r.failed || 0;
    totals.transportErrors += r.transportErrors || 0;
    if (r.configured === false) totals.configured = false;
  });
  // لایهٔ وبِ سگمنت هم موازیِ موبایل — پیامِ گروهیِ ادمین نباید
  // فقط-موبایل باشد. شکستِ این لایه کلِ عملیات را شکست نمی‌دهد.
  const webSeg = await sendWebPushSegment(segment, cleanTitle, cleanBody, { type: 'segmented', segment })
    .catch(() => ({ sent: 0, failed: 0 }));

  return {
    segment,
    targetCount,
    pushSent: totals.sent,
    pushFailed: totals.failed,
    pushTransportErrors: totals.transportErrors,
    fcmConfigured: totals.configured,
    webPushSent: webSeg.sent || 0,
    webPushFailed: webSeg.failed || 0,
  };
}

// ── Web Push (اعلانِ مرورگر — VAPID) — ۲۰۲۶-۰۹-۲۲ ──────────────────────
// همان اعلان‌هایی که با FCM به گوشی می‌رود، برای کاربرهای وب هم برود
// (خواستهٔ مالک). اشتراک‌ها در جدولِ web_push_subscriptions (مهاجرتِ ۰۹۵)
// و ارسال با پکیجِ `webpush` + کلیدهای VAPID از .env است. اگر کلیدها
// تنظیم نباشند این لایه **بی‌صدا غیرفعال** است (configured:false) و
// لایهٔ موبایل مثل قبل کار می‌کند — پس نبودِ کلید هرگز اعلانِ واقعی را
// نمی‌شکند. خطاهای ارسال هم فقط warn می‌شوند: پای وب نباید پای موبایل
// را بلوک یا خراب کند.
let webpushLib = null;
let webpushTried = false;
function getWebpush() {
  if (webpushLib) return webpushLib;
  if (webpushTried) return null;
  webpushTried = true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  try {
    const wp = require('web-push');
    wp.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@ghelghelishop.com', pub, priv);
    webpushLib = wp;
    return wp;
  } catch (e) {
    console.warn('[webpush] disabled:', e.message);
    return null;
  }
}

function webPushPublicKey() {
  return getWebpush() ? process.env.VAPID_PUBLIC_KEY : null;
}

const MAX_SUBS_PER_USER = 12;

async function subscribeWebPush(userId, sub) {
  const endpoint = String(sub?.endpoint || '').trim();
  const p256dh = String(sub?.keys?.p256dh || '').trim();
  const authKey = String(sub?.keys?.auth || '').trim();
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1200 || !p256dh || !authKey) {
    throw Object.assign(new Error('اشتراکِ نامعتبر'), { status: 400 });
  }
  await pool.query(
    `INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh,
           auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent`,
    [userId, endpoint, p256dh, authKey, String(sub?.userAgent || '').slice(0, 300) || null]);
  // سقفِ هر کاربر: مرورگر/دستگاهِ کهنه که دیگر استفاده نمی‌شود، به‌مرور
  // جمع می‌شود تا ارسال‌ها بیهوده سنگین نشوند (قدیمی‌ترین‌ها حذف).
  await pool.query(
    `DELETE FROM web_push_subscriptions
      WHERE user_id=$1
        AND id NOT IN (SELECT id FROM web_push_subscriptions
                        WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2)`,
    [userId, MAX_SUBS_PER_USER]);
  return { ok: true };
}

async function unsubscribeWebPush(userId, endpoint) {
  const { rowCount } = await pool.query(
    'DELETE FROM web_push_subscriptions WHERE user_id=$1 AND endpoint=$2',
    [userId, String(endpoint || '')]);
  return { ok: true, removed: rowCount };
}

function webPushPayload(title, body, data) {
  return JSON.stringify({
    title,
    body,
    url: '/',
    data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
  });
}

async function sendToSubs(rows, title, body, data) {
  const wp = getWebpush();
  if (!wp || !rows.length) return { sent: 0, failed: 0 };
  const payload = webPushPayload(title, body, data);
  const results = await Promise.allSettled(rows.map((s) => wp.sendNotification(
    { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)));
  const dead = [];
  let sent = 0; let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { sent += 1; return; }
    failed += 1;
    const code = r.reason?.statusCode;
    // ۴۰۴/۴۱۰ از سرویسِ پوش = اشتراکِ مرده؛ پاکش کن تا دوباره تلاش نشود
    // (همان قاعدهٔ clearInvalidTokens در FCM).
    if (code === 404 || code === 410) dead.push(rows[i].endpoint);
  });
  if (dead.length) {
    await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint = ANY($1::text[])', [dead])
      .catch((e) => console.warn('[webpush] stale cleanup failed:', e.message));
  }
  return { sent, failed };
}

async function sendWebPushToUser(userId, title, body, data = {}) {
  if (!getWebpush()) return { sent: 0, failed: 0, configured: false };
  try {
    const { rows } = await pool.query(
      'SELECT endpoint, p256dh, auth FROM web_push_subscriptions WHERE user_id=$1',
      [userId]);
    const r = await sendToSubs(rows, title, body, data);
    return { ...r, configured: true };
  } catch (e) {
    console.warn('[webpush] user send failed:', e.message);
    return { sent: 0, failed: 1, configured: true };
  }
}

// صفحه‌بندیِ keyset روی اشتراک‌ها — همان الگوی forEachUserPage ولی با
// مکان‌نما روی s.id (uuid) تا broadcastهای بزرگ حافظه نگیرند.
async function forEachSubPage(baseSql, onPage) {
  let cursor = null;
  for (;;) {
    const params = [PUSH_PAGE_SIZE];
    let where = '';
    if (cursor) { params.push(cursor); where = ` AND s.id > $${params.length}`; }
    const { rows } = await pool.query(`${baseSql}${where} ORDER BY s.id LIMIT $1`, params);
    if (!rows.length) break;
    await onPage(rows);
    if (rows.length < PUSH_PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
}

const WEB_SUBS_BASE = `SELECT s.id, s.endpoint, s.p256dh, s.auth
                         FROM web_push_subscriptions s
                         JOIN users u ON u.id = s.user_id AND u.status='active'
                        WHERE true`;

async function sendWebPushToAll(title, body, data = {}) {
  if (!getWebpush()) return { sent: 0, failed: 0, configured: false };
  const totals = { sent: 0, failed: 0 };
  try {
    await forEachSubPage(WEB_SUBS_BASE, async (rows) => {
      const r = await sendToSubs(rows, title, body, data);
      totals.sent += r.sent; totals.failed += r.failed;
    });
  } catch (e) { console.warn('[webpush] broadcast failed:', e.message); }
  return { ...totals, configured: true };
}

async function sendWebPushSegment(segment, title, body, data = {}) {
  if (!getWebpush()) return { sent: 0, failed: 0, configured: false };
  const base = `SELECT s.id, s.endpoint, s.p256dh, s.auth
                  FROM web_push_subscriptions s
                  JOIN (${segmentSql(segment)}) sel ON sel.id = s.user_id
                 WHERE true`;
  const totals = { sent: 0, failed: 0 };
  try {
    await forEachSubPage(base, async (rows) => {
      const r = await sendToSubs(rows, title, body, data);
      totals.sent += r.sent; totals.failed += r.failed;
    });
  } catch (e) { console.warn('[webpush] segment failed:', e.message); }
  return { ...totals, configured: true };
}

module.exports = {
  createNotification,
  subscribeWebPush,
  unsubscribeWebPush,
  sendWebPushToUser,
  sendWebPushToAll,
  sendWebPushSegment,
  webPushPublicKey,
  sendPushToUser,
  sendPushToAll,
  sendSegmented,
  segmentSql,
  SEGMENTS,
  isFirebaseConfigured,
  _testing: { sendTokens, setFirebaseForTests },
};
