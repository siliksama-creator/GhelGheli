const num = value => Number(value || 0);

/**
 * تنها آداپتر X/O به «من/حریف» در وب. تمام صحنه، تایم‌لاین و آنلاین از
 * همین تابع عبور می‌کنند تا جای کارت، عدد و برنده هرگز جداگانه flip نشود.
 */
export function roundForViewer(round, me = 'X') {
  const mineIsO = me === 'O';
  const mine = mineIsO ? round.cardO : round.cardX;
  const theirs = mineIsO ? round.cardX : round.cardO;
  const myPower = num(mineIsO ? round.powerO : round.powerX);
  const theirPower = num(mineIsO ? round.powerX : round.powerO);
  const myFocus = num(mineIsO ? round.focusStatO : round.focusStatX);
  const theirFocus = num(mineIsO ? round.focusStatX : round.focusStatO);
  const myBreakdown = (mineIsO ? round.breakdownO : round.breakdownX) || {};
  const theirBreakdown = (mineIsO ? round.breakdownX : round.breakdownO) || {};
  const mineWon = round.winner === me;
  const draw = round.winner === 'DRAW';
  const contractValid = draw
    ? myPower === theirPower
    : mineWon ? myPower > theirPower : theirPower > myPower;
  return {
    mine, theirs, myPower, theirPower, myFocus, theirFocus,
    myBreakdown, theirBreakdown, mineWon, draw, contractValid,
  };
}

/** همان جدول قطعیِ افکت که موتور Backend اجرا می‌کند. */
export function roundEffectBonus(card, roundIndex, previousRoundWon) {
  const effect = card?.effect || card?.duel_effect || 'none';
  if (effect === 'speedster' && roundIndex === 0) return 6;
  if (effect === 'playmaker' && roundIndex > 0 && previousRoundWon) return 4;
  if (effect === 'wall' && roundIndex === 3) return 6;
  if (effect === 'finisher' && roundIndex === 4) return 6;
  if (effect === 'lucky_star' && roundIndex >= 2) return 3;
  return 0;
}

export function matchVerdictForViewer({ winner, me = 'X', finishReason = null, opponentRole = 'حریف' }) {
  const draw = winner === 'DRAW';
  const iWon = winner === me;
  const label = draw
    ? 'برابر؛ بدون امتیاز'
    : iWon
      ? (finishReason === 'disconnect' ? 'برد فنی برای تو' : 'تو برنده‌ای')
      : (finishReason === 'disconnect'
        ? `برد فنی برای ${opponentRole}`
        : `${opponentRole} برنده شد`);
  return { draw, iWon, label };
}

/** MVP = بزرگ‌ترین برد واقعیِ یک راند، نه بزرگ‌ترین power تزئینی کارت. */
export function resultMvp(state) {
  const performances = (state?.history || []).flatMap(round => {
    if (!['X', 'O'].includes(round?.winner)) return [];
    const winner = round.winner;
    const card = round[`card${winner}`];
    if (!card) return [];
    return [{
      ...card,
      mvpRound: num(round.round),
      mvpRoundPower: num(round[`power${winner}`]),
      mvpMargin: num(round.powerGap),
    }];
  });
  return performances.sort((a, b) => b.mvpMargin - a.mvpMargin
    || b.mvpRoundPower - a.mvpRoundPower)[0] || null;
}
