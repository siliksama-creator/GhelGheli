/**
 * مسیرهای «ثبت کارت از طریق عکس».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا فایل جدا و نه داخل server.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * مسیر «ثبت کد کارت» قدیمی روی پول واقعی کار می‌کند و چرخهٔ مستقلی
 * دارد. این روتر، و زیرماژول‌های focused آن، قابلیت عکس را از آن چرخه
 * جدا نگه می‌دارند؛ اتصال به برنامه فقط از نقطهٔ mount در server.js است.
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
const cardIdentity = require('../services/cardIdentity');
const imageQuality = require('../services/imageQuality');
const cardDuel = require('../services/cardDuelService');
const cardCrop = require('../services/cardCrop');
const lockout = require('../services/photoCardLockout');
const { groupAdminCards } = require('../services/photoCardAdminGrouping');

// حداکثر کدی که در یک نوبت ساخته می‌شود.
//
// ۱۵٬۰۰۰ خواستهٔ مالک است و در یک درخواست ساخته می‌شود. سقف ۲۰٬۰۰۰ حاشیهٔ
// اطمینان می‌دهد بدون اینکه یک درخواست اشتباهی (مثلاً ۱۰ میلیون) سرور را
// از پا در بیاورد. مالک می‌تواند چند بار صدا بزند؛ مجموع سقفی ندارد.
const MAX_BATCH = 20000;

// آستانهٔ «این دو طرح عملاً یکی‌اند» — **فقط برای آپلودِ مدیر**.
//
// ⚠️ این را با «عکسِ تکراریِ کاربر» اشتباه نگیرید. آن محدودیت کاملاً
//    حذف شد (توضیحِ کاملش در مسیرِ `/photo-cards/submit`): کاربر حق
//    دارد یک عکس را با بی‌نهایت کدِ معتبر بفرستد، چون ده نسخهٔ یک کارت
//    واقعاً ده عکسِ یکسان دارند.
//
// این ثابت مسئلهٔ دیگری را حل می‌کند: اگر **مدیر** دو طرحِ تقریباً
// یکسان در کاتالوگ بگذارد، موتور نمی‌تواند بینشان انتخاب کند و شرطِ
// «حاشیه تا رتبهٔ دوم» همهٔ ثبت‌های آن کارت را به بررسیِ دستی می‌فرستد
// — بی‌سروصدا و بدون هیچ پیام خطایی.
//
// عمداً بالاتر از آستانهٔ تأیید است: دو کارتِ واقعاً متفاوت از یک سری
// ممکن است ۰.۷ شباهت داشته باشند و آن‌ها مشکلی ندارند.
const DUPLICATE_SIMILARITY = 0.93; // پیش‌فرض — مقدارِ مؤثر از matchSettings خوانده می‌شود
const matchSettings = require('../services/matchSettings');
const { parseFaNumber } = require('../lib/faNum');
// بعد از ثبتِ کارت (که امتیاز/سکهٔ لیگ می‌دهد) کشِ لیدربورد بی‌اعتبار و
// رویدادِ `leaderboard:update` پخش می‌شود تا بیننده‌های جدول بی‌درنگ
// تازه شوند — به‌جای poll ثابتِ کلاینت.
const leaderboardSignal = require('../services/leaderboardSignal');

module.exports = function createPhotoCardRoutes(deps) {
  const {
    pool, auth, adminAuth, requireRole, asyncHandler,
    imageUpload, audit, createNotification, addLeaguePoints, validateUuid,
    pass, io, getLeaderboard, optimizeUpload, verifyUpload, UUID_RE,
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
  // ── چرا کلید روی کاربر است و نه IP ──
  //
  // این بدترین جای ممکن برای کلیدِ IP بود. مسیر پشت `auth` است، پس
  // همیشه می‌دانیم کاربر کیست — ولی پیش‌فرضِ کتابخانه IP را می‌گرفت.
  //
  // در ایران اپراتورهای موبایل CGNAT دارند: صدها مشترک از یک IP عمومی
  // بیرون می‌آیند. یعنی سقفِ «۲۰ ثبت در ساعت» عملاً می‌شد «۲۰ ثبت در
  // ساعت برای کلِ مشترکینِ آن اپراتور». اولین کسی که ۲۰ کارت ثبت
  // می‌کرد، بقیه تا یک ساعت پیامِ «تعداد تلاش‌ها زیاد بود» می‌گرفتند
  // بدون اینکه حتی یک بار امتحان کرده باشند.
  //
  // بدتر اینکه سوءاستفاده‌کننده با خاموش/روشن کردنِ دیتا IP تازه
  // می‌گرفت و سطلش خالی می‌شد — پس محدودیت او را نمی‌گرفت و فقط
  // کاربرِ درستکار را می‌گرفت. دقیقاً برعکسِ هدف.
  //
  // این باگ در تستِ زنده خودش را نشان داد: `e2e_photorace` و بخشِ
  // «ورودی‌های خرابکارانه»ی `e2e_photoedge` هر بار ۴۲۹ می‌گرفتند و
  // اصلاً به منطقی که قرار بود آزمایش شود نمی‌رسیدند — یعنی این
  // محدودکننده داشت **تست‌ها را هم کور می‌کرد**، نه فقط کاربران را.
  //
  // `req.user?.id || req.ip`: اگر روزی این limiter اشتباهاً پیش از
  // `auth` سوار شود، به رفتار قبلی برمی‌گردیم نه به «بدون محدودیت».
  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip,
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
    // ── چرا این خط حیاتی است ──
    //
    // اگر `texSig` از دیتابیس خوانده نشود، `similarity` شرطِ `hasTex`
    // را رد می‌کند و به فرمولِ سه‌سیگناله می‌افتد — در حالی که
    // آستانه‌ها روی فرمولِ چهارسیگناله کالیبره شده‌اند. نتیجه‌اش
    // امتیازهای ناسازگار بود: یک کارت تأیید خودکار می‌گرفت و کارتِ
    // دیگر با همان کیفیتِ عکس به صف بررسی می‌رفت.
    texSig: toFloats(r.tex_sig),
    lumaSig: toFloats(r.luma_sig),
    // ⚠️ اگر این خط جا بیفتد، `hasRgb` همیشه false می‌شود و موتور به
    //    فرمولِ قدیمی برمی‌گردد — بی‌صدا و بدونِ هیچ خطایی. دقیقاً
    //    همان چیزی که یک بار با `texSig` رخ داد.
    rgbSig: toFloats(r.rgb_sig),
    // ⚠️ اگر این خط جا بیفتد، تطبیقِ متنی بی‌صدا خاموش می‌شود و موتور
    //    فقط به تصویر تکیه می‌کند — همان باگی که دو بار با texSig و
    //    rgbSig رخ داد. نگهبانِ `testFingerprintWiring` می‌گیردش.
    textTokens: Array.isArray(r.text_tokens) ? r.text_tokens : [],
    // واژه‌نامهٔ بازیکن (از card_types) برای «نام‌خوان» و شمارهٔ پیراهن.
    playerLexemes: Array.isArray(r.player_lexemes) ? r.player_lexemes : [],
    playerNumber: r.player_number || null,
    // بردارِ عصبیِ فاز ۲ (اگر برای این طرح ساخته شده باشد).
    embedding: Array.isArray(r.embedding) ? r.embedding
      : (r.embedding && r.embedding.v ? r.embedding.v : null),
    cashAmount: Number(r.cash_amount || 0),
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
  // مدیریت — کارت‌های گروه‌بندی‌شده و نمونه‌های تشخیص
  // ═════════════════════════════════════════════════════════════════════════

  router.get('/admin/photo-cards/designs', adminAuth, asyncHandler(async (req, res) => {
    // اثر انگشت‌ها عمداً برگردانده نمی‌شوند: چند کیلوبایت باینری به‌ازای
    // هر طرح که رابط کاربری هیچ استفاده‌ای از آن ندارد.
    const { rows } = await pool.query(
      `SELECT d.id, d.image_url, d.width, d.height, d.is_active, d.created_at,
              d.side, cardinality(COALESCE(d.text_tokens,'{}'::text[]))::int AS text_token_count,
              (d.dhash IS NOT NULL AND d.phash IS NOT NULL AND d.color_sig IS NOT NULL
               AND d.tex_sig IS NOT NULL AND d.luma_sig IS NOT NULL AND d.rgb_sig IS NOT NULL)
                AS fingerprint_complete,
              t.id AS card_type_id, t.name AS card_type_name,
              t.is_active AS card_type_is_active,
              t.point_value, t.cash_amount,
              t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
              t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect,
              t.is_collectible,
              (SELECT count(*)::int FROM photo_card_codes c
                WHERE c.bound_design_id = d.id AND c.status = 'used') AS redeemed_count,
              (SELECT count(*)::int FROM photo_card_codes c
                WHERE c.expected_card_type_id = t.id) AS code_count,
              (SELECT count(*)::int FROM photo_card_codes c
                WHERE c.expected_card_type_id = t.id AND c.status = 'unused') AS unused_code_count
         FROM photo_card_designs d
         JOIN card_types t ON t.id = d.card_type_id
        ORDER BY d.created_at DESC
        LIMIT 300`,
    );
    res.json({ designs: rows, cards: groupAdminCards(rows) });
  }));

  /**
   * آپلود «عکس خام» + تعیین امتیاز.
   *
   * امتیاز روی `card_types.point_value` می‌نشیند نه روی خود طرح. دلیل:
   * اگر طرح امتیاز جدا داشت، یک کارت از راه کد یک امتیاز می‌داد و از راه
   * عکس امتیاز دیگری — و کاربر حق داشت شکایت کند.
   */
  require('./photoCards/adminUpload')({
    router, pool, adminAuth, requireRole, asyncHandler, imageUpload, audit,
    optimizeUpload, verifyUpload, UUID_RE, safeUnlink, toFloats,
    fs, path, fpEngine, photoCards, cardDuel, cardCrop,
    MAX_BATCH, DUPLICATE_SIMILARITY, matchSettings,
  });

  router.patch(
    '/admin/photo-cards/designs/:id',
    adminAuth, validateUuid('id'), requireRole('support'),
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

  /**
   * حذفِ کاملِ یک طرحِ تصویری.
   *
   * غیرفعال کردن (`PATCH isActive`) طرح را از تطبیق کنار می‌گذارد ولی
   * ردیفش می‌ماند. برای پاک کردنِ واقعیِ کاتالوگ — مثلاً بعد از
   * آپلودِ اشتباهی — این مسیر لازم است.
   *
   * ⚠️ فقط وقتی هیچ پرونده‌ای به این طرح ارجاع ندارد. پرونده‌ها
   *    تاریخچهٔ ثبتِ کاربرند و `matched_design_id` بی‌معنی شدنش یعنی
   *    بعداً معلوم نیست آن کارت چطور تأیید شده.
   */
  router.delete(
    '/admin/photo-cards/designs/:id',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const used = await pool.query(
        `SELECT count(*)::int AS n FROM photo_card_submissions
          WHERE matched_design_id=$1 OR chosen_design_id=$1`,
        [req.params.id],
      );
      if (used.rows[0].n) {
        return res.status(409).json({
          message: `این طرح در ${used.rows[0].n} پروندهٔ ثبت استفاده شده و `
            + 'قابل حذف نیست. می‌توانید غیرفعالش کنید.' });
      }
      // کدهایی که در لحظهٔ مصرف به این طرح گره خورده‌اند: خودِ کد
      // می‌ماند، فقط ارجاعش پاک می‌شود. آن ارجاع صرفاً اطلاعاتی است.
      await pool.query(
        'UPDATE photo_card_codes SET bound_design_id=NULL WHERE bound_design_id=$1',
        [req.params.id]);
      const { rows } = await pool.query(
        'DELETE FROM photo_card_designs WHERE id=$1 RETURNING id', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ message: 'طرح پیدا نشد' });
      await audit(req.admin.id, 'delete_photo_card_design',
        'photo_card_designs', req.params.id, null, null);
      res.json({ message: 'طرح حذف شد' });
    }),
  );

  /**
   * حذف اتمیک یک کارت گروه‌بندی‌شده (نوع کارت + همهٔ رو/پشت‌ها).
   *
   * سابقهٔ واقعی کاربر هرگز قربانی دکمهٔ حذف نمی‌شود. اگر کارت در
   * اینونتوری، پروندهٔ ثبت، کد مصرف‌شده/رزروشده، یا سیستم قدیمی کدها
   * ردپا داشته باشد، 409 روشن برمی‌گردد و مدیر می‌تواند کارت را غیرفعال
   * کند. در غیر این صورت نمونه‌های تشخیص و کدهای هرگز مصرف‌نشده همراه
   * خود نوع کارت در یک تراکنش پاک می‌شوند.
   */
  router.delete(
    '/admin/photo-cards/card-types/:id',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      const cardTypeId = String(req.params.id || '');
      if (!UUID_RE.test(cardTypeId)) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }

      const client = await pool.connect();
      let imageUrls = [];
      let deletedCodes = 0;
      let cardName = '';
      try {
        await client.query('BEGIN');
        const type = await client.query(
          'SELECT id, name FROM card_types WHERE id=$1 FOR UPDATE',
          [cardTypeId]);
        if (!type.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: 'کارت پیدا نشد' });
        }
        cardName = type.rows[0].name;

        const dependencies = await client.query(
          `SELECT
             (SELECT count(*)::int FROM user_card_inventory
               WHERE card_type_id=$1) AS inventory_count,
             (SELECT count(*)::int
                FROM photo_card_submissions submission
               WHERE submission.matched_design_id IN
                     (SELECT id FROM photo_card_designs WHERE card_type_id=$1)
                  OR submission.chosen_design_id IN
                     (SELECT id FROM photo_card_designs WHERE card_type_id=$1)
             ) AS submission_count,
             (SELECT count(*)::int FROM photo_card_codes
               WHERE expected_card_type_id=$1
                 AND status IN ('reserved','used')) AS committed_code_count`,
          [cardTypeId]);
        const counts = dependencies.rows[0];
        const blockers = [];
        if (counts.inventory_count) {
          blockers.push(`${counts.inventory_count} کارت در مجموعهٔ کاربران`);
        }
        if (counts.submission_count) {
          blockers.push(`${counts.submission_count} پروندهٔ ثبت`);
        }
        if (counts.committed_code_count) {
          blockers.push(`${counts.committed_code_count} کد مصرف‌شده یا درحال بررسی`);
        }
        if (blockers.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: `«${cardName}» سابقهٔ قابل نگهداری دارد و قابل حذف کامل نیست: `
              + `${blockers.join('، ')}. می‌توانید کارت را غیرفعال کنید.`,
            blockers,
          });
        }

        const designs = await client.query(
          'SELECT image_url FROM photo_card_designs WHERE card_type_id=$1',
          [cardTypeId]);
        imageUrls = designs.rows.map(row => row.image_url).filter(Boolean);

        // Only unused/voided codes can reach here. Removing them is part of
        // the administrator's explicit whole-card deletion and prevents
        // dangling expected_card_type_id references from defeating DELETE.
        const removedCodes = await client.query(
          `DELETE FROM photo_card_codes
            WHERE expected_card_type_id=$1
              AND status IN ('unused','voided')
          RETURNING id`,
          [cardTypeId]);
        deletedCodes = removedCodes.rowCount;

        // photo_card_designs and reward-group associations cascade. User
        // inventory and legacy codes are RESTRICT and were checked above.
        await client.query('DELETE FROM card_types WHERE id=$1', [cardTypeId]);
        await audit(req.admin.id, 'delete_photo_card', 'card_types', cardTypeId,
          null, { name: cardName, sideCount: imageUrls.length, deletedCodes }, client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23503') {
          return res.status(409).json({
            message: 'این کارت هنوز در بخش دیگری استفاده می‌شود. ابتدا آن وابستگی را حذف یا کارت را غیرفعال کنید.',
          });
        }
        throw error;
      } finally {
        client.release();
      }

      // Database commit is the source of truth. File deletion is best-effort
      // and deliberately happens afterwards so a disk error cannot roll back
      // an otherwise valid administrative deletion.
      const imageRoot = path.resolve(__dirname, '..', '..', 'uploads', 'images');
      for (const imageUrl of imageUrls) {
        if (!String(imageUrl).startsWith('/uploads/images/')) continue;
        const candidate = path.join(imageRoot, path.basename(imageUrl));
        if (candidate.startsWith(`${imageRoot}${path.sep}`)) safeUnlink(candidate);
      }

      res.json({
        deleted: true,
        cardTypeId,
        deletedSideCount: imageUrls.length,
        deletedCodeCount: deletedCodes,
        message: `کارت «${cardName}» با همهٔ تصاویر رو و پشت حذف شد`,
      });
    }),
  );

  // ═════════════════════════════════════════════════════════════════════════
  // مدیریت — بانک کد
  // ═════════════════════════════════════════════════════════════════════════

  require('./photoCards/adminCodes')({
    router, pool, adminAuth, requireRole, asyncHandler, audit,
    validateUuid, UUID_RE, photoCards, MAX_BATCH,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // داشبوردِ «کدهای مشکوکِ شرکت» (فاز ۴) — تشخیصِ دسته‌ایِ برچسبِ غلطِ کد
  // ═══════════════════════════════════════════════════════════════════════
  //
  // سناریو: شرکت یک سریِ کد را روی کارتِ اشتباه چاپ کرده (مثلاً کدِ «هالند»
  // روی کارتِ «رودری»). اگر چند ثبتِ مختلف، کدی که انتظارش A بود را با
  // تصویری که موتورِ هویت به‌صورت B می‌بیند بفرستند، این یک تصادف نیست —
  // آن سریِ کد دسته‌ای اشتباه برچسب خورده. این گزارش آن را دسته‌ای نشان
  // می‌دهد و تعداد آستانه (پیش‌فرض ۳) دارد تا تصادفِ تک‌موردی سروصدا نسازد.
  router.get('/admin/photo-cards/code-mismatch', adminAuth,
    asyncHandler(async (req, res) => {
      const minCount = Math.max(1, Math.min(50, parseInt(req.query.min, 10) || 3));
      const { rows } = await pool.query(
        `WITH coded AS (
           SELECT c.expected_card_type_id AS expected_type,
                  d.card_type_id          AS seen_type,
                  s.id, s.created_at,
                  u.nickname, u.mobile, c.code
             FROM photo_card_submissions s
             JOIN photo_card_codes c ON c.id = s.code_id
             JOIN photo_card_designs d ON d.id = s.matched_design_id
             JOIN users u ON u.id = s.user_id
            WHERE c.expected_card_type_id IS NOT NULL
              AND d.card_type_id IS NOT NULL
              AND c.expected_card_type_id <> d.card_type_id
         )
         SELECT expected_type, seen_type,
                count(*)::int AS count,
                max(created_at) AS last_seen,
                te.name AS expected_name,
                tn.name AS seen_name
           FROM coded
           JOIN card_types te ON te.id = coded.expected_type
           JOIN card_types tn ON tn.id = coded.seen_type
          GROUP BY expected_type, seen_type, te.name, tn.name
         HAVING count(*) >= $1
          ORDER BY count(*) DESC, max(created_at) DESC
          LIMIT 100`,
        [minCount],
      );
      res.json({ mismatches: rows, minCount });
    }));

  router.get('/admin/photo-cards/submissions', adminAuth, asyncHandler(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
      ? req.query.status : 'pending';
    const { rows } = await pool.query(
      `SELECT s.id, s.match_score, s.match_margin, s.status, s.created_at,
              s.user_image_path, s.reject_reason, s.review_reason,
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
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const approve = req.body.approve === true || req.body.approve === 'true';
      const reason = String(req.body.reason || '').trim().slice(0, 500);

      // ── طرحی که مدیر **خودش** انتخاب کرده ──
      //
      // خواستهٔ مالک: وقتی کد معتبر است ولی عکس شناخته نشد، مدیر باید
      // بتواند بگوید «این کد مالِ کدام طرح بوده». پس تأیید می‌تواند با
      // طرحی غیر از حدسِ موتور انجام شود — یا حتی وقتی موتور اصلاً
      // حدسی نداشته.
      const chosenId = req.body.designId ? String(req.body.designId) : null;
      if (chosenId && !UUID_RE.test(chosenId)) {
        return res.status(400).json({ message: 'شناسهٔ طرح معتبر نیست' });
      }

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
          // انتخابِ مدیر بر حدسِ موتور مقدم است. اگر موتور حدسی نداشته
          // (عکس اصلاً شناخته نشد) انتخابِ مدیر **الزامی** است، وگرنه
          // معلوم نیست کدام کارت باید به اینونتوری اضافه شود.
          if (!sub.code_id) {
            throw Object.assign(
              new Error('این پرونده کدی ندارد و قابل تأیید نیست'),
              { status: 400 });
          }

          // ── نوعِ کارتی که کد از پیش به آن گره خورده ──
          //
          // اگر کد نام‌دار باشد، مدیر لازم نیست طرح انتخاب کند: خودِ
          // کد می‌گوید کدام کارت. این همان چیزی است که کارِ مدیر را
          // خودکار می‌کند — قبلاً حتی برای کدی که تکلیفش روشن بود،
          // انتخابِ دستیِ طرح اجباری بود.
          const cq = await client.query(
            'SELECT expected_card_type_id FROM photo_card_codes WHERE id=$1',
            [sub.code_id],
          );
          const expectedTypeId = cq.rows[0]?.expected_card_type_id || null;

          const designId = chosenId || sub.matched_design_id;
          if (!designId && !expectedTypeId) {
            throw Object.assign(
              new Error('برای تأیید باید مشخص کنید این کد مربوط به کدام کارت است'),
              { status: 400 });
          }

          // طرح اختیاری است؛ فقط اگر شناسه‌ای داریم می‌خوانیمش.
          let design = null;
          if (designId) {
            const d = await client.query(
              `SELECT d.id, d.card_type_id, d.image_url
                 FROM photo_card_designs d
                 JOIN card_types t ON t.id=d.card_type_id
                WHERE d.id=$1 AND d.is_active=true AND t.is_active=true`,
              [designId],
            );
            if (!d.rows[0]) {
              // اگر مدیر صریحاً طرحی انتخاب کرده و پیدا نشد، خطاست.
              // ولی اگر فقط حدسِ موتور بود و کد نام‌دار داریم، بی‌صدا
              // به نوعِ کارتِ کد برمی‌گردیم.
              if (chosenId || !expectedTypeId) {
                throw Object.assign(
                  new Error('طرح پیدا نشد یا غیرفعال است'), { status: 404 });
              }
            } else {
              design = d.rows[0];
            }
          }

          payload = await photoCards.creditSubmission(client, {
            userId: sub.user_id,
            codeId: sub.code_id,
            design,
            // انتخابِ صریحِ مدیر مقدم است؛ وگرنه نوعِ کارتِ گره‌خورده.
            cardTypeId: design ? null : expectedTypeId,
            adminId: req.admin.id,
          });
          if (payload.points > 0) {
            await addLeaguePoints(client, sub.user_id, payload.points);
          }
          // حدسِ اولیه در `matched_design_id` دست‌نخورده می‌ماند تا
          // بعداً بشود سنجید «چند بار مدیر حدسِ ما را عوض کرد؟» —
          // تنها راهِ فهمیدنِ اینکه آستانه‌ها درست تنظیم شده‌اند.
          await client.query(
            `UPDATE photo_card_submissions
                SET chosen_design_id=$1, decision_path='admin' WHERE id=$2`,
            [design?.id ?? null, req.params.id],
          );
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
          'کارت شما تأیید شد',
          `کارت «${payload.cardTypeName}» به مجموعهٔ شما اضافه شد`
          + (payload.points ? ` و ${payload.points} امتیاز گرفتید.` : '.'),
        ).catch(() => {});
        // ── چرا XP گذر نبرد داده نمی‌شود ──
        //
        // خواستهٔ صریح مالک. منطقش هم روشن است: گذر نبرد پاداشِ
        // **فعالیت در بازی** است. ثبتِ کارت خریدی است که کاربر بیرون
        // از اپ انجام داده و امتیاز و جایزهٔ نقدیِ خودش را دارد.
        // دادنِ XP بابتش یعنی کسی که پول بیشتری خرج می‌کند در گذر
        // نبرد جلو می‌افتد — که هدفِ گذر نبرد نیست.
        //
        // مسیرِ قدیمیِ «ثبت کد کارت» (server.js) عمداً دست‌نخورده ماند.
        // جدولِ لیگ عوض شد: کشِ فهرست بی‌اعتبار و سیگنالِ سوکت پخش می‌شود.
        // (سیگنال داده ندارد؛ کلاینت `/api/league/current` را دوباره می‌زند.)
        leaderboardSignal.leaderboardChanged();
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
      `SELECT count(*)::int AS designs,
              count(DISTINCT d.card_type_id)::int AS cards
         FROM photo_card_designs d
         JOIN card_types t ON t.id=d.card_type_id
        WHERE d.is_active=true AND t.is_active=true`,
    );
    const pending = await pool.query(
      `SELECT count(*)::int AS n FROM photo_card_submissions
        WHERE user_id=$1 AND status='pending'`, [req.user.id],
    );
    res.json({
      available: rows[0].cards > 0,
      // designCount remains the independent recognition-sample count because
      // both clients use it to budget image-matching latency.
      designCount: rows[0].designs,
      // Any user-facing catalogue count must use cardCount: front/back are
      // two samples of one inventory card, never two cards.
      cardCount: rows[0].cards,
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

      // محتوای واقعیِ عکس قبل از هر پردازشی راستی‌آزمایی شود (تورِ آخرِ
      // مشترکِ همهٔ مسیرهای آپلود — توضیح روی verifyUpload در imageService).
      // خودش فایلِ نامعتبر را حذف می‌کند، پس تورِ ایمنیِ پایینِ route همیشه
      // درست کار می‌کند.
      await verifyUpload(req.file);

      let filePath = req.file.path;
      let keepFile = false;
      try {
        // ── گامِ ۰: آیا کاربر قفل است؟ ──
        //
        // قبل از هر کاری، حتی قبل از خواندنِ کد. اگر قفل است نه CPU
        // خرج می‌شود و نه چیزی در دیتابیس عوض می‌شود.
        const lock = await lockout.getState(pool, req.user.id);
        if (lock.locked) {
          // ── چرا همان متنِ لحظهٔ قفل شدن ──
          //
          // نسخهٔ اول اینجا متنِ ملایم‌تری می‌داد. نتیجه: کاربر فقط
          // **یک بار** — دقیقاً در لحظهٔ قفل شدن — می‌فهمید علت
          // «فعالیت مشکوک و ۵ کد نادرست» است. اگر آن پیام را ندیده
          // بود یا اپ را بسته بود، بقیهٔ سه ساعت پیامی می‌دید که
          // علت را توضیح نمی‌داد.
          //
          // متن باید در هر بار تلاش کامل باشد، نه فقط بار اول.
          return res.status(429).json({
            status: 'locked',
            lockedUntil: lock.until,
            remainingMs: lock.remainingMs,
            message: 'به دلیل فعالیت مشکوک و ثبتِ ۵ کدِ نادرست پشت‌سرهم، '
              + `تا ${lockout.humanRemaining(lock.remainingMs)} دیگر امکان ثبت `
              + 'کارت و کد ندارید.',
          });
        }

        const code = photoCards.normalizePhotoCode(req.body.code);

        /** پاسخِ «کد غلط» + شمردنِ خطا. */
        const wrongCode = async (why) => {
          const r = await lockout.registerFailure(pool, req.user.id);
          if (r.locked) {
            return res.status(429).json({
              status: 'locked',
              remainingMs: r.remainingMs,
              message: 'به دلیل فعالیت مشکوک و ثبتِ ۵ کدِ نادرست پشت‌سرهم، '
                + `تا ${lockout.humanRemaining(r.remainingMs)} دیگر امکان ثبت کارت `
                + 'و کد ندارید.',
            });
          }
          return res.status(404).json({
            status: 'bad_code',
            triesLeft: r.triesLeft,
            message: `${why} به حروفِ شبیه‌به‌هم دقت کنید: صفر (0) و حرف O، `
              + 'و عدد یک (1) با حروف I و L. بزرگ یا کوچک بودنِ حروف مهم نیست. '
              + `${r.triesLeft} تلاش دیگر باقی مانده.`,
          });
        };

        if (!photoCards.isValidPhotoCode(code)) {
          return wrongCode('کدِ واردشده معتبر نیست.');
        }

        // ── گامِ ۱: کد ──
        //
        // بررسی کد ارزان است (یک ایندکس)، تحلیل تصویر گران (~۲۰ms CPU).
        // اگر کد از اول باطل است دلیلی ندارد CPU خرج شود.
        //
        // جست‌وجو روی `code_fold`: کاربر کد را از روی کارتِ چاپی می‌خواند
        // و O/0 و I/L/1 آنجا از هم قابل تشخیص نیستند.
        // `expected_card_type_id` هم خوانده می‌شود: اگر این کد از پیش
        // به یک نوع کارت گره خورده باشد، مسیرِ تصمیم کاملاً عوض می‌شود.
        // توضیحِ کامل در `photoCardService.decideSubmission`.
        const codeRow = await pool.query(
          `SELECT id, status, expected_card_type_id
             FROM photo_card_codes WHERE code_fold=$1`,
          [photoCards.foldPhotoCode(code)],
        );
        if (!codeRow.rows[0]) {
          return wrongCode('این کد در سیستم ثبت نشده است.');
        }

        // ── این حالت‌ها خطای کاربر نیستند و شمرده نمی‌شوند ──
        //
        // کاربری که کدِ مصرف‌شده وارد می‌کند، کد را واقعاً **داشته** —
        // فقط دیر رسیده یا دوباره فرستاده. قفل کردنش یعنی مجازاتِ
        // کسی که کارت دارد.
        if (codeRow.rows[0].status === 'used') {
          return res.status(409).json({ message: 'این کد قبلاً استفاده شده است' });
        }
        if (codeRow.rows[0].status === 'reserved') {
          return res.status(409).json({
            message: 'این کد در حال بررسی توسط پشتیبانی است' });
        }
        if (codeRow.rows[0].status !== 'unused') {
          return res.status(409).json({ message: 'این کد دیگر معتبر نیست' });
        }
        const codeId = codeRow.rows[0].id;
        const expectedTypeId = codeRow.rows[0].expected_card_type_id || null;

        // از اینجا به بعد کد **معتبر** است. هر نتیجه‌ای که بگیریم،
        // شمارندهٔ خطا صفر می‌شود: کاربر ثابت کرده کارت دارد.
        await lockout.clearFailures(pool, req.user.id);

        const designsRes = await pool.query(
          `SELECT d.id, d.card_type_id, d.image_url, d.dhash, d.phash,
                  d.color_sig, d.tex_sig, d.luma_sig, d.rgb_sig,
                  d.text_tokens, d.width, d.height,
                  d.embedding,
                  t.player_lexemes, t.player_number,
                  COALESCE(t.cash_amount,0) AS cash_amount
             FROM photo_card_designs d
             JOIN card_types t ON t.id=d.card_type_id
            WHERE d.is_active=true AND t.is_active=true`,
        );

        // کارت‌های نقدی: تصمیمِ اصلاحِ خودکارِ نوع هرگز روی پول اعمال
        // نمی‌شود (به صفِ ادمین می‌رود). این مجموعه از کوئریِ بالا می‌آید.
        const cashTypeIds = new Set(
          designsRes.rows
            .filter(r => Number(r.cash_amount || 0) > 0)
            .map(r => r.card_type_id),
        );

        // ── گامِ ۲: تصویر ──
        const buf = await fs.promises.readFile(filePath);

        // ── چرا اثرانگشت‌گیری در try جداست ──
        //
        // فایلی که مرورگر «image/jpeg» اعلام کرده ممکن است در واقع
        // خراب باشد: آپلودِ نیمه‌تمام روی شبکهٔ ضعیف، فایلِ صفربایتی،
        // یا کاربری که چیزِ دیگری را دستکاری کرده.
        //
        // در آن حالت sharp استثنا پرتاب می‌کند و بدونِ این بلوک به
        // مدیریت‌کنندهٔ خطای عمومی می‌رسید: **HTTP 500 با پیامِ
        // انگلیسیِ VipsJpeg**. کاربر یک خطای مبهم می‌دید و در لاگ هم
        // شبیهِ خرابیِ سرور به نظر می‌رسید، نه ورودیِ بد.
        //
        // این خطای کاربر است نه سرور، پس ۴۰۰ با پیامِ فارسی درست است.
        // شمارندهٔ کدِ غلط هم بالا نمی‌رود: کدش ممکن است کاملاً درست
        // باشد و فقط عکس خراب بوده.
        // ══════════════════════════════════════════════════════════════
        // بریدنِ کارت از پس‌زمینه، پیش از هر تحلیلی
        // ══════════════════════════════════════════════════════════════
        //
        // ── چرا لازم است ──
        //
        // عکسِ واقعیِ یک کاربر بررسی شد: کارت روی میزِ چوبی و **۴۰٪ کادر
        // خودِ میز**. موتور رنگِ چوب را هم وارد محاسبه می‌کرد و کارتِ
        // اشتباه با حاشیهٔ ۰.۰۳۳ برنده شد.
        //
        // همان عکس با برش: شباهت از ۰.۴۳۱ به ۰.۶۲۷ رفت — از «زیرِ
        // آستانه» به «بالای آستانه».
        //
        // ⚠️ `cropCard` هرگز استثنا نمی‌دهد و در هر تردیدی بافرِ اصلی
        //    را برمی‌گرداند. برشِ اشتباه بدتر از نبریدن است.
        let workBuf = buf;
        let cropInfo = null;
        try {
          const c = await cardCrop.cropCard(buf);
          if (c.cropped) { workBuf = c.buffer; cropInfo = c.box; }
        } catch (e) {
          // هرگز نباید اینجا برسیم (خودِ تابع try دارد)، ولی اگر رسید
          // ثبتِ کاربر نباید به‌خاطرِ یک بهینه‌سازیِ اختیاری بشکند.
          console.warn('[photo-cards] برشِ خودکار شکست خورد:', e.message);
        }

        let queryFp;
        try {
          queryFp = await fpEngine.fingerprint(workBuf);
        } catch (imgErr) {
          console.warn('[photo-cards] تصویرِ غیرقابل‌خواندن:', imgErr.message);
          return res.status(400).json({
            status: 'bad_image',
            message: 'عکس ارسالی قابل خواندن نبود. لطفاً دوباره از کارت '
              + 'عکس بگیرید و مطمئن شوید آپلود کامل انجام می‌شود.',
          });
        }

        // ═════════════════════════════════════════════════════════════
        // گیتِ کیفیت عکس (فاز ۱) — روی نسخهٔ بریده‌شدهٔ کارت
        // ═════════════════════════════════════════════════════════════
        //
        // اگر عکس آن‌قدر تار/تاریک/تخت است که حتی «کارتی بودن» هم قطعی
        // نیست، همان لحظه به کاربر برمی‌گردد تا دوباره عکس بگیرد — به‌جای
        // آنکه پرونده به صف برود و هم کد رزرو شود هم کاربر منتظر بماند.
        //
        // ⚠️ فقط تصویرِ فاجعه‌بار برگردانده می‌شود؛ عکسِ متوسط باید رد شود
        //    چون موتور و لایهٔ هویت برای همان طراحی شده‌اند. `usable=false`
        //    آستانهٔ محافظه‌کارانه دارد. این گیت کد را مصرف/رزرو نمی‌کند و
        //    شمارندهٔ قفل را هم بالا نمی‌برد (تقصیرِ کاربر نیست).
        try {
          const q = await imageQuality.assess(workBuf);
          if (!q.usable) {
            return res.status(422).json({
              status: 'poor_quality',
              quality: { blur: q.blur, mean: q.mean, contrast: q.contrast, reasons: q.reasons },
              message: imageQuality.qualityMessage(q.reasons)
                || 'کیفیت عکس برای تشخیص کافی نیست. لطفاً عکس واضح‌تری بگیرید.',
            });
          }
        } catch (e) {
          // سنجهٔ کیفیت هرگز نباید ثبت را بشکند؛ صرفاً نادیده گرفته می‌شود.
          console.warn('[photo-cards] سنجش کیفیت شکست خورد (نادیده):', e.message);
        }
        const designFps = designsRes.rows.map(rowToFp);
        const match = designsRes.rows.length
          ? fpEngine.matchAgainst(queryFp, designFps)
          : { verdict: 'reject', design: null, score: 0, margin: 0 };

        // ═════════════════════════════════════════════════════════════
        // لایهٔ هویت (فاز ۰/۲): نام‌خوانِ واژه‌نامه + بردارِ عصبی.
        //
        // قوی‌ترین سیگنالِ «این کیست؟» است و مستقل از رنگ/قالب کار می‌کند.
        // بردارِ عصبیِ کاربر اگر کلاینت فرستاده باشد (مدلِ روی‌گوشی در فاز ۲)
        // از `req.body.embedding` خوانده می‌شود؛ حالا اغلب فقط متنِ OCR است.
        // ═════════════════════════════════════════════════════════════
        let queryEmbedding = null;
        try {
          if (req.body.embedding) {
            const parsed = typeof req.body.embedding === 'string'
              ? JSON.parse(req.body.embedding) : req.body.embedding;
            if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) {
              queryEmbedding = parsed;
            }
          }
        } catch { /* embedding خراب → نادیده، فقط متن/تصویر */ }

        const identity = designsRes.rows.length
          ? cardIdentity.rankIdentity(
              { textTokens: queryFp.textTokens, embedding: queryEmbedding },
              designFps)
          : null;

        // ═══════════════════════════════════════════════════════════════
        // چرا هیچ محدودیتی روی «عکسِ تکراری» وجود ندارد
        // ═══════════════════════════════════════════════════════════════
        //
        // اینجا قبلاً یک گاردِ مفصل بود که اگر کاربر **همان عکس** را
        // دوباره می‌فرستاد، درخواست را با ۴۰۹ رد می‌کرد. آن گارد حذف
        // شد و دلیلش یک بدفهمیِ ریشه‌ای از مدلِ کسب‌وکار بود.
        //
        // ── فرضِ غلطی که گارد رویش بنا شده بود ──
        //
        //   «یک عکس = یک کارتِ فیزیکی، پس دو ثبت با یک عکس یعنی تقلب.»
        //
        // ── واقعیت ──
        //
        // کارت‌ها **سری‌ای** چاپ می‌شوند. کاربری که ده نسخه از کارتِ
        // «محمد صلاح» دارد، ده کارتِ فیزیکیِ کاملاً یکسان در دست دارد
        // که فقط کدِ پشت‌شان فرق می‌کند. عکسِ هر ده تا از نظر موتورِ
        // تطبیق **صد در صد یکسان** است — چون واقعاً هستند.
        //
        // نتیجهٔ گارد: کاربرِ کاملاً درستکار فقط می‌توانست کارتِ اول را
        // ثبت کند و نُه تای بعدی با پیامِ «این عکس قبلاً ارسال شده» رد
        // می‌شد. یعنی محافظِ ضدتقلب، مشتریِ واقعی را مسدود می‌کرد.
        //
        // خواستهٔ صریح مالک، کلمه به کلمه:
        //
        //   «مثلا کاربر ۱۰ تا از یک عکس با ۱۰ تا کد مختلف داره ولی
        //    دیگه هر بار نمیاد عکس جدید بگیره. مهم اینه که کدش اصالت
        //    داشته باشه … اصلا هیچ محدودیتی تعداد تکراری عکس نباید
        //    وجود داشته باشه.»
        //
        // ── پس ضدتقلب حالا کجاست؟ ──
        //
        // جایی که از اول باید می‌بود: **کد**.
        //
        //   • هر کد فقط یک بار مصرف می‌شود (`status='used'` با
        //     `SELECT … FOR UPDATE` در `creditSubmission`).
        //   • کد فقط روی کارتِ فیزیکیِ چاپ‌شده وجود دارد.
        //   • پنج کدِ نادرستِ پشت‌سرهم = سه ساعت قفل (`lockout`).
        //
        // عکس نقشِ **شناسایی** دارد نه نقشِ **یکتایی**: می‌گوید «این
        // کدام کارت است»، نه «این چندمین بار است». تعدادِ نسخه‌ها را
        // `user_card_inventory.quantity` نگه می‌دارد که دقیقاً برای
        // همین ساخته شده.
        //
        // ── قفلِ مشورتیِ `pg_advisory_xact_lock` هم با آن رفت ──
        //
        // آن قفل فقط برای این بود که چند درخواستِ هم‌زمانِ **یک کاربر**
        // نتوانند گاردِ بالا را دور بزنند. حالا که گاردی نیست، قفل هم
        // بی‌مصرف است — و حذفش یک اتصالِ استخر را در هر ثبت آزاد
        // می‌کند، که روی VPS دو-هسته‌ای معنی‌دار است.
        //
        // یکتاییِ کد بدونِ آن قفل هم تضمین است و این تصادفی نیست:
        //
        //   • مسیرِ تأیید: `SELECT … FOR UPDATE` روی ردیفِ کد. درخواستِ
        //     دوم پشتِ قفلِ ردیف می‌ماند و بعد از COMMIT اولی وضعیتِ
        //     `used` را می‌بیند و ۴۰۹ می‌گیرد.
        //   • مسیرِ بررسی: `UPDATE … WHERE id=$1 AND status='unused'`
        //     یک عملیاتِ اتمیک است؛ فقط یکی `RETURNING` می‌گیرد.
        //
        // یعنی «دو بار مصرفِ یک کد» در سطحِ دیتابیس غیرممکن است، نه در
        // سطحِ منطقِ برنامه. این تفاوت مهم است.
        //
        // ── اثرانگشت همچنان ذخیره می‌شود ──
        //
        // نه برای مسدود کردن، بلکه برای ممیزی: اگر روزی الگوی مشکوکی
        // دیده شد (مثلاً صد ثبت با یک عکس)، داده‌اش هست. چند صد بایت
        // در هر ردیف هزینهٔ ناچیزی برای این دید است.

        // ═══════════════════════════════════════════════════════════════
        // کدِ معتبر + عکسِ ناشناخته → صف بررسی، نه رد
        // ═══════════════════════════════════════════════════════════════
        //
        // خواستهٔ صریح مالک. منطقِ پشتش: کد ثابت می‌کند کاربر کارتِ
        // فیزیکی را در دست دارد — کدها روی کارت چاپ می‌شوند و در بانکِ
        // ما هستند. اگر با آن کدِ معتبر عکسی فرستاده که ما نشناختیم،
        // محتمل‌ترین توضیح این است که عکس بد گرفته شده، نه اینکه کاربر
        // دروغ می‌گوید.
        //
        // ردِ خودکار در این حالت یعنی مجازاتِ کسی که واقعاً کارت خریده.
        // مدیر عکس را می‌بیند و اگر کارت را شناخت، خودش طرح را انتخاب
        // می‌کند.
        // ═══════════════════════════════════════════════════════════════
        // تصمیم: کدِ نام‌دار یا بی‌نام؟
        // ═══════════════════════════════════════════════════════════════
        //
        // کلِ منطق در `decideSubmission` است — یک تابعِ خالص که مستقیم
        // تست می‌شود. اینجا فقط نتیجه‌اش اجرا می‌شود.
        //
        // خلاصه: اگر کد از پیش به کارتی گره خورده، عکس فقط باید ثابت
        // کند کاربر کارتِ فیزیکی را در دست دارد (آستانهٔ نرمِ ۰.۲۰).
        // اگر بی‌نام است، عکس باید هویتِ کارت را تعیین کند (رفتارِ
        // سخت‌گیرِ قدیمی).
        // آیا طرحِ فعالی برای کارتی که کد به آن گره خورده وجود دارد؟
        //
        // اینجا محاسبه می‌شود چون کلِ کاتالوگ در دست است. `match.ranked`
        // فقط سه تای اول را دارد و برای این سؤال کافی نیست.
        const hasReference = expectedTypeId
          ? designsRes.rows.some(d => d.card_type_id === expectedTypeId)
          : true;

        const th = matchSettings.current();
        const decision = photoCards.decideSubmission({
          expectedTypeId,
          match,
          hasReference,
          boundThreshold: th.boundAcceptScore,
          freeThreshold: th.freeAcceptScore,
          identity,
          isCashType: (id) => cashTypeIds.has(id),
        });

        if (decision.action !== 'approve') {
          const reason = decision.reason;

          // کد رزرو می‌شود: نه آزاد (وگرنه نفر دوم خرجش می‌کند) و نه
          // مصرف‌شده (وگرنه اگر مدیر رد کند بی‌دلیل سوخته است).
          const upd = await pool.query(
            `UPDATE photo_card_codes SET status='reserved', updated_at=NOW()
              WHERE id=$1 AND status='unused' RETURNING id`,
            [codeId],
          );
          if (!upd.rows[0]) {
            // ── چرا این هنوز لازم است، حتی بدونِ قفلِ مشورتی ──
            //
            // `UPDATE … WHERE status='unused' RETURNING` اتمیک است، پس
            // اگر دو درخواست هم‌زمان همین کد را بخواهند فقط یکی ردیف
            // برمی‌گرداند. آن یکیِ دیگر باید بفهمد باخته — وگرنه
            // پرونده‌ای می‌سازد برای کدی که رزروِ خودش نیست.
            return res.status(409).json({
              message: 'این کد همین حالا توسط شخص دیگری ثبت شد' });
          }

          // فقط اینجا عکس کاربر می‌ماند — تا مدیر ببیند. بلافاصله بعد
          // از تصمیم پاک می‌شود.
          const opt = await optimizeUpload(req.file);
          const savedPath = path.join(path.dirname(req.file.path), opt.filename);
          keepFile = true;

          const sub = await pool.query(
            `INSERT INTO photo_card_submissions
               (user_id, code_id, matched_design_id, match_score, match_margin,
                user_image_path, status, review_reason, decision_path,
                img_dhash, img_phash, img_color, img_tex, img_luma, img_rgb,
                img_text)
             VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$13,$8,$9,$10,$11,$12,$14,$15)
             RETURNING id`,
            [req.user.id, codeId, match.design?.id ?? null,
              match.score, match.margin, savedPath, reason,
              // اثرانگشت **فقط برای ممیزی** ذخیره می‌شود، نه برای
              // مسدود کردنِ ارسالِ بعدی. عکسِ خودِ کاربر پس از تصمیمِ
              // مدیر پاک می‌شود ولی این چند صد بایت می‌ماند و اگر
              // روزی الگوی مشکوکی دیده شد، داده‌اش هست.
              queryFp.dhash, queryFp.phash, queryFp.colorSig, queryFp.texSig,
              queryFp.lumaSig, decision.path, queryFp.rgbSig,
              queryFp.textTokens || []],
          );

          return res.json({
            status: 'pending',
            reason,
            submissionId: sub.rows[0].id,
            // ── چرا «۲۴ ساعت» صریح گفته می‌شود ──
            //
            // بدون بازهٔ زمانی، کاربر نمی‌داند منتظر بماند یا دوباره
            // تلاش کند — و معمولاً دوباره تلاش می‌کند، که هم کدِ بعدی
            // را می‌سوزاند و هم صف را شلوغ می‌کند.
            message: (reason === 'type_mismatch' || reason === 'code_mismatch_suspected')
              // ── چرا این پیام صریح است ──
              // کد و عکس دو کارتِ متفاوت را نشان می‌دهند. محتمل‌ترین
              // توضیح اشتباهِ ساده است: کاربر چند کارت جلویش دارد و
              // کدِ یکی را با عکسِ دیگری فرستاده. گفتنِ صریحش یعنی
              // خودش در چند ثانیه درستش می‌کند، به‌جای ۲۴ ساعت انتظار.
              ? 'کد شما معتبر است ولی عکسی که فرستادید با کارتِ '
                + 'مربوط به این کد هم‌خوانی ندارد. اگر چند کارت دارید، '
                + 'مطمئن شوید عکس و کد مالِ یک کارت‌اند. پرونده برای '
                + 'بررسی به کارشناس رفت و کد شما محفوظ است.'
              : reason === 'image_unknown'
              ? 'کد شما درست است ولی کیفیت عکس پایین بود و به‌خوبی '
                + 'تشخیص داده نشد. عکس توسط کارشناس بررسی می‌شود و '
                + 'ممکن است تا ۲۴ ساعت طول بکشد. نتیجه را اطلاع می‌دهیم '
                + 'و کد شما تا آن زمان محفوظ است.'
              : 'کیفیت عکس کامل نبود، برای همین در حال بررسی است و '
                + 'ممکن است تا ۲۴ ساعت طول بکشد. کد شما محفوظ است.',
          });
        }

        // ── گامِ ۳: تأیید خودکار ──
        //
        // ── چرا اینجا دیگر قفلِ مشورتی نیست ──
        //
        // نسخهٔ قبلی قفلِ `pg_advisory_xact_lock` را تا بعد از COMMIT
        // نگه می‌داشت تا «یک عکس، چند کارت» رخ ندهد. آن سناریو دیگر
        // باگ نیست بلکه **رفتارِ درست** است: کاربری که ده نسخهٔ یک
        // کارت را دارد باید بتواند هر ده را با ده کد ثبت کند.
        //
        // تنها چیزی که هنوز باید یکتا بماند «مصرفِ دوبارهٔ یک کد» است،
        // و آن را `SELECT … FOR UPDATE` داخلِ `creditSubmission` روی
        // ردیفِ خودِ کد تضمین می‌کند — نه یک قفلِ سطحِ کاربر. قفلِ
        // ردیف دقیق‌تر است: دو کاربر با دو کد اصلاً یکدیگر را بلاک
        // نمی‌کنند، و یک کاربر با دو کدِ متفاوت هم موازی پیش می‌رود.
        const client = await pool.connect();
        let payload;
        try {
          await client.query('BEGIN');
          // `design` ممکن است null باشد: کدِ نام‌داری که هیچ طرحِ
          // تصویری برایش آپلود نشده. آن‌وقت نوعِ کارت از خودِ کد
          // می‌آید — توضیح در `creditSubmission`.
          const design = decision.design
            ? designsRes.rows.find(d => d.id === decision.design.id) || null
            : null;
          payload = await photoCards.creditSubmission(client, {
            userId: req.user.id,
            codeId,
            design,
            cardTypeId: decision.cardTypeId,
          });
          if (payload.points > 0) {
            await addLeaguePoints(client, req.user.id, payload.points);
          }
          // ── چرا اثرانگشت اینجا هم ذخیره می‌شود ──
          //
          // دیگر برای مسدود کردن نیست (گاردِ «عکسِ تکراری» حذف شد)،
          // بلکه برای **ممیزی و کالیبراسیون**: با این داده می‌شود
          // سنجید آستانه‌های ۲۰٪ و ۴۰٪ در عمل چقدر درست کار می‌کنند و
          // چند درصدِ ثبت‌ها بی‌دلیل به صف رفته‌اند.
          //
          // عکسِ خودِ کاربر ذخیره نمی‌شود (خواستهٔ مالک)، فقط این چند
          // صد بایت.
          await client.query(
            `INSERT INTO photo_card_submissions
               (user_id, code_id, matched_design_id, chosen_design_id,
                match_score, match_margin, status, decision_path,
                img_dhash, img_phash, img_color, img_tex, img_luma, img_rgb,
                img_text)
             VALUES($1,$2,$3,$3,$4,$5,'approved',$6,$7,$8,$9,$10,$11,$12,$13)`,
            [req.user.id, codeId, design?.id ?? null,
              match.score, match.margin, decision.path,
              queryFp.dhash, queryFp.phash, queryFp.colorSig,
              queryFp.texSig, queryFp.lumaSig, queryFp.rgbSig,
              queryFp.textTokens || []],
          );
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }

        // عکس کاربر در این مسیر اصلاً ماندگار نمی‌شود.
        //
        // XP گذر نبرد عمداً داده نمی‌شود — توضیح کامل در مسیر تأیید مدیر.
        if (payload.cash > 0) {
          createNotification(req.user.id, 'wallet',
            'جایزهٔ نقدی به کیف پول اضافه شد',
            `${payload.cash.toLocaleString('en-US')} تومان بابت کارت «${payload.cardTypeName}» واریز شد.`,
          ).catch(() => {});
        }
        // جدولِ لیگ عوض شد: کشِ فهرست بی‌اعتبار و سیگنالِ سوکت پخش می‌شود.
        // (سیگنال داده ندارد؛ کلاینت `/api/league/current` را دوباره می‌زند.)
        leaderboardSignal.leaderboardChanged();

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
          // ── چرا این به کلاینت می‌رود ──
          //
          // فقط برای شفافیت و اشکال‌زدایی: اگر روزی کاربری شکایت کرد
          // که «عکسم درست بود ولی رد شد»، دیدنِ اینکه برش چه ناحیه‌ای
          // را انتخاب کرده اولین چیزی است که باید بررسی شود.
          //
          // کلاینت آن را نمایش نمی‌دهد؛ در لاگِ شبکه دیده می‌شود.
          cropped: cropInfo ? true : false,
          points: now.rows[0],
          walletBalance: Number(now.rows[0].wallet_balance || 0),
        });
      } finally {
        // ── تورِ ایمنی ──
        //
        // در مسیرِ تأییدِ خودکار عکسِ کاربر اصلاً نگه داشته نمی‌شود، در
        // مسیرِ بررسی نسخهٔ بهینه‌شده جای فایلِ خام را می‌گیرد. در هر
        // دو حالت فایلِ موقتِ multer باید برود، وگرنه دیسکِ VPS با هر
        // ثبت چند صد کیلوبایت پر می‌شود و کسی متوجهش نمی‌شود تا روزی
        // که سرور بنویسد «no space left».
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

  
  // ── ویرایش مستقیم نوع کارت و استات‌های آن ──
  router.patch(
    '/admin/photo-cards/card-types/:id',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const name = req.body.name ? String(req.body.name).trim() : null;
      const pointValue = req.body.pointValue !== undefined ? Math.max(0, Math.floor(parseFaNumber(req.body.pointValue || 0))) : null;
      const cashAmount = req.body.cashAmount !== undefined ? Math.max(0, Math.floor(parseFaNumber(req.body.cashAmount || 0))) : null;
      const isActive = req.body.isActive !== undefined ? (req.body.isActive === true || req.body.isActive === 'true') : null;
      const duelAttack = req.body.duelAttack != null ? parseFaNumber(req.body.duelAttack) : null;
      const duelDefense = req.body.duelDefense != null ? parseFaNumber(req.body.duelDefense) : null;
      const duelSpeed = req.body.duelSpeed != null ? parseFaNumber(req.body.duelSpeed) : null;
      const duelTechnique = req.body.duelTechnique != null ? parseFaNumber(req.body.duelTechnique) : null;
      const duelGoalChance = req.body.duelGoalChance != null ? parseFaNumber(req.body.duelGoalChance) : null;
      const duelEnergy = req.body.duelEnergy != null ? parseFaNumber(req.body.duelEnergy) : null;
      const duelRarity = req.body.duelRarity || null;
      const duelEffect = req.body.duelEffect || null;

      // One statement keeps the catalogue type and every recognition side in
      // lockstep. A front/back card must never end up half active because the
      // second UPDATE failed after the first had committed.
      const { rows } = await pool.query(
        `WITH updated_type AS (
           UPDATE card_types
              SET name = COALESCE($1, name),
                  point_value = COALESCE($2, point_value),
                  cash_amount = COALESCE($3, cash_amount),
                  is_active = COALESCE($4, is_active),
                  duel_attack = COALESCE($6, duel_attack),
                  duel_defense = COALESCE($7, duel_defense),
                  duel_speed = COALESCE($8, duel_speed),
                  duel_technique = COALESCE($9, duel_technique),
                  duel_goal_chance = COALESCE($10, duel_goal_chance),
                  duel_energy = COALESCE($11, duel_energy),
                  duel_rarity = COALESCE($12, duel_rarity),
                  duel_effect = COALESCE($13, duel_effect),
                  updated_at = NOW()
            WHERE id = $5
          RETURNING *
         ), updated_sides AS (
           UPDATE photo_card_designs
              SET is_active = $4, updated_at = NOW()
            WHERE card_type_id = $5 AND $4::boolean IS NOT NULL
          RETURNING id
         )
         SELECT * FROM updated_type`,
        [name, pointValue, cashAmount, isActive, req.params.id,
         duelAttack, duelDefense, duelSpeed, duelTechnique, duelGoalChance, duelEnergy,
         duelRarity, duelEffect]
      );
      if (!rows[0]) return res.status(404).json({ message: 'کارت پیدا نشد' });
      await audit(req.admin.id, 'update_photo_card_type', 'card_types', req.params.id, null, req.body);
      res.json({ cardType: rows[0], message: 'مشخصات کارت با موفقیت به‌روزرسانی شد' });
    })
  );

  // ── افزودن کد به کارت موجود (در زمان ویرایش یا افزودن بعدی کد) ──
  router.post(
    '/admin/photo-cards/card-types/:id/add-codes',
    adminAuth, validateUuid('id'), requireRole('support'),
    asyncHandler(async (req, res) => {
      if (!UUID_RE.test(String(req.params.id))) {
        return res.status(400).json({ message: 'شناسه معتبر نیست' });
      }
      const t = await pool.query('SELECT id, name FROM card_types WHERE id=$1', [req.params.id]);
      if (!t.rows[0]) return res.status(404).json({ message: 'کارت یافت نشد' });

      const raw = String(req.body.rawCodes || '').trim();
      const label = req.body.batchLabel ? String(req.body.batchLabel).trim() : null;
      if (!raw) return res.status(400).json({ message: 'کدها را وارد کنید' });

      const input = photoCards.parsePhotoCodesInput(raw);
      if (!input.length) return res.status(400).json({ message: 'هیچ کدی خوانده نشد' });

      const seen = new Set();
      const candidates = [];
      const invalid = [];
      const duplicateInFile = [];
      for (const tok of input) {
        if (!photoCards.isValidPhotoCode(tok.norm)) { invalid.push(tok.raw); continue; }
        const key = photoCards.foldPhotoCode(tok.norm);
        if (seen.has(key)) { duplicateInFile.push(tok.norm); continue; }
        seen.add(key);
        candidates.push(tok.norm);
      }

      let inserted = [];
      let duplicateInDb = [];
      if (candidates.length) {
        const r = await pool.query(
          `INSERT INTO photo_card_codes(code, batch_label, expected_card_type_id)
           SELECT unnest($1::citext[]), $2, $3
           ON CONFLICT (code_fold) DO NOTHING
           RETURNING code`,
          [candidates, label, req.params.id],
        );
        inserted = r.rows.map(x => String(x.code));
        const okSet = new Set(inserted.map(c => c.toUpperCase()));
        duplicateInDb = candidates.filter(c => !okSet.has(c.toUpperCase()));
      }

      await audit(req.admin.id, 'add_codes_to_card_type', 'photo_card_codes', null, null, {
        cardTypeId: req.params.id,
        inserted: inserted.length,
        duplicateInDb: duplicateInDb.length,
        batchLabel: label,
      });

      res.json({
        insertedCount: inserted.length,
        duplicateInDbCount: duplicateInDb.length,
        invalidCount: invalid.length,
        message: `${inserted.length.toLocaleString('en-US')} کد به کارت «${t.rows[0].name}» اضافه شد`,
      });
    })
  );

  return router;
};
