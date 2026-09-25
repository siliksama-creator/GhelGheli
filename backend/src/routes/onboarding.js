// ─────────────────────────────────────────────────────────────────────
// آموزشِ صوتیِ قلقلی — وضعیتِ تور و ثبتِ «دیده شد»
//
// مسیرها:
//   GET  /api/onboarding             → ترتیب + متن + وضعیتِ دیده‌شد
//   GET  /api/onboarding/audio/:file → پخشِ فایلِ صدا (عمومی)
//   POST /api/onboarding/seen        → کاربر تور را دید/رد کرد
//   POST /api/onboarding/reset       → «دوباره ببین» از پروفایل
//
// چرا فایل‌های صدا از `/api/...` سرو می‌شوند و نه `/public/...`:
// nginx روی vhostِ وب فقط `/api/`، `/uploads/`، `/socket.io/`، `/assets/` و
// `/ml/` را پروکسی می‌کند. `/public/...` به ریشهٔ استاتیکِ خودِ وب می‌خورد و
// ۴۰۴ می‌دهد — همان چیزی که اول بار صدا را در وب بی‌صدا کرد. `/api/` روی
// همهٔ میزبان‌ها (وب، پنل، دامنهٔ api، اپِ موبایل) پروکسی است.
//
// این مسیر عمداً **بدونِ auth** است: مرورگر برای پخشِ صدا کوکی/هدرِ
// توکن نمی‌فرستد (عنصرِ `<audio>` هدرِ دلخواه نمی‌گذارد) و محتوایش هم
// همان فایل‌های ثابتِ آموزشی است، نه دادهٔ کاربر. نامِ فایل از فهرستِ
// سفیدِ سرویس می‌آید، پس پیمایشِ مسیر ممکن نیست.
//
// چرا reset لازم است: پرچم روی سرور است (خواستهٔ مالک: با عوض‌کردنِ گوشی
// تور از اول شروع نشود). ولی همان پرچم یعنی تنها راهِ دیدنِ دوبارهٔ آموزش
// هم بسته می‌شود؛ این مسیر همان یک راه را باز می‌کند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');
const path = require('path');

module.exports = ({ auth, asyncHandler, onboarding }) => {
  const router = express.Router();

  router.get('/onboarding', auth, asyncHandler(async (req, res) => {
    res.json(await onboarding.state(req.user.id));
  }));

  // پخشِ صدا: `sendFile` خودش Range/ETag/If-None-Match را می‌داند، پس
  // مرورگر می‌تواند همان فایل را از کش بردارد و سرِ بخشِ بعد، صفر تأخیر
  // داشته باشد. نامِ نامعتبر = ۴۰۴ (نه ۴۰۳) تا فهرستِ فایل‌ها لو نرود.
  router.get('/onboarding/audio/:file', (req, res) => {
    const file = String(req.params.file || '');
    if (!onboarding.AUDIO_FILES.includes(file)) {
      res.status(404).json({ message: 'صدا پیدا نشد' });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(onboarding.AUDIO_DIR, file));
  });

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
