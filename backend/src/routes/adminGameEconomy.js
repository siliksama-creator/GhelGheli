/**
 * تنظیماتِ اقتصادِ بازی‌ها — پنل ادمین (وب و اندروید).
 *
 * خواستهٔ مالک:
 *   «در پنل ادمین کنترلِ سکه در حالت برد، کسر امتیاز در حالت برد و غیره
 *    تمامی این‌ها بشه توسط ادمین مشخص بشه» و «مشخص کنه چند درصد از سکه به
 *    لیگ بعدی منتقل شه؛ ممکنه ۰ قرار بده».
 *
 * اینجا دو تنظیم ذخیره می‌شود:
 *   • game_economy_settings — سکهٔ هر نتیجه، سهمیهٔ روزانه، سکهٔ هر لولِ
 *     ضربه‌زن، درصدِ انتقالِ سکه بین لیگ‌ها (gameEconomyService)
 *   • game_reward_settings — امتیازِ برد/باخت/مساویِ بازی‌های آنلاین
 *     (همان چیزی که صفحهٔ «امتیاز بازی» وب هم ویرایش می‌کند؛ اینجا برای
 *     یک‌جا بودنِ همهٔ اهرم‌های اقتصادِ بازی هم تکرار شده است)
 *
 * کلاینت‌ها این اعداد را از `GET /api/config` می‌خوانند، پس نوشته‌های داخلِ
 * اپ/وب بدونِ انتشارِ نسخهٔ جدید عوض می‌شوند.
 */
const express = require('express');

module.exports = function createAdminGameEconomyRoutes(deps) {
  const {
    adminAuth, requireRole, asyncHandler, audit, gameEconomy, gameRewards,
  } = deps;
  const router = express.Router();

  router.get('/admin/settings/game-economy', adminAuth, asyncHandler(async (req, res) => {
    const [economy, gamePoints] = await Promise.all([
      gameEconomy.load(),
      gameRewards.getGameRewardSettings(),
    ]);
    res.json({
      economy,
      gamePoints,
      economyCustom: gameEconomy.isCustom(economy),
    });
  }));

  router.patch('/admin/settings/game-economy', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};

      // ── اقتصادِ سکه ──
      const economy = await gameEconomy.save(b.economy || b, req.admin.id);

      // ── امتیازِ برد/باخت/مساوی ──
      let gamePoints = null;
      if (b.gamePoints && typeof b.gamePoints === 'object') {
        gamePoints = await gameRewards.saveGameRewardSettings(b.gamePoints, req.admin.id);
      }

      await audit(req.admin.id, 'update_game_economy', 'app_settings', null,
        req.body.reason || null, { economy, gamePoints });

      res.json({
        message: 'تنظیمات اقتصاد بازی ذخیره شد — نوشته‌های اپ و وب هم‌زمان به‌روز می‌شوند',
        economy,
        gamePoints,
        economyCustom: gameEconomy.isCustom(economy),
      });
    }));

  return router;
};
