const { pool } = require('../config/db');
const walletService = require('./walletService');
const { createNotification } = require('./notificationService');

// LEAGUE MONTHS RUN ON THE IRANIAN CALENDAR, IN TEHRAN TIME.
//
// These used to be computed with Date.UTC(), which is wrong twice over:
//
//   * the boundary landed at 03:30 Tehran rather than midnight, so the last
//     3.5 hours of every month were scored into the NEXT one, and
//   * it followed the Gregorian month, not the Persian month the players and
//     the admin panel actually see. A season labelled "مرداد" started and
//     ended on Gregorian dates.
//
// Intl with the persian calendar gives the Jalali date for a moment in
// Tehran; from that we can walk to the exact instant a Persian month starts.
const TZ = 'Asia/Tehran';

const jalaliParts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: TZ,
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
  hour12: false,
});

/** Jalali Y/M/D plus Tehran wall-clock time for an instant. */
function toJalali(date = new Date()) {
  const p = Object.fromEntries(
    jalaliParts.formatToParts(date)
      .filter(x => x.type !== 'literal')
      .map(x => [x.type, Number(x.value)])
  );
  return p; // { year, month, day, hour, minute, second }
}

/**
 * The UTC instant at which a given Jalali year/month begins (midnight Tehran).
 *
 * Done by binary search over time rather than with a conversion formula: ask
 * Intl what the Tehran-local Jalali date is at instant X, and narrow until we
 * find the first millisecond that belongs to the target month. That is
 * automatically correct across leap years and any future DST change, because
 * the calendar authority is the platform, not arithmetic here.
 */
function jalaliMonthStart(jYear, jMonth) {
  const key = jYear * 12 + (jMonth - 1);
  const keyOf = d => { const p = toJalali(d); return p.year * 12 + (p.month - 1); };

  // Bracket the boundary: a point known to be before it and one after.
  // Persian year N starts around 21 March of Gregorian year N+621.
  let lo = Date.UTC(jYear + 620, 2, 1);          // a year early: safely before
  let hi = Date.UTC(jYear + 622, 5, 1);          // safely after

  // Guard against a bad bracket rather than looping forever.
  if (keyOf(new Date(lo)) >= key || keyOf(new Date(hi)) < key) {
    lo = Date.UTC(jYear + 618, 0, 1);
    hi = Date.UTC(jYear + 624, 0, 1);
  }

  // Binary search to the millisecond: lo is always < target month,
  // hi is always >= target month.
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (keyOf(new Date(mid)) < key) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/** e.g. "1405-05" — the Jalali month a moment falls in, Tehran time. */
function currentMonthYear(d = new Date()) {
  const p = toJalali(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/** Start/end instants of the Jalali month containing `d`. */
function monthBounds(d = new Date()) {
  const p = toJalali(d);
  const start = jalaliMonthStart(p.year, p.month);
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const end = jalaliMonthStart(nextYear, nextMonth);
  return { start, end };
}
function defaultPrizeTable() {
  return Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, amount: 0 }));
}
/**
 * Repairs a season whose bounds were computed with the old Gregorian/UTC
 * maths.
 *
 * Seasons created before the calendar fix are labelled like "2026-07" and run
 * 00:00 UTC to 00:00 UTC — i.e. 03:30 Tehran, mid-Jalali-month. Left alone
 * they would close on the wrong day and display a month name that does not
 * match the dates.
 *
 * The row is updated IN PLACE so leaderboard entries (which reference the
 * season id) keep their points. Seasons that already paid out are never
 * touched: rewriting settled history would be worse than a wrong label.
 */
