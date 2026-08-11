-- مسابقه‌های امتیازی: رزرو اتمیکِ ورودی و تسویهٔ یک‌باره
--
-- پیش از این موتور فقط در پایان بازی netPot را به برنده اضافه می‌کرد؛
-- هیچ امتیازی از دو بازیکن کم و حتی موجودی‌شان بررسی نمی‌شد. نتیجه این
-- بود که دو حسابِ صفرامتیازی می‌توانستند از هیچ امتیاز بسازند.
--
-- این جدول «سند تسویه» است. وضعیت reserved یعنی stake هر دو نفر واقعاً
-- از دفتر امتیاز کم شده است. settled/refunded نهایی‌اند و قفل ردیف +
-- UPDATE شرطی اجازهٔ پرداخت دوباره را نمی‌دهد.

BEGIN;

CREATE TABLE IF NOT EXISTS game_stake_matches (
  id                UUID PRIMARY KEY,
  game_id           VARCHAR(32) NOT NULL,
  player_x_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  player_o_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stake_points      INTEGER NOT NULL CHECK (stake_points IN (100, 1000, 5000)),
  gross_pot         INTEGER NOT NULL CHECK (gross_pot = stake_points * 2),
  commission_points INTEGER NOT NULL CHECK (commission_points >= 0),
  net_pot           INTEGER NOT NULL CHECK (net_pot = gross_pot - commission_points),
  status            VARCHAR(16) NOT NULL DEFAULT 'reserved'
                    CHECK (status IN ('reserved', 'settled', 'refunded')),
  outcome           VARCHAR(16) CHECK (outcome IN ('winner', 'draw', 'stale_refund')),
  winner_user_id    UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at        TIMESTAMPTZ,
  CHECK (player_x_id <> player_o_id),
  CHECK ((status = 'reserved' AND settled_at IS NULL)
      OR (status <> 'reserved' AND settled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_game_stake_reserved_age
  ON game_stake_matches(created_at)
  WHERE status = 'reserved';

CREATE INDEX IF NOT EXISTS idx_game_stake_player_x
  ON game_stake_matches(player_x_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_stake_player_o
  ON game_stake_matches(player_o_id, created_at DESC);

-- هر مرحله برای هر کاربر و هر مسابقه فقط یک ردیف دفتر می‌تواند داشته باشد.
-- اگر callback یا process دوباره همان تسویه را امتحان کند، دیتابیس آخرین
-- خط دفاع است؛ اتکا به یک boolean داخل RAM برای پول/امتیاز کافی نیست.
CREATE UNIQUE INDEX IF NOT EXISTS uq_point_game_stake_stage
  ON point_transactions(user_id, reference_type, reference_id)
  WHERE source = 'game'
    AND reference_type IN (
      'game_stake_entry', 'game_stake_payout', 'game_stake_draw_refund',
      'game_stake_stale_refund'
    );

COMMENT ON TABLE game_stake_matches IS
  'Escrow مسابقات امتیازی؛ هر reserved یعنی ورودی هر دو نفر واقعاً کسر شده است.';

COMMIT;
