/**
 * دفترِ ریزِ امتیازات — تنها نقطهٔ تغییرِ امتیاز.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این سرویس ساخته شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تا امروز هفت مسیرِ جدا مستقیماً `UPDATE users SET current_points = ...`
 * می‌زدند و هیچ‌کدام ردی نمی‌گذاشتند. وقتی کاربری می‌پرسید «این امتیاز از
 * کجا آمد؟» هیچ پاسخی نبود.
 *
 * این ماژول همان کاری را برای امتیاز می‌کند که `walletService` برای پول
 * می‌کند: هر تغییر از یک در می‌گذرد و یک ردیف در دفتر می‌گذارد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * قراردادها
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ۱. **همیشه `client` بگیر، نه `pool`.** هر تغییرِ امتیاز بخشی از یک
 *    تراکنشِ بزرگ‌تر است (ثبت کارت، بردن بازی). اگر آن تراکنش برگردد،
 *    ردیفِ دفتر هم باید برگردد. گرفتنِ `pool` یعنی دفتر و موجودی از هم
 *    جدا می‌افتند — دقیقاً همان چیزی که این ماژول برای جلوگیری از آن
 *    ساخته شده.
 *
 * ۲. **`balance_after` از خروجیِ همان UPDATE می‌آید، نه از خواندنِ دوباره.**
 *    `RETURNING` مقدارِ پس از تغییر را در همان دستور می‌دهد. خواندنِ
 *    جداگانه یعنی پنجره‌ای که تراکنشِ دیگری می‌تواند وسطش بنشیند.
 *
 * ۳. **کسر هرگز زیرِ صفر نمی‌رود.** `GREATEST(0, ...)` در SQL، و
 *    `delta` واقعیِ اعمال‌شده در دفتر ثبت می‌شود نه مقدارِ درخواستی.
 *    اگر کاربر ۱۰۰ امتیاز دارد و مدیر ۵۰۰ کم کند، دفتر `-100` ثبت
 *    می‌کند نه `-500` — وگرنه `SUM(delta)` با موجودی نمی‌خواند و کلِ
 *    ابزارِ ممیزی بی‌معنی می‌شود.
 */
const { pool } = require('../config/db');

/** منابعِ مجاز — باید با CHECK مایگریشن ۰۴۵ یکی بماند. */
const SOURCES = Object.freeze([
  'photo_card', 'card_code', 'referral', 'game', 'pass_reward',
  'wheel', 'login_streak', 'mission', 'reward_claim', 'admin_adjust', 'admin_deduct', 'other',
]);

/**
 * امتیاز می‌دهد و در دفتر ثبت می‌کند.
 *
 * @param {object} client  کلاینتِ تراکنشِ جاری — **نه** pool
 * @param {object} o
 * @param {string} o.userId
 * @param {number} o.points        مثبت
 * @param {string} o.source        یکی از SOURCES
 * @param {boolean} [o.league]     آیا امتیازِ لیگ هم زیاد شود؟
 * @returns {Promise<{delta:number, balanceAfter:number}|null>}
 */
