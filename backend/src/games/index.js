// Game registry. Adding a game = drop a rules file in ./rules and list it
// here; the engine and the client hub pick it up automatically.
const attachGames = require('./engine');

const snakes = require('./rules/snakes');
const connect4 = require('./rules/connect4');
const reversi = require('./rules/reversi');

// Tic-tac-toe was retired: a solved 3x3 game has no replay value once the
// bot plays perfectly. Snakes & Ladders replaces it with a two-dice
// "choose your move" variant that stays tense to the last square.
const RULES = { snakes, connect4, reversi };

// Public catalogue served over REST so the app never hardcodes the list.
const CATALOG = [
  {
    id: 'snakes', title: 'مار و پله', emoji: '🐍',
    subtitle: 'دو تاس بریز، هوشمندانه انتخاب کن', accent: '#A855F7', minutes: 6,
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
