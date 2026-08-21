-- خریدِ صندوق کارت با موجودیِ کیف پول (تصمیم مالک، ۱۴۰۵/۰۵/۳۰).
-- کاربر می‌تواند جوایزِ نقدی (لیگ/جایزه) را خرجِ صندوق کند. مثل 'shop'،
-- سهمِ کیف پول کمیسیونِ معرف نمی‌دهد.

ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_source_check
  CHECK (source IN (
    'card_cash', 'wheel', 'reward', 'league',
    'admin_credit', 'admin_debit', 'withdrawal_hold', 'withdrawal_refund',
    'shop', 'subscription', 'purchase_referral', 'pass',
    'topup', 'topup_refund',
    'card_box'
  ));
