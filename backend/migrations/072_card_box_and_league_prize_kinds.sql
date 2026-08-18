-- ═══════════════════════════════════════════════════════════════════════════
-- صندوق کارت + جوایز نقدی و غیرنقدی لیگ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- خواستهٔ مالک (نقلِ مستقیم):
--
--   «صندوق ها باید امتیاز بدن، که کاربری که فیزیکی نگرفته بتونه در دوعل
--    کارت و غیره هم بازی کنه»
--   «صندوق باید تصادفی براساس درصد شانس باشد. قیمتش باید ۱۰۰ هزارتومان
--    باشد و ۵ کارت تصادفی بده با امتیاز های همون کارت»
--   «جایزه نقدی بین ۵۰ نفر تقسییم شه و ۲۰ نفر هم جوایز غیر نقدی مثل پلاس
--    و آیتم های شاپ بگیرن»
--
-- ═══════════════════════════════════════════════════════════════════════════
-- چرا صندوق وجودش حیاتی است (نه یک آیتم فروشِ اضافه)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- تا امروز **تنها** راه به‌دست‌آوردنِ کارت، ثبتِ کدِ یک کارتِ فیزیکی بود.
-- یعنی کاربری که کارت فیزیکی نخریده، دوئل کارت را **اصلاً** نمی‌تواند باز
-- کند — نه نسخهٔ ضعیف، نه نسخهٔ رایگان، هیچ. این یعنی گران‌ترین و
-- عمیق‌ترین بازیِ محصول برای بیشترِ نصب‌کننده‌ها یک صفحهٔ قفل است.
--
-- صندوق همان دروازه است: ۱۰۰٬۰۰۰ تومان، پنج کارتِ تصادفی، و امتیازِ خودِ
-- همان کارت‌ها. کاربر بلافاصله یک ترکیبِ پنج‌کارتیِ کامل دارد و می‌تواند
-- وارد آرنا شود.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- چرا جدولِ جدا و نه `shop_items`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `user_shop_items` روی `(user_id, item_id)` یکتاست، چون آیتم‌های شاپ
-- کازمتیکِ دائمی‌اند و «دو بار داشتن»شان بی‌معنی است. صندوق دقیقاً برعکس
-- است: مصرفی و تکرارشونده. اگر در همان جدول می‌نشست، خریدِ دومِ هر کاربر
-- به خطای UNIQUE می‌خورد و کلِ تراکنشِ پرداخت برمی‌گشت — یعنی کاربر پول
-- می‌داد و چیزی نمی‌گرفت.

