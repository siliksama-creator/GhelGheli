/**
 * مدیریت ماموریت‌های روزانه/هفتگی — پنل ادمین (وب و اندروید).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل تا امروز وجود نداشت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * پولِ ماموریت‌ها (`DAILY_FAMILIES` / `WEEKLY_POOL`) و جایزهٔ تکمیلِ
 * روزانه در `missionService.js` هاردکد بود. یعنی هر تغییر = دپلوی.
 * از این پس:
 *
 *   - جایزهٔ تکمیل روزانه از تنظیمات خوانده می‌شود،
 *   - هر ماموریتِ توکار را می‌شود بازنویسی کرد (جایزه/هدف/متن/خاموش)،
 *   - ماموریتِ سفارشی ساخت (همیشه فعال، بدون چرخش تصادفی).
 *
 * نکتهٔ چرخش: ماموریت‌های توکار با هشِ کاربر+روز چرخش می‌خورند تا
 * تنوع روزانه حفظ شود؛ ماموریت‌های سفارشی ادمین همیشه نمایش داده
 * می‌شوند چون مدیر صریحاً خواسته‌شان است.
 */
const express = require('express');

const EVENTS = ['match_completed', 'online_win', 'share', 'rematch', 'friend_challenge', 'other'];
const PERIODS = ['daily', 'weekly'];

