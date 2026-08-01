-- Give shop purchases their own ledger source and a per-purchase reference.
--
-- THE BUG (reproduced on production): buying any shop item returned
--
--   duplicate key value violates unique constraint "uq_wallet_tx_reference"
--
-- That index is UNIQUE (source, reference_id) — deliberately global, so a
-- given reference can only ever be charged once. The shop was passing
-- source='admin_debit' with reference_id=<item id>, which reads as "this ITEM
-- may only ever be paid for once, by anyone". The first buyer of a badge
-- worked; every buyer after them got a 500.
--
-- The reference has to identify the PURCHASE, not the product. Since
-- user_shop_items has a composite key and no id of its own, give it one and
-- use that.

ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_source_check
  CHECK (source IN (
    'card_cash', 'wheel', 'reward', 'league',
    'admin_credit', 'admin_debit', 'withdrawal_hold', 'withdrawal_refund',
    -- New: cosmetic purchases and subscription payments, so they are
    -- filterable in the ledger and never collide with admin adjustments.
    'shop', 'subscription'
  ));

-- A stable per-purchase id to use as the idempotency reference.
ALTER TABLE user_shop_items
  ADD COLUMN IF NOT EXISTS purchase_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_shop_purchase
  ON user_shop_items(purchase_id);
