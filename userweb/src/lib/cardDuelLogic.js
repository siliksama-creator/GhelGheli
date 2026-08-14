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

// ═══════════════════════════════════════════════════════════════════════════
//  کشش نبرد (match tension)
// ═══════════════════════════════════════════════════════════════════════════
//
// مشکلی که این حل می‌کند: راندِ پنجم وقتی امتیاز ۲-۲ است، دقیقاً همان‌قدر
// آرام به نظر می‌رسد که راندِ اول. صحنه نمی‌داند کِی سرنوشت‌ساز است، پس
// هیجانِ لحظهٔ حساس را به کاربر منتقل نمی‌کند.
//
// این تابع «حرارتِ» راندِ پیشِ‌رو را از وضعیتِ واقعیِ نبرد حساب می‌کند و
// همان را به CSS می‌دهد تا شدتِ نور/ضربان/لرزش بالا برود. هیچ متنی اضافه
// نمی‌کند — فقط زبانِ دیداری. (خواستهٔ مالک: بدون متنِ اضافه.)
//
// قواعدِ واقعیِ بازی که این‌جا مدل شده‌اند (از rules/cardDuel.js):
//   • ۵ راند، هر راند یک امتیاز، برنده = امتیاز بیشتر در پایان.
//   • مساوی ممکن است؛ پس «بردِ قطعی» یعنی امتیاز > نیمِ راندهای باقی‌مانده.
//
// سطح‌ها به ترتیبِ شدت:
//   calm      → نبرد تازه شروع شده یا فاصله زیاد است.
//   heated    → یک‌قدم تا تعیینِ تکلیف؛ راندهای میانیِ نزدیک.
//   critical  → این راند می‌تواند نبرد را تمام کند (توپِ مسابقه).
//   decider   → راندِ آخر و امتیاز برابر؛ همه‌چیز روی یک کارت.
export function matchTension({ score, roundIndex, totalRounds = 5, me = 'X' }) {
  const opponent = me === 'X' ? 'O' : 'X';
  const mineScore = num(score?.[me]);
  const theirScore = num(score?.[opponent]);
  const played = mineScore + theirScore;
  const total = num(totalRounds) || 5;
  // راندهایی که هنوز بازی نشده‌اند، شاملِ همینی که در جریان است.
  const remaining = Math.max(0, total - Math.max(num(roundIndex), played));

  if (remaining <= 0) return { level: 'calm', matchPoint: null, decider: false };

  const lead = Math.abs(mineScore - theirScore);
  // اگر فاصله از راندهای باقی‌مانده بیشتر باشد، نتیجه ریاضی‌وار قفل شده.
  if (lead > remaining) return { level: 'calm', matchPoint: null, decider: false };

  // راندِ آخر با امتیازِ برابر: تنها حالتی که یک کارت همه‌چیز را می‌برد.
  if (remaining === 1 && mineScore === theirScore) {
    return { level: 'decider', matchPoint: null, decider: true };
  }

  // «توپِ مسابقه»: کسی که جلوست، با بردِ همین راند دیگر قابلِ جبران نیست.
  // بردِ این راند → lead+1 در برابر remaining-1 راندِ باقی‌مانده.
  const leaderCanSeal = lead >= 1 && (lead + 1) > (remaining - 1);
  if (leaderCanSeal) {
    return {
      level: 'critical',
      matchPoint: mineScore > theirScore ? 'mine' : 'theirs',
      decider: false,
    };
  }

  // نبردِ نزدیک در نیمهٔ دوم: گرم اما هنوز سرنوشت‌ساز نیست.
  if (remaining <= 2 || (lead === 0 && played >= 2)) {
    return { level: 'heated', matchPoint: null, decider: false };
  }

  return { level: 'calm', matchPoint: null, decider: false };
}
