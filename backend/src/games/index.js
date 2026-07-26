// Game registry. Adding a game = drop a rules file in ./rules and list it
// here; the engine and the client hub pick it up automatically.
const attachGames = require('./engine');

const memory = require('./rules/memory');
const connect4 = require('./rules/connect4');
const reversi = require('./rules/reversi');

// Snakes & Ladders was retired: keeping the board legible needed constant
// artwork tuning, and it was ultimately dice-driven. جفت‌یاب (memory) needs
// ZERO image assets — the whole board is emoji + colour — while showcasing
// Flutter's 3D card-flip, and it rewards real skill (a match keeps your turn).
const RULES = { memory, connect4, reversi };

// Public catalogue served over REST so the app never hardcodes the list.
const CATALOG = [
  {
    id: 'memory', title: 'جفت‌یاب', emoji: '🃏',
    subtitle: 'جفت‌ها را به خاطر بسپار و ببر', accent: '#A855F7', minutes: 4,
  },
  {
    id: 'connect4', title: 'چهار در یک ردیف', emoji: '🔴',
    subtitle: 'چهارتا رو ردیف کن', accent: '#F59E0B', minutes: 5,
  },
  {
    id: 'reversi', title: 'اتللو', emoji: '⚫',
    subtitle: 'مهره‌ها را برگردان', accent: '#34D399', minutes: 8,
  },
];

module.exports = {
  RULES,
  CATALOG,
  attach: io => attachGames(io, RULES),
};
