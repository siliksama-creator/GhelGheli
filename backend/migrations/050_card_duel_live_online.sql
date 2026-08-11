-- Retire asynchronous Ghost battles and make card duel a live Socket.IO game.
-- Historical ghost rows stay readable for audit; no new route or cron can
-- create them. New matches are bot, online matchmaking, or private lobby.

BEGIN;

ALTER TABLE card_duel_battles
  DROP CONSTRAINT IF EXISTS card_duel_battles_mode_check;

ALTER TABLE card_duel_battles
  ADD CONSTRAINT card_duel_battles_mode_check
  CHECK (mode IN ('bot','online','lobby','ghost','auto_ghost'));

-- Disable every previously prepared asynchronous team. The column remains for
-- backward-compatible schema reads but is no longer accepted from clients.
UPDATE card_duel_decks SET ghost_enabled=false WHERE ghost_enabled=true;
ALTER TABLE card_duel_decks ALTER COLUMN ghost_enabled SET DEFAULT false;

DROP INDEX IF EXISTS idx_card_duel_battles_auto_day;
CREATE INDEX IF NOT EXISTS idx_card_duel_battles_live
  ON card_duel_battles(mode, created_at DESC)
  WHERE mode IN ('online','lobby');

COMMENT ON TABLE card_duel_decks IS
  'Authoritative three-card lineup for live bot, online, and private-lobby duels.';
COMMENT ON TABLE card_duel_battles IS
  'Card-duel history. Ghost values are historical only; live modes are bot, online, and lobby.';
COMMENT ON COLUMN card_duel_decks.ghost_enabled IS
  'Deprecated compatibility column. Always false since migration 050.';

COMMIT;
