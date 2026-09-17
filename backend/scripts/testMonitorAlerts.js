#!/usr/bin/env node
/**
 * گاردِ «مسیرِ هشدار» — ۲۶ شهریور.
 *
 * ── داستانِ باگی که این گارد برایش نوشته شد ──────────────────────────────
 *
 * فایلِ تنظیماتِ تلگرامِ سرور مقدارها را در کوتیشن نگه می‌دارد:
 *
 *     TELEGRAM_BOT_TOKEN="88154..."
 *
 * ولی نگهبانِ سلامت با `cut -d= -f2-` می‌خواندش، یعنی **با کوتیشن**.
 * نتیجه: آدرسِ API می‌شد `/bot"88154..."/sendMessage` → تلگرام ۴۰۴.
 *
 * این باگ *بی‌صدا* بود، چون نگهبان فقط وقتی پیام می‌فرستد که چیزی خراب شده
 * باشد. یعنی روزِ اولی که واقعاً لازم بود hشدار برسد (سرور خوابیده، نصفِ
 * شب)، هیچ پیامی نمی‌رسید و کسی هم نمی‌فهمید چرا. مسیرِ هشدارِ خراب از
 * نداشتنِ هشدار بدتر است: آدم خیالش راحت است که پشتش گرم است.
 *
 * این تست سه چیز را قفل می‌کند:
 *   ۱. خواندنِ تنظیمات از تابعِ مشترک انجام می‌شود (کوتیشن‌ها تحمل می‌شوند).
 *   ۲. هیچ‌کدام از نگهبان‌ها دوباره `cut -d= -f2-` خام روی توکن نگذارند.
 *   ۳. نگهبانِ حمله، روی یک لاگِ ساختگیِ حمله واقعاً هشدار بدهد و روی
 *      ترافیکِ عادی ساکت بماند (یعنی «همیشه هشدار می‌دهد» هم نباشد).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); } else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};

const ROOT = path.join(__dirname, '..', '..');
const READ = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const helper = READ('monitor/lib/telegram.sh');
const health = READ('monitor/health.sh');
const attack = READ('monitor/attack-watch.sh');

console.log('\n══ ۱) خواندنِ تنظیمات: کوتیشن و فاصله باید تحمل شوند ══');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tgalert-'));
  const quoted = path.join(tmp, 'quoted.conf');
  const plain = path.join(tmp, 'plain.conf');
  fs.writeFileSync(quoted, 'TELEGRAM_BOT_TOKEN="8815470000:AAQuotedToken"\nTELEGRAM_CHAT_ID="2129712345"\n');
  fs.writeFileSync(plain, 'TELEGRAM_BOT_TOKEN=PlainToken\nTELEGRAM_CHAT_ID=   999   \n');

  const ask = (file, key) => execFileSync('bash', ['-c',
    `source "${path.join(ROOT, 'monitor/lib/telegram.sh')}"; tg_conf_get "$1" "$2"`,
    'bash', file, key], { encoding: 'utf8' });

  ok('مقدارِ داخلِ کوتیشن بدونِ کوتیشن برگردانده می‌شود',
    ask(quoted, 'TELEGRAM_BOT_TOKEN') === '8815470000:AAQuotedToken',
    `خروجی: ${JSON.stringify(ask(quoted, 'TELEGRAM_BOT_TOKEN'))}`);
  ok('شناسهٔ چتِ داخلِ کوتیشن هم بدونِ کوتیشن است',
    ask(quoted, 'TELEGRAM_CHAT_ID') === '2129712345');
  ok('مقدارِ بدونِ کوتیشن دست‌نخورده می‌ماند',
    ask(plain, 'TELEGRAM_BOT_TOKEN') === 'PlainToken');
  ok('فاصلهٔ اضافه دورِ مقدار بریده می‌شود',
    ask(plain, 'TELEGRAM_CHAT_ID') === '999',
    `خروجی: ${JSON.stringify(ask(plain, 'TELEGRAM_CHAT_ID'))}`);
  ok('فایلِ ناموجود خطا نمی‌دهد (خروجیِ خالی)',
    ask(path.join(tmp, 'nope.conf'), 'TELEGRAM_BOT_TOKEN') === '');

  // تمیزکاری
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\n══ ۲) نگهبان‌ها فقط از همان تابعِ مشترک بخوانند ══');
{
  ok('کمکیِ مشترک وجود دارد و تابعِ خواندن را می‌دهد', /tg_conf_get\(\)/.test(helper));
  ok('کمکی، خطای تلگرام را هم برمی‌گرداند (سکوتِ محض ممنوع)',
    /"ok":true/.test(helper) && /tg_send_message\(\)/.test(helper));
  for (const [name, src] of [['monitor/health.sh', health], ['monitor/attack-watch.sh', attack]]) {
    ok(`${name} کمکی را بارگذاری می‌کند`, /source\s+"\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)\/lib\/telegram\.sh"/.test(src));
    ok(`${name} مقدارها را با tg_conf_get می‌خواند`, /tg_conf_get\s+"\$conf"|tg_conf_get\s+"\$TG_CONF"/.test(src));
    // ⚠️ دقیقاً همان الگوی باگ‌دار: خواندنِ مستقیمِ مقدار از فایلِ تنظیمات.
    // کامنت‌ها اول حذف می‌شوند: توضیحِ خودِ همین باگ داخلِ health.sh نوشته
    // شده و در نسخهٔ اولِ این تست، متنِ کامنت را «کدِ خراب» شمرد (تستِ خودش
    // را قرمز کرد). کد را می‌سنجیم، حرف را نه.
    const codeOnly = src.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    const raw = codeOnly.split('\n').filter(l => /TELEGRAM_(BOT_TOKEN|CHAT_ID)=/.test(l) && /cut -d= -f2-/.test(l));
    ok(`${name} دیگر کوتیشنِ تلگرام را خام نمی‌خواند`, raw.length === 0, raw.join(' | '));
  }
  ok('نگهبانِ حمله دلیلِ شکستِ ارسال را در لاگ می‌نویسد',
    /telegram send failed: \$\{err/.test(attack),
    '«send failed»ِ بی‌توضیح یعنی یک ساعت عیب‌یابی');
}

console.log('\n══ ۳) نگهبانِ حمله: روی حمله هشدار بدهد، روی ترافیکِ عادی ساکت بماند ══');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attackwatch-'));
  const mk = (file, lines) => fs.writeFileSync(file, lines.join('\n') + '\n');
  const stamp = (secAgo) => {
    const d = new Date(Date.now() - secAgo * 1000);
    const pad = n => String(n).padStart(2, '0');
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    return `${pad(d.getDate())}/${mon}/${d.getFullYear()}:${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const flood = [];
  for (let i = 0; i < 400; i += 1) {
    flood.push(`203.0.113.7 - - [${stamp(i % 50)} +0330] "GET /api/config HTTP/1.1" 429 100 "-" "bot"`);
  }
  const calm = [];
  for (let i = 0; i < 30; i += 1) {
    calm.push(`198.51.100.${i} - - [${stamp(i % 59)} +0330] "GET /api/config HTTP/1.1" 200 100 "-" "app"`);
  }
  const floodLog = path.join(tmp, 'flood.log');
  const calmLog = path.join(tmp, 'calm.log');
  mk(floodLog, flood);
  mk(calmLog, calm);

  const runWatch = (logFile, stateFile) => execFileSync('bash',
    [path.join(ROOT, 'monitor/attack-watch.sh'), '--dry-run'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        LOG_FILE: logFile,
        STATE_FILE: stateFile,
        STATE_LOG: path.join(tmp, 'watch.log'),
      },
    });

  const outFlood = runWatch(floodLog, path.join(tmp, 'state-flood'));
  ok('روی موجِ ۴۲۹ هشدار می‌دهد', /سقفِ ضدِربات فعال شد/.test(outFlood));
  ok('آی‌پیِ پرترافیک را نام می‌برد', /203\.0\.113\.7/.test(outFlood));
  ok('در متنِ هشدار، «کارِ بعدی» به مالک گفته می‌شود',
    /کلادفلر را از پنل ادمین روشن کن/.test(outFlood) && /admin\.ghelghelishop\.ir/.test(outFlood));

  const outCalm = runWatch(calmLog, path.join(tmp, 'state-calm'));
  ok('روی ترافیکِ عادی هیچ پیامی نمی‌دهد', outCalm.trim() === '', JSON.stringify(outCalm.slice(0, 120)));

  // سکوتِ ۵ دقیقه‌ای — وگرنه موج به دریای پیام تبدیل می‌شود.
  const outAgain = runWatch(floodLog, path.join(tmp, 'state-flood'));
  ok('هشدارِ تکراری در بازهٔ سکوت فرستاده نمی‌شود', outAgain.trim() === '');

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
