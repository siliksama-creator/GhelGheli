// مار و پله — Snakes & Ladders, tuned to be a real challenge rather than
// pure luck.
//
// Design decisions that make it *skilful* instead of a dice-rolling race:
//   * you roll TWO dice and choose which one to move with, so almost every
//     turn is a genuine decision (avoid a snake / reach a ladder / block)
//   * an exact roll is required to finish; overshooting wastes the turn
//   * rolling a 6 grants another turn (capped, so it can't loop forever)
//   * landing on the opponent sends them back to their last ladder-top or
//     start, which turns the board into a contest rather than two solitaires
const SIZE = 100;

// Classic 7-and-7 layout. The original 21 chutes made the rendered board an
// unreadable tangle of overlapping lines on a phone screen; this keeps the
// tension (three snakes guard the 90s) while staying legible.
const LADDERS = {
  4: 14, 9: 31, 21: 42, 28: 84, 51: 67, 72: 91, 80: 98,
};
const SNAKES = {
  17: 7, 47: 26, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75,
};

const MAX_EXTRA_TURNS = 2; // a 6 re-rolls, but not indefinitely

function create() {
  return {
    size: SIZE,
    pos: { X: 0, O: 0 },
    // Where a player falls back to when bumped — their highest ladder top.
    safe: { X: 0, O: 0 },
    // Rolled immediately: with `null` here the very first turn had no dice,
    // so every opening move was rejected as illegal.
    dice: [roll(), roll()],
    used: null,        // which die was played last
    lastFrom: null,
    lastTo: null,
    event: null,       // 'ladder' | 'snake' | 'bump' | 'blocked' | 'win'
    extra: { X: 0, O: 0 },
    ladders: LADDERS,
    snakes: SNAKES,
    rolls: 0,
  };
}

const roll = () => 1 + Math.floor(Math.random() * 6);

/// Ensures the player on move has a pair of dice to choose from.
function ensureDice(state) {
  if (!state.dice) state.dice = [roll(), roll()];
  return state.dice;
}

// A move is the INDEX of the die to use: 0 or 1.
function isValidMove(state, move, sym) {
  if (move !== 0 && move !== 1) return false;
  const dice = state.dice;
  if (!dice || dice.length !== 2) return false;
  const step = dice[move];
  if (!step) return false;
  // Overshooting the final square is not allowed — you must land exactly.
  return state.pos[sym] + step <= SIZE;
}

/// True when neither die can legally be played (both would overshoot 100).
function isStuck(state, sym) {
  const dice = state.dice;
  if (!dice || dice.length !== 2) return true; // no dice == cannot act
  return !dice.some(d => state.pos[sym] + d <= SIZE);
}

function applyMove(state, move, sym) {
  const foe = sym === 'X' ? 'O' : 'X';
  const dice = ensureDice(state);
  const step = dice[move];
  const from = state.pos[sym];
  let to = from + step;

  state.rolls += 1;
  state.used = step;
  state.lastFrom = from;
  state.event = null;

  if (to > SIZE) {           // shouldn't happen (guarded by isValidMove)
    state.event = 'blocked';
    state.dice = null;
    return;
  }

  if (LADDERS[to]) {
    to = LADDERS[to];
    state.event = 'ladder';
    state.safe[sym] = to;    // ladder tops become the fallback point
  } else if (SNAKES[to]) {
    to = SNAKES[to];
    state.event = 'snake';
  }

  // Bump: landing exactly on the opponent knocks them back.
  if (to !== SIZE && state.pos[foe] === to && to !== 0) {
    state.pos[foe] = state.safe[foe];
    state.event = 'bump';
  }

  state.pos[sym] = to;
  state.lastTo = to;
  if (to === SIZE) state.event = 'win';

  // Rolling a six earns another turn, with a hard cap.
  if (step === 6 && to !== SIZE && state.extra[sym] < MAX_EXTRA_TURNS) {
    state.extra[sym] += 1;
    state.dice = [roll(), roll()];
    state.pendingExtra = sym;
  } else {
    state.extra[sym] = 0;
    state.dice = null;
    state.pendingExtra = null;
  }
}

function result(state) {
  if (state.pos.X === SIZE) return 'X';
  if (state.pos.O === SIZE) return 'O';
  return null;
}

