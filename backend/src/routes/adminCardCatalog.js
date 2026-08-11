/**
 * Legacy card catalogue and code administration routes.
 *
 * This is the code-only card system used by both admin clients. It was moved
 * out of server.js without changing route paths, middleware order, response
 * shapes, SQL, or audit actions. Dependencies are injected so the module uses
 * the same authentication, validation, pool, and helpers as the main app.
 */
const express = require('express');

module.exports = function createAdminCardCatalogRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit,
    validateUuid, UUID_RE, keepImage, cashAmountInput,
    normalizeCardCode, validateCodeFormat,
  } = deps;
  const router = express.Router();

// فهرست نوع کارت‌ها همراه با شمار کدهای هر کدام.
// بدون این، مدیر هنگام ویرایش یک کارت نمی‌داند اصلاً چند کد برایش صادر
// شده و چندتا مصرف شده — و برای فهمیدنش باید به فهرست کدها می‌رفت و
// دستی می‌شمرد. LEFT JOIN تا کارت بدون کد هم با صفر برگردد، نه اینکه حذف شود.
router.get('/admin/card-types', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*,
           COUNT(c.id)::int                                        AS code_count,
           COUNT(c.id) FILTER (WHERE c.status='unused')::int        AS unused_count,
           COUNT(c.id) FILTER (WHERE c.status='used')::int          AS used_count,
           COUNT(c.id) FILTER (WHERE c.status='voided')::int        AS voided_count
      FROM card_types t
      LEFT JOIN card_codes c ON c.card_type_id = t.id
     GROUP BY t.id
     ORDER BY t.created_at DESC`);
  res.json(rows);
}));
router.post('/admin/card-types', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { name, description, pointValue, isActive = true } = req.body;
  // Normalise '' to null so an image-less card is stored consistently
  // (and never as an empty string that later reads as "has an image").
  const imageUrl = req.body.imageUrl ? String(req.body.imageUrl).trim() || null : null;
  const cashAmount = cashAmountInput(req.body.cashAmount) ?? 0;
  // ── نامِ تکراری رد می‌شود ──
  //
  // باگی که این را لازم کرد: مالک برای «Achraf Hakimi» دو بار کارت
  // ساخت (بارِ دوم برای آپلودِ پشتِ کارت). دو ردیف با نامِ یکسان و دو
  // UUID متفاوت ساخته شد. کدها به اولی گره خوردند ولی موتورِ تطبیق
  // طرحِ دومی را می‌شناخت، پس **هر ثبت** با علتِ `type_mismatch` به صف
  // بررسی می‌رفت — با اینکه عکس و کد هر دو درست بودند.
  //
  // ایندکسِ یکتای `uq_card_types_name_ci` هم در مایگریشن ۰۴۲ اضافه شد،
  // ولی این بررسی می‌ماند تا پیامِ فارسیِ روشن بدهد به‌جای خطای خامِ
  // یکتاییِ پستگرس که مدیر معنی‌اش را نمی‌فهمد.
  const dupType = await pool.query(
    'SELECT id FROM card_types WHERE lower(trim(name)) = lower(trim($1))',
    [name]);
  if (dupType.rows[0]) {
    return res.status(409).json({
      message: `کارتی با نام «${name}» از قبل وجود دارد. برای افزودنِ `
        + 'عکسِ دیگر (مثلاً پشتِ کارت) از بخش «ثبت کارت» همان نام را '
        + 'دوباره وارد کنید — عکسِ تازه به همان کارت اضافه می‌شود.',
      cardTypeId: dupType.rows[0].id,
    });
  }
  const { rows } = await pool.query('INSERT INTO card_types(name,image_url,description,point_value,cash_amount,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [name,imageUrl,description,pointValue,cashAmount,isActive]);
  await audit(req.admin.id, 'create_card_type', 'card_types', rows[0].id, null, req.body); res.json(rows[0]);
}));
router.patch('/admin/card-types/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { name, description, pointValue, isActive } = req.body;
  const imageUrl = keepImage(req.body.imageUrl);
  const cashAmount = cashAmountInput(req.body.cashAmount);
  const duelAttack = req.body.duelAttack != null ? Number(req.body.duelAttack) : null;
  const duelDefense = req.body.duelDefense != null ? Number(req.body.duelDefense) : null;
  const duelSpeed = req.body.duelSpeed != null ? Number(req.body.duelSpeed) : null;
  const duelTechnique = req.body.duelTechnique != null ? Number(req.body.duelTechnique) : null;
  const duelGoalChance = req.body.duelGoalChance != null ? Number(req.body.duelGoalChance) : null;
  const duelEnergy = req.body.duelEnergy != null ? Number(req.body.duelEnergy) : null;
  const duelRarity = req.body.duelRarity || null;
  const duelEffect = req.body.duelEffect || null;

  const { rows } = await pool.query(
    `UPDATE card_types
        SET name = COALESCE($1, name),
            image_url = COALESCE($2, image_url),
            description = COALESCE($3, description),
            point_value = COALESCE($4, point_value),
            cash_amount = COALESCE($5, cash_amount),
            is_active = COALESCE($6, is_active),
            duel_attack = COALESCE($8, duel_attack),
            duel_defense = COALESCE($9, duel_defense),
            duel_speed = COALESCE($10, duel_speed),
            duel_technique = COALESCE($11, duel_technique),
            duel_goal_chance = COALESCE($12, duel_goal_chance),
            duel_energy = COALESCE($13, duel_energy),
            duel_rarity = COALESCE($14, duel_rarity),
            duel_effect = COALESCE($15, duel_effect),
            updated_at = NOW()
      WHERE id = $7
    RETURNING *`,
    [name, imageUrl, description, pointValue, cashAmount, isActive, req.params.id,
     duelAttack, duelDefense, duelSpeed, duelTechnique, duelGoalChance, duelEnergy,
     duelRarity, duelEffect]
  );
  await audit(req.admin.id, 'update_card_type', 'card_types', req.params.id, null, req.body);
  res.json(rows[0]);
}));

/**
 * حذفِ کاملِ یک نوع کارت.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا لازم شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تا امروز فقط `is_active=false` ممکن بود. ولی کارتِ غیرفعال از کاتالوگ
 * پاک نمی‌شود و در منویِ «این کدها روی کدام کارت چاپ می‌شوند؟» ظاهر
 * می‌ماند. مالک با اسکرین‌شات نشان داد که آن منو با ۹۱ کارتِ آزمایشی
 * عملاً غیرقابل‌استفاده شده بود.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا حذف فقط وقتی هیچ ردِ پایی نمانده باشد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * اگر کارتی در اینونتوریِ کسی نشسته یا کدی برایش مصرف شده، حذفش یعنی
 * پاک کردنِ چیزی که کاربر واقعاً دارد. `ON DELETE RESTRICT` روی
 * `expected_card_type_id` هم همین را می‌گوید.
 *
 * پس شرط‌ها صریح بررسی می‌شوند و پیامِ فارسیِ روشن می‌دهند — نه اینکه
 * خطای خامِ Postgres به مدیر برسد و او نفهمد چرا نشد.
 */
router.delete('/admin/card-types/:id', adminAuth, validateUuid('id'),
  requireRole('support'), asyncHandler(async (req, res) => {
    const id = req.params.id;
    const t = await pool.query('SELECT name FROM card_types WHERE id=$1', [id]);
    if (!t.rows[0]) return res.status(404).json({ message: 'نوع کارت پیدا نشد' });

    // هر وابستگی جداگانه شمرده می‌شود تا پیام بگوید **کدام** مانع است.
    const [inv, codes, photoCodes, designs] = await Promise.all([
      pool.query('SELECT count(*)::int n FROM user_card_inventory WHERE card_type_id=$1', [id]),
      pool.query('SELECT count(*)::int n FROM card_codes WHERE card_type_id=$1', [id]),
      pool.query('SELECT count(*)::int n FROM photo_card_codes WHERE expected_card_type_id=$1', [id]),
      pool.query('SELECT count(*)::int n FROM photo_card_designs WHERE card_type_id=$1', [id]),
    ]);
    const blockers = [];
    if (inv.rows[0].n) blockers.push(`${inv.rows[0].n} کارت در مجموعهٔ کاربران`);
    if (codes.rows[0].n) blockers.push(`${codes.rows[0].n} کد در سیستم قدیمی`);
    if (photoCodes.rows[0].n) blockers.push(`${photoCodes.rows[0].n} کد گره‌خورده`);
    if (designs.rows[0].n) blockers.push(`${designs.rows[0].n} طرح تصویری`);

    if (blockers.length) {
      return res.status(409).json({
        message: `«${t.rows[0].name}» قابل حذف نیست چون ${blockers.join(' و ')} `
          + 'به آن وابسته است. اول آن‌ها را پاک کنید، یا کارت را فقط '
          + 'غیرفعال کنید.',
        blockers,
      });
    }

    await pool.query('DELETE FROM card_types WHERE id=$1', [id]);
    await audit(req.admin.id, 'delete_card_type', 'card_types', id, null,
      { name: t.rows[0].name });
    res.json({ message: `«${t.rows[0].name}» حذف شد` });
  }));

router.get('/admin/card-codes', adminAuth, asyncHandler(async (req, res) => {
  const { status, cardTypeId, userId, search } = req.query;
  const params = []; const where = [];
  if (status) { params.push(status); where.push(`c.status=$${params.length}`); }
  if (cardTypeId) { params.push(cardTypeId); where.push(`c.card_type_id=$${params.length}`); }
  if (userId) { params.push(userId); where.push(`c.used_by_user_id=$${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`c.code ILIKE $${params.length}`); }
  const sql = `SELECT c.*, t.name AS card_type_name, u.mobile AS used_by_mobile FROM card_codes c JOIN card_types t ON t.id=c.card_type_id LEFT JOIN users u ON u.id=c.used_by_user_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY c.created_at DESC LIMIT 500`;
  res.json((await pool.query(sql, params)).rows);
}));
router.post('/admin/card-codes', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { code, cardTypeId } = req.body;
  const normalizedCode = normalizeCardCode(code);
  if (!validateCodeFormat(normalizedCode)) return res.status(400).json({ message: 'فرمت کد معتبر نیست' });
  const { rows } = await pool.query('INSERT INTO card_codes(code,card_type_id) VALUES($1,$2) RETURNING *', [normalizedCode, cardTypeId]);
  await audit(req.admin.id, 'create_card_code', 'card_codes', rows[0].id, null, { code: code.slice(0,4)+'...' }); res.json(rows[0]);
}));
// Void a leaked/mistaken card code before anyone redeems it. There was
// previously no way to disable a code once created — only 'unused'/'used'
// existed, and there is deliberately no DELETE endpoint (codes are kept
// forever for audit purposes). 'voided' behaves like a dead-end status: the
// redeem endpoint below already only accepts codes with status='unused' via
// its explicit check, so a voided code simply can never be redeemed.
router.patch('/admin/card-codes/:id/void', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query("UPDATE card_codes SET status='voided', updated_at=NOW() WHERE id=$1 AND status='unused' RETURNING id,code", [req.params.id]);
  if (!rows[0]) return res.status(400).json({ message: 'فقط کدهای استفاده‌نشده قابل ابطال هستند' });
  await audit(req.admin.id, 'void_card_code', 'card_codes', rows[0].id, req.body.reason || 'ابطال دستی', {});
  res.json({ message: 'کد باطل شد' });
}));
// حداکثر تعداد کد در **یک درخواست**.
//
// این سقفِ کل کارت نیست: هیچ محدودیتی برای مجموع کدهای یک نوع کارت وجود
// ندارد و مدیر می‌تواند این عملیات را هر چند بار که خواست تکرار کند.
// (آزموده‌شده روی سرور: سه بار ۱۰۰۰تایی روی یک کارت = ۳۰۰۰ کد، هر بار
// حدود نیم ثانیه.)
//
// چرا اصلاً سقفِ هر-درخواست لازم است: بدون آن، یک چسباندن اشتباهی (مثلاً
// کل یک فایل CSV) می‌تواند صدها هزار ردیف بسازد، تراکنش را دقیقه‌ها باز
// نگه دارد — و همان تراکنش روی جدولی قفل می‌گیرد که مسیر «ثبت کد»
// کاربران هم به آن نیاز دارد.
const BULK_CODE_LIMIT = 1000;

