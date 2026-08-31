-- 079 — اهرم‌های عملیاتی پنل ادمین
-- ─────────────────────────────────────────────────────────────────────────────
-- هدف: هر چیزی که تا امروز «ثابتِ هاردکد» بود و برای تغییرش دپلوی لازم بود،
-- از این مایگریشن به بعد از جدول `app_settings` خوانده می‌شود و از پنل ادمین
-- (وب و داخل اپ) قابل ویرایش است — بدون انتشار نسخهٔ جدید.
--
-- مقدارهای پیش‌فرض دقیقاً برابرِ ثابت‌های فعلی کد هستند؛ یعنی بعد از این
-- مایگریشن رفتار محصول ذره‌ای عوض نمی‌شود، فقط «قابل تنظیم» می‌شود.

-- ── ۱) منحنی و سقف‌های گذر نبرد ─────────────────────────────────────────────
INSERT INTO app_settings (key, value) VALUES (
  'pass_config',
  '{
    "xpBase": 100,
    "xpStep": 5,
    "maxTiersPerDay": 2,
    "claimGraceDays": 7,
    "sources": {
      "game_play":   { "xp": 15, "dailyCap": 90,  "label": "انجام بازی" },
      "game_win":    { "xp": 25, "dailyCap": 75,  "label": "برد در بازی" },
      "tap_level":   { "xp": 30, "dailyCap": 60,  "label": "لول بازی ضربه‌زن" },
      "wheel_spin":  { "xp": 20, "dailyCap": 40,  "label": "چرخاندن گردونه" },
      "referral":    { "xp": 100, "dailyCap": 300, "label": "دعوت دوست" },
      "daily_login": { "xp": 20, "dailyCap": 20,  "label": "ورود روزانه" }
    }
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۲) جایزهٔ تکمیل روزانه و بازنویسی ماموریت‌های توکار ───────────────────
INSERT INTO app_settings (key, value) VALUES (
  'mission_config',
  '{ "dailyBonus": 100, "overrides": {} }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۳) منحنی سطح بازیکن (لول ۰ تا ۱۰۰) ─────────────────────────────────────
INSERT INTO app_settings (key, value) VALUES (
  'level_settings',
  '{
    "minLevel": 0, "maxLevel": 100,
    "base": 8, "lin": 4, "exp": 1.3, "knee": 30, "tail": 30
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۴) جوایز استریک ورود روزانه (چرخهٔ هفت‌روزه) ───────────────────────────
INSERT INTO app_settings (key, value) VALUES (
  'streak_settings',
  '{ "rewards": [100, 150, 200, 250, 300, 350, 500] }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۵) آستانه‌های موتور تشخیص کارت با عکس ──────────────────────────────────
-- این‌ها همان اعدادی هستند که تا امروز در کد بودند؛ از این پس ادمین می‌تواند
-- بدون دپلوی تنظیمشان کند. (در پنل با هشدار نمایش داده می‌شوند.)
INSERT INTO app_settings (key, value) VALUES (
  'photo_match_settings',
  '{
    "acceptScore": 0.55,
    "reviewScore": 0.45,
    "boundAcceptScore": 0.20,
    "freeAcceptScore": 0.40,
    "duplicateSimilarity": 0.93
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۶) پیام‌های آمادهٔ چت (قبلاً آرایهٔ ثابت در server.js بود) ─────────────
INSERT INTO app_settings (key, value) VALUES (
  'chat_canned_messages',
  '["سلام بچه‌ها!", "من اومدم!", "بازی خیلی باحال بود!", "خوشبختم دوستان!", "کی پایه بازیه؟", "عالی بود!", "خیلی خفن بود!", "موفق باشی!", "چه خبر بچه‌ها؟", "خداحافظ تا بعد!", "مواظب خودتون باشید!", "کسی کد جدید داره؟", "وای چقدر خنده‌دار بود!", "تبریک میگم!", "میشه کمکم کنید؟", "ممنون از شما!", "شما تو کدوم لیگ هستید؟", "چقدر امتیازم بالا رفت!", "کارت جدید پیدا کردم!", "امروز روز منه!", "ایول به همگی!", "دوباره امتحان می‌کنم!", "شگفت‌انگیز بود!", "کجا زندگی می‌کنید؟", "امروز چیکار کردید؟", "من عاشق این بازی‌ام!", "بریم برای برد!", "منم می‌خوام بازی کنم!", "بزن بریم بازی!", "آماده‌ای برای مسابقه؟", "این دست من می‌برم!", "بازی عالی بود!", "دوباره بازی کنیم؟", "کارت خفن گرفتم!", "حریف قوی می‌خوام!", "پنالتی رو دریبل کردم!"]'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۷) پلن‌های پلاس (قبلاً PLUS_PLANS ثابت در shopService.js بود) ──────────
INSERT INTO app_settings (key, value) VALUES (
  'shop_plus_plans',
  '{
    "monthly": { "price": 59000, "days": 30,  "label": "پلاس ماهانه", "savingPercent": 0 },
    "annual":  { "price": 499000, "days": 365, "label": "پلاس سالانه", "savingPercent": 30 },
    "benefits": [
      "دسترسی به قاب‌ها و افکت‌های نام متحرک در مدت اشتراک",
      "ستاره پلاس در پروفایل، چت، لیگ و بازی",
      "عضویت دائمی در یک باشگاه منتخب",
      "مسیر ویژه گذر نبرد (Premium Pass)",
      "حذف تبلیغات عادی"
    ],
    "annualBenefits": [
      "قاب سلطنتی سالانه؛ هدیه دائمی و انحصاری",
      "عنوان دائمی «ستاره سالانه» روی پروفایل",
      "یک فرصت تغییر باشگاه منتخب در هر دوره سالانه"
    ]
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ── ۸) ماموریت‌های سفارشی ادمین ────────────────────────────────────────────
-- ماموریت‌های توکارِ کد همچنان منبع اصلی‌اند، ولی ادمین می‌تواند ماموریتِ
-- اختصاصی اضافه کند؛ این‌ها همیشه فعال‌اند (بدون چرخش تصادفی) و کنار
-- ماموریت‌های روزانه/هفتگی به کاربر نمایش داده می‌شوند.
CREATE TABLE IF NOT EXISTS mission_definitions (
  key         VARCHAR(64) PRIMARY KEY,
  period      VARCHAR(8)  NOT NULL CHECK (period IN ('daily', 'weekly')),
  event       VARCHAR(32) NOT NULL,
  icon        VARCHAR(32) NOT NULL DEFAULT 'star',
  title       VARCHAR(120) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  goal        INTEGER     NOT NULL DEFAULT 1 CHECK (goal >= 1),
  reward      INTEGER     NOT NULL DEFAULT 10 CHECK (reward >= 0),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
