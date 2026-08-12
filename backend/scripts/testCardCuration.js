#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function check(value, message) {
  assert.ok(value, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

console.log('\n== production card curation and runtime frames ==');
const migration = read('backend/migrations/058_curated_card_stats_and_admin_showcase.sql');
const judeSupplement = read('backend/migrations/059_verified_jude_ocr_tokens.sql');
const rowPattern = /^\s*\('([^']+)','([^']+)','([^']+)',(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),'([^']+)','([^']+)'\),?$/gm;
const rows = [...migration.matchAll(rowPattern)].map(match => ({
  oldName: match[1], newName: match[2], description: match[3],
  stats: match.slice(4, 10).map(Number), rarity: match[10], effect: match[11],
}));
const expected = [
  'Achraf Hakimi','Ousmane Dembélé','Erling Haaland','Harry Kane','Kevin De Bruyne',
  'Lautaro Martínez','Mohamed Salah','Emiliano Martínez','Kylian Mbappé','Michael Olise',
  'Rayan Cherki','Rodrigo Hernández','Vinícius Júnior','Lamine Yamal','Jude Bellingham N',
  'Jude Bellingham','Harry Kane s','Diego Maradona','Manuel Neuer','Ronaldinho','Pelé',
  'Courtois','Neymar Júnior','Kylian Mbappé N','Erling Haaland s','Daniel Carvajal',
  'Raphinha','Federico Valverde','Mohamed Salah s',
];
check(rows.length === 29, 'migration curates exactly 29 logical production cards');
check(new Set(rows.map(row => row.oldName)).size === 29,
  'every production lookup name is unique');
check(expected.every(name => rows.some(row => row.oldName === name)),
  'all 29 audited player/edition names are explicitly represented');
check(rows.every(row => row.description.length >= 25),
  'every card gets a substantive Persian football description');
check(rows.every(row => row.stats.every(value => value >= 0 && value <= 100)),
  'all six-dimensional gameplay ratings stay within engine bounds');
check(rows.every(row => new Set(row.stats).size > 2),
  'no card retains a uniform placeholder stat profile');
check(new Set(rows.map(row => row.stats.join(','))).size === 29,
  'all 29 card editions have differentiated stat profiles');
const rarityCounts = Object.fromEntries(['normal','silver','gold','premium','legend']
  .map(rarity => [rarity, rows.filter(row => row.rarity === rarity).length]));
check(JSON.stringify(rarityCounts) === JSON.stringify({ normal:4, silver:6, gold:1, premium:15, legend:3 }),
  'normal, silver, gold, premium and legend progression is fully populated');
check(rows.every(row => ['finisher','wall','speedster','playmaker'].includes(row.effect)),
  'every curated effect is supported by the live duel engine');
check(/GREATEST\(user_card_inventory\.quantity,1\)/.test(migration)
  && /COALESCE\(user_card_inventory\.display_design_id,EXCLUDED\.display_design_id\)/.test(migration),
'idempotent Admin grants never duplicate or replace an existing visible side');
check(/d\.side='front'/.test(migration) && /CROSS JOIN preferred_design/.test(migration),
  'showcase inventory prefers one front design for every active logical card');
