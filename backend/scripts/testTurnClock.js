// تستِ رفتاریِ ساعتِ نوبت — با اجرای واقعیِ موتور، نه regex روی سورس.
//
// ── چرا این فایل وجود دارد ──
//
// یک باگ واقعی از کنارِ `testCardDuelPacing.js` رد شد چون آن تست
// زمان‌بندی را با **regex روی متنِ سورس** چک می‌کند:
//
//     ck('مکث به deadline اضافه می‌شود (نه کم)',
//        /deadline\s*=\s*Date\.now\(\)\s*\+\s*holdMs/.test(engine));
//
// این regex فقط خطِ `deadline` را می‌دید و سبز می‌شد. ولی آرگومانِ
// `setTimeout` خطِ بعد، `holdMs` را نداشت:
//
//     deadline   = now + holdMs + introMs + turnMs   ← ۲۶۲۰۰ms
//     setTimeout(..., turnMs + introMs)              ← ۲۳۰۰۰ms
//
// نتیجه: از راندِ دوم به بعد کارتِ کاربر ۳۲۰۰ms زودتر از ساعتِ رویِ
// صفحه‌اش خودکار بازی می‌شد.
//
// درسِ روش‌شناختی: تستی که سورس را می‌خواند فقط ثابت می‌کند «متن
// نوشته شده»، نه «رفتار درست است». این فایل ساعت را با تایمرِ جعلی
// واقعاً می‌رانَد و **قرارداد** را چک می‌کند:
//
//     عددی که به کاربر نشان می‌دهیم == لحظه‌ای که واقعاً اقدام می‌کنیم
//
// این قرارداد برای هر بازی‌ای که `introMs`/`resultHoldMs` دارد باید
// برقرار باشد، نه فقط دوئل کارت.

let pass = 0, fail = 0;
function ck(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); fail++; }
}

// ── تایمرِ جعلی ─────────────────────────────────────────────────────────
// آرگومانِ هر setTimeout را ضبط می‌کنیم بدون اینکه واقعاً منتظر بمانیم.
const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;
let scheduled = [];
let handleSeq = 0;

function installFakeTimers() {
  scheduled = [];
  global.setTimeout = (fn, ms) => {
    const h = { id: ++handleSeq, fn, ms };
    scheduled.push(h);
    return h;
  };
  global.clearTimeout = h => {
    if (!h) return;
    scheduled = scheduled.filter(x => x !== h);
  };
}
function restoreTimers() {
  global.setTimeout = realSetTimeout;
  global.clearTimeout = realClearTimeout;
}

// ── بازسازیِ دقیقِ armTurnClock از روی خودِ موتور ────────────────────────
// به‌جای کپیِ فرمول (که با سورس واگرا می‌شود)، خودِ تابع را از موتور
// می‌گیریم. موتور تابع را export نمی‌کند، پس اتاقِ واقعی می‌سازیم و از
// مسیرِ عمومی صدایش می‌زنیم.
//
// ساده‌ترین راهِ پایدار: فایل را می‌خوانیم و `armTurnClock` را در یک
// sandbox با همان وابستگی‌ها اجرا می‌کنیم. اینجا از راهِ سبک‌تر می‌رویم:
// یک اتاقِ ساختگی می‌سازیم و منطق را از طریقِ رفتارِ قابلِ مشاهده چک
// می‌کنیم — یعنی `deadline` که موتور می‌نویسد و `ms` که زمان‌بندی می‌کند.

const path = require('path');
const fs = require('fs');
const enginePath = path.join(__dirname, '..', 'src', 'games', 'engine.js');
const engineSrc = fs.readFileSync(enginePath, 'utf8');

// استخراجِ بدنهٔ armTurnClock و اجرای آن در یک بستهٔ ایزوله.
const fnMatch = engineSrc.match(/function armTurnClock\(room\) \{[\s\S]*?\n\}/);
if (!fnMatch) {
  console.error('✗ armTurnClock در موتور پیدا نشد — ساختار فایل عوض شده');
  process.exit(1);
}

