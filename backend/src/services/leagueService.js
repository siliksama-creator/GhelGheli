const { pool } = require('../config/db');
const walletService = require('./walletService');
const { createNotification } = require('./notificationService');
const pointLedger = require('./pointService');
const grants = require('./grantService');
// تنظیماتِ اقتصادِ بازی‌ها — درصدِ انتقالِ سکه بین لیگ‌ها را ادمین
// از پنل تعیین می‌کند (صفر هم مجاز است).
const economy = require('./gameEconomyService');

const PERK_KINDS = Object.freeze(['plus_days', 'shop_item', 'points', 'card_box']);

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
/**
 * متنِ فارسیِ یک جایزهٔ غیرنقدی، برای اعلان و برای پنلِ مدیر.
 *
 * `label` دستیِ مدیر همیشه مقدم است: اگر او نوشته «اشتراک ویژهٔ نوروزی»،
 * کاربر باید همان را ببیند نه «۳۰ روز اشتراک پلاس» تولیدشده.
 */
function describePerk(perk) {
  if (!perk) return '';
  if (perk.label) return String(perk.label);
  const value = Number(perk.value || 0);
  if (perk.kind === 'plus_days') return `${value.toLocaleString('fa-IR')} روز اشتراک پلاس`;
  if (perk.kind === 'points') return `${value.toLocaleString('fa-IR')} امتیاز`;
  if (perk.kind === 'shop_item') return 'یک آیتم فروشگاه';
  if (perk.kind === 'card_box') {
    const n = Math.max(1, value || 1);
    return n === 1 ? 'یک صندوق کارت' : `${n.toLocaleString('fa-IR')} صندوق کارت`;
  }
  return 'جایزه ویژه';
}

/**
 * جایزهٔ غیرنقدی را واقعاً تحویل می‌دهد.
 *
 * روی همان `client`ِ تراکنشِ بستنِ فصل اجرا می‌شود تا «ردیفِ جایزه ثبت شد
 * ولی چیزی تحویل نشد» ممکن نباشد.
 *
 * ── چرا پلاس از `shopService.deliverPlus` رد نمی‌شود ──
 *
 * وسوسه‌کننده است، ولی آن تابع دو کارِ اضافه می‌کند که اینجا **غلط**‌اند:
 *
 *   ۱. `payPurchaseCommission` صدا می‌زند — یعنی معرفِ این کاربر بابت
 *      جایزه‌ای که کسی پولش را نداده کمیسیونِ **نقدی** می‌گیرد. این دقیقاً
 *      همان قاعده‌ای است که مالک گذاشت: کمیسیونِ نقدی فقط از فروشِ شاپ.
 *   ۲. `price_paid` را روی قیمتِ پلانِ واقعی می‌گذارد، پس در گزارشِ درآمد
 *      یک فروشِ جعلی ثبت می‌شود.
 *
 * پس اشتراک مستقیم و با `price_paid = 0` درج می‌شود. منطقِ «تمدید از انتهای
 * اشتراکِ فعلی» عیناً از `deliverPlus` تکرار شده: بدون آن، جایزهٔ پلاس به
 * کاربری که پلاس دارد، روزهای باقی‌ماندهٔ خریداری‌شده‌اش را می‌سوزاند.
 */
