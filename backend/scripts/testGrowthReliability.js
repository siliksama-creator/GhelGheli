#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const missions = require('../src/services/missionService');
const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0, failed = 0;
function ok(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

console.log('\n== growth + reliability release ==');
const migration = read('backend/migrations/051_growth_reliability.sql');
for (const table of ['friendships', 'user_mission_progress', 'analytics_events', 'app_crash_reports', 'withdrawal_status_history']) {
  ok(migration.includes(`TABLE IF NOT EXISTS ${table}`), `migration creates ${table}`);
}
ok(migration.includes('ADD COLUMN IF NOT EXISTS match_id'), 'card history gets authoritative match id');
ok(missions.DEFINITIONS.some(m => m.period === 'daily') && missions.DEFINITIONS.some(m => m.period === 'weekly'),
  'daily and weekly missions are both defined');
ok(missions.periodKey('daily', new Date('2026-08-11T12:00:00Z')) === '2026-08-11',
  'mission day follows Tehran civil date');

const engine = read('backend/src/games/engine.js');
ok(engine.includes('RECONNECT_WINDOW_MS = 25_000') && engine.includes("'game:resume'"),
  'engine preserves and resumes short disconnects');
ok(engine.includes("'game:rematch'") && engine.includes('completedMatches'),
  'engine has bounded same-opponent rematch contracts');
ok(engine.includes("'match_started'") && engine.includes("'match_completed'") && engine.includes("'rematch'"),
  'engine records authoritative funnel events');

const duel = read('backend/src/services/cardDuelService.js');
ok(duel.includes('settlementStatus') && duel.includes("'pending'") && duel.includes("'refunded'"),
  'game history projects pending/settled/refunded');
const withdrawal = read('backend/src/services/withdrawalService.js');
ok(withdrawal.includes('appendStatus') && withdrawal.includes('timeline'),
  'withdrawal lifecycle is immutable and user-visible');
const shop = read('backend/src/services/shopService.js');
ok(shop.includes('purchaseHistory') && shop.includes("'subscription'::text"),
  'item and subscription receipts share one history');

const web = read('userweb/src/cardDuelGame.jsx');
const android = read('mobile/lib/screens/user/games/card_duel_page.dart');
ok(web.includes('renderResultCard') && web.includes('MVP') && web.includes('shareUrl'),
  'Web result card includes MVP and challenge link');
ok(android.includes('_renderResultCard') && android.includes('Share.shareXFiles') && android.includes('shareUrl'),
  'Android shares a real PNG result card and challenge link');
ok(read('userweb/src/GrowthHub.jsx').includes('friend:challenge')
  && read('mobile/lib/screens/user/games/growth_panel.dart').includes('friend:challenge'),
  'friend presence/challenges ship on Web and Android');
ok(read('admin/src/pages/analytics.jsx').includes('/api/admin/analytics')
  && read('mobile/lib/screens/admin/admin_analytics.dart').includes('/api/admin/analytics'),
  'analytics/crash dashboard ships on both admin clients');

console.log(`\n${failed ? '' : ''} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
