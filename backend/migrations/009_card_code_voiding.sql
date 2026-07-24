-- Allow admins to permanently void an unused card code (e.g. a batch that
-- leaked before being printed/sold). Previously card_codes.status only
-- allowed 'unused' | 'used', so there was no way to disable a code without
-- deleting the row outright (which the API never exposed either — there is
-- no DELETE endpoint for card codes on purpose, to keep a full audit trail).
ALTER TABLE card_codes DROP CONSTRAINT IF EXISTS card_codes_status_check;
ALTER TABLE card_codes ADD CONSTRAINT card_codes_status_check CHECK (status IN ('unused', 'used', 'voided'));
