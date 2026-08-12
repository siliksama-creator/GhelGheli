#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const migration = read('backend', 'migrations', '056_shop_truthful_live_previews.sql');
const webShop = read('userweb', 'src', 'screens', 'Shop.jsx');
const webEffect = read('userweb', 'src', 'components', 'MatchEffectVisual.jsx');
const webEffectCss = read('userweb', 'src', 'components', 'matchEffectVisual.css');
const webGames = read('userweb', 'src', 'games.jsx');
const webDuel = read('userweb', 'src', 'cardDuelGame.jsx');
const mobileShop = read('mobile', 'lib', 'screens', 'user', 'shop_page.dart');
const mobileEffect = read('mobile', 'lib', 'widgets', 'match_effect_visual.dart');
const mobileGames = read('mobile', 'lib', 'screens', 'user', 'games', 'game_scaffold.dart');
const mobileDuel = read('mobile', 'lib', 'screens', 'user', 'games', 'card_duel_page.dart');
const mobileDuelWidgets = read('mobile', 'lib', 'screens', 'user', 'games', 'card_duel', 'card_duel_widgets.dart');
const webCosmetics = read('userweb', 'src', 'components', 'Cosmetics.jsx');
const webProfile = read('userweb', 'src', 'screens', 'Profile.jsx');
const webPublicProfile = read('userweb', 'src', 'screens', 'PublicProfile.jsx');
const mobileCosmetics = read('mobile', 'lib', 'core', 'cosmetics.dart');
const mobileProfile = read('mobile', 'lib', 'screens', 'user', 'profile_page.dart');
const mobilePublicProfile = read('mobile', 'lib', 'screens', 'shared', 'public_profile_sheet.dart');
const mobileVersus = read('mobile', 'lib', 'screens', 'user', 'games', 'versus_bar.dart');

const effects = [
  'stadium_spotlight', 'colored_smoke', 'card_side_fire', 'victory_confetti',
  'golden_cup', 'tunnel_entry', 'goal_celebration', 'win_streak',
  'mvp_effect', 'rematch_effect',
];

// Database truth: interactive entitlements no longer advertise an image URL.
assert(migration.includes('SET image_url = NULL'));
for (const kind of ['card_frame', 'name_color', 'match_effect', 'emote_pack']) {
  assert(migration.includes(`'${kind}'`), `truthful-preview migration missing ${kind}`);
}
assert(migration.includes('"previewMode":"live-runtime"'));
assert(migration.includes("- 'motion'"), 'stale motion promises must be removed');

// Frames are not Shop-only decoration: the shared exact renderer is used on
// owned/public profiles and in the live Android versus bar.
assert(webCosmetics.includes('function CosmeticAvatarFrame'));
assert(webProfile.includes('<CosmeticAvatarFrame frame={p.cosmetics?.frame}'));
assert(webPublicProfile.includes('<CosmeticAvatarFrame frame={cos.frame}'));
assert(webGames.includes('<CosmeticAvatarFrame frame={p.cosmetics?.frame}'));
assert(webDuel.includes('<CosmeticAvatarFrame frame={p.cosmetics?.frame}'));
assert(mobileCosmetics.includes('class CosmeticAvatarFrame'));
for (const surface of [mobileProfile, mobilePublicProfile, mobileVersus, mobileDuelWidgets, mobileShop]) {
  assert(surface.includes('CosmeticAvatarFrame('));
}

// Web Shop renders the entitlement itself. Images remain legitimate only for
// real club marks and the profile background that is actually equipped.
assert(webShop.includes("item.kind === 'club_badge'"));
assert(webShop.includes("item.kind === 'card_frame'") && webShop.includes('<CosmeticAvatarFrame frame={value}'));
assert(webShop.includes("item.kind === 'name_color'") && webShop.includes('nameColorStyle(value)'));
assert(webShop.includes("item.kind === 'profile_background'") && webShop.includes('profileBackgroundStyle(value)'));
assert(webShop.includes("item.kind === 'result_template'") && webShop.includes('RESULT_PALETTES[value]'));
assert(webShop.includes("item.kind === 'match_effect'") && webShop.includes('<MatchEffectVisual slug={item.slug}'));
assert(webShop.includes('shopLiveEmotes') && webShop.includes('messages.map'));
const skuArtRefs = webShop.match(/\/shop\/cosmetics-v3\/\$\{item\.slug\}\.webp/g) || [];
assert.strictEqual(skuArtRefs.length, 1,
  'SKU artwork is allowed only as the actually-equipped result-template surface');
const resultPreview = webShop.slice(webShop.indexOf("item.kind === 'result_template'"), webShop.indexOf("item.kind === 'match_effect'"));
assert(resultPreview.includes('/shop/cosmetics-v3/${item.slug}.webp'));
assert(!webShop.includes("['annual_royal_frame','annual_royal_result']"),
  'Plus plan must use live swatches rather than concept thumbnails');

// The procedural renderer is shared by Shop and both Web game runtimes.
for (const slug of effects) {
  assert(webEffect.includes(slug), `Web procedural effect missing ${slug}`);
  assert(mobileEffect.includes(slug), `Android procedural effect missing ${slug}`);
}
assert(!webEffect.includes('<img'), 'Web effect renderer must be procedural');
assert(!mobileEffect.includes('Image.asset'), 'Android effect renderer must be procedural');
assert(webEffect.includes('matchEffectSupports') && mobileEffect.includes('matchEffectSupports'));
for (const runtime of [webGames, webDuel, mobileGames, mobileDuel]) {
  assert(runtime.includes('matchEffectSupports'), 'runtime must honor entry/finish entitlement phase');
}
assert(webEffectCss.includes('.fxPitch') && webEffectCss.includes('@keyframes'));
for (const runtime of [webGames, webDuel]) {
  assert(runtime.includes("components/MatchEffectVisual.jsx"));
  assert(runtime.includes('<CosmeticMatchEffect slug={slug}'));
}
const webGameEffectBlock = webGames.slice(webGames.indexOf('function MatchEffectVisual'), webGames.indexOf('async function makeGenericResultCard'));
const webDuelEffectBlock = webDuel.slice(webDuel.indexOf('function DuelEffectVisual'), webDuel.indexOf('const rarityColor'));
assert(!webGameEffectBlock.includes('<img') && !webDuelEffectBlock.includes('<img'),
  'Web match-effect runtime must not render promotional artwork');

// Android Shop uses authoritative cosmetic maps and the exact same painter as
// game runtime. It may still load club marks/profile backgrounds, because in
// those two categories the purchased image really is what gets equipped.
assert(mobileShop.includes('_ShopFrameArtwork') && mobileShop.includes('CosmeticAvatarFrame('));
assert(mobileShop.includes('_ShopNameArtwork') && mobileShop.includes('nameGradientColors'));
assert(mobileShop.includes('_ShopResultArtwork') && mobileShop.includes('resultTemplateColors[value]'));
assert(mobileShop.includes('_ShopMatchEffectArtwork(slug: slug)'));
assert(mobileShop.includes('MatchEffectVisual('));
assert(mobileShop.includes('_ShopEmoteArtwork'));
assert(!mobileShop.includes("? const ['annual_royal_frame', 'annual_royal_result']"),
  'Android Plus plan must not use concept thumbnails');
for (const runtime of [mobileGames, mobileDuel]) {
  assert(runtime.includes("widgets/match_effect_visual.dart"));
  assert(runtime.includes('MatchEffectVisual('));
  assert(!runtime.includes("'assets/shop/cosmetics/${widget.slug}.webp'"));
}

console.log('✓ Shop previews and equipped runtimes share truthful live renderers on Web and Android');
