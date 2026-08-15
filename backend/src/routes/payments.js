// مسیرهای شارژ کیف پول (پرداخت درون‌برنامه‌ای کافه‌بازار)
//
// چرا مبلغ در هیچ‌کدام از این مسیرها از بدنهٔ درخواست خوانده نمی‌شود:
// کلاینت فقط `productId` می‌فرستد و مبلغ سمت سرور از جدول محصولات
// درمی‌آید. اگر مبلغ از کلاینت می‌آمد، یک curl ساده کافی بود تا کسی
// برای خودش هر مبلغی شارژ کند.
const express = require('express');
const payments = require('../services/paymentService');

module.exports = function paymentRoutes({ auth, asyncHandler, rateLimit }) {
  const router = express.Router();

  // محدودیت سخت‌تر از حد معمول: هر درخواست verify یک رفت‌وبرگشت به API
  // کافه‌بازار دارد. بدون این، یک کلاینت خراب (یا مهاجم) می‌تواند
  // سهمیهٔ API ما را بسوزاند.
  const payLimiter = rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `pay:${req.user.id}`,
    message: { message: 'تعداد درخواست‌های پرداخت زیاد است؛ کمی بعد تلاش کنید' },
  });

  /** بسته‌های قابل خرید + اینکه اصلاً درگاه فعال هست یا نه. */
  router.get('/wallet/topup/catalog', auth, asyncHandler(async (req, res) => {
    res.json(payments.catalog());
  }));

  /** مرحلهٔ ۱ — ساخت سفارش قبل از باز کردن پنجرهٔ پرداخت بازار. */
  router.post('/wallet/topup/order', auth, payLimiter,
    asyncHandler(async (req, res) => {
      const order = await payments.createOrder(
        req.user.id, String(req.body?.productId || ''));
      res.json(order);
    }));

  /** مرحلهٔ ۳ — راستی‌آزمایی توکن و شارژ کیف پول. */
  router.post('/wallet/topup/verify', auth, payLimiter,
    asyncHandler(async (req, res) => {
      const result = await payments.verifyAndCredit(
        req.user.id,
        String(req.body?.orderId || ''),
        String(req.body?.purchaseToken || ''));
      res.json({
        ok: true,
        ...result,
        message: result.alreadyProcessed
          ? 'این پرداخت قبلاً ثبت شده بود'
          : `کیف پول شما ${result.amount.toLocaleString('fa-IR')} تومان شارژ شد`,
      });
    }));

  /** تاریخچهٔ شارژ. */
  router.get('/wallet/topup/history', auth, asyncHandler(async (req, res) => {
    res.json({ orders: await payments.history(req.user.id) });
  }));

  return router;
};
