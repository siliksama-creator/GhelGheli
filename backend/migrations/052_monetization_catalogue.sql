-- Expanded deterministic cosmetic catalogue, annual Plus entitlements and
-- direct-purchase referral cash commission.
--
-- The catalogue stays server-priced. Annual gifts are deliberately not
-- purchasable one by one: the subscription transaction grants permanent
-- ownership rows, so they keep working after that annual period ends.

ALTER TABLE shop_items
  DROP CONSTRAINT IF EXISTS shop_items_kind_check;
ALTER TABLE shop_items
  ADD CONSTRAINT shop_items_kind_check CHECK (kind IN (
    'club_badge', 'card_frame', 'name_color', 'profile_background',
    'result_template', 'match_effect', 'emote_pack'
  ));

ALTER TABLE shop_items
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS is_purchasable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE shop_items
  DROP CONSTRAINT IF EXISTS shop_items_access_tier_check;
ALTER TABLE shop_items
  ADD CONSTRAINT shop_items_access_tier_check
  CHECK (access_tier IN ('public', 'plus', 'annual'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS equipped_profile_background TEXT,
  ADD COLUMN IF NOT EXISTS equipped_result_template TEXT,
  ADD COLUMN IF NOT EXISTS equipped_match_effect TEXT,
  ADD COLUMN IF NOT EXISTS equipped_emote_pack TEXT,
  ADD COLUMN IF NOT EXISTS profile_title TEXT,
  ADD COLUMN IF NOT EXISTS annual_club_switches INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_annual_club_switches_check;
ALTER TABLE users
  ADD CONSTRAINT users_annual_club_switches_check
  CHECK (annual_club_switches >= 0 AND annual_club_switches <= 20);

-- Annual Plus is Plus everywhere the existing club-membership view checks
-- subscription access. The newest subscription-granted club remains the
-- user's permanent selected club after lapse, matching the existing policy.
CREATE OR REPLACE VIEW effective_club_memberships AS
SELECT uc.id, uc.user_id, uc.club_slug, uc.source, uc.joined_at
  FROM user_clubs uc
 WHERE uc.source = 'purchase'
    OR EXISTS (SELECT 1 FROM user_subscriptions s
                WHERE s.user_id = uc.user_id
                  AND s.plan IN ('plus', 'plus_annual')
                  AND s.expires_at > NOW())
    OR uc.id = (SELECT x.id FROM user_clubs x
                 WHERE x.user_id = uc.user_id
                 ORDER BY x.joined_at DESC, x.id LIMIT 1);

CREATE TABLE IF NOT EXISTS user_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_by_subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entitlement_key)
);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user
  ON user_entitlements(user_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS purchase_referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('shop_item', 'plus_monthly', 'plus_annual')),
  purchase_reference_id UUID NOT NULL,
  purchase_amount BIGINT NOT NULL CHECK (purchase_amount > 0),
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (commission_rate = 0.1000),
  commission_amount BIGINT NOT NULL CHECK (commission_amount > 0),
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(purchase_type, purchase_reference_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_referral_referrer
  ON purchase_referral_commissions(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_referral_referred
  ON purchase_referral_commissions(referred_user_id, created_at DESC);

-- Wallet sources are protected in both JavaScript and PostgreSQL.  This is a
-- cash credit, not the old point-only game referral reward.
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;
ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_source_check
  CHECK (source IN (
    'card_cash', 'wheel', 'reward', 'league',
    'admin_credit', 'admin_debit', 'withdrawal_hold', 'withdrawal_refund',
    'shop', 'subscription', 'pass', 'purchase_referral'
  ));

-- Frames (19K–49K toman)
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order)
VALUES
 ('card_frame','blue_fire','آتش آبی','شعله‌های آبی زنده دور کارت و آواتار',19000,'{"palette":["#38BDF8","#2563EB"],"motion":"flame"}',110),
 ('card_frame','stadium_frame','قاب استادیوم','نور ورزشگاه و چمن شب مسابقه',24000,'{"palette":["#22C55E","#0EA5E9"],"motion":"spotlight"}',111),
 ('card_frame','animated_gold','طلای متحرک','درخشش طلایی روان و لوکس',39000,'{"palette":["#FFE17D","#F59E0B"],"motion":"shimmer"}',112),
 ('card_frame','club_neon','نئون باشگاهی','نئون پرانرژی به سبک تابلوی باشگاه',29000,'{"palette":["#C026D3","#22D3EE"],"motion":"pulse"}',113),
 ('card_frame','season_champion','قهرمان فصل','قاب کمیاب قهرمانان فصل',49000,'{"palette":["#FFD166","#DC2626"],"motion":"crown"}',114),
 ('card_frame','champions_night','شب لیگ قهرمانان','آسمان سرمه‌ای و ستاره‌های اروپایی',39000,'{"palette":["#1D4ED8","#A78BFA"],"motion":"stars"}',115),
 ('card_frame','pro_holographic','هولوگرافیک حرفه‌ای','طیف هولوگرافیک چندلایه برای حرفه‌ای‌ها',49000,'{"palette":["#22D3EE","#F472B6","#A3E635"],"motion":"hologram"}',116)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=EXCLUDED.price, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=true, access_tier='public';

-- Name colours and animated effects (9K–25K toman)
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order)
VALUES
 ('name_color','gold_gradient','گرادیان طلایی','طلایی گرم با درخشش آرام',9000,'{"palette":["#FFF0A3","#F59E0B"],"motion":"shimmer"}',210),
 ('name_color','green_neon','نئون سبز','سبز فسفری با هاله نئون',12000,'{"palette":["#A3E635","#10B981"],"motion":"glow"}',211),
 ('name_color','animated_fire','آتش متحرک','گرادیان سرخ و نارنجی زنده',15000,'{"palette":["#FDE047","#EF4444"],"motion":"flame"}',212),
 ('name_color','calm_rainbow','رنگین‌کمان آرام','طیف ملایم بدون چشمک آزاردهنده',15000,'{"palette":["#60A5FA","#C084FC","#F9A8D4"],"motion":"drift"}',213),
 ('name_color','icy_glow','درخشش یخی','آبی یخی شفاف با هاله سرد',19000,'{"palette":["#E0F2FE","#38BDF8"],"motion":"glow"}',214),
 ('name_color','digital_typing','تایپ دیجیتال','افکت دیجیتال و نشانگر تایپ',19000,'{"palette":["#67E8F9","#22C55E"],"motion":"typing"}',215),
 ('name_color','mvp_name','MVP','طلایی ویژه ستاره مسابقه',25000,'{"palette":["#FFD166","#FFFFFF"],"motion":"mvp"}',216),
 ('name_color','social_team','رنگ تیم اجتماعی','رنگ پویا برای بازیکنان تیمی',25000,'{"palette":["#FB7185","#8B5CF6"],"motion":"team"}',217)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=EXCLUDED.price, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=true, access_tier='public';

