CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings(key, value)
VALUES ('chat_min_lifetime_points', '0'::jsonb)
ON CONFLICT (key) DO NOTHING;
