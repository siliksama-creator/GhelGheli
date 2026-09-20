#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// هم‌گامیِ کشِ تنظیمات بینِ پروسه‌ها — تستِ گاردِ باگِ «فهرست برمی‌گردد به یکی»
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۲۹ شهریور): «باگ اساسی داره، حتی روی ۲ ماموریت قرار نمی‌گیره
// و لیست دوباره برمی‌گرده روی یکی.»
//
// ریشهٔ باگ روی سرورِ زنده پیدا و بازتولید شد:
//
//   • سرور پنج پروسه است (گرهِ بازی ۴۰۰۰ + چهار گرهِ HTTP ۴۰۰۱–۴۰۰۴) و
//     nginx بین‌شان round-robin می‌کند؛
//   • `opsConfig` مقدارها را در `Map` **درونِ همان پروسه** کش می‌کرد و
//     `set()` فقط کشِ همان پروسه را تازه می‌کرد؛
//   • نتیجهٔ بازتولید: PUT دو ماموریت → «۲ ماموریت ذخیره شد» ولی ۱۲ بار
//     GET → [1,1,1,1,2,1,1,1,1,2,1,1].
//
// این تست همان سناریو را بدونِ پنج پروسهٔ واقعی می‌سازد: با دو **نمونهٔ
// مستقل** از ماژول (هر `require` تازه = یک کشِ جدا، مثلِ یک پروسهٔ جدا) و
// یک `app_settings` جعلیِ مشترک.
//
// ⚠️ نکتهٔ مهم: `OPS_CACHE_TTL_MS` **قبل از** require ست می‌شود تا تست
//    مجبور نباشد چهار ثانیه منتظر بماند.

process.env.OPS_CACHE_TTL_MS = '600';

const path = require('path');

