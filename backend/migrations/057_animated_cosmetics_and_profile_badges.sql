-- Premium cosmetics must be desirable because the delivered runtime is rich,
-- not because a promotional thumbnail over-promises. This migration turns the
-- frame/name catalogue into real animated entitlements and adds small profile
-- signatures that are rendered everywhere a player's identity appears.

ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_kind_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind IN (
  'club_badge', 'card_frame', 'name_color', 'profile_background',
  'result_template', 'match_effect', 'emote_pack', 'profile_badge'
));

ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_profile_badge VARCHAR(64);

-- Every motion key below is implemented by the shared Web and Flutter runtime
-- renderers and is therefore safe to advertise in the Shop.
UPDATE shop_items
   SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || jsonb_build_object(
                    'previewMode','live-runtime',
                    'artworkVersion',5,
                    'motion', CASE COALESCE(payload,slug)
                      WHEN 'gold' THEN 'gold-sweep'
                      WHEN 'neon' THEN 'neon-breathe'
                      WHEN 'fire' THEN 'ember-flow'
                      WHEN 'ice' THEN 'ice-glint'
                      WHEN 'holo' THEN 'hologram-orbit'
                      WHEN 'blue_fire' THEN 'blue-flame'
                      WHEN 'stadium_frame' THEN 'stadium-scan'
                      WHEN 'animated_gold' THEN 'royal-shimmer'
                      WHEN 'club_neon' THEN 'neon-pulse'
                      WHEN 'season_champion' THEN 'champion-beat'
                      WHEN 'champions_night' THEN 'star-orbit'
                      WHEN 'pro_holographic' THEN 'prism-orbit'
                      WHEN 'annual_royal_frame' THEN 'royal-orbit'
                      ELSE 'soft-glow'
                    END),
       description = CASE COALESCE(payload,slug)
         WHEN 'gold' THEN 'موج طلایی زنده دور آواتار و کارت بازیکن'
         WHEN 'neon' THEN 'تنفس نئون سبز با هاله واقعی روی پروفایل و بازی'
         WHEN 'fire' THEN 'جریان نارنجی و سرخ با ضربان آتشین دور کارت'
         WHEN 'ice' THEN 'درخشش یخی متحرک با عبور نور سرد'
         WHEN 'holo' THEN 'طیف هولوگرام چرخان و چندرنگ'
         WHEN 'blue_fire' THEN 'موج آبی پرانرژی با نور زنده دور آواتار'
         WHEN 'stadium_frame' THEN 'اسکن نور سبز و آبی استادیومی'
         WHEN 'animated_gold' THEN 'شاین سلطنتی طلایی که پیوسته روی قاب حرکت می‌کند'
         WHEN 'club_neon' THEN 'نبض بنفش و فیروزه‌ای نئون باشگاهی'
         WHEN 'season_champion' THEN 'ضربان طلایی و سرخ ویژه قهرمان فصل'
         WHEN 'champions_night' THEN 'نور ستاره‌ای سرمه‌ای و بنفش شب قهرمانان'
         WHEN 'pro_holographic' THEN 'منشور سه‌رنگ چرخان برای پروفایل حرفه‌ای'
         WHEN 'annual_royal_frame' THEN 'مدار طلایی و بنفش انحصاری عضو سالانه'
         ELSE description
       END,
       image_url = NULL,
       updated_at = NOW()
 WHERE kind='card_frame';

