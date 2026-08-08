-- دوئل کارت‌های قلقلی
--
-- MVP کم‌ریسک: بازی مستقل داخل بخش بازی‌ها، بدون تغییر لیگ اصلی.
-- مدیر استات‌ها را هنگام تعریف کارت می‌دهد؛ کاربر ۳ کارت را به‌عنوان
-- تیم Ghost آماده می‌کند؛ سیستم روزانه تا ۱۰ نبرد خودکار انجام می‌دهد.

ALTER TABLE card_types
  ADD COLUMN IF NOT EXISTS duel_attack      SMALLINT NOT NULL DEFAULT 50 CHECK (duel_attack BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duel_defense     SMALLINT NOT NULL DEFAULT 50 CHECK (duel_defense BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duel_speed       SMALLINT NOT NULL DEFAULT 50 CHECK (duel_speed BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duel_technique   SMALLINT NOT NULL DEFAULT 50 CHECK (duel_technique BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duel_goal_chance SMALLINT NOT NULL DEFAULT 50 CHECK (duel_goal_chance BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duel_energy      SMALLINT NOT NULL DEFAULT 100 CHECK (duel_energy BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duel_rarity      VARCHAR(16) NOT NULL DEFAULT 'normal'
    CHECK (duel_rarity IN ('normal','silver','gold','premium','legend')),
  ADD COLUMN IF NOT EXISTS duel_effect      VARCHAR(32) NOT NULL DEFAULT 'none'
    CHECK (duel_effect IN ('none','finisher','wall','speedster','playmaker','lucky_star'));

COMMENT ON COLUMN card_types.duel_attack IS 'دوئل کارت: قدرت حمله';
COMMENT ON COLUMN card_types.duel_defense IS 'دوئل کارت: قدرت دفاع';
COMMENT ON COLUMN card_types.duel_speed IS 'دوئل کارت: سرعت';
COMMENT ON COLUMN card_types.duel_technique IS 'دوئل کارت: تکنیک';
COMMENT ON COLUMN card_types.duel_goal_chance IS 'دوئل کارت: شانس گل';
COMMENT ON COLUMN card_types.duel_energy IS 'دوئل کارت: انرژی';
COMMENT ON COLUMN card_types.duel_rarity IS 'دوئل کارت: کلاس/کمیابی';
COMMENT ON COLUMN card_types.duel_effect IS 'دوئل کارت: افکت خاص محدود و قابل بالانس';

CREATE TABLE IF NOT EXISTS card_duel_decks (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  card_type_ids UUID[] NOT NULL CHECK (array_length(card_type_ids, 1) = 3),
  ghost_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS card_duel_battles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode               VARCHAR(16) NOT NULL CHECK (mode IN ('bot','ghost','auto_ghost')),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  user_card_type_ids UUID[] NOT NULL CHECK (array_length(user_card_type_ids, 1) = 3),
  opponent_card_type_ids UUID[] CHECK (opponent_card_type_ids IS NULL OR array_length(opponent_card_type_ids, 1) = 3),
  user_score         SMALLINT NOT NULL DEFAULT 0 CHECK (user_score >= 0),
  opponent_score     SMALLINT NOT NULL DEFAULT 0 CHECK (opponent_score >= 0),
  winner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  stake_points       INTEGER NOT NULL DEFAULT 0 CHECK (stake_points >= 0),
  user_delta         INTEGER NOT NULL DEFAULT 0,
  opponent_delta     INTEGER NOT NULL DEFAULT 0,
  battle_log         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_duel_battles_user
  ON card_duel_battles(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_duel_battles_opponent
  ON card_duel_battles(opponent_user_id, created_at DESC)
  WHERE opponent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_duel_battles_auto_day
  ON card_duel_battles(mode, created_at DESC) WHERE mode = 'auto_ghost';

COMMENT ON TABLE card_duel_decks IS 'تیم سه‌کارتی آمادهٔ Ghost برای دوئل کارت قلقلی.';
COMMENT ON TABLE card_duel_battles IS 'تاریخچهٔ دوئل کارت: bot بدون امتیاز، ghost با انتقال محدود امتیاز.';
