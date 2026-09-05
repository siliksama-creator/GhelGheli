-- ════════════════════════════════════════════════════════════════════════
-- 083 — ارتقای یکپارچهٔ تشخیص کارت: هویتِ بازیکن (واژه‌نامه) + جایِ embedding
-- ════════════════════════════════════════════════════════════════════════
--
-- این مایگریشن زیرساختِ داده برای فاز ۰ و فاز ۲ نقشه‌راه است:
--
--   ۱. player_lexemes / player_number روی card_types: نامِ لاتینِ بازیکن به
--      توکن‌های نرمال‌شده تجزیه می‌شود تا OCRِ نویزیِ عکس کاربر بتواند با
--      «واژه‌نامهٔ بازیکنان» تطبیق فازی بخورد (به‌جای تطبیقِ زیررشته‌ایِ ساده).
--      این قوی‌ترین سیگنالِ هویت است و تفکیکِ هم‌تیمی‌ها (هالند/رودری) را
--      ممکن می‌کند حتی وقتی قالب و رنگ یکی است.
--
--   ۲. embedding / embedding_version روی photo_card_designs: جایِ بردارِ عصبی
--      (فاز ۲). حالا NULL است؛ وقتی مدلِ embedding (روی گوشی یا سرویس) وصل شد،
--      بردار اینجا ذخیره می‌شود بدون نیاز به مهاجرتِ ساختاری. افزونه‌ای لازم
--      نیست (JSONB) چون مقایسهٔ برداری در لایهٔ برنامه انجام می‌شود.
--
-- ⚠️ هیچ رفتارِ فعلی تغییر نمی‌کند: ستون‌ها nullable و افزودنی‌اند و موتورِ
--    قدیمیِ اثر انگشت دست‌نخورده می‌ماند.

ALTER TABLE card_types
  ADD COLUMN IF NOT EXISTS player_lexemes TEXT[],
  ADD COLUMN IF NOT EXISTS player_number  VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_card_types_lexemes
  ON card_types USING GIN (player_lexemes);

ALTER TABLE photo_card_designs
  ADD COLUMN IF NOT EXISTS embedding         JSONB,
  ADD COLUMN IF NOT EXISTS embedding_version INTEGER;

-- ── Backfill: توکن‌های لاتینِ نامِ بازیکن (بخشِ قبل از «·» که نسخه است) ──
--
-- نام‌ها شکل‌هایی مثل «Erling Haaland» یا «Kylian Mbappé · نقره‌ای» دارند.
-- بخشِ بعد از «·» نسخه/کمیابی است و هویت نیست، پس دور ریخته می‌شود.
-- کلماتِ ≥۳ حرفیِ لاتین گرفته می‌شوند تا پسوندهای تک‌حرفیِ نسخه (N، s) و
-- حروف‌ربطِ کوتاه (De، Van) نقشِ هویتی نگیرند؛ نام‌خانوادگی کلید است.
UPDATE card_types c
SET player_lexemes = sub.lex
FROM (
  SELECT id,
         COALESCE(array_agg(lower(m.w)), '{}'::text[]) AS lex
    FROM card_types
    CROSS JOIN LATERAL
      regexp_matches(split_part(name, '·', 1), '[A-Za-zÀ-ÿ]{3,}', 'g') AS m(w)
   GROUP BY id
) sub
WHERE c.id = sub.id
  AND c.player_lexemes IS NULL;

-- کارت‌هایی که هیچ توکن لاتین نداشتند (مثلاً نام فارسی خالص) آرایهٔ خالی می‌گیرند
-- تا «هیچ واژه‌نامه‌ای» از NULL (ستون پرنشده) قابل تفکیک باشد.
UPDATE card_types
   SET player_lexemes = '{}'::text[]
 WHERE player_lexemes IS NULL;

-- توکنِ شمارهٔ پیراهن هم از متنِ OCRِ تأییدشدهٔ طرح‌ها استخراج می‌شود تا اگر
-- ادمین بعداً خواست شماره را صریح بگذارد دادهٔ اولیه موجود باشد (best-effort؛
-- شماره فقط در حضورِ نام معتبر است و این فقط یک کمک است، نه منبعِ تصمیم).
-- (عمداً خالی رها می‌شود؛ شماره را ادمین/مدل تعیین می‌کند تا حدسِ غلط وارد
--  داده نشود.)