UPDATE shop_items
   SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || jsonb_build_object(
                    'previewMode','live-runtime',
                    'artworkVersion',5,
                    'motion', CASE COALESCE(payload,slug)
                      WHEN '#FFC53D' THEN 'gold-shimmer'
                      WHEN '#00D49A' THEN 'emerald-breathe'
                      WHEN '#F87171' THEN 'rose-heartbeat'
                      WHEN '#60A5FA' THEN 'sky-wave'
                      WHEN '#A855F7' THEN 'violet-aura'
                      WHEN 'rainbow' THEN 'rainbow-flow'
                      WHEN 'gold_gradient' THEN 'gold-shimmer'
                      WHEN 'green_neon' THEN 'neon-flicker'
                      WHEN 'animated_fire' THEN 'fire-flow'
                      WHEN 'calm_rainbow' THEN 'aurora-drift'
                      WHEN 'icy_glow' THEN 'ice-glint'
                      WHEN 'digital_typing' THEN 'digital-cursor'
                      WHEN 'mvp_name' THEN 'mvp-crown'
                      WHEN 'social_team' THEN 'team-wave'
                      ELSE 'soft-glow'
                    END),
       description = CASE COALESCE(payload,slug)
         WHEN '#FFC53D' THEN 'نام طلایی با موج نور زنده در چت، لیگ و بازی'
         WHEN '#00D49A' THEN 'نام زمردی با تنفس نئونی آرام'
         WHEN '#F87171' THEN 'نام سرخ با ضربان ظریف و پرانرژی'
         WHEN '#60A5FA' THEN 'موج آسمانی متحرک روی نام کاربری'
         WHEN '#A855F7' THEN 'هاله بنفش زنده و لوکس دور نام'
         WHEN 'rainbow' THEN 'جریان پیوسته رنگین‌کمان روی نام کاربری'
         WHEN 'gold_gradient' THEN 'شاین طلایی گرم که روی حروف حرکت می‌کند'
         WHEN 'green_neon' THEN 'نئون سبز زنده با نبض کنترل‌شده'
         WHEN 'animated_fire' THEN 'گرادیان آتش جاری روی حروف نام'
         WHEN 'calm_rainbow' THEN 'حرکت آرام شفق رنگین‌کمانی بدون چشمک آزاردهنده'
         WHEN 'icy_glow' THEN 'عبور برق یخی و هاله سرد روی نام'
         WHEN 'digital_typing' THEN 'اسکن دیجیتال همراه نشانگر تایپ چشمک‌زن'
         WHEN 'mvp_name' THEN 'درخشش طلایی ویژه MVP با تاج کوچک'
         WHEN 'social_team' THEN 'موج صورتی و بنفش هماهنگ تیمی'
         ELSE description
       END,
       image_url = NULL,
       updated_at = NOW()
 WHERE kind='name_color';

INSERT INTO shop_items
  (kind,slug,name,description,image_url,payload,price,display_order,metadata)
VALUES
  ('profile_badge','badge_cr7','امضای CR7','نشان متحرک CR7 کنار نام در پروفایل، چت، لیگ و بازی',NULL,'cr7',29000,710,
   '{"label":"CR7","icon":"7","colors":["#F8FAFC","#38BDF8"],"motion":"siu-pulse","previewMode":"live-runtime","artworkVersion":5}'),
  ('profile_badge','badge_goat','نشان GOAT','نشان درخشان GOAT کنار هویت بازیکن در همه‌جا',NULL,'goat',39000,711,
   '{"label":"GOAT","icon":"♛","colors":["#FFD166","#F97316"],"motion":"crown-glint","previewMode":"live-runtime","artworkVersion":5}'),
  ('profile_badge','badge_captain','کاپیتان','بازوبند متحرک C کنار نام در پروفایل، چت و بازی',NULL,'captain',19000,712,
   '{"label":"CAP","icon":"C","colors":["#22E7A6","#0EA5E9"],"motion":"captain-wave","previewMode":"live-runtime","artworkVersion":5}'),
  ('profile_badge','badge_legend','LEGEND','امضای بنفش و طلایی برای بازیکنان افسانه‌ای',NULL,'legend',49000,713,
   '{"label":"LEGEND","icon":"★","colors":["#C084FC","#FFD166"],"motion":"legend-orbit","previewMode":"live-runtime","artworkVersion":5}'),
  ('profile_badge','badge_king','KING','تاج کوچک طلایی و سرخ کنار نام کاربری',NULL,'king',29000,714,
   '{"label":"KING","icon":"♚","colors":["#FFD166","#EF4444"],"motion":"king-beat","previewMode":"live-runtime","artworkVersion":5}'),
  ('profile_badge','badge_ace','ACE','نشان سریع و مینیمال ACE برای هویت رقابتی',NULL,'ace',15000,715,
   '{"label":"ACE","icon":"A","colors":["#E0F2FE","#8B5CF6"],"motion":"ace-scan","previewMode":"live-runtime","artworkVersion":5}')
ON CONFLICT(slug) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description, image_url=NULL,
  payload=EXCLUDED.payload, price=EXCLUDED.price,
  display_order=EXCLUDED.display_order, metadata=EXCLUDED.metadata,
  is_active=true, is_purchasable=true, access_tier='public', updated_at=NOW();
