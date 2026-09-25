// ─────────────────────────────────────────────────────────────────────
// آموزشِ صوتیِ قلقلی — وضعیتِ تور و ثبتِ «دیده شد»
//
// سه مسیر:
//   GET  /api/onboarding        → ترتیب + متن + وضعیتِ دیده‌شد
//   POST /api/onboarding/seen   → کاربر تور را دید/رد کرد
//   POST /api/onboarding/reset  → «دوباره ببین» از پروفایل
//
// چرا reset لازم است: پرچم روی سرور است (خواستهٔ مالک: با عوض‌کردنِ گوشی
// تور از اول شروع نشود). ولی همان پرچم یعنی تنها راهِ دیدنِ دوبارهٔ آموزش
// هم بسته می‌شود؛ این مسیر همان یک راه را باز می‌کند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({ auth, asyncHandler, onboarding }) => {
  const router = express.Router();

  router.get('/onboarding', auth, asyncHandler(async (req, res) => {
    res.json(await onboarding.state(req.user.id));
  }));

  router.post('/onboarding/seen', auth, asyncHandler(async (req, res) => {
    res.json(await onboarding.markSeen(req.user.id, {
      version: req.body?.version,
      skipped: req.body?.skipped === true,
    }));
  }));

  router.post('/onboarding/reset', auth, asyncHandler(async (req, res) => {
    res.json(await onboarding.reset(req.user.id));
  }));

  return router;
};
