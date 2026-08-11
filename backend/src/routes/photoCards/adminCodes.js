/** Administrative code bank, assignment, export, and card options. */
module.exports = function registerAdminPhotoCardCodes(deps) {
  const {
    router, pool, adminAuth, requireRole, asyncHandler, audit,
    validateUuid, UUID_RE, photoCards, MAX_BATCH,
  } = deps;

  router.get('/admin/photo-cards/codes/stats', adminAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT status, count(*)::int AS count FROM photo_card_codes GROUP BY status`,
    );
    const stats = { unused: 0, reserved: 0, used: 0, voided: 0 };
    for (const r of rows) stats[r.status] = r.count;
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
    const batches = await pool.query(
      `SELECT batch_label, count(*)::int AS count, min(created_at) AS created_at
         FROM photo_card_codes WHERE batch_label IS NOT NULL
        GROUP BY batch_label ORDER BY min(created_at) DESC LIMIT 50`,
    );
    res.json({ stats, batches: batches.rows });
  }));

  /**
   * ورودِ کد توسط مدیر — دانه‌ای یا انبوه.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * چرا مدیر کد را وارد می‌کند و سیستم نمی‌سازد
   * ═══════════════════════════════════════════════════════════════════════
   *
   * خواستهٔ صریح مالک: «کدها رو ادمین دونه‌ای و یا تعداد بالا خودش وارد
   * کنه». نسخهٔ اول کد تصادفی تولید می‌کرد که اشتباه بود: کدها روی کارتِ
   * فیزیکی **چاپ** می‌شوند و آن چاپ ممکن است قبلاً انجام شده باشد یا
   * چاپخانه قالب خودش را داشته باشد. سیستمی که کد می‌سازد، مالک را
   * مجبور می‌کند چاپ را با خروجی نرم‌افزار هماهنگ کند — برعکسِ چیزی که
   * در عمل لازم است.
   *
   * حالا مدیر همان کدهایی را که روی کارت‌ها چاپ شده وارد می‌کند.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * بانک همچنان مشترک است
   * ═══════════════════════════════════════════════════════════════════════
   *
   * هیچ `card_type_id`ای گرفته نمی‌شود. کد در لحظهٔ ثبتِ کاربر به طرحی
   * که تصویرش تطبیق خورده بسته می‌شود. پس طرح جدید که اضافه شود، همین
   * کدها پوششش می‌دهند — دقیقاً همان چیزی که مالک خواست.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * چرا گزارش تفکیک‌شده برمی‌گردد
   * ═══════════════════════════════════════════════════════════════════════
   *
   * وقتی مدیر ۱۵ هزار کد را از یک فایل اکسل کپی می‌کند، «۱۴٬۹۸۷ کد ثبت
   * شد» به‌تنهایی بی‌فایده است — کدام ۱۳ تا جا افتاد و چرا؟ پس چهار
   * دستهٔ جدا شمرده می‌شود: ثبت‌شده، تکراری در همین ورودی، تکراری در
   * دیتابیس، و نامعتبر. همان الگویی که مسیر `card-codes/bulk` فعلی دارد،
   * تا مدیر با دو رابطِ ناهماهنگ روبه‌رو نشود.
   */
  router.post(
    '/admin/photo-cards/codes',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      // هم `code` تکی را می‌پذیرد، هم `rawCodes` انبوه. یک مسیر برای هر
      // دو حالت، چون منطقِ اعتبارسنجی و گزارش دقیقاً یکی است و دو مسیر
      // یعنی دو جا برای واگرا شدن.
      const raw = req.body.rawCodes !== undefined
        ? String(req.body.rawCodes)
        : String(req.body.code || '');

      // جداکننده‌ها: خط جدید، کاما، سمی‌کالن، تب، فاصله، و ویرگول فارسی.
      // مدیر ممکن است از اکسل، از فایل متنی، یا دستی کپی کند.
      //
      // نکته: توکنِ خام هم نگه داشته می‌شود. اگر فقط نتیجهٔ نرمال‌سازی را
      // نگه می‌داشتیم، ورودی‌ای مثل «----» که به رشتهٔ خالی تبدیل می‌شود
      // بی‌سروصدا حذف می‌شد — مدیر چیزی نوشته بود و بدون هیچ توضیحی
      // ناپدید می‌شد. حالا به‌عنوان «نامعتبر» گزارش می‌شود.
      const tokens = raw.split(/[\n,;\t، ]+/)
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => ({ raw: x, norm: photoCards.normalizePhotoCode(x) }));

      if (!tokens.length) {
        return res.status(400).json({ message: 'هیچ کدی وارد نشده است' });
      }
      const input = tokens;
      if (input.length > MAX_BATCH) {
        return res.status(400).json({
          message: `در هر نوبت حداکثر ${MAX_BATCH.toLocaleString('en-US')} کد `
            + `قابل ثبت است؛ شما ${input.length.toLocaleString('en-US')} کد فرستادید. `
            + 'بقیه را در نوبت بعد اضافه کنید — برای مجموع کدها سقفی نیست.',
        });
      }

      const label = String(req.body.batchLabel || '').trim().slice(0, 80) || null;

      // ── نوعِ کارتِ از پیش معلوم ──
      //
      // خواستهٔ مالک: «اگه ما کد رو برای کارتی دقیقا ثبت کردیم، مثلا
      // ۱۰۰۰ تا کد برای یه کارت مخصوص».
      //
      // اختیاری است. اگر نیاید، کدها «بی‌نام» می‌مانند و دقیقاً مثل
      // قبل رفتار می‌کنند — همان کارت‌های قدیمی که نمی‌دانیم کدشان
      // روی کدام کارت چاپ شده.
      const expectedTypeId = String(req.body.cardTypeId || '').trim() || null;
      if (expectedTypeId) {
        if (!UUID_RE.test(expectedTypeId)) {
          return res.status(400).json({ message: 'شناسهٔ نوع کارت معتبر نیست' });
        }
        // وجودِ نوعِ کارت **قبل از** درج بررسی می‌شود.
        //
        // کلید خارجی هم جلویش را می‌گیرد، ولی آنجا خطای خامِ Postgres
        // می‌دهد که مدیر نمی‌فهمد. بدتر: با ۱۵ هزار کد، کلِ درج برمی‌گردد
        // و مدیر نمی‌داند چرا.
        const t = await pool.query(
          'SELECT id, name, is_active FROM card_types WHERE id=$1',
          [expectedTypeId]);
        if (!t.rows[0]) {
          return res.status(404).json({ message: 'نوع کارت یافت نشد' });
        }
        if (!t.rows[0].is_active) {
          return res.status(400).json({
            message: `نوع کارت «${t.rows[0].name}» غیرفعال است. `
              + 'اول فعالش کنید بعد کد اضافه کنید.' });
        }
      }

      // ── تکراری بر پایهٔ fold سنجیده می‌شود، نه رشتهٔ خام ──
      //
      // `QL-2026-O001` و `QL-2026-0001` روی کارتِ چاپی از هم قابل تشخیص
      // نیستند. اگر هر دو وارد شوند، کاربری که کارت را در دست دارد
      // نمی‌تواند بگوید کدام‌یک را دارد. پس همین‌جا یکی‌شان تکراری
      // شمرده می‌شود، نه اینکه ایندکس یکتای دیتابیس بعداً با خطای مبهم
      // بیفتد.
      const seen = new Set();
      const duplicateInFile = [];
      const invalid = [];
      const candidates = [];
      for (const tok of input) {
        if (!photoCards.isValidPhotoCode(tok.norm)) { invalid.push(tok.raw); continue; }
        const key = photoCards.foldPhotoCode(tok.norm);
        if (seen.has(key)) { duplicateInFile.push(tok.norm); continue; }
        seen.add(key);
        candidates.push(tok.norm);
      }

      let inserted = [];
      let duplicateInDb = [];
      let clashWithOldBank = [];
      if (candidates.length) {
        // ── هشدار برخورد با بانکِ سیستم قدیمی ──
        //
        // دو بانک کاملاً مستقل‌اند (`card_codes` و `photo_card_codes`) و
        // این عمدی است. ولی یک خطر واقعی دارد: اگر مدیر یک رشتهٔ یکسان
        // را در **هر دو** بانک وارد کند، کاربر می‌تواند یک بار از راه
        // «ثبت کد کارت» و یک بار از راه «ثبت با عکس» امتیاز بگیرد —
        // دو بار برای یک کارت.
        //
        // بلوکش نمی‌کنیم چون ممکن است عمدی باشد (مثلاً همان کارت‌های
        // قدیمی حالا با عکس هم قابل ثبت شوند). فقط گزارش می‌دهیم تا
        // مدیر بداند چه چیزی را انتخاب کرده — سکوت اینجا یعنی نشتِ
        // امتیاز که ماه‌ها بعد کشف می‌شود.
        const clash = await pool.query(
          `SELECT code FROM card_codes WHERE code = ANY($1::citext[])`,
          [candidates],
        );
        clashWithOldBank = clash.rows.map(x => String(x.code));

        // درج دسته‌ای با ON CONFLICT — اتمیک و بدون مسابقهٔ زمانی.
        // بررسی جداگانهٔ «آیا وجود دارد؟» قبل از درج، پنجره‌ای می‌ساخت
        // که ادمین دوم می‌توانست همان کد را وسطش درج کند.
        //
        // تعارض روی `code_fold` گرفته می‌شود نه `code`: دو کدی که فقط در
        // O/0 یا I/L/1 فرق دارند روی کارت یکسان دیده می‌شوند و نباید هر
        // دو در بانک باشند.
        const r = await pool.query(
          `INSERT INTO photo_card_codes(code, batch_label, expected_card_type_id)
           SELECT unnest($1::citext[]), $2, $3
           ON CONFLICT (code_fold) DO NOTHING
           RETURNING code`,
          [candidates, label, expectedTypeId],
        );
        inserted = r.rows.map(x => String(x.code));
        const okSet = new Set(inserted.map(c => c.toUpperCase()));
        duplicateInDb = candidates.filter(c => !okSet.has(c.toUpperCase()));
      }

      await audit(req.admin.id, 'import_photo_card_codes', 'photo_card_codes',
        null, null, {
          inserted: inserted.length,
          duplicateInFile: duplicateInFile.length,
          duplicateInDb: duplicateInDb.length,
          invalid: invalid.length,
          clashWithOldBank: clashWithOldBank.length,
          batchLabel: label,
          expectedCardTypeId: expectedTypeId,
        });

      // فقط نمونه‌ای از هر دسته. با ۱۵ هزار کد، برگرداندن همهٔ آرایه‌ها
      // پاسخ را چند مگابایت می‌کرد و رابط هم نشانش نمی‌دهد.
      const sample = a => a.slice(0, 20);
      res.json({
        insertedCount: inserted.length,
        duplicateInFileCount: duplicateInFile.length,
        duplicateInDbCount: duplicateInDb.length,
        invalidCount: invalid.length,
        inserted: sample(inserted),
        duplicateInFile: sample(duplicateInFile),
        duplicateInDb: sample(duplicateInDb),
        invalid: sample(invalid),
        // هشدار، نه خطا: مدیر باید بداند این کدها در سیستم قدیمی هم
        // هستند و آن کارت دو بار قابل ثبت می‌شود.
        clashWithOldBankCount: clashWithOldBank.length,
        clashWithOldBank: sample(clashWithOldBank),
        truncatedSamples: inserted.length > 20 || duplicateInDb.length > 20
          || invalid.length > 20,
        batchLabel: label,
        expectedCardTypeId: expectedTypeId,
        message: `${inserted.length.toLocaleString('en-US')} کد ثبت شد`
          + (expectedTypeId ? ' و به این کارت گره خورد' : ''),
      });
    }),
  );

  /** ابطال یک کد پیش از آنکه کسی مصرفش کند. */
  
  /** جستجو و فعال/غیرفعال‌سازی سریع یک کد بر اساس رشته کد (از میان ۱۵٬۰۰۰+ کد) */
  router.post(
    '/admin/photo-cards/codes/toggle-by-code',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      const raw = String(req.body.code || '').trim();
      if (!raw) return res.status(400).json({ message: 'کد را وارد کنید' });
      const code = photoCards.normalizePhotoCode(raw);
      const fold = photoCards.foldPhotoCode(code);
      const cur = await pool.query(
        `SELECT c.id, c.code, c.status, c.batch_label, c.expected_card_type_id,
                t.name AS card_type_name
           FROM photo_card_codes c
           LEFT JOIN card_types t ON t.id = c.expected_card_type_id
          WHERE c.code_fold = $1 OR c.code = $2`,
        [fold, code],
      );
      if (!cur.rows[0]) return res.status(404).json({ message: 'کدی با این مشخصات یافت نشد' });
      const row = cur.rows[0];
      if (row.status === 'used') {
        return res.status(409).json({ message: 'این کد قبلاً توسط کاربر مصرف شده و قابل تغییر وضعیت نیست' });
      }
      if (row.status === 'reserved') {
        return res.status(409).json({ message: 'این کد در صف بررسی است و قابل تغییر وضعیت نیست' });
      }
      const nextStatus = row.status === 'voided' ? 'unused' : 'voided';
      await pool.query('UPDATE photo_card_codes SET status=$1, updated_at=NOW() WHERE id=$2', [nextStatus, row.id]);
      await audit(req.admin.id, 'toggle_photo_card_code', 'photo_card_codes', row.id, req.body.reason || 'تغییر وضعیت کد دستی', { from: row.status, to: nextStatus, code: row.code });
      res.json({
        message: nextStatus === 'voided' ? `کد ${row.code} با موفقیت غیرفعال (باطل) شد` : `کد ${row.code} با موفقیت فعال (آماده مصرف) شد`,
        code: row.code,
        status: nextStatus,
        id: row.id,
        cardName: row.card_type_name,
        batchLabel: row.batch_label,
      });
    }),
  );

  router.patch(
    '/admin/photo-cards/codes/:id/void',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      // فقط کدِ آزاد باطل می‌شود. کدِ مصرف‌شده را نمی‌شود پس گرفت (امتیازش
      // داده شده) و کدِ رزروشده در صف بررسی است؛ باطل کردنش یعنی پروندهٔ
      // آن کاربر بی‌سروصدا خراب می‌شود.
      const { rows } = await pool.query(
        `UPDATE photo_card_codes SET status='voided', updated_at=NOW()
          WHERE id=$1 AND status='unused' RETURNING id, code`,
        [req.params.id],
      );
      if (!rows[0]) {
        return res.status(409).json({
          message: 'فقط کدهای آزاد قابل ابطال‌اند',
        });
      }
      await audit(req.admin.id, 'void_photo_card_code', 'photo_card_codes',
        rows[0].id, req.body.reason || 'ابطال دستی', {});
      res.json(rows[0]);
    }),
  );

  /**
   * ویرایشِ یک کد.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * چرا فقط کدِ دست‌نخورده قابل ویرایش است
   * ═══════════════════════════════════════════════════════════════════════
   *
   * کدِ `used` قبلاً امتیاز داده و در اینونتوریِ کاربر نشسته. عوض کردنِ
   * رشته‌اش یعنی سابقه دروغ می‌شود: کاربر کارتی دارد که کدش دیگر آن
   * نیست. کدِ `reserved` هم وسطِ یک پروندهٔ در جریان است.
   *
   * پس فقط `unused` و `voided`.
   */
  router.patch(
    '/admin/photo-cards/codes/:id',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const cur = await pool.query(
        'SELECT id, code, status FROM photo_card_codes WHERE id=$1',
        [req.params.id],
      );
      if (!cur.rows[0]) return res.status(404).json({ message: 'کد پیدا نشد' });
      if (!['unused', 'voided'].includes(cur.rows[0].status)) {
        return res.status(409).json({
          message: cur.rows[0].status === 'used'
            ? 'این کد استفاده شده و قابل ویرایش نیست'
            : 'این کد در حال بررسی است و قابل ویرایش نیست',
        });
      }

      const fields = [];
      const params = [];

      if (req.body.code !== undefined) {
        const code = photoCards.normalizePhotoCode(req.body.code);
        if (!photoCards.isValidPhotoCode(code)) {
          return res.status(400).json({ message: 'قالب کد معتبر نیست' });
        }
        // برخورد روی `code_fold` سنجیده می‌شود نه رشتهٔ خام: دو کدی که
        // فقط در O/0 فرق دارند روی کارتِ چاپی یکسان دیده می‌شوند.
        const clash = await pool.query(
          'SELECT id FROM photo_card_codes WHERE code_fold=$1 AND id<>$2',
          [photoCards.foldPhotoCode(code), req.params.id],
        );
        if (clash.rows[0]) {
          return res.status(409).json({
            message: 'کد دیگری با همین حروف در سیستم هست',
          });
        }
        params.push(code);
        fields.push(`code = $${params.length}`);
      }

      if (req.body.batchLabel !== undefined) {
        const lbl = String(req.body.batchLabel || '').trim().slice(0, 80);
        params.push(lbl || null);
        fields.push(`batch_label = $${params.length}`);
      }

      // بازگرداندنِ کدِ باطل به چرخه — اشتباهِ ابطال قابل جبران باشد.
      if (req.body.status !== undefined) {
        const st = String(req.body.status);
        if (!['unused', 'voided'].includes(st)) {
          return res.status(400).json({ message: 'وضعیت معتبر نیست' });
        }
        params.push(st);
        fields.push(`status = $${params.length}`);
      }

      if (!fields.length) {
        return res.status(400).json({ message: 'چیزی برای تغییر نفرستادید' });
      }

      params.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE photo_card_codes SET ${fields.join(', ')}, updated_at=NOW()
          WHERE id=$${params.length}
        RETURNING id, code, status, batch_label`,
        params,
      );
      await audit(req.admin.id, 'edit_photo_card_code', 'photo_card_codes',
        rows[0].id, null, { from: cur.rows[0].code, to: rows[0].code });
      res.json(rows[0]);
    }),
  );


  /**
   * تخصیصِ گروهیِ نوعِ کارت به کدهای موجود.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * چرا این مسیر لازم است
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ثبتِ اولیه می‌تواند `cardTypeId` بگیرد، ولی دو حالت واقعی هست که
   * بدون این مسیر بن‌بست‌اند:
   *
   *   ۱. مدیر ۱۰۰۰ کد را بدون نوع وارد کرده و بعد یادش افتاده. بدون
   *      این مسیر باید همه را حذف و دوباره وارد کند — و کدهایی که
   *      قبلاً چاپ شده‌اند دیگر قابلِ حذف نیستند.
   *
   *   ۲. یک دستهٔ قدیمی که حالا می‌داند مالِ کدام کارت است.
   *
   * روی `batch_label` کار می‌کند نه فهرستِ شناسه‌ها: مدیر با «دستهٔ
   * تیرماه» فکر می‌کند، نه با ۱۰۰۰ تا UUID.
   *
   * ⚠️ فقط کدهای `unused` تغییر می‌کنند. کدی که مصرف شده یعنی کاربری
   *    بابتش کارت گرفته؛ عوض کردنِ نوعش تاریخچه را دروغ می‌کند بدون
   *    اینکه چیزی در اینونتوریِ او عوض شود.
   */
  router.post(
    '/admin/photo-cards/codes/assign-type',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      const label = String(req.body.batchLabel || '').trim();
      const typeId = String(req.body.cardTypeId || '').trim() || null;

      if (!label) {
        // بدونِ برچسب، این درخواست یعنی «همهٔ کدهای بانک» — که تقریباً
        // همیشه اشتباه است و برگرداندنش ناممکن.
        return res.status(400).json({
          message: 'برچسب دسته را مشخص کنید. بدون آن، این عملیات همهٔ '
            + 'کدهای بانک را تغییر می‌داد.' });
      }

      let typeName = null;
      if (typeId) {
        if (!UUID_RE.test(typeId)) {
          return res.status(400).json({ message: 'شناسهٔ نوع کارت معتبر نیست' });
        }
        const t = await pool.query(
          'SELECT id, name, is_active FROM card_types WHERE id=$1', [typeId]);
        if (!t.rows[0]) {
          return res.status(404).json({ message: 'نوع کارت یافت نشد' });
        }
        if (!t.rows[0].is_active) {
          return res.status(400).json({
            message: `نوع کارت «${t.rows[0].name}» غیرفعال است` });
        }
        typeName = t.rows[0].name;
      }
      // typeId === null یعنی «گره را باز کن» — کدها به حالتِ بی‌نام
      // برمی‌گردند و دوباره با تشخیصِ تصویر کار می‌کنند.

      const { rows } = await pool.query(
        `UPDATE photo_card_codes
            SET expected_card_type_id = $1, updated_at = NOW()
          WHERE batch_label = $2 AND status = 'unused'
        RETURNING id`,
        [typeId, label],
      );

      // چند کد به‌خاطرِ مصرف‌شدن دست‌نخورده ماندند؟ سکوت اینجا یعنی
      // مدیر فکر می‌کند همه عوض شدند.
      const skipped = await pool.query(
        `SELECT count(*)::int AS n FROM photo_card_codes
          WHERE batch_label = $1 AND status <> 'unused'`,
        [label],
      );

      await audit(req.admin.id, 'assign_photo_code_type', 'photo_card_codes',
        null, null, { batchLabel: label, cardTypeId: typeId,
          updated: rows.length, skipped: skipped.rows[0].n });

      res.json({
        updated: rows.length,
        skipped: skipped.rows[0].n,
        cardTypeName: typeName,
        message: typeId
          ? `${rows.length.toLocaleString('en-US')} کد به کارت «${typeName}» گره خورد`
            + (skipped.rows[0].n
              ? ` — ${skipped.rows[0].n} کد چون مصرف شده بود تغییر نکرد` : '')
          : `${rows.length.toLocaleString('en-US')} کد به حالت بدون کارت برگشت`,
      });
    }),
  );

  /**
   * حذفِ کد.
   *
   * حذفِ واقعی و نه «باطل کردن»، چون مالک خواست بتواند فهرست را تمیز
   * کند. ولی همان محدودیت: کدِ مصرف‌شده حذف نمی‌شود.
   *
   * دلیلش صرفاً سابقه نیست — `photo_card_submissions.code_id` به این
   * ردیف اشاره دارد. حذفش تاریخچهٔ ثبتِ کاربر را بی‌معنی می‌کند
   * (`ON DELETE SET NULL`) و بعداً معلوم نیست آن کارت با چه کدی آمده.
   */
  router.delete(
    '/admin/photo-cards/codes/:id',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const { rows } = await pool.query(
        `DELETE FROM photo_card_codes
          WHERE id=$1 AND status IN ('unused','voided')
        RETURNING id, code`,
        [req.params.id],
      );
      if (!rows[0]) {
        const ex = await pool.query(
          'SELECT status FROM photo_card_codes WHERE id=$1', [req.params.id]);
        return res.status(ex.rows[0] ? 409 : 404).json({
          message: ex.rows[0]
            ? 'کدهای استفاده‌شده یا در حال بررسی حذف نمی‌شوند'
            : 'کد پیدا نشد',
        });
      }
      await audit(req.admin.id, 'delete_photo_card_code', 'photo_card_codes',
        rows[0].id, req.body?.reason || null, { code: rows[0].code });
      res.json({ ok: true, code: rows[0].code });
    }),
  );

  /**
   * حذفِ دسته‌ایِ کدهای یک دسته.
   *
   * وقتی مدیر ۱۵ هزار کد را اشتباه وارد کرده، حذفِ تک‌تک عملی نیست.
   * فقط کدهای دست‌نخورده حذف می‌شوند و تعدادِ باقی‌مانده گزارش می‌شود،
   * تا مدیر بداند چند تا به‌خاطر استفاده‌شدن ماندند.
   */
  router.post(
    '/admin/photo-cards/codes/bulk-delete',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      const label = String(req.body.batchLabel || '').trim();
      if (!label) {
        return res.status(400).json({ message: 'برچسب دسته را مشخص کنید' });
      }
      const del = await pool.query(
        `DELETE FROM photo_card_codes
          WHERE batch_label=$1 AND status IN ('unused','voided')
        RETURNING id`,
        [label],
      );
      const left = await pool.query(
        `SELECT count(*)::int AS n FROM photo_card_codes WHERE batch_label=$1`,
        [label],
      );
      await audit(req.admin.id, 'bulk_delete_photo_card_codes',
        'photo_card_codes', null, null,
        { batchLabel: label, deleted: del.rowCount, kept: left.rows[0].n });
      res.json({
        deletedCount: del.rowCount,
        keptCount: left.rows[0].n,
        message: `${del.rowCount.toLocaleString('en-US')} کد حذف شد`
          + (left.rows[0].n
            ? ` · ${left.rows[0].n.toLocaleString('en-US')} کد به‌دلیل استفاده باقی ماند`
            : ''),
      });
    }),
  );

  /** فهرست کدها برای بازبینی و جست‌وجو. */
  router.get(
    '/admin/photo-cards/codes',
    adminAuth,
    asyncHandler(async (req, res) => {
      const where = [];
      const params = [];
      if (['unused', 'reserved', 'used', 'voided'].includes(req.query.status)) {
        params.push(req.query.status);
        where.push(`c.status = $${params.length}`);
      }
      if (req.query.q) {
        params.push(`%${photoCards.normalizePhotoCode(req.query.q)}%`);
        where.push(`c.code::text ILIKE $${params.length}`);
      }
      const { rows } = await pool.query(
        `SELECT c.id, c.code, c.status, c.batch_label, c.created_at, c.used_at,
                u.mobile AS used_by_mobile, t.name AS card_type_name,
                -- نوعِ کارتی که کد از پیش به آن گره خورده. با
                -- card_type_name فرق دارد: آن نتیجهٔ تطبیقِ تصویر بعد
                -- از مصرف است، این تصمیمِ مدیر پیش از توزیع.
                c.expected_card_type_id,
                et.name AS expected_card_type_name
           FROM photo_card_codes c
           LEFT JOIN users u ON u.id = c.used_by_user_id
           LEFT JOIN photo_card_designs d ON d.id = c.bound_design_id
           LEFT JOIN card_types t ON t.id = d.card_type_id
           LEFT JOIN card_types et ON et.id = c.expected_card_type_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY c.created_at DESC
          LIMIT 300`,
        params,
      );
      res.json({ codes: rows });
    }),
  );

  /**
   * فهرستِ سبکِ طرح‌های فعال — برای انتخابِ دستیِ مدیر در صف بررسی.
   *
   * چرا جدا از `/designs`: آن مسیر شمارشِ مصرف و آمار هم می‌آورد که
   * برای یک منوی انتخاب اضافی است. اینجا فقط چیزی که برای تصمیم لازم
   * است برمی‌گردد، پس منو روی موبایل هم سریع باز می‌شود.
   */
  router.get('/admin/photo-cards/designs/options', adminAuth,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT option.id, option.image_url, option.card_type_id,
                option.card_type_name, option.point_value
           FROM (
             SELECT DISTINCT ON (t.id)
                    d.id, d.image_url, t.id AS card_type_id,
                    t.name AS card_type_name, t.point_value
               FROM photo_card_designs d
               JOIN card_types t ON t.id = d.card_type_id
              WHERE d.is_active = true AND t.is_active = true
              ORDER BY t.id,
                       CASE d.side WHEN 'front' THEN 0 WHEN 'back' THEN 1 ELSE 2 END,
                       d.created_at
           ) option
          ORDER BY option.card_type_name`,
      );
      res.json({ options: rows });
    }));

  /** خروجی CSV برای چاپخانه. */
  router.get(
    '/admin/photo-cards/codes/export',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      const label = req.query.batchLabel ? String(req.query.batchLabel) : null;
      const { rows } = await pool.query(
        `SELECT c.code, c.status, c.batch_label, c.created_at,
                et.name AS expected_card_type_name
           FROM photo_card_codes c
           LEFT JOIN card_types et ON et.id = c.expected_card_type_id
          WHERE ($1::text IS NULL OR c.batch_label = $1)
          ORDER BY c.created_at, c.code`,
        [label],
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="photo-card-codes.csv"');
      // BOM تا اکسل فارسی را درست باز کند — بدون آن ستون‌ها به‌هم می‌ریزند.
      res.write('\uFEFF');
      // ستونِ کارت اضافه شد: چاپخانه باید بداند هر کد روی کدام کارت
      // چاپ شود، وگرنه کلِ هدفِ «کدِ نام‌دار» از بین می‌رود.
      res.write('code,status,batch,card\n');
      for (const r of rows) {
        // نامِ کارت ممکن است کاما داشته باشد و ستون‌ها را جابه‌جا کند.
        const card = String(r.expected_card_type_name || '').replace(/"/g, '""');
        res.write(`${r.code},${r.status},${r.batch_label || ''},"${card}"\n`);
      }
      res.end();
    }),
  );

  // ═════════════════════════════════════════════════════════════════════════
  // مدیریت — صف بررسی
  // ═════════════════════════════════════════════════════════════════════════

};
