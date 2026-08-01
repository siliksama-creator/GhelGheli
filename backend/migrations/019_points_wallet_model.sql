-- Rework reward progress onto ONE spendable points balance.
--
-- THE BUG THIS FIXES (reproduced against production):
--
--   A user with 110 points claimed a 100-point reward in group A. Their
--   balance correctly dropped to 10 — but group B's bar still read 110, and
--   they could immediately claim B's 100-point reward too. Free prize.
--
-- Cause: progress was `lifetime_points - baseline_points(group)`, with a
-- SEPARATE baseline per group. Spending in one group only advanced that
-- group's baseline, so every other group still saw the full lifetime total.
-- With N groups a user could claim N rewards for the price of one.
--
-- The correct model — and the one actually specified — is a single spendable
-- wallet of points:
--
--   current_points         spendable. Claiming a reward subtracts from it,
--                          so EVERY group's bar moves back together.
--   lifetime_points        permanent history. Never decreases.
--   monthly_league_points  this month's ranking only. Reset at month end,
--                          never touched by a reward claim.
--
-- user_group_progress is no longer the source of truth for progress. It is
-- kept (claims_count, last_claim_at) purely as per-group history, which the
-- UI shows and the claim-limit check uses.

COMMENT ON COLUMN users.current_points IS
  'Spendable points. Rewards subtract from this; all reward progress bars measure it.';
COMMENT ON COLUMN users.lifetime_points IS
  'Total ever earned. Never decreases — history only, not spendable.';
COMMENT ON COLUMN users.monthly_league_points IS
  'Points earned this league month. Reset when the season closes. A reward claim must NOT touch this.';

-- baseline_points is now meaningless: progress reads current_points directly.
-- Zero it so nothing can accidentally read a stale offset, and record why.
UPDATE user_group_progress SET baseline_points = 0 WHERE baseline_points <> 0;

COMMENT ON COLUMN user_group_progress.baseline_points IS
  'DEPRECATED and always 0. Progress is users.current_points; kept only to avoid a destructive column drop on a live table.';

-- ── league standings history ──────────────────────────────────────────────
-- The spec: after a season closes the user should see, on their profile, what
-- rank they reached and what prize they won. league_payouts holds the prize
-- but nothing holds a readable per-user season summary, and the leaderboard
-- entries are wiped conceptually when points reset.
CREATE TABLE IF NOT EXISTS user_league_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id      UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
  month_year     VARCHAR(7) NOT NULL,
  rank           INTEGER NOT NULL CHECK (rank > 0),
  points         INTEGER NOT NULL CHECK (points >= 0),
  prize_amount   BIGINT  NOT NULL DEFAULT 0 CHECK (prize_amount >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_league_history_user
  ON user_league_history(user_id, created_at DESC);
