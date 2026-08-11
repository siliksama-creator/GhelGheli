#!/usr/bin/env node
// Card duel through the real Socket.IO engine, with only inventory/history I/O
// replaced. This catches protocol leaks that pure rule tests cannot see.
const assert = require('assert');
const duelService = require('../src/services/cardDuelService');

const makeCards = prefix => [70, 74, 78].map((stat, index) => ({
  id: `${prefix}-${index + 1}`, cardTypeId: `${prefix}-${index + 1}`,
  name: `${prefix}-${index + 1}`, attack: stat, defense: stat,
  speed: stat, technique: stat, goalChance: stat, energy: 100,
  rarity: 'normal', effect: 'none', pointValue: 100,
}));
let historyWrites = 0;
duelService.deckCards = async userId => ({ deck: { user_id: userId }, cards: makeCards(String(userId)) });
duelService.botDeck = () => makeCards('bot');
duelService.recordEngineBattle = async () => { historyWrites += 1; return {}; };

const attach = require('../src/games/engine');
const rules = require('../src/games/rules/cardDuel');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class Socket {
  constructor(id) {
    this.id = id;
    this.user = { id, nickname: id, current_points: 5000 };
    this.connected = true;
    this.handlers = {};
    this.events = [];
  }
  on(event, handler) { (this.handlers[event] ||= []).push(handler); }
  emit(event, data) { this.events.push({ event, data }); }
  async fire(event, data) { await Promise.all((this.handlers[event] || []).map(handler => handler(data))); }
  join() {}
  leave() {}
  last(event) { return [...this.events].reverse().find(item => item.event === event)?.data; }
}

function ioHarness() {
  const connections = [];
  return {
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    on(event, handler) { if (event === 'connection') connections.push(handler); },
    emit() {},
    connect(socket) {
      this.sockets.sockets.set(socket.id, socket);
      connections.forEach(handler => handler(socket));
      return socket;
    },
  };
}

(async () => {
  const io = ioHarness();
  attach(io, { card_duel: rules });
  const player = io.connect(new Socket('player-x'));
  await player.fire('game:play_bot', { gameId: 'card_duel' });
  const start = player.last('game:start');
  assert(start, 'bot game must start');
  assert.equal(start.matchMode, 'bot');
  assert.equal(start.state.myDeck.length, 3);
  assert.equal(start.state.opponentRemainingCount, 3);
  assert(!JSON.stringify(start.state).includes('bot-1'), 'opponent deck must be hidden at start');

  for (let round = 0; round < 3; round++) {
    const current = player.last(round === 0 ? 'game:start' : 'game:update');
    const available = current.state.myRemainingCardIds;
    await player.fire('game:move', {
      roomId: start.roomId,
      move: { cardId: available[0] },
    });
    const locked = player.last('game:update');
    assert.equal(locked.state.iChose, true, 'own choice is locked while bot thinks');
    assert(!JSON.stringify(locked.state).includes('bot-1') || round > 0,
      'unplayed bot choice is not leaked');
    await wait(720);
  }

  const over = player.last('game:over');
  assert(over, 'three live rounds must end the engine room');
  assert(['X', 'O', 'DRAW'].includes(over.winner));
  assert.equal(over.state.history.length, 3);
  await wait(20);
  assert.equal(historyWrites, 1, 'game history hook runs exactly once');
  console.log('✅ card duel completed three hidden-choice rounds through the real engine');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
