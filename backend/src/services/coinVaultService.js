// ═══════════════════════════════════════════════════════════════════════
// «صندوق سکه» — سکهٔ ماندگار و انتخابِ خودِ کاربر
// ═══════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک (۱۴۰۵/۰۷/۰۲) ─────────────────────────────────────────
//
// «یه قسمت جدید به نام صندوق سکه… مجموع سکه موقت در لیگ جاری رو نشون
//  می‌ده، و یه قسمت هم سکه بدست آمده که اون ۱۰ درصد سکه بعد پایان لیگ
//  ذخیره بشه داخلش و دیگه به لیگ جدید منتقل نشه. این تب این امکان رو به
//  کاربر می‌ده که خودش با انتخاب خودش سکه بدست اومده رو به هر لیگ در
//  جریانی که خواست واریز کنه.»
//
// ── دو نوع سکه، و چرا نباید قاطی شوند ─────────────────────────────────
//
//   • «سکهٔ موقتِ لیگ» (`league_leaderboard_entries.coins`)
//     در یک لیگِ مشخص زندگی می‌کند، رتبه می‌سازد، و با پایانِ آن لیگ
//     می‌میرد. شمارندهٔ نمایشی‌اش `users.coins` است.
//
//   • «سکهٔ بدست‌آمده» (`users.vault_coins`)
//     درصدی از سکهٔ لیگِ پایان‌یافته. نمی‌میرد، رتبه نمی‌سازد، و تا وقتی
//     کاربر تصمیم نگیرد در هیچ لیگی نیست.
//
// واریز از صندوق به لیگ، سکه را از دستهٔ دوم به دستهٔ اول می‌برد — یعنی
// از «ماندگار» به «موقت». برگشت‌پذیر نیست و کاربر باید قبلش بداند.

const { pool } = require('../config/db');
const { cacheDelPrefix } = require('../lib/cache');

function fail(message, status = 400, code = null) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

/**
 * نمای کاملِ تب: موجودیِ صندوق + سکهٔ موقتِ هر لیگِ فعال.
 *
 * هر دو عدد از **منبعِ حقیقت** خوانده می‌شوند
 * (`league_leaderboard_entries`), نه از شمارندهٔ نمایشیِ `users.coins` —
 * چون آن شمارنده می‌تواند موقتاً از جمعِ لیگ‌ها عقب بماند و کاربر دو
 * عددِ متفاوت برای یک چیز ببیند.
 */
async function overview(userId) {
  const { rows: userRows } = await pool.query(
    'SELECT vault_coins FROM users WHERE id=$1', [userId]);
  if (!userRows[0]) throw fail('کاربر پیدا نشد', 404);

  const { rows: leagues } = await pool.query(
    `SELECT s.id, s.title, s.month_year, s.ends_at, s.league_type,
            COALESCE(e.coins, 0)::bigint AS my_coins,
            COALESCE(e.points, 0)::bigint AS my_points
       FROM league_seasons s
       LEFT JOIN league_leaderboard_entries e
              ON e.league_season_id = s.id AND e.user_id = $1
      WHERE s.status='active' AND s.starts_at <= NOW() AND s.ends_at > NOW()
      ORDER BY s.starts_at ASC`,
    [userId]);

  const activeLeagues = leagues.map(r => ({
    seasonId: r.id,
    title: r.title || r.month_year || 'لیگ',
    monthYear: r.month_year,
    leagueType: r.league_type,
    endsAt: r.ends_at,
    myCoins: Number(r.my_coins),
    myPoints: Number(r.my_points),
  }));

  return {
    vaultCoins: Number(userRows[0].vault_coins) || 0,
    leagueCoins: activeLeagues.reduce((sum, l) => sum + l.myCoins, 0),
    activeLeagues,
  };
}

