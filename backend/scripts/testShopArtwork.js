#!/usr/bin/env node
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', '..');
const webDir = path.join(root, 'userweb', 'public', 'shop', 'cosmetics');
const mobileDir = path.join(root, 'mobile', 'assets', 'shop', 'cosmetics');
const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '053_shop_semantic_artwork.sql'), 'utf8');
const webShop = fs.readFileSync(path.join(root, 'userweb', 'src', 'screens', 'Shop.jsx'), 'utf8');
const mobileShop = fs.readFileSync(path.join(root, 'mobile', 'lib', 'screens', 'user', 'shop_page.dart'), 'utf8');
const pubspec = fs.readFileSync(path.join(root, 'mobile', 'pubspec.yaml'), 'utf8');

const groups = {
  frames: ['frame_gold','frame_neon','frame_fire','frame_ice','frame_holo','blue_fire','stadium_frame','animated_gold','club_neon','season_champion','champions_night','pro_holographic','annual_royal_frame'],
  names: ['color_gold','color_emerald','color_rose','color_sky','color_violet','color_rainbow','gold_gradient','green_neon','animated_fire','calm_rainbow','icy_glow','digital_typing','mvp_name','social_team'],
  results: ['result_stadium','result_champions','result_fire','result_ice','result_gold_mvp','result_friendly','result_derby','result_world_cup','annual_royal_result'],
  effects: ['stadium_spotlight','colored_smoke','card_side_fire','victory_confetti','golden_cup','tunnel_entry','goal_celebration','win_streak','mvp_effect','rematch_effect'],
  emotes: ['emote_respect','emote_comeback','emote_goal_club'],
  backgrounds: ['locker_room','night_stadium','player_tunnel','champion_podium','training_ground','collection_room'],
};
const slugs = Object.values(groups).flat();
assert.strictEqual(slugs.length, 55, 'all old/new non-club SKUs need artwork');
assert.strictEqual(new Set(slugs).size, slugs.length, 'artwork slug list must be unique');

(async () => {
  const hashes = new Set();
  for (const slug of slugs) {
    assert(migration.includes(`'${slug}'`), `migration missing artwork URL for ${slug}`);
    const web = path.join(webDir, `${slug}.webp`);
    const mobile = path.join(mobileDir, `${slug}.webp`);
    assert(fs.existsSync(web), `Web artwork missing: ${slug}`);
    assert(fs.existsSync(mobile), `Android artwork missing: ${slug}`);
    const a = fs.readFileSync(web); const b = fs.readFileSync(mobile);
    assert(a.equals(b), `Web/Android artwork differs: ${slug}`);
    assert(a.length > 1200 && a.length < 60000, `artwork size unreasonable: ${slug} (${a.length})`);
    assert.strictEqual(a.subarray(0, 4).toString(), 'RIFF', `${slug} is not WebP/RIFF`);
    const meta = await sharp(a).metadata();
    assert.strictEqual(meta.width, 640, `${slug} width`);
    assert.strictEqual(meta.height, 360, `${slug} height`);
    const stats = await sharp(a).stats();
    assert(stats.entropy > 0.35, `${slug} is visually empty`);
    hashes.add(crypto.createHash('sha256').update(a).digest('hex'));
  }
  assert.strictEqual(hashes.size, slugs.length, 'each SKU must have distinct artwork bytes');
  assert(webShop.includes('/shop/cosmetics/${item.slug}.webp'));
  assert(webShop.includes('پیش‌نمایش واقعی') && !webShop.includes('KIND_PREVIEW'));
  assert(mobileShop.includes("'assets/shop/cosmetics/$slug.webp'"));
  assert(mobileShop.includes('پیش‌نمایش واقعی'));
  assert(pubspec.includes('- assets/shop/cosmetics/'));
  const webGames = fs.readFileSync(path.join(root, 'userweb', 'src', 'games.jsx'), 'utf8');
  const mobileGames = fs.readFileSync(path.join(root, 'mobile', 'lib', 'screens', 'user', 'games', 'game_scaffold.dart'), 'utf8');
  assert(webGames.includes('/shop/cosmetics/${slug}.webp') && webGames.includes('mixBlendMode'));
  assert(mobileGames.includes("'assets/shop/cosmetics/${widget.slug}.webp'"));
  assert(!webGames.includes('EFFECT_ICON') && !mobileGames.includes("'golden_cup' => '🏆'"));
  console.log(`✓ ${slugs.length} semantic Shop artworks are distinct, non-empty and byte-identical on Web/Android`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
