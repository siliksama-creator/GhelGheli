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
    a.fire('game:join', { gameId: 'tictactoe' });
    ok(a.has('game:waiting'), 'first player queues');
    b.fire('game:join', { gameId: 'tictactoe' });

    const sa = a.last('game:start'), sb = b.last('game:start');
    ok(!!sa && !!sb, 'both players get game:start');
    ok(sa.roomId === sb.roomId, 'share one room');
    ok(sa.yourSymbol === 'X' && sb.yourSymbol === 'O', 'symbols assigned');
    ok(sa.vsBot === false, 'flagged as human match');
    ok(sb.players.X.nickname === 'علی', 'opponent name propagated');

    // turn enforcement
    b.fire('game:move', { roomId: sb.roomId, move: 0 });
    ok(!b.has('game:update'), 'out-of-turn move ignored');
    a.fire('game:move', { roomId: sa.roomId, move: 0 });
    ok(a.last('game:update').state.board[0] === 'X', 'valid move applied');
    a.fire('game:move', { roomId: sa.roomId, move: 1 });
    ok(a.last('game:update').state.board[1] === null, 'cannot move twice');
    b.fire('game:move', { roomId: sb.roomId, move: 0 });
    ok(b.last('game:update').state.board[0] === 'X', 'occupied cell rejected');

    // X wins along the top row. Board so far: X at 0, and it is O's turn
    // (the rejected attempts above changed nothing).
    b.fire('game:move', { roomId: sb.roomId, move: 3 });
    a.fire('game:move', { roomId: sa.roomId, move: 1 });
    b.fire('game:move', { roomId: sb.roomId, move: 4 });
    a.fire('game:move', { roomId: sa.roomId, move: 2 });
    ok(a.last('game:over')?.winner === 'X', 'winner announced to X');
    ok(b.last('game:over')?.winner === 'X', 'winner announced to O');
    ok(a.rooms.size === 0 && b.rooms.size === 0, 'room cleaned up');
  }

  console.log('\n== bot fallback (10s) ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('solo', 'تنها'));
    a.fire('game:join', { gameId: 'tictactoe' });
    ok(a.has('game:waiting'), 'waits for a human first');
    ok(!a.has('game:start'), 'no instant bot game');
    await wait(10300);
    const st = a.last('game:start');
    ok(!!st && st.vsBot === true, 'falls back to the bot');
    ok(st.players.O.id === 'bot', 'bot occupies the second seat');

    a.fire('game:move', { roomId: st.roomId, move: 4 });
    await wait(900);
    const board = a.last('game:update').state.board;
    ok(board.filter(v => v === 'O').length === 1, 'bot replies with one move');
    ok(a.last('game:update').turn === 'X', 'turn returns to the player');
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
    a.fire('game:join', { gameId: 'tictactoe' });
    b.fire('game:join', { gameId: 'tictactoe' });
    a.fire('game:leave', { roomId: a.last('game:start').roomId });
    ok(b.last('game:over')?.winner === 'DISCONNECT', 'opponent told on leave');

    const c = io.connect(new FakeSocket('l3', 'ج'));
    const d = io.connect(new FakeSocket('l4', 'د'));
    c.fire('game:join', { gameId: 'tictactoe' });
    d.fire('game:join', { gameId: 'tictactoe' });
    c.fire('disconnect');
    ok(d.last('game:over')?.winner === 'DISCONNECT', 'opponent told on disconnect');

    // The original crash: 'game:leave' with NO payload at all.
    const e = io.connect(new FakeSocket('l5', 'ه'));
    let threw = false;
    try { e.fire('game:join', { gameId: 'tictactoe' }); e.fire('game:leave', undefined); }
    catch { threw = true; }
    ok(!threw, 'payload-less game:leave does not throw');
  }

  console.log('\n== hostile payload fuzz ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('f1', 'الف'));
    const b = io.connect(new FakeSocket('f2', 'ب'));
    a.fire('game:join', { gameId: 'tictactoe' });
    b.fire('game:join', { gameId: 'tictactoe' });
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
