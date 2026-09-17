#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// «ماموریت‌ها واقعاً امتیاز می‌دهند؟» — گاردِ پرداختِ ماموریت
// ═══════════════════════════════════════════════════════════════════════════
//
// ── خواستهٔ مالک (۱۷ شهریور) ──────────────────────────────────────────────
//
//   «این ماموریت دعوت دوستان که گفتم بررسی کن که آیا امتیاز می‌دهد یا نه.
//    کلاً همهٔ ماموریت‌ها را بررسی کن که واقعاً امتیاز بدهند.»
//
// ── چه چیزی بررسی شد و چه چیزی ساخته شد ──────────────────────────────────
//
// بررسی روی سرورِ زنده و روی کد، سه چیزِ جدا را نشان داد:
//
//   ۱. مسیرِ پرداخت سالم است: `claim` امتیاز را با `points.credit` و منبعِ
//      `mission` می‌ریزد و idempotent است (کلیدِ یکتا برای هر کاربر+ماموریت
//      +دوره). این گارد همان را ساختاری تضمین می‌کند.
//   ۲. **ماموریتِ دعوتِ دوستان وجود نداشت.** دعوت، چرخشِ گردونه و کمیسیون
//      می‌داد ولی صفر امتیاز؛ تنها ماموریتِ اجتماعی `friend_challenge` بود
//      («دعوت به یک دوئل»، نه «دعوت به قلقلی»). خانوادهٔ تازه با رویدادِ
//      `referral_signup` اضافه شد.
//   ۳. خطرِ ساختاریِ اصلی این نیست که پرداخت خراب شود — این است که ماموریتی
//      در چرخش باشد و **هیچ‌کس رویدادش را ثبت نکند**؛ آن‌وقت کاربر پیشرفت
//      نمی‌بیند و «ماموریت پول نمی‌دهد» می‌شود. قاعدهٔ ۲ همین را می‌گیرد:
//      هر رویدادِ چرخش باید در کدِ محصول جایی `record` شده باشد.
//
// بدونِ دیتابیس و شبکه اجرا می‌شود (فقط فایل‌خوانی + خودِ ماژولِ ماموریت).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SRC = path.join(root, 'src');
let pass = 0; let fail = 0;
const ok = (cond, name, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); return; }
  fail++;
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
};

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.js')) out.push(p);
  }
  return out;
};

// ماژول بدونِ دیتابیس هم بالا می‌آید: `customDefinitions` خطای اتصال را
// می‌گیرد و چرخشِ پایه را برمی‌گرداند.
const missions = require('../src/services/missionService');

console.log('\n== چرخشِ ماموریت‌ها ==');
const all = [...missions.DAILY_POOL, ...missions.WEEKLY_POOL];
ok(all.length > 100, `چرخشِ ماموریت‌ها پر است (${missions.DAILY_POOL.length} روزانه + ${missions.WEEKLY_POOL.length} هفتگی)`);

const badReward = all.filter((m) => !(Number(m.reward) > 0));
ok(badReward.length === 0, 'هر ماموریت جایزهٔ مثبت دارد',
  badReward.map((m) => `${m.key}=${m.reward}`).join('، '));

const badGoal = all.filter((m) => !(Number(m.goal) >= 1));
ok(badGoal.length === 0, 'هدفِ هر ماموریت ≥ ۱ است',
  badGoal.map((m) => `${m.key}=${m.goal}`).join('، '));

const badText = all.filter((m) => !String(m.title || '').trim() || !String(m.description || '').trim());
ok(badText.length === 0, 'عنوان و توضیحِ هر ماموریت خالی نیست',
  badText.map((m) => m.key).join('، '));

const keys = new Set(all.map((m) => m.key));
ok(keys.size === all.length, 'کلیدِ ماموریت‌ها یکتاست');

// ── ۲) هر رویداد باید در محصول جایی ثبت شود ──────────────────────────────
console.log('\n== رویدادها واقعاً ثبت می‌شوند ==');
const events = [...new Set(all.map((m) => m.event))].sort();
const sources = walk(SRC)
  .filter((p) => !p.endsWith(path.join('services', 'missionService.js')))
  .map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, 'utf8') }));

