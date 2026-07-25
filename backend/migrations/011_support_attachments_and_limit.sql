-- Support ticket upgrades:
--   1. image attachments (1..5 per message)
--   2. explicit closed_at / closed_by bookkeeping so the "one open ticket per
--      day" rule can be enforced and explained to the user.
--
-- Attachments live as a JSONB array of relative URLs on the message row
-- rather than a separate table: they are always fetched together with their
-- message, never queried independently, and capped at 5 — a join table would
-- add cost with no benefit.
ALTER TABLE support_ticket_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- message_text must be allowed to be empty when a message is images-only.
ALTER TABLE support_ticket_messages
  ALTER COLUMN message_text DROP NOT NULL;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_admin_id UUID;

-- Speeds up the per-user daily quota check and the user's ticket list.
CREATE INDEX IF NOT EXISTS idx_tickets_user_created
  ON support_tickets(user_id, created_at DESC);
