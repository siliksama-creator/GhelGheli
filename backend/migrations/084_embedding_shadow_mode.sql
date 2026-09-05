-- 084 — فاز ۲ (embedding) حالتِ سایه (Shadow Mode)
--
-- هدف: بردارِ عصبی (embedding)ِ مدلِ روی‌گوشی را **فقط ضبط و راستی‌آزمایی**
-- کنیم، بدون آنکه هنوز در تصمیمِ ثبت دخالت کند. طبق نقشهٔ راه (فاز ۲-۳) مدل
-- اول چند هفته فقط «نظر می‌دهد»؛ نظرش کنار نظر موتور و تصمیمِ ادمین ذخیره
-- می‌شود تا بعد بسنجیم «اگر مدل تصمیم می‌گرفت چند درصد با ادمین موافق بود».
--
-- این migration فقط ستون/جدول اضافه می‌کند و هیچ منطقِ تصمیمی را عوض نمی‌کند.

-- ── ۱. بردارِ کاربر هنگام ثبت (برای ممیزی و سنجشِ توافق) ──
ALTER TABLE photo_card_submissions
  ADD COLUMN IF NOT EXISTS img_embedding JSONB,
  ADD COLUMN IF NOT EXISTS embedding_version INTEGER,
  -- نظرِ لایهٔ هویتِ عصبی در لحظهٔ ثبت (shadow؛ در تصمیم دخالت نمی‌کند)
  ADD COLUMN IF NOT EXISTS identity_top_design_id UUID,
  ADD COLUMN IF NOT EXISTS identity_top_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS identity_margin DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS identity_by_embedding BOOLEAN DEFAULT false;

-- ── ۲. جدولِ تجمیعیِ توافقِ مدل با تصمیمِ نهایی (ادمین/خودکار) ──
--
-- هر بار که پرونده‌ای تعیین‌تکلیف می‌شود (خودکار یا دستیِ ادمین)، اگر برداری
-- در کار بوده یک ردیف اینجا ثبت می‌شود: مدل کدام کارت را می‌گفت و در عمل
-- چه کارتی تأیید شد. داشبوردِ ادمین از روی همین جدول نرخِ توافق را نشان
-- می‌دهد؛ مدل فقط وقتی به تصمیم وصل می‌شود که این نرخ از آستانه (مثلاً ۹۹٪)
-- بگذرد.
CREATE TABLE IF NOT EXISTS photo_card_embedding_agreement (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submission_id   UUID REFERENCES photo_card_submissions(id) ON DELETE SET NULL,
  model_card_type_id   UUID,          -- کارتی که مدلِ عصبی رتبهٔ اول می‌داد
  model_design_id      UUID,
  model_score     DOUBLE PRECISION,
  model_margin    DOUBLE PRECISION,
  final_card_type_id   UUID,          -- کارتی که در عمل تأیید شد
  decided_by      TEXT,               -- 'auto' | 'admin'
  agreed          BOOLEAN NOT NULL,   -- آیا نظر مدل با تصمیمِ نهایی یکی بود
  embedding_version INTEGER
);

CREATE INDEX IF NOT EXISTS idx_pcea_created
  ON photo_card_embedding_agreement(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcea_agree
  ON photo_card_embedding_agreement(agreed, created_at DESC);
