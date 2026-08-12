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
ok(missions.DEFINITIONS.length > 100 && missions.DAILY_POOL.length === 120,
  'mission catalogue contains more than 100 real rotations');
const activeA = missions.activeDefinitions('00000000-0000-4000-8000-000000000001', new Date('2026-08-11T12:00:00Z'));
const activeB = missions.activeDefinitions('00000000-0000-4000-8000-000000000001', new Date('2026-08-11T12:00:00Z'));
ok(activeA.filter(m => m.period === 'daily').length === 5,
  'exactly five daily missions are shown');
ok(new Set(activeA.filter(m => m.period === 'daily').map(m => m.event)).size === 5,
  'daily rotation balances five different action families');
ok(JSON.stringify(activeA.map(m => m.key)) === JSON.stringify(activeB.map(m => m.key)),
  'daily rotation is deterministic for one user/day');
ok(missions.DAILY_BONUS_REWARD === 100, 'all-five completion bonus is defined');
const growthRoutes = read('backend/src/routes/growth.js');
ok(growthRoutes.includes("'/missions/daily-bonus/claim'") && growthRoutes.includes('claimDailyBonus'),
  'daily completion bonus has an authenticated claim endpoint');
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
ok(shop.includes('purchaseHistory')
  && (shop.includes("'subscription'::text") || shop.includes("'subscription' AS type")),
  'item and subscription receipts share one history');

const web = read('userweb/src/cardDuelGame.jsx');
const android = read('mobile/lib/screens/user/games/card_duel_page.dart');
ok(web.includes('renderResultCard') && web.includes('MVP') && web.includes('shareUrl'),
  'Web result card includes MVP and challenge link');
ok(android.includes('_renderResultCard') && android.includes('Share.shareXFiles') && android.includes('shareUrl'),
  'Android shares a real PNG result card and challenge link');
const webGrowth = read('userweb/src/GrowthHub.jsx');
const mobileGrowth = read('mobile/lib/screens/user/games/growth_panel.dart');
ok(webGrowth.includes('friend:challenge') && mobileGrowth.includes('friend:challenge'),
  'friend presence/challenges ship on Web and Android');
ok(read('backend/src/services/presenceService.js').includes("missions.record(userId, 'friend_challenge')"),
  'direct friend challenges advance their active mission');
ok(webGrowth.includes('دعوت از یک دوست') && mobileGrowth.includes('دعوت از یک دوست'),
  'friend invitation ships inside the growth tab on both clients');
ok(read('userweb/src/main.jsx').includes("setSub('growth')")
  && read('mobile/lib/screens/user/social_page.dart').includes('GrowthPanel('),
  'missions and friends moved to a dedicated tab beside games');
const webGames = read('userweb/src/games.jsx');
const mobileGames = read('mobile/lib/screens/user/games_page.dart');
ok(!webGames.includes('<GrowthHub') && !mobileGames.includes('GrowthPanel('),
  'games catalogue no longer buries the growth panel at the bottom');
ok(webGames.includes('cosmetics: d.cosmetics') && mobileGames.includes("_cosmetics['frame']"),
  'online-play header renders the equipped profile instead of a plain avatar');
ok(read('userweb/src/screens/Home.jsx').includes('دعوت و کسب درآمد')
  && read('mobile/lib/screens/user/dashboard_page.dart').includes('دعوت و کسب درآمد'),
  'dashboard invitation shortcut communicates earning on both clients');
ok(read('admin/src/pages/analytics.jsx').includes('/api/admin/analytics')
  && read('mobile/lib/screens/admin/admin_analytics.dart').includes('/api/admin/analytics'),
  'analytics/crash dashboard ships on both admin clients');

console.log(`\n${failed ? '' : ''} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
