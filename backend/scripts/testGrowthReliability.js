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
const growthRoutes = read('backend/src/routes/growth.js');
ok(growthRoutes.includes("'/missions/daily-bonus/claim'") && growthRoutes.includes('claimDailyBonus'),
  'daily completion bonus has an authenticated claim endpoint');
ok(missions.periodKey('daily', new Date('2026-08-11T12:00:00Z')) === '2026-08-11',
  'mission day follows Tehran civil date');

const engine = read('backend/src/games/engine.js');
// نگهبانِ قدیمی «ثابت ۲۵ ثانیه» بود؛ حالا پنجرهٔ اتصال زنده است — نگهبان
// جدید همان قصد را می‌پرسد: موتور پنجره‌ای برای قطع‌های کوتاه دارد و
// 'game:resume' را می‌شنود.
ok(engine.includes('reconnectWindowMs = () =>') && engine.includes("'game:resume'"),
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
// ⚠️ نامِ API نباید سفت‌وسخت باشد: share_plus ۱۳ کلاسِ `Share` را منسوخ
//    کرد و `SharePlus.instance.share(ShareParams(files: ...))` را
//    جایگزینش کرد. ارتقا لازم بود چون نسخهٔ ۱۰ هنوز Kotlin Gradle Plugin
//    را خودش اعمال می‌کرد و بیلد هشدارِ KGP می‌داد.
//
//    چیزی که واقعاً اهمیت دارد این است که «فایلِ تصویر به اشتراک گذاشته
//    می‌شود»، نه اینکه با کدام امضا. هر دو شکل پذیرفته می‌شود تا ارتقای
//    بعدیِ پکیج این تست را بی‌دلیل قرمز نکند.
const sharesFile = android.includes('Share.shareXFiles')
  || (android.includes('SharePlus.instance.share') && android.includes('files:'));
ok(android.includes('_renderResultCard') && sharesFile && android.includes('shareUrl'),
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

// ── بند ۶الف/۶بِ ممیزیِ مستقلِ دوم: ایندکسِ جدول‌های پرترافیک و
//    هرسِ analytics_events. مایگریشن ۰۸۱ باید هر دو ایندکسِ جدید را
//    بسازد و کارِ زمان‌بندی‌شدهٔ هرس باید در سرور با خطاگیریِ امن
//    ثبت شده باشد (همان الگوی هرس‌های موجود).
const idxMigration = read('backend/migrations/081_hot_table_indexes.sql');
ok(idxMigration.includes('CREATE INDEX IF NOT EXISTS idx_wheel_spins_day')
  && idxMigration.includes('ON wheel_spins(spun_day)'),
  'hot-table migration indexes the wheel day column');
ok(idxMigration.includes('CREATE INDEX IF NOT EXISTS idx_analytics_created_at'),
  'hot-table migration indexes analytics created_at for the pruner');
const analyticsSrc = read('backend/src/services/analyticsService.js');
ok(analyticsSrc.includes('async function pruneOld') && analyticsSrc.includes('keepDays = 90'),
  'analytics service prunes old events with a 90-day floor');
const serverSrc = read('backend/src/server.js');
ok(serverSrc.includes('analytics.pruneOld(90)')
  && serverSrc.includes('[analytics] event prune failed'),
  'server schedules the analytics prune with safe error handling');

// ── ارتقای صندوقِ خطا (مایگریشن ۰۸۶): پلتفرمِ «ادمین»، گزارشِ مهمان،
//    و هرسِ خودکارِ کرش‌ها. پنل ادمین وب پیش از این خطاهایش را نمی‌فرستاد
//    و CHECK روی platform مقدار 'admin' را رد می‌کرد.
const crashMigration = read('backend/migrations/086_admin_crash_reporting.sql');
ok(crashMigration.includes("'admin'")
  && crashMigration.includes('app_crash_reports_platform_check'),
  'migration 086 allows the admin platform in crash reports');
ok(analyticsSrc.includes("'backend', 'web', 'admin', 'android', 'ios', 'unknown'"),
  'analytics crash platform set includes admin');
ok(analyticsSrc.includes('async function pruneCrashes')
  && analyticsSrc.includes("status <> 'open'")
  && analyticsSrc.includes('keepDays = 180'),
  'analytics service prunes only closed crash reports older than 180 days');
ok(serverSrc.includes('analytics.pruneCrashes(180)')
  && serverSrc.includes('[analytics] crash prune failed'),
  'server schedules the crash-report prune with safe error handling');
ok(serverSrc.includes('async function authOptional'),
  'server provides an optional-auth middleware for guest crash reports');
ok(growthRoutes.includes("router.post('/telemetry/crash', authOptional, crashLimiter")
  && growthRoutes.includes('guest: !req.user'),
  'crash route accepts guests (authOptional) and tags them');
const adminMonitor = read('admin/src/lib/errorMonitor.js');
ok(adminMonitor.includes("platform: 'admin'")
  && adminMonitor.includes('/api/telemetry/crash')
  && adminMonitor.includes('installAdminErrorMonitor'),
  'admin panel ships a global error monitor that reports to the crash inbox');


// چرخشِ ماموریت از زمانِ اتصالِ ماموریت‌های سفارشی به دیتابیس async شد؛
// این دو سنجهٔ تعیّن‌گرایی باید await شوند (در CI دیتابیسی نیست و
// customDefinitions با fail-soft لیستِ خالی برمی‌گرداند — چرخشِ پایه
// باید همان ۵ ماموریتِ روزانهٔ تعیّن‌گرا را بدهد).
(async () => {
  const activeA = await missions.activeDefinitions('00000000-0000-4000-8000-000000000001', new Date('2026-08-11T12:00:00Z'));
  const activeB = await missions.activeDefinitions('00000000-0000-4000-8000-000000000001', new Date('2026-08-11T12:00:00Z'));
  ok(activeA.filter(m => m.period === 'daily').length === 5,
    'exactly five daily missions are shown');
  ok(new Set(activeA.filter(m => m.period === 'daily').map(m => m.event)).size === 5,
    'daily rotation balances five different action families');
  ok(JSON.stringify(activeA.map(m => m.key)) === JSON.stringify(activeB.map(m => m.key)),
    'daily rotation is deterministic for one user/day');
  ok(missions.DAILY_BONUS_REWARD === 100, 'all-five completion bonus is defined');

  console.log(`\n${failed ? '' : ''} ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
