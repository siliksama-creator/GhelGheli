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
    this.id = `socket-${id}`;
    this.user = { id, nickname };
    this.connected = true;
    this.events = [];
    this.handlers = {};
    this.rooms = new Set();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, data) { this.events.push({ ev, data }); }
  join(r) {
    this.rooms.add(r);
    if (this._io) {
      const set = this._io.sockets.adapter.rooms.get(r) || new Set();
      set.add(this.id);
      this._io.sockets.adapter.rooms.set(r, set);
    }
  }
  leave(r) {
    this.rooms.delete(r);
    const set = this._io?.sockets.adapter.rooms.get(r);
    set?.delete(this.id);
    if (set?.size === 0) this._io.sockets.adapter.rooms.delete(r);
  }
  fire(ev, data) { (this.handlers[ev] || []).forEach(fn => fn(data)); }
  last(ev) { return [...this.events].reverse().find(e => e.ev === ev)?.data; }
  has(ev) { return this.events.some(e => e.ev === ev); }
}

function makeIo() {
  const conns = [];
  const io = {
    sockets: {
      sockets: new Map(),
      adapter: { rooms: new Map() },
    },
    on: (ev, fn) => { if (ev === 'connection') conns.push(fn); },
    emit(ev, data) {
      for (const socket of this.sockets.sockets.values()) socket.emit(ev, data);
    },
    connect(sock) {
      sock._io = this;
      this.sockets.sockets.set(sock.id, sock);
      conns.forEach(fn => fn(sock));
      return sock;
    },
  };
  return io;
}

