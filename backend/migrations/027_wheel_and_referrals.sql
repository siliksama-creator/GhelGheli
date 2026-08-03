-- گردونهٔ شانس + سیستم معرفی دوستان
--
-- ─────────────────────────────────────────────────────────────────────────
-- طراحی، و دلیل هر تصمیم
--
-- ۱. جدول جوایز در دیتابیس است، نه در کد.
--    وزن‌ها باید بدون انتشار نسخهٔ جدید قابل تنظیم باشند. اگر معلوم شود
--    هزینهٔ نقدی از پیش‌بینی بیشتر است، مدیر باید بتواند همان شب وزن را کم
--    کند — نه اینکه منتظر بیلد جدید کافه‌بازار بماند.
--
-- ۲. وزن‌ها عدد صحیح‌اند با مخرج مشترک ۱۰٬۰۰۰، نه اعشار.
--    احتمال اعشاری با جمع‌شدن خطای ممیز شناور، جمعش دقیقاً ۱ نمی‌شود و
--    انتخاب جایزه در لبهٔ بازه رفتار تعریف‌نشده پیدا می‌کند. با عدد صحیح،
--    «۱ در ۱۰٬۰۰۰» یعنی دقیقاً همان، نه ۰.۹۹۹۹.
--
-- ۳. هر چرخش یک ردیف است، حتی چرخش‌های بی‌جایزه.
--    بدون لاگ کامل نمی‌شود فهمید نرخ واقعی جوایز با نرخ طراحی‌شده می‌خواند
--    یا نه. این تنها راه اثبات اینکه گردونه دستکاری نشده هم هست.
--
-- ۴. کمیسیون معرفی ۵٪ در جدول جدا ثبت می‌شود.
--    اگر فقط به امتیاز معرف اضافه می‌شد، هیچ‌وقت نمی‌شد به کاربر گفت این
--    امتیاز از کجا آمده — و هیچ راهی برای پیدا کردن تقلب (ساختن ۵۰ اکانت
--    جعلی) نبود.

-- ── کد معرفی روی هر کاربر ────────────────────────────────────────────────
--
-- کد در ستون خود کاربر است نه جدول جدا: رابطه یک‌به‌یک است و هر بار نمایش
-- پروفایل به آن نیاز دارد، پس JOIN اضافه فقط هزینه است.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12);

-- چه کسی این کاربر را آورده. NULL یعنی خودش آمده.
-- ON DELETE SET NULL چون حذف معرف نباید کاربر معرفی‌شده را حذف کند.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID
  REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ;

-- یکتا بودن کد در سطح دیتابیس تضمین می‌شود، نه در کد اپلیکیشن.
-- تولیدکنندهٔ کد تصادفی است؛ تنها چیزی که برخورد را واقعاً غیرممکن می‌کند
-- همین ایندکس است، چون دو درخواست هم‌زمان می‌توانند یک کد بسازند و هر دو
-- چک «آیا وجود دارد؟» را رد کنند.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code
  ON users(referral_code) WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- ── پر کردن کد برای کاربران موجود ────────────────────────────────────────
--
-- بدون این، ۳۷ کاربر فعلی هیچ کدی ندارند و صفحهٔ معرفی برایشان خالی است.
-- الفبای کد عمداً محدود است: بدون 0/O و 1/I/L، چون کد قرار است شفاهی به
-- دوست گفته شود و این چهار جفت در فارسی و انگلیسی مدام اشتباه شنیده
-- می‌شوند. ۸ کاراکتر از ۳۰ نویسه ≈ ۶.۵×۱۰^۱۱ ترکیب.
DO $$
DECLARE
  u RECORD;
  candidate TEXT;
  alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i INT;
BEGIN
  FOR u IN SELECT id FROM users WHERE referral_code IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate ||
          substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
      END LOOP;
      -- حلقه تا وقتی کد یکتا پیدا شود. با این فضای حالت، عملاً بار اول.
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE referral_code = candidate);
    END LOOP;
    UPDATE users SET referral_code = candidate WHERE id = u.id;
  END LOOP;
