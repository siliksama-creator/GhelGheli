-- ═══════════════════════════════════════════════════════════════
-- دورِ بیست‌وپنجم: احیای استیکرهای چت + حذف سیستمِ قدیمیِ کد کارت
-- ═══════════════════════════════════════════════════════════════
--
-- ── بخش ۱: چرا جدولِ card_codes حذف می‌شود ──
--
-- سیستمِ قدیمیِ «کد کارت» (جدولِ `card_codes` + روتِ
-- `/api/cards/redeem`) مدتی است هیچ مصرف‌کننده‌ای ندارد: هر دو پنلِ
-- ادمین تبِ «کارت و کد» را حذف کرده‌اند و ثبتِ کارتِ واقعی از مسیرِ
-- «کارت با عکس» (photo_card_codes) می‌گذرد. کدهایی که ادمین در صفحهٔ
-- قدیمی می‌ساخت به هیچ کاربری قابلِ ارائه نبود — یک مسیرِ مرده که فقط
-- سطحِ حمله و ابهام را بیشتر می‌کرد.
--
-- ⚠️ `card_types` حذف **نمی‌شود**: کاتالوگِ زندهٔ کارت‌های کلکسیونی
--    است (کارتِ تأییدشدهٔ عکس، صندوق کارت و دوئل کارت به آن وصل‌اند).
DROP TABLE IF EXISTS card_codes;

-- ── بخش ۲: استیکرهای چت ──
--
-- جدول از مایگریشن ۰۰۶ وجود داشت ولی بکند همیشه `stickers: []`
-- برمی‌گرداند — سیستمی ساخته‌شده و خاموش. حالا ۱۰ استیکرِ انیمیشنیِ
-- جدید seed می‌شود و سرور آن‌ها را در bootstrap چت و کنارِ هر پیامِ
-- استیکری برمی‌گرداند.
--
-- image_url نسبی است تا هر کلاینت با دامنهٔ خودش بسازدش:
--   • وب: همان دامنه (فایل‌ها در userweb/public/stickers/)
--   • اندروید: همان مسیرِ نسبی را با baseUrl خودش پیشوند می‌کند
--
-- چرا DELETE اول: ردیف‌های قدیمیِ ۰۰۶ به فایل‌هایی اشاره می‌کردند که
-- هرگز ساخته نشدند. ON DELETE SET NULL در chat_messages تضمین می‌کند
-- پیام‌های قدیمیِ استیکری (که عملاً صفرند) خراب نمی‌شوند.
DELETE FROM chat_stickers;

INSERT INTO chat_stickers (title, image_url, sticker_type, is_active, created_at, updated_at) VALUES
  ('گل آتشین',        '/stickers/fire_goal.svg',   'animated', TRUE, NOW(), NOW()),
  ('جام قهرمانی',     '/stickers/trophy_shine.svg','animated', TRUE, NOW(), NOW()),
  ('موشک',            '/stickers/rocket_boom.svg', 'animated', TRUE, NOW(), NOW()),
  ('تاج',             '/stickers/crown_glow.svg',  'animated', TRUE, NOW(), NOW()),
  ('ستارهٔ شاد',      '/stickers/star_hype.svg',   'animated', TRUE, NOW(), NOW()),
  ('مدال طلا',        '/stickers/medal_flame.svg', 'animated', TRUE, NOW(), NOW()),
  ('صاعقه',           '/stickers/bolt_strike.svg', 'animated', TRUE, NOW(), NOW()),
  ('قلب تپنده',       '/stickers/heart_boom.svg',  'animated', TRUE, NOW(), NOW()),
  ('خفن',             '/stickers/cool_dude.svg',   'animated', TRUE, NOW(), NOW()),
  ('جشن',             '/stickers/party_pop.svg',   'animated', TRUE, NOW(), NOW());
