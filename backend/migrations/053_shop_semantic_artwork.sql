-- Every non-club Shop SKU now has a dedicated semantic 16:9 illustration.
-- The same file names ship in userweb/public and Flutter assets; image_url is
-- kept server-authoritative so future clients can discover them without a
-- hard-coded catalogue.

UPDATE shop_items
   SET image_url = '/shop/cosmetics/' || slug || '.webp',
       metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"artworkVersion":2,"artworkFormat":"semantic-16x9"}'::jsonb,
       updated_at = NOW()
 WHERE slug IN (
  'frame_gold','frame_neon','frame_fire','frame_ice','frame_holo',
  'color_gold','color_emerald','color_rose','color_sky','color_violet','color_rainbow',
  'blue_fire','stadium_frame','animated_gold','club_neon','season_champion',
  'champions_night','pro_holographic','annual_royal_frame',
  'gold_gradient','green_neon','animated_fire','calm_rainbow','icy_glow',
  'digital_typing','mvp_name','social_team',
  'result_stadium','result_champions','result_fire','result_ice','result_gold_mvp',
  'result_friendly','result_derby','result_world_cup','annual_royal_result',
  'stadium_spotlight','colored_smoke','card_side_fire','victory_confetti',
  'golden_cup','tunnel_entry','goal_celebration','win_streak','mvp_effect','rematch_effect',
  'emote_respect','emote_comeback','emote_goal_club',
  'locker_room','night_stadium','player_tunnel','champion_podium',
  'training_ground','collection_room'
 );
