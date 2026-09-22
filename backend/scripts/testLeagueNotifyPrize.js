#!/usr/bin/env node
// اعلانِ پایانِ لیگ باید مبلغ را فقط از جایزهٔ واقعیِ پنل بگوید.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/services/leagueService.js'), 'utf8');
let pass = 0;
const fail = [];
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail.push(name); console.error(`  ✗ ${name}`); }
};

console.log('\n== اعلان لیگ بر اساس جایزهٔ پنل ==');
ok(/function winnerNotifyBody\(w\)/.test(src), 'تابع متن اعلان جدا شده است');
ok(/function defaultPrizeTable\(\) \{\s*return Array\.from\(\{ length: 10 \}/.test(src)
  && /amount: 0/.test(src.slice(src.indexOf('function defaultPrizeTable'), src.indexOf('function defaultPrizeTable') + 200)),
  'جدول پیش‌فرض مبلغ ساختگی ندارد');
ok(/const amount = Number\(w\?\.amount\) \|\| 0;/.test(src), 'مبلغ نامعتبر صفر می‌شود');
ok(/if \(amount > 0\)/.test(src.slice(src.indexOf('function winnerNotifyBody'))),
  'تومان فقط وقتی amount > 0 در متن می‌آید');
ok(/برای این رتبه جایزه‌ای در پنل تعیین نشده بود/.test(src),
  'بدون جایزه ادعای بردِ نقدی نمی‌شود');
ok(/const body = winnerNotifyBody\(w\);/.test(src), 'حلقهٔ اعلان از همین تابع می‌خواند');
ok(!/۵۰۰.?۰۰۰/.test(src.slice(src.indexOf('function winnerNotifyBody'), src.indexOf('function closeActiveSeason'))),
  'متن اعلان مبلغ ثابت ۵۰۰ هزار ندارد');

if (fail.length) {
  console.error(`\n${fail.length} شکست`);
  process.exit(1);
}
console.log(`\n${pass} بررسی گذشت`);
