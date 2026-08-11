// Pure state adapter shared by the web penalty renderer and its parity test.
// The backend is authoritative; the browser must never infer a permanent role
// from X/O because shooter and keeper swap after every kick.
export function penaltyView(state = {}, mySymbol = 'X') {
  const me = mySymbol || 'X';
  const foe = me === 'X' ? 'O' : 'X';
  const role = state.role || (state.shooter === me ? 'shooter' : 'keeper');
  const score = state.score || {};
  const taken = state.taken || {};
  const sweet = state.sweet && Number.isFinite(Number(state.sweet.min))
    && Number.isFinite(Number(state.sweet.max))
    ? { min: Number(state.sweet.min), max: Number(state.sweet.max) }
    : null;
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
    suddenDeath: state.suddenDeath === true,
    sweet,
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
  const z = Math.max(0, Math.min(8, Number(zone) || 0));
  const goalW = width * 0.78;
  const goalH = height * 0.46;
  const left = (width - goalW) / 2;
  const top = height * 0.06;
  return {
    x: left + goalW * ((z % 3) + 0.5) / 3,
    y: top + goalH * (Math.floor(z / 3) + 0.5) / 3,
  };
}
