// Game registry. Adding a game = drop a rules file in ./rules and list it
// here; the engine and the client hub pick it up automatically.
const attachGames = require('./engine');
const { attachSolo } = require('./solo');

const memory = require('./rules/memory');
const connect4 = require('./rules/connect4');
const reversi = require('./rules/reversi');

// Snakes & Ladders was retired: keeping the board legible needed constant
// artwork tuning, and it was ultimately dice-driven. جفت‌یاب (memory) puts
// purpose-made 3D football icons on a 3D card-flip and rewards real skill
// (a match keeps your turn). It is the one game with NO bot: you either meet
// a real opponent or play solo time-attack.
const RULES = { memory, connect4, reversi };

// Public catalogue served over REST so the app never hardcodes the list.
const CATALOG = [
  {
    id: 'memory', title: 'جفت‌یاب', emoji: '🃏',
    subtitle: 'جفت‌ها را به خاطر بسپار و ببر', accent: '#A855F7', minutes: 4,
    // No computer opponent here — real rival, or solo against the clock.
    noBot: true, solo: true,
  },
  {
    id: 'connect4', title: 'چهار در یک ردیف', emoji: '🔴',
    subtitle: 'چهارتا رو ردیف کن', accent: '#F59E0B', minutes: 5,
    noBot: false, solo: false,
  },
  {
    id: 'reversi', title: 'اتللو', emoji: '⚫',
    subtitle: 'مهره‌ها را برگردان', accent: '#34D399', minutes: 8,
    noBot: false, solo: false,
  },
];

module.exports = {
  RULES,
  CATALOG,
  attach: io => {
    attachGames(io, RULES);
    // Single-player time-attack lives beside the multiplayer engine so both
    // share the exact same rules modules — one board, two ways to play.
    attachSolo(io, RULES);
  },
};
