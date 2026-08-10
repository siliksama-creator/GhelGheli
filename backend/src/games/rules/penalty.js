// ضربات پنالتی — Next-Gen 2028 Penalty Shootout
//
// ۲ بازیکن، تصمیم هم‌زمان:
//   زننده: هدف‌گیری ۹ ناحیه (۳x۳) + تنظیم قدرت و زمان‌بندی پنجره طلایی (Sweet Spot)
//   دروازه‌بان: حدس و شیرجه به ناحیه هدف
//
// ۵ دور مسابقه + مرگ ناگهانی در صورت تساوی + برد زودهنگام

const ZONES = 9;
const ROUNDS = 5;

const col = (z) => z % 3;       // ۰ چپ، ۱ وسط، ۲ راست
const row = (z) => Math.floor(z / 3); // ۰ بالا، ۱ وسط، ۲ پایین

const SWEET_MIN = 0.35;
const SWEET_WIDTH = 0.15;
const _CLEAN_MISS = 0.30;
const _CLEAN_SAVE = 0.65;

function makeSweet(rand = Math.random) {
  const span = 1 - SWEET_MIN - SWEET_WIDTH;
  const min = SWEET_MIN + 0.04 + rand() * Math.max(0, span - 0.08);
  return { min: round3(min), max: round3(min + SWEET_WIDTH) };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

function isClean(power, sweet) {
  if (!sweet) return false;
  return power >= sweet.min && power <= sweet.max;
}

/** احتمال خطا / اصابت به تیرک بر اساس قدرت و زمان‌بندی */
function missChance(zone, power, clean = false) {
  const r = row(zone), c = col(zone);
  let base = r === 0 ? 0.12 : r === 1 ? 0.05 : 0.03;
  if (c !== 1) base += 0.04;
  base += Math.max(0, power - 0.8) * 0.40;
  const capped = Math.min(0.40, base);
  return clean ? capped * _CLEAN_MISS : capped;
}

function resolveKick(shotZone, power, diveZone, rand = Math.random, sweet = null) {
  const clean = isClean(power, sweet);
  // منطق ساده، زیبا و جوانمردانه: اگر دروازه‌بان درست حدس بزند مهار، در غیر این صورت گل قطعی
  if (shotZone === diveZone) {
    return { outcome: 'save', shotZone, diveZone, power, clean, blockedByKeeper: true };
  }
  return { outcome: 'goal', shotZone, diveZone, power, clean };
}

const create = (rand = Math.random) => ({
  score: { X: 0, O: 0 },
  taken: { X: 0, O: 0 },
  shooter: 'X',
  history: [],
  pending: {},
  round: 1,
  suddenDeath: false,
  lastKick: null,
  sweet: makeSweet(rand),
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

function applyMove(state, move, player, rand = Math.random) {
  const z = Number(move.zone);
  const p = player === state.shooter
    ? Math.max(0, Math.min(1, Number(move.power) || 0.5))
    : 0;
  state.pending[player] = { zone: z, power: p };

  const keeper = state.shooter === 'X' ? 'O' : 'X';
  if (!state.pending[state.shooter] || !state.pending[keeper]) return state;

  const shot = state.pending[state.shooter];
  const dive = state.pending[keeper];
  const res = resolveKick(shot.zone, shot.power, dive.zone, rand, state.sweet);

  if (res.outcome === 'goal') state.score[state.shooter] += 1;
  state.taken[state.shooter] += 1;
  state.lastKick = { ...res, shooter: state.shooter, keeper };
  state.history.push({
    shooter: state.shooter,
    outcome: res.outcome,
    shotZone: res.shotZone,
    diveZone: res.diveZone,
    clean: res.clean,
  });

  state.pending = {};
  state.sweet = makeSweet(rand);
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
    sweet: state.sweet,
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
  const zone = Math.floor(Math.random() * ZONES);
  if (state.shooter === me) {
    return { zone, power: 0.35 + Math.random() * 0.65 };
  }
  return { zone, power: 0 };
}

module.exports = {
  id: 'penalty',
  title: 'ضربات پنالتی',
  turnMs: 12000,
  simultaneous: true,
  ZONES, ROUNDS,
  SWEET_MIN, SWEET_WIDTH,
  create, result, isValidMove, applyMove, nextTurn, botMove,
  publicState, resolveKick, missChance, makeSweet, isClean,
};
