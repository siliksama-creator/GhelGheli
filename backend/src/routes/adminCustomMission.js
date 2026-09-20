/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ماموریت‌های اختصاصی — مسیرهای پنلِ ادمین
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «این ماموریت را ادمین در پنل مشخص و امتیازدهی می‌کند. اگر
 * ادمین فعالش کند به همهٔ کاربران نشان داده می‌شود. مدیر حتی اجازه دارد
 * لینکِ قابلِ کلیک بسازد و لینک را پشتِ کلمهٔ «اینجا کلیک کنید» بگذارد، به
 * رنگِ مثلاً آبی یا سبز.»
 *
 * و بعد: «اگه ادمین خواست چند تا ماموریتِ اختصاصی بتونه قرار بده.»
 *
 * چهار مسیر:
 *   GET  /api/admin/custom-mission             → فهرست + پیش‌نمایش + آمارِ دریافت
 *   PUT  /api/admin/custom-mission             → ذخیرهٔ کلِ فهرست (اتمیک)
 *   POST /api/admin/custom-mission/:id/reset   → «دورهٔ تازه» برای یک ماموریت
 *
 * چرا PUT و نه PATCH: این یک **فهرستِ یگانه** با ویرایشِ کاملِ فرم است؛
 * پنل همهٔ ماموریت‌ها را یک‌جا می‌فرستد، پس «جای‌گزینی» معنیِ درست را
 * می‌دهد و ماموریتی که در بدنه نیست، حذف شده است (نه «دست نزن»).
 * همین «یک PUT برای همه» جلوی حالتِ نیمه‌ذخیره را می‌گیرد: یا ادمین فهرستِ
 * مرتب‌شده‌اش را می‌بیند، یا هیچ‌کدام — نه چیزی وسطِ راه.
 *
 * سازگاری: بدنهٔ **تک‌ماموریتیِ** قدیمی (`{enabled, title, points, link}`)
 * هم پذیرفته می‌شود و یک فهرستِ تک‌عضوی می‌سازد؛ پس اگر پنلِ قدیمی روی
 * مرورگری باز مانده باشد، ذخیره‌اش نمی‌شکند.
 */
const express = require('express');

const COLORS = ['blue', 'green'];

module.exports = function createAdminCustomMissionRoutes(deps) {
  const { adminAuth, requireRole, asyncHandler, audit, validateUuid, customMission } = deps;
  const router = express.Router();

  router.get('/admin/custom-mission', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    res.json({
      // فهرستِ کامل — همهٔ ماموریت‌ها، خاموش و روشن، با ترتیبی که ادمین
      // چیده. کلیدِ `missions` چیزی است که پنلِ تازه می‌خواند.
      missions: customMission.list(),
      // مُهرِ زمانیِ فهرست — پنل آن را هنگامِ ذخیره پس می‌فرستد تا ذخیرهٔ
      // یک تبِ کهنه، فهرستِ تازه را بی‌صدا پاک نکند (خطای ۴۰۹).
      updatedAt: customMission.listStamp(),
      max: customMission.MAX_ITEMS,
      colors: COLORS,
      // پیش‌نمایشِ دقیقاً همان چیزی که کاربر می‌بیند (برای پنلِ وب).
      preview: customMission.publicView(),
      // ── کلیدهای سازگاری ──────────────────────────────────────────────
      // `mission` شکلِ قدیمیِ «ماموریتِ یگانه» است. با یک پنلِ تازه معنی
      // ندارد، ولی نگه داشتنش رایگان است و اگر روزی صفحهٔ دیگری (یا تستی)
      // آن را بخواند، نمی‌شکند.
      mission: customMission.current(),
      // «اینجا کلیک کنید» — پیش‌فرضِ متنی که اگر ادمین متنِ دلخواه ننویسد
      // روی دکمهٔ لینک می‌نشیند. از سرور می‌آید تا هر دو کلاینت یک جمله
      // نشان بدهند، نه دو جملهٔ متفاوت.
      defaultLinkText: 'اینجا کلیک کنید',
      // آمارِ دریافت: { شناسهٔ ماموریت: {claims, lastClaim} }.
      // ادمینِ چند ماموریت بدونِ این نمی‌داند کدام کمپین جواب داده.
      stats: await customMission.stats(),
      hint: 'هر ماموریت یک کارتِ تمام‌عرض بالای «ماموریت‌های امروز» می‌شود — بدونِ آپدیتِ اپ. ترتیبِ فهرست، همان ترتیبی است که کاربر می‌بیند.',
    });
  }));

  router.put('/admin/custom-mission', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const items = await customMission.saveMany(req.admin.id, b);
      await audit(req.admin.id, 'update_custom_mission', 'app_settings', null,
        b.reason || null, { items });
      const active = items.filter((m) => m.enabled && m.title).length;
      res.json({
        message: active
          ? `${items.length} ماموریت ذخیره شد — ${active} ماموریت فعال از همین لحظه به کاربران نشان داده می‌شود`
          : `${items.length} ماموریت ذخیره شد (هیچ‌کدام فعال نیست و به کاربران نشان داده نمی‌شود)`,
        missions: items,
        updatedAt: customMission.listStamp(),
        preview: customMission.publicView(),
        stats: await customMission.stats(),
      });
    }));

  // ── دورهٔ تازه ──────────────────────────────────────────────────────────
  // همان ماموریت، شناسهٔ تازه: همهٔ کاربران (حتی کسانی که یک‌بار گرفته‌اند)
  // دوباره می‌توانند امتیاز بگیرند. این همان کاری است که قبلاً با «هر ذخیره
  // شناسهٔ تازه می‌گیرد» اتفاق می‌افتاد؛ حالا صریح و اختیاری شده تا اصلاحِ
  // غلطِ تایپی، امتیازِ تازه به همه پخش نکند.
  //
  // POST و نه DELETE/PUT: `PUT` روی همین مسیر، ماموریت را با شناسهٔ تازه
  // جای‌گزین می‌کند ولی کاربر چیزی پاک نمی‌کند؛ `POST` فعلِ صریح است و از
  // قضاوتِ «آیا این idempotent است؟» در امان می‌ماند.
  // `validateUuid('id')` اجباری است، نه تشریفاتی: `testValidation.js` هر
  // مسیرِ `:id` را می‌گردد و اگر گاردِ شناسه نداشته باشد قرمز می‌شود — همان
  // گاردی که همین حالا نسخهٔ اولِ این مسیر را گرفت.
  router.post('/admin/custom-mission/:id/reset', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      const items = await customMission.resetPeriod(req.admin.id, req.params.id);
      await audit(req.admin.id, 'reset_custom_mission', 'app_settings', null,
        'دورهٔ تازه برای ماموریت اختصاصی', { id: req.params.id, items });
      res.json({
        message: 'دوباره به همه فرستاده شد — از این لحظه حتی کاربرانی که این ماموریت را گرفته بودند هم آن را می‌بینند',
        missions: items,
        updatedAt: customMission.listStamp(),
        preview: customMission.publicView(),
      });
    }));

  return router;
};
