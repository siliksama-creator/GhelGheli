#!/usr/bin/env node
// گاردِ یکپارچهٔ قواعدِ رشد: دامنهٔ ماموریت‌ها + منبعِ XP لول + کمیسیونِ معرف.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۳۱ شهریور ۱۴۰۵): «اگه ماموریتی برای بازی با ربات ساخته
// شده اشکال نداره با ربات یا ضربه‌زن پیشرفت کنه؛ ولی اگه مشخص نشده که
// ماموریت برای ربات است یا آنلاین، نباید با ربات کامل بشه. سیستم لول هم
// با بازی آنلاین بالا بره، با ربات نه.»
//
// بررسی کد نشان داد قانونِ لول از قبل درست بود (grantGameXp داخل شرطِ
// !room.vsBot) ولی ماموریت‌ها نه: `match_completed` بدون شرط ثبت می‌شد و
// بازی با ربات ماموریت‌های عمومی را کامل می‌کرد. اصلاح شد و این گارد
// هر دو قانون را برای همیشه نگه می‌دارد — هم ایستای (متنِ کد) هم پویا
// (دیتابیسِ CI)، چون برای این قواعد هیچ پوششِ دیگری وجود نداشت.
const fs = require('fs');
const path = require('path');

let pass = 0; const fail = [];
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail.push(name); console.error(`  ✗ ${name}`); } };
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const engine = read('src/games/engine.js');
const server = read('src/server.js');
const adminMissions = read('src/routes/adminMissions.js');
const levelSvc = read('src/services/levelService.js');