check((migration.match(/ARRAY\['(?:ETERNO|HAALAND|RAPHINHA|SALAH)'/g) || []).length === 4
  && /cardinality\(COALESCE\(d\.text_tokens/.test(migration),
  'four visually verified zero-OCR fronts receive conservative manual tokens only when empty');
check(!/ARRAY\[[^\]]*MARADONA/.test(migration),
  'stylised Maradona artwork does not receive invented OCR text');
check(/ARRAY\['EMIRATES','BETTER','PREMIUM','CARD','#500'\]/.test(judeSupplement)
  && /cardinality\(COALESCE\(text_tokens/.test(judeSupplement),
  'post-deploy Jude audit stores only visibly printed tokens and remains idempotent');
check(!/ARRAY\[[^\]]*BELLINGHAM/.test(judeSupplement),
  'front-only Jude artwork does not receive an unprinted player-name token');

const routes = read('backend/src/routes/photoCards.js');
const grouping = read('backend/src/services/photoCardAdminGrouping.js');
check(/cardinality\(COALESCE\(d\.text_tokens/.test(routes)
  && /d\.rgb_sig IS NOT NULL/.test(routes),
  'Admin analyzer status separately measures OCR tokens and all fingerprints');
check(/width: row\.width/.test(grouping) && /height: row\.height/.test(grouping)
  && /analysis_complete/.test(grouping),
  'grouping retains dimensions and computes whole-card analyzer completeness');

const server = read('backend/src/server.js');
check((server.match(/t\.duel_attack, t\.duel_defense, t\.duel_speed/g) || []).length >= 3,
  'profile, bootstrap, and public profile expose card duel metadata');
check((server.match(/t\.description/g) || []).length >= 3,
  'all three inventory readers expose curated descriptions');

const webFrame = read('userweb/src/components/CardRarityFrame.jsx');
const webInventory = read('userweb/src/screens/Inventory.jsx');
const webDuel = read('userweb/src/cardDuelGame.jsx');
const webCss = read('userweb/src/style.css');
check(['معمولی','نقره‌ای','طلایی','پرمیوم','لجند'].every(label => webFrame.includes(label)),
  'Web rarity frame has small readable Persian labels for every tier');
check((webInventory.match(/<CardRarityFrame/g) || []).length >= 2
  && /<DuelStats item=\{item\}/.test(webInventory),
  'Web inventory grid and detail use real rarity frames and compact stats');
check(/duelRarityFrame/.test(webDuel) && /rarityCardShine/.test(webCss),
  'Web duel uses the same animated rarity treatment');
check(['rarity-normal','rarity-silver','rarity-gold','rarity-premium','rarity-legend']
  .every(name => webCss.includes(`.rarityCardFrame.${name}`)),
  'Web tiers use five materially distinct frame treatments, not color aliases');
check(/item\.image_url \|\| item\.imageUrl/.test(webInventory)
  && !/avatar_1_football/.test(webInventory),
  'Web collection renders the real design URL and never substitutes a football avatar');

const mobileFrame = read('mobile/lib/widgets/rarity_card_frame.dart');
const mobileInventory = read('mobile/lib/screens/user/inventory_page.dart');
const mobileDetail = read('mobile/lib/screens/shared/card_detail_sheet.dart');
const mobileDuel = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const mobileAdmin = read('mobile/lib/screens/admin/photo_cards/grouped_card_tile.dart');
check(['معمولی','نقره‌ای','طلایی','پرمیوم','لجند'].every(label => mobileFrame.includes(label)),
  'Android rarity frame carries the same five Persian tier labels');
check(/AnimationController/.test(mobileFrame) && /SweepGradient/.test(mobileFrame)
  && /case 'normal'/.test(mobileFrame) && /case 'silver'/.test(mobileFrame)
  && /case 'gold'/.test(mobileFrame) && /case 'premium'/.test(mobileFrame),
  'Android uses materially distinct normal, silver, gold, premium and legend frames');
check(!/football_icon/.test(mobileInventory) && !/football_icon/.test(mobileDetail)
  && /item\['image_url'\] \?\? item\['imageUrl'\]/.test(mobileInventory),
  'Android collection renders the real design URL without the misleading football fallback');
check(/RarityCardFrame/.test(mobileInventory) && /RarityCardFrame/.test(mobileDetail)
  && /RarityCardFrame/.test(mobileDuel),
  'Android inventory, detail, and duel share the runtime rarity frame');
check(/RarityCardFrame/.test(mobileAdmin) && /analysis_complete/.test(mobileAdmin)
  && /fingerprint_complete/.test(mobileAdmin) && /side\['width'\]/.test(mobileAdmin),
  'Android Admin preview shows rarity, analyzer health, dimensions, and sides');

const adminTile = read('admin/src/components/photoCards/GroupedCardTile.jsx');
const adminCss = read('admin/src/styles.css');
check(/adminRarityFrame/.test(adminTile) && /adminDuelStats/.test(adminTile),
  'Admin logical-card preview displays rarity and all player stats');
check(/side\.width/.test(adminTile) && /fingerprint_complete/.test(adminTile)
  && /ocr_token_count/.test(adminTile),
  'Admin preview displays dimensions, side identity, OCR count, and fingerprint health');
check(/adminCardShine/.test(adminCss) && /prefers-reduced-motion/.test(adminCss),
  'Admin rarity animation is polished and respects reduced motion');
check(['rarity-normal','rarity-silver','rarity-gold','rarity-premium','rarity-legend']
  .every(name => adminCss.includes(`.adminRarityFrame.${name}`)),
  'Admin preview mirrors all five distinct physical frame classes');

console.log(`\n✅ ${passed} card-curation regressions passed\n`);
