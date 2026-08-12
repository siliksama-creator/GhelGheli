-- Interactive cosmetics are UI behavior, not promotional pictures. Remove
-- cinematic image URLs wherever the image is not the delivered entitlement and
-- make every client render the live runtime component instead.

-- Frame/name catalog copy used to promise motion that the equipped runtime did
-- not provide. Keep the exact purchased gradients, remove that stale metadata,
-- and describe only what the shared renderer actually delivers.
UPDATE shop_items
   SET image_url = NULL,
       name = CASE slug
         WHEN 'animated_gold' THEN 'طلای درخشان'
         WHEN 'animated_fire' THEN 'گرادیان آتش'
         WHEN 'digital_typing' THEN 'دیجیتال'
         ELSE name
       END,
       description = CASE slug
         WHEN 'frame_gold' THEN 'قاب طلایی دور آواتار بازیکن'
         WHEN 'frame_neon' THEN 'قاب سبز نئونی دور آواتار بازیکن'
         WHEN 'frame_fire' THEN 'قاب نارنجی و سرخ دور آواتار بازیکن'
         WHEN 'frame_ice' THEN 'قاب آبی یخی دور آواتار بازیکن'
         WHEN 'frame_holo' THEN 'قاب صورتی، بنفش و آبی دور آواتار'
         WHEN 'blue_fire' THEN 'طیف آبی آتشین دور آواتار بازیکن'
         WHEN 'stadium_frame' THEN 'قاب سبز و آبی استادیومی دور آواتار'
         WHEN 'animated_gold' THEN 'قاب طلایی روشن و لوکس دور آواتار'
         WHEN 'club_neon' THEN 'قاب بنفش و فیروزه‌ای به سبک نئون باشگاه'
         WHEN 'season_champion' THEN 'قاب طلایی و سرخ قهرمان فصل'
         WHEN 'champions_night' THEN 'قاب سرمه‌ای و بنفش شب قهرمانان'
         WHEN 'pro_holographic' THEN 'طیف سه‌رنگ هولوگرافیک دور آواتار'
         WHEN 'gold_gradient' THEN 'نام کاربری با گرادیان طلایی گرم'
         WHEN 'green_neon' THEN 'نام کاربری با طیف سبز نئونی'
         WHEN 'animated_fire' THEN 'نام کاربری با گرادیان زرد، نارنجی و سرخ'
         WHEN 'calm_rainbow' THEN 'نام کاربری با طیف ملایم رنگین‌کمان'
         WHEN 'icy_glow' THEN 'نام کاربری با طیف آبی یخی'
         WHEN 'digital_typing' THEN 'نام کاربری با طیف فیروزه‌ای دیجیتال'
         WHEN 'mvp_name' THEN 'نام کاربری سفید و طلایی ویژه MVP'
         WHEN 'social_team' THEN 'نام کاربری با طیف صورتی و بنفش تیمی'
         ELSE description
       END,
       metadata = (COALESCE(metadata, '{}'::jsonb) - 'motion')
                  || '{"previewMode":"live-runtime","artworkVersion":4}'::jsonb,
       updated_at = NOW()
 WHERE kind IN ('card_frame','name_color');

UPDATE shop_items
   SET image_url = NULL,
       metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"previewMode":"live-runtime","artworkVersion":4}'::jsonb,
       updated_at = NOW()
 WHERE kind IN ('match_effect','emote_pack');

-- Here the pixels really are part of what gets equipped: club marks, profile
-- backgrounds and blank result-template surfaces. Their clients still place
-- real live profile/score content on top rather than showing promo art alone.
UPDATE shop_items
   SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"previewMode":"live-runtime","artworkVersion":4}'::jsonb,
       updated_at = NOW()
 WHERE kind IN ('club_badge','profile_background','result_template');
