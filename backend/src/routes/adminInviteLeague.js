/**
 * مسیرهای ادمینِ «لیگ معرف‌ها» — ساختِ آفر، بستنِ دوره و تأییدِ پرداخت.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل جدا از adminLeague است
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `adminLeague` لیگِ سکه‌محورِ ماهانه است: ورودی‌اش سکه، معیارش جدولِ
 * رتبه‌بندیِ لیگ و پایانش اسکارِ فصل. این‌جا معیار «تعدادِ دعوتِ معتبر در
 * یک بازهٔ زمانی» است؛ نه سکه‌ای در کار است نه لیگِ ماهانه. جدا نگه‌داشتن
 * یعنی تغییرِ یکی، ریسکِ شکستنِ دیگری را ندارد — و پنل هم صفحهٔ خودش را
 * دارد تا مدیر دنبالش نگردد.
 *
 * ── قواعدی که همهٔ مسیرها رعایت می‌کنند ──────────────────────────────────
 *
 *   • `adminAuth` روی همه، `requireRole()` روی هرچه **تغییر** می‌دهد
 *     (ساخت/ویرایش/بستن/پرداخت). خواندنِ فهرست مثلِ بقیهٔ صفحه‌های پنل برای
 *     هر مدیرِ واردشده مجاز است.
 *   • هر تغییرِ وضعیت `audit` می‌شود. پولِ واقعی جابه‌جا می‌شود؛ «کی این
 *     جایزه را داد؟» باید بعداً جواب داشته باشد.
 *   • «فقط یک آفرِ فعال» در دیتابیس قید شده (ایندکسِ پارسیالِ ۱۰۱). این‌جا
 *     خطای یکتایی به پیامِ فارسیِ روشن ترجمه می‌شود، نه ۵۰۰.
 */
const express = require('express');

