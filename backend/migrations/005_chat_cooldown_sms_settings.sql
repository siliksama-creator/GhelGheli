INSERT INTO app_settings(key, value)
VALUES ('chat_message_cooldown_seconds', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings(key, value)
VALUES ('sms_config', '{"provider":"","sender":"","apiKey":"","patternCode":"","enabled":false,"testMode":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
