-- ═══════════════════════════════════════════════════════════════════════════
--  لیگِ معرف‌ها — آفرِ زمان‌دارِ ادمین برای دعوت‌کنندگان
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── خواستهٔ مالک (۴ مهر ۱۴۰۵) ───────────────────────────────────────────────
--
-- «در قسمت دعوت از دوستان باید یک تب جدید ایجاد کنی که تاپ ۱۰ بیشترین
--  دعوت‌کننده مشخص باشه و رنک هر فرد رو هم نشون بده حتی اگه تو تاپ ۱۰ نباشه.
--  و باید امکانی در پنل ادمین بسازی که اگه خواست به تاپ دعوت‌کنندگان جایزه
--  بده … اگه ادمین از پنل یه آفر مثل لیگ دعوت‌کنندگان قرار داد و کانفیگش
--  کرد، داخل تب دعوت‌کنندگان لیگ معرف‌ها برگزار بشه، به هر تعدادی که خواست،
--  در هر محدودهٔ زمانی، جایزه تعیین بشه.»
--
-- ── چرا یک جدولِ «فصل» و نه چند ستونِ تنظیمات ───────────────────────────────
--
-- لیگِ معرف‌ها سه حالتِ زندگی دارد: پیش از پایان (زنده)، پس از پایان
-- (برندگان قفل‌شده و در انتظارِ تأییدِ پرداخت)، و آرشیو. تنظیماتِ صرف
-- نمی‌توانست «چه کسی در این دوره چند دعوت داشت» را نگه دارد؛ اگر ادمین
-- بازه را عوض می‌کرد، جدولِ قبلی هم عوض می‌شد و جایزهٔ پرداخت‌شده بی‌سند
-- می‌ماند. پس مثلِ `league_seasons` یک ردیفِ دوره می‌سازیم که پرداخت‌ها به
-- آن گره می‌خورند.
--
-- ── فقط یک آفرِ فعال در هر زمان ────────────────────────────────────────────
--
-- تصمیمِ مالک: «فقط یکی در هر زمان». با ایندکسِ یکتای پارسیال اجرا می‌شود
-- (نه در کد) تا حتی اگر دو مسیرِ کد هم‌زمان بسازند، دیتابیس جلوی دومی را
-- بگیرد. `status='active'` شرطِ ایندکس است، پس دوره‌های بسته‌شده آزادند.

CREATE TABLE IF NOT EXISTS invite_league_seasons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'finished', 'cancelled')),
  -- جدولِ جایزه: [{ rank, label, points, coins, spins, cash }, …]
  -- `jsonb` و نه ستون‌های جدا: تعدادِ ردیف را ادمین تعیین می‌کند («به هر
  -- تعدادی که خواست») و هر ردیف تا چهار نوعِ جایزه دارد. ستونِ جدا یعنی یک
  -- مایگریشن برای هر ترکیبِ تازه.
  prize_table  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- حداقلِ دعوتِ معتبر برای ورود به جدول و گرفتنِ جایزه.
  min_invites  INTEGER NOT NULL DEFAULT 1 CHECK (min_invites >= 1),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at    TIMESTAMPTZ,
  CHECK (ends_at > starts_at)
);

-- «فقط یکی در هر زمان» — قیدِ دیتابیس، نه قیدِ امید.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invite_league_active
  ON invite_league_seasons (status) WHERE status = 'active';

-- صفحهٔ کاربر «آخرین آفرها» را به ترتیب نشان می‌دهد.
CREATE INDEX IF NOT EXISTS idx_invite_league_window
  ON invite_league_seasons (status, ends_at DESC);

COMMENT ON TABLE invite_league_seasons IS
  'لیگِ معرف‌ها: آفرِ زمان‌دارِ ادمین برای دعوت‌کنندگان (سرویس: inviteLeagueService).';


