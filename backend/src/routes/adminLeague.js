/** League season, prize, and payout administration routes. */
const fieldCrypto = require('../lib/fieldCrypto');
const express = require('express');
const { parseFaNumber } = require('../lib/faNum');

module.exports = function createAdminLeagueRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
    getLeaderboard, getLeagueWinnerCount, ensureActiveSeason,
    closeActiveSeason, leagueApprove, walletService, createNotification,
    defaultPrizeTable, seedCarryoverFromLatestClosed,
    leagueCountdown,
  } = deps;
  const router = express.Router();

  // ═══════════════════════════════════════════════════════════════════════════
  // «هیچ لیگی بدونِ ساختِ ادمین در جریان نباشد» — و دیگر ۵۰۰ ندهیم
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // خواستهٔ مالک (۲۷ شهریور): «از این به بعد بدونِ ساختِ تنظیماتِ لیگ توسطِ
  // ادمین هیچ لیگی نباید در جریان باشه.» تا آن روز `ensureActiveSeason()`
  // بی‌قید یک فصلِ تازه می‌ساخت، پس این مسیرها هیچ‌وقت به حالتِ «لیگی در
  // جریان نیست» نمی‌رسیدند و کسی متوجه نشده بود که هر خطی که `season.id`
  // می‌خواند با `null` به `TypeError` و بعد ۵۰۰ تبدیل می‌شود.
  //
  // در CI روی همین کد گرفته شد: `PATCH /admin/league/current/prizes` با یک
  // جدولِ جایزهٔ **سالم** هم کدِ ۵۰۰ برمی‌گرداند (job `backend-e2e`).
  const NO_ACTIVE_LEAGUE_CODE = 'no_active_league';
  const NO_ACTIVE_LEAGUE_MESSAGE =
    'در حال حاضر هیچ لیگِ فعالی در جریان نیست. از همین صفحه یک لیگِ تازه بسازید، یا در «شماره معکوسِ لیگ» گزینهٔ «شروعِ خودکارِ لیگ» را روشن کنید.';
  /** فصلِ فعال لازم است؛ اگر نبود پیامِ روشن می‌دهد و `null` برمی‌گرداند. */
  function noActiveLeague(res) {
    res.status(409).json({ code: NO_ACTIVE_LEAGUE_CODE, message: NO_ACTIVE_LEAGUE_MESSAGE });
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // جدولِ یکپارچهٔ جوایز — «هر رتبه، یک نوع جایزه»
  // ═══════════════════════════════════════════════════════════════════════
  //
  // خواستهٔ مالک: «مشخص کردن جوایز نقدی و امتیازی دونه‌دونه رتبه‌ها تا نفر
  // ۵۰ — ممکنه جایزه چند روز قلقلی پلاس یا نقدی یا امتیازی باشه.»
  //
  // ── چرا ذخیره‌سازی همان دو ستونِ قدیمی ماند ──
  //
  // `prize_table` (نقدی) و `perk_table` (غیرنقدی) در سراسرِ مسیرِ بستنِ
  // فصل، صفِ تأییدِ واریز و گزارش‌ها مصرف می‌شوند. عوض‌کردنِ قالبِ ذخیره
  // یعنی بازنویسیِ همهٔ آن‌ها — و هر باگِ بی‌صدایش مستقیماً روی پولِ مردم.
  // پس پنل یک جدولِ واحد نشان می‌دهد و اینجا به همان دو ستون ترجمه
  // می‌شود: تغییرِ بزرگ در تجربهٔ مدیر، بدونِ کوچک‌ترین تغییری در ریسک.
  const PRIZE_ROW_KINDS = ['cash', 'points', 'plus_days', 'shop_item', 'card_box'];

  const badInput = (message) => Object.assign(new Error(message), { status: 400 });

  /** ردیف‌های یکپارچهٔ پنل → دو جدولِ ذخیره‌سازی. هر نقص، پیامِ فارسیِ خودش را دارد. */
  function splitPrizeRows(rows) {
    const prizeTable = [];
    const perkTable = [];
    const seen = new Set();
    for (const row of rows || []) {
      const rank = Number(row?.rank);
      if (!Number.isInteger(rank) || rank < 1 || rank > 300) {
        throw badInput(`رتبه باید عددی صحیح بین ۱ تا ۳۰۰ باشد (دریافت شد: ${row?.rank})`);
      }
      if (seen.has(rank)) throw badInput(`رتبهٔ ${rank} تکراری است`);
      seen.add(rank);

      const kind = String(row?.kind || 'cash');
      if (!PRIZE_ROW_KINDS.includes(kind)) {
        throw badInput(`نوع جایزهٔ رتبهٔ ${rank} معتبر نیست`);
      }
      const value = Number(row?.value ?? 0);
      if (!Number.isInteger(value) || value < 0 || value > 100000000000) {
        throw badInput(`مقدار جایزهٔ رتبهٔ ${rank} معتبر نیست`);
      }

      if (kind === 'cash') {
        prizeTable.push({ rank, amount: value });
        continue;
      }
      // جایزهٔ غیرنقدیِ صفر چیزی تحویل نمی‌دهد ولی پیامِ «برنده شدی»
      // می‌فرستد — همان صفرِ توخالی که در بستنِ فصل هم رد می‌شود.
      if (value <= 0) {
        throw badInput(`مقدار جایزهٔ رتبهٔ ${rank} باید بزرگ‌تر از صفر باشد`);
      }
      if (kind === 'card_box' && value > 5) {
        throw badInput(`تعداد صندوقِ رتبهٔ ${rank} حداکثر ۵ است`);
      }
      const itemSlug = row?.itemSlug ? String(row.itemSlug).slice(0, 64) : null;
      if (kind === 'shop_item' && !itemSlug) {
        throw badInput(`برای جایزهٔ آیتمِ رتبهٔ ${rank} باید آیتم فروشگاه انتخاب شود`);
      }
      perkTable.push({
        rank,
        kind,
        value: kind === 'shop_item' ? 1 : (kind === 'card_box' ? Math.max(1, value) : value),
        itemSlug,
        label: row?.label ? String(row.label).slice(0, 160) : null,
      });
    }
    return { prizeTable, perkTable };
  }

  /** دو جدولِ ذخیره‌شده → ردیف‌های یکپارچه برای پنل. */
  function toPrizeRows(prizeTable, perkTable) {
    const rows = [];
    for (const p of prizeTable || []) {
      rows.push({ rank: Number(p.rank), kind: 'cash',
        value: Number(p.amount || 0), label: p.label || null });
    }
    for (const p of perkTable || []) {
      rows.push({ rank: Number(p.rank), kind: p.kind,
        value: Number(p.value || 0),
        itemSlug: p.itemSlug || p.item_slug || null, label: p.label || null });
    }
    return rows.sort((a, b) => a.rank - b.rank);
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/admin/league', adminAuth, asyncHandler(async (req, res) => {
  const data = await getLeaderboard(100);
  data.winnerCount = await getLeagueWinnerCount();

  // ── جدولِ جوایز برای پنل (دورِ ۲۶) ────────────────────────────────────
  //
  // تا امروز پنل فقط جدولِ رتبه‌بندی را می‌گرفت و فرمِ جوایز را از صفر
  // نشان می‌داد؛ مدیر نمی‌دید چه چیزی از قبل ذخیره شده و هر بار کل جدول
  // را دوباره می‌ساخت. حالا هر دو جدولِ ذخیره‌شده برمی‌گردند تا فرم
  // بتواند مقدارِ فعلی را نشان بدهد.
  //
  // ⚠️ این حتماً باید همان فصلی باشد که PATCH ویرایش می‌کند، نه فصلی که
  //    لیدربرد نشان می‌دهد. این دو **یکی نیستند**:
  //
  //      getLeaderboard   → ORDER BY starts_at ASC   (قدیمی‌ترینِ فعال)
  //      ensureActiveSeason → ORDER BY starts_at DESC (تازه‌ترینِ فعال)
  //
  //    با دو لیگِ هم‌زمان — که خودِ مالک خواسته — پنل جدولِ لیگ A را نشان
  //    می‌داد ولی ذخیره روی لیگ B می‌نشست. مدیر عدد را عوض می‌کرد، پیامِ
  //    موفقیت می‌گرفت، و بعدِ رفرش عددِ قبلی برمی‌گشت.
  //
  //    عنوانِ فصلِ ویرایش‌شونده هم برمی‌گردد تا پنل بتواند صریح بگوید
  //    «داری جوایزِ کدام لیگ را می‌چینی».
  const season = await ensureActiveSeason();
  // ── لیگی در جریان نیست — و این حالا واقعاً پیش می‌آید ──
  //
  // پنل باید باز شود تا مدیر بتواند لیگ بسازد؛ پس اینجا ۲۰۰ با پرچمِ
  // `noActiveLeague` می‌دهیم (نه ۵۰۰ و نه ۴۰۹): فرمِ جوایز خالی می‌ماند و
  // صفحه پیامِ راهنما نشان می‌دهد.
  if (!season) {
    data.noActiveLeague = true;
    data.prizeTable = [];
    data.perkTable = [];
    data.prizeRows = [];
    data.seasonId = null;
    data.editingSeasonTitle = '';
  } else {
    const { rows } = await pool.query(
      'SELECT prize_table, perk_table, title, month_year FROM league_seasons WHERE id=$1',
      [season.id]);
    data.prizeTable = rows[0]?.prize_table || [];
    data.perkTable = rows[0]?.perk_table || [];
    data.prizeRows = toPrizeRows(rows[0]?.prize_table, rows[0]?.perk_table);
    data.seasonId = season.id;
    data.editingSeasonTitle = rows[0]?.title || rows[0]?.month_year || '';
  }

  // فهرستِ آیتم‌های فروشگاه برای منویِ کشوییِ جایزهٔ غیرنقدی.
  // بدونِ این، مدیر باید slug را از حفظ تایپ کند — و یک تایپو تا لحظهٔ
  // بستنِ فصل پنهان می‌ماند.
  const { rows: items } = await pool.query(
    `SELECT slug, name FROM shop_items
      WHERE is_active = true ORDER BY display_order ASC, name ASC`);
  data.shopItems = items;
  res.json(data);
}));
router.patch('/admin/league/current/prizes', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  // جدولِ یکپارچهٔ پنل اگر رسیده باشد، پیش از اعتبارسنجی به دو جدولِ
  // ذخیره‌سازی ترجمه می‌شود. پنلِ قدیمی که هنوز `prizeTable` می‌فرستد هم
  // درست کار می‌کند — مسیر مهاجرت‌ناپذیر نیست.
  if (Array.isArray(req.body.prizeRows)) {
    const split = splitPrizeRows(req.body.prizeRows);
    req.body.prizeTable = split.prizeTable;
    req.body.perkTable = split.perkTable;
  }

  // ── ویرایشِ لیگِ انتخابی، نه فقط «لیگِ جاری» ──
  //
  // پنل حالا فهرستِ لیگ‌ها را نشان می‌دهد و مدیر یکی را انتخاب می‌کند.
  // اگر `seasonId` نیامد، همان رفتارِ قبلی (لیگِ جاری) حفظ می‌شود.
  const requestedId = req.body.seasonId && UUID_RE.test(String(req.body.seasonId))
    ? String(req.body.seasonId) : null;
  let season = null;
  if (requestedId) {
    const { rows: found } = await pool.query(
      'SELECT * FROM league_seasons WHERE id=$1', [requestedId]);
    season = found[0] || null;
    if (season && season.status === 'closed') {
      return res.status(409).json({ message: 'فصلِ بسته‌شده قابل ویرایش نیست' });
    }
  } else {
    season = await ensureActiveSeason();
  }
  if (!season) return noActiveLeague(res);

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
  if (rawTable.length > 300) {
    return res.status(400).json({ message: 'جدول جوایز حداکثر ۳۰۰ رتبه می‌تواند داشته باشد' });
  }
  const prizeTable = [];
  const seenRanks = new Set();
  for (const row of rawTable) {
    const rank = Number(row?.rank);
    const amount = Number(row?.amount ?? 0);
    if (!Number.isInteger(rank) || rank < 1 || rank > 300) {
      return res.status(400).json({ message: `رتبه باید عددی صحیح بین ۱ تا ۳۰۰ باشد (دریافت شد: ${row?.rank})` });
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
  // ── جدولِ جوایزِ غیرنقدی (دورِ ۲۶) ──────────────────────────────────
  //
  // ۲۰ نفرِ بعد از ردهٔ نقدی. همان سختگیریِ جدولِ نقدی اینجا هم لازم
  // است: مقدارِ خراب اینجا بی‌صدا ذخیره می‌شود و ماهِ بعد وسطِ بستنِ
  // فصل بیرون می‌زند، جایی که هیچ‌کس نگاه نمی‌کند.
  //
  // ⚠️ `perkTable` اگر در بدنه **نباشد** دست نمی‌خورد. پنلِ قدیمی که
  //    فقط `prizeTable` می‌فرستد نباید جوایزِ غیرنقدی را پاک کند —
  //    همان الگوی PATCH: نبودنِ کلید یعنی «تغییر نده»، نه «خالی کن».
  const PERK_KINDS = ['plus_days', 'shop_item', 'points', 'card_box'];
  let perkTable = null;
  if (req.body.perkTable !== undefined) {
    const rawPerks = Array.isArray(req.body.perkTable) ? req.body.perkTable : [];
    if (rawPerks.length > 300) {
      return res.status(400).json({ message: 'جدول جوایز غیرنقدی حداکثر ۳۰۰ رتبه می‌تواند داشته باشد' });
    }
    perkTable = [];
    const seenPerkRanks = new Set();
    for (const row of rawPerks) {
      const rank = Number(row?.rank);
      if (!Number.isInteger(rank) || rank < 1 || rank > 300) {
        return res.status(400).json({ message: `رتبهٔ جایزهٔ غیرنقدی باید بین ۱ تا ۳۰۰ باشد (دریافت شد: ${row?.rank})` });
      }
      if (seenPerkRanks.has(rank)) {
        return res.status(400).json({ message: `رتبهٔ ${rank} در جدول غیرنقدی تکراری است` });
      }
      seenPerkRanks.add(rank);

      const kind = String(row?.kind || '');
      if (!PERK_KINDS.includes(kind)) {
        return res.status(400).json({ message: `نوع جایزهٔ رتبهٔ ${rank} باید یکی از پلاس، صندوق کارت، آیتم فروشگاه یا امتیاز باشد` });
      }

      const value = Number(row?.value ?? 0);
      if (!Number.isInteger(value) || value < 0 || value > 1000000) {
        return res.status(400).json({ message: `مقدار جایزهٔ غیرنقدی رتبهٔ ${rank} معتبر نیست` });
      }
      // پلاسِ صفرروزه یا امتیازِ صفر یعنی ردیفی که هیچ نمی‌دهد ولی به
      // کاربر اعلانِ «برنده شدی» می‌فرستد.
      if (kind !== 'shop_item' && value <= 0) {
        return res.status(400).json({ message: `مقدار جایزهٔ رتبهٔ ${rank} باید بزرگ‌تر از صفر باشد` });
      }
      if (kind === 'card_box' && value > 5) {
        return res.status(400).json({ message: `تعداد صندوق رتبهٔ ${rank} حداکثر ۵ است` });
      }

      const itemSlug = row?.itemSlug ? String(row.itemSlug).slice(0, 64) : null;
      if (kind === 'shop_item' && !itemSlug) {
        return res.status(400).json({ message: `برای جایزهٔ آیتمِ رتبهٔ ${rank} باید آیتم فروشگاه انتخاب شود` });
      }

      perkTable.push({
        rank,
        kind,
        value: kind === 'shop_item' ? 1 : (kind === 'card_box' ? Math.max(1, value) : value),
        itemSlug,
        label: row?.label ? String(row.label).slice(0, 160) : null,
      });
    }

    // ⚠️ آیتمِ انتخابی باید واقعاً وجود داشته باشد. بدونِ این بررسی، یک
    //    slug اشتباه تا لحظهٔ بستنِ فصل زنده می‌ماند و بعد جایزهٔ کاربر
    //    به ردیفی اشاره می‌کند که تحویل‌دادنی نیست.
    const slugs = [...new Set(perkTable.filter(p => p.itemSlug).map(p => p.itemSlug))];
    if (slugs.length) {
      const { rows: found } = await pool.query(
        'SELECT slug FROM shop_items WHERE slug = ANY($1::text[])', [slugs]);
      const known = new Set(found.map(r => r.slug));
      const missing = slugs.filter(sl => !known.has(sl));
      if (missing.length) {
        return res.status(400).json({ message: `آیتم فروشگاه پیدا نشد: ${missing.join('، ')}` });
      }
    }
  }

  const winnerCount = Math.max(1, Math.min(300, parseFaNumber(req.body.winnerCount) || prizeTable.length || 10));
  await pool.query('UPDATE league_seasons SET prize_table=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(prizeTable), season.id]);
  if (perkTable !== null) {
    await pool.query('UPDATE league_seasons SET perk_table=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(perkTable), season.id]);
  }
  await pool.query(`INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at) VALUES('league_winner_count',$1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`, [JSON.stringify(winnerCount), req.admin.id]);
  await audit(req.admin.id,'update_league_prizes','league_seasons',season.id,null,{...req.body,winnerCount}); res.json({
    message: 'جدول جوایز لیگ ذخیره شد',
    winnerCount,
    cashRanks: prizeTable.length,
    perkRanks: perkTable === null ? undefined : perkTable.length,
  });
}));
// ⚠️ بدونِ لیگِ فعال چیزی برای بستن نیست. پیش از این `ensureActiveSeason`
//    همیشه یکی می‌ساخت؛ حالا که نمی‌سازد، بدونِ این بررسی دکمهٔ «بستنِ
//    لیگِ جاری» به ۵۰۰ می‌خورد.
router.post('/admin/league/close', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  if (!(await ensureActiveSeason())) return noActiveLeague(res);
  res.json(await closeActiveSeason({ force: req.body?.force === true }));
}));

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
  if (!season) return noActiveLeague(res);
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
// مدیریتِ چند لیگِ هم‌زمان
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «ادمین در پنل اندروید و وب بتونه ۲ لیگ رو هم زمان قرار
// بده و زمان شروع و پایان رو ادمین مشخص کنه».
//
// ── چرا این مسیرها نبودند و چطور معلوم شد ──
//
// جدول `league_seasons` از قبل چند ردیفِ `active` می‌پذیرفت و روی
// دیتابیسِ زنده هم **دو لیگ فعال بود** (ماهانه و هفتگی). ولی هیچ مسیرِ
// APIای برای ساختنشان وجود نداشت — لیگِ هفتگی دستی با SQL درج شده بود.
//
// یعنی قابلیت نیمه‌کاره بود: مدیر می‌توانست تاریخِ «لیگِ جاری» را عوض
// کند ولی نمی‌توانست لیگِ دوم بسازد یا ببیندشان.
//
// ⚠️ `month_year` کلیدِ یکتاست. برای لیگِ دوم در همان ماه باید مقدارِ
//    متمایزی ساخته شود وگرنه `ON CONFLICT` لیگِ قبلی را بازنویسی می‌کند.
const LEAGUE_TYPES = ['monthly', 'weekly', 'seasonal', 'special'];

