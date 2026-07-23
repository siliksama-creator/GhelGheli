INSERT INTO app_settings(key, value)
VALUES ('league_winner_count', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;
