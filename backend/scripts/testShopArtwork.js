#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

const motionMigration = read('backend', 'migrations', '057_animated_cosmetics_and_profile_badges.sql');
const removal = read('backend', 'migrations', '063_remove_result_and_match_cosmetics.sql');
const shopService = read('backend', 'src', 'services', 'shopService.js');
const webShop = read('userweb', 'src', 'screens', 'Shop.jsx');
const webMotionCss = read('userweb', 'src', 'components', 'cosmeticsMotion.css');
const webChat = read('userweb', 'src', 'screens', 'Chat.jsx');
const webHome = read('userweb', 'src', 'screens', 'Home.jsx');
const webGames = read('userweb', 'src', 'games.jsx');
const webDuel = read('userweb', 'src', 'cardDuelGame.jsx');
const webCosmetics = read('userweb', 'src', 'components', 'Cosmetics.jsx');
const webProfile = read('userweb', 'src', 'screens', 'Profile.jsx');
const webPublicProfile = read('userweb', 'src', 'screens', 'PublicProfile.jsx');
const mobileHero = read('mobile', 'lib', 'screens', 'shared', 'hero_header.dart');
const mobileChat = read('mobile', 'lib', 'screens', 'user', 'chat_page.dart');
const mobileShop = read('mobile', 'lib', 'screens', 'user', 'shop_page.dart');
const mobileGames = read('mobile', 'lib', 'screens', 'user', 'games', 'game_scaffold.dart');
const mobileDuel = read('mobile', 'lib', 'screens', 'user', 'games', 'card_duel_page.dart');
const mobileDuelWidgets = read('mobile', 'lib', 'screens', 'user', 'games', 'card_duel', 'card_duel_widgets.dart');
const mobileMotion = read('mobile', 'lib', 'widgets', 'cosmetic_motion.dart');
const mobileProfile = read('mobile', 'lib', 'screens', 'user', 'profile_page.dart');
const mobilePublicProfile = read('mobile', 'lib', 'screens', 'shared', 'public_profile_sheet.dart');
const mobileVersus = read('mobile', 'lib', 'screens', 'user', 'games', 'versus_bar.dart');

// Remaining paid cosmetics use their real shared runtime renderer.
assert(motionMigration.includes("'profile_badge'"));
assert(motionMigration.includes('equipped_profile_badge'));
for (const slotWire of [
  "profile_badge: 'equipped_profile_badge'",
  'profileBadge: user.equipped_profile_badge',
  "can('profile_badge', row.equipped_profile_badge)",
]) assert(shopService.includes(slotWire), `profile badge backend wiring missing: ${slotWire}`);

assert(webCosmetics.includes('function CosmeticAvatarFrame'));
assert(webProfile.includes('<CosmeticAvatarFrame frame={p.cosmetics?.frame}'));
assert(webPublicProfile.includes('<CosmeticAvatarFrame frame={cos.frame}'));
assert(webGames.includes('<CosmeticAvatarFrame frame={p.cosmetics?.frame}'));
assert(webDuel.includes('<CosmeticAvatarFrame frame={p.cosmetics?.frame}'));
assert(mobileMotion.includes('class CosmeticAvatarFrame'));
for (const surface of [mobileProfile, mobilePublicProfile, mobileVersus, mobileDuelWidgets, mobileShop]) {
  assert(surface.includes('CosmeticAvatarFrame('));
}
assert(webMotionCss.includes('.frame-pro_holographic') && webMotionCss.includes('.name-fire-flow'));
assert(webChat.includes('<CosmeticAvatarFrame frame={m.cosmetics?.frame}'));
assert(webHome.includes('<CosmeticAvatarFrame frame={cosmetics?.frame}'));
assert(mobileChat.includes('CosmeticAvatarFrame('));
assert(mobileHero.includes('CosmeticAvatarFrame('));

for (const marker of [
  "item.kind === 'club_badge'", "item.kind === 'card_frame'",
  "item.kind === 'name_color'", "item.kind === 'profile_badge'",
  "item.kind === 'profile_background'", 'shopLiveEmotes',
]) assert(webShop.includes(marker), `Web Shop preview missing ${marker}`);
for (const marker of [
  '_ShopFrameArtwork', '_ShopNameArtwork', '_ShopBadgeArtwork',
  'AnimatedProfileBackground(', '_ShopEmoteArtwork',
]) assert(mobileShop.includes(marker), `Android Shop preview missing ${marker}`);

// Removed categories are deleted transactionally, not merely hidden.
for (const kind of ['result_template', 'match_effect']) {
  assert(removal.includes(kind), `removal migration missing ${kind}`);
  for (const runtime of [shopService, webShop, webGames, webDuel, webCosmetics,
    mobileShop, mobileGames, mobileDuel, mobileDuelWidgets]) {
    assert(!runtime.includes(kind), `removed kind ${kind} leaked into runtime`);
  }
}
assert(removal.includes('DELETE FROM user_shop_items'));
assert(removal.includes('DELETE FROM shop_items'));
assert(removal.includes('equipped_result_template = NULL'));
assert(removal.includes('equipped_match_effect = NULL'));
assert(!shopService.includes('equipped_result_template'));
assert(!shopService.includes('equipped_match_effect'));
assert(!exists('userweb', 'src', 'components', 'MatchEffectVisual.jsx'));
assert(!exists('mobile', 'lib', 'widgets', 'match_effect_visual.dart'));

const removedSlugs = [
  'annual_royal_result', 'result_stadium', 'result_champions', 'result_fire',
  'result_ice', 'result_gold_mvp', 'result_friendly', 'result_derby',
  'result_world_cup', 'stadium_spotlight', 'colored_smoke', 'card_side_fire',
  'victory_confetti', 'golden_cup', 'tunnel_entry', 'goal_celebration',
  'win_streak', 'mvp_effect', 'rematch_effect',
];
for (const slug of removedSlugs) {
  assert(!exists('userweb', 'public', 'shop', 'cosmetics-v3', `${slug}.webp`), `stale Web art ${slug}`);
  assert(!exists('mobile', 'assets', 'shop', 'cosmetics', `${slug}.webp`), `stale Android art ${slug}`);
}

console.log('✓ remaining Shop cosmetics share runtime renderers; result/match categories and assets are fully removed');