/** فهرستِ همهٔ لیگ‌ها با شمارِ شرکت‌کننده — برای هر دو پنل. */
router.get('/admin/league/seasons', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM league_leaderboard_entries e
              WHERE e.league_season_id = s.id)::int AS player_count,
            (SELECT COALESCE(SUM(e.points), 0) FROM league_leaderboard_entries e
              WHERE e.league_season_id = s.id)::int AS total_points
       FROM league_seasons s
      ORDER BY s.status = 'active' DESC, s.starts_at DESC
      LIMIT 50`);
  res.json({ seasons: rows, types: LEAGUE_TYPES });
}));

/** ساختِ لیگِ تازه — می‌تواند هم‌زمان با لیگ‌های موجود فعال باشد. */
router.post('/admin/league/seasons', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const leagueType = String(req.body.leagueType || 'monthly').trim();
  const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null;
  const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;

  if (title.length < 3 || title.length > 120) {
    return res.status(400).json({ message: 'عنوان لیگ باید بین ۳ تا ۱۲۰ نویسه باشد' });
  }
  if (!LEAGUE_TYPES.includes(leagueType)) {
    return res.status(400).json({ message: 'نوع لیگ معتبر نیست' });
  }
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return res.status(400).json({ message: 'تاریخ شروع معتبر نیست' });
  }
  if (!endsAt || Number.isNaN(endsAt.getTime())) {
    return res.status(400).json({ message: 'تاریخ پایان معتبر نیست' });
  }
  if (endsAt <= startsAt) {
    return res.status(400).json({ message: 'تاریخ پایان باید بعد از تاریخ شروع باشد' });
  }
  // همان محافظِ مسیرِ تاریخ: اشتباهِ تایپی در سال، لیگی می‌سازد که هرگز
  // بسته نمی‌شود و جایزه‌اش پرداخت نمی‌شود.
  const maxSpan = 2 * 365 * 24 * 3600 * 1000;
  if (endsAt - startsAt > maxSpan) {
    return res.status(400).json({ message: 'طول لیگ نمی‌تواند بیش از دو سال باشد' });
  }

  const minPoints = Number.isFinite(parseFaNumber(req.body.minPointsEntry))
    ? Math.max(0, Math.trunc(parseFaNumber(req.body.minPointsEntry))) : 0;
  const plusOnly = req.body.plusOnly === true || req.body.plusOnly === 'true';

  // ── سقفِ لیگِ هم‌زمان ──
  //
  // خواسته «دو لیگ» بود. سقفِ سه گذاشته شد تا یک لیگِ ویژه هم جا داشته
  // باشد، ولی بی‌نهایت نه: هر لیگِ فعال یعنی یک ردیفِ اضافه در مسیرِ
  // داغِ هر امتیازگیری.
  const { rows: activeRows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM league_seasons WHERE status='active'");
  if (activeRows[0].n >= 3) {
    return res.status(409).json({
      message: 'حداکثر سه لیگ می‌تواند هم‌زمان فعال باشد؛ یکی را ببندید',
    });
  }

  // ── چرا month_year دست‌ساز است ──
  //
  // این ستون `UNIQUE` است و در طراحیِ اولیه «کلیدِ ماه» بود. برای لیگِ
  // دوم در همان ماه باید متمایز شود وگرنه درج شکست می‌خورد. پسوندِ
  // نوع + مهرِ زمانی کوتاه، هم یکتا می‌ماند هم در گزارش‌ها خوانا.
  const stamp = startsAt.toISOString().slice(0, 10);
  let monthYear = `${leagueType}-${stamp}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await pool.query(
      'SELECT 1 FROM league_seasons WHERE month_year=$1', [monthYear]);
    if (!clash.rowCount) break;
    monthYear = `${leagueType}-${stamp}-${attempt + 2}`;
  }

  let prizeTable = defaultPrizeTable();
  let perkTable = [];
  if (Array.isArray(req.body.prizeRows)) {
    const split = splitPrizeRows(req.body.prizeRows);
    prizeTable = split.prizeTable;
    perkTable = split.perkTable;
  } else {
    prizeTable = Array.isArray(req.body.prizeTable) ? req.body.prizeTable.slice(0, 300) : defaultPrizeTable();
    perkTable = Array.isArray(req.body.perkTable) ? req.body.perkTable.slice(0, 300) : [];
  }

  // ── آیتمِ فروشگاهِ انتخابی باید واقعاً وجود داشته باشد ──
  //
  // یک slug اشتباه تا لحظهٔ بستنِ فصل زنده می‌ماند و بعد جایزه به ردیفی
  // اشاره می‌کند که تحویل‌دادنی نیست.
  const slugs = [...new Set(perkTable.filter((p) => p.itemSlug).map((p) => p.itemSlug))];
  if (slugs.length) {
    const { rows: found } = await pool.query(
      'SELECT slug FROM shop_items WHERE slug = ANY($1::text[])', [slugs]);
    const known = new Set(found.map((r) => r.slug));
    const missing = slugs.filter((s) => !known.has(s));
    if (missing.length) {
      return res.status(400).json({ message: `آیتم فروشگاه پیدا نشد: ${missing.join('، ')}` });
    }
  }
  const { rows } = await pool.query(
    `INSERT INTO league_seasons
       (month_year, title, league_type, starts_at, ends_at, status,
        prize_table, perk_table, manual_dates, min_points_entry, plus_only)
     VALUES ($1,$2,$3,$4,$5,'active',$6,$7,TRUE,$8,$9)
     RETURNING *`,
    [monthYear, title, leagueType, startsAt, endsAt,
      JSON.stringify(prizeTable), JSON.stringify(perkTable), minPoints, plusOnly]);

  await audit(req.admin.id, 'league_create', 'league_seasons', rows[0].id, null,
    { title, leagueType, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });

  // ── انتقالِ درصدیِ سکه از لیگِ بستهٔ قبلیِ همین نوع (خواستهٔ مالک) ──
  //
  // اگر موقعِ بستنِ لیگِ قبل، لیگِ بعدی هنوز ساخته نشده بود، سکهٔ
  // انتقالی اینجا — با ساختِ لیگِ تازه — منتقل می‌شود. درصدش را ادمین
  // در «تنظیمات اقتصاد بازی» تعیین کرده (صفر هم مجاز است).
  let carryover = null;
  try {
    carryover = await seedCarryoverFromLatestClosed({
      leagueType,
      targetSeasonId: rows[0].id,
    });
  } catch (e) {
    console.error('[league] انتقالِ سکه هنگامِ ساخت لیگ شکست خورد:', e.message);
  }
  // ── ثانیه‌شمارِ خودکار تا شروعِ لیگ ──
  //
  // خواستهٔ مالک: «اگه این تیک بخوره، مثلاً زده باشیم لیگ ۷ مهر شروع
  // میشه — هر چقدر تا ۷ مهر مونده، اتوماتیک به عنوان ثانیه‌شمار قرار
  // می‌گیره و تمامی قسمت‌هایی که سکه میدن بسته میشه.»
  //
  // پس زمانِ شمارش از **تاریخِ شروعِ خودِ لیگ** گرفته می‌شود، نه از یک
  // فیلدِ جداگانه که مدیر باید دوباره واردش کند و ممکن است با تاریخِ لیگ
  // ناهماهنگ بماند.
  let countdown = null;
  const wantCountdown = req.body.countdownEnabled === true
    || req.body.countdownEnabled === 'true';
  if (wantCountdown && leagueCountdown) {
    try {
      countdown = await leagueCountdown.saveSettings({
        enabled: true,
        startsAt: startsAt.toISOString(),
        seasonId: rows[0].id,
        leagueAutostart: false,
      }, req.admin.id);
      await audit(req.admin.id, 'league_countdown_enable', 'app_settings', null,
        `ثانیه‌شمار تا شروعِ «${title}» روشن شد`, { startsAt: startsAt.toISOString() });
    } catch (e) {
      // ساختِ لیگ نباید به‌خاطرِ ثانیه‌شمار شکست بخورد؛ مدیر می‌تواند بعداً
      // از همان صفحه دوباره امتحان کند.
      console.error('[league] تنظیمِ ثانیه‌شمار هنگامِ ساخت شکست خورد:', e.message);
    }
  }

  res.status(201).json({
    message: countdown
      ? 'لیگ ساخته شد و ثانیه‌شمار تا لحظهٔ شروع تنظیم شد'
      : 'لیگ تازه ساخته شد',
    season: rows[0], carryover, countdown,
  });
}));

