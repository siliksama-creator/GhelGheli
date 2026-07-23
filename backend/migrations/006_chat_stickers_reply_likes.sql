CREATE TABLE IF NOT EXISTS chat_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL,
  image_url TEXT NOT NULL,
  sticker_type VARCHAR(20) NOT NULL DEFAULT 'static' CHECK (sticker_type IN ('static','animated')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sticker_id UUID REFERENCES chat_stickers(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','sticker'));

CREATE TABLE IF NOT EXISTS chat_message_likes (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(message_id, user_id)
);
