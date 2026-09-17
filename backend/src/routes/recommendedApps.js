/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  برنامه‌های پیشنهادی — مسیرها (خواستهٔ مالک، ۲۶ شهریور)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * یک مسیرِ عمومی برای خواندن و پنج مسیرِ مدیریتی برای ساختن/ویرایش/حذف/
 * جابه‌جایی/روشن-خاموش‌کردن. همه در یک فایل، مثلِ `clientConfig.js`، تا
 * قراردادِ عمومی و پنل کنارِ هم دیده شوند و از هم جدا نیفتند.
 *
 * ── تصمیم‌ها ──────────────────────────────────────────────────────────────
 *
 *   • `GET /api/recommended-apps` **عمومی** است (بدونِ احرازِ هویت): ورودیِ
 *     صفحهٔ «بیشتر» است و کاربرِ واردشده/نشده فرقی ندارد. اگر ورود اجباری
 *     بود، اپ باید پیش از نمایشِ منو منتظرِ توکن می‌ماند و بخش در اولین
 *     ثانیه‌های باز شدنِ اپ غایب می‌شد. گاردِ `testRouteAuth.js` این مسیر را
 *     در فهرستِ سفید می‌بیند (با دلیل نوشته‌شده)، پس «عمومی بودنِ تصادفی»
 *     ممکن نیست.
 *   • مسیرهای مدیریتی همه `adminAuth` دارند؛ مسیرهای نوشتن `requireRole()`
 *     یعنی فقط مدیرکل — این محتوا در اپ و وب **همهٔ کاربران** دیده می‌شود،
 *     پس تغییرش هم‌ترازِ تغییرِ خودِ محصول است.
 *   • تیکِ «نمایش در اپ و وب» داخلِ `client_config.features.recommendedApps`
 *     ذخیره می‌شود، ولی اینجا یک مسیرِ کوچکِ مخصوص دارد تا پنل مجبور نباشد
 *     کلِ آبجکتِ پرچم‌ها را بفرستد و بی‌آنکه بخواهد، پرچمِ خاموشیِ یک بازی را
 *     پاک کند. (همان دسته باگی که در `client-config` یک‌بار رخ داد.)
 */
const express = require('express');

module.exports = function createRecommendedAppsRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, service, featureFlags,
    // نگهبانِ شناسهٔ UUID. بدونِ آن، `PUT /admin/recommended-apps/abc` یک
    // خطای ۵۰۰ از خودِ دیتابیس می‌گیرد («invalid input syntax for type
    // uuid») به‌جای یک ۴۰۰ تمیزِ فارسی. گاردِ `testValidation.js` همهٔ
    // مسیرهای `:id` را ملزم به داشتنش می‌کند.
    validateUuid,
  } = deps;
  const router = express.Router();

  const readConfig = async () => {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key='client_config' LIMIT 1");
    return rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {};
  };

  const fail = (res, e) => {
    const code = e && e.code;
    const status = code === 'not_found' ? 404 : (e && e.expected ? 400 : 500);
    return res.status(status).json({ message: e.message, code: code || 'error' });
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  عمومی — ورودیِ صفحهٔ «بیشتر» در وب و اندروید
  // ═════════════════════════════════════════════════════════════════════════
  router.get('/recommended-apps', asyncHandler(async (req, res) => {
    res.json(await service.listPublic(req.query || {}));
  }));

  // ═════════════════════════════════════════════════════════════════════════
  //  پنل ادمین
  // ═════════════════════════════════════════════════════════════════════════
  router.get('/admin/recommended-apps', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      res.json(await service.listAll());
    }));

  router.post('/admin/recommended-apps', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      try {
        const item = await service.create(req.body || {}, req.admin.id);
        await audit(req.admin.id, 'create_recommended_app', 'recommended_apps', item.id,
          'افزودنِ برنامهٔ پیشنهادی', { title: item.title, kind: item.kind });
        res.status(201).json({ item });
      } catch (e) { fail(res, e); }
    }));

  // ⚠️ شناسهٔ ردیف **UUID** است؛ `Number(req.params.id)` یعنی `NaN` و
  //    یعنی هر ویرایش/حذف/جابه‌جاییِ پنل بی‌صدا از کار می‌افتد. این باگِ
  //    نسخهٔ اولِ همین فایل بود (یادگارِ زمانی که جدول SERIAL بود) و
  //    آزمونِ زندهٔ تولید گرفتش؛ گاردِ `testRecommendedApps.js` حالا قفلش
  //    می‌کند.
  router.put('/admin/recommended-apps/:id', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      try {
        const item = await service.update(req.params.id, req.body || {}, req.admin.id);
        await audit(req.admin.id, 'update_recommended_app', 'recommended_apps', item.id,
          'ویرایشِ برنامهٔ پیشنهادی', { title: item.title, isActive: item.isActive });
        res.json({ item });
      } catch (e) { fail(res, e); }
    }));

  router.delete('/admin/recommended-apps/:id', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      try {
        const out = await service.remove(req.params.id);
        await audit(req.admin.id, 'delete_recommended_app', 'recommended_apps', out.id,
          'حذفِ برنامهٔ پیشنهادی', null);
        res.json({ removed: out.id });
      } catch (e) { fail(res, e); }
    }));

  // جابه‌جاییِ ترتیبِ نمایش (بالا/پایین) — بدونِ بازنویسیِ کلِ فهرست.
  router.post('/admin/recommended-apps/:id/move', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      try {
        const out = await service.move(req.params.id, req.body?.direction);
        await audit(req.admin.id, 'move_recommended_app', 'recommended_apps', req.params.id,
          'جابه‌جاییِ ترتیبِ برنامهٔ پیشنهادی', { direction: req.body?.direction, moved: out.moved });
        res.json(out);
      } catch (e) { fail(res, e); }
    }));

  // تیکِ «نمایش در اپ و وب» — کلِ بخش با یک کلیک روشن/خاموش می‌شود.
  router.post('/admin/recommended-apps/visibility', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const active = req.body?.active === true || req.body?.active === 'true';
      const current = await readConfig();
      // ⚠️ مرجِ هدفمند، نه بازنویسی: فقط همین یک کلید عوض می‌شود تا پرچمِ
      //    خاموشیِ بازی‌ها/تعمیر دست‌نخورده بماند.
      const next = {
        ...current,
        features: {
          ...(current.features && typeof current.features === 'object' ? current.features : {}),
          recommendedApps: active,
        },
      };
      await pool.query(
        `INSERT INTO app_settings(key, value, updated_by_admin_id, updated_at)
         VALUES('client_config', $1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               updated_by_admin_id = EXCLUDED.updated_by_admin_id,
               updated_at = NOW()`,
        [JSON.stringify(next), req.admin.id]);
      // کشِ پرچم‌ها همان لحظه تازه می‌شود؛ وگرنه ادمین تیک می‌زند و تا
      // چند ثانیه بعد /api/config همان مقدارِ قبلی را می‌دهد و فکر می‌کند
      // کلید کار نمی‌کند.
      if (featureFlags?.primeFeatures) {
        featureFlags.primeFeatures(next.features);
      }
      await audit(req.admin.id, 'toggle_recommended_apps', 'app_settings', null,
        active ? 'روشن‌کردنِ نمایشِ برنامه‌های پیشنهادی' : 'خاموش‌کردنِ نمایشِ برنامه‌های پیشنهادی',
        { active });
      res.json({ active, items: (await service.listAll()).items });
    }));

  return router;
};
