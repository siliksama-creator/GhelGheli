// ═════════════════════════════════════════════════════════════════════
// درگاه زرین‌پال — خریدِ مستقیم در وب و اندروید (خواستهٔ مالک ۲۰۲۶-۰۹-۲۳)
// ═════════════════════════════════════════════════════════════════════
// چرا این سرویس جداست: تنظیماتش **زنده** از پنل ادمین می‌آید (app_settings)
// نه از .env — مالک خواست «ثبت و قرار دادنش بصورت لایو از طریق پنل». پس
// هر درخواست تنظیمات را تازه می‌خواند (یک SELECT سبک) و بدون ری‌استارت
// فعال/غیرفعال می‌شود.
//
// جریانِ پرداخت (نسخهٔ ۴ زرین‌پال):
//   ۱. کلاینت  POST /api/payments/zarinpal/order  → authority + startPayUrl
//   ۲. کاربر   در مرورگر به درگاه می‌رود و پرداخت می‌کند
//   ۳. زرین‌پال GET /api/payments/zarinpal/callback?Authority=..&Status=OK
//      سرور verify می‌کند، داخل تراکنش تحویل می‌دهد و مرورگر را به صفحهٔ
//      نتیجهٔ اپ برمی‌گرداند.
//   ۴. کلاینت (به‌خصوص اندروید که از مرورگر برمی‌گردد) وضعیت سفارش را
//      با GET /api/payments/zarinpal/order/:id پول می‌کند.
//
// امنیت: مبلغِ verify از خودِ سفارش خوانده می‌شود نه از پرس‌استرینگ؛
// تحویل فقط با ادعای pending→paid (رقابتِ هم‌زمان برد ندارد) و توکنِ
// یکتا؛ و مقصدِ ریدایرکت فقط Origینی است که در allow-list کرس باشد
// (جلوگیری از open-redirect).
const { pool } = require('../config/db');

const API_BASE = 'https://api.zarinpal.com/pg/v4/payment';
const SANDBOX_API_BASE = 'https://sandbox.zarinpal.com/pg/v4/payment';
const apiBase = (sandbox) => sandbox ? SANDBOX_API_BASE : API_BASE;

const SETTING_KEYS = {
  enabled: 'payment_zarinpal_enabled',
  merchant: 'payment_zarinpal_merchant_id',
  sandbox: 'payment_zarinpal_sandbox',
};

/** پیام‌های فارسی کدهای رایج زرین‌پال — بقیه: پیامِ عمومی. */
const CODE_MESSAGES = {
  '-1': 'اطلاعات ارسال‌شده به درگاه ناقص است',
  '-2': 'آی‌پی یا مرچنت‌کد نامعتبر است',
  '-3': 'درگاه زرین‌پال در دسترس نیست',
  '-4': 'سطح تأیید پذیرنده برای این مبلغ کافی نیست',
  '-9': 'خطای ارتباط با درگاه؛ دوباره تلاش کنید',
  '-10': 'ای‌پی برای پذیرنده معتبر نیست',
  '-11': 'مرچنت‌کد فعال نیست',
  '-12': 'مرچنت‌کد مسدود شده است',
  '-21': 'حساب کاربری زرین‌پال تأیید نشده است',
  101: 'این پرداخت قبلاً تأیید شده است',
  102: 'کاربر از پرداخت انصراف داد',
  103: 'سفارش پرداخت باطل شده است',
  104: 'سفارش پرداخت منقضی شده است',
  '-30': 'امکان برگشت وجه وجود ندارد',
  '-40': 'متد تعریف‌شده برای درگاه معتبر نیست',
  '-41': 'هزینه‌گذاری نامعتبر است',
  '-50': 'طولانی‌بودن بیش از حد رشتهٔ توضیحات',
  '-51': 'مبلغ با تعداد اعشار مجاز نمی‌خواند',
  '-52': 'مبلغ از حداقل مجاز درگاه کمتر است',
  '-53': 'مبلغ از سقف مجاز پذیرنده بیشتر است',
};

function messageForCode(code) {
  const c = String(code);
  return CODE_MESSAGES[c] || `درگاه خطا داد (کد ${c})؛ دوباره تلاش کنید`;
}

/** تومان → ریال (زرین‌پال مبلغ را به ریال می‌خواهد). */
function tomanToRial(toman) {
  return Math.trunc(Number(toman) || 0) * 10;
}

async function readSettings() {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [[SETTING_KEYS.enabled, SETTING_KEYS.merchant, SETTING_KEYS.sandbox]]
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merchant = String(map[SETTING_KEYS.merchant] || '').trim();
  return {
    enabled: String(map[SETTING_KEYS.enabled] || 'false') === 'true',
    sandbox: String(map[SETTING_KEYS.sandbox] || 'false') === 'true',
    merchantId: merchant,
  };
}

const MERCHANT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function merchantLooksValid(id) {
  return MERCHANT_RE.test(String(id || '').trim());
}

async function configured() {
  const s = await readSettings();
  return s.enabled && merchantLooksValid(s.merchantId);
}

function startPayUrl(authority, sandbox) {
  const host = sandbox
    ? 'https://sandbox.zarinpal.com'
    : 'https://www.zarinpal.com';
  return `${host}/pg/StartPay/${authority}`;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw Object.assign(new Error('ارتباط با درگاه برقرار نشد'), { status: 502 });
  return res.json();
}

