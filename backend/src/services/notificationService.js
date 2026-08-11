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

async function createNotification(userId, type, title, body) {
  const cleanTitle = String(title || '').trim().slice(0, 160);
  const cleanBody = String(body || '').trim().slice(0, 4000);
  if (!cleanTitle || !cleanBody) {
    throw Object.assign(new Error('عنوان و متن اعلان لازم است'), { status: 400 });
  }
  const { rows } = await pool.query(
    'INSERT INTO notifications(user_id,type,title,body) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId || null, type, cleanTitle, cleanBody]
  );
  if (userId) await sendPushToUser(userId, cleanTitle, cleanBody, { type });
  else await sendPushToAll(cleanTitle, cleanBody, { type });
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
  const { rows } = await pool.query(
    "SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND fcm_token<>'' AND status='active'");
  return sendTokens(rows.map(r => r.fcm_token), title, body, data);
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

  const { rows: users } = await pool.query(segmentSql(segment));
  if (users.length) {
    // یک round-trip، نه N بار INSERT. هر کاربر ردیف خودش را دارد تا read
    // status یک نفر، اعلان دیگران را خوانده علامت نزند.
    await pool.query(
      `INSERT INTO notifications(user_id,type,title,body)
       SELECT x::uuid,'segmented',$2,$3 FROM unnest($1::uuid[]) AS x`,
      [users.map(u => u.id), cleanTitle, cleanBody]);
  }
  const push = await sendTokens(
    users.map(u => u.fcm_token), cleanTitle, cleanBody,
    { type: 'segmented', segment });
  return {
    segment,
    targetCount: users.length,
    pushSent: push.sent,
    pushFailed: push.failed,
    pushTransportErrors: push.transportErrors || 0,
    fcmConfigured: push.configured,
  };
}

module.exports = {
  createNotification,
  sendPushToUser,
  sendPushToAll,
  sendSegmented,
  segmentSql,
  SEGMENTS,
  isFirebaseConfigured,
  _testing: { sendTokens, setFirebaseForTests },
};
