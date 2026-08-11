/** League season, prize, and payout administration routes. */
const express = require('express');

module.exports = function createAdminLeagueRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    getLeaderboard, getLeagueWinnerCount, ensureActiveSeason,
    closeActiveSeason, leagueApprove, walletService, createNotification,
  } = deps;
  const router = express.Router();

router.get('/admin/league', adminAuth, asyncHandler(async (req, res) => { const data = await getLeaderboard(100); data.winnerCount = await getLeagueWinnerCount(); res.json(data); }));
router.patch('/admin/league/current/prizes', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const season = await ensureActiveSeason();

  // AUDIT FIX: prizeTable هرچه بود خام ذخیره می‌شد. یک مبلغ منفی (یا متنی
  // که به NaN تبدیل می‌شود) بعداً در closeActiveSeason به league_payouts
  // می‌رفت و قید CHECK (amount >= 0) را می‌شکست.
  //
  // بازتولید شد: با رتبهٔ ۱ = منفی ۵۰۰٬۰۰۰ و دو کاربر واجد شرایط،
  //   [league] close failed: violates check constraint league_payouts_amount_check
  // فصل «active» می‌ماند، هیچ‌کس پول نمی‌گیرد، و cron شبانه **هر شب**
  // بی‌صدا شکست می‌خورد. یعنی یک تایپو در پنل، پرداخت کل لیگ را می‌خواباند.
  //
  // حالا همین‌جا اعتبارسنجی می‌شود، جایی که مدیر بازخورد می‌گیرد.
  const rawTable = Array.isArray(req.body.prizeTable) ? req.body.prizeTable : [];
  if (rawTable.length > 100) {
    return res.status(400).json({ message: 'جدول جوایز حداکثر ۱۰۰ رتبه می‌تواند داشته باشد' });
  }
  const prizeTable = [];
  const seenRanks = new Set();
  for (const row of rawTable) {
    const rank = Number(row?.rank);
    const amount = Number(row?.amount ?? 0);
    if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
      return res.status(400).json({ message: `رتبه باید عددی صحیح بین ۱ تا ۱۰۰ باشد (دریافت شد: ${row?.rank})` });
    }
    if (seenRanks.has(rank)) {
      return res.status(400).json({ message: `رتبهٔ ${rank} تکراری است` });
    }
    seenRanks.add(rank);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ message: `مبلغ جایزهٔ رتبهٔ ${rank} باید عددی صحیح و صفر یا بیشتر باشد` });
    }
    if (amount > 100000000000) {
      return res.status(400).json({ message: `مبلغ جایزهٔ رتبهٔ ${rank} خارج از محدودهٔ مجاز است` });
    }
    prizeTable.push({ rank, amount });
  }
  const winnerCount = Math.max(1, Math.min(100, Number(req.body.winnerCount || prizeTable.length || 10)));
  await pool.query('UPDATE league_seasons SET prize_table=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(prizeTable), season.id]);
  await pool.query(`INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at) VALUES('league_winner_count',$1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`, [JSON.stringify(winnerCount), req.admin.id]);
  await audit(req.admin.id,'update_league_prizes','league_seasons',season.id,null,{...req.body,winnerCount}); res.json({ message: 'جدول جوایز لیگ ذخیره شد', winnerCount });
}));
router.post('/admin/league/close', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json(await closeActiveSeason({ force: req.body?.force === true }))));

