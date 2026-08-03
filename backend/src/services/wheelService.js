// گردونهٔ شانس — انتخاب جایزه، سهمیهٔ روزانه، و پرداخت.
//
// ─────────────────────────────────────────────────────────────────────────
// چرا انتخاب جایزه فقط سمت سرور است
//
// یک endpoint که مبلغ را از بدنهٔ درخواست بگیرد، یعنی هر کسی با یک خط curl
// هر مبلغی برای خودش واریز می‌کند. کلاینت فقط می‌گوید «چرخاندم»؛ سرور
// تصمیم می‌گیرد چه چیزی برنده شده و بعد به کلاینت می‌گوید سوزن را کجا
// متوقف کند. انیمیشن از روی جواب سرور ساخته می‌شود، نه برعکس.
//
// ─────────────────────────────────────────────────────────────────────────
// چرا crypto.randomInt و نه Math.random
//
// Math.random در V8 از xorshift128+ استفاده می‌کند: سریع، ولی حالت داخلی‌اش
// از روی چند خروجی قابل بازسازی است. برای جایزه‌ای که پول واقعی است، یک
// مهاجم که چند چرخش را ببیند نباید بتواند چرخش بعدی را پیش‌بینی کند و
// زمان‌بندی کند. crypto.randomInt از CSPRNG سیستم می‌خواند و سوگیری پیمانه‌ای
// (modulo bias) هم ندارد — که خودِ `% n` روی یک عدد تصادفی دارد.
const crypto = require('crypto');
const { pool } = require('../config/db');
const referrals = require('./referralService');

/** مخرج مشترک وزن‌ها. جمع وزن جوایز فعال باید دقیقاً همین باشد.
 *
 * از ۱۰٬۰۰۰ به یک میلیون رفت. دلیل: با مخرج ۱۰٬۰۰۰ کمترین نرخِ قابل بیان
 * «۱ در ۱۰٬۰۰۰» بود، ولی مالک خواست جوایز بزرگ «به احتمال خیلی خیلی کم
 * نزدیک» باشند — و حالا که چرخش‌های روزانه می‌توانند تا ۶ برابر شوند،
 * ۱ در ۱۰٬۰۰۰ دیگر کم نیست. با یک میلیون، «۱ در ۲۰۰٬۰۰۰» هم دقیق بیان
 * می‌شود. */
const WEIGHT_TOTAL = 10000000;

/**
 * چرخش‌های نمایشی برای حساب‌های نامحدود.
 *
 * Infinity واقعی به JSON نمی‌رود (به null تبدیل می‌شود) و کلاینت‌ها با آن
 * حساب می‌کنند. یک عدد بزرگ ولی متناهی، هم در UI درست نشان داده می‌شود و
 * هم هیچ‌وقت در عمل تمام نمی‌شود.
 */
const UNLIMITED_DISPLAY = 999999;

/**
 * روز جاری در تهران به شکل YYYY-MM-DD.
 *
 * دقیقاً همان تابع tapGameService — و عمداً کپی شده نه import، چون این دو
 * ماژول نباید به هم وابسته شوند؛ ولی هر دو باید یک جواب بدهند. اگر روزی
 * سومی هم لازم شد، وقتش است که به یک util مشترک منتقل شود.
 *
 * چرا تهران و نه ساعت دستگاه: وگرنه سهمیهٔ تازه فقط یک بار عوض کردن
 * تنظیمات فاصله دارد. چرا نه UTC: ساعت ۳:۳۰ بامداد می‌چرخد.
 */
function tehranDay(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** میلی‌ثانیه تا نیمه‌شب تهران، برای شمارش معکوس صادقانه در کلاینت. */
function msUntilTehranMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const elapsed = ((get('hour') % 24) * 3600 + get('minute') * 60
    + get('second')) * 1000;
  return 86400000 - elapsed;
}

/**
 * نرمال‌سازی ستون DATE که pg برمی‌گرداند.
 *
 * node-postgres یک DATE را به نیمه‌شبِ *محلی* تبدیل می‌کند. ساعت سرور
 * Asia/Tehran است، پس ۲۰۲۶-۰۸-۰۳ به شکل ۲۰۲۶-۰۸-۰۲T20:30:00Z برمی‌گردد و
 * خواندنش با فرمت UTC «روز قبل» می‌دهد. این باگ دقیقاً یک بار در سقف روزانهٔ
 * بازی ضربه‌زن اتفاق افتاد و فقط تست end-to-end گرفتش — اینجا از اول درست.
 */
