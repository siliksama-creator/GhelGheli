// Live five-card duel.
//
// Both players secretly choose one remaining card. When both choices are
// locked, the server resolves the round from authoritative card stats. Five
// rounds use five different focuses, so the strongest-looking card is not
// automatically the best card to play first.
const duel = require('../../services/cardDuelService');

const idOf = card => String(card?.cardTypeId || card?.id || '');

function demoCard(id, stat) {
  return {
    id, cardTypeId: id, name: id, pointValue: 100,
    attack: stat, defense: stat, speed: stat, technique: stat,
    goalChance: stat, energy: 100, rarity: 'normal', effect: 'none',
  };
}

// Dependency-free fixture for the generic engine contract/fuzz tests. Real
// rooms always use createWithContext and authoritative inventory decks.
function create() {
  return createFromDecks(
    [demoCard('test-x1', 70), demoCard('test-x2', 72), demoCard('test-x3', 74), demoCard('test-x4', 76), demoCard('test-x5', 78)],
    [demoCard('test-o1', 69), demoCard('test-o2', 71), demoCard('test-o3', 73), demoCard('test-o4', 75), demoCard('test-o5', 77)],
    { seed: 'fixture-seed' },
  );
}

function createFromDecks(deckX, deckO, { seed = 'duel-seed' } = {}) {
  if (!Array.isArray(deckX) || !Array.isArray(deckO)
      || deckX.length !== duel.DECK_SIZE || deckO.length !== duel.DECK_SIZE) {
    throw new Error('هر بازیکن باید ترکیب پنج‌کارتی معتبر داشته باشد');
  }
  const decks = {
    X: deckX.map(duel.publicCard),
    O: deckO.map(duel.publicCard),
  };
  return {
    decks,
    remaining: {
      X: decks.X.map(idOf),
      O: decks.O.map(idOf),
    },
    pending: {},
    score: { X: 0, O: 0 },
    roundIndex: 0,
    history: [],
    lastRound: null,
    previousWinner: null,
    seed,
  };
}

async function validatePlayer(user, { vsBot = false } = {}) {
  const prepared = await duel.deckCards(user?.id);
  if (vsBot && prepared.cards.length !== duel.DECK_SIZE) return duel.starterDeck();
  if (prepared.cards.length !== duel.DECK_SIZE) {
    const error = new Error('اول از صفحه دوئل کارت‌ها ترکیب پنج‌کارتی خودت را ذخیره کن');
    error.status = 400;
    throw error;
  }
  return prepared.cards;
}

async function createWithContext({ playerX, playerO, vsBot, seed = 'live-seed' }) {
  const own = await duel.deckCards(playerX?.id);
  const ownCards = own.cards.length === duel.DECK_SIZE
    ? own.cards
    : (vsBot ? duel.starterDeck() : []);
  if (ownCards.length !== duel.DECK_SIZE) {
    const error = new Error('اول ترکیب پنج‌کارتی خودت را ذخیره کن');
    error.status = 400;
    throw error;
  }
  if (vsBot) return createFromDecks(ownCards, duel.botDeck(ownCards), { seed });

  const opponent = await duel.deckCards(playerO?.id);
  if (opponent.cards.length !== duel.DECK_SIZE) {
    const error = new Error('حریف هنوز ترکیب پنج‌کارتی معتبر ندارد');
    error.status = 409;
    throw error;
  }
  return createFromDecks(own.cards, opponent.cards, { seed });
}

function isValidMove(state, move, player) {
  if (!['X', 'O'].includes(player) || !move || typeof move !== 'object') return false;
  if (state.roundIndex >= duel.DECK_SIZE || state.pending[player]) return false;
  const cardId = String(move.cardId || move.id || '');
  return cardId.length > 0 && state.remaining[player].includes(cardId);
}

