-- بازطراحی اقتصاد گذر نبرد — حذف کامل جایزهٔ نقدی
--
-- ═════════════════════════════════════════════════════════════════════════
-- ایرادی که مالک گرفت، و کاملاً درست بود
-- ═════════════════════════════════════════════════════════════════════════
--
-- «پلاس خودش ۵۹ هزار تومنه بعد ۳۰ هزارتومن هم نقدی بده؟
--   درگاه کافه بازار ام کلی کمسیون برمیداره اخه»
--
-- حساب واقعی که در مدل اول از قلم افتاده بود:
--
--   کاربر می‌پردازد                       ۵۹٬۰۰۰
--   منهای مالیات ارزش افزوده (۱۰٪)        ۵۳٬۶۳۶
--   منهای کمیسیون کافه‌بازار (۱۵٪)         ۴۵٬۵۹۱  ← واقعاً این می‌رسد
--   منهای ۳۰٬۰۰۰ نقدی (نرخ تکمیل ۸۰٪)     ۲۱٬۵۵۵  ← فقط ۳۷٪ قیمت
--
-- و اگر فروش سالانه از ۱ میلیارد تومان رد شود، کمیسیون به ۳۰٪ می‌رود و
-- سود به ۱۳٬۵۰۹ می‌افتد — یعنی **موفقیت بیشتر، حاشیهٔ کمتر**.
--
-- ولی ایرادِ بزرگ‌تر اصلاً عددی نیست:
--
--   «۵۹ دادم، ۳۰ پس گرفتم» اشتراک نیست، **کش‌بک** است.
--   کش‌بک یعنی هر کاربر جدید هزینهٔ نقدیِ جدید — دقیقاً برعکس یک
--   کسب‌وکار سالم که باید با رشد، ارزان‌تر شود.
--
-- ═════════════════════════════════════════════════════════════════════════
-- طراحی جدید: ارزشِ درک‌شدهٔ بالا، هزینهٔ واقعیِ نزدیک صفر
-- ═════════════════════════════════════════════════════════════════════════
--
-- آیتم ظاهری یک فایل است، نه پول. هزینهٔ واقعی‌اش صفر است ولی کاربر
-- قیمت فروشگاهی‌اش را می‌بیند. این تنها نوع جایزه‌ای است که می‌شود
-- سخاوتمندانه داد.
--
--   مسیر پلاس (جدید):
--     ۸ آیتم ظاهری  → ارزش درک‌شده ۱۵۲٬۰۰۰ تومان، هزینهٔ واقعی ۰
--     ۶۰ چرخش گردونه → هزینهٔ واقعی ~۴۸ تومان (EV هر چرخش ۰.۸)
--     ~۱۵٬۰۰۰ امتیاز → عدد داخلی، هزینهٔ واقعی ۰
--
--     سود هر خریدار: ۴۵٬۵۴۳ از ۴۵٬۵۹۱ → حاشیهٔ ~۱۰۰٪
--     (قبلاً ۲۱٬۵۵۵ بود — یعنی بیش از دو برابر شد)
--
--   مسیر رایگان (جدید):
--     ۱۵ چرخش + ~۳٬۵۰۰ امتیاز + ۱ آیتم، **نقدی صفر**
--     هزینهٔ کل با ۱۰٬۰۰۰ کاربر رایگان: ۱۲۰ هزار تومان در فصل
--     (قبلاً ۴.۵ میلیون تومان بود)
--
-- کاربر همچنان می‌تواند پول نقد ببرد — از گردونه و جوایز لیگ و کارت
-- فیزیکی. فقط دیگر «خریدِ اشتراک» مستقیماً پول برنمی‌گرداند.

-- ── مسیر پلاس: نقدی‌ها به آیتم و چرخش تبدیل می‌شوند ──────────────────
DO $$
DECLARE sid UUID;
BEGIN
  SELECT id INTO sid FROM pass_seasons WHERE is_active LIMIT 1;
  IF sid IS NULL THEN RETURN; END IF;

  -- پله‌های ۱۰/۲۰/۳۰/۴۰/۵۰ که قبلاً نقدی بودند → آیتم‌های شاخص.
  -- این‌ها «لحظه‌های بزرگ» مسیرند، پس باید چشمگیرترین جوایز باشند.
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='frame_neon', label='قاب نئون'
    WHERE season_id=sid AND track='plus' AND tier=10;
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='color_gold', label='اسم طلایی'
    WHERE season_id=sid AND track='plus' AND tier=20;
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='frame_fire', label='قاب آتش'
    WHERE season_id=sid AND track='plus' AND tier=30;
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='frame_ice', label='قاب یخ'
    WHERE season_id=sid AND track='plus' AND tier=40;
  -- پلهٔ ۵۰ = جایزهٔ نهایی. گران‌ترین آیتم فروشگاه.
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='color_rainbow', label='اسم رنگین‌کمان'
    WHERE season_id=sid AND track='plus' AND tier=50;

  -- هر نقدیِ باقی‌مانده در مسیر پلاس (اگر ماند) → چرخش گردونه.
  UPDATE pass_tiers SET kind='spins', amount=3, payload=NULL,
         label='۳ چرخش گردونهٔ شانس'
    WHERE season_id=sid AND track='plus' AND kind='cash';

  -- ── مسیر رایگان: نقدی حذف، جایش چرخش ──────────────────────────────
  -- پله‌های ۴۰ و ۵۰ که ۱٬۰۰۰ و ۲٬۰۰۰ تومان بودند.
  UPDATE pass_tiers SET kind='spins', amount=3, payload=NULL,
         label='۳ چرخش گردونهٔ شانس'
    WHERE season_id=sid AND track='free' AND kind='cash' AND tier=40;
  UPDATE pass_tiers SET kind='spins', amount=5, payload=NULL,
         label='۵ چرخش گردونهٔ شانس'
    WHERE season_id=sid AND track='free' AND kind='cash' AND tier=50;
  UPDATE pass_tiers SET kind='spins', amount=2, payload=NULL,
         label='۲ چرخش گردونهٔ شانس'
    WHERE season_id=sid AND track='free' AND kind='cash';

  -- ── تقویت مسیر پلاس: امتیازها را دو برابر کن ──────────────────────
  -- هزینهٔ واقعی صفر است و ارزش درک‌شده را بالا می‌برد. کاربر پلاس باید
  -- حس کند مسیرش آشکارا سخاوتمندتر است.
  UPDATE pass_tiers SET amount = amount * 2
    WHERE season_id=sid AND track='plus' AND kind='points';

  -- سه آیتم ظاهریِ اضافه در پله‌های میانی → مجموع ۸ آیتم در مسیر پلاس
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='color_emerald', label='اسم زمردی'
    WHERE season_id=sid AND track='plus' AND tier=25;
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='color_sky', label='اسم آبی آسمانی'
    WHERE season_id=sid AND track='plus' AND tier=5;
END $$;
