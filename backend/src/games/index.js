// Game registry. Adding a game = drop a rules file in ./rules and list it
// here; the engine and the client hub pick it up automatically.
const attachGames = require('./engine');
const { attachSolo } = require('./solo');

const memory = require('./rules/memory');
const penalty = require('./rules/penalty');
const cardDuel = require('./rules/cardDuel');

// Snakes & Ladders was retired: keeping the board legible needed constant
// artwork tuning, and it was ultimately dice-driven. Connect Four (چهار در
// یک ردیف) was also retired on the owner's request — it contributed little
// and duplicated Reversi's two-player-tactics slot. جفت‌یاب (memory) puts
// purpose-made 3D football icons on a 3D card-flip and rewards real skill
// (a match keeps your turn).
//
// نکته دربارهٔ ربات جفت‌یاب: جفت‌یاب در مسابقهٔ **جدّی** حریفِ کامپیوتریِ
// حریص ندارد (حریفِ با حافظهٔ کامل خوش نمی‌گذرد)، ولی برای اینکه کاربرِ
// تنها نماند، دو مسیر دارد: حالت تک‌نفرهٔ time-attack و یک **رباتِ تمرینیِ
// نرم‌تر** (فقط در اتاقِ تمرین، حافظهٔ کوتاه + خطای عمدی — جزئیات در
// rules/memory.js، PRACTICE_BOT_MEMORY). پس فیلدِ `noBot:false` عمدی است.
const RULES = { memory, penalty, card_duel: cardDuel };

// کاتالوگِ عمومی از طریق REST سرو می‌شود. ترتیب این آرایه عمداً **همان
// ترتیبی است که هر دو کلاینت در هابِ بازی رندر می‌کنند**
// (userweb/src/games.jsx و mobile/.../games_page.dart): ضربه‌زن، پنالتی،
// دوئل کارت‌ها، جفت‌یاب.
//
// ⚠️ واقعیتِ معماری (دورِ ۲۶ اصلاح شد): کلاینت‌ها هاب‌شان را به‌خاطر
//    دارایی/رنگ/توضیحِ مخصوصِ هر پلتفرم به‌صورت محلی فهرست می‌کنند و
//    این endpoint عمدتاً مرجعِ متادیتا/سلامت است (و تستِ testE2E آن را
//    می‌خواند). برای همین ترتیب و مجموعه باید اینجا با فهرستِ کلاینت‌ها
//    هماهنگ بماند؛ اگر بازی‌ای اضافه/حذف/جابه‌جا شد، هر سه‌جا را با هم
//    به‌روز کن (این فایل + هاب وب + هاب اندروید).
const CATALOG = [
  {
    // Single-player: no lobby, no socket room, no rules file — it lives
    // entirely in the clients plus the signed-progress endpoint.
    id: 'tap', title: 'ضربه‌زن', emoji: 'fist',
    subtitle: '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', accent: '#84CC16',
    minutes: 3,
    noBot: false, solo: true, singlePlayer: true,
  },
  {
    // پنالتی عمداً **بعد از** ضربه‌زن است — درخواست مالک: «بازی پنالتی
    // باید پایین ضربه زن باشه».
    id: 'penalty', title: 'ضربات پنالتی', emoji: 'football',
    subtitle: 'یکی می‌زند، یکی می‌گیرد', accent: '#38BDF8', minutes: 4,
    noBot: false, solo: false,
  },
  {
    id: 'card_duel', title: 'دوئل کارت‌ها', emoji: 'card',
    subtitle: 'پنج راند زنده با کارت‌های کلکسیونی',
    accent: '#FFD166', minutes: 2,
    noBot: false, solo: false,
  },
  {
    id: 'memory', title: 'جفت‌یاب', emoji: 'card',
    subtitle: 'جفت‌ها را به خاطر بسپار و ببر', accent: '#A855F7', minutes: 4,
    // مسابقهٔ جدّی فقط با حریف واقعی؛ برای بازیِ تنها، رباتِ تمرینیِ نرم یا
    // time-attack تک‌نفره هست.
    noBot: false, solo: true,
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