const db = require('../src/config/db');
const opsConfig = require('../src/services/opsConfig');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => {
  if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
/**
 * انتظار برای «گذشتنِ» عمرِ کش.
 *
 * ⚠️ سقف‌دار است: اگر روزی کسی TTL را خراب/بی‌نهایت کند، تست باید **قرمز**
 * شود نه اینکه ساعت‌ها معلق بماند (درسِ fail-testِ همین گارد).
 */
const PAST_TTL = () => sleep(Math.min(opsConfig.TTL_MS, 5000) + 150);
const SRC = require('fs').readFileSync(
  path.join(__dirname, '../src/services/opsConfig.js'), 'utf8');

// ── `app_settings` جعلی ────────────────────────────────────────────────
const rows = new Map();
let queries = 0;
db.pool.query = async (sql, params) => {
  queries++;
  if (/SELECT value FROM app_settings WHERE key=\$1/.test(sql)) {
    const key = params[0];
    return { rows: rows.has(key) ? [{ value: rows.get(key) }] : [] };
  }
  if (/SELECT key, value FROM app_settings WHERE key = ANY/.test(sql)) {
    return { rows: params[0].filter(k => rows.has(k)).map(k => ({ key: k, value: rows.get(k) })) };
  }
  if (/INSERT INTO app_settings/.test(sql)) {
    rows.set(params[0], JSON.parse(params[1]));
    return { rows: [] };
  }
  return { rows: [] };
};

/** نمونهٔ دومِ ماژول = «پروسهٔ دوم» (کشِ جدا، دیتابیسِ یکی). */
function secondProcess() {
  const mod = require.resolve('../src/services/opsConfig');
  const original = require.cache[mod];
  delete require.cache[mod];
  const other = require('../src/services/opsConfig');
  // نسخهٔ اول را سرِ جایش برگردان تا بقیهٔ تست‌ها همان را ببینند.
  require.cache[mod] = original;
  return other;
}

(async () => {
  console.log('== شکلِ ماژول ==');
  ok(opsConfig.TTL_MS >= 500 && opsConfig.TTL_MS <= 20000,
    `عمرِ مجازِ کش معقول است (${opsConfig.TTL_MS}ms)`);
  ok(typeof opsConfig.CHANNEL === 'string' && opsConfig.CHANNEL.length > 5,
    `کانالِ اعلان تعریف شده (${opsConfig.CHANNEL})`);
  ok(typeof opsConfig.invalidate === 'function',
    'راهِ تازه‌کردنِ یک کلید (همان کاری که پیامِ Redis می‌کند) بیرون داده شده');

  console.log('\n== سیم‌کشیِ اعلانِ بین‌پروسه‌ای (گاردِ متنی) ==');
  // بدونِ Redis در CI نمی‌شود pub/sub واقعی را سنجید؛ پس خودِ سیم‌کشی
  // سنجیده می‌شود تا کسی بی‌سروصدا حذفش نکند — همان درسی که کامنتِ
  // «سرور تک‌پروسه است» به ما داد.
  ok(/publish\(CHANNEL/.test(SRC), '`set()` تغییر را روی کانال منتشر می‌کند');
  ok(/subscribe\(CHANNEL\)/.test(SRC), 'هر پروسه به کانالِ تغییرات گوش می‌دهد');
  ok(/sub\.on\('message'/.test(SRC) && /invalidate\(String\(key\)\)/.test(SRC),
    'پیامِ رسیده کلید را از دیتابیس تازه می‌کند');
  ok(/Date\.now\(\) - m\.at < TTL_MS/.test(SRC),
    'گاردِ کهنگی (TTL) هست — تورِ ایمنی حتی اگر Redis بخوابد');
  // گاردِ ریشه: نسخهٔ قبلی می‌گفت «سرور تک‌پروسه است» و همین جمله باعث شد
  // کسی کشِ بین‌پروسه‌ای اضافه نکند. حالا واقعیت باید در خودِ ماژول نوشته
  // باشد و بازتولیدِ عددی‌اش هم آمده باشد.
  ok(/چندپروسه/.test(SRC) && /ghelgheli_http/.test(SRC),
    'واقعیتِ چندپروسه‌ای (پنج گره + upstreamِ nginx) در سندِ ماژول هست');
  ok(/\[1,1,1,1,2,1,1,1,1,2,1,1\]/.test(SRC),
    'عددِ بازتولیدِ باگ در سند هست تا کسی دوباره تک‌پروسه فرض نکند');

  console.log('\n== معنای قبلیِ syncGet حفظ شده ==');
  const before = queries;
  ok(opsConfig.syncGet('کلیدِ-ناموجود') === null, 'کلیدِ کش‌نشده null می‌دهد (فراخوان پیش‌فرض می‌زند)');
  await sleep(30);
  ok(queries > before, 'خواندنِ کلیدِ کش‌نشده یک تازه‌سازیِ پس‌زمینه می‌زند');

  console.log('\n== لایهٔ دوم: گاردِ TTL (بدونِ Redis) ==');
  await opsConfig.set('k1', { v: 1 });
  ok(opsConfig.syncGet('k1')?.v === 1, 'بلافاصله بعدِ نوشتن، مقدارِ تازه هست');
  // «پروسهٔ دیگر» مستقیم در دیتابیس می‌نویسد — همان اتفاقی که با پنلِ
  // دیگری روی پروسهٔ دیگری می‌افتد.
  rows.set('k1', { v: 2 });
  ok(opsConfig.syncGet('k1')?.v === 1, 'داخلِ پنجرهٔ TTL مقدارِ کش‌شده سرو می‌شود (مسیرِ داغ بلاک نمی‌شود)');
  await PAST_TTL();
  opsConfig.syncGet('k1');           // کهنه است → مقدارِ کهنه می‌دهد + تازه‌سازی می‌زند
  await sleep(40);
  ok(opsConfig.syncGet('k1')?.v === 2,
    '⚠️ بعد از TTL مقدارِ پروسهٔ دیگر خودش می‌آید (بدونِ Redis هم واگرایی جمع می‌شود)');

  console.log('\n== لایهٔ اول: اعلانِ لحظه‌ای (مسیرِ Redis) ==');
  rows.set('k1', { v: 3 });
  await opsConfig.invalidate('k1');
  ok(opsConfig.syncGet('k1')?.v === 3, 'پیامِ اعلان، مقدار را همان لحظه تازه می‌کند');

  console.log('\n== سناریوی واقعیِ باگ: دو «پروسه» و یک فهرست ==');
  const other = secondProcess();
  rows.set('فهرست', ['روبیکا']);
  await other.invalidate('فهرست');
  ok(JSON.stringify(other.syncGet('فهرست')) === '["روبیکا"]',
    'پروسهٔ دوم فهرستِ تک‌عضوی را می‌بیند');

  // ادمین از پنل، ماموریتِ دوم را اضافه و ذخیره می‌کند (روی «پروسهٔ اول»).
  await opsConfig.set('فهرست', ['روبیکا', 'اینستاگرام']);
  ok(JSON.stringify(opsConfig.syncGet('فهرست')).includes('اینستاگرام'),
    'پروسهٔ صاحبِ درخواست دو ماموریت را می‌بیند');
  ok(JSON.stringify(other.syncGet('فهرست')) === '["روبیکا"]',
    '⚠️ بازتولیدِ باگ: پروسهٔ دوم هنوز یکی می‌بیند (همان «برمی‌گرده روی یکی»)');

  // پیامِ Redis می‌رسد (همان چیزی که در تولید اتفاق می‌افتد).
  await other.invalidate('فهرست');
  ok(JSON.stringify(other.syncGet('فهرست')) === '["روبیکا","اینستاگرام"]',
    '✅ بعد از اعلان، پروسهٔ دوم هم هر دو ماموریت را می‌بیند');

  // و اگر پیام گم شود (Redis بخوابد)، TTL نجاتش می‌دهد.
  rows.set('فهرست', ['روبیکا', 'اینستاگرام', 'تلگرام']);
  await PAST_TTL();
  other.syncGet('فهرست');
  await sleep(40);
  ok(JSON.stringify(other.syncGet('فهرست')).includes('تلگرام'),
    'بدونِ اعلان هم TTL فهرست را به روز می‌کند');

  console.log('\n== خرابیِ دیتابیس نباید مقدارِ سالم را دور بریزد ==');
  // اول کاری کن کشِ همین پروسه با دیتابیس هم‌مقدار شود (خارج از پنجرهٔ TTL
  // یک تازه‌سازیِ پس‌زمینه در جریان می‌ماند و نتیجه را نامعین می‌کند).
  await opsConfig.invalidate('فهرست');
  const healthy = opsConfig.syncGet('فهرست');
  const realQuery = db.pool.query;
  db.pool.query = async () => { throw new Error('db down'); };
  await PAST_TTL();
  let threw = false;
  let last = null;
  try { last = opsConfig.syncGet('فهرست'); } catch { threw = true; }
  ok(!threw, 'syncGet با دیتابیسِ خوابیده throw نمی‌کند');
  ok(JSON.stringify(last) === JSON.stringify(healthy),
    'آخرین مقدارِ سالم سرو می‌شود (کش با خطای دیتابیس دور ریخته نمی‌شود)');
  db.pool.query = realQuery;

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