function applyMove(state, move, player) {
  const cardId = String(move.cardId || move.id || '');
  state.pending[player] = cardId;
  if (!state.pending.X || !state.pending.O) return state;

  const cardX = state.decks.X.find(card => idOf(card) === state.pending.X);
  const cardO = state.decks.O.find(card => idOf(card) === state.pending.O);
  if (!cardX || !cardO) {
    state.pending = {};
    return state;
  }

  const roundSeed = `${state.seed || 'live'}:${state.roundIndex}:${state.pending.X}:${state.pending.O}:${state.previousWinner || 'start'}`;
  const resolved = duel.resolveRound(
    cardX, cardO, state.roundIndex, state.previousWinner, null, roundSeed,
  );
  state.remaining.X = state.remaining.X.filter(id => id !== state.pending.X);
  state.remaining.O = state.remaining.O.filter(id => id !== state.pending.O);
  state.history.push(resolved);

  // اسکوربورد از همان historyِ حکم‌ها مشتق می‌شود؛ دیگر یک شمارندهٔ دوم
  // نیست که بتواند از برندهٔ کارت جدا شود. این invariant قلبِ لوپ پنج‌گانه
  // است: برای X/O دقیقاً تعدادِ round.winnerهای همان سمت را می‌شماریم.
  state.score = duel.scoreFromHistory(state.history);
  resolved.scoreAfter = { ...state.score };
  resolved.pointAwardedTo = resolved.winner === 'DRAW' ? null : resolved.winner;
  state.lastRound = resolved;
  state.previousWinner = resolved.winner;
  state.roundIndex = state.history.length;
  state.pending = {};
  return state;
}

function result(state) {
  if (state.history.length < duel.DECK_SIZE) return null;
  const score = duel.scoreFromHistory(state.history);
  // همان منبعی که نتیجهٔ نهایی را می‌دهد، اسکوربورد را هم می‌سازد.
  state.score = score;
  if (score.X === score.O) return 'DRAW';
  return score.X > score.O ? 'X' : 'O';
}

function nextTurn() { return 'X'; }

function publicState(state, player) {
  const mine = ['X', 'O'].includes(player) ? player : 'X';
  const opponent = mine === 'X' ? 'O' : 'X';
  const score = duel.scoreFromHistory(state.history);
  return {
    logicVersion: 2,
    score,
    roundIndex: state.history.length,
    totalRounds: duel.DECK_SIZE,
    roundTitle: duel.ROUND_FOCUS[state.roundIndex]?.label || 'پایان نبرد',
    // ── معیارِ راندِ جاری، صریح و کامل ──
    //
    // گزارشِ مالک: «هر راند نوشته میشه که اون راند سر چی مبارزه میشه ولی
    // انقدر کوچیک بدون هیچ انیمیشنی هستش که باعث میشه اصلا دیده نشه».
    //
    // قبلاً فقط `roundTitle` (یک رشتهٔ کوتاه) می‌رفت. کلاینت برای اینکه
    // بتواند بنرِ بزرگ و انیمیشنی بسازد و روی هر کارت هم «همین عدد مهم
    // است» را نشان بدهد، به **کلیدِ ستون** هم نیاز دارد نه فقط برچسب.
    //
    // این همچنین سردرگمیِ دیگری را حل می‌کند که مالک گزارش کرد: «عدد ربات
    // با اینکه پایین‌تر نشون داده میشه راند رو اون میبره». علتش این بود
    // که کاربر عددِ «قدرتِ کلیِ کارت» را می‌دید ولی راند روی **یک ویژگیِ
    // خاص** داوری می‌شود. حالا کلاینت می‌تواند همان ویژگی را برجسته کند.
    //
    // `cry`/`hint`/`emoji` برای اعلانِ سینمایی وسطِ صفحه و راهنمای
    // سنِ پایین‌اند (توضیحِ کامل کنارِ ROUND_FOCUS در cardDuelService).
    roundFocus: duel.ROUND_FOCUS[state.roundIndex]
      ? {
        stat: duel.ROUND_FOCUS[state.roundIndex].stat,
        key: duel.ROUND_FOCUS[state.roundIndex].key,
        label: duel.ROUND_FOCUS[state.roundIndex].label,
        text: duel.ROUND_FOCUS[state.roundIndex].userText,
        cry: duel.ROUND_FOCUS[state.roundIndex].cry,
        hint: duel.ROUND_FOCUS[state.roundIndex].hint,
        icon: duel.ROUND_FOCUS[state.roundIndex].icon,
        index: state.roundIndex,
      }
      : null,
    myDeck: state.decks[mine],
    myRemainingCardIds: state.remaining[mine],
    myPendingCardId: state.pending[mine] || null,
    opponentRemainingCount: state.remaining[opponent].length,
    iChose: Boolean(state.pending[mine]),
    waitingForOpponent: Boolean(state.pending[mine]) && !state.pending[opponent],
    opponentLocked: Boolean(state.pending[opponent]),
    lastRound: state.lastRound,
    history: state.history,
  };
}

