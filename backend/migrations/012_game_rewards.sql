-- Points for winning/losing an ONLINE human-vs-human match.
--
-- Deliberately excludes bot games: otherwise a player could farm unlimited
-- points by beating the computer on repeat. Only a real opponent counts.
--
-- Stored in app_settings (one JSON row) rather than its own table because it
-- is a single global config the admin edits from the panel, exactly like the
-- chat settings next to it.
INSERT INTO app_settings(key, value)
VALUES ('game_reward_settings', '{
  "enabled": false,
  "winPoints": 10,
  "losePoints": 0,
  "drawPoints": 0,
  "dailyCap": 10
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Audit trail of every point change from a match. Also powers the daily cap
-- and gives support a way to explain "why did my score change?".
CREATE TABLE IF NOT EXISTS game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  game_id VARCHAR(40) NOT NULL,
  outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  points_delta INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives the per-day cap lookup.
CREATE INDEX IF NOT EXISTS idx_game_results_user_day
  ON game_results(user_id, created_at DESC);
