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
const grants = require('./grantService');

/** انواعِ جایزه‌ای که پنل ادمین می‌تواند روی گردونه بگذارد. */
const PRIZE_KINDS = Object.freeze([
  'points', 'cash', 'card_box', 'shop_item', 'plus_days',
]);

/** مخرج مشترک وزن‌ها. جمع وزن جوایز فعال باید دقیقاً همین باشد.
 *
 * از ۱۰٬۰۰۰ به یک میلیون رفت. دلیل: با مخرج ۱۰٬۰۰۰ کمترین نرخِ قابل بیان
 * «۱ در ۱۰٬۰۰۰» بود، ولی مالک خواست جوایز بزرگ «به احتمال خیلی خیلی کم
 * نزدیک» باشند — و حالا که چرخش‌های روزانه می‌توانند تا ۶ برابر شوند،
 * ۱ در ۱۰٬۰۰۰ دیگر کم نیست. با یک میلیون، «۱ در ۲۰۰٬۰۰۰» هم دقیق بیان
 * می‌شود. */
const WEIGHT_TOTAL = 10000000;

/**
 * وزن صحیح ↔ درصد انسانی.
 *
 * پنل با درصد فکر می‌کند («این برش ۲۰٪ باشد»). قرعه با عدد صحیح.
 * تبدیل اینجاست تا وب و اندروید هر کدام فرمول خودشان را نسازند و
 * ۲۰.۷٪ یکی ۲۰۷۰۰۰۰ شود و دیگری ۲۰۶۹۸۱۶.
 *
 * پنج رقم اعشار کوچک‌ترین واحد را پوشش می‌دهد: ۱ / ۱۰٬۰۰۰٬۰۰۰ = ۰.۰۰۰۰۱٪.
 */
function weightToPercent(weight, total = WEIGHT_TOTAL) {
  const w = Number(weight);
  const t = Number(total);
  if (!Number.isFinite(w) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.round((w * 100 / t) * 1e5) / 1e5;
}

function percentToWeight(percent, total = WEIGHT_TOTAL) {
  const p = Number(percent);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.round(p * t / 100);
}

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
    `SELECT id, label, kind, value, weight, slice_order, color, payload
       FROM wheel_prizes WHERE is_active = true
      ORDER BY slice_order`);
  return rows;
}