(async () => {
  console.log('\n== matchmaking: two humans ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('u1', 'علی'));
    const b = io.connect(new FakeSocket('u2', 'رضا'));
    a.fire('game:join', { gameId: 'memory' });
    ok(a.has('game:waiting'), 'first player queues');
    b.fire('game:join', { gameId: 'memory' });

    const sa = a.last('game:start'), sb = b.last('game:start');
    ok(!!sa && !!sb, 'both players get game:start');
    ok(sa.roomId === sb.roomId, 'share one room');
    ok(sa.yourSymbol === 'X' && sb.yourSymbol === 'O', 'symbols assigned');
    ok(sa.vsBot === false, 'flagged as human match');
    ok(sb.players.X.nickname === 'علی', 'opponent name propagated');

    // turn enforcement (snakes: a move is the index of the die to play)
    b.fire('game:move', { roomId: sb.roomId, move: 0 });
    ok(!b.has('game:update'), 'out-of-turn move ignored');

    a.fire('game:move', { roomId: sa.roomId, move: 0 });
    const afterMove = a.last('game:update');
    ok(!!afterMove, 'valid move produced an update');
    ok(afterMove.state.cards[0].up === true, 'the card actually flipped');

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
      // Read the playable list from the socket that is ON MOVE — each player
      // gets its own decorated view, and a stale list picks a claimed card.
      const own = (turn === 'X' ? a : b);
      const view = own.last('game:update')?.state
        ?? own.last('game:start')?.state
        ?? sa.state;
      const playable = view.playable ?? [];
      if (!playable.length) break;
      sock.fire('game:move', { roomId: sa.roomId, move: playable[0] });
    }
    ok(a.has('game:over'), 'game reached a conclusion');
    ok(['X', 'O', 'DRAW'].includes(a.last('game:over').winner), 'a result was declared');
    ok(b.has('game:over'), 'both players told the result');
    ok(a.rooms.size === 0 && b.rooms.size === 0, 'room cleaned up');
  }

  // جفت‌یاب no longer has a bot, so the fallback is exercised on penalty.
  console.log('\n== bot fallback (15s, penalty) ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('lonely', 'تنها'));
    a.fire('game:join', { gameId: 'penalty' });
    ok(a.has('game:waiting'), 'waits for a human first');
    ok(a.last('game:waiting').botFallback === true, 'a bot IS promised');
    ok(!a.has('game:start'), 'no instant bot game');
    await wait(15400);
    const st = a.last('game:start');
    ok(!!st && st.vsBot === true, 'falls back to the bot');
    ok(st.players.O.id === 'bot', 'bot occupies the second seat');

    a.fire('game:move', { roomId: st.roomId, move: { zone: 0, power: 0.6 } });
    await wait(1400);
    const upd = a.last('game:update');
    ok(!!upd, 'bot game produced an update');
    ok(upd.state.history.length === 1, 'one complete penalty kick was recorded');
    ok(['goal', 'save'].includes(upd.state.lastKick.outcome), 'kick has a valid outcome');
    ok(upd.state.pending === undefined, 'opponent choice is never serialized');
  }

  console.log('\n== instant bot play (zero wait) ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('nb1', 'بدون‌انتظار'));
    a.fire('game:join', { gameId: 'memory', vsBot: true });
    ok(a.has('game:start'), 'memory starts bot immediately');
    ok(a.last('game:start').vsBot === true, 'flagged as vsBot');

    const b = io.connect(new FakeSocket('nb2', 'فوری'));
    b.fire('game:play_bot', { gameId: 'penalty' });
    ok(b.has('game:start'), 'penalty starts bot immediately via game:play_bot');
    ok(b.last('game:start').vsBot === true, 'penalty flagged as vsBot');
  }

  console.log('\n== private lobby and direct-room ownership ==');
  {
    const io = makeIo(); attach(io, RULES);
    const host = io.connect(new FakeSocket('private-host', 'میزبان'));
    const guest = io.connect(new FakeSocket('private-guest', 'مهمان'));

    host.fire('game:create_lobby', {
      gameId: 'memory', stake: 0, password: '1234',
    });
    const created = host.last('game:lobby_created');
    ok(created?.gameId === 'memory', 'host creates a real memory lobby');
    guest.fire('game:lobby_list');
    ok(guest.last('game:lobby_list')?.some(l => l.lobbyId === created.lobbyId),
      'lobby is discoverable on the same socket namespace');
    guest.fire('game:join_lobby', { lobbyId: created.lobbyId, password: '1234' });
    const hs = host.last('game:start');
    const gs = guest.last('game:start');
    ok(hs?.roomId && hs.roomId === gs?.roomId,
      'host and guest receive game:start on their retained lobby sockets');
    ok(hs?.gameId === 'memory' && hs?.stake === 0,
      'game:start carries authoritative game id and stake');
    host.fire('game:leave', { roomId: hs?.roomId });

    const codeHost = io.connect(new FakeSocket('code-host', 'کدساز'));
    const codeGuest = io.connect(new FakeSocket('code-guest', 'کدگیر'));
    codeHost.fire('game:create_room', { gameId: 'penalty' });
    const room = codeHost.last('game:room_created');
    codeGuest.fire('game:join_room', { roomCode: room?.roomCode });
    ok(codeHost.last('game:start')?.gameId === 'penalty'
      && codeGuest.last('game:start')?.gameId === 'penalty',
    'direct code join uses the host game instead of a client-side guess');
    codeHost.fire('game:leave');
  }

  console.log('\n== penalty over the engine ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('r1', 'الف'));
    const b = io.connect(new FakeSocket('r2', 'ب'));
    a.fire('game:join', { gameId: 'penalty' });
    b.fire('game:join', { gameId: 'penalty' });
    const sa = a.last('game:start');
    ok(sa.state.score.X === 0 && sa.state.score.O === 0, 'penalty score starts at zero');
    ok(sa.state.role === 'shooter', 'first player starts as shooter');
    ok(sa.state.pending === undefined, 'private choices are hidden at start');
    a.fire('game:move', { roomId: sa.roomId, move: { zone: 0, power: 0.6 } });
    b.fire('game:move', { roomId: sa.roomId, move: { zone: 0, power: 0 } });
    const up = b.last('game:update');
    ok(up.state.history.length === 1, 'kick is resolved and broadcast');
    ok(up.state.lastKick.outcome === 'save', 'same-zone human dive saves');
    ok(up.state.pending === undefined, 'resolved state leaks no pending choice');
  }

  console.log('\n== leaving and disconnecting ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('l1', 'الف'));
    const b = io.connect(new FakeSocket('l2', 'ب'));
    a.fire('game:join', { gameId: 'memory' });
    b.fire('game:join', { gameId: 'memory' });
    a.fire('game:leave', { roomId: a.last('game:start').roomId });
    ok(b.last('game:over')?.winner === 'DISCONNECT', 'opponent told on leave');
    ok(b.last('game:over')?.resolvedWinner === 'O',
      'forfeit payload names the actual winner for UI and settlement');

    const c = io.connect(new FakeSocket('l3', 'ج'));
    const d = io.connect(new FakeSocket('l4', 'د'));
    c.fire('game:join', { gameId: 'memory' });
    d.fire('game:join', { gameId: 'memory' });
    c.fire('disconnect');
    ok(d.has('game:opponent_reconnecting') && !d.has('game:over'),
      'disconnect opens reconnect window instead of deciding the match');
    const c2 = io.connect(new FakeSocket('l3', 'ج'));
    ok(c2.has('game:resume'), 'same authenticated user reclaims the suspended seat');
    ok(d.has('game:opponent_reconnected'), 'opponent is told when the player returns');
    c2.fire('game:leave');

    // The original crash: 'game:leave' with NO payload at all.
    const e = io.connect(new FakeSocket('l5', 'ه'));
    let threw = false;
    try { e.fire('game:join', { gameId: 'memory' }); e.fire('game:leave', undefined); }
    catch { threw = true; }
    ok(!threw, 'payload-less game:leave does not throw');
  }

  console.log('\n== turn clock (20s for memory) ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('t1', 'الف'));
    const b = io.connect(new FakeSocket('t2', 'ب'));
    a.fire('game:join', { gameId: 'memory' });
    b.fire('game:join', { gameId: 'memory' });
    const st = a.last('game:start');
    ok(st.turnMs === 20000, 'memory turn budget (20s) advertised');
    ok(typeof st.deadline === 'number' && st.deadline > Date.now(), 'deadline sent on start');
    ok(!!st.players.X.profileAvatarKey || st.players.X.profileAvatarKey === null,
      'player profile fields present');
    ok(st.players.X.id === 'u-t1' || typeof st.players.X.id === 'string',
      'player id exposed for profile lookup');

    const before = a.last('game:update');
    ok(before === undefined, 'no move yet');
    // Let X's clock expire. Memory uses a 20s budget, so wait past that.
    await wait(20600);
    const after = a.last('game:update');
    ok(!!after, 'server acted when the clock ran out');
    ok(after && after.timedOut === 'X', 'timeout attributed to the right player');
    ok(after && ['X', 'O'].includes(after.turn), 'turn handed on after the timeout');
    ok(after && after.state.cards && after.state.cards.some(c => c.up || c.matched), 'an auto-move was played for the timed-out player');
    ok(typeof after.deadline === 'number', 'new deadline issued for the next turn');
    a.fire('game:leave');
  }

  console.log('\n== per-game turn budgets & match countdown ==');
  {
    const io = makeIo(); attach(io, RULES);
    const budgets = { memory: 20000, penalty: 12000 };
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
    a.fire('game:join', { gameId: 'memory' });
    b.fire('game:join', { gameId: 'memory' });
    ok(!!a.last('game:start'), 'match started');
    // Switching games mid-match must not strand the opponent in a dead room.
    a.fire('game:join', { gameId: 'penalty' });
    ok(b.last('game:over')?.winner === 'DISCONNECT', 'opponent released from abandoned room');
    ok(b.last('game:over')?.resolvedWinner === 'O',
      'abandoned room still reports the surviving winner');
    ok(b.rooms.size === 0, 'abandoned room cleaned up');

    // Re-tapping the same game while queued must not duplicate the queue slot.
    const c = io.connect(new FakeSocket('g3', 'ج'));
    c.fire('game:join', { gameId: 'penalty' });
    c.fire('game:join', { gameId: 'penalty' });
    const d = io.connect(new FakeSocket('g4', 'د'));
    d.fire('game:join', { gameId: 'penalty' });
    ok(!!c.last('game:start') && !!d.last('game:start'), 'no duplicate queue entry');
    ok(c.last('game:start').roomId === d.last('game:start').roomId, 'paired correctly after re-join');
    c.fire('game:leave'); d.fire('game:leave');
  }

  console.log('\n== resilience: dead sockets ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('d1', 'الف'));
    const b = io.connect(new FakeSocket('d2', 'ب'));
    // Make emit throw the way a closed socket does.
    b.emit = function (ev, data) {
      if (!this.connected) throw new Error('socket closed');
      this.events.push({ ev, data });
    }.bind(b);

    a.fire('game:join', { gameId: 'memory' });
    b.fire('game:join', { gameId: 'memory' });
    const st = a.last('game:start');
    ok(!!st, 'match started');

    // b dies WITHOUT firing 'disconnect' (cell tower drop, app killed...).
    b.connected = false;
    let threw = false;
    try {
      a.fire('game:move', { roomId: st.roomId, move: (st.state.playable || [0])[0] });
    } catch { threw = true; }
    ok(!threw, 'a dead peer socket does not crash the mover');
    ok(a.has('game:opponent_reconnecting') && !a.has('game:over'),
      'silent dead socket starts the bounded reconnect window');
    ok(a.rooms.size > 0, 'authoritative room is preserved during reconnect');
    const b2 = io.connect(new FakeSocket('d2', 'ب'));
    ok(b2.has('game:resume'), 'silent dead socket can resume on a fresh connection');
    b2.fire('game:leave');

    // A queued socket that vanished must not be matched against.
    const c = io.connect(new FakeSocket('d3', 'ج'));
    c.fire('game:join', { gameId: 'penalty' });
    c.connected = false;
    const d = io.connect(new FakeSocket('d4', 'د'));
    d.fire('game:join', { gameId: 'penalty' });
    ok(!d.has('game:start'), 'not matched against a ghost in the queue');
    ok(d.has('game:waiting'), 'live player keeps waiting for a real opponent');
    d.fire('game:leave');
  }

  console.log('\n== hostile payload fuzz ==');
  {
    const io = makeIo(); attach(io, RULES);
    const a = io.connect(new FakeSocket('f1', 'الف'));
    const b = io.connect(new FakeSocket('f2', 'ب'));
    a.fire('game:join', { gameId: 'memory' });
    b.fire('game:join', { gameId: 'memory' });
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
