// ═════════════════════════════════════════════════════════════════════
// مسیرهای درگاه زرین‌پال — خرید مستقیم وب/اندروید + تنظیم زندهٔ پنل
// ═════════════════════════════════════════════════════════════════════
// کال‌بک عمومی است (سرور زرین‌پال کاربر را برمی‌گرداند) ولی هیچ چیزی از
// پرس‌استرینگ باور نمی‌شود جز «Authority» که کلید جست‌وجوی سفارش است؛
// مبلغ و نوع سفارش از دیتابیس می‌آید و verify با همان مبلغ صدا زده می‌شود.
const express = require('express');
const zp = require('../services/zarinpalService');
const payments = require('../services/paymentService');
const shop = require('../services/shopService');

/** فقط Origینی که در allow-list کرس است مقصدِ برگشت می‌شود (نه open-redirect). */
function allowedOrigin(req) {
  const requestOrigin = String(req.get('origin') || '').replace(/\/$/, '');
  const configured = String(process.env.CORS_ORIGIN || '')
    .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const publicWeb = String(process.env.PUBLIC_WEB_URL || '').replace(/\/$/, '');
  // Browser: keep the requesting allow-listed site. Android/external browser:
  // no Origin header, so return to the verified public user site; its Android
  // intent filter receives the same URL and the app polls the order status.
  return configured.includes(requestOrigin)
    ? requestOrigin
    : (configured.includes(publicWeb) ? publicWeb : '');
}