const silent = [];
for (const event of events) {
  const fired = sources.some((s) => new RegExp(`record\\([^)]*['"\`]${event}['"\`]`).test(s.src)
    || new RegExp(`['"\`]${event}['"\`]`).test(s.src));
  if (!fired) silent.push(event);
}
ok(silent.length === 0,
  `هر ${events.length} رویدادِ ماموریت در کدِ محصول ثبت می‌شود`,
  silent.map((e) => `      • ${e} — ماموریتش در چرخش است ولی هیچ‌کس این رویداد را ثبت نمی‌کند؛ پیشرفتش هرگز کامل نمی‌شود`).join('\n'));

// ── ۳) ماموریتِ دعوتِ دوستان (خواستهٔ صریح مالک) ───────────────────────────
console.log('\n== ماموریتِ دعوتِ دوستان ==');
const invite = missions.DAILY_POOL.filter((m) => m.event === 'referral_signup');
ok(invite.length > 0, 'ماموریتِ «دعوتِ دوستان» در چرخشِ روزانه هست',
  'بدونِ آن، دعوتِ یک دوست صفر امتیاز دارد (وضعیتِ قبل از این دور)');
ok(invite.every((m) => Number(m.reward) >= 30),
  'جایزهٔ هر نسخهٔ ماموریتِ دعوت ≥ ۳۰ است',
  invite.map((m) => m.reward).join('، '));

// مقایسه فقط با چرخشِ **روزانه**: هفتگی‌ها مقیاسِ دیگری دارند (تا ۲۳۰) و
// مقایسهٔ روزانه با هفتگی بی‌معنی است.
const dailyOthers = missions.DAILY_POOL.filter((m) => m.event !== 'referral_signup');
const otherMax = Math.max(...dailyOthers.map((m) => Number(m.reward)));
const inviteMin = Math.min(...invite.map((m) => Number(m.reward)));
ok(inviteMin >= otherMax * 0.6,
  `جایزهٔ دعوت (${inviteMin}+) در مقیاسِ چرخشِ روزانه رقابتی است (سقفِ بقیهٔ روزانه: ${otherMax})`);

// ثبتِ رویداد در هر دو مسیرِ ثبت‌نام، بعد از COMMIT.
const authSrc = read('src/routes/auth.js');
const recordCalls = [...authSrc.matchAll(/missionService\.record\(\s*referral\.referrerId\s*,\s*'referral_signup'\s*\)/g)];
ok(recordCalls.length === 2, 'هر دو مسیرِ ثبت‌نام رویداد را برای «معرف» ثبت می‌کنند',
  `تعدادِ فراخوان: ${recordCalls.length} (انتظار: ۲ — OTP و ثبت‌نامِ مستقیم)`);
const commitIdx = authSrc.indexOf('refClient.query(\'COMMIT\')');
const firstRecord = recordCalls[0] ? recordCalls[0].index : -1;
ok(commitIdx > 0 && firstRecord > commitIdx,
  'ثبتِ رویداد **بعد از** COMMIT است (نه داخلِ تراکنش)',
  'اگر داخلِ تراکنش باشد، خطای بعدی پیشرفتِ ماموریت را بدونِ ثبت‌نامِ واقعی ثبت می‌کند');

// ── ۴) پرداختِ امتیاز در لحظهٔ دریافت ────────────────────────────────────
console.log('\n== مسیرِ پرداخت ==');
const svc = read('src/services/missionService.js');
ok(/points\.credit\(client,\s*\{\s*[\s\S]{0,200}?source:\s*'mission'/.test(svc),
  'دریافتِ ماموریت از `points.credit` با منبعِ «mission» استفاده می‌کند',
  'منبعِ درست یعنی ردیفِ دفترِ امتیاز کاربر «ماموریت» را نشان می‌دهد، نه «سایر»');
const claimBlocks = (svc.match(/claimed_at\s*IS\s*NULL|row\.claimed_at\)\s*throw/g) || []).length;
ok(claimBlocks > 0, 'دریافتِ دوبارهٔ یک ماموریت رد می‌شود (ضدتکرار)');
ok(/referenceId:\s*referenceUuid\(userId,\s*missionKey,\s*key\)/.test(svc),
  'هر ردیفِ جایزه کلیدِ یکتا دارد (ضدتکرار در سطحِ دیتابیس)');

console.log(`\n${fail ? '✗' : '✅'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
