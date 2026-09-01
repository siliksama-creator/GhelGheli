/**
 * فهرستِ کارت‌های کلکسیونی — فقط خواندنی.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل به این شکل کوچک شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این ماژول قبلاً «مدیریتِ کاملِ کارت و کد» بود (ساخت/ویرایش/حذفِ
 * card_types + صدور و ابطالِ card_codes). سیستمِ کد-تنهای قدیمی حذف شد
 * (مایگریشن ۰۸۰): ثبتِ کارتِ واقعی فقط از مسیرِ «کارت با عکس» می‌گذرد و
 * خودِ `card_types` همان کاتالوگِ زنده‌ای است که کارتِ عکس، صندوق و
 * دوئل به آن وصل‌اند — ساختش هم در تراکنشِ آپلودِ طرح انجام می‌شود.
 *
 * تنها مصرف‌کنندهٔ باقی‌مانده: انتخابگرِ «کارت‌های لازم» در صفحهٔ جوایز
 * هر دو پنل (وب و اندروید). پس فقط GET می‌ماند.
 */
const express = require('express');

module.exports = function createAdminCardCatalogRoutes(deps) {
  const { pool, adminAuth, asyncHandler } = deps;
  const router = express.Router();

  router.get('/admin/card-types', adminAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT id, name, image_url, description, point_value, cash_amount,
             is_active, is_collectible
        FROM card_types
       ORDER BY created_at, name`);
    res.json(rows);
  }));

  return router;
};