async function credit(client, {
  userId, points, source, referenceType = null, referenceId = null,
  description = null, adminId = null, league = true, lifetimeGain = null,
}) {
  const amount = Math.floor(Number(points) || 0);
  // صفر یا منفی یعنی «کاری نکن». پرتابِ خطا اینجا اشتباه است: خیلی از
  // مسیرها امتیازِ صفر دارند (کارتِ بی‌امتیاز، بازیِ مساوی) و آن‌ها
  // نباید تراکنش را بشکنند.
  if (amount <= 0) return null;
  assertSource(source);
  // بعضی واریزها برگشتِ اصل موجودی‌اند، نه کسب تازه. نمونهٔ مهمش تسویهٔ
  // مسابقهٔ stakeدار است: برنده اصل stake خودش را هم پس می‌گیرد، اما فقط
  // سود خالص باید lifetime را زیاد کند. null رفتار تاریخی را نگه می‌دارد.
  const life = lifetimeGain === null
    ? amount
    : Math.min(amount, Math.max(0, Math.floor(Number(lifetimeGain) || 0)));

  // ── چرا `monthly_league_points` شرطی است ──
  //
  // امتیازِ لیگ فقط از فعالیتِ همان ماه می‌آید. تنظیمِ دستیِ مدیر و
  // برگرداندنِ امتیاز نباید رتبهٔ لیگ را تکان بدهد، وگرنه مدیر ناخواسته
  // نتیجهٔ مسابقه را عوض می‌کند.
  const { rows } = await client.query(
    `UPDATE users
        SET current_points  = current_points + $2,
            lifetime_points = lifetime_points + $4,
            monthly_league_points = monthly_league_points + $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING current_points`,
    [userId, amount, league ? amount : 0, life],
  );
  if (!rows[0]) return null;   // کاربر حذف شده

  await client.query(
    `INSERT INTO point_transactions
       (user_id, delta, balance_after, source, reference_type,
        reference_id, description, admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, amount, rows[0].current_points, source,
      referenceType, referenceId, description, adminId],
  );
  return { delta: amount, balanceAfter: rows[0].current_points };
}

/**
 * امتیاز کم می‌کند و در دفتر ثبت می‌کند.
 *
 * ⚠️ `lifetime_points` عمداً **دست‌نخورده** می‌ماند.
 *
 * «امتیازِ مادام‌العمر» یعنی «در طولِ عمر چقدر به دست آورده» و پایهٔ
 * سطحِ دسترسیِ چت است. کم کردنش یعنی کاربری که یک بار تخلف کرده،
 * دسترسیِ چتش را هم از دست می‌دهد — مجازاتِ دوگانه‌ای که مدیر قصدش را
 * نداشته. اگر روزی لازم شد، باید تصمیمِ جداگانه‌ای باشد.
 *
 * @returns {Promise<{delta:number, balanceAfter:number, requested:number}>}
 *   `delta` منفیِ **واقعاً کسرشده** است؛ اگر موجودی کمتر بود، کمتر از
 *   درخواست خواهد بود.
 */
async function debit(client, {
  userId, points, source = 'admin_deduct', referenceType = null,
  referenceId = null, description = null, adminId = null, league = false,
}) {
  const want = Math.floor(Math.abs(Number(points) || 0));
  if (want <= 0) return null;
  assertSource(source);

  // ── چرا موجودی داخلِ همان UPDATE قفل می‌شود ──
  //
  // خواندنِ موجودی و بعد کم کردنش، همان الگوی SELECT-سپس-UPDATE است که
  // در اینونتوری باگ ساخت. اینجا `GREATEST` کارِ محدودسازی را داخلِ
  // خودِ دستور انجام می‌دهد، پس هیچ پنجره‌ای برای مسابقه نمی‌ماند.
  //
  // ═══════════════════════════════════════════════════════════════════════
  // ⚠️ باگی که اینجا بود و رفع شد — «کسرِ گم‌شده»
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نسخهٔ قبلی مقدارِ قبل را با **زیرکوئری** می‌گرفت:
  //
  //     RETURNING current_points,
  //               (SELECT current_points FROM users WHERE id=$1) AS before_val
  //
  // و کامنتش ادعا می‌کرد «در Postgres مقدارِ قبل از UPDATE را می‌دهد».
  // آن ادعا فقط در حالتِ **تک‌کاربره** درست است.
  //
  // زیرکوئری از snapshotِ ابتدای تراکنش می‌خواند. اگر تراکنشِ دیگری
  // (مثلاً یک افزایشِ هم‌زمان) وسطِ کار commit کند، `before_val` کهنه
  // است. آن‌وقت:
  //
  //     actual = before_val - after   →  صفر یا **منفی**
  //     if (actual <= 0) return ...   →  خروجِ زودهنگام
  //
  // یعنی امتیاز از `users` کم می‌شد ولی **هیچ ردیفی در دفتر ثبت
  // نمی‌شد**. دفتر بی‌صدا ناقص می‌ماند — دقیقاً همان چیزی که این جدول
  // برای جلوگیری‌اش ساخته شده بود.
  //
  // ⚠️ بازتولید شد، حدس نبود. شش درخواستِ هم‌زمان (۳ کسر + ۳ افزایش)
  //    روی سرورِ زنده: دو کسر پاسخِ «کاربر امتیازی برای کسر نداشت»
  //    گرفتند در حالی که کاربر ۲۰۰ امتیاز داشت. دفتر ۵ ردیف داشت
  //    به‌جای ۶، و جمعش با موجودی نمی‌خواند.
  //
  // ── رفع ──
  //
  // ⚠️ تلاشِ اول (`FROM users AS old`) هم **کافی نبود** و این را باید
  //    صریح گفت: آن هم از snapshot می‌خواند، فقط پنجرهٔ خطا را
  //    کوچک‌تر می‌کرد. تستِ زنده از ۱ ردیفِ گم‌شده به ۱ رسید — یعنی
  //    بهتر شد ولی درست نشد. «بهتر» در یک دفترِ مالی کافی نیست.
  //
  // راهِ قطعی: مقدارِ کسرشده را **داخلِ خودِ SQL** حساب کن، نه در
  // جاوااسکریپت از تفاضلِ دو عدد. عبارتِ `LEAST(want, current_points)`
  // در همان لحظه‌ای ارزیابی می‌شود که ردیف قفل است، پس هیچ تراکنشِ
  // دیگری نمی‌تواند بینشان بیفتد.
  //
  // حالا `actual_deducted` مستقیم از دیتابیس می‌آید و هیچ محاسبه‌ای
  // در سمتِ برنامه لازم نیست — یعنی هیچ پنجره‌ای هم برای اشتباه.
  // CTE با `FOR UPDATE`: ردیف **قفل** می‌شود، مقدارِ کسرشدنی همان‌جا
  // حساب می‌شود، و بعد UPDATE از همان عدد استفاده می‌کند. هر سه گام
  // در یک دستور و زیرِ یک قفل.
  const { rows } = await client.query(
    `WITH locked AS (
       SELECT id, LEAST($2::int, current_points) AS take
         FROM users WHERE id = $1 FOR UPDATE
     )
     UPDATE users u
        SET current_points = u.current_points - l.take,
            monthly_league_points = CASE WHEN $3
              THEN GREATEST(0, u.monthly_league_points - l.take)
              ELSE u.monthly_league_points END,
            updated_at = NOW()
       FROM locked l
      WHERE u.id = l.id
      RETURNING u.current_points, l.take AS actual_taken`,
    [userId, want, league],
  );
  if (!rows[0]) return null;

  const after = Number(rows[0].current_points);
  // مقدارِ واقعاً کسرشده **از خودِ دیتابیس** می‌آید، نه از تفاضلِ دو
  // عددی که ممکن است از snapshotهای متفاوت خوانده شده باشند.
  const actual = Number(rows[0].actual_taken);   // ≥ 0، و ≤ want
  if (actual <= 0) {
    // کاربر صفر امتیاز داشت. ردیفِ صفر مجاز نیست (CHECK) و بی‌معنی هم
    // هست، ولی فراخوان باید بداند چیزی کم نشد.
    return { delta: 0, balanceAfter: after, requested: want };
  }

  await client.query(
    `INSERT INTO point_transactions
       (user_id, delta, balance_after, source, reference_type,
        reference_id, description, admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, -actual, after, source, referenceType, referenceId,
      description, adminId],
  );
  return { delta: -actual, balanceAfter: after, requested: want };
}

