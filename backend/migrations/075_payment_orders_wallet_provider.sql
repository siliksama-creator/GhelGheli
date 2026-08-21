-- خریدِ صندوق با موجودیِ کیف پول: سفارش با provider='wallet' ثبت می‌شود
-- (تصمیم مالک، ۱۴۰۵/۰۵/۳۰).

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_provider_check;

ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_provider_check
  CHECK (provider IN ('cafebazaar', 'zarinpal', 'manual', 'wallet'));
