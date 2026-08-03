// ضربات پنالتی — Penalty Shootout
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این بازی با بقیه فرق دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// سه بازی دیگر (جفت‌یاب، چهار در یک ردیف، اتللو) «نوبتی روی یک تخته»‌اند:
// یک نفر حرکت می‌کند، حریف می‌بیند، بعد حرکت می‌کند. پنالتی این‌طور نیست:
//
//   دو بازیکن **هم‌زمان** تصمیم می‌گیرند — زننده کجا شوت کند و دروازه‌بان
//   کجا شیرجه بزند — و هیچ‌کدام نباید انتخاب دیگری را قبل از قفل شدن
//   ببیند.
//
// اگر انتخاب زننده زودتر به سرور برسد و سرور آن را برای دروازه‌بان بفرستد،
// بازی تمام است: دروازه‌بان همیشه می‌گیرد. برای همین:
//
//   • هر دو انتخاب در `pending` نگه داشته می‌شوند و **به حریف emit
//     نمی‌شوند** تا هر دو برسند.
//   • تابع `publicState` عمداً `pending` را حذف می‌کند. حتی اگر جایی از
//     موتور بازی state را بفرستد، انتخاب حریف بیرون نمی‌رود.
//
// ═══════════════════════════════════════════════════════════════════════════
// قالب مسابقه
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «نوبتی یکی دروازه بان میشه و یکی شوت میزنه».
//
//   ۵ دور استاندارد، هر دور دو ضربه (هر بازیکن یک بار می‌زند).
//   بعد از هر ضربه نقش‌ها عوض می‌شود.
//   اگر بعد از ۵ دور مساوی بود → مرگ ناگهانی، دور به دور.
//
// «برد زودهنگام» هم پیاده شده: اگر تیمی آن‌قدر جلو باشد که ضربه‌های
// باقی‌مانده نتوانند جبرانش کنند، بازی همان‌جا تمام می‌شود — دقیقاً مثل
// پنالتی واقعی. بدون این، آخرین ضربه‌ها بی‌معنی و حوصله‌سربر می‌شوند.

// شبکهٔ هدف: ۳ ستون × ۳ ردیف = ۹ ناحیهٔ دروازه.
//
// چرا ۹ و نه بیشتر: با ۹ ناحیه، شانس خامِ حدس دروازه‌بان ۱/۹ است که خیلی
// کم است؛ برای همین دروازه‌بان یک **ناحیهٔ پوشش** دارد (خودش + مجاورها)،
// پس شانس واقعی مهار حدود ۱/۳ می‌شود — نزدیک به آمار واقعی پنالتی.
const ZONES = 9;
const ROUNDS = 5;

/** مختصات ستون/ردیف یک ناحیه. */
const col = (z) => z % 3;       // ۰ چپ، ۱ وسط، ۲ راست
const row = (z) => Math.floor(z / 3); // ۰ بالا، ۱ وسط، ۲ پایین

// ── فیزیک و احتمال ────────────────────────────────────────────────────────
//
// این اعداد از آمار واقعی پنالتی الهام گرفته‌اند، نه از حدس:
//   • گل‌شدن پنالتی در فوتبال حرفه‌ای ~۷۵٪ است.
//   • گوشه‌های بالا سخت‌ترند (بیشتر بیرون می‌روند) ولی مهارشان تقریباً
//     غیرممکن است.
//   • ضربهٔ وسط-پایین راحت زده می‌شود ولی راحت هم مهار می‌شود.
//
// `power` (۰..۱) که کاربر با نگه داشتن دکمه تنظیم می‌کند:
//   قدرت بالا → مهار سخت‌تر، ولی دقت کمتر (احتمال بیرون رفتن بیشتر).
// این یک **تصمیم واقعی** برای بازیکن می‌سازد؛ بدون آن، همه همیشه
// محکم‌ترین شوت را می‌زنند.

/** احتمال بیرون رفتن توپ (خطای زننده)، بر اساس ناحیه و قدرت. */
function missChance(zone, power) {
  const r = row(zone), c = col(zone);
  // ردیف بالا سخت‌ترین است، ردیف پایین راحت‌ترین.
  let base = r === 0 ? 0.16 : r === 1 ? 0.07 : 0.04;
  // گوشه‌ها از وسط سخت‌ترند.
  if (c !== 1) base += 0.04;
  // قدرت بالای ۰.۷ کنترل را کم می‌کند.
  base += Math.max(0, power - 0.7) * 0.35;
  return Math.min(0.45, base);
}

/**
 * احتمال مهار توپ، **به شرط اینکه** توپ در چارچوب باشد.
 *
 * دروازه‌بان اگر دقیقاً همان ناحیه را بزند شانس بالایی دارد؛ ناحیهٔ
 * مجاور شانس کمتر؛ ناحیهٔ دور تقریباً صفر.
 */
