// Game registry. Adding a game = drop a rules file in ./rules and list it
// here; the engine and the client hub pick it up automatically.
const attachGames = require('./engine');
const { attachSolo } = require('./solo');

const memory = require('./rules/memory');
const reversi = require('./rules/reversi');
const penalty = require('./rules/penalty');

// Snakes & Ladders was retired: keeping the board legible needed constant
// artwork tuning, and it was ultimately dice-driven. Connect Four (چهار در
// یک ردیف) was also retired on the owner's request — it contributed little
// and duplicated Reversi's two-player-tactics slot. جفت‌یاب (memory) puts
// purpose-made 3D football icons on a 3D card-flip and rewards real skill
// (a match keeps your turn). It is the one game with NO bot: you either meet
// a real opponent or play solo time-attack.
const RULES = { memory, reversi, penalty };

// Public catalogue served over REST so the app never hardcodes the list.
const CATALOG = [
  {
    id: 'memory', title: 'جفت‌یاب', emoji: 'card',
    subtitle: 'جفت‌ها را به خاطر بسپار و ببر', accent: '#A855F7', minutes: 4,
    // No computer opponent here — real rival, or solo against the clock.
    noBot: false, solo: true,
  },
  {
    id: 'reversi', title: 'اتللو', emoji: 'disc',
    subtitle: 'مهره‌ها را برگردان', accent: '#34D399', minutes: 8,
    noBot: false, solo: false,
  },
  {
    // Single-player: no lobby, no socket room, no rules file — it lives
    // entirely in the clients plus the signed-progress endpoint. Listed here
    // anyway so the catalogue stays the ONE description of what is playable;
    // a hub that hardcodes its own list drifts the moment a game is added.
    id: 'tap', title: 'ضربه‌زن', emoji: 'fist',
    subtitle: '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', accent: '#84CC16',
    minutes: 3,
    noBot: false, solo: true, singlePlayer: true,
  },
  {
    // پنالتی عمداً **بعد از** ضربه‌زن است — درخواست مالک: «بازی پنالتی
    // باید پایین ضربه زن باشه». ترتیب این آرایه همان ترتیبی است که
    // کاربر در فهرست بازی‌ها می‌بیند؛ هر دو کلاینت از همین می‌خوانند و
    // فهرست خودشان را هاردکد نمی‌کنند، پس جای درستِ تغییر چیدمان
    // همین‌جاست.
    id: 'penalty', title: 'ضربات پنالتی', emoji: 'football',
    subtitle: 'یکی می‌زند، یکی می‌گیرد', accent: '#38BDF8', minutes: 4,
    noBot: false, solo: false,
  },
  {
    id: 'card_duel', title: 'دوئل کارت‌ها', emoji: 'card',
    subtitle: 'سه کارت آماده کن؛ Ghost خودکار امتیاز می‌گیرد',
    accent: '#FFD166', minutes: 1,
    noBot: false, solo: true, singlePlayer: true,
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
