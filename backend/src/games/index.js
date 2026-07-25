// Game registry. Adding a game = drop a rules file in ./rules and list it
// here; the engine and the client hub pick it up automatically.
const attachGames = require('./engine');

const tictactoe = require('./rules/tictactoe');
const connect4 = require('./rules/connect4');
const reversi = require('./rules/reversi');

const RULES = { tictactoe, connect4, reversi };

// Public catalogue served over REST so the app never hardcodes the list.
const CATALOG = [
  {
    id: 'tictactoe', title: 'دوز', emoji: '❌',
    subtitle: 'کلاسیک سه‌تایی', accent: '#22D3EE', minutes: 2,
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
