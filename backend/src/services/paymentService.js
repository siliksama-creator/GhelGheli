// پرداخت درون‌برنامه‌ای — شارژ کیف پول از طریق کافه‌بازار
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا کافه‌بازار و نه درگاه بانکی مستقیم
// ═══════════════════════════════════════════════════════════════════════════
//
// اپ روی کافه‌بازار منتشر می‌شود و بازار برای فروش «محتوای دیجیتال»
// (اشتراک پلاس، قاب، نشان) استفاده از پرداخت درون‌برنامه‌ای خودش را
// الزامی می‌کند. اپی که مستقیم به درگاه بانکی می‌رود ریسک رد شدن در
// بازبینی دارد.
//
// ═══════════════════════════════════════════════════════════════════════════
// جریان کامل — و اینکه هر مرحله کجا می‌تواند بشکند
// ═══════════════════════════════════════════════════════════════════════════
//
//   ۱. کلاینت  POST /api/wallet/topup/order  { productId }
//      → سرور سفارش pending می‌سازد و id را برمی‌گرداند
//      ✗ اگر اینجا قطع شود: سفارش pending می‌ماند، ضرری ندارد
//
//   ۲. کلاینت با Poolakey از کاربر پول می‌گیرد
//      → یک purchaseToken می‌گیرد
//      ✗ اگر اینجا قطع شود: کاربر پول داده ولی سرور خبر ندارد.
//        برای همین مرحلهٔ ۳ از کلاینت **دوباره قابل ارسال** است.
//
//   ۳. کلاینت  POST /api/wallet/topup/verify  { orderId, purchaseToken }
//      → سرور توکن را از API بازار راستی‌آزمایی می‌کند
//      → فقط اگر بازار تأیید کرد، کیف پول شارژ می‌شود
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا مبلغ **هرگز** از کلاینت گرفته نمی‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// مبلغ فقط از `PRODUCTS` سمت سرور خوانده می‌شود. اگر مبلغ از بدنهٔ
// درخواست می‌آمد، هر کسی با یک curl می‌توانست برای خودش ۱۰ میلیون تومان
// شارژ کند. این همان اشتباهی است که در کامنت creditWheelPrize هم دربارهٔ
// گردونه هشدار داده شده.
const crypto = require('crypto');
const { pool } = require('../config/db');
const wallet = require('./walletService');

// ── محصولات ────────────────────────────────────────────────────────────
//
// `id` باید **دقیقاً** با شناسهٔ محصول در کنسول کافه‌بازار یکی باشد.
// قیمت‌ها طوری چیده شده‌اند که دو پلن پلاس (۵۹٬۰۰۰ و ۴۹۹٬۰۰۰) بدون
// باقی‌ماندهٔ بلااستفاده قابل خرید باشند.
const PRODUCTS = Object.freeze({
  ghelgheli_wallet_20000:  { amount: 20000,  label: '۲۰٬۰۰۰ تومان' },
  ghelgheli_wallet_50000:  { amount: 50000,  label: '۵۰٬۰۰۰ تومان' },
  ghelgheli_wallet_100000: { amount: 100000, label: '۱۰۰٬۰۰۰ تومان' },
  ghelgheli_wallet_200000: { amount: 200000, label: '۲۰۰٬۰۰۰ تومان' },
  ghelgheli_wallet_500000: { amount: 500000, label: '۵۰۰٬۰۰۰ تومان' },
});

const BAZAAR_API = 'https://pardakht.cafebazaar.ir';

function cfg() {
  return {
    packageName:  process.env.BAZAAR_PACKAGE_NAME || '',
    clientId:     process.env.BAZAAR_CLIENT_ID || '',
    clientSecret: process.env.BAZAAR_CLIENT_SECRET || '',
    refreshToken: process.env.BAZAAR_REFRESH_TOKEN || '',
    // در محیط توسعه اجازه می‌دهد بدون اتصال واقعی به بازار تست شود.
    // عمداً پیش‌فرضش false است: اگر کسی یادش برود در تولید خاموشش کند،
    // چیزی «به‌طور پیش‌فرض باز» نمی‌ماند.
    sandbox: process.env.BAZAAR_SANDBOX === 'true',
  };
}

