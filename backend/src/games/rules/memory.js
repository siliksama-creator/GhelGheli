// جفت‌یاب — competitive Memory / concentration.
//
// Chosen to replace Snakes & Ladders because it is a much better fit here:
//   * ZERO image assets — the whole board is emoji + colour, so there is no
//     artwork to draw, scale or keep legible on a small screen
//   * the 3D card-flip is one of the nicest things Flutter can render
//   * it is genuinely competitive: a match keeps your turn, so a good memory
//     can chain several pairs in a row
//
// NO BOT. جفت‌یاب is deliberately human-only: a computer with perfect recall
// is not a fun memory opponent, and a *deliberately* forgetful one is just
// theatre. Instead the player either waits for a real opponent or switches to
// the solo TIME-ATTACK mode (see ../solo.js), which is scored on the clock
// rather than on points.
//
// Move = the index of the card to flip.
const SIZE = 16; // 4x4 => 8 pairs
const COLS = 4;

// Card faces. These are ASSET KEYS, not emoji: each one maps to a purpose-made
// 3D football illustration shipped with the clients
// (mobile/assets/games/memory/<key>.webp and userweb/public/games/memory/).
// Emoji were replaced because every phone/browser renders them differently —
// on some Androids half of them fell back to flat monochrome glyphs, which
// made two different cards look identical and the game unplayable.
const FACES = [
  'ball', 'trophy', 'medal', 'jersey',
  'glove', 'boot', 'whistle', 'stopwatch',
];

// Only used to auto-play a turn that ran out of time (never as an opponent).
const BOT_MEMORY = 6;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function create() {
  const deck = shuffle([...FACES, ...FACES]);
  return {
    cols: COLS,
    size: SIZE,
    deck,                       // never sent raw to clients (see decorate)
    matched: Array(SIZE).fill(null), // owner symbol once a pair is taken
    flipped: [],                // face-up this turn (max 2)
    // Diagnostics + the flip ceiling that guarantees a match always ends.
    reveals: Array(SIZE).fill(0),
    totalFlips: 0,
    scores: { X: 0, O: 0 },
    lastResult: null,           // 'match' | 'miss'
    // Bot's imperfect memory: index -> face. Stripped before it reaches any
    // client, otherwise a player could read the answers off the wire.
    _seen: {},
  };
}

/// Cards that are permanently face-up (already won).
const isTaken = (state, i) => state.matched[i] !== null;

/// True once two cards are face-up: they are about to be cleared, so they
/// must not be offered as a legal choice for the incoming player.
const pairShowing = state => state.flipped.length >= 2;

function isValidMove(state, i) {
  if (!Number.isInteger(i) || i < 0 || i >= SIZE) return false;
  if (isTaken(state, i)) return false;
  // Never allow the card(s) currently face-up to be chosen again. Without
  // this the stale missed pair stayed "playable" and a client could re-flip
  // the same two cards indefinitely.
  if (state.flipped.includes(i)) return false;
  return true;
}

function applyMove(state, i, sym) {
  // Clear a leftover "miss" pair the moment the next card is flipped, so both
  // players got a chance to see it.
  if (state.flipped.length >= 2) {
    state.flipped = [];
    state.lastResult = null;
  }

  state.flipped.push(i);
  state._seen[i] = state.deck[i]; // everyone at the table saw this card
  state.reveals[i] = (state.reveals[i] || 0) + 1;
  state.totalFlips = (state.totalFlips || 0) + 1;

  if (state.flipped.length === 2) {
    const [a, b] = state.flipped;
    if (state.deck[a] === state.deck[b]) {
      state.matched[a] = sym;
      state.matched[b] = sym;
      state.scores[sym] += 1;
      state.flipped = [];
      state.lastResult = 'match';
      state.keepTurn = sym;      // a match earns another go
    } else {
      state.lastResult = 'miss';
      state.keepTurn = null;     // cards stay visible until the next flip
    }
  } else {
    state.lastResult = null;
    state.keepTurn = sym;        // mid-turn: same player flips the second card
  }
}