// DEADLOCK FIX. The previous version handed the turn back to the *current*
// player whenever the opponent was stuck — without checking that the current
// player could move either. Near square 100 both players often need an exact
// low number, so both are frequently stuck: the game then bounced between
// "same player, no playable dice" forever with dice left null. To the user
// that looked exactly like the connection dropping mid-game (it froze in
// ~18% of games). Now we always roll a FRESH pair and keep rolling until
// somebody can legally act, so play can never stall.
function nextTurn(state, turn) {
  const foe = turn === 'X' ? 'O' : 'X';

  // An extra turn from rolling a 6 only stands if it is actually playable.
  if (state.pendingExtra === turn) {
    ensureDice(state);
    if (!isStuck(state, turn)) return turn;
    state.pendingExtra = null;
  }

  for (let attempt = 0; attempt < 64; attempt++) {
    state.dice = [roll(), roll()];
    if (!isStuck(state, foe)) {
      // Normal hand-over. Clear a stale "blocked" notice.
      if (state.event === 'blocked') state.event = null;
      return foe;
    }
    if (!isStuck(state, turn)) {
      // Opponent cannot move: they forfeit this turn, we go again.
      state.event = 'blocked';
      return turn;
    }
    // Neither side can act with this pair — roll again.
  }

  // Statistically unreachable, but never leave the room without a valid
  // state: hand over with a guaranteed-playable die.
  const need = SIZE - state.pos[foe];
  state.dice = [Math.max(1, Math.min(6, need)), Math.max(1, Math.min(6, need))];
  return foe;
}

/// Immediate outcome of moving `step` from `from` (ladders/snakes applied).
function landing(from, step) {
  const raw = from + step;
  if (raw > SIZE) return null;
  if (LADDERS[raw]) return LADDERS[raw];
  if (SNAKES[raw]) return SNAKES[raw];
  return raw;
}

/// Expected value of sitting on `square`: how good the NEXT roll looks from
/// here. This is what turns the bot from "greedy" into one that avoids
/// parking in front of a snake or just short of a ladder.
function squareOutlook(square) {
  if (square >= SIZE) return 0;
  let total = 0;
  // 21 unordered outcomes of two dice; the player picks the better one.
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      const la = landing(square, a);
      const lb = landing(square, b);
      const best = Math.max(la ?? -1, lb ?? -1);
      total += best < 0 ? square : best;
    }
  }
  return total / 21 - square; // average net progress from this square
}

/// Scores a candidate die for the bot. Higher is better.
function scoreMove(state, dieIndex, me) {
  const foe = me === 'X' ? 'O' : 'X';
  const step = state.dice[dieIndex];
  const from = state.pos[me];
  const raw = from + step;
  if (raw > SIZE) return -Infinity;

  let to = raw;
  let score = 0;

  if (LADDERS[raw]) { score += (LADDERS[raw] - raw) * 2.2 + 25; to = LADDERS[raw]; }
  else if (SNAKES[raw]) { score -= (raw - SNAKES[raw]) * 2.2 + 25; to = SNAKES[raw]; }

  if (to === SIZE) return 100000;                    // winning move

  // Bumping the opponent is worth exactly what it costs them.
  if (state.pos[foe] === to && to !== 0) {
    score += (state.pos[foe] - state.safe[foe]) * 1.4 + 30;
  }

  score += (to - from) * 0.8;                        // raw progress
  score += squareOutlook(to) * 1.6;                  // one-ply lookahead
  if (step === 6 && state.extra[me] < MAX_EXTRA_TURNS) score += 15;

  // Endgame: you need an EXACT roll to finish, so squares 95-99 are traps
  // if they leave a gap you are unlikely to roll.
  const gap = SIZE - to;
  if (gap > 0 && gap <= 6) score += 18;              // one roll from home
  else if (gap > 6 && gap <= 12) score += 6;

  // Racing consideration: if the opponent is close to home, value speed
  // more than safety.
  if (state.pos[foe] > 80) score += (to - from) * 0.5;

  return score;
}

function botMove(state, me) {
  ensureDice(state);
  const options = [0, 1].filter(i => isValidMove(state, i, me));
  if (!options.length) return null;
  let best = options[0];
  let bestScore = -Infinity;
  for (const i of options) {
    const sc = scoreMove(state, i, me);
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return best;
}

/// Give each client the dice it is allowed to act on.
function decorate(state, sym) {
  // The player on move must always see a rollable pair; without this a
  // freshly-created or just-consumed state left the client with no dice and
  // therefore no legal action at all.
  ensureDice(state);
  return {
    ...state,
    playable: sym ? [0, 1].filter(i => isValidMove(state, i, sym)) : [],
    dice: state.dice,
  };
}

module.exports = {
  id: 'snakes',
  title: 'مار و پله',
  // Two dice to weigh up plus a board to read — needs real thinking time.
  turnMs: 25000,
  create, result, isValidMove, applyMove, nextTurn, botMove, decorate,
  LADDERS, SNAKES, SIZE,
};
