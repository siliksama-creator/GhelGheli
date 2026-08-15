// پرداخت درون‌برنامه‌ای — خرید مستقیم آیتم شاپ و پلاس از کافه‌بازار
//
// ═══════════════════════════════════════════════════════════════════════════
// دو جریان پولِ کاملاً جدا
// ═══════════════════════════════════════════════════════════════════════════
//
//   کیف پول = پولِ خودِ کاربر
//     ورودی : کارت نقدی · جایزهٔ لیگ · گردونه · کمیسیون ۵٪ · واریز ادمین
//     خروجی : فقط درخواست برداشت
//     ✗ هرگز بابت خرید کم نمی‌شود
//
//   خرید = پولِ تازه از جیب کاربر
//     آیتم شاپ و پلاس ۱۰۰٪ از پرداخت درون‌برنامه‌ای بازار
//     ✗ هرگز از موجودی کیف پول
//
// این ماژول فقط جریان دوم را می‌شناسد. هیچ تابعی اینجا کیف پول را شارژ
// نمی‌کند؛ تنها جایی که خرید به کیف پول دست می‌زند، کمیسیون ۵٪ معرف است
// که در `referralService.payPurchaseCommission` و داخل همان تراکنش انجام
// می‌شود.
//
// ═══════════════════════════════════════════════════════════════════════════
// جریان کامل — و اینکه هر مرحله کجا می‌تواند بشکند
// ═══════════════════════════════════════════════════════════════════════════
//
//   ۱. کلاینت  POST /api/purchase/order  { kind, slug|cycle }
//      → سرور قیمت را از دیتابیس می‌خواند، سفارش pending می‌سازد،
//        و **شناسهٔ محصولِ بازار** متناظرِ آن قیمت را برمی‌گرداند
//      ✗ اگر اینجا قطع شود: سفارش pending می‌ماند، ضرری ندارد
//
//   ۲. کلاینت با Poolakey از کاربر پول می‌گیرد → purchaseToken
//      ✗ اگر اینجا قطع شود: کاربر پول داده ولی سرور خبر ندارد.
//        برای همین مرحلهٔ ۳ **قابل ارسال دوباره** است.
//
//   ۳. کلاینت  POST /api/purchase/verify  { orderId, purchaseToken }
//      → سرور توکن را از API بازار راستی‌آزمایی می‌کند
//      → فقط اگر بازار تأیید کرد، آیتم/اشتراک **تحویل** می‌شود
//      → و کمیسیون ۵٪ به معرف واریز می‌شود
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا قیمت **هرگز** از کلاینت گرفته نمی‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
// کلاینت فقط می‌گوید «کدام آیتم»؛ قیمت از `shop_items.price` یا از
// `PLUS_PLANS` سمت سرور خوانده می‌شود. اگر قیمت از بدنهٔ درخواست می‌آمد،
// یک curl کافی بود تا کسی پلاس سالانه را با ۱۰۰ تومان بخرد.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا محصولات بازار بر اساس «قیمت» است نه «آیتم»
// ═══════════════════════════════════════════════════════════════════════════
//
// ۵۲ آیتم فروختنی داریم ولی فقط ۱۳ نقطهٔ قیمتی. اگر به ازای هر آیتم یک
// محصول در کنسول بازار می‌ساختیم، هر بار که آیتم جدیدی اضافه می‌شد باید
// دستی در پنل بازار هم ثبت می‌شد و تا تأیید بازار آن آیتم غیرقابل خرید
// می‌ماند. با نگاشتِ قیمتی، افزودن آیتم جدید با قیمتِ موجود **هیچ** کار
// دستی لازم ندارد.
//
// در ازایش: `payment_orders` باید بداند کدام آیتم خریداری شده، چون خودِ
// شناسهٔ محصولِ بازار فقط قیمت را می‌گوید. برای همین `shop_item_id` در
// همان مرحلهٔ ۱ ثبت می‌شود — و در مرحلهٔ ۳ فقط از روی سفارش خوانده
// می‌شود، نه از کلاینت.
const { pool } = require('../config/db');

// ── نگاشت قیمت → شناسهٔ محصول کافه‌بازار ───────────────────────────────
//
// این‌ها باید **دقیقاً** در کنسول کافه‌بازار ساخته شوند. اگر قیمتی اینجا
// نباشد، آیتمِ با آن قیمت غیرقابل خرید می‌شود و `catalog()` علامتش
// می‌زند — بی‌سروصدا شکست نمی‌خورد.
const PRICE_PRODUCTS = Object.freeze({
  9000:   'ghelgheli_item_9000',
  12000:  'ghelgheli_item_12000',
  15000:  'ghelgheli_item_15000',
  19000:  'ghelgheli_item_19000',
  24000:  'ghelgheli_item_24000',
  25000:  'ghelgheli_item_25000',
  29000:  'ghelgheli_item_29000',
  39000:  'ghelgheli_item_39000',
  45000:  'ghelgheli_item_45000',
  49000:  'ghelgheli_item_49000',
  50000:  'ghelgheli_item_50000',
  59000:  'ghelgheli_item_59000',
  69000:  'ghelgheli_item_69000',
});