/** ویرایشِ یک لیگِ مشخص (نه فقط «لیگِ جاری»). */
router.patch('/admin/league/seasons/:id', adminAuth, validateUuid('id'), requireRole(),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query(
      'SELECT * FROM league_seasons WHERE id=$1', [req.params.id]);
    const season = found[0];
    if (!season) return res.status(404).json({ message: 'لیگ پیدا نشد' });
    if (season.status === 'closed') {
      return res.status(409).json({ message: 'لیگ بسته‌شده قابل ویرایش نیست' });
    }

    const patch = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (title.length < 3 || title.length > 120) {
        return res.status(400).json({ message: 'عنوان لیگ باید بین ۳ تا ۱۲۰ نویسه باشد' });
      }
      patch.title = title;
    }
    if (req.body.startsAt !== undefined || req.body.endsAt !== undefined) {
      const startsAt = new Date(req.body.startsAt ?? season.starts_at);
      const endsAt = new Date(req.body.endsAt ?? season.ends_at);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        return res.status(400).json({ message: 'تاریخ معتبر نیست' });
      }
      if (endsAt <= startsAt) {
        return res.status(400).json({ message: 'تاریخ پایان باید بعد از تاریخ شروع باشد' });
      }
      if (endsAt - startsAt > 2 * 365 * 24 * 3600 * 1000) {
        return res.status(400).json({ message: 'طول لیگ نمی‌تواند بیش از دو سال باشد' });
      }
      patch.starts_at = startsAt;
      patch.ends_at = endsAt;
      // بدونِ این، repairSeasonBounds تاریخ‌ها را از تقویم بازمی‌سازد.
      patch.manual_dates = true;
    }
    if (req.body.minPointsEntry !== undefined) {
      patch.min_points_entry = Math.max(0, Math.trunc(parseFaNumber(req.body.minPointsEntry) || 0));
    }
    if (req.body.plusOnly !== undefined) {
      patch.plus_only = req.body.plusOnly === true || req.body.plusOnly === 'true';
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'چیزی برای تغییر داده نشده' });
    }

    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE league_seasons SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [season.id, ...keys.map(k => patch[k])]);
    await audit(req.admin.id, 'league_update', 'league_seasons', season.id, null, patch);
    res.json({ message: 'لیگ به‌روز شد', season: rows[0] });
  }));

