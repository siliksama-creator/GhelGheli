/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ماموریتِ اختصاصی — مسیرهای پنلِ ادمین
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «این ماموریت را ادمین در پنل مشخص و امتیازدهی می‌کند. اگر
 * ادمین فعالش کند به همهٔ کاربران نشان داده می‌شود. مدیر حتی اجازه دارد
 * لینکِ قابلِ کلیک بسازد و لینک را پشتِ کلمهٔ «اینجا کلیک کنید» بگذارد، به
 * رنگِ مثلاً آبی یا سبز.»
 *
 * دو مسیر:
 *   GET  /api/admin/custom-mission  → متنِ فعلی + وضعیتِ زنده
 *   PUT  /api/admin/custom-mission  → ذخیرهٔ متن/امتیاز/لینک/کلیدِ روشن‌وخاموش
 *
 * چرا PUT و نه PATCH: این یک **موجودیتِ یگانه** با ویرایشِ کاملِ فرم است؛
 * فرمِ پنل همهٔ فیلدها را می‌فرستد، پس «جای‌گزینی» معنیِ درست را می‌دهد و
 * فیلدِ فرستاده‌نشده به‌معنای «خالی کن» است (نه «دست نزن»).
 */
const express = require('express');

const COLORS = ['blue', 'green'];

module.exports = function createAdminCustomMissionRoutes(deps) {
  const { adminAuth, requireRole, asyncHandler, audit, customMission } = deps;
  const router = express.Router();

  // پیش‌نمایشِ دقیقاً همان چیزی که کاربر می‌بیند (برای پنلِ وب و اندروید).
  router.get('/admin/custom-mission', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    res.json({
      mission: customMission.current(),
      preview: customMission.publicView(),
      colors: COLORS,
      // «اینجا کلیک کنید» — پیش‌فرضِ متنی که اگر ادمین متنِ دلخواه ننویسد
      // روی دکمهٔ لینک می‌نشیند. از سرور می‌آید تا هر دو کلاینت یک جمله
      // نشان بدهند، نه دو جملهٔ متفاوت.
      defaultLinkText: 'اینجا کلیک کنید',
      hint: 'با روشن‌کردنِ کلید، همین متن برای همهٔ کاربران در بالای «ماموریت‌های امروز» دیده می‌شود — بدونِ آپدیتِ اپ.',
    });
  }));

  router.put('/admin/custom-mission', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const saved = await customMission.save(req.admin.id, b);
      await audit(req.admin.id, 'update_custom_mission', 'app_settings', null,
        b.reason || null, saved);
      res.json({
        message: saved.enabled
          ? 'ماموریت اختصاصی ذخیره و فعال شد — از همین لحظه به کاربران نشان داده می‌شود'
          : 'ماموریت اختصاصی ذخیره شد (خاموش است و به کاربران نشان داده نمی‌شود)',
        mission: saved,
        preview: customMission.publicView(),
      });
    }));

  return router;
};