// اشتراک پلاس محصول جداگانه دارد چون در بازار «اشتراک» است نه «کالای
// یک‌بارمصرف» و چرخهٔ عمر متفاوتی دارد.
const PLUS_PRODUCTS = Object.freeze({
  monthly: { productId: 'ghelgheli_plus_monthly', price: 59000,  label: 'قلقلی پلاس ماهانه' },
  annual:  { productId: 'ghelgheli_plus_annual',  price: 499000, label: 'قلقلی پلاس سالانه' },
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

/** شناسهٔ محصول بازار برای یک قیمت مشخص. null یعنی این قیمت فروختنی نیست. */
function productForPrice(price) {
  return PRICE_PRODUCTS[Number(price)] || null;
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

  // حالت sandbox فقط برای توسعهٔ محلی. توکن باید پیشوند مشخص داشته باشد
  // تا یک توکن واقعیِ اشتباهی هرگز از این مسیر رد نشود.
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
//
// قیمت اینجا **قفل** می‌شود. اگر مدیر بین ساخت سفارش و تأیید پرداخت قیمت
// را عوض کند، کاربر همان چیزی را می‌پردازد که دیده — و ما همان را تحویل
// می‌دهیم.

/** سفارش خرید یک آیتم شاپ. */
async function createShopOrder(userId, slug) {
  if (!configured() && !cfg().sandbox) {
    throw fail('پرداخت درون‌برنامه‌ای هنوز فعال نشده است', 503, 'GATEWAY_OFF');
  }
  // کلاینت ممکن است slug بفرستد یا UUID. روت قدیمیِ
  // `/api/shop/items/:id/buy` با UUID کار می‌کرد و اپ‌های نصب‌شده هنوز
  // همان را می‌فرستند؛ هر دو باید کار کنند وگرنه نسخهٔ قدیمی می‌شکند.
  const key = String(slug || '');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(key);
  const { rows } = await pool.query(
    `SELECT id, slug, name, price, access_tier, is_purchasable
       FROM shop_items
      WHERE ${isUuid ? 'id=$1::uuid' : 'slug=$1'} AND is_active=true`,
    [key]);
  const item = rows[0];
  if (!item) throw fail('کالا پیدا نشد', 404);
  if (!item.is_purchasable || item.access_tier === 'annual') {
    throw fail('این هدیه فقط همراه پلاس سالانه فعال می‌شود', 409);
  }

  // مالکیت را قبل از گرفتن پول بررسی کن. اگر بعد از پرداخت بفهمیم کاربر
  // قبلاً آیتم را داشته، باید پول را برگردانیم — که در بازار فرایند دستی
  // و کندی است. بهتر است اصلاً پنجرهٔ پرداخت باز نشود.
  const owned = await pool.query(
    `SELECT 1 FROM user_shop_items WHERE user_id=$1 AND item_id=$2`,
    [userId, item.id]);
  if (owned.rows[0]) throw fail('این کالا را قبلاً خریده‌اید', 409);

  const productId = productForPrice(item.price);
  if (!productId) {
    throw fail('این کالا فعلاً قابل خرید نیست', 503, 'NO_PRODUCT');
  }

  const order = await pool.query(
    `INSERT INTO payment_orders
       (user_id, amount, provider, product_id, status,
        purchase_kind, shop_item_id)
     VALUES ($1, $2, 'cafebazaar', $3, 'pending', 'shop_item', $4)
     RETURNING id, amount, created_at`,
    [userId, item.price, productId, item.id]);

  return {
    orderId: order.rows[0].id,
    productId,
    amount: Number(order.rows[0].amount),
    kind: 'shop_item',
    slug: item.slug,
    label: item.name,
  };
}

/** سفارش خرید اشتراک پلاس. */
async function createPlusOrder(userId, billingCycle) {
  if (!configured() && !cfg().sandbox) {
    throw fail('پرداخت درون‌برنامه‌ای هنوز فعال نشده است', 503, 'GATEWAY_OFF');
  }
  const clean = String(billingCycle || 'monthly').toLowerCase();
  const cycle = ['annual', 'yearly', 'year'].includes(clean) ? 'annual'
    : ['monthly', 'month'].includes(clean) ? 'monthly' : null;
  if (!cycle) throw fail('دوره اشتراک باید ماهانه یا سالانه باشد');

  const plan = PLUS_PRODUCTS[cycle];
  const order = await pool.query(
    `INSERT INTO payment_orders
       (user_id, amount, provider, product_id, status,
        purchase_kind, plus_cycle)
     VALUES ($1, $2, 'cafebazaar', $3, 'pending', $4, $5)
     RETURNING id, amount, created_at`,
    [userId, plan.price, plan.productId,
      cycle === 'annual' ? 'plus_annual' : 'plus_monthly', cycle]);

  return {
    orderId: order.rows[0].id,
    productId: plan.productId,
    amount: Number(order.rows[0].amount),
    kind: cycle === 'annual' ? 'plus_annual' : 'plus_monthly',
    cycle,
    label: plan.label,
  };
}

// ── مرحلهٔ ۳: راستی‌آزمایی و تحویل ─────────────────────────────────────
/**
 * توکن خرید را بررسی و در صورت تأیید، کالا/اشتراک را **تحویل** می‌دهد.
 *
 * **قابل فراخوانی چندباره است (idempotent).** اگر کلاینت به‌خاطر قطعی
 * شبکه دوباره بفرستد، بار دوم همان نتیجه را می‌گیرد بدون تحویل مجدد —
 * تضمین‌کنندهٔ اصلی، UNIQUE روی (provider, purchase_token) است.
 *
 * تحویل توسط `shopService` انجام می‌شود (تزریق‌شده تا وابستگی حلقوی
 * نسازد: shopService خودش createOrder را صدا می‌زند).
 */
async function verifyAndDeliver(userId, orderId, purchaseToken, deliver) {
  if (!purchaseToken || String(purchaseToken).length < 4) {
    throw fail('توکن پرداخت نامعتبر است', 400);
  }

  const { rows: found } = await pool.query(
    `SELECT * FROM payment_orders WHERE id=$1 AND user_id=$2`,
    [orderId, userId]);
  const order = found[0];
  if (!order) throw fail('سفارش پیدا نشد', 404);

  // قبلاً تحویل شده: همان نتیجه را برگردان، دوباره تحویل نده.
  if (order.status === 'paid') {
    return {
      alreadyProcessed: true,
      amount: Number(order.amount),
      kind: order.purchase_kind,
    };
  }
  if (order.status === 'refunded') {
    throw fail('این پرداخت بازگردانده شده است', 400);
  }
  if (order.status === 'failed') {
    throw fail('این سفارش منقضی شده؛ دوباره از فروشگاه اقدام کنید', 409);
  }

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
    // برمی‌گردد — یعنی تحویل دوباره غیرممکن است.
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
      return {
        alreadyProcessed: true,
        amount: Number(order.amount),
        kind: order.purchase_kind,
      };
    }

    // تحویل + کمیسیون، همه داخل همین تراکنش. اگر تحویل بشکند، سفارش هم
    // به pending برمی‌گردد و کاربر می‌تواند دوباره verify بزند — پولش
    // در بازار محفوظ است و توکن هنوز مصرف‌نشده می‌ماند.
    const delivered = await deliver(client, {
      userId,
      order,
      orderId,
      amount: Number(order.amount),
    });

    await client.query(
      `UPDATE payment_orders
          SET granted_reference_id=$2, updated_at=NOW()
        WHERE id=$1`,
      [orderId, delivered?.referenceId || null]);

    await client.query('COMMIT');
    return {
      alreadyProcessed: false,
      amount: Number(order.amount),
      kind: order.purchase_kind,
      ...delivered,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** وضعیت درگاه + نگاشت قیمت‌ها، برای نمایش در UI. */
function catalog() {
  return {
    enabled: configured() || cfg().sandbox,
    provider: 'cafebazaar',
    // کیف پول دیگر شارژ نمی‌شود؛ کلاینت‌های قدیمی با دیدن این پرچم
    // شیت شارژ را نشان نمی‌دهند.
    walletTopupEnabled: false,
    priceProducts: { ...PRICE_PRODUCTS },
    plusProducts: Object.fromEntries(
      Object.entries(PLUS_PRODUCTS).map(([k, v]) => [k, { ...v }])),
  };
}

/** تاریخچهٔ خریدهای درگاهی کاربر. */
async function history(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT o.id, o.amount, o.product_id, o.status, o.purchase_kind,
            o.plus_cycle, o.created_at, o.paid_at,
            i.name AS item_name, i.slug AS item_slug
       FROM payment_orders o
       LEFT JOIN shop_items i ON i.id = o.shop_item_id
      WHERE o.user_id=$1 AND o.status <> 'pending'
      ORDER BY o.created_at DESC LIMIT $2`,
    [userId, Math.min(50, Math.max(1, limit))]);
  return rows.map(r => ({
    id: r.id,
    amount: Number(r.amount),
    productId: r.product_id,
    status: r.status,
    kind: r.purchase_kind,
    cycle: r.plus_cycle,
    itemName: r.item_name,
    itemSlug: r.item_slug,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  }));
}

module.exports = {
  PRICE_PRODUCTS, PLUS_PRODUCTS, productForPrice,
  createShopOrder, createPlusOrder, verifyAndDeliver,
  catalog, history, configured, verifyWithBazaar,
};
