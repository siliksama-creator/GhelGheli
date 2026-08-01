-- Reward refunds, and lifting the admin's reward-count cap.

-- Stamped when a rejected claim's points are returned, so a second rejection
-- (or a re-save of the same status) cannot refund twice.
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Deleting a reward tier used to be impossible once anyone had claimed it,
-- because user_reward_claims.reward_tier_id is ON DELETE RESTRICT. The admin
-- needs full control, and the claim already stores its own snapshot of the
-- name/image/type/amount, so it survives the tier going away.
ALTER TABLE user_reward_claims
  DROP CONSTRAINT IF EXISTS user_reward_claims_reward_tier_id_fkey;

ALTER TABLE user_reward_claims
  ADD CONSTRAINT user_reward_claims_reward_tier_id_fkey
  FOREIGN KEY (reward_tier_id) REFERENCES reward_tiers(id) ON DELETE SET NULL;

-- ...which means the column must allow NULL for a deleted tier.
ALTER TABLE user_reward_claims
  ALTER COLUMN reward_tier_id DROP NOT NULL;

-- Backfill the snapshot for older claims so nothing renders blank after a
-- tier is later deleted.
UPDATE user_reward_claims c
   SET reward_name  = COALESCE(c.reward_name,  r.name),
       reward_image = COALESCE(c.reward_image, r.image_url),
       reward_type  = COALESCE(c.reward_type,  r.reward_type),
       cash_amount  = CASE WHEN c.cash_amount = 0
                           THEN COALESCE(r.cash_amount, 0) ELSE c.cash_amount END
  FROM reward_tiers r
 WHERE r.id = c.reward_tier_id
   AND (c.reward_name IS NULL OR c.reward_type IS NULL);