function configured() {
  const c = cfg();
  return Boolean(c.packageName && c.clientId && c.clientSecret && c.refreshToken);
}

function fail(message, status = 400, code = null) {
  return Object.assign(new Error(message), { status, code });
}

// ── توکن دسترسی ────────────────────────────────────────────────────────
//
// بازار access_token کوتاه‌عمر می‌دهد (۱ ساعت). کش‌کردنش لازم است وگرنه
// هر verify یک رفت‌وبرگشت اضافه دارد و در پیک ممکن است rate-limit بخوریم.
let tokenCache = { value: null, expiresAt: 0 };

async function accessToken() {
  const now = Date.now();
  // ۶۰ ثانیه حاشیه: توکنی که در لحظهٔ استفاده منقضی شود بدتر از
  // توکنی است که کمی زود عوض شود.
  if (tokenCache.value && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.value;
  }
  const c = cfg();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
  });
  const res = await fetch(`${BAZAAR_API}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw fail('ارتباط با کافه‌بازار برقرار نشد', 502, 'BAZAAR_AUTH');
  }
  const json = await res.json();
  if (!json.access_token) throw fail('توکن کافه‌بازار نامعتبر است', 502, 'BAZAAR_AUTH');
  tokenCache = {
    value: json.access_token,
    expiresAt: now + (Number(json.expires_in || 3600) * 1000),
  };
  return tokenCache.value;
}

/**
 * خرید را از API کافه‌بازار راستی‌آزمایی می‌کند.
 *
 * برمی‌گرداند `{ ok, consumed, raw }`. هرگز به کلاینت اعتماد نمی‌کند.
 */
async function verifyWithBazaar(productId, purchaseToken) {
  const c = cfg();

  // حالت sandbox فقط برای توسعهٔ محلی. توکن باید با پیشوند مشخص باشد تا
  // یک توکن واقعیِ اشتباهی هرگز از این مسیر رد نشود.
  if (c.sandbox) {
    if (!String(purchaseToken).startsWith('SANDBOX-')) {
      throw fail('در حالت آزمایشی فقط توکن SANDBOX- پذیرفته می‌شود', 400);
    }
    return { ok: true, consumed: false, raw: { sandbox: true } };
  }

  const token = await accessToken();
  const url = `${BAZAAR_API}/devapi/v2/api/validate/`
    + `${encodeURIComponent(c.packageName)}/inapp/`
    + `${encodeURIComponent(productId)}/purchases/`
    + `${encodeURIComponent(purchaseToken)}/`;

  const res = await fetch(url, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 404) {
    return { ok: false, consumed: false, raw: { status: 404 } };
  }
  if (!res.ok) {
    throw fail('راستی‌آزمایی پرداخت ناموفق بود؛ کمی بعد دوباره تلاش کنید',
      502, 'BAZAAR_VERIFY');
  }
  const json = await res.json();
  // purchaseState: 0 = خریدِ موفق، 1 = لغو/بازپرداخت‌شده
  return {
    ok: Number(json.purchaseState) === 0,
    consumed: Number(json.consumptionState) === 1,
    raw: json,
  };
}

// ── مرحلهٔ ۱: ساخت سفارش ───────────────────────────────────────────────
async function createOrder(userId, productId) {
  const product = PRODUCTS[productId];
  if (!product) throw fail('بستهٔ انتخابی معتبر نیست', 400);
  if (!configured() && !cfg().sandbox) {
    throw fail('پرداخت درون‌برنامه‌ای هنوز فعال نشده است', 503, 'GATEWAY_OFF');
  }

  const { rows } = await pool.query(
    `INSERT INTO payment_orders (user_id, amount, provider, product_id, status)
     VALUES ($1, $2, 'cafebazaar', $3, 'pending')
     RETURNING id, amount, product_id, status, created_at`,
    [userId, product.amount, productId]);

  return {
    orderId: rows[0].id,
    productId,
    amount: Number(rows[0].amount),
    label: product.label,
  };
}

// ── مرحلهٔ ۳: راستی‌آزمایی و شارژ ──────────────────────────────────────
/**
 * توکن خرید را بررسی و در صورت تأیید کیف پول را شارژ می‌کند.
 *
 * **قابل فراخوانی چندباره است (idempotent).** اگر کلاینت به‌خاطر قطعی
 * شبکه دوباره بفرستد، بار دوم همان نتیجه را می‌گیرد بدون شارژ مجدد —
 * تضمین‌کنندهٔ اصلی، UNIQUE روی (provider, purchase_token) است.
 */
async function verifyAndCredit(userId, orderId, purchaseToken) {
  if (!purchaseToken || String(purchaseToken).length < 4) {
    throw fail('توکن پرداخت نامعتبر است', 400);
  }

  const { rows: found } = await pool.query(
    `SELECT * FROM payment_orders WHERE id=$1 AND user_id=$2`,
    [orderId, userId]);
  const order = found[0];
  if (!order) throw fail('سفارش پیدا نشد', 404);

  // قبلاً پرداخت شده: همان نتیجه را برگردان، دوباره شارژ نکن.
  if (order.status === 'paid') {
    return { alreadyProcessed: true, amount: Number(order.amount) };
  }
  if (order.status === 'refunded') {
    throw fail('این پرداخت بازگردانده شده است', 400);
  }

  const product = PRODUCTS[order.product_id];
  if (!product) throw fail('بستهٔ این سفارش دیگر معتبر نیست', 400);

  const result = await verifyWithBazaar(order.product_id, purchaseToken);
  if (!result.ok) {
    await pool.query(
      `UPDATE payment_orders
          SET status='failed', gateway_payload=$2, updated_at=NOW()
        WHERE id=$1`,
      [orderId, JSON.stringify(result.raw || {})]);
    throw fail('پرداخت تأیید نشد', 400, 'NOT_VERIFIED');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // توکن را همین‌جا و داخل تراکنش ثبت کن. اگر همین توکن قبلاً برای
    // سفارش دیگری استفاده شده، UNIQUE اینجا می‌ترکد و کل تراکنش
    // برمی‌گردد — یعنی شارژ دوباره غیرممکن است.
    let claimed;
    try {
      claimed = await client.query(
        `UPDATE payment_orders
            SET purchase_token=$2, status='paid', paid_at=NOW(),
                gateway_payload=$3, updated_at=NOW()
          WHERE id=$1 AND status='pending'
          RETURNING id, amount`,
        [orderId, purchaseToken, JSON.stringify(result.raw || {})]);
    } catch (e) {
      await client.query('ROLLBACK');
      if (e && e.code === '23505') {
        throw fail('این پرداخت قبلاً ثبت شده است', 409, 'DUPLICATE_TOKEN');
      }
      throw e;
    }

    if (!claimed.rowCount) {
      // یک درخواست هم‌زمان زودتر رسیده و سفارش را برداشته.
      await client.query('ROLLBACK');
      return { alreadyProcessed: true, amount: Number(order.amount) };
    }

    const credited = await wallet.credit(client, {
      userId,
      amount: Number(order.amount),
      source: 'topup',
      referenceType: 'payment_orders',
      referenceId: orderId,
      description: `شارژ کیف پول — ${product.label}`,
    });

    await client.query(
      `UPDATE payment_orders SET wallet_tx_id=$2, updated_at=NOW() WHERE id=$1`,
      [orderId, credited?.transaction?.id || null]);

    await client.query('COMMIT');
    return {
      alreadyProcessed: false,
      amount: Number(order.amount),
      balance: credited?.balance,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** بسته‌های قابل خرید برای نمایش در UI. */
function catalog() {
  return {
    enabled: configured() || cfg().sandbox,
    provider: 'cafebazaar',
    products: Object.entries(PRODUCTS).map(([id, p]) => ({
      id, amount: p.amount, label: p.label,
    })),
  };
}

/** تاریخچهٔ شارژ کاربر. */
async function history(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, amount, product_id, status, created_at, paid_at
       FROM payment_orders
      WHERE user_id=$1 AND status <> 'pending'
      ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(50, Math.max(1, limit))]);
  return rows.map(r => ({
    id: r.id, amount: Number(r.amount), productId: r.product_id,
    status: r.status, createdAt: r.created_at, paidAt: r.paid_at,
  }));
}

module.exports = {
  PRODUCTS, createOrder, verifyAndCredit, catalog, history,
  configured, verifyWithBazaar,
};
