-- Personal records for the SOLO (time-attack) mode.
--
-- Solo deliberately awards NO points — otherwise a player could farm the
-- balance alone, with nobody to lose to. Instead the reward is a record: your
-- best time and fewest flips, plus a public leaderboard.
CREATE TABLE IF NOT EXISTS solo_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id VARCHAR(40) NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  flips INTEGER NOT NULL CHECK (flips > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "My best run for this game" and the leaderboard both sort on the same key:
-- fastest time first, then fewest flips as the tie-break.
CREATE INDEX IF NOT EXISTS idx_solo_records_board
  ON solo_records(game_id, duration_ms ASC, flips ASC);

CREATE INDEX IF NOT EXISTS idx_solo_records_user
  ON solo_records(user_id, game_id, duration_ms ASC);
