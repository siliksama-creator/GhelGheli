-- Per-tier claim limit.
--
-- Found by an end-to-end test: with points to spare a user could claim the
-- same prize repeatedly in a row. Each claim is individually legitimate (the
-- points really are there and really are spent), but no prize catalogue
-- intends "buy this physical trophy 125 times".
--
-- NULL / 0 = unlimited, which keeps every existing tier behaving exactly as
-- it does today. An admin opts in to a limit.
ALTER TABLE reward_tiers
  ADD COLUMN IF NOT EXISTS max_claims_per_user INTEGER NOT NULL DEFAULT 0
    CHECK (max_claims_per_user >= 0);

-- Counting a user's claims per tier is now on the hot path of the rewards
-- screen, so give it an index rather than scanning the claims table.
CREATE INDEX IF NOT EXISTS idx_claims_user_tier
  ON user_reward_claims(user_id, reward_tier_id);