/**
 * ساختِ پرداخت. `amountRial` باید از سرور بیاید (نه کلاینت).
 * @returns {{authority:string, startPayUrl:string, code:number}}
 */
async function requestPayment({ amountRial, description, callbackUrl, orderId }) {
  const s = await readSettings();
  if (!s.enabled || !merchantLooksValid(s.merchantId)) {
    throw Object.assign(new Error('درگاه زرین‌پال فعال نیست'), { status: 503, code: 'GATEWAY_OFF' });
  }
  const json = await postJson(`${apiBase(s.sandbox)}/request.json`, {
    merchant_id: s.merchantId,
    amount: Math.trunc(Number(amountRial) || 0),
    description: String(description || 'خرید از قلقلی').slice(0, 100),
    callback_url: callbackUrl,
    metadata: { order_id: String(orderId || '') },
  });
  const code = Number(json?.data?.code ?? json?.errors?.code ?? 0);
  if (code !== 100 || !json?.data?.authority) {
    throw Object.assign(
      new Error(messageForCode(code || json?.errors?.code || 'unknown')),
      { status: 402, gatewayCode: code }
    );
  }
  return {
    authority: String(json.data.authority),
    startPayUrl: startPayUrl(json.data.authority, s.sandbox),
    code,
  };
}

/**
 * راستی‌آزمایی پس از بازگشت کاربر. مبلغ (ریال) از سفارشِ خودمان می‌آید.
 * کد ۱۰۰ = موفق، ۱۰۱ = قبلاً تأیید شده (همچنان موفق — یعنی کال‌بک دوم).
 */
async function verifyPayment({ amountRial, authority }) {
  const s = await readSettings();
  // خاموش‌کردنِ درگاه از پنل نباید پرداختِ در حالِ بازگشت را خراب کند؛
  // مرچنتِ ثبت‌شده برای verify کافی است. روشن/خاموش فقط ساختِ سفارشِ تازه را کنترل می‌کند.
  if (!merchantLooksValid(s.merchantId)) {
    throw Object.assign(new Error('مرچنت‌کد زرین‌پال تنظیم نشده است'), { status: 503, code: 'GATEWAY_OFF' });
  }
  const json = await postJson(`${apiBase(s.sandbox)}/verify.json`, {
    merchant_id: s.merchantId,
    authority: String(authority || ''),
    amount: Math.trunc(Number(amountRial) || 0),
  });
  const code = Number(json?.data?.code ?? json?.errors?.code ?? 0);
  return {
    ok: code === 100 || code === 101,
    alreadyVerified: code === 101,
    code,
    refId: json?.data?.ref_id ?? null,
    message: code === 100 || code === 101 ? 'ok' : messageForCode(code),
    raw: json,
  };
}


/**
 * آمارِ سفارش‌های زرین‌پال برای داشبورد، صفحهٔ درگاه و تحلیل رشد.
 * همهٔ مبلغ‌ها تومان‌اند (ستون `payment_orders.amount`).
 */
async function stats() {
  const [{ rows: byStatus }, { rows: today }, { rows: month }, { rows: recent }] = await Promise.all([
    pool.query(
      `SELECT status, count(*)::int AS count,
              COALESCE(SUM(amount),0)::bigint AS amount
         FROM payment_orders WHERE provider='zarinpal'
        GROUP BY status`),
    pool.query(
      `SELECT count(*)::int AS count,
              COALESCE(SUM(amount),0)::bigint AS amount
         FROM payment_orders
        WHERE provider='zarinpal' AND status='paid'
          AND (paid_at AT TIME ZONE 'Asia/Tehran')::date
              = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date`),
    pool.query(
      `SELECT count(*)::int AS count,
              COALESCE(SUM(amount),0)::bigint AS amount
         FROM payment_orders
        WHERE provider='zarinpal' AND status='paid'
          AND date_trunc('month', paid_at AT TIME ZONE 'Asia/Tehran')
              = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')`),
    pool.query(
      `SELECT o.id, o.amount, o.status, o.purchase_kind, o.plus_cycle,
              o.created_at, o.paid_at, o.wallet_amount,
              u.nickname, u.mobile
         FROM payment_orders o
         JOIN users u ON u.id = o.user_id
        WHERE o.provider='zarinpal'
        ORDER BY o.created_at DESC
        LIMIT 40`),
  ]);
  const paid = byStatus.find((r) => r.status === 'paid') || { count: 0, amount: 0 };
  return {
    byStatus: byStatus.map((r) => ({
      status: r.status, count: r.count, amount: Number(r.amount),
    })),
    paidCount: Number(paid.count || 0),
    paidAmount: Number(paid.amount || 0),
    todayCount: Number(today[0]?.count || 0),
    todayAmount: Number(today[0]?.amount || 0),
    monthCount: Number(month[0]?.count || 0),
    monthAmount: Number(month[0]?.amount || 0),
    recent: recent.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      walletAmount: Number(r.wallet_amount || 0),
      status: r.status,
      kind: r.purchase_kind,
      cycle: r.plus_cycle,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      nickname: r.nickname,
      mobile: r.mobile,
    })),
  };
}

module.exports = {
  readSettings,
  configured,
  stats,
  merchantLooksValid,
  requestPayment,
  verifyPayment,
  startPayUrl,
  messageForCode,
  tomanToRial,
  SETTING_KEYS,
};
