/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  شماره معکوسِ شروعِ لیگ — مسیرها
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * یک مسیرِ **عمومی** (ورودیِ هر سه صفحه‌ای که مالک خواست: لیگ، بازیِ آنلاین،
 * ضربه‌زن) و دو مسیرِ پنل (خواندن و ذخیره).
 *
 * ⚠️ چرا عمومی و بدونِ احرازِ هویت: صفحهٔ لیگ/بازی برای کاربرِ واردشده است،
 *    ولی اگر مسیر احراز بخواهد، کلاینت باید پیش از رندرِ کارت منتظرِ توکن
 *    بماند و «شماره معکوس» در اولین لحظهٔ باز شدنِ صفحه غایب می‌شد — همان
 *    تجربهٔ ناخوشایندی که در «برنامه‌های پیشنهادی» هم از آن پرهیز شد.
 *    محتوای این مسیر هیچ دادهٔ کاربری ندارد (فقط متن و زمان).
 */
const express = require('express');

module.exports = function createLeagueCountdownRoutes(deps) {
  const { adminAuth, requireRole, asyncHandler, audit, service } = deps;
  const router = express.Router();

  const fail = (res, e) => {
    const status = e && e.expected ? 400 : 500;
    return res.status(status).json({ message: e.message, code: e.code || 'error' });
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  عمومی — کارتِ شماره معکوس در لیگ، بازیِ آنلاین و ضربه‌زن
  // ═════════════════════════════════════════════════════════════════════════
  router.get('/league/countdown', asyncHandler(async (req, res) => {
    res.json(await service.publicState());
  }));

  // ═════════════════════════════════════════════════════════════════════════
  //  پنل ادمین
  // ═════════════════════════════════════════════════════════════════════════
  router.get('/admin/league-countdown', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const settings = await service.readSettings();
      res.json({
        settings,
        state: service.computeState(settings),
        seasons: await service.listSeasons(),
        limits: service.LIMITS,
        defaults: service.DEFAULTS,
      });
    }));

  router.put('/admin/league-countdown', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      try {
        const saved = await service.saveSettings(req.body || {}, req.admin.id);
        await audit(req.admin.id, 'save_league_countdown', 'app_settings', null,
          saved.enabled
            ? `شماره معکوسِ لیگ روشن شد — شروع: ${saved.startsAt}`
            : 'شماره معکوسِ لیگ خاموش شد',
          { enabled: saved.enabled, startsAt: saved.startsAt, seasonId: saved.seasonId });
        res.json({ settings: saved, state: service.computeState(saved) });
      } catch (e) { fail(res, e); }
    }));

  return router;
};
