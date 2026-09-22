// ─────────────────────────────────────────────────────────────────────
// پاداش‌های کاربر و گروه‌های پاداش و دریافتِ جایزه —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, validateUuid,
  rewardGroups,
}) => {
  const router = express.Router();

router.get('/rewards', auth, asyncHandler(async (req, res) => {
  // ⚠️ این کوئری یک بار شکسته شد و هیچ‌کس نفهمید. کامیت 4f67a5e که دربارهٔ
  // دوئل کارت بود، بی‌ربط این خط را به
  //     ... FROM reward_tiers WHERErequired_points
  // تبدیل کرد (WHERE به required_points چسبید). پستگرس **خطا نداد**، چون
  // `WHERErequired_points` را نامِ مستعارِ جدول خواند. یعنی کوئری معتبر
  // ماند، ۲۰۰ برگرداند، و فقط بی‌صدا شرطِ فیلتر و ترتیب را انداخت: کاربر
  // هر ۶۳ جایزهٔ غیرفعال را می‌دید و روی هرکدام می‌زد ۴۰۴ می‌گرفت.
  //
  // درسِ ماندگار: خطای داخلِ رشتهٔ SQL نه از `node -c` رد می‌شود نه از
  // ESLint. تنها نگهبانش تستِ زنده است — `testE2E.js` که حالا به
  // `npm test` اضافه شده تا اگر دوباره شکست، جلوی deploy را بگیرد.
  const { rows } = await pool.query(
    'SELECT *, ($1 >= required_points) AS eligible FROM reward_tiers '
    + 'WHERE is_active = true ORDER BY display_order, required_points',
    [req.user.current_points],
  );
  res.json(rows);
}));

router.get('/reward-groups', auth, asyncHandler(async (req, res) => {
  res.json(await rewardGroups.userView(req.user.id));
}));

router.post('/rewards/:id/claim', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  // Delegated to rewardGroupService, which (unlike the previous inline
  // version) credits cash rewards to the wallet, consumes only the cards the
  // tier actually requires instead of the user's entire inventory, and
  // restarts that group's progress bar.
  try {
    res.json(await rewardGroups.claim(req.user.id, req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در ثبت جایزه' });
  }
}));

  return router;
};
