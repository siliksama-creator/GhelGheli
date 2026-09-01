/**
 * اهرم‌های موتور — پنل ادمین (وب و اندروید).
 *
 * تنظیماتِ فنی‌ای که تا امروز ثابتِ کد بودند و تغییرشان دپلوی می‌خواست:
 * آستانه‌های تشخیص کارت با عکس، منحنی سطح بازیکن، جوایز استریک ورود،
 * و پیام‌های آمادهٔ چت. همه در `app_settings` ذخیره و از کشِ همگام
 * (opsConfig) خوانده می‌شوند — ذخیره در پنل بلافاصله روی کلاینت‌ها
 * اثر می‌گذارد، بدون ری‌استارت و بدون آپدیت اپ.
 */
const express = require('express');
const opsLimits = require('../services/opsLimits');
const payments = require('../services/paymentService');

module.exports = function createAdminOpsRoutes(deps) {
  const {
    adminAuth, requireRole, asyncHandler, audit, opsConfig, matchSettings,
  } = deps;
  const router = express.Router();

  const num = (x, fallback, min, max) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  // ── نمای کلی ───────────────────────────────────────────────────────────
  router.get('/admin/settings/engine', adminAuth, asyncHandler(async (req, res) => {
    const [photoMatch, levels, streak, canned] = await Promise.all([
      opsConfig.get('photo_match_settings'),
      opsConfig.get('level_settings'),
      opsConfig.get('streak_settings'),
      opsConfig.get('chat_canned_messages'),
    ]);
    res.json({
      photoMatch: { ...matchSettings.DEFAULTS, ...(photoMatch || {}) },
      levels: { minLevel: 0, maxLevel: 100, base: 8, lin: 4, exp: 1.3, knee: 30, tail: 30, ...(levels || {}) },
      streak: { rewards: [100, 150, 200, 250, 300, 350, 500], ...(streak || {}) },
      cannedMessages: Array.isArray(canned) ? canned : [],
    });
  }));

  // ── آستانه‌های موتور تشخیص ─────────────────────────────────────────────
  router.patch('/admin/settings/photo-match', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const cur = { ...matchSettings.DEFAULTS, ...((opsConfig.syncGet('photo_match_settings')) || {}) };
      const next = {
        acceptScore: num(b.acceptScore, cur.acceptScore, 0, 1),
        reviewScore: num(b.reviewScore, cur.reviewScore, 0, 1),
        boundAcceptScore: num(b.boundAcceptScore, cur.boundAcceptScore, 0, 1),
        freeAcceptScore: num(b.freeAcceptScore, cur.freeAcceptScore, 0, 1),
        duplicateSimilarity: num(b.duplicateSimilarity, cur.duplicateSimilarity, 0, 1),
      };
      if (next.reviewScore > next.acceptScore) {
        return res.status(400).json({ message: 'آستانهٔ بررسی باید از آستانهٔ پذیرش کمتر باشد' });
      }
      await opsConfig.set('photo_match_settings', next, req.admin.id);
      await audit(req.admin.id, 'update_photo_match_settings', 'app_settings', null,
        b.reason || null, next);
      res.json({ message: 'آستانه‌های موتور تشخیص ذخیره شد — از همین لحظه اعمال می‌شوند', photoMatch: next });
    }));

  // ── منحنی سطح بازیکن ───────────────────────────────────────────────────
  router.patch('/admin/settings/levels', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const cur = { base: 8, lin: 4, exp: 1.3, knee: 30, tail: 30, ...((opsConfig.syncGet('level_settings')) || {}) };
      const next = {
        base: num(b.base, cur.base, 1, 10000),
        lin: num(b.lin, cur.lin, 0, 10000),
        exp: num(b.exp, cur.exp, 0.5, 3),
        knee: Math.round(num(b.knee, cur.knee, 1, 99)),
        tail: num(b.tail, cur.tail, 0, 10000),
      };
      await opsConfig.set('level_settings', next, req.admin.id);
      await audit(req.admin.id, 'update_level_settings', 'app_settings', null,
        b.reason || null, next);
      res.json({ message: 'منحنی سطح ذخیره شد — نوار پیشرفت همهٔ کاربران از حالا با آن حساب می‌شود', levels: next });
    }));

  // ── جوایز استریک ورود ──────────────────────────────────────────────────
  router.patch('/admin/settings/streak', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const cur = (opsConfig.syncGet('streak_settings')) || { rewards: [100, 150, 200, 250, 300, 350, 500] };
      if (!Array.isArray(b.rewards) || b.rewards.length < 2 || b.rewards.length > 30) {
        return res.status(400).json({ message: 'چرخه باید بین ۲ تا ۳۰ روز باشد' });
      }
      const rewards = b.rewards.map((x) => Math.round(num(x, 0, 0, 1_000_000)));
      const next = { rewards };
      await opsConfig.set('streak_settings', next, req.admin.id);
      await audit(req.admin.id, 'update_streak_settings', 'app_settings', null,
        b.reason || null, next);
      res.json({ message: 'چرخهٔ استریک ذخیره شد', streak: next });
    }));

  // ── پیام‌های آمادهٔ چت ──────────────────────────────────────────────────
  router.get('/admin/chat/canned', adminAuth, asyncHandler(async (req, res) => {
    const v = await opsConfig.get('chat_canned_messages');
    res.json(Array.isArray(v) ? v : []);
  }));

  router.patch('/admin/chat/canned', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      if (!Array.isArray(b.messages)) {
        return res.status(400).json({ message: 'فهرست پیام‌ها ارسال نشده' });
      }
      const messages = b.messages
        .map((x) => String(x ?? '').trim())
        .filter((x) => x.length > 0 && x.length <= 80)
        .slice(0, 60);
      await opsConfig.set('chat_canned_messages', messages, req.admin.id);
      await audit(req.admin.id, 'update_chat_canned_messages', 'app_settings', null,
        b.reason || null, { count: messages.length });
      res.json({ message: `فهرست پیام‌های آماده ذخیره شد (${messages.length} پیام)`, messages });
    }));

  // ── سقف‌ها و اعدادِ عملیاتی (chatKeepLimit، قفل عکس، معرف، نرخ‌ها،
  //    گردونه) — آخرین دسته از ثابت‌هایی که از پنل قابل تنظیم شدند ──────
  router.get('/admin/settings/ops-limits', adminAuth,
    asyncHandler(async (req, res) => {
      res.json(opsLimits.panelView());
    }));

  router.patch('/admin/settings/ops-limits', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const saved = await opsLimits.save(req.body || {}, req.admin.id);
      await audit(req.admin.id, 'update_ops_limits', 'app_settings', null,
        req.body.reason || null, saved);
      res.json({
        message: 'سقف‌ها ذخیره شد — از همین لحظه اعمال می‌شوند',
        ...saved,
      });
    }));

  // ── نقاط قیمتی کافه‌بازار — فقط‌خواندنی ───────────────────────────────
  // این جدول باید دقیقاً با کنسول کافه‌بازار یکی باشد؛ پنل فقط نشانش
  // می‌دهد تا مدیر ببیند کدام قیمت‌ها قابل خریدند و آدرسِ درگاه چیست.
  router.get('/admin/bazaar-products', adminAuth,
    asyncHandler(async (req, res) => {
      const cat = payments.bazaarCatalog();
      res.json({
        priceProducts: Object.entries(cat.priceProducts)
          .map(([price, productId]) => ({ price: Number(price), productId })),
        plusProducts: Object.entries(cat.plusProducts)
          .map(([plan, p]) => ({ plan, ...p })),
        apiBase: cat.apiBase,
      });
    }));

  return router;
};
