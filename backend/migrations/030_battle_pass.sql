-- گذر نبرد (Battle Pass) — «مسیر فصلی قلقلی»
--
-- ═════════════════════════════════════════════════════════════════════════
-- چرا این ساخته شد و چرا به اشتراک پلاس گره خورد
-- ═════════════════════════════════════════════════════════════════════════
--
-- اشتراک ساده «دسترسی» می‌فروشد؛ گذر نبرد **پیشرفت** می‌فروشد. کاربر
-- چیزی می‌خرد که قبلاً برایش زحمت کشیده، و چون فصلی است هر ۶ هفته یک
-- موج درآمد تازه می‌آید. مهم‌تر: باعث می‌شود مردم هر روز برگردند.
--
-- تصمیم مالک: گذر نبرد **جدا فروخته نمی‌شود**. خریدِ «قلقلی پلاس» یعنی
-- مسیر پولیِ فصل جاری هم باز می‌شود. یک محصول، یک قیمت، بدون سردرگمی.
--
-- ═════════════════════════════════════════════════════════════════════════
-- اقتصاد — چرا این اعداد و نه اعداد بزرگ‌تر
-- ═════════════════════════════════════════════════════════════════════════
--
-- مدل کامل در tools/pass_economics.py. خلاصهٔ چیزی که مدل نشان داد:
--
-- نسخهٔ اولِ طراحی، به هر کاربرِ رایگان ۵٬۰۰۰ تومان نقدی می‌داد. با
-- ۱۰٬۰۰۰ کاربر یعنی **۵۰ میلیون تومان خرجِ خالص** — بیشتر از کل درآمدِ
-- حتی با نرخ تبدیل ۱۰٪. یعنی هر کاربر جدید، ضرر بیشتر.
--
-- برای همین در مسیر رایگان:
--   • نقدی فقط در دو پلهٔ **۴۰ و ۵۰** (۱٬۰۰۰ + ۲٬۰۰۰ تومان)
--   • یعنی فقط کسی که تقریباً کل فصل را بازی کرده چیزی می‌گیرد
--   • تخمین واقع‌بینانه: ~۱۵٪ کاربران رایگان به آنجا می‌رسند
--   • هزینهٔ سرانهٔ کاربر رایگان: حدود ۴۶۰ تومان در کل فصل
--
-- و در مسیر پلاس:
--   • ۳۰٬۰۰۰ تومان نقدی پخش‌شده در طول مسیر
--   • هزینهٔ واقعی هر خریدار ~۱۶٬۵۰۰ تومان (با نرخ تکمیل ۵۵٪)
--   • قیمت ۵۹٬۰۰۰ → حاشیهٔ سود ~۷۲٪
--   • نقطهٔ سربه‌سر: فقط ۱.۱٪ از کاربران باید بخرند
--
-- آیتم‌های ظاهری هزینهٔ واقعیِ صفر دارند ولی ارزش درک‌شدهٔ بالا — برای
-- همین ستون فقرات هر دو مسیرند.
--
-- ═════════════════════════════════════════════════════════════════════════
-- چرا XP از بازی‌ها می‌آید و نه از پول
-- ═════════════════════════════════════════════════════════════════════════
--
-- درخواست مالک: «میتونی یه جوری با انجام بازی ها برای گذر پروگرسشون کار
-- کنی». پس XP فقط با **انجام دادن** به دست می‌آید: بازی، چرخش، ثبت
-- کارت، دعوت. هیچ‌جا XP فروخته نمی‌شود — وگرنه همان pay-to-win می‌شود
-- که فروشگاه صریحاً از آن پرهیز می‌کند.

-- ── فصل‌ها ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pass_seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at       TIMESTAMPTZ NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- فقط یک فصل فعال در هر لحظه. بدون این، دو فصلِ همپوش یعنی کاربر دو بار
-- جایزه می‌گیرد و XP بین دو ردیف گم می‌شود.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pass_one_active
  ON pass_seasons ((is_active)) WHERE is_active;

