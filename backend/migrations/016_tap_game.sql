-- Tap game: server-authoritative progress + replay protection.
--
-- The client keeps a local copy for offline play, but THIS table is the
-- source of truth. When the two disagree the API answers with these numbers
-- and the client adopts them.

CREATE TABLE IF NOT EXISTS tap_game_progress (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level             INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  level_taps        INTEGER NOT NULL DEFAULT 0 CHECK (level_taps >= 0),
  total_taps        BIGINT  NOT NULL DEFAULT 0 CHECK (total_taps >= 0),

  -- Anti-cheat bookkeeping.
  flagged_taps      BIGINT  NOT NULL DEFAULT 0 CHECK (flagged_taps >= 0),
  rejected_batches  INTEGER NOT NULL DEFAULT 0 CHECK (rejected_batches >= 0),

  -- Replay protection: a batch must carry a strictly larger sequence than the
  -- last one accepted for this user, and a nonce we have not seen recently.
  last_sequence     BIGINT  NOT NULL DEFAULT 0,
  last_batch_at     TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recently-used nonces. A replayed request carries a nonce that is already
-- here and is refused. Rows older than the TTL are pruned on write, so this
-- stays small (a few rows per active player).
CREATE TABLE IF NOT EXISTS tap_game_nonces (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce     VARCHAR(64) NOT NULL,
  seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_tap_nonces_seen_at ON tap_game_nonces(seen_at);
CREATE INDEX IF NOT EXISTS idx_tap_progress_total ON tap_game_progress(total_taps DESC);