async function repairSeasonBounds(client, season) {
  // ── تاریخِ دستیِ مدیر دست‌نخورده می‌ماند ──
  //
  // خواستهٔ مالک: «تاریخ و پایان لیگ توسط مدیر مشخص میشه در پنل های
  // مدیریت کل پلتفرم».
  //
  // ⚠️ بدونِ این نگهبان، هر تاریخی که مدیر بگذارد در **اولین درخواستِ
  //    بعدی** بازنویسی می‌شد: این تابع تاریخ‌ها را از تقویمِ شمسی
  //    دوباره می‌سازد. یعنی قابلیت ظاهراً کار می‌کرد (پنل ذخیره
  //    می‌کرد، پیامِ موفقیت می‌آمد) ولی چند ثانیه بعد بی‌صدا برمی‌گشت
  //    — بدترین نوعِ باگ چون کاربر فکر می‌کند دیوانه شده.
  if (season.manual_dates) return season;

  const looksGregorian = /^20\d\d-/.test(season.month_year || '');
  if (!looksGregorian || season.paid_at) return season;

  const { start, end } = monthBounds(new Date(season.starts_at));
  const label = currentMonthYear(new Date(season.starts_at));

  // A correctly-labelled season for this month may already exist (e.g. the
  // job ran on a newer deploy first); in that case leave well alone rather
  // than colliding with the UNIQUE(month_year) constraint.
  const clash = await client.query(
    'SELECT id FROM league_seasons WHERE month_year=$1 AND id<>$2',
    [label, season.id]);
  if (clash.rows[0]) return season;

  const { rows } = await client.query(
    `UPDATE league_seasons
        SET month_year=$2, starts_at=$3, ends_at=$4,
            timezone='Asia/Tehran', updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [season.id, label, start, end]);
  console.log(
    `[league] season ${season.month_year} re-based to Jalali ${label} ` +
    `(${start.toISOString()} → ${end.toISOString()})`);
  return rows[0];
}

async function ensureActiveSeason(client = pool) {
  const { rows } = await client.query("SELECT * FROM league_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1");
  if (rows[0]) return repairSeasonBounds(client, rows[0]);
  const { start, end } = monthBounds();
  const my = currentMonthYear();
  const inserted = await client.query(
    `INSERT INTO league_seasons(month_year, starts_at, ends_at, status, prize_table)
     VALUES ($1,$2,$3,'active',$4) ON CONFLICT (month_year) DO UPDATE SET status='active' RETURNING *`,
    [my, start, end, JSON.stringify(defaultPrizeTable())]
  );
  return inserted.rows[0];
}
async function addLeaguePoints(client, userId, points) {
  const season = await ensureActiveSeason(client);
  await client.query(
    `INSERT INTO league_leaderboard_entries(league_season_id,user_id,points)
     VALUES($1,$2,$3)
     ON CONFLICT(league_season_id,user_id)
     DO UPDATE SET points=league_leaderboard_entries.points + EXCLUDED.points, updated_at=NOW()`,
    [season.id, userId, points]
  );
}
async function getLeaderboard(limit = 100, seasonId = null) {
  const { rows: activeSeasons } = await pool.query(
    "SELECT id, title, league_type, month_year, starts_at, ends_at, status, prize_table, min_points_entry, plus_only FROM league_seasons WHERE status='active' ORDER BY starts_at ASC"
  );
  let season = null;
  if (seasonId) {
    season = activeSeasons.find(s => s.id === seasonId);
    if (!season) {
      const sRow = await pool.query("SELECT id, title, league_type, month_year, starts_at, ends_at, status, prize_table, min_points_entry, plus_only FROM league_seasons WHERE id=$1", [seasonId]);
      season = sRow.rows[0] || null;
    }
  }
  if (!season) {
    season = activeSeasons[0] || (await ensureActiveSeason(pool));
  }

  // برندگان دوره قبلی لیگ
  const { rows: prevWinners } = await pool.query(`
    SELECT p.rank, p.amount AS prize_amount, p.paid_at,
           u.id AS user_id, u.nickname, u.first_name, u.last_name, u.profile_image_url, u.profile_avatar_key,
           s.title AS season_title, s.month_year
      FROM league_payouts p
      JOIN users u ON u.id = p.user_id
      JOIN league_seasons s ON s.id = p.league_season_id
     WHERE s.status = 'closed' OR s.id <> $1
     ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC, p.rank ASC
     LIMIT 10
  `, [season.id]);

  const { rows } = await pool.query(
    `SELECT e.user_id, e.points,
            u.nickname, u.first_name, u.last_name, u.profile_image_url, u.profile_avatar_key,
            DENSE_RANK() OVER(ORDER BY e.points DESC) AS rank
       FROM league_leaderboard_entries e
       JOIN users u ON u.id=e.user_id
      WHERE e.league_season_id=$1 AND u.status='active'
      ORDER BY e.points DESC LIMIT $2`,
    [season.id, limit]
  );
  return {
    season,
    activeLeagues: activeSeasons.length ? activeSeasons : [season],
    entries: rows,
    previousWinners: prevWinners,
  };
}
async function closeActiveSeason({ force = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the season row so two concurrent runs (a cron overlapping a manual
    // admin trigger) cannot both pay out the same month.
    const season = await ensureActiveSeason(client);
    const locked = await client.query(
      'SELECT status, ends_at FROM league_seasons WHERE id=$1 FOR UPDATE', [season.id]);
    if (locked.rows[0]?.status === 'closed') {
      await client.query('COMMIT');
      return { seasonId: season.id, winners: 0, skipped: 'already closed' };
    }
    // Refuse to close a season early unless explicitly forced. A misfiring
    // cron in the middle of the month would otherwise wipe every player's
    // monthly points and hand out prizes for a half-finished league.
    const endsAt = locked.rows[0]?.ends_at;
    if (!force && endsAt && new Date(endsAt) > new Date()) {
      await client.query('COMMIT');
      return { seasonId: season.id, winners: 0, skipped: 'season still running' };
    }
    const setting = await client.query("SELECT value FROM app_settings WHERE key='league_winner_count' LIMIT 1");
    const rawWinnerCount = setting.rows[0]?.value;
    const winnerCount = Number.isFinite(Number(rawWinnerCount)) && Number(rawWinnerCount) > 0 ? Math.floor(Number(rawWinnerCount)) : Math.max(10, (season.prize_table || []).length || 10);
    const { rows: leaders } = await client.query(
      `SELECT e.user_id, e.points, DENSE_RANK() OVER(ORDER BY e.points DESC) AS rank
       FROM league_leaderboard_entries e WHERE e.league_season_id=$1 ORDER BY e.points DESC LIMIT $2`,
      [season.id, winnerCount]
    );
    // دفاع لایه‌دوم: ورودی از API حالا اعتبارسنجی می‌شود، ولی جدول‌های
    // ذخیره‌شدهٔ قدیمی (یا ویرایش مستقیم در دیتابیس) ممکن است هنوز مبلغ
    // منفی/NaN داشته باشند. یک مقدار بد نباید **کل بستن لیگ** را بخواباند
    // و همهٔ برنده‌ها را بی‌جایزه بگذارد — بازتولید شد: قید
    // league_payouts_amount_check می‌شکست و فصل «active» می‌ماند.
    // پس مقدار نامعتبر را به صفر تبدیل می‌کنیم و هشدار می‌دهیم.
    const prizeMap = new Map();
    for (const p of season.prize_table || []) {
      const rank = Number(p?.rank);
      let amount = Number(p?.amount ?? 0);
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
        console.error(`[league] جایزهٔ نامعتبر برای رتبهٔ ${p?.rank} (${p?.amount}) — صفر در نظر گرفته شد`);
        amount = 0;
      }
      if (Number.isFinite(rank)) prizeMap.set(rank, amount);
    }
  // برندگانی که باید بعد از COMMIT خبردار شوند.
  const winnersToNotify = [];
    let credited = 0;
    let creditedUsers = 0;
    for (const entry of leaders) {
      const amount = prizeMap.get(Number(entry.rank)) || 0;
      // TIE HANDLING.
      // DENSE_RANK gives tied players the same rank, which is correct. The
      // conflict target used to be (season, rank), so on a tie for 3rd place
      // the second player's insert hit ON CONFLICT DO NOTHING and their prize
      // vanished with no error. The real invariant is one payout per USER per
      // season — see migration 014.
      const payout = await client.query(
        `INSERT INTO league_payouts(league_season_id,user_id,rank,amount)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(league_season_id, user_id) DO UPDATE
           SET rank = EXCLUDED.rank, amount = EXCLUDED.amount
         RETURNING id, paid_at`,
        [season.id, entry.user_id, entry.rank, amount]
      );
      await client.query('UPDATE league_leaderboard_entries SET rank=$1 WHERE league_season_id=$2 AND user_id=$3', [entry.rank, season.id, entry.user_id]);

      // PERMANENT PROFILE RECORD.
      //
      // monthly_league_points is wiped below, and the leaderboard belongs to
      // a season nobody will look at again. Without this row the user has no
      // way to see "I finished 3rd in Mordad and won 100,000" once the new
      // month starts — which the product explicitly wants on the profile.
      await client.query(
        `INSERT INTO user_league_history
           (user_id, season_id, month_year, rank, points, prize_amount)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, season_id) DO UPDATE
           SET rank = EXCLUDED.rank,
               points = EXCLUDED.points,
               prize_amount = EXCLUDED.prize_amount`,
        [entry.user_id, season.id, season.month_year,
         entry.rank, entry.points, amount]);

      // PAY THE WINNER.
      //
      // This step did not exist: closing a season wrote a league_payouts row
      // and stopped there, so the prize was recorded but the money never
      // reached anyone's wallet. Nobody had actually been paid.
      //
      // walletService.credit is idempotent on (source, reference_id), so a
      // re-run of the close job — or a retry after a crash mid-transaction —
      // cannot pay the same rank twice.
      // ═══════════════════════════════════════════════════════════════
      // ⚠️ واریزِ خودکار **حذف شد** — حالا تأییدِ مدیر لازم است
      // ═══════════════════════════════════════════════════════════════
      //
      // ── خواستهٔ مالک ──
      //
      //   «جوایز لیگ بعد از تایید مدیریت به کیف پول ها داده میشه»
      //
      // ── چرا این تغییر درست است ──
      //
      // بستنِ فصل ممکن است با تقلب، باگ، یا دادهٔ خرابِ جدولِ رتبه‌بندی
      // همراه باشد. تا امروز پول **در همان لحظه** به کیف پول می‌رفت و
      // چون کاربر می‌توانست فوراً درخواستِ برداشت بدهد، عملاً
      // برگشت‌ناپذیر بود.
      //
      // حالا فصل بسته می‌شود، رتبه‌ها و مبالغ ثبت می‌شوند، ولی پول
      // منتظرِ تأییدِ مدیر می‌ماند. مدیر جدول را می‌بیند، اگر چیزی
      // مشکوک بود اصلاحش می‌کند، و بعد آزاد می‌کند.
      //
      // مسیرِ تأیید: POST /api/admin/league/payouts/:id/approve
      //              POST /api/admin/league/payouts/approve-all
      //
      // ⚠️ `winnersToNotify` هم اینجا پر **نمی‌شود**. اعلانِ «جایزه به
      //    کیف پولت واریز شد» باید در لحظهٔ واریزِ واقعی برود، نه در
      //    لحظهٔ بستنِ فصل — وگرنه کاربر کیف پولش را باز می‌کند و
      //    چیزی نمی‌بیند.
      //
      //    به‌جایش یک اعلانِ متفاوت می‌رود: «رتبه‌ات مشخص شد».
      if (amount > 0) {
        winnersToNotify.push({
          userId: entry.user_id,
          rank: entry.rank,
          amount,
          monthYear: season.month_year,
          pendingApproval: true,
        });
      }
    }
    await client.query(
      "UPDATE league_seasons SET status='closed', paid_at=NOW(), updated_at=NOW() WHERE id=$1",
      [season.id]);
    // Reset ONLY the monthly counter. current_points (spendable) and
    // lifetime_points (history) are untouched: a user's saved-up points and
    // their all-time total must survive the month rolling over.
    await client.query('UPDATE users SET monthly_league_points=0, updated_at=NOW()');
    await client.query('COMMIT');

    // ═════════════════════════════════════════════════════════════════════
    // اعلانِ برندگان — **بعد از** COMMIT، نه داخل تراکنش
    // ═════════════════════════════════════════════════════════════════════
    //
    // درخواست مالک: «اخر ماه وقتی لیگ تموم میشه فردی جایزه ای ببره،
    // زنگوله نوتیفیکیشن قرمز بشه».
    //
    // این مرحله اصلاً وجود نداشت: پول به کیف پول واریز می‌شد ولی هیچ
    // خبری به برنده نمی‌رسید. کاربر فقط اگر تصادفاً کیف پولش را باز
    // می‌کرد می‌فهمید برنده شده — یعنی بهترین لحظهٔ اپ، بی‌صدا رد
    // می‌شد.
    //
    // چرا بعد از COMMIT و نه داخلش:
    //
    //   ۱. اگر داخل تراکنش بود و نوشتنِ یک اعلان شکست می‌خورد، کلِ
    //      بستنِ فصل rollback می‌شد — یعنی هیچ‌کس پولش را نمی‌گرفت
    //      چون یک ردیفِ اعلان ننشست. معاملهٔ بدی است.
    //   ۲. اعلان‌ها تراکنشی نیستند و نباید قفلِ جدولِ کاربران را
    //      طولانی‌تر کنند.
    //
    // خطاها عمداً بلعیده می‌شوند: پول از قبل واریز شده و آن مهم‌تر
    // است؛ یک اعلانِ از‌دست‌رفته آزاردهنده است، نه فاجعه.
    for (const w of winnersToNotify) {
      // ⚠️ متنِ اعلان با تغییرِ «تأییدِ مدیر» عوض شد.
      //
      // قبلاً می‌گفت «به کیف پول واریز شد» — که حالا **دروغ** است، چون
      // پول منتظرِ تأییدِ مدیر می‌ماند. کاربری که این پیام را ببیند و
      // کیف پولش خالی باشد، مستقیم به پشتیبانی می‌رود.
      createNotification(
        w.userId,
        'league',
        `🏆 رتبهٔ ${w.rank} لیگ ${w.monthYear}`,
        w.pendingApproval
          ? `تبریک! رتبهٔ ${w.rank} را گرفتی. جایزهٔ `
            + `${w.amount.toLocaleString('fa-IR')} تومانی پس از بررسی و `
            + 'تأیید نهایی به کیف پولت واریز می‌شود.'
          : `تبریک! جایزهٔ ${w.amount.toLocaleString('fa-IR')} تومانی شما `
            + 'به کیف پول واریز شد.',
      ).catch((e) => console.error('[league] notify failed:', e.message));
    }

    return {
      seasonId: season.id,
      winners: leaders.length,
      credited,
      creditedUsers,
      // برای پنل: چند جایزه منتظرِ تأیید است.
      pendingApproval: winnersToNotify.length,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
/**
 * جایزهٔ لیگ را پس از تأییدِ مدیر به کیف پول واریز می‌کند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این تابع وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «جوایز لیگ بعد از تایید مدیریت به کیف پول ها داده میشه».
 *
 * `closeActiveSeason` دیگر پول نمی‌دهد؛ فقط رتبه و مبلغ را ثبت می‌کند.
 * پول از اینجا آزاد می‌شود.
 *
 * ── سه محافظ ──
 *
 *   ۱. **قفلِ ردیف** (`FOR UPDATE`): دو مدیر که هم‌زمان دکمه بزنند
 *      نباید دو بار واریز کنند.
 *   ۲. **بررسیِ `paid_at`**: حتی با قفل، اگر یکی قبلاً پرداخته باشد
 *      دومی باید بی‌صدا رد شود نه اینکه خطا بدهد.
 *   ۳. **بی‌اثریِ `walletService.credit`** روی
 *      `(source, reference_id)`: لایهٔ سومِ دفاع، در خودِ دفترِ کل.
 *
 * سه لایه برای یک چیز زیاد به نظر می‌رسد، ولی این پولِ واقعی است و
 * برگشتش از کیفِ کاربری که برداشت کرده عملاً ناممکن است.
 *
 * @param {string|null} payoutId  یک جایزه، یا null برای همهٔ تأییدنشده‌ها
 * @param {string} adminId
 * @returns {Promise<{paid:number, amount:number, skipped:number}>}
 */
async function approvePayouts(payoutId, adminId) {
  const client = await pool.connect();
  const notify = [];
  let paid = 0;
  let total = 0;
  let skipped = 0;
  try {
    await client.query('BEGIN');
    const { rows } = payoutId
      ? await client.query(
        `SELECT p.*, s.month_year FROM league_payouts p
           JOIN league_seasons s ON s.id = p.league_season_id
          WHERE p.id = $1 FOR UPDATE OF p`, [payoutId])
      : await client.query(
        `SELECT p.*, s.month_year FROM league_payouts p
           JOIN league_seasons s ON s.id = p.league_season_id
          WHERE p.paid_at IS NULL AND p.amount > 0
          ORDER BY p.created_at FOR UPDATE OF p`);

    for (const p of rows) {
      if (p.paid_at) { skipped += 1; continue; }
      const amount = Number(p.amount || 0);
      if (amount <= 0) { skipped += 1; continue; }

      const res = await walletService.credit(client, {
        userId: p.user_id,
        amount,
        source: 'league',
        referenceType: 'league_payout',
        referenceId: p.id,
        description: `جایزهٔ لیگ ${p.month_year} — رتبهٔ ${p.rank}`,
      });
      await client.query(
        `UPDATE league_payouts
            SET paid_at = NOW(), payment_status = 'paid',
                approved_by = $2, approved_at = NOW()
          WHERE id = $1`, [p.id, adminId]);
      if (!res.duplicate) {
        paid += 1;
        total += amount;
        notify.push({ userId: p.user_id, amount, rank: p.rank,
          monthYear: p.month_year });
      } else {
        skipped += 1;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // اعلان **بعد از** COMMIT: اگر تراکنش برگردد، کاربر نباید پیامِ
  // واریزی بگیرد که رخ نداده.
  for (const n of notify) {
    createNotification(
      n.userId, 'league',
      `💰 جایزهٔ لیگ ${n.monthYear} واریز شد`,
      `جایزهٔ رتبهٔ ${n.rank} به مبلغ ${n.amount.toLocaleString('fa-IR')} `
      + 'تومان به کیف پول شما واریز شد.',
    ).catch((e) => console.error('[league] payout notify failed:', e.message));
  }
  return { paid, amount: total, skipped };
}

module.exports = {
  ensureActiveSeason, addLeaguePoints, getLeaderboard, closeActiveSeason,
  defaultPrizeTable, approvePayouts,
};
