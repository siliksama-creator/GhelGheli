-- Cosmetic shop + GhelGheli Plus subscription.
--
-- Sells appearance only: club badges, card frames, name colours. Nothing here
-- grants points, prizes or league advantage — that would turn the prize
-- economy into pay-to-win and, with cash rewards attached, into gambling.
--
-- Two ways to get an item:
--   * buy it outright (permanent), or
--   * hold an active Plus subscription, which unlocks EVERY item for its
--     duration. When Plus lapses the user keeps only what they bought.

CREATE TABLE IF NOT EXISTS shop_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable machine key so the clients can render a built-in asset without a
  -- round trip, and so seeding is idempotent.
  slug         VARCHAR(64) UNIQUE NOT NULL,
  kind         VARCHAR(24) NOT NULL
               CHECK (kind IN ('club_badge', 'card_frame', 'name_color', 'avatar_pack')),
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  image_url    TEXT,
  -- For name_color: the CSS colour. For frames: the effect key.
  payload      VARCHAR(64),
  price        INTEGER NOT NULL CHECK (price >= 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_items_kind
  ON shop_items(kind, display_order) WHERE is_active;

-- Permanent purchases.
CREATE TABLE IF NOT EXISTS user_shop_items (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  price_paid  INTEGER NOT NULL DEFAULT 0 CHECK (price_paid >= 0),
  bought_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

-- Subscription. One row per purchase period so history is auditable; the
-- "current" state is whichever row has the latest expires_at.
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        VARCHAR(32) NOT NULL DEFAULT 'plus',
  price_paid  INTEGER NOT NULL CHECK (price_paid >= 0),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_user_expiry
  ON user_subscriptions(user_id, expires_at DESC);

-- What the user currently has EQUIPPED. Separate from ownership because Plus
-- lets you equip anything and change your mind daily; the choice must survive
-- the subscription lapsing even if the item then stops rendering.
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_club   VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_frame  VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_color  VARCHAR(64);

-- ── seed the catalogue ────────────────────────────────────────────────────
-- ON CONFLICT so a redeploy never duplicates or overwrites an admin's edits.

INSERT INTO shop_items (slug, kind, name, description, image_url, payload, price, display_order) VALUES
  ('club_esteghlal',  'club_badge', 'نشان استقلال',     'نشان باشگاه کنار اسم و روی پروفایل', '/shop/club_esteghlal.webp',  'esteghlal',  29000, 1),
  ('club_persepolis', 'club_badge', 'نشان پرسپولیس',    'نشان باشگاه کنار اسم و روی پروفایل', '/shop/club_persepolis.webp', 'persepolis', 29000, 2),
  ('club_sepahan',    'club_badge', 'نشان سپاهان',      'نشان باشگاه کنار اسم و روی پروفایل', '/shop/club_sepahan.webp',    'sepahan',    29000, 3),
  ('club_tractor',    'club_badge', 'نشان تراکتور',     'نشان باشگاه کنار اسم و روی پروفایل', '/shop/club_tractor.webp',    'tractor',    29000, 4),
  ('club_malavan',    'club_badge', 'نشان ملوان',       'نشان باشگاه کنار اسم و روی پروفایل', '/shop/club_malavan.webp',    'malavan',    29000, 5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO shop_items (slug, kind, name, description, payload, price, display_order) VALUES
  ('frame_gold',    'card_frame', 'قاب طلایی',   'قاب درخشان طلایی دور کارت‌ها',      'gold',    19000, 10),
  ('frame_neon',    'card_frame', 'قاب نئون',    'قاب نئونی با درخشش سبز',            'neon',    19000, 11),
  ('frame_fire',    'card_frame', 'قاب آتشین',   'قاب گرادیانت نارنجی-قرمز',          'fire',    19000, 12),
  ('frame_ice',     'card_frame', 'قاب یخی',     'قاب آبی یخی با درخشش سرد',          'ice',     19000, 13),
  ('frame_holo',    'card_frame', 'قاب هولوگرام','قاب رنگین‌کمانی متغیر',             'holo',    25000, 14)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO shop_items (slug, kind, name, description, payload, price, display_order) VALUES
  ('color_gold',    'name_color', 'اسم طلایی',   'اسمت در جدول لیگ طلایی می‌شود',     '#FFC53D', 9000,  20),
  ('color_emerald', 'name_color', 'اسم زمردی',   'اسمت در جدول لیگ زمردی می‌شود',     '#00D49A', 9000,  21),
  ('color_rose',    'name_color', 'اسم سرخ',     'اسمت در جدول لیگ سرخ می‌شود',       '#F87171', 9000,  22),
  ('color_sky',     'name_color', 'اسم آسمانی',  'اسمت در جدول لیگ آبی می‌شود',       '#60A5FA', 9000,  23),
  ('color_violet',  'name_color', 'اسم بنفش',    'اسمت در جدول لیگ بنفش می‌شود',      '#A855F7', 9000,  24),
  ('color_rainbow', 'name_color', 'اسم رنگین‌کمان','اسمت با گرادیانت متحرک نمایش داده می‌شود','rainbow', 15000, 25)
ON CONFLICT (slug) DO NOTHING;
