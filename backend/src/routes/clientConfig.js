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
const featureFlags = require('../services/featureFlags');

// شناسه‌های مجازِ تب‌ها — یک قراردادِ مشترک بین وب و اندروید. هر کلاینت
// تب‌های خودش را با همین idها نگاشت می‌کند و ترتیبِ ارسالیِ سرور را
// روی نوارِ پایین و شیتِ «بیشتر» اعمال می‌کند؛ id ناشناخته نادیده و
// تب‌های جاافتاده به انتها می‌روند تا هیچ‌وقت تبی گم نشود.
const TAB_IDS = Object.freeze([
  'home', 'rewards', 'league', 'social',
  'shop', 'inventory', 'wallet', 'invite', 'support', 'profile',
]);

/** ترتیبِ پیش‌فرض — دقیقاً چیدمانِ فعلیِ هر دو کلاینت. */
const DEFAULT_TAB_ORDER = Object.freeze([...TAB_IDS]);

/** tabOrder ورودی را پاک‌سازی می‌کند: فقط idهای مجاز، یکتا، به همان ترتیب. */
function normalizeTabOrder(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const id = String(raw ?? '').trim();
    if (!TAB_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length ? out : null;
}

const DEFAULTS = Object.freeze({
  app: {
    minVersion: { android: '1.1.17', ios: '1.1.17' },
    forceUpdate: { android: false, ios: false },
    updateUrl: { android: '', ios: '' },
  },
  announcement: { active: false, text: '', link: null, accent: 'gold' },
  features: featureFlags.DEFAULTS,
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
  // پرچم‌های اجرایی (تعمیر، خاموشی هر بازی، گردونه) داخل همین JSON
  // می‌مانند تا مایگریشن تازه لازم نباشد و کلاینت‌های قدیمی کلید
  // ناشناخته را نادیده بگیرند.
  const features = featureFlags.normalizeFeatures(v.features);
  const tabOrder = normalizeTabOrder(v.tabOrder) || DEFAULT_TAB_ORDER;
  return { app, announcement, features, tabOrder };
}

module.exports = function createClientConfigRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, rateLimit, gameEconomy,
    // اختیاری — برای اهرمِ بدون‌آپدیتِ متن‌های راهنما/دعوت/گذر/شرط.
    opsLimits, referrals, pass, shop, gameStakes,
    // محتوا و اعداد زنده (فاز ۱ نقشه‌راه).
    liveContent,
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

    let gamePoints = null;
    try {
      if (deps.gameRewards?.getGameRewardSettings) {
        gamePoints = await deps.gameRewards.getGameRewardSettings();
      }
    } catch { /* امتیاز بازی یک زینت است؛ config نباید بشکند */ }

    // ── دعوت / گردونه / راهنما — اعدادِ زنده‌ای که متن UI را می‌سازند ──
    //
    // قبلاً فقط در `/api/referrals` (نیازمند توکن) بودند و صفحاتِ عمومی
    // (ثبت‌نام، پیام اشتراک، راهنمای گردونه) عدد را داخل APK نوشته بودند.
    // حالا بدون احراز هویت هم می‌آیند تا هر راهنما بدون آپدیت زنده بماند.
    let referral = null;
    try {
      if (opsLimits?.get) {
        const o = opsLimits.get();
        referral = {
          commissionPercent: o.referralCommissionPercent,
          purchaseCommissionPercent: o.referralPurchaseCommissionPercent,
          spinsPerReferral: o.referralSpinsPerInvite,
          invitesPerDailySpin: o.referralInvitesPerDailySpin,
          // ضریبِ «هر آستانه = چند چرخش روزانه» — از اعدادِ زنده تا متنِ
          // راهنمای دعوت و عددِ واقعیِ گردونه هرگز در دو رقم نباشند.
          spinsPerDailyThreshold: liveContent?.rules
            ? liveContent.rules().spinsPerDailyThreshold
            : 1,
          maxInvitesForDaily: o.referralMaxInvitesForDaily,
          baseDailySpins: o.referralBaseDailySpins,
          withdrawalThreshold: o.referralWithdrawalThreshold,
        };
      } else if (referrals) {
        referral = {
          commissionPercent: referrals.commissionPercent(),
          purchaseCommissionPercent: referrals.purchaseCommissionPercent(),
          spinsPerReferral: referrals.spinsPerReferral(),
          invitesPerDailySpin: referrals.invitesPerDailySpin(),
          maxInvitesForDaily: referrals.maxInvitesForDaily(),
          baseDailySpins: referrals.baseDailySpins(),
          withdrawalThreshold: referrals.referralWithdrawalThreshold
            ? referrals.referralWithdrawalThreshold()
            : referrals.REFERRAL_WITHDRAWAL_THRESHOLD,
        };
      }
    } catch { /* راهنما زینت است */ }

    // منابع XP گذر نبرد — قرص‌های راهنما روی صفحهٔ گذر از همین ساخته می‌شوند.
    let passSources = null;
    try {
      if (pass?.getPassConfig) {
        const pc = await pass.getPassConfig();
        passSources = Object.entries(pc.sources || {}).map(([k, v]) => ({
          source: k,
          xp: v.xp,
          dailyCap: v.dailyCap,
          label: v.label,
        }));
      }
    } catch { /* */ }

    // قیمت پلاس برای تیتر فروشگاه — نه عددِ ۵۹۰۰۰ داخل APK.
    let plus = null;
    try {
      if (shop?.plusPlansConfig) {
        const plans = shop.plusPlansConfig();
        plus = {
          monthlyPrice: plans.monthly?.price ?? null,
          annualPrice: plans.annual?.price ?? null,
          monthlyDays: plans.monthly?.days ?? 30,
          annualDays: plans.annual?.days ?? 365,
          annualSavingPercent: plans.annual?.savingPercent ?? 30,
        };
      }
    } catch { /* */ }

    // شرط‌های مجاز — تا وقتی سرور stake جدید اضافه کند، کلاینت‌های قدیمی
    // همان لیستِ ثابت را دارند؛ کلاینت‌های جدید از اینجا می‌خوانند.
    let stakes = null;
    try {
      if (opsLimits?.get) {
        const o = opsLimits.get();
        stakes = {
          public: [...(o.publicStakes || [0, 100, 1000])],
          lobby: [...(o.lobbyStakes || [0, 100, 1000, 5000])],
        };
      } else {
        const pub = gameStakes?.PUBLIC_STAKES || [0, 100, 1000];
        const lobby = gameStakes?.LOBBY_STAKES || [0, 100, 1000, 5000];
        stakes = { public: [...pub], lobby: [...lobby] };
      }
    } catch { /* */ }

    // منحنی ضربه‌زن برای زیرعنوان کاتالوگ بازی («N لول …»).
    let tapLevelCount = null;
    try {
      const econ = await gameEconomy.publicView().catch(() => null);
      tapLevelCount = econ?.tapCurve?.levelCount ?? null;
    } catch { /* */ }

    res.json({
      ...cfg,
      wallet: { enabled: wallet.enabled !== false },
      // اقتصادِ بازی‌ها: سکهٔ هر نتیجه، سهمیهٔ روزانه، درصدِ انتقالِ
      // سکه بین لیگ‌ها و سکهٔ هر لولِ ضربه‌زن. کلاینت‌ها متن‌های راهنما
      // را از همین اعداد می‌سازند — بدونِ نیاز به آپدیتِ اپ.
      economy: await gameEconomy.publicView().catch(() => null),
      // امتیازِ برد/باخت/مساویِ بازی آنلاین — همان تنظیمِ پنل ادمین.
      gamePoints,
      referral,
      passSources,
      plus,
      stakes,
      tapLevelCount,
      // ── محتوا و اعداد زنده (نقشه‌راه یکپارچه‌سازی — فاز ۱) ────────────
      //
      // `copy` قالب‌های متنِ کلِ محصول (با جای‌نگهدار)، `rules` اعدادِ
      // ساختاریِ زنده و `configVersion` شمارندهٔ ذخیره‌هاست. کلاینت‌های
      // فاز ۲ این سه را می‌گیرند و متن/عددِ سفتِ APK از بین می‌رود.
      // کلاینتِ قدیمی این سه کلیدِ ناشناخته را بی‌صدا نادیده می‌گیرد،
      // پس این افزودن برای نسخه‌های موجودِ استور کاملاً بی‌ضرر است.
      ...(liveContent
        ? {
          copy: liveContent.copy(),
          rules: liveContent.rules(),
          configVersion: liveContent.configVersion(),
        }
        : {}),
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
        // ذخیرهٔ بنر نباید پرچم خاموشی بازی را پاک کند.
        features: featureFlags.normalizeFeatures(
          b.features !== undefined ? b.features : cur.features,
        ),
        // چیدمان تب‌ها — آرایهٔ idها به ترتیب دلخواه؛ خالی = پیش‌فرض.
        tabOrder: b.tabOrder !== undefined
          ? (normalizeTabOrder(b.tabOrder) || cur.tabOrder)
          : cur.tabOrder,
      };

      await pool.query(
        `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
         VALUES('client_config',$1,$2,NOW())
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,
           updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
        [JSON.stringify(next), req.admin.id]);
      await audit(req.admin.id, 'update_client_config', 'app_settings',
        null, null, next);
      // کش پرچم‌ها را همان لحظه تازه کن تا خاموشی بازی تا ۵ ثانیهٔ بعد
      // اعمال نشود — وگرنه مدیر فکر می‌کند کلید کار نمی‌کند.
      featureFlags.primeFeatures(next.features);
      res.json(next);
    }));

  // ═══════════════════════════════════════════════════════════════════════
  // «متن‌ها و اعداد» — پنلِ یکپارچه‌سازی (نقشه‌راه — فاز ۱، سمت سرور)
  //
  // پنلِ وب و پنلِ اندروید **همین** چهار مسیر را صدا می‌زنند تا «یک محصول،
  // یک بافت» از همان جا چاپ شود:
  //   GET   /admin/settings/live-content          → همه‌چیز (نمای پنل)
  //   PATCH /admin/settings/live-content/rules    → اعدادِ ساختاری (بازهٔ امن)
  //   PATCH /admin/settings/live-content/copy     → قالب‌های متن
  //   GET   /admin/settings/live-content/history/:key
  //   POST  /admin/settings/live-content/:key/revert
  //   POST  /admin/settings/live-content/preview  → پیش‌نمایش با اعدادِ امروز
  //
  // هر ذخیره: تاریخچهٔ قبلی + cache prime + configVersion++ — یعنی همان
  // لحظه، کلِ محصول (وب + اندروید) بدون آپدیت تغییر می‌کند.
  // ═══════════════════════════════════════════════════════════════════════

  router.get('/admin/settings/live-content', adminAuth, asyncHandler(async (req, res) => {
    if (!liveContent) throw Object.assign(new Error('دسترس‌نیافته'), { status: 404 });
    res.json(liveContent.panelView());
  }));

  router.patch('/admin/settings/live-content/rules', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      if (!liveContent) throw Object.assign(new Error('دسترس‌نیافته'), { status: 404 });
      const next = await liveContent.saveRules(req.body, req.admin.id);
      await audit(req.admin.id, 'save_live_rules', 'app_settings', null, null, next);
      res.json({ rules: next, configVersion: liveContent.configVersion() });
    }));

  router.patch('/admin/settings/live-content/copy', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      if (!liveContent) throw Object.assign(new Error('دسترس‌نیافته'), { status: 404 });
      const next = await liveContent.saveCopy(req.body, req.admin.id);
      await audit(req.admin.id, 'save_live_copy', 'app_settings', null, null,
        { version: liveContent.configVersion() });
      res.json({ copy: next, configVersion: liveContent.configVersion() });
    }));

  // پیش‌نمایش: کلاینت اعدادِ «امروز» (از همان /api/config) می‌فرستد تا
  // مدیر قبل از ذخیره ببیند متنِ کاربر چه می‌شود — ویرایشِ کور نیست.
  router.post('/admin/settings/live-content/preview', adminAuth, asyncHandler(async (req, res) => {
    if (!liveContent) throw Object.assign(new Error('دسترس‌نیافته'), { status: 404 });
    const vars = req.body?.vars && typeof req.body.vars === 'object' ? req.body.vars : {};
    res.json(liveContent.preview(vars));
  }));

  router.get('/admin/settings/live-content/history/:key', adminAuth, asyncHandler(async (req, res) => {
    if (!liveContent) throw Object.assign(new Error('دسترس‌نیافته'), { status: 404 });
    const key = req.params.key === 'copy' ? liveContent.COPY_KEY
      : req.params.key === 'rules' ? liveContent.RULES_KEY : req.params.key;
    if (key !== liveContent.COPY_KEY && key !== liveContent.RULES_KEY) {
      throw Object.assign(new Error('کلید ناشناخته'), { status: 400 });
    }
    res.json(await liveContent.history(key));
  }));

  router.post('/admin/settings/live-content/:key/revert', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      if (!liveContent) throw Object.assign(new Error('دسترس‌نیافته'), { status: 404 });
      const key = req.params.key === 'copy' ? liveContent.COPY_KEY
        : req.params.key === 'rules' ? liveContent.RULES_KEY : req.params.key;
      const next = await liveContent.revert(key, req.admin.id);
      await audit(req.admin.id, 'revert_live_content', key, null, null, next);
      res.json({ [key]: next, configVersion: liveContent.configVersion() });
    }));

  return router;
};