router.post('/admin/card-codes/bulk', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { rawCodes = '' } = req.body;
  const cardTypeId = req.body.cardTypeId;

  // پیش از هر کاری: شناسهٔ نوع کارت باید معتبر و موجود باشد.
  // قبلاً هیچ بررسی‌ای نبود؛ یک شناسهٔ نامعتبر تا خود Postgres می‌رفت و
  // به‌صورت خطای ۵۰۰ برمی‌گشت، و یک UUID معتبرِ ناموجود هم با نقض کلید
  // خارجی همان ۵۰۰ را می‌داد — هر دو بدون پیام قابل فهم برای مدیر.
  if (!UUID_RE.test(String(cardTypeId || ''))) {
    return res.status(400).json({ message: 'نوع کارت انتخاب نشده یا معتبر نیست' });
  }
  const typeRow = await pool.query('SELECT id, name FROM card_types WHERE id=$1', [cardTypeId]);
  if (!typeRow.rows[0]) return res.status(404).json({ message: 'نوع کارت پیدا نشد' });

  const input = String(rawCodes).split(/[\n,;\t ]+/).map(c => normalizeCardCode(c)).filter(Boolean);
  if (!input.length) return res.status(400).json({ message: 'هیچ کدی وارد نشده است' });
  if (input.length > BULK_CODE_LIMIT) {
    return res.status(400).json({
      message: `در هر نوبت حداکثر ${BULK_CODE_LIMIT} کد قابل ثبت است؛ شما ${input.length} کد فرستادید. `
        + `بقیه را در نوبت بعد اضافه کنید — برای مجموع کدهای یک کارت هیچ سقفی وجود ندارد.`,
    });
  }

  const seen = new Set(), duplicateInFile = [], invalid = [], candidates = [];
  for (const c of input) {
    if (!validateCodeFormat(c)) { invalid.push(c); continue; }
    if (seen.has(c)) { duplicateInFile.push(c); continue; }
    seen.add(c); candidates.push(c);
  }

  let duplicateInDb = [], inserted = [];
  if (candidates.length) {
    // یک درج دسته‌ای به‌جای حلقه. اندازه‌گیری شده روی همین سرور:
    // ۱۰۰۰ کد تک‌به‌تک ۵۰۷ میلی‌ثانیه، دسته‌ای ۴۱ میلی‌ثانیه (~۱۲ برابر).
    // مهم‌تر از سرعت: تراکنش کوتاه‌تر یعنی قفل کمتر روی جدولی که مسیر
    // «ثبت کد» کاربران هم به آن نیاز دارد.
    //
    // ON CONFLICT DO NOTHING تکراری‌های دیتابیس را اتمیک رد می‌کند. بررسی
    // جداگانهٔ قبلی یک مسابقهٔ زمانی داشت: بین SELECT و INSERT، ادمین دوم
    // می‌توانست همان کد را درج کند و درج اول با خطای ۵۰۰ می‌افتاد و کل
    // دستهٔ سالم را برمی‌گرداند.
    const result = await pool.query(
      `INSERT INTO card_codes(code, card_type_id)
       SELECT unnest($1::citext[]), $2
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [candidates, cardTypeId],
    );
    inserted = result.rows.map(r => String(r.code));
    const insertedSet = new Set(inserted.map(c => c.toUpperCase()));
    duplicateInDb = candidates.filter(c => !insertedSet.has(c.toUpperCase()));
  }

  await audit(req.admin.id, 'bulk_import_card_codes', 'card_types', cardTypeId, null, {
    cardTypeName: typeRow.rows[0].name,
    inserted: inserted.length,
    duplicateInFile: duplicateInFile.length,
    duplicateInDb: duplicateInDb.length,
    invalid: invalid.length,
  });

  // فقط نمونه‌ای از هر دسته برمی‌گردد. با ۱۰۰۰ کد، برگرداندن همهٔ آرایه‌ها
  // پاسخ را بی‌جهت سنگین می‌کرد و رابط کاربری هم آن را نشان نمی‌دهد؛
  // شمارش‌ها همان چیزی است که مدیر می‌بیند.
  const sample = (arr) => arr.slice(0, 20);
  res.json({
    cardTypeName: typeRow.rows[0].name,
    insertedCount: inserted.length,
    duplicateInFileCount: duplicateInFile.length,
    duplicateInDbCount: duplicateInDb.length,
    invalidCount: invalid.length,
    inserted: sample(inserted),
    duplicateInFile: sample(duplicateInFile),
    duplicateInDb: sample(duplicateInDb),
    invalid: sample(invalid),
    truncatedSamples: inserted.length > 20 || duplicateInDb.length > 20 || invalid.length > 20,
  });
}));


  return router;
};
