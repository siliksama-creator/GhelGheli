-- ═══════════════════════════════════════════════════════════════════════════
-- ۰۶۷ — سفارش‌های پرداخت (شارژ کیف پول از طریق کافه‌بازار)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- مسئله‌ای که این مایگریشن حل می‌کند
-- ─────────────────────────────────────────────────────────────────────────
-- تا امروز `wallet_transactions` هیچ منبعی برای «شارژ» نداشت. کاربر فقط از
-- راه کارت نقدی، جایزهٔ گردونه، لیگ یا واریز دستی ادمین پول می‌گرفت. یعنی
-- خرید «قلقلی پلاس» (۵۹٬۰۰۰ / ۴۹۹٬۰۰۰ تومان) عملاً برای کاربر جدید
-- **غیرممکن** بود: دکمه را می‌زد و «موجودی کیف پول کافی نیست» می‌گرفت.
--
-- چرا یک جدول جدا لازم است و نه فقط یک منبع جدید در wallet_transactions
-- ─────────────────────────────────────────────────────────────────────────
-- پرداخت درون‌برنامه‌ای یک فرایند **چندمرحله‌ای و ناهمگام** است:
--
--     ۱. کاربر دکمه را می‌زند        → سفارش با وضعیت pending ساخته می‌شود
--     ۲. کاربر در کافه‌بازار پول می‌دهد → کلاینت یک purchase_token می‌گیرد
--     ۳. سرور توکن را از API بازار    → verify می‌کند
--     ۴. تازه اینجا کیف پول شارژ      → wallet_transactions
--
-- بین مرحلهٔ ۱ و ۴ ممکن است اپ بسته شود، اینترنت قطع شود، یا کاربر دو بار
-- تپ کند. بدون جدولِ سفارش هیچ‌جا ثبت نمی‌شود که «این پرداخت در جریان
-- است»، و تشخیص «پرداخت گم‌شده» از «پرداخت تکراری» ناممکن می‌شود.
--
-- ضدتقلب: purchase_token یکتاست
-- ─────────────────────────────────────────────────────────────────────────
-- مهم‌ترین خطِ دفاعی همین است. اگر کاربر یک توکن معتبر را دوبار بفرستد
-- (چه از روی خطا چه عمدی)، UNIQUE اجازه نمی‌دهد دو بار شارژ شود. این
-- شرط در سطح دیتابیس است، نه در کد — پس حتی با دو درخواست کاملاً هم‌زمان
-- روی دو کانکشن مختلف هم نگه می‌دارد.

CREATE TABLE IF NOT EXISTS payment_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- مبلغ به **تومان**. همان واحدی که کل کیف پول با آن کار می‌کند.
  amount           BIGINT NOT NULL CHECK (amount > 0),

  -- درگاه. فعلاً فقط cafebazaar، ولی ستون از روز اول هست تا اضافه‌کردن
  -- زرین‌پال بعداً مایگریشنِ تغییرِ ساختار نخواهد.
  provider         VARCHAR(32) NOT NULL DEFAULT 'cafebazaar'
                     CHECK (provider IN ('cafebazaar', 'zarinpal', 'manual')),

  -- شناسهٔ محصول در کنسول کافه‌بازار (مثل ghelgheli_wallet_50000).
  product_id       VARCHAR(120),

  -- توکن خریدی که کلاینت بعد از پرداخت موفق می‌گیرد. تا قبل از پرداخت
  -- NULL است، برای همین UNIQUE جزئی (partial) است.
  purchase_token   TEXT,

  status           VARCHAR(16) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),

  -- پاسخ خام درگاه. برای پشتیبانی و رفع اختلاف حیاتی است: وقتی کاربر
  -- می‌گوید «پول دادم ولی نگرفتم»، تنها مدرک همین است.
  gateway_payload  JSONB,

  -- به تراکنش کیف پولی که در نهایت ساخته شد وصل می‌شود.
  wallet_tx_id     UUID,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at          TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ضدتکرار: یک توکن خرید فقط یک بار می‌تواند شارژ شود.
-- WHERE چون سفارش‌های pending هنوز توکن ندارند و NULLها نباید با هم
-- تداخل کنند.
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_token_uniq
  ON payment_orders (provider, purchase_token)
  WHERE purchase_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_orders_user_idx
  ON payment_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_orders_status_idx
  ON payment_orders (status, created_at DESC)
  WHERE status = 'pending';

-- ── منبع جدید در دفترکل کیف پول ────────────────────────────────────────
-- `topup` باید به CHECK موجود اضافه شود وگرنه walletService.credit با
-- خطای CHECK شکست می‌خورد.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
    FROM pg_constraint
   WHERE conrelid = 'wallet_transactions'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%source%'
   LIMIT 1;

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
      'card_box'
    ));
END $$;
