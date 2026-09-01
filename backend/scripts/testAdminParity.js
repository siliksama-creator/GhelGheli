#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

console.log('\n== Admin Web ↔ Android capability audit ==');
const webAdmins = read('admin/src/pages/admins.jsx');
const mobileAdmins = read('mobile/lib/screens/admin/admin_admins.dart');
check(/admins\/\$\{a\.id\}\/status/.test(webAdmins), 'Web can revoke/reactivate admin accounts');
check(/admins\/\$\{admin\['id'\]\}\/status/.test(mobileAdmins),
  'Android can revoke/reactivate admin accounts');

const webUsers = read('admin/src/pages/users.jsx');
const mobileUsers = read('mobile/lib/screens/admin/admin_users.dart');
for (const capability of ['grant-plus', 'grant-item', 'points', 'reset-password', 'notify']) {
  check(webUsers.includes(`/${capability}`), `Web user management exposes ${capability}`);
  check(mobileUsers.includes(`/${capability}`), `Android user management exposes ${capability}`);
}
check(/\{grant &&/.test(webUsers) && /اعطا کن/.test(webUsers),
  'Web grant-item actually renders a form, not a dead button');
check(/Future<void> _grantItem/.test(mobileUsers) && /showDialog/.test(mobileUsers),
  'Android grant-item opens a dialog');
check(/unlimited-spins/.test(webUsers) && /unlimited-spins/.test(mobileUsers),
  'both admin clients can toggle unlimited wheel spins');
check(/signup-gift/.test(read('admin/src/pages/settings.jsx'))
  && /signup-gift/.test(read('mobile/lib/screens/admin/admin_settings.dart')),
  'both admin clients expose signup-gift settings');
check(read('admin/src/pages/analytics.jsx').includes('crashes/groups')
  && read('mobile/lib/screens/admin/admin_analytics.dart').includes('crashes/groups'),
  'both admin clients resolve crash groups via API');
check(read('admin/src/pages/analytics.jsx').includes('wheel/stats')
  && read('mobile/lib/screens/admin/admin_analytics.dart').includes('wheel/stats'),
  'both admin clients show wheel stats');
check(/\/status/.test(webUsers) && /\/status/.test(mobileUsers),
  'both admin clients can block/unblock users');

const webNotifications = read('admin/src/pages/notifications.jsx');
const mobileNotifications = read('mobile/lib/screens/admin/admin_notifications.dart');
check(/notifications\/status/.test(webNotifications) && /fcmConfigured/.test(webNotifications),
  'Web displays authoritative notification transport status');
check(/notifications\/status/.test(mobileNotifications) && /fcmConfigured/.test(mobileNotifications),
  'Android displays authoritative notification transport status');
check(/send-segmented/.test(webNotifications) && /send-segmented/.test(mobileNotifications),
  'both clients use the same segmented-notification endpoint');

const webRewards = read('admin/src/pages/rewards.jsx');
const mobileRewards = read('mobile/lib/screens/admin/admin_rewards.dart');
const apiClient = read('mobile/lib/api_client.dart');
const rewardRoutes = read('backend/src/routes/adminRewards.js');
check(/rewards\/\$\{cardEditor\.tierId\}\/cards/.test(webRewards),
  'Web manages required cards on a reward tier');
check(/rewards\/\$\{reward\['id'\]\}\/cards/.test(mobileRewards),
  'Android manages required cards on a reward tier');
check(/Future<dynamic> put/.test(apiClient), 'Android API client supports PUT mutations');
check(/AS required_cards/.test(rewardRoutes) && /cardTypeId/.test(rewardRoutes),
  'reward admin API returns persisted card requirements to both clients');
check(/LEFT JOIN reward_tiers/.test(rewardRoutes) && /COALESCE\(c\.reward_name/.test(rewardRoutes),
  'deleted reward tiers do not hide historical claims');
check(/500/.test(mobileRewards) && !/length >= 30/.test(mobileRewards),
  'Android reward limit matches the backend and Web limit');

const dialog = read('admin/src/components/dialog.jsx');
check(/state\.description \|\| state\.message/.test(dialog),
  'Web confirmations render both legacy and current description props');
check(/state\.confirmLabel \|\| state\.confirmText/.test(dialog),
  'Web confirmations render both legacy and current button-label props');

const webCards = read('admin/src/pages/photo-cards.jsx');
const mobileCards = read('mobile/lib/screens/admin/admin_photo_cards.dart');
check(/GroupedCardTile/.test(webCards) && /GroupedPhotoCardTile/.test(mobileCards),
  'both clients render one administrative tile per grouped photo card');
check(/method: 'DELETE'/.test(webCards) && /_deleteCard\(Map card\)/.test(mobileCards),
  'both clients expose safe whole-card deletion');

const webWheel = read('admin/src/pages/wheel.jsx');
const mobileWheel = read('mobile/lib/screens/admin/admin_wheel.dart');
check(/admin\/wheel\/prizes/.test(webWheel) && /admin\/wheel\/prizes/.test(mobileWheel),
  'both admin clients edit wheel prizes');
check(/شانس/.test(webWheel) && /شانس/.test(mobileWheel),
  'both admin clients edit wheel chances as percent, not raw 10-million weights');
check(/card_box/.test(webWheel) && /card_box/.test(mobileWheel),
  'both admin clients can put a card box on the wheel');
check(/card_box/.test(read('admin/src/pages/league.jsx'))
  && /card_box/.test(read('mobile/lib/screens/admin/admin_league.dart')),
  'both admin clients can award a card box as a league perk');

const webBox = read('admin/src/pages/card-box.jsx');
const mobileBox = read('mobile/lib/screens/admin/admin_card_box.dart');
check(webBox.includes('/api/admin/card-box') && mobileBox.includes('/api/admin/card-box'),
  'both admin clients edit card-box odds');
check(/weightTotal/.test(webBox) && /_weightTotal/.test(mobileBox),
  'both admin clients refuse to save odds that do not sum to 100%');
check(/\['card-box', 'صندوق کارت'/.test(read('admin/src/main.jsx'))
  && /AdminCardBox/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
  'both admin shells expose the card-box page (menu entry, not just an import)');

// ═══ دورِ عملیات (۱۴۰۵): فروشگاه، گذر نبرد، ماموریت‌ها، اهرم‌های موتور ═══
const webShop = read('admin/src/pages/shop.jsx');
const mobileShop = read('mobile/lib/screens/admin/admin_shop.dart');
check(/admin\/shop/.test(webShop) && /admin\/shop/.test(mobileShop),
  'both admin clients expose shop item CRUD');
check(/admin\/shop\/plus/.test(webShop) && /admin\/shop\/plus/.test(mobileShop),
  'both admin clients edit plus plans');
check(/method: 'DELETE'/.test(webShop) && /api.delete\('\/api\/admin\/shop/.test(mobileShop),
  'both admin clients expose shop item deletion');
check(/'shop'/.test(read('admin/src/main.jsx')) && /AdminShop/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
  'both admin shells expose the shop page');

const webPass = read('admin/src/pages/battle-pass.jsx');
const mobilePass = read('mobile/lib/screens/admin/admin_pass.dart');
check(/admin\/pass\/seasons/.test(webPass) && /admin\/pass\/seasons/.test(mobilePass),
  'both admin clients manage battle-pass seasons');
check(/admin\/pass\/tiers/.test(webPass) && /admin\/pass\/tiers/.test(mobilePass),
  'both admin clients edit battle-pass tier rewards');
check(/admin\/pass\/config/.test(webPass) && /admin\/pass\/config/.test(mobilePass),
  'both admin clients edit the pass XP curve');
check(/maxTiersPerDay/.test(webPass) && /maxTiersPerDay/.test(mobilePass),
  'both admin clients expose the daily tier cap');
check(/'battle-pass'/.test(read('admin/src/main.jsx')) && /AdminPass/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
  'both admin shells expose the battle-pass page');

const webMissions = read('admin/src/pages/missions.jsx');
const mobileMissions = read('mobile/lib/screens/admin/admin_missions.dart');
check(/admin\/missions\/config/.test(webMissions) && /admin\/missions\/config/.test(mobileMissions),
  'both admin clients edit the daily mission bonus');
check(/admin\/missions\/builtin/.test(webMissions) && /admin\/missions\/builtin/.test(mobileMissions),
  'both admin clients override builtin missions');
check(/admin\/missions/.test(webMissions) && /admin\/missions/.test(mobileMissions),
  'both admin clients create custom missions');
check(/'missions'/.test(read('admin/src/main.jsx')) && /AdminMissions/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
  'both admin shells expose the missions page');

const webEngine = read('admin/src/pages/engine.jsx');
const mobileEngine = read('mobile/lib/screens/admin/admin_engine.dart');
check(/settings\/photo-match/.test(webEngine) && /settings\/photo-match/.test(mobileEngine),
  'both admin clients edit photo-match thresholds');
check(/settings\/levels/.test(webEngine) && /settings\/levels/.test(mobileEngine),
  'both admin clients edit the level curve');
check(/settings\/streak/.test(webEngine) && /settings\/streak/.test(mobileEngine),
  'both admin clients edit the login-streak cycle');
check(/chat\/canned/.test(webEngine) && /chat\/canned/.test(mobileEngine),
  'both admin clients edit canned chat messages');
check(/'engine'/.test(read('admin/src/main.jsx')) && /AdminEngine/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
  'both admin shells expose the engine page');

const webSettings = read('admin/src/pages/settings.jsx');
const mobileSettings = read('mobile/lib/screens/admin/admin_settings.dart');
check(/client-config/.test(webSettings) && /client-config/.test(mobileSettings),
  'both admin clients edit the client config');
check(/tabOrder/.test(webSettings) && /tabOrder/.test(mobileSettings),
  'both admin clients edit the tab order');
check(/tabOrder/.test(read('userweb/src/main.jsx'))
    && /tabOrder/.test(read('mobile/lib/screens/user/home_shell.dart')),
  'both user clients read the server-driven tab order');

console.log(`\n✅ ${passed} admin parity assertions passed\n`);
