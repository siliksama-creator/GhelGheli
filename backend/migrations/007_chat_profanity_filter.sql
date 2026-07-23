INSERT INTO app_settings(key, value)
VALUES ('chat_bad_words', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