async function deliverPerk(client, { userId, perk, seasonId, monthYear }) {
  if (perk.kind === 'points') {
    await pointLedger.credit(client, {
      userId,
      points: perk.value,
      source: 'league_perk',
      referenceType: 'league_seasons',
      referenceId: seasonId,
      description: `جایزهٔ لیگ ${monthYear}`,
      // ⚠️ امتیازِ لیگ زیاد **نمی‌شود**.
      //
      //    جایزهٔ فصلِ تمام‌شده اگر به امتیازِ لیگ اضافه شود، مستقیم در
      //    رتبه‌بندیِ فصلِ **بعد** می‌نشیند: کسی که ماه پیش رتبهٔ ۵۵ شد،
      //    ماهِ بعد را با امتیازِ هدیه جلوتر شروع می‌کند و جایزه دوباره
      //    به خودش می‌رسد. حلقهٔ بسته.
      league: false,
    });
    return true;
  }

  if (perk.kind === 'plus_days') {
    const active = await client.query(
      `SELECT MAX(expires_at) AS expires_at
         FROM user_subscriptions
        WHERE user_id=$1 AND plan IN ('plus','plus_annual')
          AND expires_at > NOW()`,
      [userId]);
    const startsAt = active.rows[0]?.expires_at || new Date();
    const expiresAt = new Date(
      new Date(startsAt).getTime() + perk.value * 86400000);
    await client.query(
      `INSERT INTO user_subscriptions(user_id,plan,price_paid,starts_at,expires_at)
       VALUES($1,'plus',0,$2,$3)`,
      [userId, startsAt, expiresAt]);
    return true;
  }

  if (perk.kind === 'shop_item' && perk.itemSlug) {
    const { rows } = await client.query(
      'SELECT id, kind, payload, slug FROM shop_items WHERE slug=$1',
      [perk.itemSlug]);
    if (!rows[0]) {
      // آیتم بین تنظیمِ جایزه و بستنِ فصل حذف شده. کلِ بستنِ فصل نباید
      // به‌خاطرِ یک slug بمیرد؛ ردیفِ جایزه می‌ماند با delivered_at خالی
      // تا مدیر در پنل ببیند و دستی رسیدگی کند.
      console.error(`[league] perk item not found: ${perk.itemSlug}`);
      return false;
    }
    await client.query(
      `INSERT INTO user_shop_items(user_id,item_id,price_paid)
       VALUES($1,$2,0) ON CONFLICT DO NOTHING`,
      [userId, rows[0].id]);
    if (rows[0].kind === 'club_badge') {
      const clubSlug = rows[0].payload || rows[0].slug;
      if (clubSlug) {
        await client.query(
          `INSERT INTO user_clubs(user_id,club_slug,source,joined_at)
           VALUES($1,$2,'purchase',NOW())
           ON CONFLICT(user_id,club_slug)
           DO UPDATE SET source='purchase', joined_at=EXCLUDED.joined_at`,
          [userId, clubSlug]);
      }
    }
    return true;
  }

  if (perk.kind === 'card_box') {
    // صندوق pending می‌ماند تا کاربر از کلکسیون بازش کند. value = تعداد
    // صندوق (سقف ۵ تا یک رتبه نتواند انبارِ صندوق بسازد).
    const n = Math.min(5, Math.max(1, Number(perk.value) || 1));
    for (let i = 0; i < n; i += 1) {
      await grants.award(client, {
        userId,
        kind: 'card_box',
        value: 1,
        label: perk.label || 'صندوق کارت جایزهٔ لیگ',
        source: 'league',
        sourceRef: null,
      });
    }
    return true;
  }

  return false;
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
/**
 * امتیازِ لیگ را به **همهٔ** لیگ‌های فعال اضافه می‌کند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که اینجا بود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «ادمین بتونه ۲ لیگ رو هم زمان قرار بده».
 *
 * زیرساختش از قبل بود — `league_seasons` چند ردیفِ `active` می‌پذیرد و
 * `getLeaderboard` هم فهرست را می‌خواند. ولی این تابع فقط
 * `ensureActiveSeason` را صدا می‌زد که `ORDER BY starts_at DESC LIMIT 1`
 * دارد، یعنی **تنها تازه‌ترین لیگ** امتیاز می‌گرفت.
 *
 * روی دیتابیسِ زنده اندازه‌گیری شد و دقیقاً همین دیده شد:
 *
 *     لیگ هفتگی قهرمانان (تازه‌تر) → ۱۰۴ بازیکن، ۹۴۳۰ امتیاز
 *     لیگ برتر ماهانه            → ۱ بازیکن،  ۲۸۲۴ امتیاز
 *
 * یعنی لیگِ ماهانه از لحظه‌ای که لیگِ هفتگی ساخته شد عملاً یخ زد. مدیر
 * می‌توانست دو لیگ بسازد ولی دومی هیچ‌وقت پر نمی‌شد — قابلیت روی کاغذ
 * بود، نه در عمل.
 *
 * ── چرا یک INSERT چندردیفی و نه حلقه ──
 *
 * حلقه یعنی n رفت‌وبرگشت به دیتابیس در مسیرِ داغِ هر امتیازگیری. با
 * `SELECT ... FROM league_seasons` به‌عنوان منبعِ INSERT، همه‌چیز در یک
 * کوئری و یک تراکنش انجام می‌شود.
 *
 * ── فیلترهای ورود ──
 *
 * `min_points_entry` و `plus_only` ستون‌هایی هستند که مدیر تنظیم می‌کند.
 * لیگی که شرطِ ورودش برقرار نیست نباید امتیاز بگیرد، وگرنه «لیگ ویژهٔ
 * پلاس» عملاً برای همه باز می‌شود.
 *
 * ⚠️ بازهٔ زمانی هم بررسی می‌شود: لیگی که `starts_at` آینده دارد (مدیر
 *    از قبل ساخته) نباید زودتر از موعد امتیاز بگیرد.
 */
async function addLeaguePoints(client, userId, points) {
  // اگر هیچ لیگِ فعالی نیست، یکی بساز — رفتارِ قبلی حفظ می‌شود.
  await ensureActiveSeason(client);
  const { rowCount } = await client.query(
    `INSERT INTO league_leaderboard_entries(league_season_id, user_id, points)
     SELECT s.id, $1, $2
       FROM league_seasons s
      WHERE s.status = 'active'
        AND s.starts_at <= NOW()
        AND s.ends_at   >  NOW()
        -- ATTENTION: user_subscriptions has NO status column; an active
        -- subscription simply means expires_at is still in the future.
        -- A first draft used us.status='active' which is a SQL error and
        -- would have broken every point award. Verified against the live
        -- schema, not from memory.
        --
        -- NOTE: no backticks in comments inside a template literal --
        -- they terminate the string. That exact mistake happened here.
        AND (s.plus_only = false OR EXISTS (
              SELECT 1 FROM user_subscriptions us
               WHERE us.user_id = $1 AND us.expires_at > NOW()))
        AND (s.min_points_entry = 0 OR EXISTS (
              SELECT 1 FROM users u
               WHERE u.id = $1 AND u.lifetime_points >= s.min_points_entry))
     ON CONFLICT(league_season_id, user_id)
     DO UPDATE SET points = league_leaderboard_entries.points + EXCLUDED.points,
                   updated_at = NOW()`,
    [userId, points],
  );
  // ── چرا این fallback لازم است ──
  //
  // اگر بازهٔ زمانیِ تنها لیگِ فعال خراب باشد (مثلاً `ends_at` گذشته ولی
  // کرونِ بستن هنوز اجرا نشده)، شرطِ بالا هیچ ردیفی برنمی‌گرداند و
  // امتیازِ کاربر **بی‌صدا گم می‌شود**. آن بدتر از ثبت در لیگِ منقضی است.
  if (rowCount === 0) {
    const season = await ensureActiveSeason(client);
    await client.query(
      `INSERT INTO league_leaderboard_entries(league_season_id,user_id,points)
       VALUES($1,$2,$3)
       ON CONFLICT(league_season_id,user_id)
       DO UPDATE SET points=league_leaderboard_entries.points + EXCLUDED.points,
                     updated_at=NOW()`,
      [season.id, userId, points],
    );
  }
}
async function getLeaderboard(limit = 100, seasonId = null, userId = null) {
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

  // ── رتبه‌بندی: اول سکه، بعد امتیاز ──
  //
  // سکه معیارِ اصلی است چون فقط از بردِ آنلاین مقابل انسان می‌آید. امتیاز
  // به «تساوی‌شکن» تنزل پیدا می‌کند، نه بیشتر.
  //
  // ⚠️ ترتیبِ ORDER BY و ترتیبِ داخلِ DENSE_RANK باید **دقیقاً** یکی
  //    باشند. اگر یکی (coins, points) باشد و دیگری فقط (points)، ردیفِ
  //    اولِ لیست ممکن است رتبهٔ ۲ نشان بدهد — جدولی که با خودش نمی‌خواند.
  const { rows } = await pool.query(
    `SELECT e.user_id, e.points, e.coins,
            u.nickname, u.first_name, u.last_name, u.profile_image_url, u.profile_avatar_key,
            DENSE_RANK() OVER(ORDER BY e.coins DESC, e.points DESC) AS rank
       FROM league_leaderboard_entries e
       JOIN users u ON u.id=e.user_id
      WHERE e.league_season_id=$1 AND u.status='active'
      ORDER BY e.coins DESC, e.points DESC LIMIT $2`,
    [season.id, limit]
  );
  let myEntry = null;
  if (userId) {
    const myRow = await pool.query(
      `SELECT sub.rank, sub.points, sub.coins FROM (
         SELECT e.user_id, e.points, e.coins,
                DENSE_RANK() OVER(ORDER BY e.coins DESC, e.points DESC) AS rank
           FROM league_leaderboard_entries e
          WHERE e.league_season_id=$1
       ) sub WHERE sub.user_id=$2`,
      [season.id, userId]
    );
    if (myRow.rows[0]) {
      myEntry = {
        rank: Number(myRow.rows[0].rank),
        points: Number(myRow.rows[0].points),
        coins: Number(myRow.rows[0].coins || 0),
      };
    }
  }

  return {
    season,
    activeLeagues: activeSeasons.length ? activeSeasons : [season],
    entries: rows,
    previousWinners: prevWinners,
    myEntry,
  };
}
/**
 * بستنِ یک لیگ و ساختنِ ردیف‌های جایزه.
 *
 * ⚠️ `seasonId` تازه اضافه شد و اختیاری است. بدونِ آن، این تابع همیشه
 *    «تازه‌ترین لیگِ فعال» را می‌بست — که وقتی دو لیگ هم‌زمان فعال‌اند
 *    یعنی مدیر روی دکمهٔ بستنِ لیگِ ماهانه می‌زد و **لیگِ هفتگی بسته
 *    می‌شد**. یک باگِ خاموشِ خطرناک: پیامِ موفقیت می‌گرفت و لیگِ اشتباهی
 *    جایزه می‌داد.
 *
 *    کرونِ شبانه بدونِ آرگومان صدا می‌زند و رفتارش دست‌نخورده می‌ماند.
 */
/**
 * سکه‌های یک لیگِ بسته را با درصدِ تنظیم‌شده به لیگِ بعدی منتقل می‌کند.
 *
 * خواستهٔ مالک: «مشخص کنه چند درصد از سکه به لیگ بعدی منتقل شه؛ ممکنه
 * ۰ قرار بده». پس:
 *   • درصدِ ۰ ⇒ هیچ انتقالی رخ نمی‌دهد (سکه‌ها با پایانِ لیگ می‌سوزند).
 *   • سهمِ هر کاربر = floor(سکهٔ لیگِ قبلی × درصد / ۱۰۰) و روی ردیفِ
 *     همان کاربر در لیگِ هدف جمع می‌شود.
 *
 * ⚠️ باید داخلِ همان تراکنشِ بستن/ساختنِ لیگ صدا زده شود.
 *
 * @returns {{pct:number, targetSeasonId:string|null, carriedUsers:number}|null}
 */
// ── نشانِ انتقال ─────────────────────────────────────────────────────────
//
// ⚠️ بدونِ این نشان، سکهٔ یک لیگِ بسته **دو بار** منتقل می‌شد:
//    لیگ A بسته می‌شود و لیگ B فعال است → ۱۰٪ به B منتقل می‌شود.
//    بعد ادمین لیگ C می‌سازد → «آخرین لیگِ بسته» دوباره A پیدا می‌شود
//    و ۱۰٪ **دوباره** به C منتقل می‌شود. یعنی چاپِ سکه.
//
// هر انتقالِ موفق یک ردیف در app_settings می‌گذارد؛ بذرپاشیِ بعدی
// (موقعِ ساختِ لیگ) فقط لیگِ بستهٔ بدونِ نشان را برمی‌دارد.
const CARRYOVER_MARKER_PREFIX = 'coin_carryover_seeded:';
function carryoverMarkerKey(sourceSeasonId) {
  return CARRYOVER_MARKER_PREFIX + sourceSeasonId;
}

async function carryoverBetween(client, sourceSeasonId, targetSeasonId) {
  let cfg = null;
  try { cfg = await economy.load(); } catch { /* پیش‌فرض */ }
  const pct = Number(cfg?.coinCarryoverPercent ?? 10);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { pct: 0, targetSeasonId, carriedUsers: 0 };
  }

  const { rows: entries } = await client.query(
    `SELECT user_id, coins FROM league_leaderboard_entries
      WHERE league_season_id=$1 AND coins > 0`,
    [sourceSeasonId]);

  let carriedUsers = 0;
  const touched = [];
  for (const e of entries) {
    const carry = carryoverAmount(e.coins, pct);
    if (carry <= 0) continue;
    await client.query(
      `INSERT INTO league_leaderboard_entries
         (league_season_id, user_id, points, coins)
       VALUES ($1,$2,0,$3)
       ON CONFLICT (league_season_id, user_id)
       DO UPDATE SET coins = league_leaderboard_entries.coins + EXCLUDED.coins,
                     updated_at = NOW()`,
      [targetSeasonId, e.user_id, carry]);
    carriedUsers += 1;
    touched.push(e.user_id);
  }

  if (touched.length) {
    // شمارندهٔ نمایشیِ users.coins باید مجموعِ سکهٔ لیگ‌های **فعالِ**
    // همان کاربر باشد — وگرنه بعد از انتقال، کاربر سکه‌ای را می‌بیند که
    // در هیچ لیگِ فعالی ندارد.
    await client.query(
      `UPDATE users u SET
         coins = COALESCE((
           SELECT SUM(e.coins)::int
             FROM league_leaderboard_entries e
             JOIN league_seasons s ON s.id = e.league_season_id
            WHERE e.user_id = u.id AND s.status='active'), 0),
         updated_at = NOW()
       WHERE u.id = ANY($1::uuid[])`,
      [touched]);
  }

  // نشانِ «این لیگِ بسته منتقل شد» — جلوی انتقالِ دوباره را می‌گیرد.
  await client.query(
    `INSERT INTO app_settings(key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    [carryoverMarkerKey(sourceSeasonId),
      JSON.stringify({ target: targetSeasonId, at: new Date().toISOString() })]);

  return { pct, targetSeasonId, carriedUsers };
}

/**
 * انتقالِ سکه از تازه‌ترین لیگِ بستهٔ یک نوع به یک لیگِ تازه‌ساخته.
 * موقعِ ساختِ لیگِ جدید توسط ادمین صدا زده می‌شود — چون ممکن است موقعِ
 * بستنِ لیگِ قبلی هنوز لیگِ بعدی وجود نداشته باشد.
 */
/**
 * سهمِ انتقالیِ یک کاربر: floor(سکه × درصد / ۱۰۰). خالص و قابل تست.
 * درصدِ ۰ یا نامعتبر ⇒ ۰ — یعنی «انتقال به لیگِ بعدی صفر می‌شود» (خواستهٔ مالک).
 */
function carryoverAmount(coins, pct) {
  const c = Number(coins);
  const p = Number(pct);
  if (!Number.isFinite(c) || c <= 0) return 0;
  if (!Number.isFinite(p) || p <= 0 || p > 100) return 0;
  return Math.floor(c * p / 100);
}

async function seedCarryoverFromLatestClosed({ leagueType = null, targetSeasonId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ⚠️ فقط لیگِ بسته‌ای که هنوز نشانِ انتقال ندارد — وگرنه سکهٔ یک لیگ
    //    دو بار منتقل می‌شود (توضیح کامل بالای `carryoverBetween`).
    //    `IS NOT DISTINCT FROM` چون لیگ‌های قدیمیِ خودکار league_type=NULL
    //    دارند و باید با هم‌نوعِ NULL خودشان جفت شوند.
    const { rows } = await client.query(
      `SELECT id FROM league_seasons
        WHERE status='closed'
          AND ($1::text IS NULL OR league_type IS NOT DISTINCT FROM $1)
        ORDER BY ends_at DESC LIMIT 8`,
      [leagueType]);
    let source = null;
    for (const row of rows) {
      const marked = await client.query(
        'SELECT 1 FROM app_settings WHERE key=$1',
        [carryoverMarkerKey(row.id)]);
      if (!marked.rows.length) { source = row; break; }
    }
    if (!source) {
      await client.query('COMMIT');
      return { seeded: false, reason: 'no unseeded closed season' };
    }
    const result = await carryoverBetween(client, source.id, targetSeasonId);
    await client.query('COMMIT');
    return { seeded: true, sourceSeasonId: source.id, ...result };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function closeActiveSeason({ force = false, seasonId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the season row so two concurrent runs (a cron overlapping a manual
    // admin trigger) cannot both pay out the same month.
    let season;
    if (seasonId) {
      const picked = await client.query(
        'SELECT * FROM league_seasons WHERE id=$1', [seasonId]);
      season = picked.rows[0];
      if (!season) {
        await client.query('ROLLBACK');
        const err = new Error('لیگ پیدا نشد');
        err.status = 404;
        throw err;
      }
    } else {
      season = await ensureActiveSeason(client);
    }
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
    const winnerCount = Number.isFinite(Number(rawWinnerCount)) && Number(rawWinnerCount) > 0
      ? Math.min(300, Math.floor(Number(rawWinnerCount)))
      : Math.max(10, Math.min(300, (season.prize_table || []).length || 10));
    // ⚠️ همان ترتیبِ getLeaderboard — و این حیاتی است، نه سلیقه‌ای.
    //    اگر جدولی که کاربر تمامِ فصل می‌دید بر اساس (coins, points) بود
    //    ولی جایزه بر اساس (points) پرداخت می‌شد، نفرِ اولِ جدول جایزهٔ
    //    نفرِ سوم را می‌گرفت. یک اختلافِ خاموش بینِ «آنچه دیده شد» و
    //    «آنچه پرداخت شد» — بدترین نوعِ باگ در یک محصولِ جایزه‌دار.
    // ── جوایزِ غیرنقدی (دورِ ۲۶) ───────────────────────────────────────
    //
    // مالک دو ردهٔ جایزه خواست: ۵۰ نفرِ اول پولِ نقد، و ۲۰ نفرِ بعدی
    // جایزهٔ غیرنقدی (پلاس، آیتمِ شاپ، امتیاز).
    //
    // ── چرا رده‌ی دوم اصلاً وجود دارد ──
    //
    // مرزِ جایزه یک صخره است: نفرِ ۵۰ چیزی می‌برد و نفرِ ۵۱ که شاید یک
    // سکه عقب‌تر بوده، هیچ. هرچه آن صخره تیزتر باشد، ماهِ بعد کاربرانِ
    // نزدیکِ مرز زودتر ناامید می‌شوند. ردهٔ غیرنقدی صخره را به پله
    // تبدیل می‌کند، بدونِ آنکه یک ریال به هزینهٔ نقدی اضافه شود.
    const perkMap = new Map();
    for (const p of season.perk_table || []) {
      const rank = Number(p?.rank);
      if (!Number.isFinite(rank) || rank <= 0) continue;
      const kind = String(p?.kind || '');
      if (!PERK_KINDS.includes(kind)) {
        console.error(`[league] نوعِ جایزهٔ غیرنقدیِ ناشناخته «${kind}» برای رتبهٔ ${rank} — رد شد`);
        continue;
      }
      let value = Number(p?.value ?? 0);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        console.error(`[league] مقدارِ نامعتبر جایزهٔ غیرنقدی رتبهٔ ${rank} (${p?.value}) — صفر شد`);
        value = 0;
      }
      // ⚠️ ردیفِ صفر کاملاً حذف می‌شود، نه اینکه با صفر بماند.
      //    «۰ روز پلاس» چیزی تحویل نمی‌دهد ولی `delivered_at` می‌گیرد و به
      //    کاربر اعلانِ «برنده شدی» می‌فرستد — یعنی یک جایزهٔ توخالی.
      if (kind !== 'shop_item' && value <= 0) {
        console.error(`[league] جایزهٔ غیرنقدیِ رتبهٔ ${rank} مقدارِ صفر دارد — رد شد`);
        continue;
      }
      const itemSlug = p?.itemSlug || p?.item_slug || null;
      // آیتمِ بدونِ slug هم همین‌طور: چیزی برای تحویل ندارد.
      if (kind === 'shop_item' && !itemSlug) {
        console.error(`[league] جایزهٔ آیتمِ رتبهٔ ${rank} slug ندارد — رد شد`);
        continue;
      }
      perkMap.set(rank, {
        kind,
        value,
        itemSlug,
        label: p?.label || null,
      });
    }

    // ⚠️ کوئری باید تا پایین‌ترین رتبهٔ **هر دو** جدول برود، نه فقط
    //    `winnerCount`. با LIMIT قبلی، ردیفِ رتبهٔ ۵۱ اصلاً خوانده
    //    نمی‌شد و جوایزِ غیرنقدی بی‌صدا هیچ‌وقت داده نمی‌شدند.
    const maxPerkRank = perkMap.size ? Math.max(...perkMap.keys()) : 0;
    const fetchCount = Math.max(winnerCount, maxPerkRank);

    const { rows: leaders } = await client.query(
      `SELECT e.user_id, e.points, e.coins,
              DENSE_RANK() OVER(ORDER BY e.coins DESC, e.points DESC) AS rank
       FROM league_leaderboard_entries e WHERE e.league_season_id=$1
       ORDER BY e.coins DESC, e.points DESC LIMIT $2`,
      [season.id, fetchCount]
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
    let perksAwarded = 0;
    for (const entry of leaders) {
      const rank = Number(entry.rank);
      const perk = perkMap.get(rank) || null;

      // ── ردهٔ غیرنقدی: ردیفِ پرداختِ نقدی ساخته نمی‌شود ──────────────
      //
      // نفرِ ۵۱ تا ۷۰ در `league_payouts` **هیچ ردیفی** نمی‌گیرد. یک ردیفِ
      // صفرتومانی آنجا یعنی در صفحهٔ تأییدِ مالیِ مدیر بیست ردیفِ «۰ تومان»
      // ظاهر شود که باید تک‌تک تأیید شوند و هیچ پولی هم جابه‌جا نکنند —
      // یعنی صف تأیید را با نویز پر کند. جایزهٔ غیرنقدی سندِ خودش را دارد.
      if (rank > winnerCount) {
        if (perk) {
          await client.query(
            `INSERT INTO league_perk_awards
               (league_season_id, user_id, rank, kind, value, item_slug, label)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (league_season_id, user_id) DO UPDATE
               SET rank = EXCLUDED.rank, kind = EXCLUDED.kind,
                   value = EXCLUDED.value, item_slug = EXCLUDED.item_slug,
                   label = EXCLUDED.label`,
            [season.id, entry.user_id, rank, perk.kind, perk.value,
              perk.itemSlug, perk.label]);
          perksAwarded++;

          const delivered = await deliverPerk(client, {
            userId: entry.user_id, perk, seasonId: season.id,
            monthYear: season.month_year,
          });
          if (delivered) {
            await client.query(
              `UPDATE league_perk_awards SET delivered_at=NOW()
                WHERE league_season_id=$1 AND user_id=$2`,
              [season.id, entry.user_id]);
          }

          // رتبه و بایگانیِ پروفایل برای این‌ها هم لازم است، وگرنه
          // کاربرِ رتبهٔ ۵۵ در پروفایلش هیچ ردی از این فصل نمی‌بیند.
          await client.query(
            'UPDATE league_leaderboard_entries SET rank=$1 WHERE league_season_id=$2 AND user_id=$3',
            [rank, season.id, entry.user_id]);
          await client.query(
            `INSERT INTO user_league_history
               (user_id, season_id, month_year, rank, points, coins, prize_amount)
             VALUES ($1,$2,$3,$4,$5,$6,0)
             ON CONFLICT (user_id, season_id) DO UPDATE
               SET rank = EXCLUDED.rank, points = EXCLUDED.points,
                   coins = EXCLUDED.coins`,
            [entry.user_id, season.id, season.month_year,
              rank, entry.points, Number(entry.coins || 0)]);

          winnersToNotify.push({
            userId: entry.user_id,
            rank,
            amount: 0,
            perk,
            monthYear: season.month_year,
            pendingApproval: false,
          });
        }
        continue;
      }

      const amount = prizeMap.get(rank) || 0;

      // ⚠️ یک کاربر می‌تواند هم در ردهٔ نقدی باشد و هم مدیر برایش
      //    غیرنقدی گذاشته باشد (مثلاً رتبهٔ ۱: پول + پلاس). قید
      //    UNIQUE(season, user) اجازهٔ هر دو را می‌دهد چون در دو جدولِ
      //    جدا می‌نشینند.
      if (perk) {
        await client.query(
          `INSERT INTO league_perk_awards
             (league_season_id, user_id, rank, kind, value, item_slug, label)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (league_season_id, user_id) DO UPDATE
             SET rank = EXCLUDED.rank, kind = EXCLUDED.kind,
                 value = EXCLUDED.value, item_slug = EXCLUDED.item_slug,
                 label = EXCLUDED.label`,
          [season.id, entry.user_id, rank, perk.kind, perk.value,
            perk.itemSlug, perk.label]);
        perksAwarded++;
        const deliveredPerk = await deliverPerk(client, {
          userId: entry.user_id, perk, seasonId: season.id,
          monthYear: season.month_year,
        });
        if (deliveredPerk) {
          await client.query(
            `UPDATE league_perk_awards SET delivered_at=NOW()
              WHERE league_season_id=$1 AND user_id=$2`,
            [season.id, entry.user_id]);
        }
      }
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
      // سکه هم بایگانی می‌شود: بعد از ریستِ فصل، تنها جایی که «۲۴۰ سکه در
      // مرداد گرفتم» باقی می‌ماند همین ردیف است.
      await client.query(
        `INSERT INTO user_league_history
           (user_id, season_id, month_year, rank, points, coins, prize_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, season_id) DO UPDATE
           SET rank = EXCLUDED.rank,
               points = EXCLUDED.points,
               coins = EXCLUDED.coins,
               prize_amount = EXCLUDED.prize_amount`,
        [entry.user_id, season.id, season.month_year,
         entry.rank, entry.points, Number(entry.coins || 0), amount]);

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
    // ── انتقالِ درصدیِ سکه به لیگِ بعدی (خواستهٔ مالک) ──────────────────
    //
    // «لیگِ بعدی» = فعال‌ترین لیگِ هم‌نوع که بعد از پایانِ این لیگ شروع
    // شده. اگر هنوز ساخته نشده، موقعِ ساخت توسط ادمین
    // (`seedCarryoverFromLatestClosed`) منتقل می‌شود.
    const { rows: nextSeasons } = await client.query(
      `SELECT id FROM league_seasons
        WHERE id <> $1 AND status='active'
          AND league_type IS NOT DISTINCT FROM $2
          AND starts_at >= $3
        ORDER BY starts_at ASC LIMIT 1`,
      [season.id, season.league_type, season.ends_at]);
    let carryover = null;
    if (nextSeasons[0]) {
      carryover = await carryoverBetween(client, season.id, nextSeasons[0].id);
    }
    // Reset ONLY the monthly counter. current_points (spendable) and
    // lifetime_points (history) are untouched: a user's saved-up points and
    // their all-time total must survive the month rolling over.
    //
    // ── چرا حالا شرطی شد ──
    //
    // این ستون شمارندهٔ نمایشیِ پروفایل است و **سراسری**، نه به‌ازای
    // فصل. تا وقتی فقط یک لیگ وجود داشت صفر کردنش موقعِ بستن درست بود.
    //
    // ولی حالا مدیر می‌تواند تا سه لیگِ هم‌زمان با تاریخ‌های دلخواه
    // بسازد. در آن حالت بستنِ لیگِ کوتاه‌ترْ شمارندهٔ همه را صفر می‌کرد
    // و کاربرانِ لیگِ بلندتر می‌دیدند امتیازِ ماهشان **وسطِ مسابقه**
    // ناپدید شد — با اینکه رتبه‌بندیِ واقعی
    // (`league_leaderboard_entries`) دست‌نخورده بود. یعنی یک باگِ
    // کاملاً نمایشی ولی وحشتناک از دید کاربر.
    //
    // پس فقط وقتی صفر می‌کنیم که **هیچ لیگِ فعالِ دیگری نمانده باشد**.
    const { rows: stillActive } = await client.query(
      "SELECT 1 FROM league_seasons WHERE status='active' AND id<>$1 LIMIT 1",
      [season.id]);
    if (!stillActive.length) {
      await client.query('UPDATE users SET monthly_league_points=0, updated_at=NOW()');
    }
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
      // ⚠️ برندهٔ غیرنقدی متنِ خودش را لازم دارد.
      //
      //    بدونِ این شاخه، کاربرِ رتبهٔ ۵۵ پیامِ «جایزهٔ ۰ تومانی شما به
      //    کیف پول واریز شد» می‌گرفت — چون `amount` برایش صفر است و
      //    `pendingApproval` هم false. یعنی بهترین خبرِ ماهش به یک
      //    پیامِ خراب تبدیل می‌شد.
      const body = w.perk
        ? (w.perk.kind === 'card_box'
          // بدون این جمله کاربر فکر می‌کند صندوق همان لحظه باز شده و
          // کارت‌ها گم شده‌اند — در حالی که باید از کلکسیون بازش کند.
          ? `تبریک! رتبهٔ ${w.rank} لیگ را گرفتی و ${describePerk(w.perk)} `
            + 'برایت ثبت شد. از کلکسیون بازش کن.'
          : `تبریک! رتبهٔ ${w.rank} لیگ را گرفتی و ${describePerk(w.perk)} `
            + 'برایت ثبت شد.')
        : w.pendingApproval
          ? `تبریک! رتبهٔ ${w.rank} را گرفتی. جایزهٔ `
            + `${w.amount.toLocaleString('fa-IR')} تومانی پس از بررسی و `
            + 'تأیید نهایی به کیف پولت واریز می‌شود.'
          : `تبریک! جایزهٔ ${w.amount.toLocaleString('fa-IR')} تومانی شما `
            + 'به کیف پول واریز شد.';

      createNotification(
        w.userId,
        'league',
        `رتبهٔ ${w.rank} لیگ ${w.monthYear}`,
        body,
      ).catch((e) => console.error('[league] notify failed:', e.message));
    }

    // جدولِ لیگ یک‌جا عوض شد: فصلِ جاری بسته، فصلِ تازه ساخته شد و تبِ
    // «برندگان قبل» پر شد. بیننده‌های بازِ صفحه باید بی‌درنگ تازه شوند.
    // lazy require: leagueService پایین‌تر از سیگنال در گراف ماژول است و
    // سیگنال هم io را از server می‌گیرد؛ require درون‌تابعه حلقه را می‌شکند.
    try { require('./leaderboardSignal').leaderboardChanged(); } catch { /* best-effort */ }

    return {
      seasonId: season.id,
      // ⚠️ `leaders` حالا ردهٔ غیرنقدی را هم شامل می‌شود، پس دیگر
      //    «تعدادِ برندگانِ نقدی» نیست. عددِ نقدی جدا شمرده می‌شود.
      winners: leaders.filter(l => Number(l.rank) <= winnerCount).length,
      credited,
      creditedUsers,
      perksAwarded,
      // برای پنل: چند جایزه منتظرِ تأیید است.
      pendingApproval: winnersToNotify.filter(w => w.pendingApproval).length,
      carryover,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
/**
 * هر لیگی که زمانش تمام شده را می‌بندد — صرفِ‌نظر از نوعش.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که اینجا بود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تنها زمان‌بندِ خودکارِ بستنِ لیگ این بود:
 *
 *     cron.schedule('5 0 1 * *', () => closeActiveSeason())
 *
 * یعنی «اولِ هر ماهِ میلادی، ساعت ۰۰:۰۵». دو ایرادِ مستقل داشت:
 *
 *   ۱. **فقط یک لیگ را می‌بست.** `closeActiveSeason()` بدونِ آرگومان
 *      سراغِ `ensureActiveSeason` می‌رود که `ORDER BY starts_at DESC
 *      LIMIT 1` دارد — یعنی فقط **تازه‌ترین** لیگ. اگر سه لیگِ فعال
 *      بود (که پنل اجازه می‌دهد)، دوتای دیگر برای همیشه باز می‌ماندند.
 *
 *   ۲. **زمانش ربطی به لیگ نداشت.** مالک تصریح کرد: «تعداد روز لیگ
 *      فقط توسط ادمین مشخص میشه و اصلا ربطی به ماهانه و هفتگی نداره،
 *      ساعت اتمامش هم ادمین به تاریخ ایران مشخص میکنه». لیگی که
 *      چهارشنبه ساعت ۲۰:۰۰ تمام می‌شد، تا اولِ ماهِ بعد بسته نمی‌شد:
 *      جایزه‌ها پرداخت نمی‌شدند و — بدتر — `addLeaguePoints` شرطِ
 *      `ends_at > NOW()` دارد، پس امتیازها به مسیرِ fallback می‌افتادند.
 *
 * حالا هر ساعت اجرا می‌شود و **همهٔ** لیگ‌هایی که `ends_at`شان گذشته را
 * می‌بندد. برای لیگِ ماهانه هیچ فرقی نمی‌کند (اولِ ماه که برسد، در
 * اولین اجرای ساعتی بسته می‌شود)، ولی لیگِ با تاریخِ دلخواهِ مدیر هم
 * دیگر جا نمی‌ماند.
 *
 * ⚠️ `force` عمداً پاس **نمی‌شود**. محافظِ «فصل هنوز در جریان است» باید
 *    سرِ جایش بماند: اگر به هر دلیلی ردیفی اشتباهی انتخاب شود،
 *    `closeActiveSeason` خودش تشخیص می‌دهد و رد می‌کند.
 *
 * @returns {Promise<{closed: number, results: object[]}>}
 */
async function closeExpiredSeasons() {
  const { rows } = await pool.query(
    `SELECT id, title, month_year FROM league_seasons
      WHERE status='active' AND ends_at <= NOW()
      ORDER BY ends_at ASC`);

  const results = [];
  for (const row of rows) {
    try {
      // هر لیگ در تراکنشِ خودش. اگر یکی بشکند، بقیه باید بسته شوند —
      // وگرنه یک لیگِ خرابْ جایزهٔ همهٔ لیگ‌های دیگر را هم گروگان می‌گیرد.
      const res = await closeActiveSeason({ seasonId: row.id });
      results.push({ ...res, title: row.title, monthYear: row.month_year });
      if (!res.skipped) {
        console.log(`[league] فصل «${row.title || row.month_year}» بسته شد — ${res.winners} برنده`);
      }
    } catch (e) {
      console.error(`[league] بستنِ فصل ${row.month_year} شکست خورد:`, e.message);
      results.push({ seasonId: row.id, error: e.message });
    }
  }
  return { closed: results.filter((r) => !r.error && !r.skipped).length, results };
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
  let coinsReset = false;
  const affectedSeasons = new Set();
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
      affectedSeasons.add(p.league_season_id);
    }

    // ═════════════════════════════════════════════════════════════════════
    // ریستِ شمارندهٔ سکه — اینجا، نه در closeActiveSeason
    // ═════════════════════════════════════════════════════════════════════
    //
    // ── چرا بعد از تأیید و نه موقعِ بستن ──
    //
    // بینِ «بستنِ لیگ» و «تأییدِ مدیر» ممکن است روزها فاصله باشد. اگر سکه
    // در لحظهٔ بستن صفر می‌شد، کاربر وارد اپ می‌شد و می‌دید سکه‌هایش
    // ناپدید شده‌اند در حالی که هنوز جایزه‌ای نگرفته و جدولِ نهایی هم
    // هنوز رسمی نشده. از دید او یعنی «سکه‌هام رو خوردن».
    //
    // ── سه شرط، و چرا هر سه لازم‌اند ──
    //
    //   ۱. هیچ لیگِ فعالی نمانده باشد — وگرنه بستنِ یک لیگِ کوتاه،
    //      سکهٔ بازیکنانِ لیگِ بلندترِ در حالِ اجرا را وسطِ مسابقه صفر
    //      می‌کند. (همان باگی که برای monthly_league_points رخ داد.)
    //   ۲. هیچ جایزهٔ تأییدنشده‌ای نمانده باشد — تأییدِ تک‌جایزه نباید
    //      شمارندهٔ همه را صفر کند در حالی که بقیه هنوز منتظرند.
    //   ۳. واقعاً چیزی تأیید شده باشد (`paid > 0`) — یک فراخوانیِ بی‌اثر
    //      نباید عوارضِ سراسری داشته باشد.
    //
    // ⚠️ فقط `users.coins` (شمارندهٔ نمایشی) صفر می‌شود.
    //    `league_leaderboard_entries.coins` و `user_league_history.coins`
    //    دست‌نخورده می‌مانند — آن‌ها تاریخ‌اند و تاریخ پاک نمی‌شود.
    if (paid > 0 && affectedSeasons.size) {
      const { rows: stillActive } = await client.query(
        "SELECT 1 FROM league_seasons WHERE status='active' LIMIT 1");
      const { rows: stillPending } = await client.query(
        `SELECT 1 FROM league_payouts
          WHERE paid_at IS NULL AND amount > 0 LIMIT 1`);
      if (!stillActive.length && !stillPending.length) {
        await client.query(
          'UPDATE users SET coins=0, updated_at=NOW() WHERE coins > 0');
        coinsReset = true;
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
      `جایزهٔ لیگ ${n.monthYear} واریز شد`,
      `جایزهٔ رتبهٔ ${n.rank} به مبلغ ${n.amount.toLocaleString('fa-IR')} `
      + 'تومان به کیف پول شما واریز شد.',
    ).catch((e) => console.error('[league] payout notify failed:', e.message));
  }
  // تأییدِ واریز ممکن است شمارندهٔ سکه را ریست کرده باشد (نگاه کنید به
  // شرحِ بالای همین تابع)؛ پس رتبه‌بندیِ جاری می‌تواند عوض شده باشد. اگر
  // واقعاً پرداختی انجام شد (paid>0) سیگنال بده.
  if (paid > 0) {
    try { require('./leaderboardSignal').leaderboardChanged(); } catch { /* best-effort */ }
  }
  return { paid, amount: total, skipped, coinsReset };
}

module.exports = {
  ensureActiveSeason, addLeaguePoints, getLeaderboard, closeActiveSeason,
  closeExpiredSeasons, defaultPrizeTable, approvePayouts,
  carryoverBetween, seedCarryoverFromLatestClosed, carryoverAmount,
  carryoverMarkerKey,
};
