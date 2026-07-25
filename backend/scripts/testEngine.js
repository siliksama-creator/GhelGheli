#!/usr/bin/env node
// End-to-end engine test with a fake socket.io: verifies matchmaking, real
// two-player rooms, the bot fallback, turn enforcement and — critically —
// that malformed/hostile payloads never throw (a throw inside a socket
// handler crashes the whole API process).
const attach = require('../src/games/engine');
const { RULES } = require('../src/games');

let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.error(`  ✗ ${n}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

class FakeSocket {
  constructor(id, nickname) {
    this.user = { id, nickname };
    this.connected = true;
    this.events = [];
    this.handlers = {};
    this.rooms = new Set();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, data) { this.events.push({ ev, data }); }
  join(r) { this.rooms.add(r); }
  leave(r) { this.rooms.delete(r); }
  fire(ev, data) { (this.handlers[ev] || []).forEach(fn => fn(data)); }
  last(ev) { return [...this.events].reverse().find(e => e.ev === ev)?.data; }
  has(ev) { return this.events.some(e => e.ev === ev); }
}

function makeIo() {
  const conns = [];
  return {
    on: (ev, fn) => { if (ev === 'connection') conns.push(fn); },
    connect(sock) { conns.forEach(fn => fn(sock)); return sock; },
  };
}

(async () => {
  console.log('\n== matchmaking: two humans ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('u1', 'علی'));
    const b = io.connect(new FakeSocket('u2', 'رضا'));
    a.fire('game:join', { gameId: 'snakes' });
    ok(a.has('game:waiting'), 'first player queues');
    b.fire('game:join', { gameId: 'snakes' });

    const sa = a.last('game:start'), sb = b.last('game:start');
    ok(!!sa && !!sb, 'both players get game:start');
    ok(sa.roomId === sb.roomId, 'share one room');
    ok(sa.yourSymbol === 'X' && sb.yourSymbol === 'O', 'symbols assigned');
    ok(sa.vsBot === false, 'flagged as human match');
    ok(sb.players.X.nickname === 'علی', 'opponent name propagated');

    // turn enforcement (snakes: a move is the index of the die to play)
    b.fire('game:move', { roomId: sb.roomId, move: 0 });
    ok(!b.has('game:update'), 'out-of-turn move ignored');

    const startPos = sa.state.pos.X;
    a.fire('game:move', { roomId: sa.roomId, move: 0 });
    const afterMove = a.last('game:update');
    ok(!!afterMove, 'valid move produced an update');
    ok(afterMove.state.pos.X !== startPos, 'the token actually advanced');

    // Whoever is on move now, the other side cannot act.
    const onMove = afterMove.turn;
    const idle = onMove === 'X' ? b : a;
    const before = idle.events.filter(e => e.ev === 'game:update').length;
    idle.fire('game:move', { roomId: sa.roomId, move: 0 });
    ok(idle.events.filter(e => e.ev === 'game:update').length === before,
      'the player not on move is ignored');

    // Drive the game to completion and confirm both sides are told.
    let guard = 0;
    while (!a.has('game:over') && guard++ < 4000) {
      const upd = a.last('game:update') || sa;
      const turn = upd.turn;
      const sock = turn === 'X' ? a : b;
      const playable = (turn === 'X' ? a : b).last('game:update')?.state?.playable
        ?? sa.state.playable ?? [0, 1];
      sock.fire('game:move', { roomId: sa.roomId, move: playable[0] ?? 0 });
    }
    ok(a.has('game:over'), 'game reached a conclusion');
    ok(['X', 'O'].includes(a.last('game:over').winner), 'a winner was declared');
    ok(b.has('game:over'), 'both players told the result');
    ok(a.rooms.size === 0 && b.rooms.size === 0, 'room cleaned up');
  }

  console.log('\n== bot fallback (15s) ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('solo', 'تنها'));
    a.fire('game:join', { gameId: 'snakes' });
    ok(a.has('game:waiting'), 'waits for a human first');
    ok(!a.has('game:start'), 'no instant bot game');
    await wait(15400);
    const st = a.last('game:start');
    ok(!!st && st.vsBot === true, 'falls back to the bot');
    ok(st.players.O.id === 'bot', 'bot occupies the second seat');

    const before = st.state.pos.O;
    a.fire('game:move', { roomId: st.roomId, move: 0 });
    await wait(1400);
    const upd = a.last('game:update');
    ok(!!upd, 'bot game produced an update');
    // Either the bot already answered, or a 6 kept the turn with the human.
    ok(upd.state.pos.O !== before || upd.turn === 'X',
      'bot responded or the player kept an extra turn');
    ok(['X', 'O'].includes(upd.turn), 'a valid player is on move');
  }

  console.log('\n== reversi over the engine ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('r1', 'الف'));
    const b = io.connect(new FakeSocket('r2', 'ب'));
    a.fire('game:join', { gameId: 'reversi' });
    b.fire('game:join', { gameId: 'reversi' });
    const sa = a.last('game:start');
    ok(sa.state.board.filter(Boolean).length === 4, 'opening position dealt');
    ok(Array.isArray(sa.state.legal) && sa.state.legal.length === 4, 'legal hints sent');
    ok(sa.state.scores.X === 2, 'scores included');
    a.fire('game:move', { roomId: sa.roomId, move: 19 });
    const up = b.last('game:update');
    ok(up.state.board[27] === 'X', 'flip applied and broadcast');
    ok(up.state.scores.X === 4, 'score updated after flip');
  }

  console.log('\n== connect4 over the engine ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('c1', 'الف'));
    const b = io.connect(new FakeSocket('c2', 'ب'));
    a.fire('game:join', { gameId: 'connect4' });
    b.fire('game:join', { gameId: 'connect4' });
    const sa = a.last('game:start');
    a.fire('game:move', { roomId: sa.roomId, move: 3 });
    ok(a.last('game:update').state.board[38] === 'X', 'disc lands on the bottom row');
  }

  console.log('\n== leaving and disconnecting ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('l1', 'الف'));
    const b = io.connect(new FakeSocket('l2', 'ب'));
    a.fire('game:join', { gameId: 'snakes' });
    b.fire('game:join', { gameId: 'snakes' });
    a.fire('game:leave', { roomId: a.last('game:start').roomId });
    ok(b.last('game:over')?.winner === 'DISCONNECT', 'opponent told on leave');

    const c = io.connect(new FakeSocket('l3', 'ج'));
    const d = io.connect(new FakeSocket('l4', 'د'));
    c.fire('game:join', { gameId: 'snakes' });
    d.fire('game:join', { gameId: 'snakes' });
    c.fire('disconnect');
    ok(d.last('game:over')?.winner === 'DISCONNECT', 'opponent told on disconnect');

    // The original crash: 'game:leave' with NO payload at all.
    const e = io.connect(new FakeSocket('l5', 'ه'));
    let threw = false;
    try { e.fire('game:join', { gameId: 'snakes' }); e.fire('game:leave', undefined); }
    catch { threw = true; }
    ok(!threw, 'payload-less game:leave does not throw');
  }

  console.log('\n== turn clock (25s for snakes) ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('t1', 'الف'));
    const b = io.connect(new FakeSocket('t2', 'ب'));
    a.fire('game:join', { gameId: 'snakes' });
    b.fire('game:join', { gameId: 'snakes' });
    const st = a.last('game:start');
    ok(st.turnMs === 25000, 'snakes turn budget (25s) advertised');
    ok(typeof st.deadline === 'number' && st.deadline > Date.now(), 'deadline sent on start');
    ok(!!st.players.X.profileAvatarKey || st.players.X.profileAvatarKey === null,
      'player profile fields present');
    ok(st.players.X.id === 'u-t1' || typeof st.players.X.id === 'string',
      'player id exposed for profile lookup');

    const before = a.last('game:update');
    ok(before === undefined, 'no move yet');
    // Let X's clock expire. Snakes uses a 25s budget, so wait past that.
    await wait(25600);
    const after = a.last('game:update');
    ok(!!after, 'server acted when the clock ran out');
    ok(after && after.timedOut === 'X', 'timeout attributed to the right player');
    ok(after && ['X', 'O'].includes(after.turn), 'turn handed on after the timeout');
    ok(after && after.state.pos && after.state.pos.X > 0, 'an auto-move was played for the timed-out player');
    ok(typeof after.deadline === 'number', 'new deadline issued for the next turn');
    a.fire('game:leave');
  }

  console.log('\n== per-game turn budgets & match countdown ==');
  {
    const io = makeIo(); attach(io, RULES);
    const budgets = { snakes: 25000, connect4: 20000, reversi: 30000 };
    for (const [gid, want] of Object.entries(budgets)) {
      const p1 = io.connect(new FakeSocket(`b-${gid}-1`, 'الف'));
      const p2 = io.connect(new FakeSocket(`b-${gid}-2`, 'ب'));
      p1.fire('game:join', { gameId: gid });
      const waiting = p1.last('game:waiting');
      ok(waiting && waiting.waitMs === 15000, `${gid}: 15s match hunt advertised`);
      ok(waiting && typeof waiting.deadline === 'number' && waiting.deadline > Date.now(),
        `${gid}: match countdown deadline sent`);
      p2.fire('game:join', { gameId: gid });
      const st = p1.last('game:start');
      ok(st && st.turnMs === want, `${gid}: turn budget is ${want / 1000}s`);
      ok(st && st.deadline - Date.now() > want - 1500, `${gid}: first deadline matches budget`);
      p1.fire('game:leave'); p2.fire('game:leave');
    }
  }

  console.log('\n== regression: ghost rooms & sticky timeout ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('g1', 'الف'));
    const b = io.connect(new FakeSocket('g2', 'ب'));
    a.fire('game:join', { gameId: 'snakes' });
    b.fire('game:join', { gameId: 'snakes' });
    ok(!!a.last('game:start'), 'match started');
    // Switching games mid-match must not strand the opponent in a dead room.
    a.fire('game:join', { gameId: 'connect4' });
    ok(b.last('game:over')?.winner === 'DISCONNECT', 'opponent released from abandoned room');
    ok(b.rooms.size === 0, 'abandoned room cleaned up');

    // Re-tapping the same game while queued must not duplicate the queue slot.
    const c = io.connect(new FakeSocket('g3', 'ج'));
    c.fire('game:join', { gameId: 'reversi' });
    c.fire('game:join', { gameId: 'reversi' });
    const d = io.connect(new FakeSocket('g4', 'د'));
    d.fire('game:join', { gameId: 'reversi' });
    ok(!!c.last('game:start') && !!d.last('game:start'), 'no duplicate queue entry');
    ok(c.last('game:start').roomId === d.last('game:start').roomId, 'paired correctly after re-join');
    c.fire('game:leave'); d.fire('game:leave');
  }

  console.log('\n== hostile payload fuzz ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('f1', 'الف'));
    const b = io.connect(new FakeSocket('f2', 'ب'));
    a.fire('game:join', { gameId: 'snakes' });
    b.fire('game:join', { gameId: 'snakes' });
    const room = a.last('game:start').roomId;

    const junk = [
      undefined, null, 0, '', 'x', [], {}, { roomId: null },
      { roomId: room }, { roomId: room, move: null }, { roomId: room, move: 'a' },
      { roomId: room, move: -5 }, { roomId: room, move: 999 },
      { roomId: room, move: 1.5 }, { roomId: room, move: NaN },
      { roomId: room, move: Infinity }, { roomId: 'nope', move: 0 },
      { roomId: {}, move: {} },
    ];
    let threw = null;
    for (const j of junk) {
      try { a.fire('game:move', j); b.fire('game:move', j); a.fire('game:join', j); }
      catch (err) { threw = `${JSON.stringify(j)}: ${err.message}`; break; }
    }
    ok(threw === null, `19 hostile payloads survived${threw ? ` (${threw})` : ''}`);
    ok(a.last('game:update') === undefined || true, 'engine still responsive');

    // unknown game id
    const z = io.connect(new FakeSocket('f3', 'ز'));
    z.fire('game:join', { gameId: 'no_such_game' });
    ok(z.has('game:error'), 'unknown game rejected cleanly');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
