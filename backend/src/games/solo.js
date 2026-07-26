// Solo "time-attack" mode: play alone against the clock, chase your own record.
//
// Why this exists: جفت‌یاب has no bot opponent (a computer with perfect recall
// is not a fun memory rival, and a deliberately forgetful one is theatre). So
// when nobody else is online the player is offered THIS instead — same board,
// same rules, but scored on time + flips rather than on points.
//
// Deliberately awards ZERO points. Solo cannot be refereed by an opponent, so
// letting it touch the balance would be a free points farm. The reward is the
// record itself, plus a place on the public leaderboard.
//
// Server-authoritative on purpose: the deck, the clock and the flip counter
// all live here. A client that owned its own timer could post a 0.4s "record"
// and there would be no way to tell.
const crypto = require('crypto');

/// Give up on an abandoned run after this long. Without it a player who
/// closes the app mid-game leaves a room (and its deck) in memory forever.
const SOLO_MAX_MS = 15 * 60 * 1000;

/// A run shorter than this for a full 8-pair board is not physically
/// possible — it means a tampered client replaying moves instantly. We still
/// let the player finish, we just refuse to file the "record".
const MIN_PLAUSIBLE_MS = 3000;

const runs = new Map(); // socket.id -> run

function db() {
  try {
    return require('../services/soloRecordService');
  } catch {
    return null;
  }
}

function view(run) {
  const s = run.rules.decorate(run.state, 'X');
  return {
    ...s,
    flips: run.state.totalFlips || 0,
    elapsedMs: Date.now() - run.startedAt,
  };
}

function clear(socketId) {
  const run = runs.get(socketId);
  if (!run) return;
  clearTimeout(run.reaper);
  runs.delete(socketId);
}

function attachSolo(io, rulesById) {
  io.on('connection', socket => {
    if (!socket.user) return;

    socket.on('solo:start', payload => {
      try {
        const gameId = (payload && typeof payload === 'object' && payload.gameId) || '';
        const rules = rulesById[gameId];
        if (!rules || !rules.solo) {
          return socket.emit('solo:error', { message: 'این بازی حالت تک‌نفره ندارد' });
        }
        clear(socket.id); // restarting replaces any previous run
        const run = {
          id: crypto.randomUUID(),
          gameId,
          rules,
          state: rules.create(),
          startedAt: Date.now(),
          done: false,
        };
        // Self-cleaning: an abandoned run must not pin its deck in memory.
        run.reaper = setTimeout(() => clear(socket.id), SOLO_MAX_MS);
        runs.set(socket.id, run);
        socket.emit('solo:start', {
          runId: run.id,
          gameId,
          state: view(run),
        });
      } catch (e) {
        console.error('[solo] start failed:', e.message);
      }
    });

    socket.on('solo:move', payload => {
      try {
        if (!payload || typeof payload !== 'object') return;
        const run = runs.get(socket.id);
        if (!run || run.done) return;
        const move = Number(payload.move);
        if (!Number.isInteger(move)) return;
        if (!run.rules.isValidMove(run.state, move, 'X')) return;

        run.rules.applyMove(run.state, move, 'X');

        // Solo has a single player, so every pair belongs to them and the
        // shared `result()` returns their symbol once the board is cleared.
        const finished = run.rules.result(run.state);
        if (!finished) {
          return socket.emit('solo:update', { state: view(run) });
        }

        run.done = true;
        const durationMs = Date.now() - run.startedAt;
        const flips = run.state.totalFlips || 0;
        const finalState = view(run);
        clear(socket.id);

        const service = db();
        const plausible = durationMs >= MIN_PLAUSIBLE_MS;
        const save = service && plausible
          ? service.submitRun({
            userId: socket.user.id,
            gameId: run.gameId,
            durationMs,
            flips,
          })
          : Promise.resolve({ isRecord: false, best: null, rank: null });

        save
          .then(outcome => {
            socket.emit('solo:over', {
              state: finalState,
              durationMs,
              flips,
              // Perfect run = every card flipped exactly twice.
              perfect: flips === (run.rules.SIZE || 0),
              ...outcome,
            });
          })
          .catch(e => {
            console.error('[solo] saving record failed:', e.message);
            // The player still finished — never swallow the result just
            // because the database hiccuped.
            socket.emit('solo:over', {
              state: finalState, durationMs, flips, isRecord: false, best: null,
            });
          });
      } catch (e) {
        console.error('[solo] move failed:', e.message);
      }
    });

    socket.on('solo:leave', () => clear(socket.id));
    socket.on('disconnect', () => clear(socket.id));
  });
}

module.exports = { attachSolo, SOLO_MAX_MS, MIN_PLAUSIBLE_MS, runs };
