const crypto = require('crypto');
const { pool } = require('../config/db');

const EVENTS = new Set([
  'match_started', 'match_completed', 'rematch', 'share', 'friend_challenge',
]);
const PLATFORMS = new Set(['server', 'web', 'android', 'ios', 'unknown']);
const CRASH_PLATFORMS = new Set(['backend', 'web', 'android', 'ios', 'unknown']);

function cleanText(value, max) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b09\d{9}\b/g, '[mobile]')
    .replace(/[?&](token|password|secret|key)=[^&\s]+/gi, '$1=[redacted]')
    .slice(0, max);
}

function safeObject(value, maxBytes = 3000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const json = JSON.stringify(value, (key, child) => {
    if (/token|password|secret|authorization|card|sheba/i.test(key)) return '[redacted]';
    if (typeof child === 'string') return cleanText(child, 500);
    return child;
  });
  if (Buffer.byteLength(json, 'utf8') > maxBytes) return { truncated: true };
  return JSON.parse(json);
}

async function record(userId, eventName, {
  platform = 'server', gameId = null, matchId = null, metadata = {}, client = pool,
} = {}) {
  if (!EVENTS.has(eventName)) throw Object.assign(new Error('رویداد تحلیلی نامعتبر است'), { status: 400 });
  const p = PLATFORMS.has(platform) ? platform : 'unknown';
  await client.query(
    `INSERT INTO analytics_events(user_id,event_name,platform,game_id,match_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [userId || null, eventName, p, gameId ? String(gameId).slice(0, 32) : null,
      matchId || null, JSON.stringify(safeObject(metadata))],
  );
}

async function reportCrash({
  userId = null, platform = 'unknown', source = null, release = null,
  message, stack = null, context = {}, client = pool,
}) {
  const cleanMessage = cleanText(message, 2000) || 'Unknown error';
  const cleanStack = cleanText(stack, 10000) || null;
  const p = CRASH_PLATFORMS.has(platform) ? platform : 'unknown';
  const hash = crypto.createHash('sha256')
    .update(`${p}\n${cleanMessage}\n${(cleanStack || '').split('\n').slice(0, 4).join('\n')}`)
    .digest('hex');
  const { rows } = await client.query(
    `INSERT INTO app_crash_reports
       (user_id,platform,source,release,error_hash,message,stack,context)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [userId, p, cleanText(source, 80) || null, cleanText(release, 80) || null,
      hash, cleanMessage, cleanStack, JSON.stringify(safeObject(context))],
  );
  return { id: rows[0].id };
}

async function summary(days = 30) {
  const period = Math.min(90, Math.max(1, Number(days) || 30));
  const [totals, daily, crashes, openCrashCount] = await Promise.all([
    pool.query(
      `SELECT event_name, COUNT(*)::int AS total,
              COUNT(DISTINCT user_id)::int AS users
         FROM analytics_events
        WHERE created_at >= NOW() - ($1::text || ' days')::interval
        GROUP BY event_name`, [period]),
    pool.query(
      `SELECT created_at::date AS day, event_name, COUNT(*)::int AS total
         FROM analytics_events
        WHERE created_at >= NOW() - ($1::text || ' days')::interval
        GROUP BY created_at::date,event_name ORDER BY day`, [period]),
    pool.query(
      `SELECT error_hash, platform, MIN(message) AS message,
              COUNT(*)::int AS occurrences, MAX(created_at) AS last_seen,
              COUNT(DISTINCT user_id)::int AS affected_users
         FROM app_crash_reports
        WHERE created_at >= NOW() - ($1::text || ' days')::interval
          AND status='open'
        GROUP BY error_hash,platform ORDER BY COUNT(*) DESC,MAX(created_at) DESC LIMIT 30`, [period]),
    pool.query("SELECT COUNT(*)::int AS n FROM app_crash_reports WHERE status='open'"),
  ]);
  const byName = Object.fromEntries(totals.rows.map(r => [r.event_name, {
    total: r.total, users: r.users,
  }]));
  const started = byName.match_started?.total || 0;
  const completed = byName.match_completed?.total || 0;
  return {
    days: period,
    events: byName,
    funnel: {
      started,
      completed,
      completionRate: started ? Math.round((completed / started) * 1000) / 10 : 0,
      rematchRate: completed ? Math.round(((byName.rematch?.total || 0) / completed) * 1000) / 10 : 0,
      shareRate: completed ? Math.round(((byName.share?.total || 0) / completed) * 1000) / 10 : 0,
    },
    daily: daily.rows,
    crashes: crashes.rows,
    openCrashCount: openCrashCount.rows[0]?.n || 0,
  };
}

async function resolveCrash(id, status) {
  if (!['resolved', 'ignored', 'open'].includes(status)) {
    throw Object.assign(new Error('وضعیت گزارش خطا معتبر نیست'), { status: 400 });
  }
  const { rows } = await pool.query(
    `UPDATE app_crash_reports SET status=$2,
       resolved_at=CASE WHEN $2='open' THEN NULL ELSE NOW() END
     WHERE id=$1 RETURNING id,status`, [id, status]);
  if (!rows[0]) throw Object.assign(new Error('گزارش خطا پیدا نشد'), { status: 404 });
  return rows[0];
}

module.exports = { EVENTS, record, reportCrash, summary, resolveCrash, safeObject };
