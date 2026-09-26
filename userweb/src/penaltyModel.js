// Pure state adapter shared by the web penalty renderer and its parity test.
// The backend is authoritative; the browser must never infer a permanent role
// from X/O because shooter and keeper swap after every kick.
//
// `sweet` (the golden window) was removed: the server never let shot power
// affect the outcome, so surfacing it here made the UI promise a skill that
// did not exist. The only rule is shot zone == dive zone -> save, else goal.

// ── هندسهٔ دروازه: ۳ ستون × ۲ ردیف = ۶ ناحیه ──
//
//     ۰  ۱  ۲      بالا
//     ۳  ۴  ۵      پایین
//
// ⚠️ باید با `backend/src/games/rules/penalty.js` و
//    `mobile/lib/screens/user/games/penalty_board.dart` یکی بماند.
//    گاردِ `game-parity` و تست‌های پنالتی روی همین اعداد قفل‌اند.
export const ZONE_COLS = 3;
export const ZONE_ROWS = 2;
export const ZONES = ZONE_COLS * ZONE_ROWS;

export function penaltyView(state = {}, mySymbol = 'X') {
  const me = mySymbol || 'X';
  const foe = me === 'X' ? 'O' : 'X';
  const role = state.role || (state.shooter === me ? 'shooter' : 'keeper');
  const score = state.score || {};
  const taken = state.taken || {};
  const suddenDeath = state.suddenDeath === true;
  return {
    me,
    foe,
    amShooter: role === 'shooter',
    alreadyChose: state.iChose === true,
    waiting: state.waitingForOpponent === true,
    myScore: Number(score[me] || 0),
    foeScore: Number(score[foe] || 0),
    myTaken: Number(taken[me] || 0),
    foeTaken: Number(taken[foe] || 0),
    history: Array.isArray(state.history) ? state.history : [],
    lastKick: state.lastKick || null,
    suddenDeath,
    // وقتِ اضافه یعنی بازی از ۵ ضربه گذشته و دارد راندبه‌راند ادامه پیدا
    // می‌کند تا یکی برتر شود؛ رابط باید این را نشان دهد وگرنه کاربر
    // فکر می‌کند بازی تمام شده و دوباره دارد شروع می‌شود.
    extraRound: suddenDeath,
  };
}

// Flutter AnimationController(duration: 900ms)..repeat(reverse:true), mapped
// to the same 0.35..1 power range used by penalty_board.dart.
export function penaltyPowerAt(elapsedMs) {
  const cycle = ((Number(elapsedMs) || 0) % 1800 + 1800) % 1800;
  const t = cycle <= 900 ? cycle / 900 : (1800 - cycle) / 900;
  return 0.35 + t * 0.65;
}

export function zoneCenter(zone, width, height) {
  const z = Math.max(0, Math.min(ZONES - 1, Number(zone) || 0));
  const goalW = width * 0.78;
  const goalH = height * 0.46;
  const left = (width - goalW) / 2;
  const top = height * 0.06;
  return {
    x: left + goalW * ((z % ZONE_COLS) + 0.5) / ZONE_COLS,
    y: top + goalH * (Math.floor(z / ZONE_COLS) + 0.5) / ZONE_ROWS,
  };
}
