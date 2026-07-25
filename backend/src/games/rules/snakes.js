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

// Deliberately dense near the end so a lead is never safe.
const LADDERS = {
  3: 22, 5: 8, 11: 26, 20: 29, 27: 56, 36: 44,
  51: 72, 60: 85, 71: 91, 78: 98,
};
const SNAKES = {
  17: 4, 19: 7, 21: 9, 54: 34, 62: 18, 64: 60,
  87: 24, 93: 73, 95: 75, 98: 79, 99: 80,
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

/// True when neither die can legally be played (both would overshoot).
function isStuck(state, sym) {
  const dice = state.dice;
  if (!dice) return false;
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

function nextTurn(state, turn) {
  // Keep the turn when a 6 granted an extra roll.
  if (state.pendingExtra === turn) return turn;
  const foe = turn === 'X' ? 'O' : 'X';
  ensureDice(state);
  // If the incoming player can't legally move, their turn is skipped.
  if (isStuck(state, foe)) {
    state.event = 'blocked';
    state.dice = [roll(), roll()];
    return turn;
  }
  return foe;
}

/// Scores a candidate die for the bot. Higher is better.
function scoreMove(state, dieIndex, me) {
  const foe = me === 'X' ? 'O' : 'X';
  const step = state.dice[dieIndex];
  const from = state.pos[me];
  let to = from + step;
  if (to > SIZE) return -Infinity;

  let score = 0;
  if (LADDERS[to]) { score += (LADDERS[to] - to) * 2 + 20; to = LADDERS[to]; }
  else if (SNAKES[to]) { score -= (to - SNAKES[to]) * 2 + 20; to = SNAKES[to]; }

  if (to === SIZE) return 10_000;                 // winning move
  if (state.pos[foe] === to) score += 45;         // bump the opponent back
  score += (to - from) * 0.6;                     // general progress
  if (step === 6) score += 12;                    // earns an extra turn

  // Avoid parking on a square where the opponent's likely roll lands a snake
  // on us is overkill; instead penalise sitting directly in front of a snake.
  for (let d = 1; d <= 6; d++) if (SNAKES[to + d]) score -= 1.5;

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