module.exports = function createAdminMissionsRoutes(deps) {
  const { pool, adminAuth, requireRole, asyncHandler, audit, missions, opsConfig } = deps;
  const router = express.Router();

  const num = (x, fallback, min, max) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const str = (x, fallback, max = 240) => {
    const s = String(x ?? '').trim();
    return s ? s.slice(0, max) : fallback;
  };

  // ── کاتالوگ کامل ───────────────────────────────────────────────────────
  router.get('/admin/missions', adminAuth, asyncHandler(async (req, res) => {
    const catalog = await missions.adminCatalog();
    const { rows: customsRaw } = await pool.query(
      'SELECT * FROM mission_definitions ORDER BY sort_order, created_at');
    res.json({
      config: catalog.config,
      builtin: catalog.builtin,
      customs: customsRaw,
      events: EVENTS,
      periods: PERIODS,
    });
  }));

  // ── جایزهٔ تکمیل روزانه ────────────────────────────────────────────────
  router.patch('/admin/missions/config', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const cur = opsConfig.syncGet('mission_config') || { dailyBonus: 100, overrides: {} };
      const next = {
        ...(typeof cur === 'object' ? cur : {}),
        dailyBonus: Math.round(num(b.dailyBonus, cur.dailyBonus ?? 100, 0, 100000)),
      };
      await opsConfig.set('mission_config', next, req.admin.id);
      await audit(req.admin.id, 'update_mission_config', 'app_settings', null,
        b.reason || null, { dailyBonus: next.dailyBonus });
      res.json({ message: 'جایزهٔ تکمیل روزانه ذخیره شد', config: next });
    }));

  // ── بازنویسی یک ماموریت توکار (در mission_config.overrides) ─────────────
  router.patch('/admin/missions/builtin/:key', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const key = str(req.params.key, '').slice(0, 64);
      const cur = opsConfig.syncGet('mission_config') || { dailyBonus: 100, overrides: {} };
      const overrides = { ...(cur.overrides || {}) };
      const prev = overrides[key] || {};
      const next = {
        ...prev,
        reward: b.reward !== undefined ? Math.round(num(b.reward, prev.reward ?? 0, 0, 100000)) : prev.reward,
        goal: b.goal !== undefined ? Math.round(num(b.goal, prev.goal ?? 1, 1, 1000)) : prev.goal,
        active: b.active !== undefined ? Boolean(b.active) : (prev.active !== false),
      };
      if (b.title !== undefined) next.title = str(b.title, '', 120);
      if (b.description !== undefined) next.description = str(b.description, '', 240);
      overrides[key] = next;
      await opsConfig.set('mission_config', { ...cur, overrides }, req.admin.id);
      await audit(req.admin.id, 'override_mission', 'mission_definitions', key,
        b.reason || null, next);
      res.json({ message: 'ماموریت ذخیره شد — از چرخش بعدی اعمال می‌شود', override: next });
    }));

  // ── ساخت ماموریت سفارشی ────────────────────────────────────────────────
  router.post('/admin/missions', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const key = str(b.key, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const period = str(b.period, 'daily');
      const event = str(b.event, 'other');
      if (!/^[a-z][a-z0-9_]{2,60}$/.test(key)) {
        return res.status(400).json({ message: 'کلید باید با حرف انگلیسی شروع شود (۳ تا ۶۰ کاراکتر، فقط حروف/عدد/خط زیرین)' });
      }
      if (!PERIODS.includes(period)) return res.status(400).json({ message: 'دوره باید daily یا weekly باشد' });
      if (!EVENTS.includes(event)) return res.status(400).json({ message: 'رویداد معتبر نیست' });
      const title = str(b.title, '');
      if (!title) return res.status(400).json({ message: 'عنوان ماموریت الزامی است' });

      const { rows } = await pool.query(
        `INSERT INTO mission_definitions
           (key, period, event, icon, title, description, goal, reward, is_active, sort_order)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (key) DO UPDATE SET
           period=EXCLUDED.period, event=EXCLUDED.event, icon=EXCLUDED.icon,
           title=EXCLUDED.title, description=EXCLUDED.description,
           goal=EXCLUDED.goal, reward=EXCLUDED.reward, is_active=EXCLUDED.is_active
         RETURNING *`,
        [key, period, event, str(b.icon, 'star', 32), title,
          str(b.description, '', 240),
          Math.round(num(b.goal, 1, 1, 1000)),
          Math.round(num(b.reward, 10, 0, 100000)),
          b.isActive !== undefined ? Boolean(b.isActive) : true,
          Math.round(num(b.sortOrder, 0, 0, 100000))]);
      await audit(req.admin.id, 'upsert_mission', 'mission_definitions', key,
        b.reason || null, { period, event, title, goal: rows[0].goal, reward: rows[0].reward });
      res.json({ message: `ماموریت «${title}» ثبت شد — از فردا در اپ همه نمایش داده می‌شود`, mission: rows[0] });
    }));

  // ── حذف ماموریت سفارشی ─────────────────────────────────────────────────
  router.delete('/admin/missions/:key', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const key = str(req.params.key, '').slice(0, 64);
      const { rowCount } = await pool.query(
        'DELETE FROM mission_definitions WHERE key=$1', [key]);
      if (!rowCount) return res.status(404).json({ message: 'ماموریت سفارشی پیدا نشد' });
      await audit(req.admin.id, 'delete_mission', 'mission_definitions', key, req.body?.reason || null);
      res.json({ message: 'ماموریت سفارشی حذف شد' });
    }));


  // ── مقیاس‌دهی یک‌جای جوایز ماموریت‌ها ──────────────────────────────────
  //
  // خواستهٔ مالک: اهرم کلی مثل گذر نبرد — همهٔ rewardها × ضریب.
  // scope: builtin | custom | all
  // فقط reward (امتیاز) لمس می‌شود؛ goal/active دست‌نخورده.
  router.post('/admin/missions/scale-rewards', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const factor = Number(b.factor);
      if (!Number.isFinite(factor) || factor < 0 || factor > 20) {
        return res.status(400).json({ message: 'ضریب باید عددی بین ۰ و ۲۰ باشد' });
      }
      const scope = str(b.scope, 'all'); // builtin|custom|all
      if (!['builtin', 'custom', 'all'].includes(scope)) {
        return res.status(400).json({ message: 'دامنه نامعتبر است' });
      }

      let builtinUpdated = 0;
      let customUpdated = 0;

      if (scope === 'builtin' || scope === 'all') {
        const catalog = await missions.adminCatalog();
        const cur = opsConfig.syncGet('mission_config') || { dailyBonus: 100, overrides: {} };
        const overrides = { ...(cur.overrides || {}) };
        for (const m of (catalog.builtin || [])) {
          const base = Number(m.reward) || 0;
          const next = Math.max(0, Math.round(base * factor));
          if (next === base) continue;
          const prev = overrides[m.key] || {};
          overrides[m.key] = { ...prev, reward: next };
          builtinUpdated += 1;
        }
        // daily bonus هم اگر خواسته شده در همان scope
        let dailyBonus = cur.dailyBonus;
        if (b.scaleDailyBonus !== false) {
          dailyBonus = Math.max(0, Math.round(Number(cur.dailyBonus || 100) * factor));
        }
        await opsConfig.set('mission_config', { ...cur, overrides, dailyBonus }, req.admin.id);
      }

      if (scope === 'custom' || scope === 'all') {
        const { rows } = await pool.query(
          'SELECT key, reward FROM mission_definitions');
        for (const r of rows) {
          const base = Number(r.reward) || 0;
          const next = Math.max(0, Math.round(base * factor));
          if (next === base) continue;
          await pool.query('UPDATE mission_definitions SET reward=$2 WHERE key=$1', [r.key, next]);
          customUpdated += 1;
        }
      }

      await audit(req.admin.id, 'scale_mission_rewards', 'mission_definitions', null,
        b.reason || null, { factor, scope, builtinUpdated, customUpdated });
      res.json({
        message: `جایزهٔ ${builtinUpdated + customUpdated} ماموریت با ضریب ${factor} به‌روز شد`,
        factor,
        scope,
        builtinUpdated,
        customUpdated,
      });
    }));

  return router;
};
