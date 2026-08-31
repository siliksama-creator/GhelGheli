/**
 * Front/back administrative upload pipeline.
 *
 * Image decoding, duplicate detection, independent side fingerprinting,
 * optimization, card creation, code import, and cleanup are one transaction.
 * The parent router owns public/review routes; this module owns that focused
 * upload concern.
 */
module.exports = function registerAdminPhotoCardUpload(deps) {
  const {
    router, pool, adminAuth, requireRole, asyncHandler, imageUpload, audit,
    optimizeUpload, verifyUpload, UUID_RE, safeUnlink, toFloats,
    fs, path, fpEngine, photoCards, cardDuel, cardCrop,
    MAX_BATCH, DUPLICATE_SIMILARITY, matchSettings,
  } = deps;

  router.post(
    '/admin/photo-cards/designs',
    adminAuth, requireRole('support'),
    // ═════════════════════════════════════════════════════════════════════
    // دو عکس در یک درخواست: روی کارت و پشتِ کارت
    // ═════════════════════════════════════════════════════════════════════
    //
    // خواستهٔ صریح مالک: «ادمین برای هر عکس کارت ۲ تا عکس بفرسته هم‌زمان
    // هر ۲ عکس آنالیز شن» — رو و پشتِ همان کارتِ فیزیکی.
    //
    // ── چرا هر عکس یک **طرحِ جدا** می‌شود و نه یک طرح با دو تصویر ──
    //
    // روی کارت و پشتِ کارت از نظر تصویری هیچ شباهتی ندارند: یکی طرحِ
    // آماری با پس‌زمینهٔ سفید است، دیگری طرحِ هنری با پس‌زمینهٔ تیره.
    // اندازه‌گیری روی کارت‌های واقعیِ قلقلی: شباهتِ رو و پشتِ Hakimi فقط
    // ۰.۳۸ بود — کمتر از شباهتِ رویِ Hakimi با رویِ Dembélé (۰.۶۵).
    //
    // پس ادغامشان در یک اثرانگشت هر دو را خراب می‌کرد. در عوض هر کدام
    // طرحِ مستقلِ خودش را می‌گیرد و **هر دو به یک `card_type_id` وصل
    // می‌شوند**. کاربر از هر طرف عکس بگیرد، به همان بازیکن می‌رسد.
    //
    // ── چرا در یک تراکنش ──
    //
    // اگر مدیر رو را آپلود کند و درخواستِ دومِ پشت شکست بخورد، کارتی
    // می‌ماند که فقط از یک طرف قابلِ ثبت است — و مدیر نمی‌فهمد. اینجا
    // یا هر دو ثبت می‌شوند یا هیچ‌کدام.
    imageUpload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'imageBack', maxCount: 1 },
    ]),
    asyncHandler(async (req, res) => {
      // ── چرا هر دو شکلِ ورودی پذیرفته می‌شود ──
      //
      // `upload.fields` ورودی را در `req.files` می‌گذارد نه `req.file`.
      // کلاینت‌های قدیمی که هنوز فقط `image` می‌فرستند باید بدونِ تغییر
      // کار کنند، وگرنه اپِ نصب‌شده روی گوشیِ مدیر با ۴۰۰ می‌شکند.
      const front = req.files?.image?.[0] || req.file || null;
      const back = req.files?.imageBack?.[0] || null;
      if (!front) return res.status(400).json({ message: 'تصویری فرستاده نشد' });
      // محتوای واقعیِ هر دو عکس قبل از هر پردازشی راستی‌آزمایی شود — همان
      // تورِ آخرِ مسیرهای پشتیبانی/ادمین (توضیح کامل روی verifyUpload در
      // imageService). فایلِ نامعتبر همان‌جا حذف و ۴۰۰ داده می‌شود.
      for (const side of [front, back].filter(Boolean)) {
        await verifyUpload(side);
      }

      // فایل‌های موقتِ multer باید در هر مسیرِ خروج پاک شوند، وگرنه
      // دیسکِ VPS با هر آپلود چند صد کیلوبایت پر می‌شود.
      const temps = [front, back].filter(Boolean).map(f => f.path);
      let filePath = front.path;
      let filename = front.filename;
      const sides = [{ file: front, label: 'رو', kind: 'front' }];
      if (back) sides.push({ file: back, label: 'پشت', kind: 'back' });
      try {
        const name = String(req.body.name || '').trim();
        const points = Math.max(0, Math.floor(Number(req.body.pointValue || 0)));
        const cash = Math.max(0, Math.floor(Number(req.body.cashAmount || 0)));
        const duel = cardDuel.duelFieldsFromBody(req.body);
        const existingTypeId = req.body.cardTypeId;

        if (!name && !existingTypeId) {
          return res.status(400).json({ message: 'نام کارت را وارد کنید' });
        }

        // ── اثر انگشت از فایل **اصلی** گرفته می‌شود، قبل از بهینه‌سازی ──
        //
        // اگر بعد از فشرده‌سازی گرفته می‌شد، اثر انگشتِ طرح به نسخهٔ
        // فشرده‌شده گره می‌خورد. آن هم کار می‌کرد، ولی کیفیت بالاتر
        // یعنی اثر انگشت دقیق‌تر و طرح تمیزتر برای مقایسه.
        // ── هر دو عکس اثرانگشت می‌گیرند ──
        //
        // `sides` آرایه‌ای از {file, label, fp} است. اگر مدیر فقط یک
        // عکس فرستاده باشد یک عضو دارد، وگرنه دو تا. بقیهٔ مسیر روی
        // همین آرایه حلقه می‌زند، پس افزودنِ عکسِ سوم در آینده فقط
        // تغییرِ `imageUpload.fields` است.
        for (const side of sides) {
          const raw = await fs.promises.readFile(side.file.path);

          // ── برشِ خودکار برای طرحِ مدیر هم ──
          //
          // ⚠️ چرا این هم لازم است: اگر مدیر عکسِ کارت را با حاشیه
          //    آپلود کند و کاربر بدونِ حاشیه بفرستد (یا برعکس)، دو
          //    اثرانگشت روی نواحیِ متفاوتی ساخته می‌شوند و مقایسه
          //    بی‌معنی می‌شود.
          //
          //    بریدنِ **هر دو طرف** با یک قاعده تضمین می‌کند که
          //    اثرانگشت‌ها روی چیزِ یکسانی ساخته شوند.
          let buf = raw;
          try {
            const c = await cardCrop.cropCard(raw);
            if (c.cropped) { buf = c.buffer; side.cropped = c.box; }
          } catch { /* در تردید، تصویرِ اصلی */ }
          side.analysed = buf;

          // همان محافظتِ مسیرِ کاربر: تصویرِ خراب باید ۴۰۰ با پیامِ
          // فارسی بدهد، نه ۵۰۰ با خطای انگلیسیِ VipsJpeg.
          try {
            side.fp = await fpEngine.fingerprint(buf);
          } catch (imgErr) {
            console.warn('[photo-cards] طرحِ غیرقابل‌خواندن:', imgErr.message);
            return res.status(400).json({
              message: `تصویرِ «${side.label}ی کارت» قابل خواندن نبود. `
                + 'لطفاً یک عکس سالم (PNG یا JPG) انتخاب کنید.',
            });
          }
        }
        const fp = sides[0].fp;

        // ── رو و پشت نباید یک عکس باشند ──
        //
        // اشتباهِ کاملاً محتمل: مدیر در انتخابگرِ فایل دوبار همان تصویر
        // را برمی‌دارد. بدونِ این بررسی دو طرحِ **یکسان** ثبت می‌شد، و
        // آن‌وقت شرطِ «حاشیه تا رتبهٔ دوم» هرگز برآورده نمی‌شد — یعنی
        // همهٔ ثبت‌های آن کارت تا ابد به بررسیِ دستی می‌رفتند، بی‌صدا.
        if (sides.length === 2) {
          // `sameImageScore` و نه `similarity` خام: اگر متنِ دو عکس
          // فرق کند قطعاً دو کارتِ متفاوت‌اند، هرچقدر هم تصویرشان
          // شبیه باشد. توضیحِ کامل در خودِ تابع.
          const selfSim = fpEngine.sameImageScore(sides[0].fp, sides[1].fp);
          if (selfSim >= matchSettings.current().duplicateSimilarity) {
            return res.status(409).json({
              message: 'عکسِ رو و پشت تقریباً یکسان‌اند '
                + `(${Math.round(selfSim * 100)}٪ شباهت). احتمالاً یک فایل را `
                + 'دوبار انتخاب کرده‌اید. دو طرحِ همسان باعث می‌شوند سیستم '
                + 'نتواند بینشان تشخیص دهد و همهٔ ثبت‌ها به بررسی دستی بروند.',
              similarity: Number(selfSim.toFixed(3)),
            });
          }
        }

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
          `SELECT d.id, d.dhash, d.phash, d.color_sig, d.tex_sig, d.luma_sig,
                  d.rgb_sig, d.text_tokens, t.name
             FROM photo_card_designs d
             JOIN card_types t ON t.id = d.card_type_id
            WHERE d.is_active = true`,
        );
        for (const row of existing.rows) {
          // بیشترین شباهت در میانِ عکس‌های این درخواست: اگر **هرکدام**
          // از رو یا پشت با طرحِ موجود یکی باشد، باید جلویش گرفته شود.
          let sim = 0;
          let simSide = sides[0];
          for (const side of sides) {
            const v = fpEngine.sameImageScore(side.fp, {
              dhash: row.dhash,
              phash: row.phash,
              colorSig: toFloats(row.color_sig),
              texSig: toFloats(row.tex_sig),
              lumaSig: toFloats(row.luma_sig),
              rgbSig: toFloats(row.rgb_sig),
              textTokens: Array.isArray(row.text_tokens) ? row.text_tokens : [],
            });
            if (v > sim) { sim = v; simSide = side; }
          }
          if (sim >= matchSettings.current().duplicateSimilarity) {
            // ⚠️ اینجا قبلاً `await releaseGuard()` بود — کپی‌شده از مسیرِ
            // «ثبت کاربر». آن تابع فقط در مسیرِ کاربر تعریف می‌شود و
            // اینجا اصلاً وجود ندارد، پس این خط ReferenceError پرتاب
            // می‌کرد و مدیر به‌جای پیامِ راهنمای ۴۰۹، خطای ۵۰۰ با متنِ
            // انگلیسیِ «releaseGuard is not defined» می‌دید.
            //
            // یعنی دقیقاً همان محافظی که برای «آپلودِ تکراری خاموشش
            // نکن» نوشته شده بود، خودش خراب بود: مدیر نمی‌فهمید طرح
            // تکراری است، فقط فکر می‌کرد سرور خراب شده.
            //
            // در این مسیر هیچ قفلی گرفته نشده، پس چیزی برای آزاد کردن
            // نیست و حذفِ خط کافی است.
            return res.status(409).json({
              message: `تصویرِ «${simSide.label}ی کارت» با طرحِ «${row.name}» `
                + 'تقریباً یکسان است '
                + `(${Math.round(sim * 100)}٪ شباهت). دو طرحِ همسان باعث می‌شوند `
                + 'سیستم نتواند بینشان تشخیص دهد و همهٔ ثبت‌ها به بررسی دستی بروند. '
                + 'اگر می‌خواهید جایگزین کنید، اول طرح قبلی را غیرفعال کنید.',
              duplicateOf: row.id,
              similarity: Number(sim.toFixed(3)),
            });
          }
        }

        // ══════════════════════════════════════════════════════════════
        // ⚠️ اثرانگشت باید از **همان فایلی** باشد که ذخیره می‌شود
        // ══════════════════════════════════════════════════════════════
        //
        // ── باگی که مالک با اسکرین‌شات گرفت ──
        //
        // کاربر عکسِ کارتِ Hakimi فرستاد و سیستم «Erling Haaland» حدس
        // زد. بررسیِ پرونده نشان داد OCR **درست** خوانده بود
        // (`HAKIA, MOROCCO`) ولی رتبه‌بندی غلط شد.
        //
        // علت: اثرانگشتِ طرح از تصویرِ **خام** گرفته می‌شد (خط بالاتر)،
        // ولی فایلی که ذخیره و بعداً با عکسِ کاربر مقایسه می‌شود نسخهٔ
        // **بهینه‌شده** است — کوچک‌تر، فشرده‌تر، با فرمتِ webp.
        //
        // دو تصویرِ متفاوت یعنی دو مجموعه توکنِ متفاوت. اندازه‌گیری روی
        // پشتِ کارتِ Haaland:
        //
        //     توکنِ ذخیره‌شده (از خام) : ["ANKZ","#2","#7","#4","#3","#0"]
        //     محاسبهٔ تازه (از بهینه)  : []
        //
        // آن شش توکنِ نویزی در دیتابیس ماندند و در هر مقایسه شرکت
        // می‌کردند. عکسِ Hakimi با `#2` و `#4` به آن‌ها می‌خورد و
        // Haaland را بالا می‌کشید.
        //
        // ⚠️ چرا زودتر لو نرفت: تستِ سرتاسری اثرانگشت را از همان بافرِ
        //    خودش می‌ساخت، پس هر دو طرف یکسان بودند و ناسازگاری دیده
        //    نمی‌شد. فقط دادهٔ واقعیِ ذخیره‌شده در دیتابیس این را نشان
        //    داد.
        //
        // حالا اول بهینه‌سازی، بعد اثرانگشت — از دقیقاً همان بایت‌هایی
        // که روی دیسک می‌نشینند.
        for (const side of sides) {
          const o = await optimizeUpload(side.file);
          side.filename = o.filename;
          side.savedPath = path.join(path.dirname(side.file.path), o.filename);
          side.imageUrl = `/uploads/images/${o.filename}`;

          // اثرانگشتِ نهایی از فایلِ ذخیره‌شده بازساخته می‌شود.
          //
          // برشِ کارت هم دوباره اعمال می‌شود تا مسیرِ ادمین و مسیرِ
          // کاربر **دقیقاً** یک پیش‌پردازش داشته باشند؛ وگرنه طرح با
          // پس‌زمینه ذخیره می‌شود و عکسِ برش‌خوردهٔ کاربر با آن نمی‌خواند.
          try {
            const savedBuf = await fs.promises.readFile(side.savedPath);
            let finalBuf = savedBuf;
            try {
              const c2 = await cardCrop.cropCard(savedBuf);
              if (c2.cropped) finalBuf = c2.buffer;
            } catch { /* در تردید، همان فایلِ ذخیره‌شده */ }
            side.fp = await fpEngine.fingerprint(finalBuf);
          } catch (e) {
            // اگر خواندنِ فایلِ ذخیره‌شده شکست بخورد، اثرانگشتِ مرحلهٔ
            // قبل (از خام) می‌ماند. ناسازگار است ولی از نبودِ طرح بهتر.
            console.warn('[photo-cards] اثرانگشتِ نهایی نشد:', e.message);
          }
        }
        filename = sides[0].filename;
        filePath = sides[0].savedPath;
        const imageUrl = sides[0].imageUrl;

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
            // امتیاز/استات فقط وقتی به‌روز می‌شود که مدیر صریحاً فرستاده باشد.
            if (req.body.pointValue !== undefined || req.body.duelAttack !== undefined
                || req.body.isCollectible !== undefined) {
              await client.query(
                `UPDATE card_types SET point_value=$1,
                    duel_attack=$2, duel_defense=$3, duel_speed=$4,
                    duel_technique=$5, duel_goal_chance=$6, duel_energy=$7,
                    duel_rarity=$8, duel_effect=$9,
                    is_collectible=$10, updated_at=NOW()
                  WHERE id=$11`,
                [points, duel.attack, duel.defense, duel.speed, duel.technique,
                  duel.goalChance, duel.energy, duel.rarity, duel.effect,
                  duel.collectible, cardTypeId],
              );
            }
          } else {
            // ═══════════════════════════════════════════════════════════
            // نامِ تکراری = **همان** کارت، نه یک کارتِ دوم
            // ═══════════════════════════════════════════════════════════
            //
            // ── باگی که این را لازم کرد ──
            //
            // نسخهٔ قبلی بی‌قیدوشرط `INSERT` می‌کرد. مالک برای «Achraf
            // Hakimi» یک بار عکس + ۱۰۰۰ کد ثبت کرد، و چهار دقیقه بعد
            // **عکسِ دومی** از همان بازیکن آپلود کرد (زاویهٔ دیگر، طرحِ
            // دیگر — کارِ کاملاً منطقی).
            //
            // نتیجه: دو ردیفِ `card_types` با نامِ یکسان و دو UUID
            // متفاوت. کدها به اولی گره خوردند، ولی موتورِ تطبیق عکسِ
            // دومی را می‌شناخت. `decideSubmission` می‌دید
            // `best.card_type_id !== expectedTypeId` و **هر ثبت** را با
            // علتِ `type_mismatch` به صف بررسی می‌فرستاد.
            //
            // یعنی: عکس درست، کد درست، شباهت ۵۵٪ — و پیامِ «عکس با
            // کارتِ این کد هم‌خوانی ندارد». مالک در پنل می‌دید که سیستم
            // خودش Hakimi را حدس زده ولی ردش کرده. کاملاً غیرقابل‌فهم.
            //
            // ⚠️ چرا هیچ‌کدام از محافظ‌های موجود این را نگرفتند:
            //    محافظِ «طرحِ تکراری» فقط **تصویر** را می‌سنجد. دو عکسِ
            //    متفاوت از یک بازیکن واقعاً متفاوت‌اند (شباهتِ زیرِ
            //    ۰.۹۳)، پس درست اجازه داد. کسی نامِ کارت را نمی‌سنجید.
            //
            // ── راه‌حل ──
            //
            // اگر نامی که مدیر نوشته از قبل در کاتالوگ هست، طرحِ جدید
            // به **همان** نوع وصل می‌شود. این دقیقاً نیتِ مدیر است:
            // «یک عکسِ دیگر از همین کارت» نه «یک کارتِ جدید با همین
            // نام».
            //
            // چند طرح برای یک نوعِ کارت از اول پشتیبانی می‌شد
            // (`photo_card_designs.card_type_id` کلیدِ خارجیِ ساده است،
            // نه یکتا) — این قابلیت بود، فقط راهی برای رسیدن به آن
            // نبود.
            //
            // مقایسه با `lower(trim())`: «hakimi» و «Hakimi » و
            // «Hakimi» یک کارت‌اند. مدیری که دومی را تایپ می‌کند قصدِ
            // ساختنِ کارتِ جدید ندارد.
            const dup = await client.query(
              `SELECT id, point_value, cash_amount FROM card_types
                WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
              [name],
            );
            if (dup.rows[0]) {
              cardTypeId = dup.rows[0].id;
              // ── چرا امتیاز فقط وقتی به‌روز می‌شود که صریح آمده باشد ──
              //
              // اگر مدیر فقط عکسِ تازه آپلود می‌کند و فیلدِ امتیاز را
              // خالی گذاشته، `points` صفر می‌شود. بازنویسیِ کورکورانه
              // یعنی کارتِ ۳۰۰۰ امتیازی بی‌سروصدا صفر می‌شد — و
              // کاربرانی که بعدش ثبت می‌کردند هیچ امتیازی نمی‌گرفتند.
              if (req.body.pointValue !== undefined
                  || req.body.cashAmount !== undefined) {
                await client.query(
                  `UPDATE card_types
                      SET point_value = $1, cash_amount = $2,
                          duel_attack=$3, duel_defense=$4, duel_speed=$5,
                          duel_technique=$6, duel_goal_chance=$7, duel_energy=$8,
                          duel_rarity=$9, duel_effect=$10,
                          is_collectible=$11, updated_at = NOW()
                    WHERE id = $12`,
                  [points, cash, duel.attack, duel.defense, duel.speed,
                    duel.technique, duel.goalChance, duel.energy,
                    duel.rarity, duel.effect, duel.collectible, cardTypeId],
                );
              }
            } else {
              // نوع کارت تازه در همان کاتالوگ موجود ساخته می‌شود، پس
              // اینونتوری و جوایز پلکانی بدون هیچ تغییری کار می‌کنند.
              const ins = await client.query(
                `INSERT INTO card_types(name, image_url, point_value, cash_amount, is_active,
                    duel_attack, duel_defense, duel_speed, duel_technique,
                    duel_goal_chance, duel_energy, duel_rarity, duel_effect,
                    is_collectible)
                 VALUES($1, $2, $3, $4, true, $5,$6,$7,$8,$9,$10,$11,$12,$13)
                 RETURNING id`,
                [name, imageUrl, points, cash, duel.attack, duel.defense,
                  duel.speed, duel.technique, duel.goalChance, duel.energy,
                  duel.rarity, duel.effect, duel.collectible],
              );
              cardTypeId = ins.rows[0].id;
            }
          }

          // ── یک طرح به ازای هر عکس، همه به یک نوعِ کارت ──
          //
          // این قلبِ قابلیتِ «رو و پشت» است: دو ردیفِ `photo_card_designs`
          // با اثرانگشت‌های کاملاً متفاوت، ولی هر دو با یک
          // `card_type_id`. کاربر از هر طرف عکس بگیرد، `decideSubmission`
          // به همان بازیکن می‌رسد و کد درست مصرف می‌شود.
          const inserted = [];
          for (const side of sides) {
            const r = await client.query(
              `INSERT INTO photo_card_designs
                 (card_type_id, side, image_url, dhash, phash, color_sig, tex_sig,
                  luma_sig, rgb_sig, text_tokens, width, height, created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               RETURNING id, side, image_url, width, height, created_at`,
              [cardTypeId, side.kind, side.imageUrl, side.fp.dhash, side.fp.phash,
                side.fp.colorSig, side.fp.texSig, side.fp.lumaSig,
                side.fp.rgbSig, side.fp.textTokens || [],
                side.fp.width, side.fp.height, req.admin.id],
            );
            inserted.push({ ...r.rows[0], sideLabel: side.label });
          }
          const d = { rows: inserted };

          // ═══════════════════════════════════════════════════════════
          // کدهای اختصاصیِ همین کارت — اختیاری، در همان درخواست
          // ═══════════════════════════════════════════════════════════
          //
          // خواستهٔ مالک: «هم باید بتونه یه قسمت دیگه برای هر عکس یه کد
          // یا تعداد بالایی کد ثبت کنه».
          //
          // چرا در همین مسیر و نه یک درخواستِ دوم از کلاینت: اگر کلاینت
          // اول طرح را بسازد و بعد کدها را بفرستد، شکستِ درخواستِ دوم
          // یک کارتِ بدونِ کد باقی می‌گذارد و مدیر نمی‌فهمد. اینجا هر
          // دو در **یک تراکنش**‌اند: یا هر دو یا هیچ‌کدام.
          let codeReport = null;
          const rawCodes = String(req.body.rawCodes || '').trim();
          if (rawCodes) {
            const toks = rawCodes.split(/[\n,;\t، ]+/)
              .map(x => x.trim()).filter(Boolean)
              .map(x => photoCards.normalizePhotoCode(x));
            const seen = new Set();
            const valid = [];
            let invalid = 0;
            for (const t of toks) {
              if (!photoCards.isValidPhotoCode(t)) { invalid += 1; continue; }
              const k = photoCards.foldPhotoCode(t);
              if (seen.has(k)) continue;
              seen.add(k);
              valid.push(t);
            }
            if (valid.length > MAX_BATCH) {
              throw Object.assign(new Error(
                `در هر نوبت حداکثر ${MAX_BATCH.toLocaleString('en-US')} کد `
                + 'قابل ثبت است'), { status: 400 });
            }
            let insertedCount = 0;
            if (valid.length) {
              const ins = await client.query(
                `INSERT INTO photo_card_codes(code, batch_label, expected_card_type_id)
                 SELECT unnest($1::citext[]), $2, $3
                 ON CONFLICT (code_fold) DO NOTHING
                 RETURNING id`,
                [valid, String(req.body.batchLabel || '').trim().slice(0, 80) || null,
                  cardTypeId],
              );
              insertedCount = ins.rows.length;
            }
            codeReport = {
              insertedCount,
              duplicateCount: valid.length - insertedCount,
              invalidCount: invalid,
            };
          }

          await audit(req.admin.id, 'create_photo_card_design', 'photo_card_designs',
            d.rows[0].id, null, { name, points, cash, imageUrl, codeReport }, client);
          await client.query('COMMIT');

          const sideNote = sides.length > 1 ? ' (رو و پشت)' : '';
          res.json({
            // `design` تکی برای سازگاری با کلاینت‌های قدیمی می‌ماند؛
            // `designs` فهرستِ کاملِ آنچه واقعاً ساخته شد.
            design: d.rows[0],
            designs: d.rows,
            sideCount: sides.length,
            cardTypeId,
            codeReport,
            message: codeReport
              ? `کارت${sideNote} ثبت شد و `
                + `${codeReport.insertedCount.toLocaleString('en-US')} `
                + 'کد اختصاصی به آن گره خورد'
              : `کارت${sideNote} ثبت شد و اثر انگشت تصویر ساخته شد`,
          });
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      } catch (e) {
        // ── آپلودِ ناموفق نباید فایلِ یتیم روی دیسک بگذارد ──
        //
        // با دو عکس این مهم‌تر شد: اگر درجِ عکسِ دوم شکست بخورد،
        // تراکنش برمی‌گردد ولی **هر دو فایل** روی دیسک مانده‌اند.
        // `temps` نسخهٔ خام و `sides` نسخهٔ بهینه را پوشش می‌دهد.
        for (const t of temps) safeUnlink(t);
        for (const side of sides) safeUnlink(side.savedPath);
        safeUnlink(filePath);
        throw e;
      } finally {
        // نسخهٔ خامِ multer بعد از بهینه‌سازی دیگر لازم نیست — چه
        // موفق چه ناموفق. بدونِ این، هر آپلود دو فایل روی دیسک
        // می‌گذارد به‌جای یکی.
        for (const t of temps) {
          if (t !== filePath) safeUnlink(t);
        }
      }
    }),
  );

};