function assertSource(s) {
  if (!SOURCES.includes(s)) {
    // پرتابِ خطا و نه ثبتِ 'other': منبعِ ناشناخته یعنی کسی مسیرِ تازه‌ای
    // اضافه کرده و فهرست را به‌روز نکرده. بی‌صدا رد کردنش یعنی همان
    // ردیف‌های بی‌هویتی که این جدول برای رفعشان ساخته شد.
    throw new Error(`منبعِ امتیازِ ناشناخته: ${s}`);
  }
}

/**
 * ریزِ امتیازاتِ یک کاربر، صفحه‌بندی‌شده.
 *
 * `limit` سقفِ سخت دارد چون این مسیر از پنل صدا زده می‌شود و کاربرِ
 * کنجکاو می‌تواند `?limit=999999` بفرستد و سرور را با یک کوئری بخواباند.
 */
async function history(userId, { limit = 50, offset = 0, source = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [userId, lim, off];
  let where = 'WHERE t.user_id = $1';
  if (source && SOURCES.includes(source)) {
    params.push(source);
    where += ` AND t.source = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT t.id, t.delta, t.balance_after, t.source, t.reference_type,
            t.reference_id, t.description, t.created_at,
            a.username AS admin_username
       FROM point_transactions t
       LEFT JOIN admin_users a ON a.id = t.admin_id
       ${where}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $2 OFFSET $3`, params);
  const { rows: cnt } = await pool.query(
    `SELECT count(*)::int AS n FROM point_transactions t ${where}`,
    source && SOURCES.includes(source) ? [userId, source] : [userId]);
  return { transactions: rows, total: cnt[0]?.n || 0 };
}

/** خلاصهٔ منابعِ امتیازِ یک کاربر — برای نمودارِ تفکیک. */
async function summary(userId) {
  const [bySource, biggest, totals] = await Promise.all([
    pool.query(
      `SELECT source, count(*)::int AS n,
              SUM(delta)::int AS total,
              MAX(delta)::int AS best
         FROM point_transactions
        WHERE user_id = $1
        GROUP BY source ORDER BY SUM(delta) DESC`, [userId]),
    // «بیشترین امتیازی که یدفه بدست اورده» — خواستهٔ صریحِ مالک.
    pool.query(
      `SELECT delta, source, description, created_at, reference_type
         FROM point_transactions
        WHERE user_id = $1 AND delta > 0
        ORDER BY delta DESC LIMIT 5`, [userId]),
    pool.query(
      `SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int AS earned,
              COALESCE(SUM(-delta) FILTER (WHERE delta < 0), 0)::int AS spent,
              COALESCE(SUM(delta), 0)::int AS net,
              count(*)::int AS n
         FROM point_transactions WHERE user_id = $1`, [userId]),
  ]);
  return {
    bySource: bySource.rows,
    biggestGains: biggest.rows,
    totals: totals.rows[0] || { earned: 0, spent: 0, net: 0, n: 0 },
  };
}

/**
 * جدولِ «بیشترین امتیازگیرندگان».
 *
 * ── چرا از دفتر و نه از `users.lifetime_points` ──
 *
 * `lifetime_points` عددِ تجمعی است و منبعش معلوم نیست. مالک صریحاً
 * خواست بداند امتیاز «از کار در اپلیکیشن و وب» از کجا آمده — یعنی
 * تفکیکِ منبع لازم است، که فقط دفتر می‌دهد.
 *
 * `windowDays` اجازه می‌دهد «این هفته» یا «این ماه» هم دیده شود، نه
 * فقط کلِ تاریخ.
 */
async function topEarners({ limit = 50, windowDays = null, source = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [lim];
  const conds = ['t.delta > 0'];
  if (windowDays) {
    params.push(Number(windowDays));
    conds.push(`t.created_at > NOW() - ($${params.length}::text || ' days')::interval`);
  }
  if (source && SOURCES.includes(source)) {
    params.push(source);
    conds.push(`t.source = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.mobile, u.nickname, u.first_name, u.last_name,
            u.current_points, u.lifetime_points,
            SUM(t.delta)::int      AS earned_in_window,
            MAX(t.delta)::int      AS biggest_single,
            count(*)::int          AS tx_count,
            MAX(t.created_at)      AS last_earned_at
       FROM point_transactions t
       JOIN users u ON u.id = t.user_id
      WHERE ${conds.join(' AND ')}
      GROUP BY u.id
      ORDER BY SUM(t.delta) DESC
      LIMIT $1`, params);
  return rows;
}

/**
 * جست‌وجوی کاربر با شمارهٔ موبایل — خواستهٔ صریحِ مالک.
 *
 * ⚠️ `normalizeMobile` اینجا **صدا زده نمی‌شود** و این عمدی است: مدیر
 *    ممکن است بخشی از شماره را تایپ کند («۹۱۲۳۴») و انتظارِ جست‌وجوی
 *    جزئی داشته باشد. نرمال‌سازی روی رشتهٔ ناقص، نتیجه را خراب می‌کند.
 *
 *    ولی ارقامِ فارسی **باید** تبدیل شوند، وگرنه مدیری که با کیبوردِ
 *    فارسی تایپ می‌کند هیچ‌وقت چیزی پیدا نمی‌کند — همان باگی که یک بار
 *    در ورودِ کاربران رخ داد.
 */
function toLatinDigits(s) {
  return String(s || '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

async function searchUsers(q, { limit = 25 } = {}) {
  const raw = toLatinDigits(q).trim();
  if (raw.length < 3) return [];
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  // جست‌وجو هم روی موبایل، هم روی نام و لقب — مدیر همیشه شماره ندارد.
  const { rows } = await pool.query(
    `SELECT u.id, u.mobile, u.nickname, u.first_name, u.last_name,
            u.current_points, u.lifetime_points, u.status, u.joined_at,
            COALESCE((SELECT SUM(delta)::int FROM point_transactions
                       WHERE user_id = u.id), 0) AS ledger_sum,
            COALESCE((SELECT count(*)::int FROM point_transactions
                       WHERE user_id = u.id), 0) AS tx_count
       FROM users u
      WHERE u.mobile ILIKE '%' || $1 || '%'
         OR COALESCE(u.nickname,'')   ILIKE '%' || $1 || '%'
         OR COALESCE(u.first_name,'') ILIKE '%' || $1 || '%'
         OR COALESCE(u.last_name,'')  ILIKE '%' || $1 || '%'
      ORDER BY u.lifetime_points DESC
      LIMIT $2`, [raw, lim]);
  return rows;
}

/**
 * ممیزیِ سلامتِ دفتر: کاربرانی که `SUM(delta)` با موجودی‌شان نمی‌خواند.
 *
 * برای کاربرانی که **قبل** از مایگریشنِ ۰۴۵ امتیاز داشته‌اند، اختلاف
 * طبیعی است (backfill عمداً انجام نشد). `onlyLedgered` آن‌ها را کنار
 * می‌گذارد تا فقط ناسازگاریِ واقعی دیده شود.
 */
async function drift({ onlyLedgered = true } = {}) {
  const having = onlyLedgered ? 'HAVING count(t.id) > 0 AND' : 'HAVING';
  const { rows } = await pool.query(
    `SELECT u.id, u.mobile, u.nickname, u.current_points,
            COALESCE(SUM(t.delta), 0)::int AS ledger_sum,
            count(t.id)::int AS tx_count
       FROM users u
       LEFT JOIN point_transactions t ON t.user_id = u.id
      GROUP BY u.id, u.current_points
      ${having} u.current_points <> COALESCE(SUM(t.delta), 0)
      ORDER BY abs(u.current_points - COALESCE(SUM(t.delta), 0)) DESC
      LIMIT 100`);
  return rows;
}

module.exports = {
  credit, debit, history, summary, topEarners, searchUsers, drift,
  SOURCES, toLatinDigits,
};
