const express = require('express');
const social = require('../services/socialService');
const missions = require('../services/missionService');
const analytics = require('../services/analyticsService');

module.exports = function growthRoutes({
  auth, authOptional, adminAuth, requireRole, asyncHandler, validateUuid, presence, rateLimit,
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

  // محدودیتِ مسیرِ گزارشِ کرش: کاربرِ واردشده بر پایهٔ شناسه، مهمان بر
  // پایهٔ IP. مهمان (قبل از ورود/ثبت‌نام) هم می‌تواند کرش بفرستد، وگرنه
  // خطاهای همان اولین تجربهٔ کاربر — که مهم‌ترین‌اند — کاملاً گم می‌شدند.
  const crashLimiter = rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => (req.user ? `crash:${req.user.id}` : `crash:${req.ip}`),
    message: { message: 'تعداد گزارش‌ها زیاد است؛ کمی بعد دوباره' },
  });

  // بدنهٔ مجازِ گزارشِ کرش — فیلدها را صریح و سقف‌دار می‌گیریم تا گزارشِ
  // مهمان نتواند هر JSON دلخواهی را داخل ستون‌ها بریزد.
  const readCrashBody = body => ({
    platform: body?.platform,
    source: typeof body?.source === 'string' ? body.source.slice(0, 80) : null,
    release: typeof body?.release === 'string' ? body.release.slice(0, 80) : null,
    message: body?.message,
    stack: body?.stack,
    context: (body?.context && typeof body.context === 'object') ? body.context : {},
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

  // مسیرِ گزارشِ کرش با احرازِ اختیاری: کاربرِ واردشده شناسه‌اش می‌نشیند،
  // مهمان هم با user_id=NULL پذیرفته می‌شود (reportCrash با userId=null
  // مشکلی ندارد). این تنها مسیر «مهمان‌پذیرِ» قیف خطا است؛ خودِ سرویس
  // ورودی‌ها را پاک‌سازی و سقف‌دار می‌کند.
  router.post('/telemetry/crash', authOptional, crashLimiter, asyncHandler(async (req, res) => {
    const b = readCrashBody(req.body);
    const result = await analytics.reportCrash({
      userId: req.user?.id || null,
      platform: b.platform,
      source: b.source,
      release: b.release,
      message: b.message,
      stack: b.stack,
      context: { ...b.context, guest: !req.user },
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