-- ── پله‌ها و جوایزشان ─────────────────────────────────────────────────
--
-- track: 'free' یا 'plus'. هر پله می‌تواند در هر دو مسیر جایزه داشته
-- باشد؛ ردیف جداگانه برای هرکدام.
--
-- kind:
--   points    → امتیاز مستقیم
--   spins     → چرخش گردونه
--   cash      → واریز به کیف پول (تومان)
--   shop_item → آیتم ظاهری فروشگاه (payload = slug)
CREATE TABLE IF NOT EXISTS pass_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES pass_seasons(id) ON DELETE CASCADE,
  tier        INTEGER NOT NULL CHECK (tier >= 1),
  track       VARCHAR(8) NOT NULL CHECK (track IN ('free', 'plus')),
  kind        VARCHAR(16) NOT NULL CHECK (kind IN ('points','spins','cash','shop_item')),
  amount      BIGINT NOT NULL DEFAULT 0,
  payload     TEXT,
  label       VARCHAR(120) NOT NULL,
  UNIQUE (season_id, tier, track)
);
CREATE INDEX IF NOT EXISTS idx_pass_tiers_season ON pass_tiers(season_id, tier);

-- ── پیشرفت کاربر ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_pass_progress (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id   UUID NOT NULL REFERENCES pass_seasons(id) ON DELETE CASCADE,
  xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, season_id)
);

-- ── جوایز دریافت‌شده ──────────────────────────────────────────────────
--
-- کلید اصلیِ مرکب یعنی یک پله در یک مسیر **فقط یک بار** قابل دریافت
-- است — تضمین در سطح دیتابیس، نه در سطح کد. جایزهٔ نقدی بدون این، با
-- دو درخواست هم‌زمان دوبار واریز می‌شد.
CREATE TABLE IF NOT EXISTS user_pass_claims (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id     UUID NOT NULL REFERENCES pass_tiers(id) ON DELETE CASCADE,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tier_id)
);
CREATE INDEX IF NOT EXISTS idx_pass_claims_user ON user_pass_claims(user_id);

-- ── لاگ XP، برای سقف روزانه ───────────────────────────────────────────
--
-- بدون سقف روزانه، یک کاربر می‌تواند در یک شب کل فصل را تمام کند و
-- گذر نبرد دیگر کاری که برایش ساخته شده (بازگشت روزانه) را انجام
-- نمی‌دهد. day به وقت تهران ذخیره می‌شود.
CREATE TABLE IF NOT EXISTS pass_xp_log (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id   UUID NOT NULL REFERENCES pass_seasons(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  source      VARCHAR(24) NOT NULL,
  xp          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, season_id, day, source)
);

-- ═════════════════════════════════════════════════════════════════════════
-- ارزان‌سازی فروشگاه — درخواست مالک
-- ═════════════════════════════════════════════════════════════════════════
--
-- قیمت‌های قبلی: نشان باشگاه ۴۹٬۰۰۰ · قاب ۳۹٬۰۰۰–۵۹٬۰۰۰ · رنگ اسم
-- ۲۹٬۰۰۰–۴۹٬۰۰۰. یعنی یک نشانِ تک‌آیتم تقریباً هم‌قیمتِ کل اشتراک بود —
-- که هیچ‌کس را به خرید تشویق نمی‌کند و فقط فروشگاه را بی‌استفاده
-- می‌گذارد.
--
-- قیمت‌های جدید طوری چیده شدند که خرید تک‌آیتم یک تصمیم کوچک و آسان
-- باشد، و اشتراک پلاس (که همه را باز می‌کند) به‌وضوح صرفه داشته باشد:
--   ۱۱ نشان × ۱۹٬۰۰۰ + ۵ قاب + ۶ رنگ  ≈ ۴۰۰٬۰۰۰ تومان اگر جدا بخری
--   در مقابل ۵۹٬۰۰۰ تومان اشتراک → ارزش پیشنهاد کاملاً روشن است.
UPDATE shop_items SET price = 19000 WHERE kind = 'club_badge';
UPDATE shop_items SET price = 12000 WHERE kind = 'name_color' AND price <= 39000;
UPDATE shop_items SET price = 19000 WHERE kind = 'name_color' AND price >  39000;
UPDATE shop_items SET price = 15000 WHERE kind = 'card_frame' AND price <  50000;
UPDATE shop_items SET price = 25000 WHERE kind = 'card_frame' AND price >= 50000;

