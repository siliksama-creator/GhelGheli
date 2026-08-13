-- ستون‌های گم‌شدهٔ league_seasons — رفعِ واگراییِ اسکیما
--
-- ═══════════════════════════════════════════════════════════════════════════
-- این مایگریشن یک باگِ خاموشِ جدی را می‌بندد
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── چطور پیدا شد ──
--
-- وقتی job تازهٔ `backend-e2e` در CI اضافه شد — که دیتابیس را **فقط از
-- روی مایگریشن‌ها** می‌سازد — پنج تست قرمز شدند با پیام:
--
--     column "title" does not exist
--
-- روی سرورِ تولید همان تست‌ها سبز بودند. یعنی دیتابیسِ تولید ستون‌هایی
-- داشت که **هیچ مایگریشنی نمی‌ساخت**: یک نفر روزی آن‌ها را با
-- `ALTER TABLE` دستی اضافه کرده بود و مایگریشنش را ننوشته بود.
--
-- مقایسهٔ کامل (۵۵۲ ستونِ تولید در برابر ۵۴۸ ستونِ مایگریشن‌ها) دقیقاً
-- چهار ستون اختلاف نشان داد و هر چهار روی همین جدول:
--
--     league_seasons.title
--     league_seasons.league_type
--     league_seasons.min_points_entry
--     league_seasons.plus_only
--
-- ── چرا این خطرناک بود ──
--
-- `leagueService.js:164` صریحاً همین ستون‌ها را SELECT می‌کند. یعنی:
--
--   • **بازیابی از بک‌آپ روی دیتابیسِ تازه، لیگ را کاملاً می‌شکست.** سند
--     «بکاپ و بازیابی» ادعا می‌کند بازیابی آزموده شده — و شده، ولی روی
--     دامپِ کاملِ تولید که این ستون‌ها را همراه خود دارد. مسیرِ
--     «مایگریشن از صفر» هرگز آزموده نشده بود.
--   • هر محیطِ تازه (توسعه، staging، CI) لیگِ خراب داشت.
--   • هیچ خطایی هم نمی‌داد تا وقتی کسی صفحهٔ لیگ را باز کند.
--
-- ── چرا IF NOT EXISTS ──
--
-- روی تولید این ستون‌ها **از قبل هستند**، پس این مایگریشن آنجا هیچ کاری
-- نمی‌کند و بی‌خطر است. روی هر دیتابیسِ تازه‌ای آن‌ها را می‌سازد. همان
-- مقادیرِ پیش‌فرضی که در تولید هست عیناً تکرار شده تا دو محیط مو‌به‌مو
-- یکی شوند.
--
-- ⚠️ درسِ ماندگار: هر تغییرِ دستیِ اسکیما روی تولید باید مایگریشن داشته
--    باشد، وگرنه تولید و مخزن بی‌صدا از هم دور می‌شوند و روزی که واقعاً
--    به بازیابی نیاز باشد تازه معلوم می‌شود. job `backend-e2e` از این به
--    بعد نگهبانِ همین است.

ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS title VARCHAR(120) NOT NULL DEFAULT 'لیگ برتر ماهانه';

ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS league_type VARCHAR(40) NOT NULL DEFAULT 'monthly';

ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS min_points_entry INTEGER NOT NULL DEFAULT 0;

ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS plus_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN league_seasons.title IS 'نام نمایشی فصل — مدیر می‌تواند عوضش کند';
COMMENT ON COLUMN league_seasons.league_type IS 'monthly | weekly — دورهٔ فصل';
COMMENT ON COLUMN league_seasons.min_points_entry IS 'حداقل امتیاز برای ورود به جدول (۰ = بدون شرط)';
COMMENT ON COLUMN league_seasons.plus_only IS 'true = فقط اعضای پلاس در این فصل رتبه می‌گیرند';