END $$;

-- ── کمیسیون معرفی ────────────────────────────────────────────────────────
--
-- هر بار که کاربر معرفی‌شده امتیاز می‌گیرد، ۵٪ آن به معرف می‌رسد. این
-- جدول تاریخچهٔ کامل است تا بشود به معرف نشان داد «این امتیاز از کجا آمد».
CREATE TABLE IF NOT EXISTS referral_earnings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- امتیازی که کاربر معرفی‌شده گرفت (پایهٔ محاسبه).
  base_points   INTEGER NOT NULL,
  -- ۵٪ آن، گرد شده به بالا. گرد کردن به بالا عمدی است: با نرخ ۵٪، هر
  -- امتیاز کمتر از ۲۰ به سمت صفر گرد می‌شد و معرف از ریز-امتیازها که
  -- بیشترِ فعالیت روزمره است، هیچ نمی‌گرفت.
  earned_points INTEGER NOT NULL CHECK (earned_points >= 0),
  -- منشأ امتیاز پایه: card / game / wheel / admin / league
  source        VARCHAR(32) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer
  ON referral_earnings(referrer_id, created_at DESC);

-- ── جوایز گردونه ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wheel_prizes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         VARCHAR(64) NOT NULL,
  -- 'points' یا 'cash'
  kind          VARCHAR(16) NOT NULL CHECK (kind IN ('points', 'cash')),
  -- امتیاز، یا تومان
  value         INTEGER NOT NULL CHECK (value > 0),
  -- وزن در هر ۱۰٬۰۰۰ چرخش. جمع وزن‌های فعال باید ۱۰٬۰۰۰ باشد؛
  -- سرویس این را موقع بارگذاری بررسی می‌کند و اگر نبود، خطا می‌دهد
  -- به‌جای اینکه بی‌صدا احتمالات غلط بدهد.
  weight        INTEGER NOT NULL CHECK (weight >= 0),
  -- ترتیب روی خود گردونه (کدام برش کجاست).
  slice_order   INTEGER NOT NULL,
  -- رنگ برش، تا کلاینت‌ها بدون نگاشت دستی هماهنگ باشند.
  color         VARCHAR(9) NOT NULL DEFAULT '#84CC16',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── لاگ چرخش‌ها ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wheel_spins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prize_id     UUID REFERENCES wheel_prizes(id) ON DELETE SET NULL,
  -- کپی برچسب/نوع/مقدار در لحظهٔ چرخش. اگر مدیر فردا جایزه را عوض کند،
  -- تاریخچه نباید بازنویسی شود — همان دلیلی که user_reward_claims هم
  -- اسنپ‌شات نگه می‌دارد.
  prize_label  VARCHAR(64) NOT NULL,
  prize_kind   VARCHAR(16) NOT NULL,
  prize_value  INTEGER NOT NULL,
  -- چرخش از کجا آمد: 'daily' (سهمیهٔ روزانه) یا 'referral' (جایزهٔ معرفی)
  spin_source  VARCHAR(16) NOT NULL DEFAULT 'daily',
  -- روز تهران که این چرخش در آن انجام شد. سهمیهٔ روزانه با همین کنترل
  -- می‌شود — به همان دلیلی که سقف بازی ضربه‌زن روز تهران را ذخیره می‌کند:
  -- خواندن ساعت دستگاه یعنی سهمیهٔ تازه یک بار عوض کردن تنظیمات فاصله دارد.
  spun_day     DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_user
  ON wheel_spins(user_id, created_at DESC);