/** بستنِ یک لیگِ مشخص — لیگ‌های دیگر دست‌نخورده می‌مانند. */
router.post('/admin/league/seasons/:id/close', adminAuth, validateUuid('id'), requireRole(),
  asyncHandler(async (req, res) => {
    const { rows: found } = await pool.query(
      "SELECT * FROM league_seasons WHERE id=$1", [req.params.id]);
    if (!found[0]) return res.status(404).json({ message: 'لیگ پیدا نشد' });
    if (found[0].status === 'closed') {
      return res.status(409).json({ message: 'این لیگ قبلاً بسته شده' });
    }
    // ⚠️ بستن **پول نمی‌دهد** — فقط ردیفِ pending می‌سازد. تأییدِ واریز
    //    مسیرِ جداگانه دارد. این قاعده عمدی است و نباید ساده شود.
    const result = await closeActiveSeason({ force: true, seasonId: req.params.id });
    await audit(req.admin.id, 'league_close', 'league_seasons', req.params.id, null, {});
    res.json(result);
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
// SECURITY (ممیزی دورِ ۲۳): requireRole('support') اضافه شد — این پاسخ
// موبایل و شمارهٔ حسابِ بانکیِ برندگانِ لیگ را برمی‌گرداند؛ نقشِ «ناظر»
// (observer) نیازی به PII بانکی ندارد.
// ⚠️ `bank_account` در دیتابیس رمزگذاری‌شده است؛ باید باز شود وگرنه مدیر
//    رشتهٔ `enc:v1:...` می‌بیند و نمی‌تواند جایزه را واریز کند.
router.get('/admin/league/payouts', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, u.mobile, u.first_name, u.last_name, u.nickname, u.bank_account
       FROM league_payouts p JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC`,
  );
  res.json(rows.map(r => ({
    ...r,
    bank_account: r.bank_account ? fieldCrypto.decrypt(r.bank_account) : r.bank_account,
  })));
}));
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
        'جایزهٔ لیگ به کیف پول اضافه شد',
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