-- Shareable result templates (15K–39K toman)
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order)
VALUES
 ('result_template','result_stadium','نتیجه استادیوم','کارت نتیجه با نورافکن و زمین مسابقه',15000,'{"palette":["#052E16","#0EA5E9"],"motif":"stadium"}',310),
 ('result_template','result_champions','نتیجه لیگ قهرمانان','شب ستاره‌ای و جام نقره‌ای',19000,'{"palette":["#172554","#7C3AED"],"motif":"stars"}',311),
 ('result_template','result_fire','نتیجه آتش','قاب شعله‌ای برای بردهای داغ',25000,'{"palette":["#450A0A","#F97316"],"motif":"fire"}',312),
 ('result_template','result_ice','نتیجه یخ','قاب کریستالی سرد و مدرن',19000,'{"palette":["#082F49","#7DD3FC"],"motif":"ice"}',313),
 ('result_template','result_gold_mvp','نتیجه طلایی MVP','کارت لوکس با تمرکز روی MVP',29000,'{"palette":["#422006","#FFD166"],"motif":"mvp"}',314),
 ('result_template','result_friendly','کل‌کل دوستانه','متن و ظاهر شوخ و غیرتوهین‌آمیز',15000,'{"palette":["#312E81","#FB7185"],"motif":"banter"}',315),
 ('result_template','result_derby','نتیجه دربی','دو رنگ روبه‌رو برای رقابت‌های حساس',29000,'{"palette":["#B91C1C","#1D4ED8"],"motif":"derby"}',316),
 ('result_template','result_world_cup','نتیجه جام جهانی','سبز و طلایی با حال‌وهوای جام جهانی',39000,'{"palette":["#064E3B","#FACC15"],"motif":"world-cup"}',317)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=EXCLUDED.price, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=true, access_tier='public';

