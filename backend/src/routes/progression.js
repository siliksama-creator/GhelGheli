// ─────────────────────────────────────────────────────────────────────
// پسِ بازی، زنجیرهٔ ورود، معرفی‌ها و لیگِ جاری —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, referrals,
  pass, loginStreak, loginStreakLimiter, UUID_RE,
  cacheGet, cacheSet, getLeaderboard, level,
  points, shop, coinVault,
}) => {
  const router = express.Router();

// ── گذر نبرد ─────────────────────────────────────────────────────────────
router.get('/pass', auth, asyncHandler(async (req, res) => {
  res.json(await pass.status(req.user.id));
}));

// Login streak is a separate, explicit claim from Battle Pass XP. Opening
// the app only reads the status; points are awarded exactly once after the
// user taps the button, inside a row-locked transaction.
router.get('/login-streak', auth, asyncHandler(async (req, res) => {
  res.json(await loginStreak.status(req.user.id));
}));

router.post('/login-streak/claim', auth, loginStreakLimiter,
  asyncHandler(async (req, res) => {
    res.json(await loginStreak.claim(req.user.id));
  }));

router.post('/pass/claim/:tierId?', auth,
  asyncHandler(async (req, res) => {
    const tierId = req.params.tierId || req.body.tierId;
    if (!tierId || !UUID_RE.test(String(tierId))) {
      return res.status(400).json({ message: 'شناسه پله نامعتبر است' });
    }
    const granted = await pass.claim(req.user.id, tierId);
    res.json({ message: 'جایزه دریافت شد', granted });
  }));

router.post('/pass/claim-all', auth, asyncHandler(async (req, res) => {
  const r = await pass.claimAll(req.user.id);
  res.json({ message: `${r.claimed} جایزه دریافت شد`, ...r });
}));

// ── معرفی دوستان ─────────────────────────────────────────────────────────
router.get('/referrals', auth, asyncHandler(async (req, res) => {
  res.json(await referrals.summary(req.user.id));
}));

// ── صندوق سکه ────────────────────────────────────────────────────────────
//
// خواستهٔ مالک (۱۴۰۵/۰۷/۰۲): تبِ تازه‌ای که «سکهٔ موقتِ لیگِ جاری» و
// «سکهٔ بدست‌آمده» را جدا نشان می‌دهد و اجازه می‌دهد کاربر خودش سکهٔ
// بدست‌آمده را به هر لیگِ در جریانی که خواست واریز کند.
router.get('/coin-vault', auth, asyncHandler(async (req, res) => {
  res.json(await coinVault.overview(req.user.id));
}));

router.get('/coin-vault/history', auth, asyncHandler(async (req, res) => {
  res.json(await coinVault.history(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  }));
}));

router.post('/coin-vault/deposit', auth, asyncHandler(async (req, res) => {
  try {
    res.json(await coinVault.deposit(
      req.user.id, req.body?.seasonId, req.body?.amount));
  } catch (e) {
    res.status(e.status || 500)
      .json({ message: e.message || 'خطا در واریز سکه', code: e.code });
  }
}));

router.get('/league/current', auth, asyncHandler(async (req, res) => {
  // ── کشِ فهرستِ مشترکِ لیدربورد ──────────────────────────────────
  // وب این مسیر را هر ۱۲ ثانیه برای هر کاربرِ بازِ صفحه می‌کوبد، و هر
  // بار یک DENSE_RANK + کوئری برندگانِ دوره قبل اجرا می‌شد. فهرست برای
  // همهٔ بیننده‌ها یکسان است (رتبهٔ خودِ کاربر تازه می‌ماند)، پس بخشِ
  // مشترک را ۸ ثانیه کش می‌کنیم؛ با Redis بین همهٔ پروسه‌ها هم‌مقدار
  // است و بدونش هم در حافظهٔ پروسه. کهنگیِ ۸ ثانیه برای جدولِ زنده
  // کاملاً نامحسوس است و بارِ این مسیر را >۹۵٪ کم می‌کند.
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
  const seasonKey = String(req.query.seasonId || 'current');
  const cacheKey = `lb:league:${seasonKey}:${limit}`;
  const data = await cacheGet(cacheKey)
    || await (async () => {
      const fresh = await getLeaderboard(limit, req.query.seasonId || null, null);
      // قطعاتِ مشترکی که برای همه یکسان‌اند را پیش‌محاسبه و کش می‌کنیم.
      const cos = await shop.cosmeticsFor(fresh.entries.map(e => e.user_id));
      const lvl = await level.levelsFor(fresh.entries.map(e => e.user_id));
      const { rows: prev } = await pool.query(
        `SELECT h.user_id, h.month_year, h.rank, h.points, h.prize_amount,
                u.nickname, u.first_name, u.profile_image_url, u.profile_avatar_key
           FROM user_league_history h
           JOIN users u ON u.id = h.user_id
          WHERE h.season_id = (
                  SELECT id FROM league_seasons
                   WHERE status='closed' ORDER BY ends_at DESC LIMIT 1)
            AND h.rank <= 3
          ORDER BY h.rank`);
      const payload = {
        season: fresh.season,
        activeLeagues: fresh.activeLeagues,
        previousWinners: fresh.previousWinners,
        entries: fresh.entries.map(e => ({
          ...e,
          cosmetics: cos.get(e.user_id) || null,
          level: lvl[e.user_id]?.level ?? 0,
        })),
        previousSeason: prev.length ? {
          monthYear: prev[0].month_year,
          winners: prev.map(p => ({
            userId: p.user_id, rank: p.rank, points: p.points,
            prizeAmount: Number(p.prize_amount),
            nickname: p.nickname || p.first_name || 'کاربر',
            profileImageUrl: p.profile_image_url,
            profileAvatarKey: p.profile_avatar_key,
          })),
        } : null,
      };
      await cacheSet(cacheKey, payload, 60000);
      return payload;
    })();

  // رتبهٔ خودِ بیننده همیشه تازه (کوئریِ سبکِ ایندکس‌دار، کش نمی‌شود).
  const myEntry = req.user?.id
    ? (await getLeaderboard(limit, req.query.seasonId || null, req.user.id)).myEntry
    : null;

  res.json({
    ...data,
    myEntry,
    // ── «هنوز لیگی ساخته نشده» ──
    //
    // خواستهٔ مالک: «اگه لیگی قرار نگرفته، باید به کاربر وب و اندروید
    // نشون داده بشه که هنوز لیگی ساخته نشده.» تا پیش از این `season` فقط
    // `null` بود و هر کلاینت خودش باید حدس می‌زد — وب یک جدولِ خالی
    // می‌کشید و اندروید گاهی چیزی نشان نمی‌داد.
    //
    // ⚠️ عمداً **بیرون** از کش محاسبه می‌شود: اگر ادمین همین لحظه لیگی
    //    بسازد، کاربر در همان درخواستِ بعدی باید ببیندش، نه ۶۰ ثانیه بعد.
    noLeague: !data.season,
  });
}));

  return router;
};
