const { pool } = require('../config/db');
const points = require('./pointService');

// A complete seven-day cycle. The final day is intentionally a little more
// generous so the user has a reason to finish the week.
const REWARDS = Object.freeze([100, 150, 200, 250, 300, 350, 500]);
const CYCLE_DAYS = REWARDS.length;
// The claim path is covered by the same migration/reset contract as the points ledger.

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function tehranDay(date = new Date()) {
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDay(day) {
  const d = new Date(`${day}T12:00:00+03:30`);
  d.setUTCDate(d.getUTCDate() - 1);
  return tehranDay(d);
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return tehranDay(new Date(value));
}

function cycleDayAfter(day) {
  return day >= CYCLE_DAYS ? 1 : day + 1;
}

function nextClaimDay(row, today) {
  if (!row?.last_claimed_date) return 1;
  const last = dateValue(row.last_claimed_date);
  if (last === previousDay(today)) {
    return cycleDayAfter(Number(row.streak_day) || 0);
  }
  return 1;
}

function publicStatus(row, today = tehranDay()) {
  const last = dateValue(row?.last_claimed_date);
  const claimedToday = last === today;
  const savedDay = Math.min(CYCLE_DAYS, Math.max(0, Number(row?.streak_day) || 0));
  const claimDay = claimedToday ? savedDay : nextClaimDay(row, today);
  // A completed day-seven cycle starts a fresh visual cycle tomorrow.
  // Keep the next claim on day one instead of showing all seven old pills
  // as already claimed while day one is waiting.
  const currentDay = claimedToday
    ? savedDay
    : (last === previousDay(today) && savedDay < CYCLE_DAYS ? savedDay : 0);

  return {
    active: true,
    claimedToday,
    canClaim: !claimedToday,
    currentDay,
    nextDay: claimDay,
    nextReward: REWARDS[claimDay - 1],
    totalClaims: Number(row?.total_claims) || 0,
    today,
    rewards: REWARDS.map((amount, index) => ({
      day: index + 1,
      amount,
      claimed: claimedToday ? index + 1 <= savedDay : index + 1 <= currentDay,
      current: index + 1 === claimDay,
    })),
  };
}

async function status(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT user_id, streak_day, last_claimed_date, total_claims
       FROM login_streaks WHERE user_id=$1`,
    [userId],
  );
  return publicStatus(rows[0] || null);
}

async function claim(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT user_id, streak_day, last_claimed_date, total_claims
         FROM login_streaks WHERE user_id=$1 FOR UPDATE`,
      [userId],
    );
    const today = tehranDay();
    const row = rows[0] || null;

    if (dateValue(row?.last_claimed_date) === today) {
      await client.query('COMMIT');
      return { ...(publicStatus(row, today)), claimedNow: false };
    }

    const day = nextClaimDay(row, today);
    const reward = REWARDS[day - 1];
    const updated = await client.query(
      `INSERT INTO login_streaks(user_id, streak_day, last_claimed_date, total_claims)
       VALUES($1,$2,$3,1)
       ON CONFLICT(user_id) DO UPDATE SET
         streak_day = EXCLUDED.streak_day,
         last_claimed_date = EXCLUDED.last_claimed_date,
         total_claims = login_streaks.total_claims + 1,
         updated_at = NOW()
       RETURNING user_id, streak_day, last_claimed_date, total_claims`,
      [userId, day, today],
    );

    await points.credit(client, {
      userId,
      points: reward,
      source: 'login_streak',
      referenceType: 'login_streaks',
      referenceId: userId,
      description: `پاداش ورود روز ${day} از استریک هفت‌روزه`,
      // Login rewards are engagement rewards, not competitive game points.
      league: false,
    });

    await client.query('COMMIT');
    return {
      ...publicStatus(updated.rows[0], today),
      claimedNow: true,
      claimedDay: day,
      claimedReward: reward,
      message: `روز ${day}: ${reward.toLocaleString('fa-IR')} امتیاز به حسابت اضافه شد`,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { REWARDS, CYCLE_DAYS, status, claim, tehranDay };