module.exports = function zarinpalRoutes({
  pool, auth, adminAuth, requireRole, asyncHandler, audit, validateUuid,
}) {
  const router = express.Router();

  // ── ساختِ سفارش + گرفتنِ authority ───────────────────────────────────
  router.post('/payments/zarinpal/order', auth, asyncHandler(async (req, res) => {
    if (!(await zp.configured())) {
      return res.status(503).json({ message: 'درگاه زرین‌پال فعال نیست؛ از پنل مدیریت فعال شود', code: 'GATEWAY_OFF' });
    }
    const kind = String(req.body?.kind || '');
    let order;
    if (kind === 'shop') {
      order = await shop.buyShopItem(req.user.id, String(req.body?.slug || ''), {
        useWallet: req.body?.useWallet === true,
        provider: 'zarinpal',
      });
      // اگر موجودی کیف پول کل مبلغ را پوشاند، درگاه نباید باز شود.
      if (order.settled === true) return res.json({
        orderId: order.orderId || null,
        settled: true,
        amount: order.amount || 0,
        message: 'خرید با موجودی کیف پول انجام شد',
      });
    } else if (kind === 'plus') {
      // پلاس هم مثل آیتمِ شاپ می‌تواند از کیف پول تسویه شود؛ در آن حالت
      // اصلاً نباید به درگاه برویم.
      order = await shop.buyPlusSubscription(
        req.user.id, String(req.body?.billingCycle || 'monthly'),
        { useWallet: req.body?.useWallet === true, provider: 'zarinpal' },
      );
      if (order.settled === true) return res.json({
        orderId: order.referenceId || null,
        settled: true,
        amount: order.amount || 0,
        message: 'اشتراک با موجودی کیف پول فعال شد',
      });
    } else if (kind === 'card_box') {
      order = await payments.createCardBoxOrder(req.user.id, { provider: 'zarinpal' });
    } else {
      return res.status(400).json({ message: 'نوع خرید معتبر نیست' });
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/payments/zarinpal/callback`;
    let started;
    try {
      started = await zp.requestPayment({
        amountRial: zp.tomanToRial(order.amount),
        description: `قلقلی: ${order.label || kind}`,
        callbackUrl,
        orderId: order.orderId,
      });
    } catch (e) {
      await pool.query(`UPDATE payment_orders SET status='failed', updated_at=NOW(), gateway_payload=$2::jsonb WHERE id=$1`,
        [order.orderId, JSON.stringify({ gateway: 'zarinpal', requestError: String(e.message) })]);
      return res.status(e.status || 402).json({ message: e.message || 'ساخت پرداخت ناموفق بود' });
    }

    await pool.query(
      `UPDATE payment_orders
          SET purchase_token=$2,
              gateway_payload=jsonb_build_object('authority', $3::text, 'amount_rial', $4::bigint, 'web_origin', $5::text)
        WHERE id=$1`,
      [order.orderId, started.authority, started.authority,
        zp.tomanToRial(order.amount), allowedOrigin(req)]
    );

    res.json({ orderId: order.orderId, startPayUrl: started.startPayUrl, amount: order.amount });
  }));

  // ── کال‌بک زرین‌پال (عمومی) ──────────────────────────────────────────
  router.get('/payments/zarinpal/callback', asyncHandler(async (req, res) => {
    const authority = String(req.query.Authority || req.query.authority || '');
    const status = String(req.query.Status || req.query.status || '').toUpperCase();
    const { rows } = await pool.query(
      `SELECT * FROM payment_orders WHERE provider='zarinpal' AND purchase_token=$1 LIMIT 1`,
      [authority]);
    const order = rows[0];
    if (!order) {
      return res.status(404).json({ message: 'سفارش پیدا نشد' });
    }
    const origin = String(order.gateway_payload?.web_origin || '');
    const back = (st) => origin
      ? res.redirect(302, `${origin}/?pay=result&status=${encodeURIComponent(st)}&order=${encodeURIComponent(order.id)}`)
      : res.json({ message: st === 'ok' ? 'پرداخت موفق بود' : 'پرداخت ناموفق بود', status: st });

    if (order.status === 'paid') return back('ok');           // کال‌بک تکراری
    if (status !== 'OK') {
      await pool.query(`UPDATE payment_orders SET status='failed', updated_at=NOW(), gateway_payload=COALESCE(gateway_payload, '{}'::jsonb)||$2::jsonb WHERE id=$1`,
        [order.id, JSON.stringify({ cancelStatus: status || 'NOK' })]);
      return back('cancel');
    }

    const amountRial = Number(order.gateway_payload?.amount_rial || zp.tomanToRial(order.amount));
    const v = await zp.verifyPayment({ amountRial, authority });
    if (!v.ok) {
      await pool.query(`UPDATE payment_orders SET status='failed', updated_at=NOW(), gateway_payload=COALESCE(gateway_payload, '{}'::jsonb)||$2::jsonb WHERE id=$1`,
        [order.id, JSON.stringify({ verifyCode: v.code, verifyMessage: v.message })]);
      return back('failed');
    }

    // ادعای pending→paid + تحویل، همه داخل یک تراکنش (الگوی بازار).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `UPDATE payment_orders
            SET status='paid', paid_at=NOW(), updated_at=NOW(),
                gateway_payload=COALESCE(gateway_payload, '{}'::jsonb)||$2::jsonb
          WHERE id=$1 AND status='pending'
          RETURNING id`,
        [order.id, JSON.stringify({ refId: v.refId, verifyCode: v.code })]);
      let delivered = null;
      if (claimed.rowCount) {
        delivered = await shop.deliverForOrder(client, order.user_id, order, Number(order.amount));
        await client.query(
          `UPDATE payment_orders SET granted_reference_id=$2, updated_at=NOW() WHERE id=$1`,
          [order.id, delivered?.referenceId || null]);
      }
      await client.query('COMMIT');
      return back('ok');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      // تحویل نشد ولی پول تأیید شده: سفارش paid نمی‌ماند؛ پشتیبانی با
      // refId از gateway_payload پیگیری می‌کند.
      await pool.query(`UPDATE payment_orders SET status='failed', updated_at=NOW(), gateway_payload=COALESCE(gateway_payload, '{}'::jsonb)||$2::jsonb WHERE id=$1 AND status='pending'`,
        [order.id, JSON.stringify({ deliverError: String(e.message), refId: v.refId })]);
      return back('failed');
    } finally {
      client.release();
    }
  }));

  // ── پولینگِ وضعیت (برگشت از مرورگر در اندروید/وب) ───────────────────
  router.get('/payments/zarinpal/order/:id', auth, validateUuid('id'),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, status, purchase_kind, amount, paid_at, granted_reference_id
           FROM payment_orders WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.user.id]);
      if (!rows[0]) return res.status(404).json({ message: 'سفارش پیدا نشد' });
      const order = rows[0];
      // رونماییِ صندوق بعد از بازگشت از درگاه: کلاینت برای نمایشِ «چه
      // کارت‌هایی گرفتی» به خودِ کارت‌ها نیاز دارد، نه فقط وضعیت paid.
      // granted_reference_id همان box_id است که deliverCardBox ثبت کرده.
      let box = null;
      if (order.purchase_kind === 'card_box' && order.status === 'paid' && order.granted_reference_id) {
        const { rows: cards } = await pool.query(
          `SELECT c.card_type_id, c.slot, c.rarity, c.point_value, t.name, t.image_url
             FROM card_box_cards c JOIN card_types t ON t.id = c.card_type_id
            WHERE c.box_id = $1 ORDER BY c.slot`,
          [order.granted_reference_id]);
        if (cards.length) {
          box = {
            cards: cards.map((c) => ({
              name: c.name, rarity: c.rarity,
              pointValue: Number(c.point_value || 0), imageUrl: c.image_url || '',
            })),
            points: cards.reduce((s, c) => s + Number(c.point_value || 0), 0),
            distinct: new Set(cards.map((c) => String(c.card_type_id))).size === cards.length
              && cards.length > 1,
          };
        }
      }
      res.json({ order: {
        id: order.id, status: order.status, purchase_kind: order.purchase_kind,
        amount: Number(order.amount), paid_at: order.paid_at, box,
      } });
    }));

  // ── تنظیمِ زنده از پنل ادمین ─────────────────────────────────────────
  // خواندنِ وضعیت برای پشتیبان مجاز است؛ ناظر نباید مرچنت‌کد/آمار
  // پرداخت را ببیند. تغییرات همچنان فقط requireRole() یعنی super_admin است.
  router.get('/admin/payments/zarinpal', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
    const s = await zp.readSettings();
    const stats = await zp.stats();
    res.json({
      settings: s,
      orders: stats.byStatus,
      stats,
    });
  }));

  router.put('/admin/payments/zarinpal', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
      const sandbox = req.body?.sandbox === true || req.body?.sandbox === 'true';
      const merchantId = String(req.body?.merchantId || '').trim();
      if (enabled && !zp.merchantLooksValid(merchantId)) {
        return res.status(400).json({ message: 'مرچنت‌کد زرین‌پال باید به شکل UUID باشد' });
      }
      const K = zp.SETTING_KEYS;
      const upsert = async (key, value) => pool.query(
        `INSERT INTO app_settings(key, value, updated_by_admin_id, updated_at)
         VALUES ($1, to_jsonb($2::text), $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value=to_jsonb($2::text), updated_by_admin_id=$3, updated_at=NOW()`,
        [key, value, req.admin.id]);
      await upsert(K.enabled, String(enabled));
      await upsert(K.sandbox, String(sandbox));
      await upsert(K.merchant, merchantId);
      await audit(req.admin.id, 'update_zarinpal_gateway', 'app_settings', null,
        enabled ? 'فعال‌سازی/به‌روزرسانی زرین‌پال' : 'غیرفعال‌سازی زرین‌پال',
        { enabled, sandbox, merchantId: merchantId ? '***' + merchantId.slice(-4) : '' });
      res.json({ message: 'تنظیمات درگاه ذخیره شد؛ همین حالا در اپ‌ها زنده است', settings: await zp.readSettings() });
    }));

  // ── تستِ اتصال (یک request کوچک که هرگز تحویل نمی‌شود) ───────────────
  router.post('/admin/payments/zarinpal/test', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      try {
        const r = await zp.requestPayment({
          amountRial: 1000,
          description: 'تست اتصال پنل قلقلی',
          callbackUrl: 'https://example.invalid/cb',
          orderId: 'admin-test',
        });
        res.json({ ok: true, message: 'اتصال برقرار شد؛ درگاه پاسخِ معتبر داد', authority: r.authority });
      } catch (e) {
        res.json({ ok: false, message: e.message || 'اتصال برقرار نشد' });
      }
    }));

  return router;
};
