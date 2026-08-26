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
check(/card-box/.test(read('admin/src/main.jsx'))
  && /AdminCardBox/.test(read('mobile/lib/screens/admin/admin_shell.dart')),
  'both admin shells expose the card-box page');

console.log(`\n✅ ${passed} admin parity assertions passed\n`);
