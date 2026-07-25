-- Admin-pinned chat announcement.
--
-- Replaces the old hardcoded "از الفاظ رکیک خودداری کنید" strip in the chat
-- header. Since users can now only send predefined canned messages, that
-- warning was pointless — but the slot itself is prime real estate, so it
-- becomes an admin-controlled pinned notice instead.
--
-- Stored as a single app_settings row rather than a chat_messages flag: the
-- banner is an announcement (title/colour/author/timestamp), not a message in
-- the conversation, and keeping it out of chat_messages means it can't be
-- replied to, liked, reported or deleted by moderation tooling.
INSERT INTO app_settings(key, value)
VALUES ('chat_pinned_message', '{"text":"","accent":"gold","active":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