function publicPrize(p) {
  const payload = p.payload && typeof p.payload === 'object' ? p.payload : {};
  return {
    id: p.id,
    label: p.label,
    kind: p.kind,
    value: p.value,
    color: p.color,
    sliceOrder: p.slice_order,
    // شانس به درصد — نه وزن خام. کلاینت‌ها جدول شانس را از همین
    // می‌سازند تا عوض کردن پنل بدون آپدیت اپ روی وب و اندروید دیده شود.
    // وزن خام عمداً نمی‌رود: عدد ده میلیونی فقط ابزار داخلی ذخیره است.
    percent: weightToPercent(p.weight),
    itemSlug: payload.itemSlug || payload.item_slug || null,
  };
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
    prizes: prizeRows.map(publicPrize),
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

    // پرداخت. توابع نقدی/امتیازی تزریق شده‌اند تا این سرویس به server.js
    // وابسته نشود. صندوق/آیتم/پلاس از grantService می‌گذرند تا کاربر
    // صندوقِ بسته‌اش را بعداً باز کند — نه اینکه کارت همان لحظه بریزد.
    let grant = null;
    if (prize.kind === 'points') {
      await addPoints(client, userId, prize.value, 'wheel');
    } else if (prize.kind === 'cash') {
      await creditCash(client, userId, prize.value, spinRow.id, prize.label);
    } else if (prize.kind === 'card_box') {
      // value = تعداد صندوق (۱ تا ۵). هر صندوق ردیف جداست تا کاربر
      // بتواند یکی‌یکی باز کند — نه اینکه یک تپ هر سه را بسوزاند.
      const awarded = await grants.awardBoxes(client, {
        userId,
        count: prize.value,
        label: prize.label,
        source: 'wheel',
        sourceRef: spinRow.id,
      });
      grant = awarded.grant;
    } else if (PRIZE_KINDS.includes(prize.kind)) {
      const payload = prize.payload && typeof prize.payload === 'object'
        ? prize.payload : {};
      const awarded = await grants.award(client, {
        userId,
        kind: prize.kind,
        value: prize.value,
        itemSlug: payload.itemSlug || payload.item_slug || null,
        label: prize.label,
        source: 'wheel',
        sourceRef: spinRow.id,
      });
      grant = awarded.grant;
    } else {
      throw Object.assign(
        new Error(`نوع جایزهٔ ناشناخته: ${prize.kind}`), { status: 500 });
    }

    await client.query('COMMIT');

    const remainingBonus = (useDaily || unlimited) ? bonus : bonus - 1;
    const remainingDaily = unlimited
      ? UNLIMITED_DISPLAY
      : (useDaily ? dailyLeft - 1 : dailyLeft);
    return {
      spinId: spinRow.id,
      prize: {
        ...publicPrize(prize),
        grantId: grant?.id || null,
        pending: grant?.pending === true,
      },
      grant,
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

async function listAll() {
  const { rows } = await pool.query(
    `SELECT id, label, kind, value, weight, slice_order, color, payload, is_active
       FROM wheel_prizes ORDER BY slice_order, created_at`);
  return rows.map((p) => {
    const payload = p.payload && typeof p.payload === 'object' ? p.payload : {};
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      value: Number(p.value),
      weight: Number(p.weight),
      percent: weightToPercent(Number(p.weight)),
      sliceOrder: p.slice_order,
      color: p.color,
      isActive: p.is_active !== false,
      itemSlug: payload.itemSlug || payload.item_slug || null,
      payload,
    };
  });
}

function hexColor(v, fallback = '#84CC16') {
  const s = String(v || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

async function saveAll(rawList) {
  if (!Array.isArray(rawList) || rawList.length < 2) {
    throw Object.assign(
      new Error('گردونه حداقل دو برش لازم دارد'), { status: 400 });
  }
  if (rawList.length > 24) {
    throw Object.assign(
      new Error('گردونه حداکثر ۲۴ برش می‌تواند داشته باشد'), { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const seenOrder = new Set();
  const cleaned = [];
  for (const row of rawList) {
    const kind = String(row?.kind || '');
    if (!PRIZE_KINDS.includes(kind)) {
      throw Object.assign(
        new Error('نوع جایزه باید یکی از امتیاز، نقدی، صندوق، آیتم یا پلاس باشد'),
        { status: 400 });
    }
    const label = String(row?.label || '').trim().slice(0, 64);
    if (label.length < 2) {
      throw Object.assign(new Error('برچسب هر برش حداقل ۲ نویسه باشد'), { status: 400 });
    }
    const value = Math.trunc(Number(row?.value));
    if (!Number.isInteger(value) || value < 1 || value > 100_000_000) {
      throw Object.assign(
        new Error(`مقدار «${label}» باید عددی صحیح و بزرگ‌تر از صفر باشد`),
        { status: 400 });
    }
    if (kind === 'card_box' && value > 5) {
      throw Object.assign(
        new Error(`تعداد صندوق «${label}» حداکثر ۵ است`),
        { status: 400 });
    }
    // درصد یا وزن — هر دو یک چیزند. پنل درصد می‌فرستد؛ تست‌های قدیمی
    // و ذخیرهٔ دستی هنوز وزن می‌فرستند. اگر هر دو آمد، وزن منبع حقیقت
    // است چون تبدیل درصد ممکن است یک واحد گرد کند.
    let weight;
    if (row?.weight !== undefined && row?.weight !== null && row?.weight !== '') {
      weight = Math.trunc(Number(row.weight));
    } else if (row?.percent !== undefined && row?.percent !== null && row?.percent !== '') {
      weight = percentToWeight(row.percent);
    } else {
      throw Object.assign(
        new Error(`شانس «${label}» مشخص نشده`), { status: 400 });
    }
    if (!Number.isInteger(weight) || weight < 0 || weight > WEIGHT_TOTAL) {
      throw Object.assign(
        new Error(`شانس «${label}» نامعتبر است`), { status: 400 });
    }
    const sliceOrder = Math.trunc(Number(row?.sliceOrder ?? row?.slice_order));
    if (!Number.isInteger(sliceOrder) || sliceOrder < 1 || sliceOrder > 24) {
      throw Object.assign(
        new Error('ترتیب برش باید بین ۱ و ۲۴ باشد'), { status: 400 });
    }
    if (seenOrder.has(sliceOrder)) {
      throw Object.assign(
        new Error(`ترتیب برش ${sliceOrder} تکراری است`), { status: 400 });
    }
    seenOrder.add(sliceOrder);

    const isActive = row?.isActive !== false && row?.is_active !== false;
    const itemSlug = row?.itemSlug || row?.item_slug
      || row?.payload?.itemSlug || null;
    if (kind === 'shop_item' && isActive && !itemSlug) {
      throw Object.assign(
        new Error(`برای «${label}» باید آیتم فروشگاه انتخاب شود`), { status: 400 });
    }
    const id = row?.id && UUID_RE.test(String(row.id)) ? String(row.id) : null;
    cleaned.push({
      id,
      label,
      kind,
      // قبلاً card_box بی‌صدا ۱ می‌شد و فیلد «تعداد صندوق» دروغ می‌گفت.
      value,
      weight,
      sliceOrder,
      color: hexColor(row?.color),
      isActive,
      payload: kind === 'shop_item' ? { itemSlug: String(itemSlug).slice(0, 64) } : {},
    });
  }

  const activeWeight = cleaned
    .filter((p) => p.isActive)
    .reduce((s, p) => s + p.weight, 0);
  if (activeWeight !== WEIGHT_TOTAL) {
    throw Object.assign(
      new Error(
        `جمع شانس برش‌های فعال باید دقیقاً ۱۰۰٪ باشد `
        + `ولی الان ${weightToPercent(activeWeight)}٪ است`,
      ),
      { status: 400, code: 'WEIGHT_MISMATCH', expected: WEIGHT_TOTAL, actual: activeWeight },
    );
  }

  const slugs = [...new Set(
    cleaned.filter((p) => p.kind === 'shop_item' && p.payload.itemSlug)
      .map((p) => p.payload.itemSlug),
  )];
  if (slugs.length) {
    const { rows: found } = await pool.query(
      'SELECT slug FROM shop_items WHERE slug = ANY($1::text[])', [slugs]);
    const known = new Set(found.map((r) => r.slug));
    const missing = slugs.filter((s) => !known.has(s));
    if (missing.length) {
      throw Object.assign(
        new Error(`آیتم فروشگاه پیدا نشد: ${missing.join('، ')}`),
        { status: 400 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT id FROM wheel_prizes');
    const incomingIds = new Set(cleaned.filter((p) => p.id).map((p) => p.id));

    for (const p of cleaned) {
      const payload = JSON.stringify(p.payload);
      if (p.id) {
        const { rowCount } = await client.query(
          `UPDATE wheel_prizes SET
             label=$2, kind=$3, value=$4, weight=$5, slice_order=$6,
             color=$7, is_active=$8, payload=$9, updated_at=NOW()
           WHERE id=$1`,
          [p.id, p.label, p.kind, p.value, p.weight, p.sliceOrder,
            p.color, p.isActive, payload]);
        if (!rowCount) {
          throw Object.assign(new Error('یکی از برش‌ها پیدا نشد'), { status: 404 });
        }
      } else {
        await client.query(
          `INSERT INTO wheel_prizes
             (label, kind, value, weight, slice_order, color, is_active, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [p.label, p.kind, p.value, p.weight, p.sliceOrder,
            p.color, p.isActive, payload]);
      }
    }

    const omitted = existing.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (omitted.length) {
      await client.query(
        `UPDATE wheel_prizes SET is_active=false, updated_at=NOW()
          WHERE id = ANY($1::uuid[])`,
        [omitted]);
    }

    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(weight),0)::bigint AS s
         FROM wheel_prizes WHERE is_active = true`);
    const live = Number(sumRows[0].s);
    if (live !== WEIGHT_TOTAL) {
      throw Object.assign(
        new Error(`جمع وزن فعال بعد از ذخیره ${live} شد — ذخیره لغو شد`),
        { status: 400 });
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return listAll();
}

module.exports = {
  prizes, status, spin, history, stats,
  listAll, saveAll, publicPrize,
  pickPrize, tehranDay, msUntilTehranMidnight, storedDay,
  weightToPercent, percentToWeight,
  WEIGHT_TOTAL, UNLIMITED_DISPLAY, PRIZE_KINDS,
};
