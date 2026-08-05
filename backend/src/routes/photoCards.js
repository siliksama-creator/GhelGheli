/**
 * مسیرهای «ثبت کارت از طریق عکس».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا فایل جدا و نه داخل server.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `server.js` حدود ۲۸۰۰ خط است و مسیر «ثبت کد کارت» فعلی داخلش روی پول
 * واقعی کار می‌کند. خواستهٔ صریح مالک «بدون هیچ تغییری در بخش‌های قبلی»
 * بود. با یک ماژول جدا، تنها ردِ پای این قابلیت در server.js **یک خط**
 * ثبت روتر است — پس هیچ کدِ موجودی جابه‌جا یا بازنویسی نمی‌شود و
 * `git diff` هم همین را نشان می‌دهد.
 *
 * وابستگی‌ها به‌صورت پارامتر تزریق می‌شوند (نه import مستقیم) چون
 * `pool`، `auth`، `adminAuth` و بقیه در server.js ساخته می‌شوند و
 * جابه‌جا کردنشان یعنی دست زدن به چیزی که کار می‌کند.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const fpEngine = require('../services/imageFingerprint');
const photoCards = require('../services/photoCardService');

// حداکثر کدی که در یک نوبت ساخته می‌شود.
//
// ۱۵٬۰۰۰ خواستهٔ مالک است و در یک درخواست ساخته می‌شود. سقف ۲۰٬۰۰۰ حاشیهٔ
// اطمینان می‌دهد بدون اینکه یک درخواست اشتباهی (مثلاً ۱۰ میلیون) سرور را
// از پا در بیاورد. مالک می‌تواند چند بار صدا بزند؛ مجموع سقفی ندارد.
const MAX_BATCH = 20000;

// آستانهٔ «این دو طرح عملاً یکی‌اند».
//
// عمداً بالاتر از آستانهٔ تأیید (۰.۶۸) است: دو کارتِ واقعاً متفاوت از یک
// سری ممکن است ۰.۷ شباهت داشته باشند و آن‌ها مشکلی ندارند. چیزی که
// مشکل می‌سازد دو نسخهٔ تقریباً یکسان است — آنجا موتور نمی‌تواند بین
// دوتاشان انتخاب کند و همه‌چیز به بررسی دستی می‌افتد.
const DUPLICATE_SIMILARITY = 0.93;

module.exports = function createPhotoCardRoutes(deps) {
  const {
    pool, auth, adminAuth, requireRole, asyncHandler,
    imageUpload, audit, createNotification, addLeaguePoints,
    pass, io, getLeaderboard, optimizeUpload, UUID_RE,
  } = deps;

  const router = express.Router();

  // ── محدودکنندهٔ نرخ ──
  //
  // ثبت با عکس گران‌تر از ثبت با کد است: هر درخواست یک تصویر را رمزگشایی
  // و سه اثر انگشت می‌سازد (~۲۰ms CPU) روی سروری با ۲ هسته که بازی‌های
  // هم‌زمان هم رویش است. بدون سقف، یک کاربر می‌تواند با ارسال پشت‌سرهم
  // کل CPU را بگیرد.
  //
  // ۲۰ در ساعت سخاوتمندانه است: کاربر واقعی چند کارت در روز ثبت می‌کند.
  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'تعداد تلاش‌ها زیاد بود. کمی بعد دوباره امتحان کنید.' },
  });

  /** آرایهٔ REAL دیتابیس ممکن است رشته برگردد؛ همیشه به عدد تبدیل کن. */
  const toFloats = v => (Array.isArray(v) ? v.map(Number) : []);

  /** ردیف دیتابیس → شکلی که موتور تطبیق می‌فهمد. */
  const rowToFp = r => ({
    id: r.id,
    card_type_id: r.card_type_id,
    image_url: r.image_url,
    dhash: r.dhash,
    phash: r.phash,
    colorSig: toFloats(r.color_sig),
    width: r.width,
    height: r.height,
  });

  /**
   * فایل موقت را پاک می‌کند.
   *
   * خواستهٔ مالک: «عکس خود کاربر ذخیره نشود». در مسیر تأیید خودکار عکس
   * هرگز ماندگار نمی‌شود؛ فقط وقتی پرونده به صف بررسی می‌رود موقتاً
   * می‌ماند تا مدیر ببیند، و بعد از تعیین تکلیف پاک می‌شود.
   *
   * خطا بلعیده می‌شود: اگر فایل قبلاً پاک شده یا دیسک مشکل دارد، نباید
   * درخواستی که از نظر کاربر موفق بوده با خطا برگردد.
   */
  const safeUnlink = (p) => {
    if (!p) return;
    fs.promises.unlink(p).catch(() => {});
  };

  // ═════════════════════════════════════════════════════════════════════════
  // مدیریت — طرح‌ها
  // ═════════════════════════════════════════════════════════════════════════

  router.get('/admin/photo-cards/designs', adminAuth, asyncHandler(async (req, res) => {
    // اثر انگشت‌ها عمداً برگردانده نمی‌شوند: چند کیلوبایت باینری به‌ازای
    // هر طرح که رابط کاربری هیچ استفاده‌ای از آن ندارد.
    const { rows } = await pool.query(
      `SELECT d.id, d.image_url, d.width, d.height, d.is_active, d.created_at,
              t.id AS card_type_id, t.name AS card_type_name,
              t.point_value, t.cash_amount,
              (SELECT count(*)::int FROM photo_card_codes c
                WHERE c.bound_design_id = d.id AND c.status = 'used') AS redeemed_count
         FROM photo_card_designs d
         JOIN card_types t ON t.id = d.card_type_id
        ORDER BY d.created_at DESC
        LIMIT 300`,
    );
    res.json({ designs: rows });
  }));

  /**
   * آپلود «عکس خام» + تعیین امتیاز.
   *
   * امتیاز روی `card_types.point_value` می‌نشیند نه روی خود طرح. دلیل:
   * اگر طرح امتیاز جدا داشت، یک کارت از راه کد یک امتیاز می‌داد و از راه
   * عکس امتیاز دیگری — و کاربر حق داشت شکایت کند.
   */
  router.post(
    '/admin/photo-cards/designs',
    adminAuth, requireRole('support'),
    imageUpload.single('image'),
    asyncHandler(async (req, res) => {
      if (!req.file) return res.status(400).json({ message: 'تصویری فرستاده نشد' });

      let filePath = req.file.path;
      let filename = req.file.filename;
      try {
        const name = String(req.body.name || '').trim();
        const points = Math.max(0, Math.floor(Number(req.body.pointValue || 0)));
        const cash = Math.max(0, Math.floor(Number(req.body.cashAmount || 0)));
        const existingTypeId = req.body.cardTypeId;

        if (!name && !existingTypeId) {
          return res.status(400).json({ message: 'نام کارت را وارد کنید' });
        }

        // ── اثر انگشت از فایل **اصلی** گرفته می‌شود، قبل از بهینه‌سازی ──
        //
        // اگر بعد از فشرده‌سازی گرفته می‌شد، اثر انگشتِ طرح به نسخهٔ
        // فشرده‌شده گره می‌خورد. آن هم کار می‌کرد، ولی کیفیت بالاتر
        // یعنی اثر انگشت دقیق‌تر و طرح تمیزتر برای مقایسه.
        const buf = await fs.promises.readFile(filePath);
        const fp = await fpEngine.fingerprint(buf);

        // ── طرحِ تکراری را همین‌جا بگیر ──
        //
        // این در تست واقعی پیدا شد، نه با حدس: بعد از چند بار اجرای
        // تست سرتاسری، دو نسخهٔ **یکسان** از یک طرح در کاتالوگ نشست
        // (شباهت ۱.۰۰۰۰). از آن لحظه هر عکسِ آن کارت به صف بررسی
        // می‌رفت به‌جای تأیید خودکار — چون شرطِ «حاشیه تا رتبهٔ دوم»
        // درست تشخیص می‌داد که نمی‌شود بین دو طرحِ یکسان یکی را
        // انتخاب کرد.
        //
        // یعنی یک اشتباهِ سادهٔ مدیر (دوبار آپلود کردن یک عکس) بی‌سروصدا
        // کل مسیر خودکار را برای آن کارت خاموش می‌کرد و بار دستی
        // می‌ساخت. هیچ پیام خطایی هم در کار نبود.
        //
        // پس جلوش را در لحظهٔ آپلود می‌گیریم، جایی که مدیر می‌تواند
        // بفهمد چه شده. اگر واقعاً قصدش جایگزینی است، اول طرح قبلی را
        // غیرفعال کند.
        const existing = await pool.query(
          `SELECT d.id, d.dhash, d.phash, d.color_sig, t.name
             FROM photo_card_designs d
             JOIN card_types t ON t.id = d.card_type_id
            WHERE d.is_active = true`,
        );
        for (const row of existing.rows) {
          const sim = fpEngine.similarity(fp, {
            dhash: row.dhash, phash: row.phash, colorSig: toFloats(row.color_sig),
          });
          if (sim >= DUPLICATE_SIMILARITY) {
            return res.status(409).json({
              message: `این تصویر با طرحِ «${row.name}» تقریباً یکسان است `
                + `(${Math.round(sim * 100)}٪ شباهت). دو طرحِ همسان باعث می‌شوند `
                + 'سیستم نتواند بینشان تشخیص دهد و همهٔ ثبت‌ها به بررسی دستی بروند. '
                + 'اگر می‌خواهید جایگزین کنید، اول طرح قبلی را غیرفعال کنید.',
              duplicateOf: row.id,
              similarity: Number(sim.toFixed(3)),
            });
          }
        }

        // بهینه‌سازی همان تابعی است که بقیهٔ آپلودها استفاده می‌کنند، پس
        // رفتار ذخیره‌سازی یکسان می‌ماند.
        const opt = await optimizeUpload(req.file);
        filename = opt.filename;
        filePath = path.join(path.dirname(req.file.path), filename);
        const imageUrl = `/uploads/images/${filename}`;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          let cardTypeId = existingTypeId;
          if (cardTypeId) {
            if (!UUID_RE.test(String(cardTypeId))) {
              throw Object.assign(new Error('نوع کارت معتبر نیست'), { status: 400 });
            }
            const ok = await client.query('SELECT id FROM card_types WHERE id=$1', [cardTypeId]);
            if (!ok.rows[0]) {
              throw Object.assign(new Error('نوع کارت پیدا نشد'), { status: 404 });
            }
            // امتیاز فقط وقتی به‌روز می‌شود که مدیر صریحاً فرستاده باشد.
            if (req.body.pointValue !== undefined) {
              await client.query(
                'UPDATE card_types SET point_value=$1, updated_at=NOW() WHERE id=$2',
                [points, cardTypeId],
              );
            }
          } else {
            // نوع کارت تازه در همان کاتالوگ موجود ساخته می‌شود، پس
            // اینونتوری و جوایز پلکانی بدون هیچ تغییری کار می‌کنند.
            const ins = await client.query(
              `INSERT INTO card_types(name, image_url, point_value, cash_amount, is_active)
               VALUES($1, $2, $3, $4, true) RETURNING id`,
              [name, imageUrl, points, cash],
            );
            cardTypeId = ins.rows[0].id;
          }

          const d = await client.query(
            `INSERT INTO photo_card_designs
               (card_type_id, image_url, dhash, phash, color_sig, width, height, created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id, image_url, width, height, created_at`,
            [cardTypeId, imageUrl, fp.dhash, fp.phash, fp.colorSig,
              fp.width, fp.height, req.admin.id],
          );

          await client.query('COMMIT');

          await audit(req.admin.id, 'create_photo_card_design', 'photo_card_designs',
            d.rows[0].id, null, { name, points, cash, imageUrl });

          res.json({
            design: d.rows[0],
            cardTypeId,
            message: 'طرح ثبت شد و اثر انگشت تصویر ساخته شد',
          });
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      } catch (e) {
        // آپلود ناموفق نباید فایل یتیم روی دیسک بگذارد.
        safeUnlink(filePath);
        throw e;
      }
    }),
  );

  router.patch(
    '/admin/photo-cards/designs/:id',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const active = req.body.isActive === true || req.body.isActive === 'true';
      const { rows } = await pool.query(
        `UPDATE photo_card_designs SET is_active=$1, updated_at=NOW()
          WHERE id=$2 RETURNING id, is_active`,
        [active, req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ message: 'طرح پیدا نشد' });
      await audit(req.admin.id, 'toggle_photo_card_design', 'photo_card_designs',
        rows[0].id, null, { isActive: active });
      res.json(rows[0]);
    }),
  );

  // ═════════════════════════════════════════════════════════════════════════
  // مدیریت — بانک کد
  // ═════════════════════════════════════════════════════════════════════════

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
      const input = raw.split(/[\n,;\t، ]+/)
        .map(c => photoCards.normalizePhotoCode(c))
        .filter(Boolean);

      if (!input.length) {
        return res.status(400).json({ message: 'هیچ کدی وارد نشده است' });
      }
      if (input.length > MAX_BATCH) {
        return res.status(400).json({
          message: `در هر نوبت حداکثر ${MAX_BATCH.toLocaleString('en-US')} کد `
            + `قابل ثبت است؛ شما ${input.length.toLocaleString('en-US')} کد فرستادید. `
            + 'بقیه را در نوبت بعد اضافه کنید — برای مجموع کدها سقفی نیست.',
        });
      }

      const label = String(req.body.batchLabel || '').trim().slice(0, 80) || null;

      const seen = new Set();
      const duplicateInFile = [];
      const invalid = [];
      const candidates = [];
      for (const c of input) {
        if (!photoCards.isValidPhotoCode(c)) { invalid.push(c); continue; }
        if (seen.has(c)) { duplicateInFile.push(c); continue; }
        seen.add(c);
        candidates.push(c);
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
        const r = await pool.query(
          `INSERT INTO photo_card_codes(code, batch_label)
           SELECT unnest($1::citext[]), $2
           ON CONFLICT (code) DO NOTHING
           RETURNING code`,
          [candidates, label],
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
        message: `${inserted.length.toLocaleString('en-US')} کد ثبت شد`,
      });
    }),
  );

  /** ابطال یک کد پیش از آنکه کسی مصرفش کند. */
  router.patch(
    '/admin/photo-cards/codes/:id/void',
    adminAuth, requireRole('support'),
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
                u.mobile AS used_by_mobile, t.name AS card_type_name
           FROM photo_card_codes c
           LEFT JOIN users u ON u.id = c.used_by_user_id
           LEFT JOIN photo_card_designs d ON d.id = c.bound_design_id
           LEFT JOIN card_types t ON t.id = d.card_type_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY c.created_at DESC
          LIMIT 300`,
        params,
      );
      res.json({ codes: rows });
    }),
  );

  /** خروجی CSV برای چاپخانه. */
  router.get(
    '/admin/photo-cards/codes/export',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      const label = req.query.batchLabel ? String(req.query.batchLabel) : null;
      const { rows } = await pool.query(
        `SELECT code, status, batch_label, created_at
           FROM photo_card_codes
          WHERE ($1::text IS NULL OR batch_label = $1)
          ORDER BY created_at, code`,
        [label],
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="photo-card-codes.csv"');
      // BOM تا اکسل فارسی را درست باز کند — بدون آن ستون‌ها به‌هم می‌ریزند.
      res.write('\uFEFF');
      res.write('code,status,batch\n');
      for (const r of rows) {
        res.write(`${r.code},${r.status},${r.batch_label || ''}\n`);
      }
      res.end();
    }),
  );

  // ═════════════════════════════════════════════════════════════════════════
  // مدیریت — صف بررسی
  // ═════════════════════════════════════════════════════════════════════════

  router.get('/admin/photo-cards/submissions', adminAuth, asyncHandler(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
      ? req.query.status : 'pending';
    const { rows } = await pool.query(
      `SELECT s.id, s.match_score, s.match_margin, s.status, s.created_at,
              s.user_image_path, s.reject_reason,
              u.nickname, u.mobile,
              c.code,
              d.image_url AS design_image, t.name AS card_type_name, t.point_value
         FROM photo_card_submissions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN photo_card_codes c ON c.id = s.code_id
         LEFT JOIN photo_card_designs d ON d.id = s.matched_design_id
         LEFT JOIN card_types t ON t.id = d.card_type_id
        WHERE s.status = $1
        ORDER BY s.created_at DESC
        LIMIT 200`,
      [status],
    );
    res.json({
      submissions: rows.map(r => ({
        ...r,
        // مسیر مطلق دیسک هرگز به کلاینت نمی‌رود؛ فقط URL عمومی.
        user_image_path: undefined,
        userImageUrl: r.user_image_path
          ? `/uploads/images/${path.basename(r.user_image_path)}` : null,
      })),
    });
  }));

  router.post(
    '/admin/photo-cards/submissions/:id/decide',
    adminAuth, requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const approve = req.body.approve === true || req.body.approve === 'true';
      const reason = String(req.body.reason || '').trim().slice(0, 500);

      const client = await pool.connect();
      let imagePathToDelete = null;
      let payload = null;
      let userId = null;
      try {
        await client.query('BEGIN');
        const s = await client.query(
          `SELECT * FROM photo_card_submissions WHERE id=$1 FOR UPDATE`,
          [req.params.id],
        );
        const sub = s.rows[0];
        if (!sub) throw Object.assign(new Error('پرونده پیدا نشد'), { status: 404 });
        if (sub.status !== 'pending') {
          throw Object.assign(new Error('این پرونده قبلاً بررسی شده است'), { status: 409 });
        }
        userId = sub.user_id;
        imagePathToDelete = sub.user_image_path;

        if (approve) {
          if (!sub.matched_design_id || !sub.code_id) {
            throw Object.assign(new Error('این پرونده طرح یا کد مشخصی ندارد'), { status: 400 });
          }
          const d = await client.query(
            'SELECT id, card_type_id, image_url FROM photo_card_designs WHERE id=$1',
            [sub.matched_design_id],
          );
          if (!d.rows[0]) throw Object.assign(new Error('طرح پیدا نشد'), { status: 404 });

          payload = await photoCards.creditSubmission(client, {
            userId: sub.user_id,
            codeId: sub.code_id,
            design: d.rows[0],
            adminId: req.admin.id,
          });
          if (payload.points > 0) {
            await addLeaguePoints(client, sub.user_id, payload.points);
          }
        } else {
          // رد شد: کد آزاد می‌شود تا هدر نرود. کاربر ممکن است با عکس
          // بهتر دوباره تلاش کند، یا کد واقعاً مالِ کس دیگری باشد.
          if (sub.code_id) {
            await client.query(
              `UPDATE photo_card_codes SET status='unused', updated_at=NOW()
                WHERE id=$1 AND status='reserved'`,
              [sub.code_id],
            );
          }
        }

        await client.query(
          `UPDATE photo_card_submissions
              SET status=$1, reject_reason=$2, reviewed_by=$3, reviewed_at=NOW(),
                  user_image_path=NULL
            WHERE id=$4`,
          [approve ? 'approved' : 'rejected', approve ? null : reason,
            req.admin.id, req.params.id],
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      // ── عکس کاربر پاک می‌شود ──
      // خواستهٔ مالک: «عکس خود کاربر ذخیره نشود». حالا که تکلیف روشن
      // شده، دلیلی برای نگه داشتنش نیست.
      safeUnlink(imagePathToDelete);

      await audit(req.admin.id, approve ? 'approve_photo_card' : 'reject_photo_card',
        'photo_card_submissions', req.params.id, reason || null, {});

      if (approve && payload) {
        createNotification(userId, 'card',
          'کارت شما تأیید شد ✅',
          `کارت «${payload.cardTypeName}» به مجموعهٔ شما اضافه شد`
          + (payload.points ? ` و ${payload.points} امتیاز گرفتید.` : '.'),
        ).catch(() => {});
        pass.grantXp(userId, 'card_redeem').catch(() => {});
        getLeaderboard(20).then(l => io.emit('leaderboard:update', l)).catch(() => {});
      } else if (!approve) {
        createNotification(userId, 'card',
          'کارت شما تأیید نشد',
          reason || 'عکس ارسالی با هیچ کارتی مطابقت نداشت. لطفاً عکس واضح‌تری بگیرید.',
        ).catch(() => {});
      }

      res.json({ ok: true, approved: approve });
    }),
  );

  // ═════════════════════════════════════════════════════════════════════════
  // کاربر — ثبت کارت با عکس
  // ═════════════════════════════════════════════════════════════════════════

  /** آیا این قابلیت اصلاً قابل استفاده است؟ کلاینت با این تصمیم می‌گیرد تب را نشان بدهد یا نه. */
  router.get('/photo-cards/status', auth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS designs FROM photo_card_designs WHERE is_active = true`,
    );
    const pending = await pool.query(
      `SELECT count(*)::int AS n FROM photo_card_submissions
        WHERE user_id=$1 AND status='pending'`, [req.user.id],
    );
    res.json({
      available: rows[0].designs > 0,
      designCount: rows[0].designs,
      pendingCount: pending.rows[0].n,
    });
  }));

  /**
   * ثبت کارت: عکس + کد.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * چرا هم عکس و هم کد لازم است
   * ═══════════════════════════════════════════════════════════════════════
   *
   * این قلبِ ضدتقلبِ این قابلیت است:
   *
   *   • فقط کد  → هر کس کد را بداند (از روی شانه، از عکسی در تلگرام)
   *     امتیاز می‌گیرد بدون داشتن کارت. این نقص سیستم فعلی است.
   *   • فقط عکس → کاربر یک بار کارت می‌خرد و بی‌نهایت بار همان عکس را
   *     می‌فرستد، یا عکس کارت دوستش را.
   *
   * با هم: عکس ثابت می‌کند کارت فیزیکی در دست است، کد ثابت می‌کند این
   * **نسخهٔ** خاص هنوز خرج نشده.
   *
   * چرا OCR اجباری نیست: روی عکس واقعیِ گوشی اندازه‌گیری شد و کار
   * نمی‌کند — کدِ چاپ‌شده روی عکسِ کاملِ کارت حتی در کیفیت عالی هم درست
   * خوانده نشد. تحمیل آن یعنی رد کردن کاربران درستکار. تایپ کردن کد
   * ۱۰۰٪ قابل اتکاست و بار امنیتی را عکس به دوش می‌کشد.
   */
  router.post(
    '/photo-cards/submit',
    auth, submitLimiter,
    imageUpload.single('image'),
    asyncHandler(async (req, res) => {
      if (!req.file) return res.status(400).json({ message: 'عکس کارت را بفرستید' });

      let filePath = req.file.path;
      let keepFile = false;
      try {
        const code = photoCards.normalizePhotoCode(req.body.code);
        if (!photoCards.isValidPhotoCode(code)) {
          return res.status(400).json({ message: 'کد کارت را درست وارد کنید' });
        }

        // ── ترتیب عمداً: اول کد، بعد تصویر ──
        //
        // بررسی کد ارزان است (یک ایندکس)، تحلیل تصویر گران (~۲۰ms CPU).
        // اگر کد از اول باطل است، دلیلی ندارد CPU خرج شود. این همان
        // چیزی است که یک مهاجم می‌خواست: فرستادن پشت‌سرهم تصویر بزرگ.
        const codeRow = await pool.query(
          `SELECT id, status FROM photo_card_codes WHERE code=$1`, [code],
        );
        if (!codeRow.rows[0]) {
          return res.status(404).json({ message: 'این کد در سیستم ثبت نشده است' });
        }
        if (codeRow.rows[0].status === 'used') {
          return res.status(409).json({ message: 'این کد قبلاً استفاده شده است' });
        }
        if (codeRow.rows[0].status === 'reserved') {
          return res.status(409).json({ message: 'این کد در حال بررسی است' });
        }
        if (codeRow.rows[0].status !== 'unused') {
          return res.status(409).json({ message: 'این کد معتبر نیست' });
        }
        const codeId = codeRow.rows[0].id;

        const designsRes = await pool.query(
          `SELECT id, card_type_id, image_url, dhash, phash, color_sig, width, height
             FROM photo_card_designs WHERE is_active = true`,
        );
        if (!designsRes.rows.length) {
          return res.status(503).json({ message: 'هنوز کارتی برای تطبیق ثبت نشده است' });
        }

        const buf = await fs.promises.readFile(filePath);
        const queryFp = await fpEngine.fingerprint(buf);
        const match = fpEngine.matchAgainst(queryFp, designsRes.rows.map(rowToFp));

        if (match.verdict === 'reject') {
          return res.status(422).json({
            message: 'عکس با هیچ‌کدام از کارت‌ها مطابقت نداشت. '
              + 'لطفاً کل کارت را در کادر بگیرید و از نور کافی مطمئن شوید.',
            matched: false,
          });
        }

        // ── مسیر مشکوک: صف بررسی ──
        if (match.verdict === 'review') {
          // کد رزرو می‌شود: نه آزاد (وگرنه نفر دوم خرجش می‌کند) و نه
          // مصرف‌شده (وگرنه اگر مدیر رد کند بی‌دلیل سوخته است).
          const upd = await pool.query(
            `UPDATE photo_card_codes SET status='reserved', updated_at=NOW()
              WHERE id=$1 AND status='unused' RETURNING id`,
            [codeId],
          );
          if (!upd.rows[0]) {
            return res.status(409).json({ message: 'این کد همین حالا توسط شخص دیگری ثبت شد' });
          }

          // فقط اینجا عکس کاربر می‌ماند — تا مدیر ببیند. بعد از تصمیم
          // پاک می‌شود.
          const opt = await optimizeUpload(req.file);
          const savedPath = path.join(path.dirname(req.file.path), opt.filename);
          keepFile = true;

          const sub = await pool.query(
            `INSERT INTO photo_card_submissions
               (user_id, code_id, matched_design_id, match_score, match_margin,
                user_image_path, status)
             VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
            [req.user.id, codeId, match.design.id, match.score, match.margin, savedPath],
          );

          return res.json({
            status: 'pending',
            submissionId: sub.rows[0].id,
            message: 'عکس شما برای بررسی ارسال شد. نتیجه را اطلاع می‌دهیم.',
          });
        }

        // ── مسیر تأیید خودکار ──
        const client = await pool.connect();
        let payload;
        try {
          await client.query('BEGIN');
          const design = designsRes.rows.find(d => d.id === match.design.id);
          payload = await photoCards.creditSubmission(client, {
            userId: req.user.id,
            codeId,
            design,
          });
          if (payload.points > 0) {
            await addLeaguePoints(client, req.user.id, payload.points);
          }
          await client.query(
            `INSERT INTO photo_card_submissions
               (user_id, code_id, matched_design_id, match_score, match_margin, status)
             VALUES($1,$2,$3,$4,$5,'approved')`,
            [req.user.id, codeId, match.design.id, match.score, match.margin],
          );
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }

        // عکس کاربر در این مسیر اصلاً ماندگار نمی‌شود.
        pass.grantXp(req.user.id, 'card_redeem').catch(() => {});
        if (payload.cash > 0) {
          createNotification(req.user.id, 'wallet',
            'جایزهٔ نقدی به کیف پول اضافه شد 💰',
            `${payload.cash.toLocaleString('en-US')} تومان بابت کارت «${payload.cardTypeName}» واریز شد.`,
          ).catch(() => {});
        }
        getLeaderboard(20).then(l => io.emit('leaderboard:update', l)).catch(() => {});

        const now = await pool.query(
          `SELECT current_points, lifetime_points, monthly_league_points, wallet_balance
             FROM users WHERE id=$1`, [req.user.id],
        );

        return res.json({
          status: 'approved',
          message: 'کارت با موفقیت ثبت شد',
          cardType: payload.cardTypeName,
          addedPoints: payload.points,
          addedCash: payload.cash,
          // تصویر باکیفیتِ مدیر — نه عکس کاربر.
          imageUrl: payload.imageUrl,
          matchScore: Number(match.score.toFixed(3)),
          points: now.rows[0],
          walletBalance: Number(now.rows[0].wallet_balance || 0),
        });
      } finally {
        if (!keepFile) safeUnlink(filePath);
      }
    }),
  );

  /** تاریخچهٔ ثبت‌های کاربر. */
  router.get('/photo-cards/my-submissions', auth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.status, s.created_at, s.reject_reason,
              d.image_url, t.name AS card_type_name, t.point_value
         FROM photo_card_submissions s
         LEFT JOIN photo_card_designs d ON d.id = s.matched_design_id
         LEFT JOIN card_types t ON t.id = d.card_type_id
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ submissions: rows });
  }));

  return router;
};
