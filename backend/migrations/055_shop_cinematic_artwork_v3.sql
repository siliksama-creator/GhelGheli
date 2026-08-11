-- Cinematic artwork v3 replaces the rejected abstract/vector thumbnails.
-- A versioned URL is intentional: browsers must not reuse cached v2 images.

UPDATE shop_items
   SET image_url = '/shop/cosmetics-v3/' || slug || '.webp',
       metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"artworkVersion":3,"artworkFormat":"cinematic-3d-16x9"}'::jsonb,
       updated_at = NOW()
 WHERE image_url LIKE '/shop/cosmetics/%'
    OR metadata->>'artworkVersion' = '2';
