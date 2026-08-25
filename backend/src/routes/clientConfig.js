/**
 * Client runtime config — «اهرمِ بدون-آپدیت».
 *
 * کلاینت‌ها (وب + اندروید) در هر اجرا از `GET /api/config` می‌خوانند:
 *  - نسخهٔ حداقل اپ (minVersion) و اینکه آپدیت اجباری است یا نه،
 *  - بنر اطلاعیه (متن/لینک) بدون نیاز به انتشار نسخهٔ جدید.
 *
 * نتیجه: تغییرات محتوایی و حتی «اجبار به آپدیت» بدون بیلد/استور انجام
 * می‌شود — فقط PATCH از پنل ادمین.
 */
const express = require('express');

const DEFAULTS = Object.freeze({
  app: {
    minVersion: { android: '1.1.17', ios: '1.1.17' },
    forceUpdate: { android: false, ios: false },
    updateUrl: { android: '', ios: '' },
  },
  announcement: { active: false, text: '', link: null, accent: 'gold' },
});

/** عمیق-مرج می‌کند تا کلیدهای از دست رفته همیشه مقدار پیش‌فرض بگیرند. */
function mergeConfig(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const app = {
    ...DEFAULTS.app,
    ...(v.app && typeof v.app === 'object' ? v.app : {}),
  };
  app.minVersion = {
    ...DEFAULTS.app.minVersion,
    ...(app.minVersion && typeof app.minVersion === 'object' ? app.minVersion : {}),
  };
  app.forceUpdate = {
    ...DEFAULTS.app.forceUpdate,
    ...(app.forceUpdate && typeof app.forceUpdate === 'object' ? app.forceUpdate : {}),
  };
  app.updateUrl = {
    ...DEFAULTS.app.updateUrl,
    ...(app.updateUrl && typeof app.updateUrl === 'object' ? app.updateUrl : {}),
  };
  const announcement = {
    ...DEFAULTS.announcement,
    ...(v.announcement && typeof v.announcement === 'object' ? v.announcement : {}),
  };
  return { app, announcement };
}

module.exports = function createClientConfigRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, rateLimit, gameEconomy,
  } = deps;

  // عمومی و سبک — هر اجرای اپ/باز شدن وب یک درخواست می‌زند.
  const configLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'تعداد درخواست زیاد است؛ کمی بعد دوباره تلاش کنید' },
  });

  async function loadConfig() {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key='client_config' LIMIT 1");
    return mergeConfig(rows[0]?.value);
  }

  const router = express.Router();

  // ── عمومی: پیکربندی اجرای کلاینت ─────────────────────────────────────
  router.get('/config', configLimiter, asyncHandler(async (req, res) => {
    const cfg = await loadConfig();

    // چند پرچم زندهٔ مشتق‌شده تا کلاینت درخواست اضافه نزند.
    const ws = await pool.query(
      "SELECT value FROM app_settings WHERE key='wallet_settings' LIMIT 1");
    const wallet = ws.rows[0]?.value
      && typeof ws.rows[0].value === 'object' ? ws.rows[0].value : {};

    res.json({
      ...cfg,
      wallet: { enabled: wallet.enabled !== false },
      // اقتصادِ بازی‌ها: سکهٔ هر نتیجه، سهمیهٔ روزانه، درصدِ انتقالِ
      // سکه بین لیگ‌ها و سکهٔ هر لولِ ضربه‌زن. کلاینت‌ها متن‌های راهنما
      // را از همین اعداد می‌سازند — بدونِ نیاز به آپدیتِ اپ.
      economy: await gameEconomy.publicView().catch(() => null),
      serverTime: new Date().toISOString(),
    });
  }));

  // ── ادمین: خواندن/ذخیره ──────────────────────────────────────────────
  router.get('/admin/settings/client-config', adminAuth, asyncHandler(async (req, res) => {
    res.json(await loadConfig());
  }));

  router.patch('/admin/settings/client-config', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const cur = await loadConfig();
      const b = req.body && typeof req.body === 'object' ? req.body : {};

      const str = (x, fallback, max = 300) => {
        const s = String(x ?? '').trim();
        return s ? s.slice(0, max) : fallback;
      };
      const bool = (x, fallback) => (typeof x === 'boolean' ? x : fallback);

      const next = {
        app: {
          minVersion: {
            android: str(b.app?.minVersion?.android, cur.app.minVersion.android, 20),
            ios: str(b.app?.minVersion?.ios, cur.app.minVersion.ios, 20),
          },
          forceUpdate: {
            android: bool(b.app?.forceUpdate?.android, cur.app.forceUpdate.android),
            ios: bool(b.app?.forceUpdate?.ios, cur.app.forceUpdate.ios),
          },
          updateUrl: {
            android: str(b.app?.updateUrl?.android, cur.app.updateUrl.android, 500),
            ios: str(b.app?.updateUrl?.ios, cur.app.updateUrl.ios, 500),
          },
        },
        announcement: {
          active: bool(b.announcement?.active, cur.announcement.active),
          text: str(b.announcement?.text, cur.announcement.text, 300),
          link: str(b.announcement?.link, cur.announcement.link || null, 500),
          accent: ['gold', 'green', 'blue', 'orange']
            .includes(b.announcement?.accent)
            ? b.announcement.accent
            : cur.announcement.accent,
        },
      };

      await pool.query(
        `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
         VALUES('client_config',$1,$2,NOW())
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,
           updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
        [JSON.stringify(next), req.admin.id]);
      await audit(req.admin.id, 'update_client_config', 'app_settings',
        null, null, next);
      res.json(next);
    }));

  return router;
};
