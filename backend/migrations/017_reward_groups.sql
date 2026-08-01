-- Reward groups, required cards, and payout wiring.
--
-- WHAT CHANGES AND WHY
--
-- 1. Two admin-managed GROUPS. Rewards were a single flat list; the product
--    needs two parallel tracks (e.g. a cash track and a physical track) that
--    a user progresses through independently, each with its own progress bar.
--
-- 2. Required CARDS per reward. A tier could only ever cost points. The
--    product also wants "collect these specific cards" as a condition, shown
--    as card artwork on the progress bar.
--
-- 3. Claim payout. Claiming produced a `pending` row and nothing else: a cash
--    reward never reached the wallet and a physical reward left no trace on
--    the profile. Both are wired up here.
--
-- 4. Per-group progress reset. After claiming, that group's bar restarts.

-- ── groups ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  image_url     TEXT,
  -- Which kind of reward this track hands out. Kept on the GROUP so the UI
  -- can label the whole track, while individual tiers still carry their own
  -- reward_type for the actual payout.
  group_type    VARCHAR(20) NOT NULL DEFAULT 'mixed'
                CHECK (group_type IN ('cash', 'physical', 'mixed')),
  accent        VARCHAR(16) NOT NULL DEFAULT 'emerald',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing tiers belong to no group until an admin assigns them; NULL is
-- rendered as an "بدون گروه" bucket rather than being hidden, so nothing
-- silently disappears from the catalogue on deploy.
ALTER TABLE reward_tiers
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES reward_groups(id) ON DELETE SET NULL;

-- Cash amount to credit on approval. reward_value is free text (a label);
-- money needs its own typed column. BIGINT toman, matching wallet_balance.
ALTER TABLE reward_tiers
  ADD COLUMN IF NOT EXISTS cash_amount BIGINT NOT NULL DEFAULT 0
    CHECK (cash_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_reward_tiers_group
  ON reward_tiers(group_id, display_order);

-- ── required cards ────────────────────────────────────────────────────────
-- A tier may require N copies of specific card types in addition to points.
CREATE TABLE IF NOT EXISTS reward_tier_cards (
  reward_tier_id UUID NOT NULL REFERENCES reward_tiers(id) ON DELETE CASCADE,
  card_type_id   UUID NOT NULL REFERENCES card_types(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (reward_tier_id, card_type_id)
);

-- ── per-group progress ────────────────────────────────────────────────────
-- Points are global (users.current_points), but each group's BAR must restart
-- on its own when that group's reward is claimed. Storing the baseline the
-- bar counts from keeps the two groups independent without a second points
-- balance to keep in sync.
CREATE TABLE IF NOT EXISTS user_group_progress (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id         UUID NOT NULL REFERENCES reward_groups(id) ON DELETE CASCADE,
  -- Lifetime points at the moment this group was last claimed. Progress in
  -- the group = users.lifetime_points - baseline_points.
  baseline_points  INTEGER NOT NULL DEFAULT 0 CHECK (baseline_points >= 0),
  claims_count     INTEGER NOT NULL DEFAULT 0 CHECK (claims_count >= 0),
  last_claim_at    TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

-- ── claim payout trail ────────────────────────────────────────────────────
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES reward_groups(id) ON DELETE SET NULL;

-- Physical prizes are shown on the user's profile as a trophy shelf, so the
-- artwork must survive even if an admin later edits or deletes the tier.
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS reward_name  VARCHAR(160);
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS reward_image TEXT;
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS reward_type  VARCHAR(20);
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS cash_amount  BIGINT NOT NULL DEFAULT 0
    CHECK (cash_amount >= 0);
-- Set once the money actually lands in the wallet, so a re-approval can never
-- pay twice.
ALTER TABLE user_reward_claims
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_claims_user_type
  ON user_reward_claims(user_id, reward_type);

-- ── league: Tehran calendar ───────────────────────────────────────────────
-- Seasons were bounded with Date.UTC(), so a "month" ran from 03:30 Tehran on
-- the 1st to 03:30 on the next 1st. Record the intended zone so the boundary
-- is explicit and auditable rather than implied by whatever the server's
-- clock happens to be.
ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(40) NOT NULL DEFAULT 'Asia/Tehran';

-- Set once payouts have been credited to wallets, so re-running the close
-- job cannot pay a season twice.
ALTER TABLE league_seasons
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE league_payouts
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
