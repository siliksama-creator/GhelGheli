const express = require('express');
const social = require('../services/socialService');
const missions = require('../services/missionService');
const analytics = require('../services/analyticsService');

module.exports = function growthRoutes({
  auth, adminAuth, requireRole, asyncHandler, validateUuid, presence, rateLimit,
}) {
  const router = express.Router();
  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    // Every route using this limiter runs `auth` first.
    keyGenerator: req => `user:${req.user.id}`,
    message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' },
  });

  router.get('/growth/overview', auth, asyncHandler(async (req, res) => {
    const [friends, missionStatus] = await Promise.all([
      social.overview(req.user.id, presence.isOnline),
      missions.status(req.user.id),
    ]);
    res.json({ ...friends, ...missionStatus });
  }));

  router.get('/friends', auth, asyncHandler(async (req, res) => {
    res.json(await social.overview(req.user.id, presence.isOnline));
  }));
  router.get('/friends/search', auth, asyncHandler(async (req, res) => {
    res.json(await social.search(req.user.id, req.query.q, presence.isOnline));
  }));
  router.post('/friends/:id/request', auth, validateUuid('id'), writeLimiter, asyncHandler(async (req, res) => {
    res.json(await social.request(req.user.id, req.params.id));
  }));
  router.post('/friends/requests/:id/accept', auth, validateUuid('id'), writeLimiter, asyncHandler(async (req, res) => {
    res.json(await social.accept(req.user.id, req.params.id));
  }));
  router.delete('/friends/:id', auth, validateUuid('id'), writeLimiter, asyncHandler(async (req, res) => {
    res.json(await social.remove(req.user.id, req.params.id));
  }));
  router.post('/friends/users/:id/block', auth, validateUuid('id'), writeLimiter, asyncHandler(async (req, res) => {
    res.json(await social.block(req.user.id, req.params.id));
  }));

  router.get('/missions', auth, asyncHandler(async (req, res) => {
    res.json(await missions.status(req.user.id));
  }));
  router.post('/missions/daily-bonus/claim', auth, writeLimiter, asyncHandler(async (req, res) => {
    res.json(await missions.claimDailyBonus(req.user.id));
  }));
  router.post('/missions/:key/claim', auth, writeLimiter, asyncHandler(async (req, res) => {
    res.json(await missions.claim(req.user.id, String(req.params.key || '').slice(0, 64)));
  }));

  // match_started/completed/rematch are authoritative engine events. The only
  // client-origin product event accepted here is share, and its payload is
  // deliberately tiny so this endpoint cannot become arbitrary-log storage.
  router.post('/analytics/events', auth, writeLimiter, asyncHandler(async (req, res) => {
    if (req.body?.event !== 'share') {
      return res.status(400).json({ message: 'این رویداد فقط از سرور ثبت می‌شود' });
    }
    await Promise.all([
      analytics.record(req.user.id, 'share', {
        platform: req.body?.platform,
        gameId: req.body?.gameId,
        matchId: req.body?.matchId || null,
        metadata: { target: String(req.body?.target || 'system').slice(0, 40) },
      }),
      missions.record(req.user.id, 'share'),
    ]);
    res.json({ ok: true });
  }));

  router.post('/telemetry/crash', auth, writeLimiter, asyncHandler(async (req, res) => {
    const result = await analytics.reportCrash({
      userId: req.user.id,
      platform: req.body?.platform,
      source: req.body?.source,
      release: req.body?.release,
      message: req.body?.message,
      stack: req.body?.stack,
      context: req.body?.context,
    });
    res.status(202).json({ accepted: true, reportId: result.id });
  }));

  router.get('/admin/analytics', adminAuth, asyncHandler(async (req, res) => {
    res.json(await analytics.summary(req.query.days));
  }));
  // گروه باید قبل از :reportId ثبت شود، وگرنه «groups» به‌عنوان شناسه
  // عددی خوانده می‌شود و همیشه ۴۰۰ می‌دهد.
  router.patch('/admin/crashes/groups/:hash', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    res.json(await analytics.resolveCrashGroup(
      req.params.hash, req.body?.status || 'resolved', req.body?.platform));
  }));
  router.patch('/admin/crashes/:reportId', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.reportId)) return res.status(400).json({ message: 'شناسه نامعتبر است' });
    res.json(await analytics.resolveCrash(req.params.reportId, req.body?.status));
  }));

  return router;
};
