#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('backend/migrations/052_monetization_catalogue.sql');
const shop = read('backend/src/services/shopService.js');
const referrals = read('backend/src/services/referralService.js');
const wallet = read('backend/src/services/walletService.js');
const server = read('backend/src/server.js');
const pass = read('backend/src/services/passService.js');
const webShop = read('userweb/src/screens/Shop.jsx');
const mobileShop = read('mobile/lib/screens/user/shop_page.dart');
const webCosmetics = read('userweb/src/components/Cosmetics.jsx');
const mobileCosmetics = read('mobile/lib/core/cosmetics.dart');

// Exact commercial terms.
assert.match(shop, /const PLUS_PRICE = 59000/);
assert.match(shop, /const ANNUAL_PLUS_PRICE = 499000/);
assert.match(shop, /monthly:[\s\S]*?price: PLUS_PRICE, days: 30/);
assert.match(shop, /annual:[\s\S]*?price: ANNUAL_PLUS_PRICE, days: 365/);
assert.match(shop, /savingPercent: 30/);
for (const benefit of ['Premium Pass', 'حذف تبلیغات عادی', 'عضویت دائمی در یک باشگاه منتخب']) {
  assert(shop.includes(benefit), `missing Plus benefit: ${benefit}`);
}
for (const annual of ['annual_royal_frame', 'annual_royal_result']) {
  assert(shop.includes(annual) && migration.includes(annual), `missing annual grant: ${annual}`);
}
for (const annual of ['ستاره سالانه', 'annual_club_switches']) {
  assert(shop.includes(annual), `missing annual entitlement: ${annual}`);
}
assert(pass.includes("plan IN ('plus','plus_annual')"), 'annual Plus must unlock Premium Pass');

// Every requested deterministic SKU family is seeded inside its price band.
const required = {
  card_frame: ['blue_fire','stadium_frame','animated_gold','club_neon','season_champion','champions_night','pro_holographic'],
  name_color: ['gold_gradient','green_neon','animated_fire','calm_rainbow','icy_glow','digital_typing','mvp_name','social_team'],
  result_template: ['result_stadium','result_champions','result_fire','result_ice','result_gold_mvp','result_friendly','result_derby','result_world_cup'],
  match_effect: ['stadium_spotlight','colored_smoke','card_side_fire','victory_confetti','golden_cup','tunnel_entry','goal_celebration','win_streak','mvp_effect','rematch_effect'],
  emote_pack: ['emote_respect','emote_comeback','emote_goal_club'],
  profile_background: ['locker_room','night_stadium','player_tunnel','champion_podium','training_ground','collection_room'],
};
for (const [kind, slugs] of Object.entries(required)) {
  assert(migration.includes(`'${kind}'`), `missing catalogue kind ${kind}`);
  for (const slug of slugs) assert(migration.includes(`'${slug}'`), `missing SKU ${slug}`);
}
const bands = {
  card_frame: [19000, 49000], name_color: [9000, 25000],
  result_template: [15000, 39000], match_effect: [19000, 59000],
  emote_pack: [9000, 25000], profile_background: [29000, 69000],
};
for (const [kind, slugs] of Object.entries(required)) {
  const [min, max] = bands[kind];
  for (const slug of slugs) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hit = migration.match(new RegExp(`'${escaped}'[^\\n]*?,(\\d+),'`));
    assert(hit, `price not found for ${slug}`);
    const price = Number(hit[1]);
    assert(price >= min && price <= max, `${slug} price ${price} outside ${min}-${max}`);
  }
}

// Commission is direct-only, atomic, auditable and idempotent.
assert.strictEqual((referrals.match(/async function payPurchaseCommission/g) || []).length, 1);
assert(referrals.includes('PURCHASE_COMMISSION_PERCENT = 10'));
assert(referrals.includes('purchase_referral_commissions'));
assert(referrals.includes('ON CONFLICT(purchase_type, purchase_reference_id) DO NOTHING'));
assert(referrals.includes("source: 'purchase_referral'"));
assert(wallet.includes("'purchase_referral'"));
assert(migration.includes('UNIQUE(purchase_type, purchase_reference_id)'));
assert(migration.includes("'purchase_referral'"));
assert(!/payPurchaseCommission[\s\S]{0,200}payPurchaseCommission\(/.test(referrals), 'commission must never recurse');
for (const purchaseType of ['shop_item', 'plus_monthly', 'plus_annual']) assert(referrals.includes(`'${purchaseType}'`));
const itemCommission = shop.indexOf("purchaseType: 'shop_item'");
const itemCommit = shop.indexOf("await client.query('COMMIT')", itemCommission);
assert(itemCommission > 0 && itemCommit > itemCommission, 'item commission must precede COMMIT');
const plusCommission = shop.indexOf("purchaseType: cycle === 'annual'");
const plusCommit = shop.indexOf("await client.query('COMMIT')", plusCommission);
assert(plusCommission > 0 && plusCommit > plusCommission, 'Plus commission must precede COMMIT');
assert(referrals.includes('referred_by = $1'), 'summary must stay direct-referral only');
assert(referrals.includes('cashWithdrawReady'));
assert(referrals.includes('wallet.getWalletSettings()'));

// API and compact category UI parity.
assert(server.includes("req.body?.billingCycle"));
assert(server.includes("/api/admin/referrals/purchase-commissions"));
assert(server.includes('shop.emotePacksFor(req.user.id)'));
assert(server.includes('await isAllowedChatMessage(clean, req.user.id)'));
assert(webShop.includes('shopNav') && webShop.includes('shopCarousel'));
assert(webShop.includes("billingCycle === 'annual'"));
assert(mobileShop.includes('ChoiceChip') && mobileShop.includes('Axis.horizontal'));
assert(mobileShop.includes("'billingCycle': plan['billingCycle']"));
for (const slug of ['result_world_cup', 'annual_royal_result']) {
  assert(webCosmetics.includes(slug) && mobileCosmetics.includes(slug), `rendering missing ${slug}`);
}
assert(webCosmetics.includes('profileBackgroundStyle'));
assert(mobileCosmetics.includes('profileBackgroundDecoration'));

console.log('✓ monetization catalogue, annual Plus, direct cash referral and Web/Android parity checks passed');