-- قفل سهمیهٔ روزانه در سطح دیتابیس.
--
-- این ایندکس مهم‌ترین خط این فایل است: بدون آن، دو درخواست هم‌زمان (دو بار
-- زدن روی دکمه، یا دو دستگاه) هر دو «آیا امروز چرخیده؟» را چک می‌کنند،
-- هر دو جواب «نه» می‌گیرند و هر دو جایزه می‌دهند. چک در کد اپلیکیشن این
-- مسابقه را نمی‌بندد؛ فقط قید یکتای دیتابیس می‌بندد.
--
-- محدود به spin_source='daily' چون چرخش‌های جایزهٔ معرفی سقف روزانه ندارند.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_daily_spin
  ON wheel_spins(user_id, spun_day) WHERE spin_source = 'daily';

-- ── چرخش‌های اضافی (از معرفی) ────────────────────────────────────────────
--
-- به‌جای شمردن ردیف‌های wheel_spins با source='referral' و مقایسه با
-- تعداد معرفی‌ها، یک شمارندهٔ ساده. دلیل: شمردن یعنی هر بار دو کوئری و یک
-- منطق «چندتا حق داشت منهای چندتا خرج کرد» که باید همه‌جا تکرار شود.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_spins INTEGER NOT NULL DEFAULT 0
  CHECK (bonus_spins >= 0);

-- ── دادهٔ اولیهٔ جوایز ────────────────────────────────────────────────────
--
-- وزن‌ها از tools/wheel_economics.py می‌آیند. خلاصهٔ منطق:
--
--   جایزه          وزن/۱۰٬۰۰۰   یک در هر    سهم از هزینه
--   ۱۰۰ امتیاز        7457         1.3      74.6 امتیاز
--   ۱۰۰۰ امتیاز       2500         4        250  امتیاز
--   ۲۰۰۰ امتیاز         20       500          4  امتیاز
--   ۱۰٬۰۰۰ تومان        20       500         20  تومان
--   ۵۰۰۰ امتیاز          1    10,000        0.5  امتیاز
--   ۵۰٬۰۰۰ تومان         1    10,000          5  تومان
--   ۱۰۰٬۰۰۰ تومان        1    10,000         10  تومان
--                    ------
--                    10000      هزینهٔ نقدی هر چرخش: ۳۵ تومان
--
-- slice_order جوایز بزرگ را بین جوایز کوچک پخش می‌کند («مخلوط» طبق
-- درخواست مالک) — دو برش گران‌قیمت هرگز کنار هم نیستند، چون کنار هم بودن
-- باعث می‌شود گردونه دستکاری‌شده به‌نظر برسد وقتی سوزن مدام بینشان می‌افتد.
INSERT INTO wheel_prizes (label, kind, value, weight, slice_order, color) VALUES
  ('۱۰۰ امتیاز',    'points',    100, 3729, 1, '#84CC16'),
  ('۵۰٬۰۰۰ تومان',  'cash',    50000,    1, 2, '#F59E0B'),
  ('۱۰۰۰ امتیاز',   'points',   1000, 1250, 3, '#22D3EE'),
  ('۱۰٬۰۰۰ تومان',  'cash',    10000,   20, 4, '#A855F7'),
  ('۱۰۰ امتیاز',    'points',    100, 3728, 5, '#84CC16'),
  ('۵۰۰۰ امتیاز',   'points',   5000,    1, 6, '#F43F5E'),
  ('۱۰۰۰ امتیاز',   'points',   1000, 1250, 7, '#22D3EE'),
  ('۲۰۰۰ امتیاز',   'points',   2000,   20, 8, '#38BDF8'),
  ('۱۰۰٬۰۰۰ تومان', 'cash',   100000,    1, 9, '#FBBF24')
ON CONFLICT DO NOTHING;

-- «۱۰۰ امتیاز» و «۱۰۰۰ امتیاز» هرکدام دو برش دارند و وزنشان نصف شده.
-- چرا: با ۷۴٪ احتمال برای یک برش، آن برش سه‌چهارم گردونه را می‌گرفت و
-- گردونه دیگر شبیه گردونه نبود. دو برش مساوی در دو طرف، همان احتمال کل را
-- می‌دهد ولی ظاهر متعادل دارد — و چون سوزن واقعاً روی یکی از آن دو می‌افتد،
-- هیچ فریبی در کار نیست.