function saveChance(shotZone, diveZone, power) {
  const dc = Math.abs(col(shotZone) - col(diveZone));
  const dr = Math.abs(row(shotZone) - row(diveZone));
  const dist = dc + dr;

  let p;
  if (dist === 0) p = 0.80;        // حدس دقیق
  else if (dist === 1) p = 0.32;   // یک خانه فاصله — دست/پا می‌رسد
  else if (dist === 2) p = 0.08;
  else p = 0.02;                   // کاملاً اشتباه حدس زده

  // شوت محکم‌تر مهارش سخت‌تر است.
  p *= (1 - power * 0.35);
  // گوشهٔ بالا حتی با حدس درست هم سخت مهار می‌شود.
  if (row(shotZone) === 0) p *= 0.65;
  return Math.max(0.01, Math.min(0.95, p));
}

/**
 * نتیجهٔ یک ضربه را قطعی می‌کند.
 *
 * `rand` تزریق می‌شود تا تست بتواند قطعی باشد. بدون این، تست‌های احتمالی
 * گاهی سبز و گاهی قرمز می‌شدند — بدترین نوع تست.
 */
function resolveKick(shotZone, power, diveZone, rand = Math.random) {
  if (missChance(shotZone, power) > rand()) {
    return { outcome: 'miss', shotZone, diveZone, power };
  }
  if (saveChance(shotZone, diveZone, power) > rand()) {
    return { outcome: 'save', shotZone, diveZone, power };
  }
  return { outcome: 'goal', shotZone, diveZone, power };
}

// ── وضعیت بازی ────────────────────────────────────────────────────────────
const create = () => ({
  // امتیاز هر بازیکن
  score: { X: 0, O: 0 },
  // چند ضربه هر کدام زده‌اند
  taken: { X: 0, O: 0 },
  // چه کسی الان می‌زند. زنندهٔ اول همیشه X.
  shooter: 'X',
  // تاریخچه، برای نمایش ردیف توپ‌ها در UI
  history: [],
  // انتخاب‌های قفل‌نشده — هرگز به کلاینت نمی‌رود (publicState حذفش می‌کند)
  pending: {},
  round: 1,
  suddenDeath: false,
  lastKick: null,
});

/**
 * حرکت معتبر: `{ zone: 0..8, power: 0..1 }`.
 *
 * هر دو نقش از همین مسیر می‌آیند — زننده ناحیهٔ شوت می‌فرستد، دروازه‌بان
 * ناحیهٔ شیرجه. موتور بازی نمی‌داند کدام است؛ اینجا از روی `shooter`
 * تشخیص داده می‌شود.
 */
function isValidMove(state, move, player) {
  if (!move || typeof move !== 'object') return false;
  const z = Number(move.zone);
  if (!Number.isInteger(z) || z < 0 || z >= ZONES) return false;
  const p = Number(move.power);
  // دروازه‌بان قدرت ندارد؛ اگر فرستاد هم نادیده گرفته می‌شود.
  if (player === state.shooter) {
    if (!Number.isFinite(p) || p < 0 || p > 1) return false;
  }
  // هر بازیکن در هر ضربه فقط یک بار انتخاب می‌کند.
  return !state.pending[player];
}

function applyMove(state, move, player, rand = Math.random) {
  const z = Number(move.zone);
  const p = player === state.shooter
    ? Math.max(0, Math.min(1, Number(move.power) || 0.5))
    : 0;
  state.pending[player] = { zone: z, power: p };

  const keeper = state.shooter === 'X' ? 'O' : 'X';
  // تا وقتی هر دو انتخاب نکرده‌اند، هیچ اتفاقی نمی‌افتد و هیچ اطلاعاتی
  // بیرون نمی‌رود.
  if (!state.pending[state.shooter] || !state.pending[keeper]) return state;

  const shot = state.pending[state.shooter];
  const dive = state.pending[keeper];
  const res = resolveKick(shot.zone, shot.power, dive.zone, rand);

  if (res.outcome === 'goal') state.score[state.shooter] += 1;
  state.taken[state.shooter] += 1;
  state.lastKick = { ...res, shooter: state.shooter, keeper };
  state.history.push({
    shooter: state.shooter,
    outcome: res.outcome,
    shotZone: res.shotZone,
    diveZone: res.diveZone,
  });

  state.pending = {};
  // نقش‌ها عوض می‌شوند.
  state.shooter = keeper;
  // یک دور کامل = هر دو زده‌اند.
  if (state.taken.X === state.taken.O) {
    state.round += 1;
    if (state.taken.X >= ROUNDS) state.suddenDeath = true;
  }
  return state;
}

/**
 * برنده، یا null اگر بازی ادامه دارد.
 *
 * دو قانون واقعیِ پنالتی اینجا پیاده شده‌اند:
 *
 * ۱. برد زودهنگام: اگر اختلاف امتیاز از ضربه‌های باقی‌ماندهٔ حریف بیشتر
 *    باشد، ادامه بی‌معنی است. بدون این، کاربر باید ۳ ضربهٔ بی‌اثر را
 *    تماشا کند.
 * ۲. مرگ ناگهانی: بعد از ۵ ضربه، فقط وقتی تمام می‌شود که **هر دو** به
 *    تعداد مساوی زده باشند و امتیاز فرق کند.
 */
