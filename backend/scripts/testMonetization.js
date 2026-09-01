#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('backend/migrations/052_monetization_catalogue.sql');
const rateMigration = read('backend/migrations/054_referral_purchase_commission_5_percent.sql');
const motionMigration = read('backend/migrations/057_animated_cosmetics_and_profile_badges.sql');
const removalMigration = read('backend/migrations/063_remove_result_and_match_cosmetics.sql');
const shop = read('backend/src/services/shopService.js');
const referrals = read('backend/src/services/referralService.js');
const wallet = read('backend/src/services/walletService.js');
const server = read('backend/src/server.js');
const pass = read('backend/src/services/passService.js');
const webShop = read('userweb/src/screens/Shop.jsx');
const mobileShop = read('mobile/lib/screens/user/shop_page.dart');
const webCosmetics = read('userweb/src/components/Cosmetics.jsx');
const mobileCosmetics = read('mobile/lib/core/cosmetics.dart');
const mobilePalette = read('mobile/lib/core/cosmetic_palette.dart');

// Exact commercial terms.
assert.match(shop, /const PLUS_PRICE = 59000/);
assert.match(shop, /const ANNUAL_PLUS_PRICE = 499000/);
assert.match(shop, /monthly:[\s\S]*?price: PLUS_PRICE, days: 30/);
assert.match(shop, /annual:[\s\S]*?price: ANNUAL_PLUS_PRICE, days: 365/);
assert.match(shop, /savingPercent: 30/);
for (const benefit of ['Premium Pass', 'حذف تبلیغات عادی', 'عضویت دائمی در یک باشگاه منتخب']) {
  assert(shop.includes(benefit), `missing Plus benefit: ${benefit}`);
}
assert(shop.includes('annual_royal_frame') && migration.includes('annual_royal_frame'), 'missing annual frame grant');
assert(!shop.includes('annual_royal_result'), 'removed annual result template must not be granted');
for (const annual of ['ستاره سالانه', 'annual_club_switches']) {
  assert(shop.includes(annual), `missing annual entitlement: ${annual}`);
}
assert(pass.includes("plan IN ('plus','plus_annual')"), 'annual Plus must unlock Premium Pass');

// Every requested deterministic SKU family is seeded inside its price band.
const required = {
  card_frame: ['blue_fire','stadium_frame','animated_gold','club_neon','season_champion','champions_night','pro_holographic'],
  name_color: ['gold_gradient','green_neon','animated_fire','calm_rainbow','icy_glow','digital_typing','mvp_name','social_team'],
  emote_pack: ['emote_respect','emote_comeback','emote_goal_club'],
  profile_background: ['locker_room','night_stadium','player_tunnel','champion_podium','training_ground','collection_room'],
};
for (const [kind, slugs] of Object.entries(required)) {
  assert(migration.includes(`'${kind}'`), `missing catalogue kind ${kind}`);
  for (const slug of slugs) assert(migration.includes(`'${slug}'`), `missing SKU ${slug}`);
}
const bands = {
  card_frame: [19000, 49000], name_color: [9000, 25000],
  emote_pack: [9000, 25000], profile_background: [29000, 69000],
};
const profileBadges = ['badge_cr7','badge_goat','badge_captain','badge_legend','badge_king','badge_ace'];
for (const slug of profileBadges) {
  assert(motionMigration.includes(`'${slug}'`), `missing profile badge ${slug}`);
  const hit = motionMigration.match(new RegExp(`'${slug}'[^\\n]*?,(\\d+),7`));
  assert(hit, `price not found for ${slug}`);
  assert(Number(hit[1]) >= 15000 && Number(hit[1]) <= 49000, `${slug} price outside 15K-49K`);
}
assert(shop.includes("profile_badge: 'equipped_profile_badge'"));

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
// نرخ پیش‌فرض در opsLimits است؛ سرویس باید از getter بخواند نه ثابت.
assert(/purchaseCommissionPercent\(\)/.test(referrals));
assert(/referralPurchaseCommissionPercent:\s*5/.test(
  require('fs').readFileSync(require('path').join(__dirname, '../src/services/opsLimits.js'), 'utf8')));
// نرخ حالا از ops_limits می‌آید (قابل تنظیم از پنل ادمین، پیش‌فرض ۵٪)،
// ولی هرگز از بدنهٔ درخواستِ کلاینت — روحِ گاردِ قبلی حفظ می‌شود:
// در payPurchaseCommission نرخ از getter سرویس محاسبه می‌شود و همان
// مقدار (rate) در ستونِ commission_rate ثبت می‌شود.
assert(/const rate = pct \/ 100;/.test(referrals),
  'نرخ از getter سرویس محاسبه می‌شود');
assert(/VALUES\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8\)/.test(referrals),
  'نرخ به‌عنوان پارامترِ محاسبه‌شده در INSERT می‌رود — نه از کلاینت');
assert(!/req\.body/.test(referrals.split('payPurchaseCommission')[1].split('ON CONFLICT')[0]),
  'بدنهٔ درخواست در مسیر نرخ دخالت ندارد');
// درگاه پرداخت باید در ردیف ممیزی ثبت شود (دور ۱۸: خرید مستقیم بازار).
assert(referrals.includes('gateway_provider'), 'audit row must record the gateway');
assert(rateMigration.includes('SET DEFAULT 0.0500'));
assert(rateMigration.includes('0.1000'), 'historical 10% audit rows must remain valid');
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
for (const removed of ['result_template', 'match_effect']) {
  assert(removalMigration.includes(removed), `removal migration missing ${removed}`);
  assert(!shop.includes(removed), `removed kind leaked into shop service: ${removed}`);
  assert(!webShop.includes(removed) && !mobileShop.includes(removed), `removed category leaked into clients: ${removed}`);
}
assert(removalMigration.includes('equipped_result_template = NULL'));
assert(removalMigration.includes('equipped_match_effect = NULL'));
assert(!shop.includes('equipped_result_template') && !shop.includes('equipped_match_effect'),
  'current service must not read legacy equip slots');
assert(webCosmetics.includes('profileBackgroundStyle'));
assert(mobilePalette.includes('profileBackgroundDecoration'));

console.log('✓ monetization catalogue, annual Plus, direct cash referral and Web/Android parity checks passed');