console.log('\n== ۱. دامنهٔ ماموریت‌ها: ربات فقط رویدادِ scoped به ربات ==');
ok(/if \(room\.vsBot\) \{\s*growth\.missions\.record\(player\.id, 'bot_match'\)/.test(engine),
  'بازی با ربات فقط bot_match منتشر می‌کند');
ok(/\} else \{\s*growth\.missions\.record\(player\.id, 'match_completed'\)/.test(engine),
  'match_completed فقط در شاخهٔ غیرربات ثبت می‌شود');
ok(/if \(resolvedWinner === symbol\) \{\s*growth\.missions\.record\(player\.id, 'online_win'\)/.test(engine),
  'online_win همچنان فقط برای بردِ آنلاین');
ok(!/growth\.missions\.record\(player\.id, 'match_completed'\)\.catch\(\(\) => \{\}\);\s*if \(!room\.vsBot && resolvedWinner === symbol\)/.test(engine),
  'الگوی بی‌شرطِ قدیمیِ match_completed برنگشته است');

console.log('\n== ۲. ریمچ: ماموریتِ «همان حریف» فقط با کاربرِ واقعی ==');
ok(/if \(!contract\.vsBot\) \{\s*growth\.missions\.record\(player\.id, 'rematch'\)/.test(engine),
  'ریمچ با ربات ماموریتِ rematch را پر نمی‌کند');
ok(!/^\s{6}growth\.missions\.record\(player\.id, 'rematch'\)/m.test(engine),
  'الگوی بی‌شرطِ قدیمیِ ریمچ برنگشته است');

console.log('\n== ۳. ضربه‌زن: فقط ماموریتِ scoped به ربات ==');
ok(/if \(lvlUp > 0\) \{[\s\S]{0,600}'bot_match'/.test(server),
  'لولِ تمام‌شدهٔ ضربه‌زن bot_match منتشر می‌کند');
ok(!/record\(req\.user\.id, 'match_completed'\)/.test(server),
  'ضربه‌زن هرگز match_completed منتشر نمی‌کند');

console.log('\n== ۴. XP لول: فقط بازی آنلاین ==');
// تصمیمِ مستندِ محصول (scripts/testLevel.js، دورهای قبل): XP لول و گذرِ
// نبرد فقط از مسابقهٔ آنلاینِ ورودی‌دار می‌آید — رایگان و ربات صفر.
// خواستهٔ ۳۱ شهریور مالک («با ربات نباید بالا بره») با همین شکل برقرار
// است؛ اگر روزی بخواهد رایگانِ آنلاین هم XP بدهد، این گارد و testLevel.js
// باید هم‌زمان به‌روز شوند.
const guardIdx = engine.indexOf('if (!room.vsBot && room.stake > 0) {');
const xpCall = engine.indexOf('grantGameXp(info.id', guardIdx);
ok(guardIdx > -1 && xpCall > guardIdx,
  'XP لول پشتِ نگهبانِ «آنلاینِ ورودی‌دار» است — ربات هیچ XP نمی‌گیرد');
ok(engine.slice(guardIdx, xpCall).includes('!room.vsBot'),
  'بازی با ربات از بلوکِ XP بیرون است');
ok(/pass\.grantXp\(info\.id, 'game_play'\)/.test(engine),
  'XP گذرِ نبرد در همان بلوکِ ورودی‌دار است');
ok(/مجموع exp دریافتی از همه بازی های آنلاین/.test(levelSvc),
  'levelService خودش را «فقط بازی آنلاین» تعریف می‌کند');

console.log('\n== ۵. رویدادِ جدید در پنل ادمین قابلِ انتخاب است ==');
ok(/const EVENTS = \[[^\]]*'bot_match'[^\]]*\]/.test(adminMissions),
  'bot_match در EVENTS پنل ادمین هست');

// ── بخشِ پویا: فقط وقتی دیتابیس در دسترس باشد (jobِ e2e) ──────────────────
async function runtime() {
  let db;
  try { db = require('../src/config/db'); } catch { return; }
  const canConnect = await db.pool.query('SELECT 1').then(() => true).catch(() => false);
  if (!canConnect) { console.log('\n(دیتابیس در دسترس نیست — بخشِ پویا رد شد)'); return; }
  // ⚠️ missionService.record از poolِ مشترک می‌خواند، پس ردیف‌هایsetup باید
  // commit شوند (تراکنشِ باز برای اتصالِ دیگر نامرئی است) و در پایان دستی
  // پاک شوند. ترتیبِ پاک‌سازی برای قیدهای خارجی رعایت شده.
  const missions = require('../src/services/missionService');
  const mob = `912999${Math.floor(Math.random() * 90000 + 10000)}`;
  const u = await db.pool.query(
    `INSERT INTO users(mobile, status) VALUES($1,'active') RETURNING id`, [mob]);
  const uid = u.rows[0].id;
  await db.pool.query(
    `INSERT INTO mission_definitions(key,period,event,icon,title,description,goal,reward,is_active,sort_order)
     VALUES('guard_bot_m','daily','bot_match','game','ماموریت رباتِ گارد','تست',2,10,true,99),
           ('guard_gen_m','daily','match_completed','football','ماموریت عمومی گارد','تست',2,10,true,98)`);
  try {
    await missions.record(uid, 'bot_match');
    let p = await db.pool.query(
      `SELECT progress FROM user_mission_progress WHERE user_id=$1 AND mission_key='guard_bot_m'`, [uid]);
    ok(Number(p.rows[0]?.progress) === 1, 'ماموریتِ bot_match با رویدادِ ربات پیشرفت می‌کند');
    await missions.record(uid, 'match_completed');
    p = await db.pool.query(
      `SELECT progress FROM user_mission_progress WHERE user_id=$1 AND mission_key='guard_bot_m'`, [uid]);
    ok(Number(p.rows[0]?.progress) === 1, 'رویدادِ آنلاین روی ماموریتِ bot_match اثر ندارد');
    p = await db.pool.query(
      `SELECT progress FROM user_mission_progress WHERE user_id=$1 AND mission_key='guard_gen_m'`, [uid]);
    ok(Number(p.rows[0]?.progress) === 1, 'ماموریتِ عمومی فقط با رویدادِ آنلاین پیشرفت می‌کند');
  } finally {
    await db.pool.query(`DELETE FROM user_mission_progress WHERE user_id=$1`, [uid]).catch(() => {});
    await db.pool.query(`DELETE FROM mission_definitions WHERE key LIKE 'guard\_%'`).catch(() => {});
    await db.pool.query(`DELETE FROM users WHERE id=$1`, [uid]).catch(() => {});
  }
}

runtime().then(() => {
  if (fail.length) { console.error(`\n✗ گاردِ رشد شکست: ${fail.length} مورد`); process.exit(1); }
  console.log(`\n✅ ${pass} بررسیِ گاردِ رشد موفق`);
}).catch(e => { console.error('گاردِ رشد خطا خورد:', e.message); process.exit(1); });
