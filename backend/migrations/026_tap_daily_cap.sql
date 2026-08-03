-- Tap game: at most three level-ups per calendar day.
--
-- WHY IT IS SERVER STATE AND NOT A CLIENT RULE
--
-- The client already refuses to advance past the cap, but a client-only cap
-- is worth nothing: the whole point of the tap game's signed-batch protocol
-- is that the phone is treated as hostile. Worse, without server state the
-- two clients (app and web) would each keep their own count and a player
-- could take three levels on the phone and three more in the browser.
--
-- WHICH DAY
--
-- Asia/Tehran, always, for every player. Deriving the day from the device's
-- own clock would let anyone unlock a fresh allowance by changing their time
-- zone, and deriving it from UTC would roll the counter over at 03:30 local
-- — the middle of the evening for nobody and confusing for everyone. The
-- expression is written out explicitly rather than relying on the session's
-- TimeZone setting, because a pooled connection does not necessarily inherit
-- the server default and this must never silently change meaning.
--
-- WHY A STORED DATE RATHER THAN COUNTING ROWS
--
-- There is no per-level-up log to count, and adding one would mean a write
-- per level for information nobody reads. Two columns and a compare-and-
-- reset on write is exact and costs nothing.

ALTER TABLE tap_game_progress
  ADD COLUMN IF NOT EXISTS levels_today INTEGER NOT NULL DEFAULT 0
    CHECK (levels_today >= 0);

-- The Tehran calendar day that `levels_today` refers to. NULL for rows
-- written before this migration: the first batch after deploy sees a
-- mismatch against today and resets the counter, which is the correct
-- outcome — nobody is retroactively charged for levels taken yesterday.
ALTER TABLE tap_game_progress
  ADD COLUMN IF NOT EXISTS levels_day DATE;

-- Backfill so the column reads sensibly in the admin panel from the start.
-- Rows that were last touched TODAY keep an honest zero rather than a NULL;
-- either way the first write of the day recomputes it.
UPDATE tap_game_progress
   SET levels_day = (NOW() AT TIME ZONE 'Asia/Tehran')::date
 WHERE levels_day IS NULL;
