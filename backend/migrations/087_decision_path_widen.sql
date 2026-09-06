-- ۰۸۷: پهن‌کردن ستون‌های مسیر/علتِ تصمیمِ ثبت کارت
--
-- باگ زنده (مهر ۱۴۰۵): بعد از آن‌که لایهٔ هویتِ عصبی به تصمیم وصل شد،
-- تصمیم‌های مسیرِ `identity_override` ممکن شدند — اما این رشته ۱۷ کاراکتر
-- است و ستون `decision_path` فقط varchar(16) بود. نتیجه: خطای 22001
-- «value too long for type character varying(16)» هنگامِ تأییدِ خودکارِ
-- کارتی که هویت عصبی برنده بود (مثلاً عکسِ پشتِ هالند).
--
-- مقادیرِ ممکنِ فعلی:
--   decision_path: code_bound(10) · image_match(11) · identity_override(17)
--   review_reason: تا code_mismatch_suspected(23) در varchar(24) جا می‌شد،
--     ولی برای حاشیهٔ امن هر دو پهن می‌شوند تا افزودنِ علتِ آینده دوباره
--     سرریز ندهد.
--
-- ALTER TYPE فقط محدودیت را شل می‌کند؛ دادهٔ موجود بی‌تأثیر می‌ماند.

BEGIN;

ALTER TABLE photo_card_submissions
  ALTER COLUMN decision_path TYPE VARCHAR(32);

ALTER TABLE photo_card_submissions
  ALTER COLUMN review_reason TYPE VARCHAR(48);

COMMIT;
