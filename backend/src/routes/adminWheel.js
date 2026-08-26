/**
 * ویرایشگر گردونه — پنل ادمین (وب و اندروید).
 *
 * خواستهٔ مالک: «گردونه شانس هم امکان تغییر محتویات اش چه ظاهری چه
 * درونی در پنل ادمین امکان پذیر باشه».
 *
 * ظاهر = برچسب و رنگ برش (کلاینت‌ها از GET /api/wheel می‌خوانند، پس
 * بدون آپدیت اپ عوض می‌شود). درون = نوع، مقدار، وزن.
 *
 * جمع وزن فعال باید دقیقاً WEIGHT_TOTAL باشد. سرویس اگر نخواند ذخیره
 * را رد می‌کند — نرمال‌سازیِ بی‌صدا عمداً نیست.
 */
const express = require('express');

module.exports = function createAdminWheelRoutes(deps) {
  const { pool, adminAuth, requireRole, asyncHandler, audit, wheel } = deps;
  const router = express.Router();

  router.get('/admin/wheel/prizes', adminAuth, asyncHandler(async (req, res) => {
    const prizes = await wheel.listAll();
    const activeWeight = prizes
      .filter((p) => p.isActive)
      .reduce((s, p) => s + p.weight, 0);
    const { rows: shopItems } = await pool.query(
      `SELECT slug, name FROM shop_items
        WHERE is_active = true ORDER BY display_order ASC, name ASC`);
    res.json({
      prizes,
      weightTotal: wheel.WEIGHT_TOTAL,
      activeWeight,
      kinds: wheel.PRIZE_KINDS,
      shopItems,
    });
  }));

  router.put('/admin/wheel/prizes', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const list = Array.isArray(req.body?.prizes) ? req.body.prizes : req.body;
      const prizes = await wheel.saveAll(list);
      await audit(req.admin.id, 'update_wheel_prizes', 'wheel_prizes', null,
        req.body?.reason || null,
        { count: prizes.length, active: prizes.filter((p) => p.isActive).length });
      res.json({
        message: 'محتوای گردونه ذخیره شد — شانس و ظاهر همین حالا روی اپ و وب عوض می‌شود',
        prizes,
        weightTotal: wheel.WEIGHT_TOTAL,
        activeWeight: prizes.filter((p) => p.isActive)
          .reduce((s, p) => s + p.weight, 0),
      });
    }));

  return router;
};