-- Match entrance/completion effects (19K–59K toman)
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order)
VALUES
 ('match_effect','stadium_spotlight','نورافکن استادیوم','ورود با نورافکن چرخان',19000,'{"palette":["#F8FAFC","#38BDF8"],"phase":"entry"}',410),
 ('match_effect','colored_smoke','دود رنگی','دود نرم رنگی هنگام ورود',25000,'{"palette":["#F472B6","#60A5FA"],"phase":"entry"}',411),
 ('match_effect','card_side_fire','آتش کنار کارت','شعله کنترل‌شده کنار کارت بازیکن',29000,'{"palette":["#F97316","#EF4444"],"phase":"both"}',412),
 ('match_effect','victory_confetti','کاغذرنگی','بارش کاغذرنگی در پایان برد',25000,'{"palette":["#FFD166","#22D3EE"],"phase":"finish"}',413),
 ('match_effect','golden_cup','جام طلایی','نمایش جام طلایی برای برنده',39000,'{"palette":["#FFD166","#F59E0B"],"phase":"finish"}',414),
 ('match_effect','tunnel_entry','ورود از تونل','ورود سینمایی از تونل بازیکنان',45000,'{"palette":["#0F172A","#E2E8F0"],"phase":"entry"}',415),
 ('match_effect','goal_celebration','جشن گل','انفجار شادی کنترل‌شده پس از برد',39000,'{"palette":["#22C55E","#FFD166"],"phase":"finish"}',416),
 ('match_effect','win_streak','روند برد','نمایش انرژی بردهای پیاپی',49000,'{"palette":["#EF4444","#FFD166"],"phase":"finish"}',417),
 ('match_effect','mvp_effect','افکت MVP','نور ویژه ستاره مسابقه',49000,'{"palette":["#FFD166","#FFFFFF"],"phase":"finish"}',418),
 ('match_effect','rematch_effect','ریمچ','افکت ویژه دعوت به بازی دوباره',59000,'{"palette":["#8B5CF6","#22D3EE"],"phase":"both"}',419)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=EXCLUDED.price, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=true, access_tier='public';

-- Controlled emote/message packs (9K–25K toman). Messages are validated
-- server-side against ownership; buying a pack never unlocks free text.
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order)
VALUES
 ('emote_pack','emote_respect','پک بازی جوانمردانه','پیام‌های محترمانه بعد از بازی',9000,'{"messages":["بازی خوبی بود","دوباره؟"],"icon":"🤝"}',510),
 ('emote_pack','emote_comeback','پک جبران','کل‌کل سالم برای ریمچ',15000,'{"messages":["این یکی شانسی بود!","آماده جبران باش"],"icon":"⚡"}',511),
 ('emote_pack','emote_goal_club','پک گل و باشگاه','جشن گل، باشگاه و شوخی غیرتوهین‌آمیز',25000,'{"messages":["گوووول! ⚽","باشگاه من همیشه آماده‌ست!","خوش بردی؛ بازی بعدی با من!","فقط گرم کرده بودم 😄"],"icon":"🎉"}',512)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=EXCLUDED.price, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=true, access_tier='public';

-- Profile backgrounds (29K–69K toman)
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order)
VALUES
 ('profile_background','locker_room','رختکن','فضای گرم رختکن پیش از مسابقه',29000,'{"palette":["#3F2A1D","#0F172A"],"motif":"locker"}',610),
 ('profile_background','night_stadium','استادیوم شب','سکوهای روشن زیر آسمان شب',39000,'{"palette":["#020617","#1D4ED8"],"motif":"stadium"}',611),
 ('profile_background','player_tunnel','تونل بازیکنان','تونل دراماتیک لحظه ورود',45000,'{"palette":["#111827","#F59E0B"],"motif":"tunnel"}',612),
 ('profile_background','champion_podium','سکوی قهرمانی','نور طلایی و سکوی شماره یک',59000,'{"palette":["#422006","#FFD166"],"motif":"podium"}',613),
 ('profile_background','training_ground','زمین تمرین','چمن صبحگاهی و فضای تمرین',49000,'{"palette":["#052E16","#22C55E"],"motif":"training"}',614),
 ('profile_background','collection_room','اتاق کلکسیون','ویترین کارت‌ها و جام‌های کمیاب',69000,'{"palette":["#1E1B4B","#A78BFA"],"motif":"collection"}',615)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=EXCLUDED.price, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=true, access_tier='public';

-- Permanent gifts granted by annual Plus. They appear in the catalogue to
-- explain the benefit but cannot be purchased separately.
INSERT INTO shop_items(kind, slug, name, description, price, metadata, display_order, access_tier, is_purchasable)
VALUES
 ('card_frame','annual_royal_frame','قاب سلطنتی سالانه','هدیه دائمی و انحصاری پلاس سالانه',0,'{"palette":["#FFD166","#7C3AED"],"motion":"royal"}',100,'annual',false),
 ('result_template','annual_royal_result','نتیجه سلطنتی سالانه','قالب دائمی نتیجه فقط برای اعضای سالانه',0,'{"palette":["#1E1B4B","#FFD166"],"motif":"royal"}',300,'annual',false)
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
 price=0, metadata=EXCLUDED.metadata, display_order=EXCLUDED.display_order,
 is_active=true, is_purchasable=false, access_tier='annual';
