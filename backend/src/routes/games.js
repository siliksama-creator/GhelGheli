// ─────────────────────────────────────────────────────────────────────
// فهرستِ بازی‌ها، پیشرفت و صدرنشینانِ تپ، دوئلِ کارت و حالتِ انفرادی —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه، مهر ۱۴۰۵). بدنهٔ مسیرها مو به مو
// همان است؛ فقط وابستگی‌ها تزریق می‌شوند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, referrals,
  leagueCountdown, tapGame, addLeaguePoints, coinLedger,
  coins, leaderboardSignal, pass, points,
  tapBatchLimiter, cacheGet, cacheSet, cardDuel,
  cardDuelLimiter,
}) => {
  const router = express.Router();

// Catalogue of playable games, so the mobile/web clients can render the hub
// dynamically instead of shipping a hardcoded list that drifts out of sync.
router.get('/games', (req, res) => res.json(require('../games').CATALOG));

router.get('/games/tap/progress', auth, asyncHandler(async (req, res) => {
  const progress = await tapGame.getProgress(req.user.id);
  // صفحهٔ ضربه‌زن با همین یک درخواست هم پیشرفتش را می‌گیرد، هم می‌فهمد
  // قفل است یا نه — پس کارتِ شماره معکوس بدونِ رفت‌وبرگشتِ اضافه نشان داده
  // می‌شود (الگویِ `/api/bootstrap`).
  const gate = leagueCountdown.cached();
  res.json({ ...progress, leagueLocked: gate.blocks.tap, countdown: gate });
}));

router.post('/games/tap/progress', auth, tapBatchLimiter.mw, asyncHandler(async (req, res) => {
  const play = await require('../services/featureFlags').checkPlayable('tap', pool);
  if (!play.ok) return res.status(503).json({ message: play.message });
  // ── شماره معکوسِ لیگ ──────────────────────────────────────────────────
  // ضربه‌زن منبعِ سکه است و خواستهٔ مالک این بود که تا شروعِ لیگ بسته بماند.
  // ۴۲۳ (Locked) و نه ۴۰۳: کلاینت باید بفهمد «الان بسته است، خرابی نیست»
  // و کارتِ شماره معکوس را نشان بدهد، نه پیامِ خطای عمومی.
  const gate = leagueCountdown.cached();
  if (gate.blocks.tap) {
    return res.status(423).json({
      message: gate.message,
      code: 'league_countdown',
      countdown: gate,
    });
  }
  // The raw token doubles as the HMAC key material, so the signature can only
  // be produced by whoever holds a live session for this user.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  // لولِ قبل از ارسال، تا بعداً بفهمیم چند لول در همین بسته تمام شد.
  // payload فقط لولِ فعلی را می‌دهد نه اختلاف را.
  const lvlBefore = await tapGame.getProgress(req.user.id)
    .then(p => Number(p?.level || 0)).catch(() => 0);
  const { status, payload } = await tapGame.submitBatch(
    req.user.id, token, req.body || {},
    // ── امتیاز بازی ضربه‌زن ──────────────────────────────────────────────
    //
    // هر ضربه یک امتیاز. سرویس خودش حساب می‌کند چند ضربه واقعاً *شمرده*
    // شده (بعد از اعمال سقف روزانه) و همان عدد را اینجا می‌فرستد، نه
    // چیزی که کلاینت ادعا کرده.
    //
    // روی همان تراکنشِ ذخیرهٔ پیشرفت اجرا می‌شود: اگر یکی شکست بخورد هر
    // دو برمی‌گردند، وگرنه یک کرش وسط کار یا دوبار پول می‌دهد یا لول را
    // بالا می‌برد بدون پرداخت.
    async (client, userId, points) => {
      // نامِ پارامتر اینجا `points` است و ماژولِ دفتر را سایه می‌اندازد،
      // پس با مسیرِ کاملش صدا زده می‌شود. (تغییرِ نامِ پارامتر، امضای
      // callback را می‌شکست.)
      await require('../services/pointService').credit(client, {
        userId,
        points,
        source: 'game',
        referenceType: 'tap_game',
        description: 'بازی ضربه‌زن',
        // `league:false` چون `addLeaguePoints` پایین‌تر خودش این کار را
        // می‌کند؛ دوباره‌شمردن یعنی رتبهٔ لیگ دو برابر بالا می‌رود.
        league: false,
      });
      await addLeaguePoints(client, userId, points);
      // رتبه‌های لیگ عوض شد؛ جدولِ بیننده‌ها بی‌درنگ تازه شود (نه با poll).
      leaderboardSignal.leaderboardChanged();
      // کمیسیونِ امتیازیِ ۵٪ به معرف — «بازی ضربه‌زنِ دوستان».
      //
      // بدونِ شرط، برخلافِ مسیرِ کارت: بازیِ ضربه‌زن هیچ‌وقت پولِ نقد
      // نمی‌دهد، فقط امتیاز. پس استثنای «کارتِ نقدی» اینجا موضوعیت ندارد.
      //
      // روی همین تراکنش است تا اگر ثبتِ امتیازِ کاربر برگردد، کمیسیونِ
      // معرف هم برگردد و دو دفتر از هم جدا نیفتند.
      await referrals.payCommission(client, userId, points, 'tap');
    },
    // ── سکهٔ لول‌های تمام‌شده (دورِ ۲۶) ───────────────────────────────────
    //
    // روی همان تراکنشِ پیشرفت. `levels` فهرستِ لول‌هایی است که در همین
    // بسته تمام شده‌اند و سرویس آن را بعد از سقفِ روزانه حساب کرده.
    //
    // ⚠️ `awardCoins` بدونِ لیگِ فعال صفر برمی‌گرداند و خطا نمی‌دهد — یعنی
    //    بینِ دو فصل، ضربه‌زن امتیازش را می‌دهد ولی سکه‌ای نمی‌سازد. این
    //    درست است: سکه فقط داخلِ یک فصل معنا دارد.
    async (client, userId, levels) => {
      const amount = coins.tapCoinsFor(levels);
      if (amount <= 0) return 0;
      // ⚠️ باید همان عددی برگردد که واقعاً در دفتر نشسته. اگر لیگِ
      //    فعالی نباشد `awardCoins` صفر می‌دهد؛ برگرداندنِ `amount`
      //    یعنی کلاینت «+۵ سکه» نشان می‌دهد در حالی که موجودی‌اش
      //    تکان نخورده.
      const paid = await coins.awardCoins(client, userId, amount);
      // ── دفترِ سکه: ضربه‌زن ───────────────────────────────────────────
      // فقط عددی که **واقعاً** واریز شده ثبت می‌شود (`paid`)، نه `amount`:
      // اگر لیگِ فعالی نباشد یا سهمیه پر باشد، `awardCoins` صفر می‌دهد و
      // دفتر نباید سکهٔ واریزشدهٔ خیالی نشان بدهد.
      if (paid > 0) {
        await coinLedger.record(client, {
          userId,
          delta: paid,
          source: 'tap',
          referenceType: 'tap_levels',
          description: `سکهٔ لول‌های ضربه‌زن (${Array.isArray(levels) ? levels.length : 0} لول)`,
        });
      }
      return paid;
    },
  );
  // XP گذر نبرد به ازای هر لولی که در همین بستهٔ ارسالی تمام شده.
  // سقف روزانهٔ منبع (۶۰) خودش جلوی سوءاستفاده را می‌گیرد.
  const lvlUp = Math.max(0, Number(payload?.level || 0) - lvlBefore);
  if (lvlUp > 0) {
    pass.grantXp(req.user.id, 'tap_level', { multiplier: lvlUp }).catch(() => {});
    // ── ضربه‌زن و ماموریت‌هایScoped به ربات (خواستهٔ مالک) ──
    // یک لولِ تمام‌شدهٔ ضربه‌زن یک «بازیِ واقعیِ شمارشی» است. مالک: ماموریتی
    // که برای بازی با ربات ساخته شده اشکالی ندارد با ضربه‌زن هم پیشرفت
    // کند. ماموریت‌های مشخص‌نشده (match_completed) از ضربه‌زن چیزی نمی‌گیرند
    // — دقیقاً مثلِ قبل، چون رویدادشان اینجا منتشر نمی‌شود.
    require('../services/missionService')
      .record(req.user.id, 'bot_match').catch(() => {});
  }
  res.status(status).json(payload);
}));

router.get('/games/tap/leaderboard', auth, asyncHandler(async (req, res) => {
  // فهرستِ مشترک برای همهٔ بیننده‌ها یکسان است؛ ۸ ثانیه کش (هم‌مقدار بین
  // پروسه‌ها با Redis) تا این مسیر داغ هم در هر درخواست جدول را مرتب نکند.
  const lim = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const cacheKey = `lb:tap:${lim}`;
  const shared = await cacheGet(cacheKey) || await (async () => {
    const full = await tapGame.leaderboard(lim, null); // فقط فهرست، بدون me
    await cacheSet(cacheKey, full, 8000);
    return full;
  })();
  // رتبهٔ خودِ بیننده تازه (مثل مسیر لیگ)؛ اگر در فهرست کش‌شده نباشد،
  // تابع کامل فقط برای گرفتنِ me صدا زده می‌شود.
  const inTop = (shared.entries || []).find(e => e.userId === req.user.id);
  let me = inTop ? { ...inTop, inTop: true } : null;
  if (!me) {
    const fresh = await tapGame.leaderboard(lim, req.user.id);
    me = fresh.me || null;
  }
  res.json({ ...shared, me });
}));

router.get('/card-duel', auth, asyncHandler(async (req, res) => {
  res.json(await cardDuel.status(req.user.id));
}));

router.post('/card-duel/deck', auth, cardDuelLimiter.mw, asyncHandler(async (req, res) => {
  res.json(await cardDuel.saveDeck(
    req.user.id,
    req.body?.cardTypeIds || req.body?.cards || [],
  ));
}));

router.post('/card-duel/bot', auth, cardDuelLimiter.mw, asyncHandler(async (req, res) => {
  res.json(await cardDuel.botBattle(req.user.id,
    Array.isArray(req.body?.cardTypeIds) ? req.body.cardTypeIds : null));
}));

// Solo (time-attack) records: my personal best + the public leaderboard, in
// one round trip so the solo screen never has to fan out two requests.
// Solo awards NO points on purpose — the record IS the reward.
router.get('/games/:gameId/solo', auth, asyncHandler(async (req, res) => {
  const rules = require('../games').RULES[req.params.gameId];
  if (!rules || !rules.solo) return res.status(404).json({ message: 'این بازی حالت تک‌نفره ندارد' });
  res.json(await require('../services/soloRecordService').summary(req.user.id, req.params.gameId));
}));

  return router;
};
