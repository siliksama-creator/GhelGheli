-- 085 — فاز ۳ (لایهٔ چهرهٔ بازیکن / face embedding) حالتِ سایه
--
-- چهره یک سیگنالِ **متعامد** با مدلِ کل‌کارت است:
--   • مدل کل‌کارت، «طرح/قالبِ کارت» را می‌شناسد (همان بازیکن با قالب نقره‌ای
--     و معمولی برایش متفاوت است) — این برای جفت‌کردن عکس با کد درست لازم است.
--   • مدل چهره، «خودِ بازیکن» را عرضِ قالب می‌شناسد (نقره‌ای و معمولیِ یک
--     بازیکن را به هم نزدیک می‌کند).
--
-- چون چهره نمی‌تواند نوع/ارزش/یکتابودنِ کارت را بگوید، در تصمیمِ تایپِ کارت
-- دخالت نمی‌کند؛ مثل فاز ۲ اول فقط **ضبط و راستی‌آزمایی (shadow)** می‌شود.
-- این migration فقط ستون/میدان اضافه می‌کند و هیچ منطق تصمیمی را عوض نمی‌کند.

-- ── ۱. بردارِ چهرهٔ مرجع روی طرح (فقط طرح‌های «رو» چهره دارند) ──
ALTER TABLE photo_card_designs
  ADD COLUMN IF NOT EXISTS face_embedding JSONB,
  ADD COLUMN IF NOT EXISTS face_embedding_version INTEGER;

-- ── ۲. بردارِ چهرهٔ عکسِ کاربر هنگام ثبت (ممیزی/سنجش توافق) ──
ALTER TABLE photo_card_submissions
  ADD COLUMN IF NOT EXISTS img_face_embedding JSONB,
  ADD COLUMN IF NOT EXISTS face_embedding_version INTEGER,
  -- شباهت چهره با طرحِ تصمیم‌شده و شلوغ‌ترین تطبیق چهره (shadow)
  ADD COLUMN IF NOT EXISTS face_match_score DOUBLE PRECISION;

-- ── ۳. میدان‌های چهره در جدولِ تجمیعیِ توافق ──
ALTER TABLE photo_card_embedding_agreement
  ADD COLUMN IF NOT EXISTS face_agreed BOOLEAN,
  ADD COLUMN IF NOT EXISTS face_match_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS face_embedding_version INTEGER;

CREATE INDEX IF NOT EXISTS idx_pcd_face
  ON photo_card_designs(face_embedding_version)
  WHERE face_embedding IS NOT NULL;
