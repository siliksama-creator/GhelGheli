-- Owner-directed pricing change: new direct-friend purchase commissions are
-- 5% instead of 10%. Historical 10% rows stay untouched and auditable.

ALTER TABLE purchase_referral_commissions
  DROP CONSTRAINT IF EXISTS purchase_referral_commissions_commission_rate_check;

ALTER TABLE purchase_referral_commissions
  ALTER COLUMN commission_rate SET DEFAULT 0.0500;

ALTER TABLE purchase_referral_commissions
  ADD CONSTRAINT purchase_referral_commissions_commission_rate_check
  CHECK (commission_rate IN (0.0500, 0.1000));

-- The old rate remains valid only for records created before this release.
COMMENT ON COLUMN purchase_referral_commissions.commission_rate IS
  'Direct referral purchase rate; 10% historical, 5% for new purchases since migration 054.';