function storedDay(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** جوایز فعال، به ترتیب برش‌ها. */
async function prizes(client = pool) {
  const { rows } = await client.query(
    `SELECT id, label, kind, value, weight, slice_order, color
       FROM wheel_prizes WHERE is_active = true
      ORDER BY slice_order`);
  return rows;
}

/**
 * انتخاب یک جایزه بر اساس وزن.
 *
 * روش: یک عدد تصادفی در [0, مجموع وزن‌ها) و پیمایش تجمعی. ساده و بی‌سوگیری.
 *
 * اگر جمع وزن‌ها با WEIGHT_TOTAL نخواند، **خطا می‌دهیم** به‌جای اینکه
 * نرمال‌سازی کنیم. دلیل: نخواندن یعنی کسی وزنی را اشتباه ویرایش کرده، و
 * نرمال‌سازی خودکار آن اشتباه را بی‌صدا قبول می‌کند — احتمالات از آن به بعد
 * چیزی می‌شوند که هیچ‌کس قصدش را نداشته. بهتر است گردونه موقتاً کار نکند تا
 * اینکه بی‌سروصدا پول اشتباه بدهد.
 */
function pickPrize(list) {
  const total = list.reduce((s, p) => s + p.weight, 0);
  if (total !== WEIGHT_TOTAL) {
    throw Object.assign(
      new Error(`جمع وزن جوایز باید ${WEIGHT_TOTAL} باشد ولی ${total} است`),
      { status: 500 });
  }
  // بازهٔ [0, total) — randomInt کران بالا را شامل نمی‌شود.
  const roll = crypto.randomInt(0, total);
  let acc = 0;
  for (const p of list) {
    acc += p.weight;
    if (roll < acc) return p;
  }
  // غیرقابل دسترس چون roll < total = acc نهایی؛ برای اطمینان.
  return list[list.length - 1];
}

/**
 * وضعیت گردونه برای یک کاربر: چند چرخش دارد و کی سهمیهٔ بعدی می‌آید.
 */
async function status(userId) {
  const today = tehranDay();
  const [prizeRows, spun, user, invites] = await Promise.all([
    prizes(),
    // COUNT، نه EXISTS: سهمیهٔ روزانه دیگر همیشه ۱ نیست. کاربری که ۲۰ نفر
    // دعوت کرده روزی ۳ چرخش دارد، پس باید بدانیم چندتا خرج شده.
    pool.query(
      `SELECT COUNT(*)::int AS n FROM wheel_spins
        WHERE user_id = $1 AND spin_source = 'daily' AND spun_day = $2::date`,
      [userId, today]),
    pool.query(
      'SELECT bonus_spins, unlimited_spins FROM users WHERE id = $1',
      [userId]),
    referrals.invitedCount(userId),
  ]);

  const unlimited = user.rows[0]?.unlimited_spins === true;
  const usedToday = spun.rows[0].n;
  const dailyQuota = referrals.dailySpinsFor(invites);
  const dailyLeft = unlimited
    ? UNLIMITED_DISPLAY
    : Math.max(0, dailyQuota - usedToday);
  const bonus = Number(user.rows[0]?.bonus_spins) || 0;

  return {
    prizes: prizeRows.map((p) => ({
      id: p.id, label: p.label, kind: p.kind,
      value: p.value, color: p.color, sliceOrder: p.slice_order,
      // وزن عمداً به کلاینت نمی‌رود: نه لازمش دارد، و نمایشش فقط باعث
      // می‌شود کاربر شانس واقعی‌اش را حساب کند و دلسرد شود.
    })),
    dailyQuota: unlimited ? UNLIMITED_DISPLAY : dailyQuota,
    dailyLeft,
    dailyAvailable: dailyLeft > 0,
    bonusSpins: bonus,
    // کلاینت با این پرچم به‌جای عدد، «∞» نشان می‌دهد — یک «۹۹۹۹۹۹ شانس»
    // روی دکمه هم زشت است و هم گیج‌کننده.
    unlimited,
    // مجموع چرخش‌های قابل استفاده همین حالا — همان عددی که کنار آیکون
    // گردونه در صفحهٔ اصلی نشان داده می‌شود.
    spinsLeft: dailyLeft + bonus,
    invitedCount: invites,
    resetInMs: msUntilTehranMidnight(),
  };
}

/**
 * یک چرخش. برمی‌گرداند: جایزه، و وضعیت جدید.
 *
 * ترتیب کارها مهم است و عمدی:
 *   ۱. تراکنش باز شود و ردیف کاربر قفل شود (FOR UPDATE).
 *   ۲. سهمیهٔ امروز شمرده شود — *بعد* از قفل، وگرنه دو درخواست هم‌زمان هر
 *      دو عدد قدیمی را می‌بینند.
 *   ۳. جایزه انتخاب شود.
 *   ۴. ردیف چرخش درج شود.
 *   ۵. جایزه پرداخت شود.
 *
 * درج **قبل** از پرداخت است تا هیچ مسیری نباشد که پول پرداخت شود ولی
 * چرخش ثبت نشود.
 *
 * قفل ردیف کاربر (FOR UPDATE) حالا تنها چیزی است که مسابقه را می‌بندد.
 * قبلاً یک ایندکس یکتا روی (user_id, spun_day) هم بود، ولی آن فرض می‌کرد
 * سهمیهٔ روزانه همیشه ۱ است. حالا که می‌تواند تا ۶ باشد، آن ایندکس باید
 * برداشته شود — و کل بار درستی روی قفل می‌افتد. به همین دلیل شمارش
 * **داخل** تراکنش و **بعد** از قفل انجام می‌شود.
 */
async function spin(userId, { creditCash, addPoints }) {
  const today = tehranDay();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // قفل کاربر: دو درخواست هم‌زمان باید پشت سر هم اجرا شوند، وگرنه هر دو
    // bonus_spins قدیمی را می‌خوانند و یکی از کسرها گم می‌شود.
    const u = await client.query(
      'SELECT bonus_spins, unlimited_spins FROM users WHERE id = $1 FOR UPDATE',
      [userId]);
    if (!u.rows[0]) {
      throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });
    }
    const bonus = Number(u.rows[0].bonus_spins) || 0;
    const unlimited = u.rows[0].unlimited_spins === true;

    // شمارش داخل تراکنش و بعد از قفل — این ترتیب همان چیزی است که جای
    // ایندکس یکتای حذف‌شده را می‌گیرد.
    const spunToday = await client.query(
      `SELECT COUNT(*)::int AS n FROM wheel_spins
        WHERE user_id = $1 AND spin_source = 'daily' AND spun_day = $2::date`,
      [userId, today]);

    const invites = await referrals.invitedCount(userId, client);
    const dailyQuota = referrals.dailySpinsFor(invites);
    // حساب نامحدود (تست مالک): سهمیه هرگز تمام نمی‌شود. ردیف چرخش
    // همچنان ثبت می‌شود تا آمار و تاریخچه واقعی بماند.
    const dailyLeft = unlimited
      ? UNLIMITED_DISPLAY
      : Math.max(0, dailyQuota - spunToday.rows[0].n);

    // سهمیهٔ روزانه اول خرج می‌شود، بعد چرخش‌های جایزه‌ای. اگر برعکس بود،
    // کاربری که هم سهمیهٔ روزانه دارد و هم جایزه، جایزه‌اش را خرج می‌کرد و
    // سهمیهٔ روزانهٔ امروزش سر نیمه‌شب می‌سوخت.
    const useDaily = dailyLeft > 0;
    if (!useDaily && bonus <= 0) {
      throw Object.assign(
        new Error('چرخش امروزت تمام شده — فردا دوباره سر بزن'),
        { status: 429 });
    }

    const list = await prizes(client);
    if (!list.length) {
      throw Object.assign(new Error('گردونه فعلاً جایزه‌ای ندارد'), { status: 503 });
    }
    const prize = pickPrize(list);

    let spinRow;
    try {
      const ins = await client.query(
        `INSERT INTO wheel_spins
           (user_id, prize_id, prize_label, prize_kind, prize_value,
            spin_source, spun_day)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date) RETURNING id`,
        [userId, prize.id, prize.label, prize.kind, prize.value,
          useDaily ? 'daily' : 'referral', today]);
      spinRow = ins.rows[0];
    } catch (e) {
      // 23505 اینجا دیگر انتظار نمی‌رود (ایندکس یکتای روزانه برداشته شد)،
      // ولی اگر روزی قید تازه‌ای اضافه شود، بهتر است پیام درست بدهد تا
      // یک ۵۰۰ مبهم.
      if (e.code === '23505') {
        throw Object.assign(
          new Error('این چرخش قبلاً ثبت شده'), { status: 429 });
      }
      throw e;
    }

    // حساب نامحدود چیزی خرج نمی‌کند — نه سهمیهٔ روزانه (که بی‌نهایت است)
    // و نه چرخش جایزه‌ای، وگرنه تست کردن، جایزه‌های واقعی مالک را می‌سوزاند.
    if (!useDaily && !unlimited) {
      await client.query(
        'UPDATE users SET bonus_spins = bonus_spins - 1, updated_at = NOW() WHERE id = $1',
        [userId]);
    }

    // پرداخت. هر دو تابع تزریق‌شده‌اند تا این سرویس به server.js وابسته
    // نشود (وگرنه require حلقوی می‌شود) و تست بتواند بدون دیتابیس اجرا کند.
    if (prize.kind === 'points') {
      await addPoints(client, userId, prize.value, 'wheel');
    } else {
      await creditCash(client, userId, prize.value, spinRow.id, prize.label);
    }

    await client.query('COMMIT');

    const remainingBonus = (useDaily || unlimited) ? bonus : bonus - 1;
    const remainingDaily = unlimited
      ? UNLIMITED_DISPLAY
      : (useDaily ? dailyLeft - 1 : dailyLeft);
    return {
      spinId: spinRow.id,
      prize: {
        id: prize.id, label: prize.label, kind: prize.kind,
        value: prize.value, color: prize.color, sliceOrder: prize.slice_order,
      },
      dailyQuota: unlimited ? UNLIMITED_DISPLAY : dailyQuota,
      dailyLeft: remainingDaily,
      dailyAvailable: remainingDaily > 0,
      bonusSpins: remainingBonus,
      spinsLeft: remainingDaily + remainingBonus,
      invitedCount: invites,
      unlimited,
      resetInMs: msUntilTehranMidnight(),
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** تاریخچهٔ چرخش‌های کاربر. */
async function history(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT prize_label, prize_kind, prize_value, spin_source, created_at
       FROM wheel_spins WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 20, 1), 100)]);
  return rows.map((r) => ({
    label: r.prize_label, kind: r.prize_kind, value: r.prize_value,
    source: r.spin_source, at: r.created_at,
  }));
}

