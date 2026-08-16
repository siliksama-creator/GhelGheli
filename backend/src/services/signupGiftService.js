// ============================================================================
//  هدیهٔ امتیازِ عضویت
// ============================================================================
//
// مدیر یک عدد تعیین می‌کند و از آن لحظه هر کاربرِ تازه‌ثبت‌نام‌شده همان
// مقدار امتیاز را به‌عنوان خوش‌آمدگویی می‌گیرد.
//
// ── چرا سرویسِ جدا و نه چند خط داخلِ auth.js ──
//
// چون سه مصرف‌کننده دارد: مسیرِ ثبت‌نام (پرداخت)، پنلِ ادمین (خواندن و
// ذخیره) و بوت‌استرپِ کلاینت (نمایشِ «به کاربران جدید X امتیاز می‌دهیم»).
// اگر منطق داخلِ روت بماند، دومی و سومی کپی‌برداری می‌کنند و روزی یکی
// از سه نسخه عقب می‌ماند.
//
// ── تصمیم‌های عمدی ──
//
//   • پیش‌فرض `enabled:false` است. یک نصبِ تازه نباید بی‌آنکه کسی
//     خواسته باشد امتیاز پخش کند؛ مدیر باید آگاهانه روشنش کند.
//
//   • سقفِ ۱٬۰۰۰٬۰۰۰ — همان سقفِ اعطای دستی در `adminUsers.js`. یک صفرِ
//     اضافه در پنل نباید اقتصادِ لیگ را منفجر کند.
//
//   • `league:false` — امتیازِ هدیه نباید کاربر را در جدولِ لیگ بالا
//     ببرد. رتبهٔ لیگ با سکه تعیین می‌شود و امتیاز فقط تساوی‌شکن است؛
//     هدیهٔ یکسانِ همه، تساوی‌شکنِ بی‌معنایی است.
//
//   • بدونِ کمیسیونِ معرف — عمدی و هم‌راستا با `admin_adjust`. این پولِ
//     خانه است، نه دستاوردِ کاربر؛ نباید به شخصِ سوم پاداش بدهد.

const { pool } = require('../config/db');
const points = require('./pointService');

const MAX_GIFT = 1000000;

const DEFAULTS = {
  enabled: false,
  points: 0,
  message: 'به قلقلی خوش آمدی! این امتیاز هدیهٔ عضویت توست.',
};

function normalize(v) {
  if (!v || typeof v !== 'object') return { ...DEFAULTS };
  const n = Number(v.points);
  const amount = Number.isFinite(n) && n > 0 ? Math.min(MAX_GIFT, Math.floor(n)) : 0;
  return {
    // روشن‌بودن بدونِ مبلغ بی‌معنی است؛ همان‌جا خاموش حساب می‌شود تا
    // پنل و بک‌اند دو روایتِ متفاوت نگویند.
    enabled: Boolean(v.enabled) && amount > 0,
    points: amount,
    message: typeof v.message === 'string' && v.message.trim()
      ? v.message.trim().slice(0, 200)
      : DEFAULTS.message,
  };
}

async function getSignupGift(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key='signup_gift' LIMIT 1",
  );
  return normalize(rows[0]?.value);
}

async function saveSignupGift(body, adminId) {
  const current = await getSignupGift();
  const merged = normalize({
    enabled: body.enabled === undefined ? current.enabled : body.enabled,
    points: body.points === undefined ? current.points : body.points,
    message: body.message === undefined ? current.message : body.message,
  });
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('signup_gift',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,
       updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(merged), adminId || null],
  );
  return merged;
}

/**
 * پرداختِ هدیه به کاربرِ تازه.
 *
 * ⚠️ هرگز نباید ثبت‌نام را بشکند. اگر پرداخت به هر دلیلی شکست خورد،
 * کاربر باید اکانتش را داشته باشد و هدیه بی‌سروصدا صرف‌نظر شود —
 * «امتیاز نگرفتم» شکایتِ کوچکی است، «ثبت‌نامم انجام نشد» فاجعه است.
 *
 * @returns {Promise<number>} امتیازِ واقعاً پرداخت‌شده (۰ یعنی هیچ).
 */
async function payoutSignupGift(userId) {
  try {
    const gift = await getSignupGift();
    if (!gift.enabled || gift.points <= 0) return 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await points.credit(client, {
        userId,
        points: gift.points,
        source: 'signup_gift',
        description: gift.message,
        league: false,
      });
      await client.query('COMMIT');
      return gift.points;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return 0;
    } finally {
      client.release();
    }
  } catch (e) {
    return 0;
  }
}

module.exports = {
  getSignupGift, saveSignupGift, payoutSignupGift, MAX_GIFT, DEFAULTS,
};
