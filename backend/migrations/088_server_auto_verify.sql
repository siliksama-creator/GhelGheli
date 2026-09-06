-- ۰۸۸ — تأییدِ خودکارِ صفِ بررسی توسط سرور (فاز ۴)
--
-- چرا این مایگریشن:
--   موبایل بردار بصریِ ضعیف/کوچک می‌فرستد و برشِ چهره ندارد؛ برای همین بخشی از
--   کارت‌های سالم به‌خاطر حاشیهٔ کم به صف می‌روند. سرور عکسِ کامل را نگه می‌دارد
--   و می‌تواند همان خط‌لولهٔ وب (یونِت + س‌فیس + امبد کارت) را اجرا کند. اینجا
--   ستون‌های ذخیرهٔ «نظرِ سرور» و بردارهای مرجعِ تولیدشده روی خود سرور اضافه
--   می‌شود.
--
--   • designs.server_embedding / .server_face_embedding: بردارهایی که مدلِ روی
--     سرور از تصویر رسمیِ کارت می‌سازد (سیب با سیب مقایسه شود، نه بردارِ گوشی با
--     بردارِ سرور).
--   • submissions.server_verify: نتیجهٔ بازبینیِ سرور (نام بازیکن، نمره‌ها،
--     تصمیم) به‌صورت jsonb برای ممیزی و نمایش در پنل ادمین.
--   • decision_path پهن می‌شود تا «server_auto» جا شود.

ALTER TABLE photo_card_designs
  ADD COLUMN IF NOT EXISTS server_embedding      jsonb,
  ADD COLUMN IF NOT EXISTS server_face_embedding jsonb,
  ADD COLUMN IF NOT EXISTS server_embedding_version      integer,
  ADD COLUMN IF NOT EXISTS server_face_embedding_version integer;

ALTER TABLE photo_card_submissions
  ADD COLUMN IF NOT EXISTS server_verify jsonb;

-- تصمیم‌های خودکارِ سرور باید قابل‌تفکیک باشند.
ALTER TABLE photo_card_submissions
  DROP CONSTRAINT IF EXISTS photo_card_submissions_decision_path_chk;
-- decision_path از قبل در ۰۸۷ پهن شده؛ اینجا فقط از جا شدنِ مقدار جدید مطمئن می‌شویم.
ALTER TABLE photo_card_submissions
  ALTER COLUMN decision_path TYPE varchar(40);

CREATE INDEX IF NOT EXISTS idx_pcd_server_face
  ON photo_card_designs (server_face_embedding_version)
  WHERE server_face_embedding IS NOT NULL;