/**
 * آمار واقعی گردونه، برای پنل مدیر.
 *
 * بدون این، هیچ راهی نیست بفهمیم نرخ واقعی با نرخ طراحی‌شده می‌خواند یا نه.
 * ستون «انتظار» از روی همان وزن‌ها حساب می‌شود تا مقایسه مستقیم باشد.
 */
async function stats() {
  const [{ rows: byPrize }, { rows: totals }, list] = await Promise.all([
    pool.query(
      `SELECT prize_label, prize_kind, prize_value, COUNT(*)::int AS hits
         FROM wheel_spins GROUP BY 1,2,3 ORDER BY 4 DESC`),
    pool.query(
      `SELECT COUNT(*)::int AS spins,
              COALESCE(SUM(CASE WHEN prize_kind='cash'   THEN prize_value END),0)::bigint AS cash_paid,
              COALESCE(SUM(CASE WHEN prize_kind='points' THEN prize_value END),0)::bigint AS points_paid,
              COUNT(DISTINCT user_id)::int AS players
         FROM wheel_spins`),
    prizes(),
  ]);

  const spins = totals[0].spins;
  const expectedCashPerSpin = list.reduce(
    (s, p) => s + (p.kind === 'cash' ? (p.weight / WEIGHT_TOTAL) * p.value : 0), 0);

  return {
    spins,
    players: totals[0].players,
    cashPaid: Number(totals[0].cash_paid),
    pointsPaid: Number(totals[0].points_paid),
    // هزینهٔ نقدی مورد انتظار در برابر واقعی — اگر واقعی خیلی بالاتر بود،
    // یا بدشانسی است یا وزن‌ها دستکاری شده‌اند.
    expectedCashPerSpin: Math.round(expectedCashPerSpin * 100) / 100,
    actualCashPerSpin: spins ? Math.round(Number(totals[0].cash_paid) / spins * 100) / 100 : 0,
    byPrize: byPrize.map((r) => ({
      label: r.prize_label, kind: r.prize_kind,
      value: r.prize_value, hits: r.hits,
      expectedRate: (() => {
        const p = list.find((x) => x.label === r.prize_label
          && x.value === r.prize_value);
        return p ? p.weight / WEIGHT_TOTAL : null;
      })(),
      actualRate: spins ? r.hits / spins : 0,
    })),
  };
}

module.exports = {
  prizes, status, spin, history, stats,
  // برای تست
  pickPrize, tehranDay, msUntilTehranMidnight, storedDay,
  WEIGHT_TOTAL, UNLIMITED_DISPLAY,
};
