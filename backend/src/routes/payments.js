// مسیرهای اطلاعاتی پرداخت درون‌برنامه‌ای
//
// ⚠️ شارژ کیف پول اینجا نیست و عمداً حذف شده.
//
// تا دور ۱۷ این فایل چهار مسیر `/wallet/topup/*` داشت که کیف پول را از
// کافه‌بازار شارژ می‌کرد. مالک آن مدل را رد کرد:
//
//     «کیف پول اصلاً قرار نیست توسط کافه‌بازار شارژ بشه. فقط توسط
//      کارت‌های خاص نقدی یا جوایز لیگ و غیره. مستقیماً باید توسط بازار
//      آیتم‌های شاپ و پلاس رو بخرن.»
//
// پس کیف پول فقط ورودیِ درون‌بازی دارد و تنها خروجی‌اش برداشت نقدی است.
// خرید آیتم و پلاس از مسیرهای `/api/shop/*` و `/api/purchase/verify`
// انجام می‌شود که در `server.js` تعریف شده‌اند.
//
// چرا این فایل کاملاً پاک نشد: `catalog` به کلاینت می‌گوید درگاه اصلاً
// فعال هست یا نه (تا وقتی اعتبارنامهٔ بازار تنظیم نشده، دکمهٔ خرید باید
// غیرفعال و با پیام روشن نمایش داده شود، نه اینکه بزنی و خطا بگیری)، و
// `history` سابقهٔ خریدهای درگاهی را برای پشتیبانی نگه می‌دارد.
const express = require('express');
const payments = require('../services/paymentService');

module.exports = function paymentRoutes({ auth, asyncHandler }) {
  const router = express.Router();

  /**
   * وضعیت درگاه + نگاشت قیمت→محصول.
   *
   * کلاینت با `enabled:false` دکمه‌های خرید را غیرفعال می‌کند، و با
   * `walletTopupEnabled:false` شیتِ شارژِ نسخه‌های قدیمی را پنهان
   * می‌کند — نسخه‌های نصب‌شدهٔ قبلی بدون آپدیت هم درست رفتار می‌کنند.
   */
  router.get('/purchase/catalog', auth, asyncHandler(async (req, res) => {
    res.json(payments.catalog());
  }));

  /** سابقهٔ خریدهای درگاهی کاربر. */
  router.get('/purchase/history', auth, asyncHandler(async (req, res) => {
    res.json({ orders: await payments.history(req.user.id) });
  }));

  // ── سازگاری با نسخه‌های نصب‌شده ─────────────────────────────────────
  //
  // اپ‌هایی که قبل از این تغییر نصب شده‌اند هنوز `/wallet/topup/catalog`
  // را صدا می‌زنند. اگر ۴۰۴ بگیرند، صفحهٔ کیف پولشان با خطا بالا می‌آید.
  // پاسخِ «غیرفعال» می‌دهیم تا تمیز و بی‌خطا شیتِ شارژ را پنهان کنند.
  router.get('/wallet/topup/catalog', auth, asyncHandler(async (req, res) => {
    res.json({
      enabled: false,
      walletTopupEnabled: false,
      provider: 'cafebazaar',
      products: [],
      message: 'شارژ کیف پول غیرفعال است؛ آیتم‌ها مستقیماً از بازار خریداری می‌شوند',
    });
  }));

  // مسیرهای ساخت/تأیید سفارشِ شارژ عمداً ۴۱۰ می‌دهند نه ۴۰۴: ۴۱۰ یعنی
  // «این قابلیت وجود داشت و برداشته شد» که برای دیباگ گویاتر از ۴۰۴ است.
  const gone = (req, res) => res.status(410).json({
    message: 'شارژ کیف پول دیگر فعال نیست؛ لطفاً اپ را به‌روزرسانی کنید',
    code: 'TOPUP_REMOVED',
  });
  router.post('/wallet/topup/order', auth, gone);
  router.post('/wallet/topup/verify', auth, gone);
  router.get('/wallet/topup/history', auth, asyncHandler(async (req, res) => {
    res.json({ orders: [] });
  }));

  return router;
};
