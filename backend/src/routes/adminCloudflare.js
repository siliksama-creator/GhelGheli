/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  سپرِ سرور (کلادفلر) — مسیرهای پنلِ ادمین
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * پنج مسیر، همه «فقط مدیرکل»:
 *
 *   GET  /api/admin/cloudflare          → وضعیت (بدونِ توکن)
 *   PUT  /api/admin/cloudflare          → ذخیرهٔ توکن و دامنه‌ها
 *   POST /api/admin/cloudflare/verify   → بررسی و تأییدِ دامنه‌ها در کلادفلر
 *   POST /api/admin/cloudflare/enable   → روشن‌کردن (نیاز به کلمهٔ «تأیید»)
 *   POST /api/admin/cloudflare/disable  → خاموش‌کردن
 *
 * ── چرا فقط مدیرکل ────────────────────────────────────────────────────────
 *
 * `requireRole()` بدونِ آرگومان یعنی «فقط super_admin». این دکمه ترافیکِ
 * *همهٔ* کاربران را از مسیرِ دیگری می‌برد و در بدترین حالت می‌تواند دسترسیِ
 * کلِ برنامه را قطع کند؛ نقشِ پشتیبان برای این کار کافی نیست.
 *
 * ── چرا هر کنش در کارنامهٔ ممیزی ثبت می‌شود ──────────────────────────────
 *
 * فردا که کسی می‌پرسد «چرا ساعتِ ۲ نصفِ شب سایت کند شد؟»، تنها راهِ فهمیدن
 * این است که ثبت شده باشد چه کسی و کِی سپر را زده. هزینه‌اش یک ردیفِ دیتابیس
 * است؛ ارزشش وقتی معلوم می‌شود که همین سؤال پیش بیاید.
 */
const express = require('express');

module.exports = function createAdminCloudflareRoutes(deps) {
  const { adminAuth, requireRole, asyncHandler, audit, cloudflareGuard } = deps;
  const router = express.Router();
  // ⚠️ نگهبان را خطِ‌به‌خط می‌نویسیم (نه با متغیر): نگهبانِ احرازِ
  //    هویت (scripts/testRouteAuth.js) فقط داخلِ همان فراخوانی را می‌خواند و
  //    «...superOnly» را محافظت نمی‌شمارد. نتیجه‌اش یک تستِ سرخِ دروغ بود
  //    که این‌بار خودش درست می‌گفت: بهتر است محافظت صریح و خوانا باشد.
  //    requireRole() بدونِ آرگومان = فقط super_admin.

  // خطاهای این قابلیت «قابلِ انتظار»‌اند (توکن نداریم، ناحیه فعال نیست…)،
  // پس با کدِ ۴۰۰ و پیامِ فارسی برمی‌گردند، نه ۵۰۰.
  const EXPECTED = new Set([
    'bad_domain', 'no_domains', 'too_many_domains', 'no_token', 'bad_token',
    'short_token', 'no_zone', 'zone_pending', 'need_confirm', 'not_verified', 'cf_error',
  ]);
  const fail = (res, e) => {
    const code = e && e.code;
    const status = code === 'network' ? 502 : (EXPECTED.has(code) ? 400 : 500);
    return res.status(status).json({ message: e.message, code: code || 'error' });
  };

  router.get('/admin/cloudflare', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    const state = await cloudflareGuard.load();
    res.json({
      ...cloudflareGuard.publicState(state),
      serverMode: cloudflareGuard.serverMode(),
      hint: 'تا وقتی این سپر خاموش است، ترافیک مستقیم به سرور می‌آید و هیچ چیزی عوض نمی‌شود.',
    });
  }));

  router.put('/admin/cloudflare', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    try {
      const out = await cloudflareGuard.saveConfig(
        { apiToken: req.body.apiToken, domains: req.body.domains },
        req.admin.id,
      );
      await audit(req.admin.id, 'cloudflare_config', 'app_settings', null,
        'ذخیرهٔ تنظیماتِ سپرِ سرور', { domains: out.domains, tokenChanged: !!String(req.body.apiToken || '').trim() });
      res.json({ ...out, serverMode: cloudflareGuard.serverMode() });
    } catch (e) { fail(res, e); }
  }));

  router.post('/admin/cloudflare/verify', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    try {
      const report = await cloudflareGuard.verify(req.admin.id);
      await audit(req.admin.id, 'cloudflare_verify', 'app_settings', null,
        'بررسی و تأیید دامنه‌ها در کلادفلر', { zone: report.zone, verified: report.verified, missing: report.missing });
      res.json({
        ...report,
        ...cloudflareGuard.publicState(await cloudflareGuard.load()),
        serverMode: cloudflareGuard.serverMode(),
      });
    } catch (e) { fail(res, e); }
  }));

  router.post('/admin/cloudflare/enable', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    try {
      const out = await cloudflareGuard.enable(
        { confirm: req.body.confirm, underAttack: !!req.body.underAttack },
        req.admin.id,
      );
      await audit(req.admin.id, 'cloudflare_enable', 'app_settings', null,
        'روشن‌کردنِ سپرِ کلادفلر', { underAttack: !!req.body.underAttack, domains: out.applied });
      res.json(out);
    } catch (e) { fail(res, e); }
  }));

  router.post('/admin/cloudflare/disable', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    try {
      const out = await cloudflareGuard.disable(req.admin.id);
      await audit(req.admin.id, 'cloudflare_disable', 'app_settings', null,
        'خاموش‌کردنِ سپرِ کلادفلر', { domains: out.applied });
      res.json(out);
    } catch (e) { fail(res, e); }
  }));

  return router;
};
