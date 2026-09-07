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

  // ── دوئل طوفان (logicVersion 3) ──
  const isStorm = round.mod === 'storm';
  const overtime = round.overtime || null;
  // شانسِ من/حریف برای چیپِ روی کارت (در وقت اضافه از overtime خوانده می‌شود).
  const myLuck = overtime
    ? num(mineIsO ? overtime.luckO : overtime.luckX)
    : num(mineIsO ? round.luckO : round.luckX);
  const theirLuck = overtime
    ? num(mineIsO ? overtime.luckX : overtime.luckO)
    : num(mineIsO ? round.luckX : round.luckO);
  const luckRange = overtime ? num(overtime.luckRange) : num(round.luckRange);
  // امتیازی که از این راند به من/حریف رسید (عادی ۱، طوفانی/وقت اضافه ۲).
  const myAward = num(mineIsO ? round.awardO : round.awardX);
  const theirAward = num(mineIsO ? round.awardX : round.awardO);
  // در وقت اضافه، قدرتِ کل ترکیب به‌جای قدرتِ تک‌کارت می‌نشیند.
  const mySquad = overtime ? num(mineIsO ? overtime.baseO : overtime.baseX) : null;
  const theirSquad = overtime ? num(mineIsO ? overtime.baseX : overtime.baseO) : null;

  return {
    mine, theirs, myPower, theirPower, myFocus, theirFocus,
    myBreakdown, theirBreakdown, mineWon, draw, contractValid,
    isStorm, overtime, myLuck, theirLuck, luckRange,
    myAward, theirAward, mySquad, theirSquad,
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
export function matchTension({ score, roundIndex, totalRounds = 5, me = 'X', storm = null, history = null }) {
  const opponent = me === 'X' ? 'O' : 'X';
  const mineScore = num(score?.[me]);
  const theirScore = num(score?.[opponent]);
  const total = num(totalRounds) || 5;
  const playedRounds = Math.max(num(roundIndex), Array.isArray(history) ? history.length : 0);
  const roundsLeft = Math.max(0, total - playedRounds);

  if (roundsLeft <= 0) return { level: 'calm', matchPoint: null, decider: false };

  // حداکثر امتیازی که از راندهای باقی‌مانده می‌آید: در طوفان راندهای
  // دوامتیازی ۲ می‌دهند، بقیه ۱. الگو از بک‌اند می‌آید (storm[i]).
  let pointsLeft = 0;
  for (let i = playedRounds; i < total; i++) {
    pointsLeft += (storm && storm[i]) ? 2 : 1;
  }
  // اگر الگو در دسترس نبود (کلاینت قدیمی/کلاسیک)، ساده‌انگارانه هر راند ۱.
  if (!storm) pointsLeft = roundsLeft;

  const lead = mineScore - theirScore;
  const absLead = Math.abs(lead);
  // اگر بیشترین امتیازِ ممکنِ حریف هم فاصله را پر نکند، نتیجه قفل شده.
  // حریف حداکثر pointsLeft می‌گیرد و ما صفر: پس برتریِ > pointsLeft قفل است.
  if (absLead > pointsLeft) return { level: 'calm', matchPoint: null, decider: false };

  const thisRoundMax = (storm && storm[playedRounds]) ? 2 : 1;

  // راندِ آخر و امتیاز برابر: همه‌چیز روی یک راند (که ممکن است دوامتیازی باشد).
  if (roundsLeft === 1 && mineScore === theirScore) {
    return { level: 'decider', matchPoint: null, decider: true };
  }

  // «توپِ مسابقه»: فردِ جلو با بردنِ این راند به امتیازی برسد که حریف حتی
  // با تمامِ راندهای بعدی نتواند جبران کند.
  const leaderAhead = lead > 0 ? 'mine' : lead < 0 ? 'theirs' : null;
  if (leaderAhead && (absLead + thisRoundMax) > (pointsLeft - thisRoundMax)) {
    return { level: 'critical', matchPoint: leaderAhead, decider: false };
  }

  // نبردِ نزدیک در نیمهٔ دوم.
  if (roundsLeft <= 2 || (absLead === 0 && playedRounds >= 2)) {
    return { level: 'heated', matchPoint: null, decider: false };
  }

  return { level: 'calm', matchPoint: null, decider: false };
}