function makeArmTurnClock() {
  // eslint-disable-next-line no-new-func
  return new Function(`
    ${fnMatch[0]}
    return armTurnClock;
  `)();
}

function driveClock(rules, { hasLastRound }) {
  installFakeTimers();
  // زمان را قفل می‌کنیم. وگرنه اگر بینِ خواندنِ t0 و صداکردنِ
  // Date.now() داخلِ موتور مرزِ یک میلی‌ثانیه رد شود، تست به‌طورِ
  // تصادفی ۱ms اختلاف گزارش می‌کند — یک flake که هیچ ربطی به باگ
  // ندارد. با قفلِ ساعت، هر اختلافی که ببینیم قطعاً واقعی است.
  const realNow = Date.now;
  const frozen = realNow.call(Date);
  Date.now = () => frozen;
  const armTurnClock = makeArmTurnClock();
  const room = {
    done: false,
    rules,
    turn: 'X',
    turnMs: Number(rules.turnMs) || 30000,
    seats: { X: { emit() {} }, O: { emit() {} } },
    reconnecting: { X: false, O: false },
    state: hasLastRound ? { lastRound: { winner: 'X' } } : {},
  };
  armTurnClock(room);
  const shownMs = room.deadline ? room.deadline - frozen : null;
  const timer = scheduled[scheduled.length - 1] || null;
  Date.now = realNow;
  restoreTimers();
  return { shownMs, timerMs: timer ? timer.ms : null, room };
}

const cardDuel = require('../src/games/rules/cardDuel');
const penalty = require('../src/games/rules/penalty');

console.log('\n══ ۱. قرارداد اصلی: ساعتِ کاربر == تایمرِ سرور ══');
for (const [gameLabel, rules] of [['دوئل کارت', cardDuel], ['پنالتی', penalty]]) {
  for (const hasLastRound of [false, true]) {
    const label = hasLastRound ? 'راندهای بعدی' : 'راند اول';
    const { shownMs, timerMs } = driveClock(rules, { hasLastRound });
    if (shownMs === null && timerMs === null) {
      ck(`${gameLabel} · ${label}: ساعتی مسلح نشد (قابل قبول)`, true);
      continue;
    }
    ck(
      `${gameLabel} · ${label}: عددِ کاربر با تایمرِ واقعی یکی است`,
      shownMs === timerMs,
      `کاربر ${shownMs}ms می‌بیند ولی تایمر در ${timerMs}ms می‌زند`
      + ` → ${shownMs - timerMs}ms وقتِ خیالی`,
    );
  }
}

console.log('\n══ ۲. مکثِ نتیجه واقعاً به فرصتِ کاربر اضافه می‌شود ══');
{
  const first = driveClock(cardDuel, { hasLastRound: false });
  const later = driveClock(cardDuel, { hasLastRound: true });
  const hold = Number(cardDuel.resultHoldMs) || 0;
  ck(
    'راندهای بعدی دقیقاً به اندازهٔ resultHoldMs بلندترند',
    later.timerMs - first.timerMs === hold,
    `اختلافِ واقعی ${later.timerMs - first.timerMs}ms ولی resultHoldMs=${hold}ms`,
  );
  ck(
    'فرصتِ فکرِ خالصِ کاربر از turnMs کمتر نشده',
    later.timerMs - hold - (Number(cardDuel.introMs) || 0) >= Number(cardDuel.turnMs),
    'مکث از وقتِ کاربر کم شده به‌جای اینکه اضافه شود',
  );
}

console.log('\n══ ۳. مهرهای زمانی با هم سازگارند ══');
{
  const { room } = driveClock(cardDuel, { hasLastRound: true });
  ck('resultUntil قبل از introUntil است', room.resultUntil < room.introUntil);
  ck('introUntil قبل از deadline است', room.introUntil < room.deadline);
  ck(
    'کاربر بعد از پایانِ اعلان دستِ‌کم turnMs وقت دارد',
    room.deadline - room.introUntil >= Number(cardDuel.turnMs),
    `فقط ${room.deadline - room.introUntil}ms باقی می‌ماند`,
  );
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
