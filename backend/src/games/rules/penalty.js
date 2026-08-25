// ضربات پنالتی — شوت‌اوت ساده و صادقانه
//
// ۲ بازیکن، تصمیم هم‌زمان:
//   زننده: انتخاب یکی از ۹ ناحیه (۳x۳)
//   دروازه‌بان: حدس و شیرجه به یک ناحیه
//
// ۵ دور مسابقه + مرگ ناگهانی در صورت تساوی + برد زودهنگام
//
// ── قاعدهٔ کامل بازی، بدون استثنا ──
//
//     ناحیهٔ شوت == ناحیهٔ شیرجه  →  مهار
//     در غیر این صورت             →  گل
//
// همین. هیچ عامل پنهانی نیست: نه قدرت شوت، نه تیرک، نه شانس.
// شانس گل برای زنندهٔ تصادفی مقابل دروازه‌بان تصادفی دقیقاً ۸/۹ است.
//
// ⚠️ تاریخچه — چرا «پنجرهٔ طلایی» حذف شد:
//
// نسخهٔ قبلی یک مدل احتمالاتی کامل داشت (`missChance`، `isClean`،
// `SWEET_MIN`/`SWEET_WIDTH`) که در آن قدرتِ شوت و زمان‌بندی روی
// احتمال خطا اثر می‌گذاشت. مشکل این بود که آن مدل **هرگز فراخوانی
// نمی‌شد**: `resolveKick` فقط تطابق ناحیه را می‌سنجید. با ۲۰۰٬۰۰۰
// شوت اندازه‌گیری شد — قدرت ۰٫۰۵ و قدرت ۰٫۴۷ هر دو ۱۰۰٪ گل می‌شدند.
//
// در همان حال هر دو کلاینت نوار طلایی را رندر می‌کردند و به کاربر
// می‌گفتند «داخل نوار طلایی رها کن — ضربهٔ تمیز!». یعنی کاربر
// مهارتی را تمرین می‌کرد که روی نتیجه هیچ اثری نداشت.
//
// تصمیم (به‌خواستِ مالک محصول): بازی ساده بماند و به‌جای زنده‌کردن
// مدل، **وعده از رابط برداشته شود**. کد مرده هم حذف شد تا نفر بعدی
// فکر نکند این مکانیک فعال است.

const ZONES = 9;
const ROUNDS = 5;

// `col`/`row` با حذف `missChance` بلااستفاده شدند و پاک شدند.
// ناحیه فقط یک عدد ۰..۸ است و هیچ‌جای منطق به سطر/ستونش نیاز ندارد.

/**
 * تنها قاعدهٔ بازی: تطابق ناحیه.
 *
 * امضا عمداً `power` را نگه داشته چون کلاینت‌ها هنوز آن را می‌فرستند و
 * در بازپخشِ انیمیشن (شدت ضربه) استفاده می‌شود — ولی روی **نتیجه** هیچ
 * اثری ندارد و نباید داشته باشد. اگر روزی خواستید اثر داشته باشد،
 * این تنها جایی است که باید عوض شود.
 */
function resolveKick(shotZone, power, diveZone) {
  if (shotZone === diveZone) {
    return { outcome: 'save', shotZone, diveZone, power, blockedByKeeper: true };
  }
  return { outcome: 'goal', shotZone, diveZone, power };
}

const create = () => ({
  score: { X: 0, O: 0 },
  taken: { X: 0, O: 0 },
  shooter: 'X',
  history: [],
  pending: {},
  round: 1,
  suddenDeath: false,
  lastKick: null,
});

function isValidMove(state, move, player) {
  if (!move || typeof move !== 'object') return false;
  const z = Number(move.zone);
  if (!Number.isInteger(z) || z < 0 || z >= ZONES) return false;
  const p = Number(move.power);
  if (player === state.shooter) {
    if (!Number.isFinite(p) || p < 0 || p > 1) return false;
  }
  return !state.pending[player];
}

function applyMove(state, move, player) {
  const z = Number(move.zone);
  const p = player === state.shooter
    ? Math.max(0, Math.min(1, Number(move.power) || 0.5))
    : 0;
  state.pending[player] = { zone: z, power: p };

  const keeper = state.shooter === 'X' ? 'O' : 'X';
  if (!state.pending[state.shooter] || !state.pending[keeper]) return state;

  const shot = state.pending[state.shooter];
  const dive = state.pending[keeper];
  const res = resolveKick(shot.zone, shot.power, dive.zone);

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
  state.shooter = keeper;

  if (state.taken.X === state.taken.O) {
    state.round += 1;
    if (state.taken.X >= ROUNDS) state.suddenDeath = true;
  }
  return state;
}

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
      return null;
    }
    return null;
  }

  if (tX === tO && X !== O) return X > O ? 'X' : 'O';
  return null;
}

function nextTurn(state) {
  return state.shooter;
}

function publicState(state, forPlayer) {
  const { pending, ...rest } = state;
  return {
    ...rest,
    iChose: forPlayer ? !!pending[forPlayer] : false,
    waitingForOpponent: forPlayer
      ? !!pending[forPlayer] && Object.keys(pending).length === 1
      : false,
    role: forPlayer
      ? (forPlayer === state.shooter ? 'shooter' : 'keeper')
      : null,
  };
}

function botMove(state, me) {
  // ناحیهٔ تصادفیِ یکنواخت. چون قاعده صرفاً تطابق ناحیه است، هر
  // الگوی غیریکنواختی قابل یادگیری می‌شود و ربات را قابل‌سوءاستفاده
  // می‌کند: کاربر می‌فهمد ربات کجا را بیشتر می‌زند و همان‌جا می‌ایستد.
  const zone = Math.floor(Math.random() * ZONES);
  // `power` فقط شدت انیمیشن است و در نتیجه بی‌اثر.
  return { zone, power: state.shooter === me ? 0.5 + Math.random() * 0.4 : 0 };
}

module.exports = {
  id: 'penalty',
  title: 'ضربات پنالتی',
  turnMs: 12000,
  simultaneous: true,
  // کلیدِ ساعتِ هر ضربه: فقط وقتی عوض می‌شود که ضربهٔ قبلی واقعاً حل شده
  // باشد (هر دو طرف انتخاب کرده‌اند). قفلِ زننده یا دروازه‌بان وسطِ ضربه
  // نباید ساعتِ ۱۲ ثانیه‌ای را از نو شروع کند — همان باگی که در دوئل
  // کارت صحنهٔ راندِ قبل را وسطِ راندِ جدید پخش می‌کرد.
  clockKey: state => `${state.round ?? 0}:${state.taken?.X ?? 0}:${state.taken?.O ?? 0}`,
  ZONES, ROUNDS,
  create, result, isValidMove, applyMove, nextTurn, botMove,
  publicState, resolveKick,
};
