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
    tapGame,
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

  // ── مدیریتِ بازی ضربه‌زن (دورِ ۳۳) ────────────────────────────────────
  // خواستهٔ مالک: «ادمین بتونه کامل بازی ضربه‌زن رو مدیریت کنه و درصورت
  // نیاز رست بده و آمار لولِ آخر شدن کاربرها رو داشته باشه».
  //
  // GET stats — آمارِ کلی، توزیعِ لول‌ها و فهرست بازیکنانِ تمام‌کرده.
  router.get('/admin/tap/stats', adminAuth, asyncHandler(async (req, res) => {
    res.json(await tapGame.adminStats());
  }));

  // GET leaderboard — نفراتِ برترِ ضربه‌زن برای بخشِ «اهدای جایزه».
  // همان تابعِ leaderboard عمومی است (userId را هم برمی‌گرداند) تا
  // پنل بتواند روی هر ردیف «نقدی/فروشگاهی» بفرستد.
  router.get('/admin/tap/leaderboard', adminAuth, asyncHandler(async (req, res) => {
    res.json({ entries: await tapGame.leaderboard(req.query.limit) });
  }));

  // POST reset — ریستِ یک کاربر (userId) یا همه (all:true).
  //
  // ⚠️ فقط نقشِ اپراتور به بالا (requireRole بدون آرگومان یعنی همان
  //    سخت‌گیرانه‌ترین سطحِ فعلی پنل) و با ثبتِ رکوردِ ممیزی؛ ریستِ
  //    کلِ بازی عملیاتِ برگشت‌ناپذیری است و باید ردپا داشته باشد.
  router.post('/admin/tap/reset', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      if (b.all === true) {
        const out = await tapGame.adminResetAll();
        await audit(req.admin.id, 'tap_game_reset_all', 'app_settings', null,
          b.reason || null, out);
        return res.json({
          message: `بازی ضربه‌زن برای همه ریست شد (${out.resetRows} بازیکن)`,
          ...out,
        });
      }
      const userId = String(b.userId || '').trim();
      if (!/^[0-9a-fA-F-]{10,40}$/.test(userId)) {
        return res.status(400).json({ message: 'شناسهٔ کاربر معتبر نیست' });
      }
      const out = await tapGame.adminResetUser(userId);
      if (!out.ok) return res.status(404).json({ message: out.message });
      await audit(req.admin.id, 'tap_game_reset', 'users', userId,
        b.reason || null, out);
      res.json({
        message: out.reset
          ? `پیشرفت ضربه‌زنِ «${out.user.nickname}» ریست شد — از لول ۱ شروع می‌کند`
          : 'این کاربر پیشرفتِ ضربه‌زنی نداشت؛ چیزی پاک نشد',
        ...out,
      });
    }));

  return router;
};
