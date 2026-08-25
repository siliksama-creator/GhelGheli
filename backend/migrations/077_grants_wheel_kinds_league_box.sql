-- ═══════════════════════════════════════════════════════════════════════════
-- جایزهٔ صندوق/آیتم/پلاس در گردونه و لیگ + موجودیِ بازنشده
-- ═══════════════════════════════════════════════════════════════════════════
--
-- خواستهٔ مالک:
--   «گردونه شانس هم امکان تغییر محتویات اش چه ظاهری چه درونی در پنل
--    ادمین امکان پذیر باشه»
--   «جوایز لیگ رو بتونه تا هر تعداد کاربر که خواست مشخص کنه و حتی بعضی
--    جایزه هارو پلاس یا صندوق جایزه یا آیتم های فروشگاه قرار بده»
--   «اگه صندوق بردن پیام بردن صندوق بیاد و کاربرها بتونن صندوق کارت رو
--    باز کنن»
--
-- ── چرا جدولِ جدا برای «جایزهٔ بازنشده» ──
--
-- خریدِ صندوق از فروشگاه همان لحظه باز می‌شود: کاربر پول داده تا کارت
-- ببیند. جایزهٔ گردونه/لیگ فرق دارد: صندوق باید **مالِ کاربر** بشود ولی
-- تا وقتی خودش بازش نکرده کارت بیرون نیاید. اگر همان لحظهٔ برد قرعه
-- می‌زدیم، انیمیشنِ باز شدن دروغ می‌شد (کارت از قبل معلوم بود) و کاربری
-- که اپ را نبسته بود پیام «بردی» را می‌دید ولی صفحه‌ای برای باز کردن
-- نداشت.
--
-- `user_item_grants` همان صندوقِ بسته‌ای است که روی قفسه می‌ماند.
-- `opened_at IS NULL` یعنی هنوز باز نشده.

-- ── انواعِ تازهٔ جایزهٔ گردونه ───────────────────────────────────────────
--
-- تا امروز CHECK فقط points/cash می‌پذیرفت. بدونِ این، ذخیرهٔ «صندوق کارت»
-- از پنل به قید می‌خورد و مدیر پیامِ مبهمِ دیتابیس می‌گرفت.
ALTER TABLE wheel_prizes
  DROP CONSTRAINT IF EXISTS wheel_prizes_kind_check;
ALTER TABLE wheel_prizes
  ADD CONSTRAINT wheel_prizes_kind_check
  CHECK (kind IN ('points', 'cash', 'card_box', 'shop_item', 'plus_days'));

-- slug آیتمِ شاپ (فقط برای kind='shop_item'). JSON است تا فردا فیلدِ
-- دیگری (مثلاً تعداد صندوق) بدون مایگریشن تازه جا شود.
ALTER TABLE wheel_prizes
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN wheel_prizes.payload IS
  'جزئیات جایزهٔ غیرعددی: {itemSlug} برای shop_item';

-- مقدارِ صفر برای صندوق معنا دارد (خودِ صندوق جایزه است، عددش ۱ می‌ماند).
-- قیدِ قدیمی `value > 0` برای points/cash درست است و برای بقیه هم value=1
-- می‌گذاریم، پس قید عوض نمی‌شود.

-- ── نوعِ تازه در جایزهٔ غیرنقدیِ لیگ ─────────────────────────────────────
ALTER TABLE league_perk_awards
  DROP CONSTRAINT IF EXISTS league_perk_awards_kind_check;
ALTER TABLE league_perk_awards
  ADD CONSTRAINT league_perk_awards_kind_check
  CHECK (kind IN ('plus_days', 'shop_item', 'points', 'card_box'));

-- ── موجودیِ جایزه‌های بازنشده ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_item_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- card_box تا باز شدن pending می‌ماند؛ shop_item و plus_days همان لحظه
  -- تحویل می‌شوند و opened_at پر است (سندِ تاریخچه).
  kind        VARCHAR(24) NOT NULL
              CHECK (kind IN ('card_box', 'shop_item', 'plus_days')),
  value       INTEGER NOT NULL DEFAULT 1 CHECK (value >= 0),
  item_slug   VARCHAR(64),
  label       VARCHAR(160),
  source      VARCHAR(24) NOT NULL
              CHECK (source IN ('wheel', 'league', 'admin')),
  source_ref  UUID,
  box_id      UUID REFERENCES card_box_purchases(id) ON DELETE SET NULL,
  opened_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grants_user_pending
  ON user_item_grants (user_id, created_at DESC)
  WHERE opened_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grants_user_all
  ON user_item_grants (user_id, created_at DESC);

-- یک چرخش/جایزه نباید دو بار صندوق بدهد. منبع+مرجع یکتاست وقتی مرجع هست.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grants_source_ref
  ON user_item_grants (source, source_ref)
  WHERE source_ref IS NOT NULL;

COMMENT ON TABLE user_item_grants IS
  'جایزه‌های غیرنقدیِ بازنشده (صندوق) یا تحویل‌شده (آیتم/پلاس) از گردونه و لیگ';