// ═══════════════════════════════════════════════════════════════════════════
// تاریخِ شروع و پایانِ لیگ — به‌دستِ مدیر
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «تاریخ و پایان لیگ توسط مدیر مشخص میشه در پنل های
// مدیریت کل پلتفرم».
//
// ⚠️ `manual_dates=true` حیاتی است: بدونِ آن `repairSeasonBounds` در
//    اولین درخواستِ بعدی تاریخ‌ها را از تقویمِ شمسی بازمی‌سازد و کارِ
//    مدیر بی‌صدا برمی‌گردد.
router.patch('/admin/league/current/dates', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const season = await ensureActiveSeason();
  const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null;
  const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;

  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return res.status(400).json({ message: 'تاریخ شروع معتبر نیست' });
  }
  if (!endsAt || Number.isNaN(endsAt.getTime())) {
    return res.status(400).json({ message: 'تاریخ پایان معتبر نیست' });
  }
  if (endsAt <= startsAt) {
    return res.status(400).json({ message: 'تاریخ پایان باید بعد از تاریخ شروع باشد' });
  }
  // ── چرا سقفِ دو سال ──
  //
  // یک اشتباهِ تایپی در سال (۲۰۲۶ → ۲۲۰۲۶) فصلی می‌سازد که هرگز تمام
  // نمی‌شود و هیچ‌کس جایزه نمی‌گیرد — بدونِ هیچ خطایی.
  const maxSpan = 2 * 365 * 24 * 3600 * 1000;
  if (endsAt - startsAt > maxSpan) {
    return res.status(400).json({ message: 'طول فصل نمی‌تواند بیش از دو سال باشد' });
  }
  if (season.status === 'closed') {
    return res.status(409).json({ message: 'این فصل بسته شده و تاریخش قابل تغییر نیست' });
  }

  const { rows } = await pool.query(
    `UPDATE league_seasons
        SET starts_at=$2, ends_at=$3, manual_dates=TRUE, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [season.id, startsAt, endsAt]);
  await audit(req.admin.id, 'league_dates', 'league_seasons', season.id,
    req.body.reason || null,
    { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  res.json({ message: 'تاریخ لیگ به‌روز شد', season: rows[0] });
}));

// ═══════════════════════════════════════════════════════════════════════════
// تأییدِ واریزِ جوایزِ لیگ
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «جوایز لیگ بعد از تایید مدیریت به کیف پول ها داده میشه».
//
// `requireRole()` بدونِ آرگومان یعنی فقط super_admin — پشتیبانی نباید
// بتواند پول آزاد کند.
router.post('/admin/league/payouts/:id/approve', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  const r = await leagueApprove(req.params.id, req.admin.id);
  await audit(req.admin.id, 'league_payout_approve', 'league_payouts',
    req.params.id, req.body.reason || null, r);
  res.json({
    message: r.paid ? `${r.amount.toLocaleString('fa-IR')} تومان واریز شد`
      : 'این جایزه قبلاً واریز شده بود',
    ...r,
  });
}));

router.post('/admin/league/payouts/approve-all', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const r = await leagueApprove(null, req.admin.id);
  await audit(req.admin.id, 'league_payout_approve_all', 'league_payouts',
    null, req.body.reason || null, r);
  res.json({
    message: r.paid
      ? `${r.paid} جایزه به مجموع ${r.amount.toLocaleString('fa-IR')} تومان واریز شد`
      : 'جایزهٔ تأییدنشده‌ای وجود نداشت',
    ...r,
  });
}));
router.get('/admin/league/payouts', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT p.*, u.mobile,u.first_name,u.last_name,u.nickname,u.bank_account FROM league_payouts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC')).rows)));
router.patch('/admin/league/payouts/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['pending', 'approved', 'paid'].includes(status)) {
    return res.status(400).json({ message: 'وضعیت نامعتبر است' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query('SELECT * FROM league_payouts WHERE id=$1 FOR UPDATE', [req.params.id]);
    const payout = q.rows[0];
    if (!payout) throw Object.assign(new Error('پرداخت پیدا نشد'), { status: 404 });

    await client.query(
      // همان باگ 42P08: $1 هم varchar و هم text استنتاج می‌شد و کوئری با
      // ۵۰۰ می‌افتاد، یعنی جایزهٔ لیگ هرگز «پرداخت‌شده» نمی‌شد. cast صریح.
      "UPDATE league_payouts SET payment_status=$1::text, paid_at=CASE WHEN $1::text='paid' THEN NOW() ELSE paid_at END WHERE id=$2",
      [status, req.params.id],
    );

    // جایزهٔ لیگ هنگام «پرداخت شده» به کیف پول واریز می‌شود. مرجع =
    // شناسهٔ payout، پس تکرار عملیات پول اضافه تولید نمی‌کند.
    const amount = Number(payout.amount || 0);
    let credited = 0;
    if (status === 'paid' && amount > 0) {
      const r = await walletService.credit(client, {
        userId: payout.user_id,
        amount,
        source: 'league',
        referenceType: 'league_payouts',
        referenceId: payout.id,
        description: `جایزهٔ لیگ — رتبهٔ ${payout.rank}`,
        adminId: req.admin.id,
      });
      if (!r.duplicate) credited = amount;
    }
    await client.query('COMMIT');

    if (credited > 0) {
      createNotification(
        payout.user_id,
        'wallet',
        'جایزهٔ لیگ به کیف پول اضافه شد 🏆',
        `${credited.toLocaleString('en-US')} تومان بابت رتبهٔ ${payout.rank} لیگ به کیف پول شما واریز شد.`,
      ).catch(() => {});
    }
    await audit(req.admin.id, 'update_league_payout', 'league_payouts', req.params.id, null, { status, credited });
    res.json({ message: credited > 0 ? `ثبت شد و ${credited.toLocaleString('en-US')} تومان به کیف پول واریز شد` : 'ثبت شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطا در ثبت' });
  } finally { client.release(); }
}));

  return router;
};