function botMove(state, player) {
  const remaining = state.remaining[player] || [];
  if (!remaining.length) return null;
  const cards = state.decks[player] || [];
  const focus = duel.ROUND_FOCUS[state.roundIndex] || duel.ROUND_FOCUS[duel.ROUND_FOCUS.length - 1];
  const finalRound = state.roundIndex === duel.DECK_SIZE - 1;
  const futureFocuses = duel.ROUND_FOCUS.slice(state.roundIndex + 1);
  const ranked = remaining
    .map(cardId => cards.find(card => idOf(card) === cardId))
    .filter(Boolean)
    .map(card => {
      const focusNow = duel.focusStatOf(card, focus);
      const futurePeak = futureFocuses.length
        ? Math.max(...futureFocuses.map(next => duel.focusStatOf(card, next)))
        : 0;
      const conservePenalty = !finalRound && futurePeak - focusNow >= 14 ? 9 : 0;
      // ربات هم دقیقاً با همان اعدادِ آشکارِ موتور تصمیم می‌گیرد؛ heuristic
      // قدیمی بونوس‌هایی تا ۲۰ و استات‌های نامرتبط فرض می‌کرد درحالی‌که
      // حکم واقعی فقط ویژگی همین راند + افکت آشکار است.
      const effectNow = ({
        speedster: state.roundIndex === 0 ? 6 : 0,
        playmaker: state.roundIndex > 0 && state.previousWinner === player ? 4 : 0,
        wall: state.roundIndex === 3 ? 6 : 0,
        finisher: finalRound ? 6 : 0,
        lucky_star: state.roundIndex >= 2 ? 3 : 0,
      })[card.effect] || 0;
      return {
        card,
        score: (focusNow + effectNow) * 3.1 - conservePenalty,
      };
    })
    .sort((a, b) => b.score - a.score);
  const pick = ranked.length > 1 && Math.random() < 0.14 ? ranked[1].card : ranked[0].card;
  return pick ? { cardId: idOf(pick) } : null;
}

async function onFinish({ matchId, players, state, winner, stake, netPot, vsBot, matchMode }) {
  return duel.recordEngineBattle({
    matchId,
    playerX: players?.X,
    playerO: players?.O,
    state,
    winner,
    stake,
    netPot,
    vsBot,
    matchMode,
  });
}

module.exports = {
  id: 'card_duel',
  title: 'دوئل کارت‌ها',
  turnMs: 20000,
  // ═══════════════════════════════════════════════════════════════════════
  // کلیدِ ساعتِ راند — فقط در انتقالِ راند عوض می‌شود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // موتور بعد از هر قفلِ کارت `armTurnClock` را صدا می‌زند. با این کلید،
  // قفلِ وسطِ راند نمی‌تواند ساعت را ریست کند یا مکثِ نتیجهٔ راندِ قبل
  // را دوباره صادر کند — وگرنه صحنهٔ برخوردِ راندِ قبلی (با کارتِ برنده)
  // وسطِ راندِ جدید دوباره پخش می‌شد. طولِ `history` فقط وقتی عوض می‌شود
  // که هر دو طرف قفل کرده باشند و راند واقعاً حل شده باشد.
  clockKey: state => (Array.isArray(state.history) ? state.history.length : 0),
  // ── مهلتِ خواندنِ اعلانِ راند ──
  //
  // خواستهٔ مالک: «انیمیشن مییاد رو چند ثانیه بدون اینکه تایمر بره نگه
  // دار که کاربر بتونه بخونه».
  //
  // صحنهٔ مستقل ۲.۸ ثانیه معیار را نگه می‌دارد و با ضرب‌های ۳،۲،۱ به
  // انتخاب تحویل می‌دهد؛ ۰.۲ ثانیه حاشیهٔ شبکه مانع شروع زودهنگام است.
  introMs: 3000,
  // ── مکثِ تماشای نتیجهٔ راند ──
  //
  // گزارشِ مالک: «اون لحظه‌ای که مبارزه تو راندو میگه برای راند ها
  // سریع میاد بدون اینکه لود بشه میره».
  //
  // برخورد تا حکم ۱.۹ ثانیه طول می‌کشد. مکث ۳.۲ ثانیه یعنی حکم مینیمال
  // ۱.۳ ثانیه کامل دیده می‌شود، بدون اینکه لوپ پنج‌گانه کش‌دار شود.
  // نگهبان: `scripts/testCardDuelPacing.js`.
  resultHoldMs: 3200,
  simultaneous: true,
  create,
  createFromDecks,
  validatePlayer,
  createWithContext,
  isValidMove,
  applyMove,
  result,
  nextTurn,
  publicState,
  botMove,
  onFinish,
};