// Hard ceiling on flips. A normal 8-pair game finishes in well under 100
// flips; this only ever triggers against a client that refuses to explore
// (the timeout-autoplay, or a scripted one). Without it such a match could
// run forever, which looked to players like the game had frozen.
const MAX_FLIPS = 160;

function result(state) {
  const allClaimed = state.matched.every(m => m !== null);
  const outOfTime = (state.totalFlips || 0) >= MAX_FLIPS;
  if (!allClaimed && !outOfTime) return null;
  const { X, O } = state.scores;
  if (X === O) return 'DRAW';
  return X > O ? 'X' : 'O';
}

function nextTurn(state, turn) {
  if (state.keepTurn === turn) return turn;
  return turn === 'X' ? 'O' : 'X';
}

// ── Bot ───────────────────────────────────────────────────────────────────
const openIndexes = state =>
  state.deck.map((_, i) => i).filter(i => isValidMove(state, i));

/// What the bot is allowed to "remember": the most recent BOT_MEMORY cards.
function botKnown(state) {
  const entries = Object.entries(state._seen)
    .filter(([i]) => !isTaken(state, Number(i)))
    .slice(-BOT_MEMORY);
  return Object.fromEntries(entries);
}

/// NOT an opponent — this only picks a legal card when a HUMAN's turn clock
/// expires, so the match keeps moving instead of hanging. See `noBot` below.
function botMove(state, me) {
  const open = openIndexes(state);
  if (!open.length) return null;
  const known = botKnown(state);

  // Second card of the turn: complete the pair if we know where it is.
  if (state.flipped.length === 1) {
    const target = state.deck[state.flipped[0]];
    const hit = open.find(i => known[i] === target);
    if (hit !== undefined) return hit;
    // Otherwise probe a card we have NOT seen — that grows our memory.
    const unseen = open.filter(i => known[i] === undefined);
    const pool = unseen.length ? unseen : open;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // First card: if we remember a full pair, take it.
  const byFace = {};
  for (const [i, face] of Object.entries(known)) {
    (byFace[face] ||= []).push(Number(i));
  }
  for (const face of Object.keys(byFace)) {
    const pair = byFace[face].filter(i => open.includes(i));
    if (pair.length >= 2) return pair[0];
  }

  // Otherwise turn over something new rather than re-showing a known card.
  const unseen = open.filter(i => known[i] === undefined);
  const pool = unseen.length ? unseen : open;
  return pool[Math.floor(Math.random() * pool.length)];
}

/// Public view of the board. Face values are revealed ONLY for cards that are
/// currently face-up or already won — sending the whole deck would let anyone
/// read the answers straight out of the socket frames.
function decorate(state, sym) {
  const cards = state.deck.map((face, i) => {
    const visible = state.matched[i] !== null || state.flipped.includes(i);
    return {
      face: visible ? face : null,
      matched: state.matched[i],
      up: state.flipped.includes(i),
    };
  });
  return {
    cols: state.cols,
    size: state.size,
    cards,
    scores: state.scores,
    flipped: state.flipped,
    lastResult: state.lastResult,
    playable: sym ? openIndexes(state) : [],
  };
}

module.exports = {
  id: 'memory',
  title: 'جفت‌یاب',
  // Flipping two cards while recalling the board needs a little thought,
  // but the turn is short — 20s keeps the match brisk.
  turnMs: 20000,
  // Never fall back to a computer opponent: the engine keeps the player in
  // the matchmaking queue and offers solo time-attack instead.
  noBot: true,
  // Playable alone against the clock (backend/src/games/solo.js).
  solo: true,
  create, result, isValidMove, applyMove, nextTurn, botMove, decorate,
  FACES, SIZE, COLS,
};
