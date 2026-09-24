-- ═══════════════════════════════════════════════════════════════════════
-- «صندوق سکه» — سکهٔ ماندگار، جدا از سکهٔ موقتِ لیگ
-- ═══════════════════════════════════════════════════════════════════════
--
-- ── خواستهٔ مالک (۱۴۰۵/۰۷/۰۲) ─────────────────────────────────────────
--
-- «یه قسمت جدید به نام صندوق سکه… مجموع سکه موقت در لیگ جاری رو نشون
--  می‌ده، و یه قسمت هم سکه بدست آمده که اون ۱۰ درصد سکه بعد پایان لیگ
--  ذخیره بشه داخلش و دیگه به لیگ جدید منتقل نشه. این تب این امکان رو به
--  کاربر می‌ده که خودش با انتخاب خودش سکه بدست اومده رو به هر لیگ در
--  جریانی که خواست واریز کنه.»
--
-- ── تغییرِ رفتار ──────────────────────────────────────────────────────
--
-- تا امروز درصدِ تنظیم‌شده (`coinCarryoverPercent`، پیش‌فرض ۱۰) هنگامِ
-- ساختنِ لیگِ تازه **مستقیماً** روی ردیفِ همان کاربر در لیگِ جدید
-- می‌نشست. از این پس همان درصد به **صندوق** می‌رود و تا وقتی خودِ کاربر
-- تصمیم نگیرد، وارد هیچ لیگی نمی‌شود. درصد همچنان از پنل ادمین تنظیم
-- می‌شود؛ فقط مقصدش عوض شده.
--
-- ── چرا ستونِ جدا و نه استفاده از users.coins ─────────────────────────
--
-- `users.coins` عمداً «مجموعِ سکهٔ لیگ‌های فعال» است و با پایانِ لیگ صفر
-- می‌شود (مهاجرت ۰۶۶). سکهٔ صندوق دقیقاً خلافِ آن است: با پایانِ لیگ
-- **نمی‌میرد**. ریختنشان در یک ستون یعنی یکی از این دو قاعده باید بشکند.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vault_coins BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_vault_coins_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_vault_coins_check CHECK (vault_coins >= 0);
  END IF;
END $$;

COMMENT ON COLUMN users.vault_coins IS
  'صندوق سکه: سکهٔ ماندگار. با پایانِ لیگ صفر نمی‌شود. فقط با انتخابِ خودِ کاربر به یک لیگِ فعال واریز می‌شود.';

-- ── دفترِ صندوق ────────────────────────────────────────────────────────
--
-- ⚠️ چرا جدولِ جدا و نه `coin_transactions`:
--    ستونِ `balance_after` در آن دفتر به‌معنای «موجودیِ users.coins پس از
--    این حرکت» است و کلاینت‌ها همان را نشان می‌دهند. اگر حرکتِ صندوق را
--    هم آنجا می‌نوشتیم، یک ستون دو معنای متفاوت می‌گرفت و هر گزارشی که
--    از آن خوانده می‌شد بی‌صدا غلط می‌شد.
CREATE TABLE IF NOT EXISTS coin_vault_transactions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta          BIGINT NOT NULL CHECK (delta <> 0),
  balance_after  BIGINT NOT NULL CHECK (balance_after >= 0),
  -- 'league_end'  : درصدِ سکه پس از بستنِ لیگ وارد صندوق شد (مثبت)
  -- 'deposit'     : کاربر از صندوق به یک لیگِ فعال واریز کرد (منفی)
  -- 'admin_adjust': دستِ مدیر
  source         VARCHAR(32) NOT NULL,
  season_id      UUID REFERENCES league_seasons(id) ON DELETE SET NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_vault_tx_user_time
  ON coin_vault_transactions(user_id, created_at DESC, id DESC);

COMMENT ON TABLE coin_vault_transactions IS
  'دفترِ صندوق سکه. balance_after = موجودیِ users.vault_coins پس از حرکت (نه users.coins).';
