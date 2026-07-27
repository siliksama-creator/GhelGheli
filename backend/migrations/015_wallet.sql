-- ============================================================================
--  کیف پول تومانی (Toman Wallet)
-- ============================================================================
--
-- طراحی: یک «دفتر کل» (ledger) تغییرناپذیر + یک موجودی کششده روی users.
--
-- چرا هر دو؟
--   * ledger منبع حقیقت است: هر ریالی که وارد یا خارج می‌شود یک ردیف دارد با
--     منبع، مرجع و موجودی بعد از تراکنش. هیچ ردیفی UPDATE یا DELETE نمی‌شود،
--     پس اختلاف حساب همیشه قابل ردیابی است.
--   * users.wallet_balance فقط کش است تا هر صفحه‌ای که موجودی می‌خواهد مجبور
--     نباشد کل دفتر را SUM کند. با CHECK (>=0) هم دیتابیس خودش جلوی موجودی
--     منفی را می‌گیرد، حتی اگر یک باگ در کد از اعتبارسنجی رد شود.
--
-- واحد پول: **تومان**، به صورت BIGINT. هیچ‌جا اعشار نداریم (تومان کوچک‌ترین
-- واحد قابل پرداخت است) و BIGINT سقف INTEGER (~۲.۱ میلیارد) را ندارد — یک
-- جایزهٔ ۵ میلیارد تومانی هم سرریز نمی‌کند.

-- ---------------------------------------------------------------------------
-- ۱) موجودی کیف پول + کارت بانکی روی users
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_balance BIGINT NOT NULL DEFAULT 0
    CHECK (wallet_balance >= 0),
  -- کارت بانکی: شماره ۱۶ رقمی، نام صاحب کارت و شبا (اختیاری).
  -- عمداً جدا از ستون قدیمی و آزاد `bank_account` تعریف شده تا اعتبارسنجی
  -- سخت‌گیرانه (۱۶ رقم + Luhn) فقط روی مسیر برداشت اعمال شود و دادهٔ آزاد
  -- قبلی که کاربران وارد کرده‌اند خراب/نامعتبر تلقی نشود.
  ADD COLUMN IF NOT EXISTS bank_card_number VARCHAR(16),
  ADD COLUMN IF NOT EXISTS bank_card_holder VARCHAR(120),
  ADD COLUMN IF NOT EXISTS bank_card_sheba VARCHAR(26),
  ADD COLUMN IF NOT EXISTS bank_card_bank VARCHAR(60),
  ADD COLUMN IF NOT EXISTS bank_card_saved_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bank_card_number_digits;
ALTER TABLE users ADD CONSTRAINT users_bank_card_number_digits
  CHECK (bank_card_number IS NULL OR bank_card_number ~ '^[0-9]{16}$');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bank_card_sheba_format;
ALTER TABLE users ADD CONSTRAINT users_bank_card_sheba_format
  CHECK (bank_card_sheba IS NULL OR bank_card_sheba ~ '^IR[0-9]{24}$');

-- ---------------------------------------------------------------------------
-- ۲) جایزهٔ نقدی روی نوع کارت
-- ---------------------------------------------------------------------------
-- کارتی که مدیر در پنل تعریف می‌کند می‌تواند هم امتیاز بدهد و هم پول نقد.
-- ۰ یعنی کارت غیرنقدی (رفتار فعلی، بدون تغییر برای کارت‌های موجود).
ALTER TABLE card_types
  ADD COLUMN IF NOT EXISTS cash_amount BIGINT NOT NULL DEFAULT 0
    CHECK (cash_amount >= 0);

-- جوایز نقدی سطح‌بندی‌شده هم مبلغ عددی می‌گیرند. reward_value یک TEXT آزاد
-- بود («۵۰ هزار تومان») که ماشین نمی‌تواند رویش حساب کند.
ALTER TABLE reward_tiers
  ADD COLUMN IF NOT EXISTS cash_amount BIGINT NOT NULL DEFAULT 0
    CHECK (cash_amount >= 0);

-- ---------------------------------------------------------------------------
-- ۳) دفتر کل تراکنش‌ها
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- credit = پول وارد کیف پول شد، debit = خارج شد
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  -- از کجا آمد / کجا رفت
  source VARCHAR(32) NOT NULL CHECK (source IN (
    'card_cash',            -- ثبت کارتی که جایزهٔ نقدی دارد
    'wheel',                -- گردونهٔ شانس (آماده برای پیاده‌سازی بعدی)
    'reward',               -- جایزهٔ نقدی از بخش جوایز
    'league',               -- جایزهٔ نقدی لیگ ماهانه
    'admin_credit',         -- افزایش دستی توسط مدیر
    'admin_debit',          -- کاهش دستی توسط مدیر
    'withdrawal_hold',      -- بلوکه شدن مبلغ هنگام ثبت درخواست برداشت
    'withdrawal_refund'     -- برگشت مبلغ در صورت رد یا لغو درخواست
  )),
  -- مرجع رویدادی که باعث این تراکنش شد (کد کارت، درخواست جایزه، پرداخت لیگ،
  -- درخواست برداشت و ...). برای ردیابی و برای جلوگیری از واریز تکراری.
  reference_type VARCHAR(40),
  reference_id UUID,
  -- موجودی دقیقاً بعد از این تراکنش. تاریخچه را بدون بازمحاسبه قابل خواندن
  -- می‌کند و اگر روزی ledger و کش از هم فاصله بگیرند، نقطهٔ انحراف پیداست.
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  description TEXT,
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_time
  ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_source
  ON wallet_transactions(source, created_at DESC);

-- ضدواریز-تکراری: هر رویداد بیرونی فقط یک بار می‌تواند کیف پول را شارژ کند.
-- بدون این، دو بار زدن دکمهٔ «تأیید» روی یک جایزه، یا اجرای دوبارهٔ بستن لیگ،
-- پول را دو برابر واریز می‌کرد — دقیقاً همان دسته باگی که در ممیزی قبلی
-- (جایزهٔ لیگ در تساوی) پول کاربر را جابه‌جا کرده بود.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_reference
  ON wallet_transactions(source, reference_id)
  WHERE reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ۴) درخواست‌های برداشت
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  -- اسنپ‌شات کارت بانکی در لحظهٔ ثبت درخواست.
  -- اگر کاربر بعد از ثبت درخواست کارتش را عوض کند، مدیر باید همان کارتی را
  -- ببیند که کاربر موقع درخواست تأیید کرده بود — وگرنه پول به حساب اشتباه
  -- واریز می‌شود و هیچ سندی از کارت اصلی باقی نمی‌ماند.
  card_number VARCHAR(16) NOT NULL,
  card_holder VARCHAR(120) NOT NULL,
  card_sheba VARCHAR(26),
  card_bank VARCHAR(60),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'canceled')),
  admin_note TEXT,
  -- شمارهٔ پیگیری واریز بانکی که مدیر بعد از پرداخت ثبت می‌کند
  tracking_code VARCHAR(80),
  decided_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_time
  ON withdrawal_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_time
  ON withdrawal_requests(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- ۵) تنظیمات کیف پول
-- ---------------------------------------------------------------------------
INSERT INTO app_settings(key, value)
VALUES ('wallet_settings', '{
  "enabled": true,
  "minWithdrawal": 50000,
  "maxWithdrawal": 50000000,
  "maxPendingRequests": 2,
  "note": "برداشت‌ها طی ۲۴ تا ۷۲ ساعت کاری بررسی و واریز می‌شوند."
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