module.exports = function createAdminInviteLeagueRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    inviteLeague,
  } = deps;
  const router = express.Router();

  const bad = (message) => Object.assign(new Error(message), { status: 400 });

  /** تاریخِ ورودی — ISO یا هر چیزی که Date بفهمد. null = نامعتبر. */
  function parseDate(value, label) {
    const d = new Date(value);
    if (!value || Number.isNaN(d.getTime())) throw bad(`${label} نامعتبر است`);
    return d;
  }

  function sanitizeWindow(body) {
    const startsAt = parseDate(body?.startsAt, 'تاریخِ شروع');
    const endsAt = parseDate(body?.endsAt, 'تاریخِ پایان');
    if (endsAt <= startsAt) throw bad('تاریخِ پایان باید بعد از شروع باشد');
    return { startsAt, endsAt };
  }

  function sanitizeTitle(value) {
    const title = String(value ?? '').trim().slice(0, 120);
    if (!title) throw bad('عنوانِ آفر لازم است');
    return title;
  }

  const minInvitesOf = (value) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(100000, n) : 1;
  };

  /** خطای ایندکسِ یکتا (آفرِ فعالِ دوم) → پیامِ روشن، نه ۵۰۰. */
  function rethrowUnique(e) {
    if (e && e.code === '23505') {
      throw Object.assign(
        new Error('یک لیگِ معرف‌ها همین حالا فعال است. اول همان را ببندید یا ویرایشش کنید.'),
        { status: 409 });
    }
    throw e;
  }

  // ── نمای کلیِ صفحه: آفرِ فعال + جدولِ زنده + برندگانِ پیش‌بینی‌شده + صفِ پرداخت ──
  router.get('/admin/invite-league', adminAuth, asyncHandler(async (req, res) => {
    res.json(await inviteLeague.adminOverview());
  }));

  // ── ساختِ آفر ────────────────────────────────────────────────────────────
  router.post('/admin/invite-league', adminAuth, requireRole(), asyncHandler(async (req, res) => {
    const { startsAt, endsAt } = sanitizeWindow(req.body);
    const title = sanitizeTitle(req.body?.title);
    const prizes = inviteLeague.sanitizePrizeTable(req.body?.prizes);
    if (!prizes.length) throw bad('حداقل یک ردیفِ جایزه لازم است (رتبه + مقدار)');
    const minInvites = minInvitesOf(req.body?.minInvites);

    try {
      const { rows } = await pool.query(
        `INSERT INTO invite_league_seasons
           (title, starts_at, ends_at, prize_table, min_invites, created_by)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
        [title, startsAt, endsAt, JSON.stringify(prizes), minInvites, req.admin?.id || null]);
      await audit(req.admin.id, 'create_invite_league', 'invite_league_season', rows[0].id,
        `ساختِ آفرِ «${title}» با ${prizes.length} ردیفِ جایزه`);
      res.json({ season: rows[0], preview: await inviteLeague.previewWinners(rows[0]) });
    } catch (e) {
      rethrowUnique(e);
    }
  }));

  // ── ویرایشِ آفرِ فعال (عنوان/بازه/حداقلِ دعوت/جوایز) ─────────────────────
  router.patch('/admin/invite-league/:id', adminAuth, validateUuid('id'),
    requireRole(), asyncHandler(async (req, res) => {
      const current = (await pool.query(
        'SELECT * FROM invite_league_seasons WHERE id=$1', [req.params.id])).rows[0];
      if (!current) return res.status(404).json({ message: 'آفر پیدا نشد' });
      if (current.status !== 'active') {
        return res.status(409).json({ message: 'آفرِ تمام‌شده قابلِ ویرایش نیست (سندِ پرداخت است)' });
      }

      const title = req.body?.title === undefined ? current.title : sanitizeTitle(req.body.title);
      const window = req.body?.startsAt || req.body?.endsAt
        ? sanitizeWindow({
          startsAt: req.body?.startsAt || current.starts_at,
          endsAt: req.body?.endsAt || current.ends_at,
        })
        : { startsAt: current.starts_at, endsAt: current.ends_at };
      const minInvites = req.body?.minInvites === undefined
        ? current.min_invites : minInvitesOf(req.body.minInvites);
      const prizes = req.body?.prizes === undefined
        ? current.prize_table : inviteLeague.sanitizePrizeTable(req.body.prizes);
      if (!Array.isArray(prizes) || !prizes.length) throw bad('حداقل یک ردیفِ جایزه لازم است');

      try {
        const { rows } = await pool.query(
          `UPDATE invite_league_seasons
              SET title=$2, starts_at=$3, ends_at=$4, prize_table=$5::jsonb,
                  min_invites=$6, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [req.params.id, title, window.startsAt, window.endsAt,
            JSON.stringify(prizes), minInvites]);
        await audit(req.admin.id, 'update_invite_league', 'invite_league_season', req.params.id,
          `ویرایشِ آفرِ «${title}»`);
        res.json({ season: rows[0], preview: await inviteLeague.previewWinners(rows[0]) });
      } catch (e) {
        rethrowUnique(e);
      }
    }));

  // ── بستنِ دوره: برندگان قفل و ردیف‌های پرداخت ساخته می‌شوند ───────────────
  router.post('/admin/invite-league/:id/close', adminAuth, validateUuid('id'),
    requireRole(), asyncHandler(async (req, res) => {
      const result = await inviteLeague.closeSeason({
        seasonId: req.params.id, adminId: req.admin.id,
      });
      await audit(req.admin.id, 'close_invite_league', 'invite_league_season', req.params.id,
        `بستنِ آفرِ «${result.season.title}» — ${result.created.length} برنده`);
      res.json({
        message: result.created.length
          ? `آفر بسته شد و ${result.created.length} برنده ثبت شد؛ پرداخت‌ها منتظرِ تأیید شماست.`
          : 'آفر بسته شد، ولی کسی به رتبه‌های جایزه نرسید.',
        winners: result.created.map((w) => ({
          rank: w.rank, userId: w.userId, invites: w.invites, label: w.label,
          points: w.points, coins: w.coins, spins: w.spins, cash: w.cash,
        })),
        skipped: result.skipped,
      });
    }));

  // ── تأییدِ پرداخت (همه یا یکی) ───────────────────────────────────────────
  router.post('/admin/invite-league/payouts/approve', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const payoutId = req.body?.payoutId ? String(req.body.payoutId) : null;
      const seasonId = req.body?.seasonId ? String(req.body.seasonId) : null;
      const result = await inviteLeague.approvePayouts({
        payoutId, seasonId, adminId: req.admin.id,
      });
      await audit(req.admin.id, 'approve_invite_league_payouts', 'invite_league_payout',
        payoutId || seasonId || 'all', `پرداختِ ${result.paid} جایزه`);
      res.json({
        message: result.paid
          ? `${result.paid} جایزه پرداخت شد.`
          : 'جایزهٔ در انتظاری برای پرداخت نبود.',
        ...result,
      });
    }));

  // ── لغوِ یک ردیفِ جایزه (مثلاً برندهٔ متخلف) ──────────────────────────────
  router.post('/admin/invite-league/payouts/:id/cancel', adminAuth, validateUuid('id'),
    requireRole(), asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `UPDATE invite_league_payouts
            SET status='cancelled'
          WHERE id=$1 AND status='pending' RETURNING id`, [req.params.id]);
      if (!rows[0]) {
        return res.status(409).json({ message: 'این جایزه یا پرداخت شده یا در انتظار نیست' });
      }
      await audit(req.admin.id, 'cancel_invite_league_payout', 'invite_league_payout',
        req.params.id, 'لغوِ جایزهٔ لیگ معرف‌ها');
      res.json({ message: 'این جایزه لغو شد.' });
    }));

  return router;
};
