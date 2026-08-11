-- Integrated growth/reliability foundation: friends, missions, first-party
-- analytics + crash reporting, explicit financial histories, and match
-- settlement projection. All money/point movements still go through the
-- existing ledgers; these tables only add lifecycle/audit state.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS friendships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','blocked')),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_pair
  ON friendships(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);

CREATE TABLE IF NOT EXISTS user_mission_progress (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_key   VARCHAR(64) NOT NULL,
  period_key    VARCHAR(16) NOT NULL,
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  claimed_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mission_key, period_key)
);
CREATE INDEX IF NOT EXISTS idx_mission_progress_period
  ON user_mission_progress(period_key, mission_key);

ALTER TABLE point_transactions
  DROP CONSTRAINT IF EXISTS point_transactions_source_check;
ALTER TABLE point_transactions
  ADD CONSTRAINT point_transactions_source_check CHECK (source IN (
    'photo_card', 'card_code', 'referral', 'game', 'pass_reward',
    'wheel', 'login_streak', 'mission', 'reward_claim', 'admin_adjust',
    'admin_deduct', 'other'
  ));

CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name  VARCHAR(40) NOT NULL CHECK (event_name IN (
    'match_started','match_completed','rematch','share','friend_challenge'
  )),
  platform    VARCHAR(16) NOT NULL DEFAULT 'server'
              CHECK (platform IN ('server','web','android','ios','unknown')),
  game_id     VARCHAR(32),
  match_id    UUID,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time
  ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_time
  ON analytics_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_match
  ON analytics_events(match_id) WHERE match_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_crash_reports (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  platform     VARCHAR(16) NOT NULL CHECK (platform IN ('backend','web','android','ios','unknown')),
  source       VARCHAR(80),
  release      VARCHAR(80),
  error_hash   VARCHAR(64) NOT NULL,
  message      TEXT NOT NULL,
  stack        TEXT,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crashes_open_time
  ON app_crash_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crashes_hash_time
  ON app_crash_reports(error_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_status_history (
  id             BIGSERIAL PRIMARY KEY,
  request_id     UUID NOT NULL REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
  from_status    VARCHAR(16),
  to_status      VARCHAR(16) NOT NULL,
  actor_type     VARCHAR(16) NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  note           TEXT,
  tracking_code  VARCHAR(80),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_history_request
  ON withdrawal_status_history(request_id, created_at);

INSERT INTO withdrawal_status_history
  (request_id, from_status, to_status, actor_type, actor_admin_id, note, tracking_code, created_at)
SELECT w.id, NULL, w.status,
       CASE WHEN w.decided_by_admin_id IS NOT NULL THEN 'admin' ELSE 'system' END,
       w.decided_by_admin_id, w.admin_note, w.tracking_code, w.created_at
  FROM withdrawal_requests w
 WHERE NOT EXISTS (
   SELECT 1 FROM withdrawal_status_history h WHERE h.request_id=w.id
 );

ALTER TABLE card_duel_battles
  ADD COLUMN IF NOT EXISTS match_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_duel_battle_match
  ON card_duel_battles(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_duel_match_lookup
  ON card_duel_battles(match_id);

COMMENT ON TABLE analytics_events IS
  'Privacy-minimised first-party product events; authoritative match events are server-written.';
COMMENT ON TABLE app_crash_reports IS
  'Sanitised production crash inbox for backend, Web and mobile clients.';
COMMENT ON TABLE withdrawal_status_history IS
  'Immutable withdrawal lifecycle timeline; wallet holds/refunds remain in wallet_transactions.';

COMMIT;
