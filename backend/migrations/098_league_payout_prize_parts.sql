-- 098_league_payout_prize_parts.sql
--
-- هر جایزهٔ لیگ — نقدی، امتیازی یا اشتراکِ پلاس — باید از یک صفِ تأیید
-- رد شود و بعد متناسب با نوعش تحویل داده شود:
--
--   نقدی     → واریز به کیف پول
--   امتیازی  → افزوده‌شدن به امتیازِ کاربر
--   پلاس     → فعال‌شدنِ اشتراک به تعدادِ روزهای تعیین‌شده
--
-- تا پیش از این، فقط بخشِ نقدی ردیفِ `league_payouts` می‌گرفت و جوایزِ
-- غیرنقدی همان لحظهٔ بستنِ فصل بی‌صدا تحویل می‌شدند. یعنی مدیر هیچ صفی
-- برای تأییدِ «امتیاز» و «پلاس» نمی‌دید و اگر جدولِ رتبه‌بندی خراب بود،
-- آن‌ها از قبل رفته بودند.
--
-- قیدِ UNIQUE(league_season_id, user_id) از مایگریشن ۰۱۴ سرِ جایش است،
-- پس بخش‌های نقدی و غیرنقدیِ **یک** برنده در **یک** ردیف می‌نشینند و
-- تأییدِ مدیر هر دو را با هم آزاد می‌کند.

ALTER TABLE league_payouts ADD COLUMN IF NOT EXISTS perk_kind text;
ALTER TABLE league_payouts ADD COLUMN IF NOT EXISTS perk_value integer;
ALTER TABLE league_payouts ADD COLUMN IF NOT EXISTS perk_item_slug text;
ALTER TABLE league_payouts ADD COLUMN IF NOT EXISTS perk_label text;

-- انواعِ قابل‌تحویل، همان‌هایی که `deliverPerk` می‌شناسد. اضافه‌کردنِ نوعِ
-- تازه بدونِ آپدیتِ آن تابع یعنی ردیفی که تأیید می‌شود و هیچ نمی‌دهد؛
-- پس این قید عمداً سخت است.
ALTER TABLE league_payouts DROP CONSTRAINT IF EXISTS league_payouts_perk_kind_check;
ALTER TABLE league_payouts ADD CONSTRAINT league_payouts_perk_kind_check
  CHECK (perk_kind IS NULL OR perk_kind IN ('points', 'plus_days', 'shop_item', 'card_box'));

-- مقدارِ جایزهٔ غیرنقدی نمی‌تواند منفی یا صفر باشد (به‌جز آیتمِ فروشگاه که
-- مقدارش همیشه ۱ است).
ALTER TABLE league_payouts DROP CONSTRAINT IF EXISTS league_payouts_perk_value_check;
ALTER TABLE league_payouts ADD CONSTRAINT league_payouts_perk_value_check
  CHECK (perk_value IS NULL OR perk_value > 0);
