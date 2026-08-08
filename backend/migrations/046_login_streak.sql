-- هفت‌روزِ ورودِ روزانه
-- هر کاربر در هر روز تهران فقط یک بار می‌تواند پاداش بگیرد.
-- پس از روز هفتم، چرخه از روز اول دوباره شروع می‌شود؛ با جاافتادن یک روز
-- نیز چرخه از روز اول شروع می‌شود.

CREATE TABLE IF NOT EXISTS login_streaks (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak_day        SMALLINT NOT NULL DEFAULT 0 CHECK (streak_day BETWEEN 0 AND 7),
  last_claimed_date DATE,
  total_claims      INTEGER NOT NULL DEFAULT 0 CHECK (total_claims >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_streaks_last_claimed
  ON login_streaks(last_claimed_date);

COMMENT ON TABLE login_streaks IS
  'پاداش ورود هفت‌روزه؛ هر user در هر روز تهران حداکثر یک claim دارد.';

-- منبع مستقل لازم است تا پاداش در دفتر امتیازات قابل ردیابی باشد.
ALTER TABLE point_transactions
  DROP CONSTRAINT IF EXISTS point_transactions_source_check;

ALTER TABLE point_transactions
  ADD CONSTRAINT point_transactions_source_check CHECK (source IN (
    'photo_card', 'card_code', 'referral', 'game', 'pass_reward',
    'wheel', 'login_streak', 'reward_claim', 'admin_adjust',
    'admin_deduct', 'other'
  ));
