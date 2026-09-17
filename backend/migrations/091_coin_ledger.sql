-- ════════════════════════════════════════════════════════════════════════════
--  دفترِ سکه — «سکه‌هایم از کجا آمد و کجا رفت؟»
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── چرا این جدول لازم شد ──────────────────────────────────────────────────
--
-- درخواستِ مالک (۱۷ شهریور): «بررسی کن اضافه شدن سکه با تمامی بازی‌ها ثبت
-- می‌شود یا نه، و آیا کسرِ سکه در پایانِ لیگ هم ثبت می‌شود؟ اگر نه، اضافه کن.»
--
-- واقعیتِ کد پیش از این مایگریشن:
--
--   • سکه فقط «عددی روی users.coins» و «ردیفی در league_leaderboard_entries»
--     بود؛ هیچ دفتری نداشت. پس نه کاربر می‌توانست بفهمد سکه‌اش از کجا آمده،
--     نه ما می‌توانستیم ثابت کنیم سکهٔ یک بازی واقعاً واریز شده.
--   • پایانِ هر لیگ، سکه‌ها **بی‌صدا** از `users.coins` پاک می‌شدند
--     (`UPDATE users SET coins=0`) و فقط درصدی به لیگِ بعد منتقل می‌شد؛
--     کاربر می‌دید سکه‌هایش ناپدید شده و **هیچ ردپایی** نبود.
--
-- ── شکلِ ردیف ─────────────────────────────────────────────────────────────
--
-- مثلِ `point_transactions` (مایگریشن ۰۴۵) ساخته شده تا هر دو دفتر یک
-- خواندن داشته باشند: delta (تغییر)، balance_after (موجودی بعد از تغییر)،
-- source (منبع)، reference (به چه چیزی وصل است)، description (جملهٔ فارسیِ
-- کاربرفهم) و created_at.
--
-- منابعِ مجاز عمداً CHECK نشده‌اند (برخلاف دفترِ امتیاز): فهرستِ منابعِ سکه
-- با هر بازی/قابلیتِ تازه بزرگ می‌شود و CHECK یعنی برای هر بازیِ جدید یک
-- مایگریشن. اعتبارسنجی در `services/coinLedger.js` است.
--
-- ⚠️ `delta <> 0`: ردیفِ بی‌تغییر ثبت نمی‌شود؛ وگرنه «۰ سکه از پایانِ لیگ»
--    هزارها ردیفِ بی‌معنی می‌ساخت.
-- ⚠️ `balance_after >= 0`: موجودیِ سکه هیچ‌وقت منفی نمی‌شود (کسر همیشه با
--    GREATEST(0, …) انجام می‌شود)، پس ردیفِ منفیِ ناممکن نباید ثبت شود.

CREATE TABLE IF NOT EXISTS coin_transactions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta          INTEGER NOT NULL CHECK (delta <> 0),
  balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),
  source         VARCHAR(40) NOT NULL,
  reference_type VARCHAR(40),
  reference_id   VARCHAR(64),
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- دفترِ هر کاربر به ترتیبِ زمان خوانده می‌شود (صفحه‌بندیِ کلاینت‌ها).
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_time
  ON coin_transactions(user_id, created_at DESC, id DESC);

-- فیلترِ «فقط سکه‌های بازی» یا «فقط پایانِ لیگ».
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_source_time
  ON coin_transactions(user_id, source, created_at DESC);

COMMENT ON TABLE coin_transactions IS
  'دفترِ سکه: هر واریز/کسرِ سکه با موجودیِ بعد از آن. منبع‌ها در services/coinLedger.js.';