-- ═══════════════════════════════════════════════════════════════════════════
--  برندگان و پرداخت
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── چه چیزی اینجا **قفل** می‌شود و چرا ─────────────────────────────────────
--
-- `invites` و `rank` عمداً **کپی** می‌شوند. اگر بعدها کاربری حذف یا
-- غیرفعال شود، جدولِ رتبه‌بندی عوض می‌شود؛ ولی برندهٔ یک دورهٔ تمام‌شده
-- نباید عوض شود. عددِ لحظهٔ بستن، سندِ پرداخت است.
--
-- چهار نوعِ جایزه از هم جدا نگه داشته شده‌اند (نقاط/سکه/چرخش/پول) تا
-- پرداخت هرکدام مستقل و idempotent باشد: یک شکستِ نیمه‌راه نباید امتیاز
-- را دوباره بدهد یا پول را دوبار واریز کند.
CREATE TABLE IF NOT EXISTS invite_league_payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     UUID NOT NULL REFERENCES invite_league_seasons(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank          INTEGER NOT NULL CHECK (rank >= 1),
  invites       INTEGER NOT NULL DEFAULT 0,
  label         TEXT,
  prize_points  INTEGER NOT NULL DEFAULT 0 CHECK (prize_points >= 0),
  prize_coins   INTEGER NOT NULL DEFAULT 0 CHECK (prize_coins >= 0),
  prize_spins   INTEGER NOT NULL DEFAULT 0 CHECK (prize_spins >= 0),
  prize_cash    BIGINT  NOT NULL DEFAULT 0 CHECK (prize_cash >= 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'cancelled')),
  approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- یک کاربر در یک دوره فقط یک ردیف: پرداختِ دوبارهٔ همان رتبه ناممکن می‌شود.
  UNIQUE (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_invite_league_payouts_status
  ON invite_league_payouts (status, created_at DESC);

COMMENT ON TABLE invite_league_payouts IS
  'برندگان و پرداختِ لیگِ معرف‌ها؛ رتبه و تعدادِ دعوت در لحظهٔ بستن کپی می‌شود.';


-- ═══════════════════════════════════════════════════════════════════════════
--  منابعِ دفترکل: جایزهٔ لیگِ معرف‌ها
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── چرا منبعِ تازه لازم شد ────────────────────────────────────────────────
--
-- جایزهٔ این لیگ از «دستِ مدیر» نمی‌آید؛ سیستم در پایانِ دوره خودکار
-- پرداختش می‌کند. اگر با `admin_credit` ثبتش می‌کردیم، گزارشِ مالی هر دو
-- را یک‌جا نشان می‌داد و تفکیکِ سهمِ کمپین‌ها از تنظیمِ دستیِ مدیر ناممکن
-- می‌شد — دقیقاً همان چیزی که برای لیگِ ماهانه با منبعِ `league` حل شد.
--
-- ⚠️ CHECK هر دو جدول بازنویسی می‌شود، نه اضافه: CHECK جایگزین است و هر
--    مقداری که در فهرستِ تازه نیاید از این لحظه غیرمجاز می‌شود. همهٔ
--    مقادیرِ فعلی عیناً تکرار شده‌اند.
DO $$
DECLARE con_name TEXT;
BEGIN
  -- ── دفترکلِ امتیاز ──
  SELECT conname INTO con_name FROM pg_constraint
   WHERE conrelid = 'point_transactions'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%source%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE point_transactions DROP CONSTRAINT %I', con_name);
  END IF;
  ALTER TABLE point_transactions
    ADD CONSTRAINT point_transactions_source_check
    CHECK (source IN (
      'photo_card', 'card_code', 'referral', 'game', 'pass_reward',
      'wheel', 'login_streak', 'mission', 'reward_claim',
      'admin_adjust', 'admin_deduct',
      'signup_gift',
      'card_box',
      'league_perk',
      'invite_league',
      'other'
    ));

  -- ── دفترکلِ کیف پول ──
  SELECT conname INTO con_name FROM pg_constraint
   WHERE conrelid = 'wallet_transactions'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%source%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE wallet_transactions DROP CONSTRAINT %I', con_name);
  END IF;
  ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_source_check
    CHECK (source IN (
      'card_cash', 'wheel', 'reward', 'league',
      'admin_credit', 'admin_debit', 'withdrawal_hold', 'withdrawal_refund',
      'shop', 'subscription', 'purchase_referral', 'pass',
      'topup', 'topup_refund',
      'card_box',
      'invite_league'
    ));
END $$;
