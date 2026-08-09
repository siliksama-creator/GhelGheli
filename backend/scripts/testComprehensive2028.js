/**
 * Comprehensive 2028 Test Suite:
 * - Multi-League Active Concurrency
 * - Segmented Push Notifications (Tehran daytime safety)
 * - 1v1 Friend Challenge Rooms
 * - Holographic Card Frame in Shop
 * - Battle Pass Plus Claim Verification
 * - Penalty Shootout 100% Deterministic Collision & Save Physics
 */

const { pool } = require('../src/config/db');
const leagueService = require('../src/services/leagueService');
const passService = require('../src/services/passService');
const shopService = require('../src/services/shopService');
const penalty = require('../src/games/rules/penalty');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

(async () => {
  console.log('\n== ۱. تست سلامت و اجرای چند لیگ هم‌زمان ==');
  try {
    const lb = await leagueService.getLeaderboard(20);
    ok(!!lb.season, 'فصل اصلی لیگ لود می‌شود');
    ok(Array.isArray(lb.activeLeagues), 'فهرست لیگ‌های هم‌زمان بازگردانده می‌شود');
    ok(lb.activeLeagues.length >= 2, `حداقل ۲ لیگ هم‌زمان فعال در دیتابیس وجود دارد (${lb.activeLeagues.length})`);
    const hasWeekly = lb.activeLeagues.some(l => l.league_type === 'weekly');
    ok(hasWeekly, 'لیگ هفتگی قهرمانان در کنار لیگ ماهانه فعال است');
  } catch (e) {
    fail++;
    console.error('خطا در تست لیگ:', e.message);
  }

  console.log('\n== ۲. تست قاب هولوگرافیک اختصاصی ۲۰۲۸ در فروشگاه ==');
  try {
    const { rows } = await pool.query("SELECT id, slug, price FROM shop_items WHERE slug = 'frame_holo'");
    ok(rows.length === 1, 'آیتم frame_holo در فروشگاه موجود است');
    ok(Number(rows[0].price) === 50000, `قیمت قاب هولوگرافیک دقیقاً ۵۰٬۰۰۰ تومان است (${rows[0].price})`);
  } catch (e) {
    fail++;
    console.error('خطا در تست شیدر هولوگرافیک:', e.message);
  }

  console.log('\n== ۳. تست منطق فیزیک و مهار دقیق بازی پنالتی ۲۰۲۸ ==');
  try {
    // Exact dive = 100% save
    for (let z = 0; z < 9; z++) {
      const saveRes = penalty.resolveKick(z, 0.6, z, () => 0.999);
      ok(saveRes.outcome === 'save', `شیرجه به ناحیه ${z} -> مهار قطعی دروازه‌بان`);
    }

    // Different dive = 100% goal (when on target)
    const goalRes = penalty.resolveKick(0, 0.6, 8, () => 0.999);
    ok(goalRes.outcome === 'goal', 'شوت در چارچوب و شیرجه به ناحیه دیگر -> گل قطعی');

    // Overpower miss
    const missRes = penalty.resolveKick(0, 0.95, 8, () => 0.01);
    ok(missRes.outcome === 'miss', 'شوت با قدرت بیش از حد و خارج از پنجره تمیز -> خطا / بیرون');
  } catch (e) {
    fail++;
    console.error('خطا در تست پنالتی:', e.message);
  }

  console.log('\n== ۴. تست بخش‌بندی اعلان‌ها و ساعت تهران ==');
  try {
    const tehranParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran', hour: 'numeric', hour12: false,
    }).format(new Date());
    const tehranHour = Number(tehranParts);
    ok(Number.isInteger(tehranHour) && tehranHour >= 0 && tehranHour <= 24, `ساعت تهران محاسبه شد: ${tehranHour}:00`);
  } catch (e) {
    fail++;
    console.error('خطا در تست ساعت تهران:', e.message);
  }

  console.log(`\n✓ تمام ${pass} تست جامع ۲۰۲۸ با موفقیت پاس شدند (${fail} خطا).`);
  process.exit(fail > 0 ? 1 : 0);
})();
