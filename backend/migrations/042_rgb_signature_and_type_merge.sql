-- ═══════════════════════════════════════════════════════════════════════════
-- ۱) امضای رنگِ فضایی (rgb_sig) · ۲) ادغامِ نوع‌کارت‌های هم‌نام
-- ═══════════════════════════════════════════════════════════════════════════
--
-- این دو تغییر در یک مایگریشن‌اند چون هر دو ریشهٔ **یک شکایت** بودند:
-- «سیستم تشخیص عکس کاملاً غلط کار می‌کند».
--
-- ───────────────────────────────────────────────────────────────────────────
-- بخش ۱ — ستونِ rgb_sig
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ درسی که با `tex_sig` گرفته شد و اینجا تکرار نمی‌شود:
--    آن بار سیگنال به اثرانگشت اضافه شد ولی ستونش به دیتابیس نه. نتیجه
--    این بود که مقدار محاسبه می‌شد، دور ریخته می‌شد، و موقعِ مقایسه
--    `hasTex` همیشه false بود — یعنی کدِ جدید نوشته شده بود ولی هیچ‌وقت
--    اجرا نمی‌شد. کسی متوجه نشد چون خطایی نمی‌داد.
--
-- ── چرا این سیگنال لازم شد ──
--
-- اندازه‌گیری روی چهار کارتِ واقعیِ قلقلی نشان داد کارتِ Hakimi و کارتِ
-- Dembélé نمرهٔ ۰.۶۵ می‌گیرند — بالاتر از آستانهٔ تأییدِ ۰.۵۵. یعنی موتور
-- با اطمینان کارتِ اشتباه را انتخاب می‌کرد.
--
-- علتش وقتی روشن شد که خودِ تصاویر کنار هم گذاشته شدند: هر دو «روی»
-- کارت‌اند و قالبِ کاملاً یکسان دارند — پس‌زمینهٔ سفید، جامِ جهانی در
-- بالا-چپ، نوارِ عمودیِ LIMITED، سه خانهٔ آمار در پایین. تنها تفاوتِ
-- واقعی رنگِ پیراهن است (قرمزِ مراکش در برابر آبیِ فرانسه) و هیچ‌کدام از
-- سیگنال‌های قبلی آن را نمی‌دیدند:
--
--   • dHash و pHash روی خاکستری کار می‌کنند — رنگ را کاملاً دور می‌ریزند
--   • color_sig شبکهٔ ۴×۴ دارد و فقط «فام» را می‌شمارد، بدونِ روشنایی
--   • tex_sig و luma_sig قالبِ مشترک را می‌دیدند، نه محتوا را
--
-- `rgb_sig` میانگینِ RGB در شبکهٔ ۸×۸ است (۱۹۲ عدد) و مستقیماً می‌گوید
-- «خانهٔ وسط-چپ قرمزِ تیره است» یا «آبیِ روشن است».
--
-- نتیجه روی همان مجموعه: از ۲۳/۲۴ با ۱۱ تأییدِ خودکار به ۲۴/۲۴ با ۲۱
-- تأییدِ خودکار.

ALTER TABLE photo_card_designs
  ADD COLUMN IF NOT EXISTS rgb_sig REAL[];

ALTER TABLE photo_card_submissions
  ADD COLUMN IF NOT EXISTS img_rgb REAL[];

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۲ — ادغامِ نوع‌کارت‌های هم‌نام
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── باگ ──
--
-- مسیرِ آپلودِ طرح بی‌قیدوشرط `INSERT INTO card_types` می‌کرد. مالک برای
-- «Achraf Hakimi» یک بار عکس + ۱۰۰۰ کد ثبت کرد، و چهار دقیقه بعد عکسِ
-- **دومی** از همان بازیکن آپلود کرد (پشتِ کارت — کارِ کاملاً منطقی).
--
-- نتیجه: دو ردیفِ `card_types` با نامِ یکسان و دو UUID متفاوت. کدها به
-- اولی گره خوردند، ولی موتورِ تطبیق عکسِ دومی را می‌شناخت.
-- `decideSubmission` می‌دید `best.card_type_id !== expectedTypeId` و
-- **هر ثبت** را با علتِ `type_mismatch` به صف بررسی می‌فرستاد.
--
-- یعنی: عکس درست، کد درست، شباهتِ ۵۵٪ — و پیامِ «عکس با کارتِ این کد
-- هم‌خوانی ندارد». در پنل دیده می‌شد که سیستم خودش Hakimi را حدس زده
-- ولی ردش کرده. کاملاً غیرقابل‌فهم.
--
-- هیچ‌کدام از محافظ‌های موجود این را نگرفتند: محافظِ «طرحِ تکراری» فقط
-- تصویر را می‌سنجد، و رو و پشتِ یک کارت واقعاً متفاوت‌اند. کسی نامِ کارت
-- را نمی‌سنجید.
--
-- ── ادغام ──
--
-- برای هر نام، قدیمی‌ترین ردیف «بازمانده» می‌شود و بقیه به آن نگاشت
-- می‌شوند. ترتیبِ عملیات مهم است: اول ارجاع‌ها، آخر حذفِ خودِ ردیف.

DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT lower(trim(name)) AS key,
           (array_agg(id ORDER BY created_at))[1] AS keep_id,
           array_agg(id ORDER BY created_at) AS all_ids
      FROM card_types
     GROUP BY lower(trim(name))
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'ادغامِ % نسخه از «%» در %',
      array_length(dup.all_ids, 1), dup.key, dup.keep_id;

    UPDATE photo_card_designs SET card_type_id = dup.keep_id
     WHERE card_type_id = ANY(dup.all_ids) AND card_type_id <> dup.keep_id;

    UPDATE photo_card_codes SET expected_card_type_id = dup.keep_id
     WHERE expected_card_type_id = ANY(dup.all_ids)
       AND expected_card_type_id <> dup.keep_id;

    UPDATE card_codes SET card_type_id = dup.keep_id
     WHERE card_type_id = ANY(dup.all_ids) AND card_type_id <> dup.keep_id;

    -- ⚠️ اینونتوری ایندکسِ یکتای (user_id, card_type_id) دارد که فقط
    --    روی `consumed_in_reward = false` اعمال می‌شود. اگر کاربری از
    --    هر دو نسخه کارت داشته باشد، `UPDATE` ساده با خطای یکتایی
    --    شکست می‌خورد. پس اول تعدادها جمع می‌شوند و بعد ردیفِ اضافه
    --    حذف — وگرنه کاربر بی‌سروصدا یکی از کارت‌هایش را از دست می‌داد.
    UPDATE user_card_inventory k
       SET quantity = k.quantity + x.extra
      FROM (
        SELECT user_id, sum(quantity) AS extra
          FROM user_card_inventory
         WHERE card_type_id = ANY(dup.all_ids)
           AND card_type_id <> dup.keep_id
           AND consumed_in_reward = false
         GROUP BY user_id
      ) x
     WHERE k.user_id = x.user_id
       AND k.card_type_id = dup.keep_id
       AND k.consumed_in_reward = false;

    -- کاربرانی که فقط از نسخهٔ تکراری داشتند: ردیفشان منتقل می‌شود.
    UPDATE user_card_inventory u
       SET card_type_id = dup.keep_id
     WHERE u.card_type_id = ANY(dup.all_ids)
       AND u.card_type_id <> dup.keep_id
       AND NOT EXISTS (
         SELECT 1 FROM user_card_inventory k
          WHERE k.user_id = u.user_id
            AND k.card_type_id = dup.keep_id
            AND k.consumed_in_reward = u.consumed_in_reward
       );

    DELETE FROM user_card_inventory
     WHERE card_type_id = ANY(dup.all_ids) AND card_type_id <> dup.keep_id;

    -- جوایزِ پلکانی هم ممکن است به نوعِ کارت ارجاع بدهند.
    BEGIN
      EXECUTE format(
        'UPDATE reward_required_cards SET card_type_id = %L
          WHERE card_type_id = ANY(%L) AND card_type_id <> %L',
        dup.keep_id, dup.all_ids, dup.keep_id);
    EXCEPTION WHEN undefined_table THEN
      NULL;   -- این جدول در بعضی نصب‌ها وجود ندارد
    END;

    DELETE FROM card_types
     WHERE id = ANY(dup.all_ids) AND id <> dup.keep_id;
  END LOOP;
END $$;

-- ── لایهٔ دفاعیِ دوم: دیتابیس اجازهٔ نامِ تکراری نمی‌دهد ──
--
-- گاردِ برنامه‌ای در `photoCards.js` نصب شد، ولی مسیرِ دومی هم هست
-- (`POST /api/admin/card-types` در `server.js`) و ممکن است فردا سومی
-- اضافه شود. ایندکسِ یکتا تنها جایی است که هیچ مسیری نمی‌تواند دورش
-- بزند.
--
-- روی `lower(trim(name))` تا «hakimi» و «Hakimi » و «Hakimi» یکی
-- شمرده شوند — همان قاعده‌ای که گاردِ برنامه‌ای استفاده می‌کند.
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_types_name_ci
  ON card_types (lower(trim(name)));
