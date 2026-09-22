// ─────────────────────────────────────────────────────────────────────
// گردونهٔ شانس و تاریخچهٔ اسپین —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, createNotification,
  wheel, addLeaguePoints, leaderboardSignal, pass,
  points, walletService, wheelLimiter,
}) => {
  const router = express.Router();

router.get('/wheel', auth, asyncHandler(async (req, res) => {
  res.json(await wheel.status(req.user.id));
}));

router.post('/wheel/spin', auth, wheelLimiter.mw, asyncHandler(async (req, res) => {
  const wheelOk = await require('../services/featureFlags').checkWheel(pool);
  if (!wheelOk.ok) return res.status(503).json({ message: wheelOk.message });
  const result = await wheel.spin(req.user.id, {
    // پرداخت نقدی از همان مسیر امن کیف پول می‌رود: spinId مرجع یکتاست، پس
    // حتی اگر این تابع دو بار صدا زده شود، واریز دوم duplicate تشخیص داده
    // می‌شود و پول دو بار داده نمی‌شود.
    creditCash: async (client, userId, amount, spinId, label) => {
      await walletService.credit(client, {
        userId,
        amount,
        source: 'wheel',
        referenceType: 'wheel_spins',
        referenceId: spinId,
        description: `گردونهٔ شانس — ${label}`,
      });
    },
    // امتیاز گردونه کمیسیون معرف **نمی‌سازد**.
    //
    // مالک دامنه را محدود کرد به «ثبت کارت» و «بازی ضربه‌زن». گردونه
    // هیچ‌کدام نیست — و اگر بود، هر چرخش رایگانِ دعوت‌شونده برای معرف هم
    // پول می‌ساخت، یعنی دقیقاً همان حلقهٔ خودتغذیه‌ای که باید بسته بماند.
    addPoints: async (client, userId, amount, source) => {
      await points.credit(client, {
        userId,
        points: amount,
        source: 'wheel',
        referenceType: 'wheel_spins',
        description: source ? `گردونهٔ شانس — ${source}` : 'گردونهٔ شانس',
        // `addLeaguePoints` پایین خودش امتیازِ لیگ را اضافه می‌کند.
        league: false,
      });
      await addLeaguePoints(client, userId, amount);
      // امتیازِ لیگ عوض شد؛ جدولِ بیننده‌ها بی‌درنگ تازه شود.
      leaderboardSignal.leaderboardChanged();
    },
  });

  // اعلان فقط برای جوایز نقدی: یک اعلان روزانه بابت ۱۰۰ امتیاز، نوتیفیکیشن
  // را به نویز تبدیل می‌کند و کاربر خاموشش می‌کند.
  if (result.prize.kind === 'cash') {
    createNotification(
      req.user.id, 'wallet', 'برندهٔ گردونه شدی',
      `${result.prize.label} به کیف پولت اضافه شد.`).catch(() => {});
  } else if (result.prize.kind === 'card_box') {
    createNotification(
      req.user.id, 'reward', 'صندوق کارت بردی',
      'صندوق کارت برنده‌ای — از کلکسیون بازش کن.').catch(() => {});
  } else if (result.prize.kind === 'shop_item' || result.prize.kind === 'plus_days') {
    createNotification(
      req.user.id, 'reward', 'جایزهٔ گردونه',
      `${result.prize.label} به حسابت اضافه شد.`).catch(() => {});
  }
  pass.grantXp(req.user.id, 'wheel_spin').catch(() => {});
  res.json(result);
}));

router.get('/wheel/history', auth, asyncHandler(async (req, res) => {
  res.json({ spins: await wheel.history(req.user.id, req.query.limit) });
}));

  return router;
};
