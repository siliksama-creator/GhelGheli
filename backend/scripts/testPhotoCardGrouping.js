#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const { groupAdminCards } = require('../src/services/photoCardAdminGrouping');

let passed = 0;
function check(value, message) {
  assert.ok(value, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

console.log('\n== grouped front/back photo cards ==');
const rows = [
  {
    id: 'front-design', card_type_id: 'card-a', card_type_name: 'Player A',
    side: 'front', image_url: '/front.webp', is_active: true,
    card_type_is_active: true, point_value: 100, redeemed_count: 2,
    code_count: 20, unused_code_count: 18, width: 720, height: 1080,
    text_token_count: 4, fingerprint_complete: true,
    duel_attack: 91, duel_defense: 52, duel_speed: 94,
    duel_technique: 90, duel_goal_chance: 93, duel_energy: 88,
    duel_rarity: 'gold', duel_effect: 'finisher',
  },
  {
    id: 'back-design', card_type_id: 'card-a', card_type_name: 'Player A',
    side: 'back', image_url: '/back.webp', is_active: true,
    card_type_is_active: true, point_value: 100, redeemed_count: 3,
    code_count: 20, unused_code_count: 18, width: 720, height: 1080,
    text_token_count: 2, fingerprint_complete: true,
    duel_attack: 91, duel_defense: 52, duel_speed: 94,
    duel_technique: 90, duel_goal_chance: 93, duel_energy: 88,
    duel_rarity: 'gold', duel_effect: 'finisher',
  },
  {
    id: 'other-front', card_type_id: 'card-b', card_type_name: 'Player B',
    side: 'front', image_url: '/b.webp', is_active: false,
    card_type_is_active: true, point_value: 50, redeemed_count: 1,
  },
];
const cards = groupAdminCards(rows);
check(cards.length === 2, 'two sides count as one card and another type as one card');
const cardA = cards.find(card => card.card_type_id === 'card-a');
check(cardA.sides.length === 2, 'front and back remain independent recognition samples');
check(cardA.sides.map(side => side.side).join(',') === 'front,back', 'side identity is preserved');
check(cardA.image_url === '/front.webp', 'front is the administrative primary image');
check(cardA.redeemed_count === 5, 'registration counts are summed once on the grouped card');
check(cardA.code_count === 20, 'codes belong to the grouped card type, not an image side');
check(cardA.analysis_complete === true && cardA.ocr_token_count === 6,
  'grouped analyzer health requires every fingerprint and sums OCR tokens');
check(cardA.sides[0].width === 720 && cardA.sides[0].height === 1080,
  'dimensions remain visible on each recognition side');
check(cardA.duel_rarity === 'gold' && cardA.duel_attack === 91,
  'rarity and player-specific duel stats remain on the logical card');
check(cards.find(card => card.card_type_id === 'card-b').is_active === false,
  'a grouped card never reports active while one of its sides is inactive');
check(cards.find(card => card.card_type_id === 'card-b').analysis_complete === false,
  'missing visual signatures are never reported as complete analysis');

const migration = read('backend/migrations/049_photo_card_sides.sql');
check(/side IN \('front', 'back', 'alternate'\)/.test(migration), 'migration constrains side metadata');
check(/PARTITION BY card_type_id/.test(migration), 'existing designs are backfilled within each card');

const upload = read('backend/src/routes/photoCards/adminUpload.js');
check(/card_type_id, side, image_url/.test(upload), 'upload persists front/back labels');
check(/side\.fp\.dhash/.test(upload) && /side\.fp\.phash/.test(upload),
  'each side keeps its own visual fingerprints');

const routes = read('backend/src/routes/photoCards.js');
check(/cards: groupAdminCards\(rows\)/.test(routes), 'admin API returns grouped cards');
check(/updated_sides AS/.test(routes) && /WHERE card_type_id = \$5/.test(routes),
  'activation updates every side atomically');
check(/DELETE FROM photo_card_codes/.test(routes)
  && /DELETE FROM card_types WHERE id=\$1/.test(routes),
  'whole-card deletion removes safe unused codes and the grouped card');
check(/inventory_count/.test(routes) && /submission_count/.test(routes)
  && /committed_code_count/.test(routes),
  'whole-card deletion protects user inventory, history, and committed codes');

const adminWeb = read('admin/src/pages/photo-cards.jsx');
const adminMobile = read('mobile/lib/screens/admin/admin_photo_cards.dart');
check(/GroupedCardTile/.test(adminWeb) && /deleteCard\(card\)/.test(adminWeb),
  'Admin Web edits and deletes grouped cards');
check(/GroupedPhotoCardTile/.test(adminMobile) && /_deleteCard\(Map card\)/.test(adminMobile),
  'Admin Android edits and deletes grouped cards');

const tapAndroid = read('mobile/lib/screens/user/games/tap/tap_screen.dart');
const tapWeb = read('userweb/src/tapGame.jsx');
check(!/import .*game_audio|GameAudio\.instance|Sfx\./.test(tapAndroid), 'Android Tap has no audio import or playback');
check(!/playSfx|gameAudio/.test(tapWeb), 'Web Tap has no audio import or playback');
check(/ValueListenableBuilder/.test(tapAndroid) && /_tapHapticMinGap/.test(tapAndroid),
  'Android Tap retains bounded rebuild and haptic pressure');
check(fs.existsSync(path.join(root, 'scripts/clean_tap_assets.py')),
  'Tap alpha cleanup is reproducible');

console.log(`\n✅ ${passed} grouped-card/Tap regressions passed\n`);
