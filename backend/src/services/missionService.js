const crypto = require('crypto');
const { pool } = require('../config/db');
const points = require('./pointService');

const DEFINITIONS = Object.freeze([
  { key: 'daily_match', period: 'daily', title: 'گرم‌کردن روزانه', description: 'یک مسابقه را کامل کن', goal: 1, reward: 20, event: 'match_completed' },
  { key: 'daily_share', period: 'daily', title: 'صدای بردت را برسان', description: 'نتیجه یک دوئل را به اشتراک بگذار', goal: 1, reward: 15, event: 'share' },
  { key: 'weekly_matches', period: 'weekly', title: 'پنج نبرد در هفته', description: '۵ مسابقه را تا پایان بازی کن', goal: 5, reward: 80, event: 'match_completed' },
  { key: 'weekly_wins', period: 'weekly', title: 'شکارچی برد', description: '۲ مسابقه آنلاین را ببر', goal: 2, reward: 60, event: 'online_win' },
  { key: 'weekly_rematch', period: 'weekly', title: 'فرصت جبران', description: 'یک نبرد دوباره با همان حریف شروع کن', goal: 1, reward: 30, event: 'rematch' },
]);

function tehranDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = type => parts.find(p => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function isoWeek(dateString) {
  // Noon UTC avoids DST/date-boundary movement; dateString is already the
  // Tehran civil date which is the product's mission boundary.
  const d = new Date(`${dateString}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodKey(period, now = new Date()) {
  const day = tehranDate(now);
  return period === 'weekly' ? isoWeek(day) : day;
}

function referenceUuid(userId, missionKey, period) {
  const hex = crypto.createHash('sha256').update(`${userId}:${missionKey}:${period}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function record(userId, event, amount = 1) {
  const count = Math.min(100, Math.max(1, Math.floor(Number(amount) || 1)));
  const definitions = DEFINITIONS.filter(d => d.event === event);
  await Promise.all(definitions.map(d => pool.query(
    `INSERT INTO user_mission_progress(user_id,mission_key,period_key,progress,updated_at)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(user_id,mission_key,period_key) DO UPDATE SET
       progress=LEAST($5,user_mission_progress.progress+$4), updated_at=NOW()`,
    [userId, d.key, periodKey(d.period), count, d.goal],
  )));
}

async function status(userId) {
  const keys = [...new Set(DEFINITIONS.map(d => periodKey(d.period)))];
  const { rows } = await pool.query(
    `SELECT mission_key,period_key,progress,claimed_at,updated_at
       FROM user_mission_progress
      WHERE user_id=$1 AND period_key=ANY($2::varchar[])`, [userId, keys]);
  const byKey = new Map(rows.map(row => [`${row.mission_key}:${row.period_key}`, row]));
  const missions = DEFINITIONS.map(d => {
    const key = periodKey(d.period);
    const row = byKey.get(`${d.key}:${key}`);
    const progress = Math.min(d.goal, Number(row?.progress || 0));
    return {
      key: d.key, period: d.period, periodKey: key, title: d.title,
      description: d.description, goal: d.goal, reward: d.reward,
      progress, complete: progress >= d.goal, claimed: Boolean(row?.claimed_at),
    };
  });
  return {
    missions,
    daily: missions.filter(m => m.period === 'daily'),
    weekly: missions.filter(m => m.period === 'weekly'),
  };
}

async function claim(userId, missionKey) {
  const definition = DEFINITIONS.find(d => d.key === missionKey);
  if (!definition) throw Object.assign(new Error('ماموریت پیدا نشد'), { status: 404 });
  const key = periodKey(definition.period);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM user_mission_progress
        WHERE user_id=$1 AND mission_key=$2 AND period_key=$3 FOR UPDATE`,
      [userId, missionKey, key]);
    const row = rows[0];
    if (!row || Number(row.progress) < definition.goal) {
      throw Object.assign(new Error('این ماموریت هنوز کامل نشده است'), { status: 409 });
    }
    if (row.claimed_at) throw Object.assign(new Error('پاداش این ماموریت قبلاً دریافت شده است'), { status: 409 });
    await client.query(
      `UPDATE user_mission_progress SET claimed_at=NOW(),updated_at=NOW()
        WHERE user_id=$1 AND mission_key=$2 AND period_key=$3`,
      [userId, missionKey, key]);
    const credited = await points.credit(client, {
      userId,
      points: definition.reward,
      source: 'mission',
      referenceType: 'mission_reward',
      referenceId: referenceUuid(userId, missionKey, key),
      description: `پاداش ماموریت: ${definition.title}`,
      league: false,
    });
    await client.query('COMMIT');
    return {
      message: `${definition.reward} امتیاز ماموریت دریافت شد`,
      reward: definition.reward,
      balance: credited?.balanceAfter,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { DEFINITIONS, tehranDate, isoWeek, periodKey, record, status, claim };