/** تاریخچهٔ صندوق — «این سکه از کجا آمد و کجا رفت». */
async function history(userId, { limit = 25, offset = 0 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 25));
  const off = Math.max(0, Number(offset) || 0);
  const { rows } = await pool.query(
    `SELECT t.id, t.delta, t.balance_after, t.source, t.description,
            t.created_at, s.title AS season_title, s.month_year
       FROM coin_vault_transactions t
       LEFT JOIN league_seasons s ON s.id = t.season_id
      WHERE t.user_id=$1
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, lim, off]);
  return rows.map(r => ({
    id: String(r.id),
    delta: Number(r.delta),
    balanceAfter: Number(r.balance_after),
    source: r.source,
    description: r.description,
    seasonTitle: r.season_title || r.month_year || null,
    createdAt: r.created_at,
  }));
}

/**
 * واریزِ بخشی (یا همهٔ) صندوق به یک لیگِ فعال — انتخابِ خودِ کاربر.
 *
 * ── چرا همه‌چیز در یک تراکنش و با قفل ──
 *
 * دو درخواستِ هم‌زمان (دو تب، یا دوبار زدنِ دکمه) بدونِ قفل هر دو موجودیِ
 * قدیمی را می‌خوانند و کاربر می‌تواند بیش از موجودی‌اش واریز کند — یعنی
 * چاپِ سکه. `FOR UPDATE` روی ردیفِ کاربر همان الگویی است که
 * `buyShopItem` برای کیف پول دارد.
 */
async function deposit(userId, seasonId, amount) {
  const want = Math.floor(Number(amount));
  if (!Number.isFinite(want) || want <= 0) {
    throw fail('مبلغ واریز باید بیشتر از صفر باشد');
  }
  if (!seasonId) throw fail('لیگ مقصد را انتخاب کنید');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: locked } = await client.query(
      'SELECT vault_coins FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!locked[0]) throw fail('کاربر پیدا نشد', 404);
    const balance = Number(locked[0].vault_coins) || 0;
    if (balance <= 0) throw fail('صندوق سکهٔ شما خالی است', 409, 'VAULT_EMPTY');
    if (want > balance) {
      throw fail('موجودی صندوق کافی نیست', 409, 'VAULT_INSUFFICIENT');
    }

    // لیگ باید همین حالا واقعاً در جریان باشد. بدونِ این بند، کاربر
    // می‌توانست سکه را در لیگی بریزد که تمام شده — یعنی سکه‌اش را دور
    // بریزد و راهی برای برگرداندنش نباشد.
    const { rows: season } = await client.query(
      `SELECT id, title, month_year FROM league_seasons
        WHERE id=$1 AND status='active'
          AND starts_at <= NOW() AND ends_at > NOW()`,
      [seasonId]);
    if (!season[0]) {
      throw fail('این لیگ در جریان نیست', 409, 'LEAGUE_NOT_ACTIVE');
    }

    const after = balance - want;
    await client.query(
      'UPDATE users SET vault_coins=$2, updated_at=NOW() WHERE id=$1',
      [userId, after]);

    await client.query(
      `INSERT INTO league_leaderboard_entries
         (league_season_id, user_id, points, coins)
       VALUES ($1,$2,0,$3)
       ON CONFLICT (league_season_id, user_id)
       DO UPDATE SET coins = league_leaderboard_entries.coins + EXCLUDED.coins,
                     updated_at = NOW()`,
      [seasonId, userId, want]);

    const seasonLabel = season[0].title || season[0].month_year || 'لیگ';
    await client.query(
      `INSERT INTO coin_vault_transactions
         (user_id, delta, balance_after, source, season_id, description)
       VALUES ($1,$2,$3,'deposit',$4,$5)`,
      [userId, -want, after, seasonId, `واریز به ${seasonLabel}`]);

    // شمارندهٔ نمایشی = مجموعِ سکهٔ لیگ‌های فعال. بازمحاسبه می‌شود (نه
    // جمعِ ساده) تا دقیقاً همان قاعده‌ای بماند که بقیهٔ سیستم دارد.
    const { rows: coinsAfter } = await client.query(
      `UPDATE users u SET
         coins = COALESCE((
           SELECT SUM(e.coins)::int
             FROM league_leaderboard_entries e
             JOIN league_seasons s ON s.id = e.league_season_id
            WHERE e.user_id = u.id AND s.status='active'), 0),
         updated_at = NOW()
       WHERE u.id=$1
       RETURNING coins`,
      [userId]);

    await client.query(
      `INSERT INTO coin_transactions
         (user_id, delta, balance_after, source, reference_type,
          reference_id, description)
       VALUES ($1,$2,$3,'vault_deposit','league_season',$4,$5)`,
      [userId, want, Number(coinsAfter[0]?.coins) || 0, seasonId,
        `واریز از صندوق سکه به ${seasonLabel}`]);

    await client.query('COMMIT');

    // جدولِ لیگ عوض شد؛ کشِ رتبه‌بندی باید برود وگرنه کاربر سکه را در
    // صندوق کم‌شده می‌بیند ولی در جدول پیدایش نمی‌کند.
    await cacheDelPrefix('lb:league:').catch(() => {});

    return {
      deposited: want,
      vaultCoins: after,
      seasonId,
      seasonTitle: seasonLabel,
      leagueCoins: Number(coinsAfter[0]?.coins) || 0,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { overview, history, deposit };