-- ── درصدِ شانس، در دیتابیس نه در کد ──────────────────────────────────────
--
-- شانس‌ها ردیفِ دیتابیس‌اند تا مدیر بتواند بدونِ استقرارِ دوباره تنظیمشان
-- کند، و مهم‌تر: تا مقدارِ دقیقی که هر صندوق با آن باز شده قابلِ بازسازی
-- باشد. اگر در کد بودند، بعد از یک تغییر هیچ‌کس نمی‌توانست ثابت کند صندوقِ
-- هفتهٔ پیش با چه شانسی باز شده — و در محصولی که پول واقعی می‌گیرد، این
-- همان چیزی است که یک شکایت را غیرقابل‌دفاع می‌کند.
CREATE TABLE IF NOT EXISTS card_box_odds (
  rarity      VARCHAR(16) PRIMARY KEY
              CHECK (rarity IN ('normal','silver','gold','premium','legend')),
  -- در هزار، نه درصد: ۴۰٪ = 400. عددِ صحیح انتخاب شد تا جمعِ شانس‌ها
  -- دقیقاً ۱۰۰۰ شود. با اعشار، جمعِ ممیزِ شناور هیچ‌وقت دقیقاً ۱ نمی‌شود و
  -- گاردِ «جمع باید کامل باشد» یا همیشه می‌شکست یا باید با epsilon
  -- می‌نوشتیم — و epsilon در منطقِ قرعه‌کشی یعنی یک بازهٔ کوچکِ
  -- تعریف‌نشده که هر از گاهی یک کارتِ اشتباه بیرون می‌دهد.
  weight_permille INTEGER NOT NULL CHECK (weight_permille >= 0 AND weight_permille <= 1000),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO card_box_odds (rarity, weight_permille) VALUES
  ('normal',  400),
  ('silver',  300),
  ('gold',    150),
  ('premium', 120),
  ('legend',   30)
ON CONFLICT (rarity) DO NOTHING;

COMMENT ON TABLE card_box_odds IS
  'شانسِ هر کلاسِ کارت در صندوق، در هزار. جمعِ ردیف‌های فعال باید ۱۰۰۰ باشد.';

-- ── سندِ هر بار باز شدنِ صندوق ────────────────────────────────────────────
--
-- هم رسیدِ مالی است و هم مدرکِ انصاف. بدونِ `odds_snapshot`، اگر مدیر فردا
-- شانسِ لجند را کم کند، دیگر هیچ راهی نیست ثابت کنیم صندوقِ دیروز با شانسِ
-- دیروز باز شده.
CREATE TABLE IF NOT EXISTS card_box_purchases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- تومان. مبلغِ واقعاً پرداخت‌شده، نه قیمتِ امروزِ صندوق.
  price_paid     BIGINT NOT NULL CHECK (price_paid >= 0),
  -- مجموعِ point_value پنج کارتی که بیرون آمد.
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  -- 'cafebazaar' | 'wallet' | 'admin_grant'
  source         VARCHAR(24) NOT NULL DEFAULT 'cafebazaar',
  -- شناسهٔ سفارشِ پرداخت، برای پیوند به دفترِ مالی. یکتا و nullable:
  -- یک سفارش نباید دو بار صندوق بدهد.
  order_id       UUID REFERENCES payment_orders(id) ON DELETE SET NULL,
  odds_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_card_box_user
  ON card_box_purchases(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_box_order
  ON card_box_purchases(order_id) WHERE order_id IS NOT NULL;

-- ── کارت‌هایی که از هر صندوق بیرون آمد ───────────────────────────────────
--
-- جدا از `user_card_inventory` چون آن جدول «چند تا داری» را نگه می‌دارد و
-- تاریخچه ندارد. برای نمایشِ انیمیشنِ باز شدن و برای پشتیبانی، لازم است
-- بدانیم دقیقاً کدام پنج کارت در کدام صندوق بودند.
--
-- `slot` نگه داشته می‌شود تا ترتیبِ نمایش پایدار بماند: بدونِ آن، خواندنِ
-- دوبارهٔ همان صندوق ممکن است کارت‌ها را به ترتیبِ دیگری بدهد و کاربری که
-- صفحه را رفرش می‌کند حس کند چیزی عوض شده.
CREATE TABLE IF NOT EXISTS card_box_cards (
  box_id       UUID NOT NULL REFERENCES card_box_purchases(id) ON DELETE CASCADE,
  slot         SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 5),
  card_type_id UUID NOT NULL REFERENCES card_types(id) ON DELETE RESTRICT,
  rarity       VARCHAR(16) NOT NULL,
  point_value  INTEGER NOT NULL DEFAULT 0 CHECK (point_value >= 0),
  PRIMARY KEY (box_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_card_box_cards_type
  ON card_box_cards(card_type_id);

-- ── منشأ کارت در اینونتوری ───────────────────────────────────────────────
--
-- لازم است بدانیم یک کارت از صندوقِ دیجیتال آمده یا از کدِ فیزیکی. دلیلِ
-- عملی: کمیسیونِ نقدیِ معرف فقط به خریدِ واقعی تعلق می‌گیرد، و گزارش‌های
-- مالی باید بتوانند این دو مسیر را از هم جدا کنند.
ALTER TABLE user_card_inventory
  ADD COLUMN IF NOT EXISTS from_box_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (from_box_quantity >= 0);

COMMENT ON COLUMN user_card_inventory.from_box_quantity IS
  'چند نسخه از این کارت از صندوقِ دیجیتال آمده (بقیه از کدِ فیزیکی)';

-- ── صندوق به‌عنوان یک نوعِ سفارشِ پرداخت ──────────────────────────────────
--
-- `payment_orders.purchase_kind` تا امروز فقط سه مقدار می‌پذیرفت. بدونِ
-- افزودنِ `card_box`، ساختِ سفارشِ صندوق به قیدِ CHECK می‌خورد و پنجرهٔ
-- پرداخت اصلاً باز نمی‌شد.
--
-- قیدِ قدیمی حذف و دوباره ساخته می‌شود (نه `ADD CONSTRAINT` جدید): دو قیدِ
-- CHECK روی یک ستون با هم AND می‌شوند، یعنی قیدِ قدیمی همچنان `card_box`
-- را رد می‌کرد و مهاجرت ظاهراً موفق ولی بی‌اثر می‌شد.
ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_kind_check;
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_kind_check
  CHECK (purchase_kind IS NULL OR purchase_kind IN
         ('shop_item', 'plus_monthly', 'plus_annual', 'card_box'));

-- ═══════════════════════════════════════════════════════════════════════════
-- سکهٔ سه‌حالته: برد، مساوی، باخت
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `coin_reward` تک‌عددی بود چون فقط برنده سکه می‌گرفت. حالا هر سه نتیجه
-- پاداش دارند و هر سه باید در **لحظهٔ رزرو** قفل شوند.
--
-- ── چرا snapshot و نه محاسبهٔ دوباره در لحظهٔ تسویه ──
--
-- وسوسه‌کننده بود که در `settleMatch` دوباره از روی `game_id`+`stake` حساب
-- کنیم و ستون اضافه نکنیم. ولی مسابقه ممکن است دقایقی طول بکشد و اگر در
-- همان فاصله جدولِ سکه عوض شود (یا سرور با نسخهٔ جدید ری‌استارت شود)،
-- بازیکن با یک قرارداد وارد شده و با قراردادِ دیگری تسویه می‌شود. ذخیرهٔ
-- سه عدد چند بایت است؛ اعتمادِ بازیکن نیست.
--
-- `coin_reward` قدیمی حذف **نمی‌شود**: ردیف‌های تاریخی مقدارش را دارند و
-- گزارش‌های موجود به آن تکیه می‌کنند. از این پس با `coin_reward_win` پر
-- می‌شود تا معنایش («سکه‌ای که برنده می‌گیرد») ثابت بماند.
ALTER TABLE game_stake_matches
  ADD COLUMN IF NOT EXISTS coin_reward_win  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_reward_draw INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_reward_loss INTEGER NOT NULL DEFAULT 0;

-- ردیف‌های قدیمی: بردْ همان عددِ قبلی، مساوی و باخت صفر — یعنی دقیقاً
-- همان رفتاری که موقعِ ثبتشان داشتند. بازنویسیِ گذشته با قوانینِ امروز،
-- گزارشِ تاریخی را دروغ می‌کند.
UPDATE game_stake_matches
   SET coin_reward_win = coin_reward
 WHERE coin_reward_win = 0 AND coin_reward > 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_stake_coin_three_check'
  ) THEN
    ALTER TABLE game_stake_matches
      ADD CONSTRAINT game_stake_coin_three_check
      CHECK (coin_reward_win >= 0 AND coin_reward_draw >= 0
             AND coin_reward_loss >= 0);
  END IF;
END $$;

-- ── کمیسیونِ نقدیِ معرف روی صندوق ─────────────────────────────────────────
--
-- قانونِ مالک: «کمیسیون نقدی فقط از فروش شاپ». صندوق دقیقاً یک فروشِ نقدیِ
-- درون‌برنامه‌ای است — پولِ تازه‌ای که از بازار وارد می‌شود — پس مشمول
-- کمیسیون است. آنچه مستثناست، کارتِ نقدیِ فیزیکی است که تیم چاپ می‌کند و
-- بودجه‌اش از قبل خرج شده.
ALTER TABLE purchase_referral_commissions
  DROP CONSTRAINT IF EXISTS purchase_referral_commissions_purchase_type_check;
ALTER TABLE purchase_referral_commissions
  ADD CONSTRAINT purchase_referral_commissions_purchase_type_check
  CHECK (purchase_type IN ('shop_item', 'plus_monthly', 'plus_annual', 'card_box'));

-- ── منبعِ تازه در دفترِ امتیاز ────────────────────────────────────────────
--
-- کارت‌های صندوق امتیاز می‌دهند (خواستهٔ صریحِ مالک)، و هر امتیازی باید در
-- `point_transactions` ردی داشته باشد وگرنه دفتر با `users.current_points`
-- ناتراز می‌شود. منبعِ `card_box` جداست و در `photo_card` ادغام نشد، چون
-- تفکیکِ «امتیاز از کارتِ فیزیکی» و «امتیاز از صندوقِ خریداری‌شده» دقیقاً
-- همان چیزی است که برای سنجشِ سلامتِ اقتصاد لازم است.
--
-- ⚠️ همهٔ مقادیرِ قبلی عیناً تکرار شده‌اند. CHECK جایگزین می‌شود نه اضافه،
--    پس هر مقداری که در این فهرست نیاید از این لحظه غیرمجاز است و
--    درج‌های موجود در تولید می‌شکنند.
ALTER TABLE point_transactions
  DROP CONSTRAINT IF EXISTS point_transactions_source_check;
ALTER TABLE point_transactions
  ADD CONSTRAINT point_transactions_source_check
  CHECK (source IN (
    'photo_card', 'card_code', 'referral', 'game', 'pass_reward',
    'wheel', 'login_streak', 'mission', 'reward_claim',
    'admin_adjust', 'admin_deduct',
    'signup_gift',
    'card_box',
    'league_perk',
    'other'
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- جوایز لیگ: نقدی و غیرنقدی
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `league_seasons.prize_table` تا امروز آرایه‌ای از `{rank, amount}` بود —
-- فقط پول. حالا مالک دو ردهٔ جایزه می‌خواهد: ۵۰ نفرِ اول نقدی، ۲۰ نفرِ
-- بعدی جایزهٔ غیرنقدی (پلاس، آیتم شاپ، امتیاز).
--
-- ── چرا ستونِ جدا و نه گسترشِ همان JSON ──
--
-- `prize_table` را `closeActiveSeason` می‌خواند و مستقیم به `league_payouts`
-- می‌ریزد، و آن جدول `amount BIGINT CHECK (amount >= 0)` دارد و برایِ پول
-- ساخته شده. اگر ردیفِ «۳۰ روز پلاس» را در همان آرایه می‌گذاشتیم، یا باید
-- `amount` را صفر می‌کردیم (که یعنی در گزارشِ مالی یک پرداختِ صفرتومانیِ
-- بی‌معنی می‌نشست) یا نوعِ ستون را عوض می‌کردیم. ستونِ جدا هر دو مسیر را
-- مستقل و صریح نگه می‌دارد.
ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS perk_table JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN league_seasons.perk_table IS
  'جوایزِ غیرنقدی: [{rank, kind:plus_days|shop_item|points, value, label}]';

-- سندِ تحویلِ جایزهٔ غیرنقدی.
--
-- جدا از `league_payouts` چون آن جدول واحدش تومان است و وضعیتش
-- pending/approved/paid — یعنی چرخهٔ تأییدِ مالی. جایزهٔ غیرنقدی چرخهٔ
-- مالی ندارد؛ یا تحویل شده یا نشده.
CREATE TABLE IF NOT EXISTS league_perk_awards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_season_id UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank             INTEGER NOT NULL CHECK (rank > 0),
  kind             VARCHAR(24) NOT NULL
                   CHECK (kind IN ('plus_days','shop_item','points')),
  -- روز برای plus_days، امتیاز برای points، ۱ برای shop_item.
  value            INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  -- slug آیتمِ شاپ، فقط برای kind='shop_item'.
  item_slug        VARCHAR(64),
  label            VARCHAR(160),
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- یک کاربر در یک فصل فقط یک جایزهٔ غیرنقدی. همان ثابتی که
  -- `league_payouts` بعد از مهاجرت ۰۱۴ گرفت: کلیدِ درست «کاربر در فصل»
  -- است نه «رتبه در فصل» — چون DENSE_RANK به دو نفرِ هم‌امتیاز یک رتبه
  -- می‌دهد و کلیدِ رتبه‌ای جایزهٔ نفرِ دوم را بی‌صدا می‌بلعید.
  UNIQUE (league_season_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_league_perk_season
  ON league_perk_awards(league_season_id, rank);

-- ── تعدادِ برندگان ────────────────────────────────────────────────────────
--
-- پیش‌فرضِ `league_winner_count` تا امروز ۱۰ بود. مالک ۵۰ نقدی خواسته، پس
-- پیش‌فرض همان می‌شود. ردیفِ موجود دست نمی‌خورد: اگر مدیر قبلاً عددی
-- گذاشته، انتخابِ او بر پیش‌فرض مقدم است.
INSERT INTO app_settings(key, value, updated_at)
VALUES ('league_winner_count', '50'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings(key, value, updated_at)
VALUES ('league_perk_count', '20'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- قیمتِ صندوق، تومان. در app_settings تا مدیر بتواند بدونِ استقرار عوضش
-- کند (مثلاً برای یک کمپینِ تخفیف).
INSERT INTO app_settings(key, value, updated_at)
VALUES ('card_box_price', '100000'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;