-- ═════════════════════════════════════════════════════════════════════════
-- فصل اول
-- ═════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  sid UUID;
  t   INTEGER;
BEGIN
  -- اگر قبلاً فصلی هست، دوباره نساز (مایگریشن باید idempotent باشد).
  SELECT id INTO sid FROM pass_seasons WHERE is_active LIMIT 1;
  IF sid IS NOT NULL THEN RETURN; END IF;

  INSERT INTO pass_seasons(name, starts_at, ends_at)
  VALUES ('فصل اول — شروع قلقلی', NOW(), NOW() + INTERVAL '42 days')
  RETURNING id INTO sid;

  -- ── مسیر رایگان ────────────────────────────────────────────────────
  -- هر پله چیزی دارد تا مسیر «خالی» به‌نظر نرسد، ولی نقدی فقط در
  -- پله‌های ۴۰ و ۵۰.
  FOR t IN 1..50 LOOP
    IF t % 10 = 0 THEN
      -- پله‌های گرد: چرخش گردونه، حس جایزهٔ بزرگ‌تر
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'free','spins',2,'۲ چرخش گردونهٔ شانس');
    ELSIF t % 5 = 0 THEN
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'free','spins',1,'۱ چرخش گردونهٔ شانس');
    ELSE
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'free','points',50 + t,'امتیاز');
    END IF;
  END LOOP;

  -- نقدیِ نمادین، فقط انتهای مسیر رایگان
  UPDATE pass_tiers SET kind='cash', amount=1000, label='۱٬۰۰۰ تومان نقدی'
    WHERE season_id=sid AND track='free' AND tier=40;
  UPDATE pass_tiers SET kind='cash', amount=2000, label='۲٬۰۰۰ تومان نقدی'
    WHERE season_id=sid AND track='free' AND tier=50;
  -- یک آیتم ظاهری رایگان، برای اینکه کاربر مزهٔ فروشگاه را بچشد
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='color_emerald', label='رنگ اسم زمردی'
    WHERE season_id=sid AND track='free' AND tier=25;

  -- ── مسیر پلاس ──────────────────────────────────────────────────────
  FOR t IN 1..50 LOOP
    IF t % 10 = 0 THEN
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'plus','cash',
              CASE t WHEN 50 THEN 10000 WHEN 40 THEN 7000 WHEN 30 THEN 6000
                     WHEN 20 THEN 4000 ELSE 3000 END,
              CASE t WHEN 50 THEN '۱۰٬۰۰۰ تومان نقدی' WHEN 40 THEN '۷٬۰۰۰ تومان نقدی'
                     WHEN 30 THEN '۶٬۰۰۰ تومان نقدی' WHEN 20 THEN '۴٬۰۰۰ تومان نقدی'
                     ELSE '۳٬۰۰۰ تومان نقدی' END);
    ELSIF t % 5 = 0 THEN
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'plus','spins',3,'۳ چرخش گردونهٔ شانس');
    ELSIF t % 3 = 0 THEN
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'plus','spins',1,'۱ چرخش گردونهٔ شانس');
    ELSE
      INSERT INTO pass_tiers(season_id,tier,track,kind,amount,label)
      VALUES (sid,t,'plus','points',200 + t * 4,'امتیاز');
    END IF;
  END LOOP;

  -- آیتم‌های ظاهری در پله‌های شاخص — هزینهٔ واقعی صفر، ارزش درک‌شدهٔ بالا
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='frame_gold', label='قاب طلایی'
    WHERE season_id=sid AND track='plus' AND tier=15;
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='color_rainbow', label='اسم رنگین‌کمان'
    WHERE season_id=sid AND track='plus' AND tier=35;
  UPDATE pass_tiers SET kind='shop_item', amount=0,
         payload='frame_holo', label='قاب هولوگرام'
    WHERE season_id=sid AND track='plus' AND tier=45;
END $$;