function result(state) {
  const { X, O } = state.score;
  const tX = state.taken.X, tO = state.taken.O;

  if (!state.suddenDeath) {
    const leftX = Math.max(0, ROUNDS - tX);
    const leftO = Math.max(0, ROUNDS - tO);
    if (X > O + leftO) return 'X';
    if (O > X + leftX) return 'O';
    if (tX >= ROUNDS && tO >= ROUNDS) {
      if (X !== O) return X > O ? 'X' : 'O';
      return null; // مساوی → مرگ ناگهانی
    }
    return null;
  }

  // مرگ ناگهانی: فقط در انتهای یک دور کامل تصمیم گرفته می‌شود.
  if (tX === tO && X !== O) return X > O ? 'X' : 'O';
  return null;
}

function nextTurn(state) {
  // هر دو نقش هم‌زمان بازی می‌کنند، پس «نوبت» یعنی هر کسی که هنوز
  // انتخاب نکرده. موتور بازی یک مقدار می‌خواهد؛ زننده را برمی‌گردانیم
  // چون اوست که بازی را جلو می‌برد.
  return state.shooter;
}

/**
 * نسخهٔ قابل ارسال به کلاینت — بدون انتخاب‌های قفل‌نشده.
 *
 * این تابع خطِ دفاعیِ تقلب است. `pending` شامل ناحیه‌ای است که حریف
 * انتخاب کرده؛ اگر یک بار به کلاینت برود، بازی برای همیشه شکسته است.
 * به‌جای حذف در چند نقطه، اینجا یک بار و برای همیشه حذف می‌شود.
 */
function publicState(state, forPlayer) {
  const { pending, ...rest } = state;
  return {
    ...rest,
    // فقط خبر می‌دهد که آیا خودش انتخاب کرده یا نه — نه اینکه چه چیزی.
    iChose: forPlayer ? !!pending[forPlayer] : false,
    waitingForOpponent: forPlayer
      ? !!pending[forPlayer] && Object.keys(pending).length === 1
      : false,
    role: forPlayer
      ? (forPlayer === state.shooter ? 'shooter' : 'keeper')
      : null,
  };
}

/**
 * حریف کامپیوتری.
 *
 * عمداً کامل نیست. یک ربات که همیشه بهترین کار را بکند، بازی را
 * غیرقابل‌برد و بی‌مزه می‌کند. این ربات:
 *   • به‌عنوان زننده: گوشه‌ها را ترجیح می‌دهد ولی گاهی وسط می‌زند.
 *   • به‌عنوان دروازه‌بان: تصادفی با تمایل کمی به ناحیه‌های پرتکرارِ
 *     حریف — یعنی اگر بازیکن همیشه یک گوشه بزند، ربات یاد می‌گیرد.
 *     این تنها «هوش» ربات است و همان چیزی است که بازی را جالب می‌کند.
 */
function botMove(state, me) {
  const amShooter = state.shooter === me;
  if (amShooter) {
    // گوشه‌های پایین بهترین نسبت ریسک/بازده را دارند؛ گاهی بالا هم می‌زند.
    const pool = [6, 8, 0, 2, 3, 5, 7, 1, 4];
    const weights = [22, 22, 12, 12, 10, 10, 7, 3, 2];
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let zone = pool[0];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { zone = pool[i]; break; }
    }
    // قدرت متوسط‌روبه‌بالا با کمی تصادف.
    return { zone, power: 0.55 + Math.random() * 0.35 };
  }

  // دروازه‌بان: از عادت حریف یاد می‌گیرد.
  const foe = me === 'X' ? 'O' : 'X';
  const shots = (state.history || [])
    .filter(h => h.shooter === foe)
    .map(h => h.shotZone);
  if (shots.length >= 2 && Math.random() < 0.55) {
    const freq = new Map();
    for (const z of shots) freq.set(z, (freq.get(z) || 0) + 1);
    let best = shots[shots.length - 1], bn = 0;
    for (const [z, n] of freq) if (n > bn) { bn = n; best = z; }
    return { zone: best, power: 0 };
  }
  return { zone: Math.floor(Math.random() * ZONES), power: 0 };
}

module.exports = {
  id: 'penalty',
  title: 'ضربات پنالتی',
  // هر دو بازیکن هم‌زمان تصمیم می‌گیرند، پس زمان باید کوتاه و پرفشار
  // باشد — انتظار طولانی، هیجان پنالتی را می‌کشد.
  turnMs: 12000,
  // موتور باید بداند این بازی هم‌زمان است و نباید بعد از هر حرکت نوبت را
  // عوض کند.
  simultaneous: true,
  ZONES, ROUNDS,
  create, result, isValidMove, applyMove, nextTurn, botMove,
  publicState, resolveKick, missChance, saveChance,
};
