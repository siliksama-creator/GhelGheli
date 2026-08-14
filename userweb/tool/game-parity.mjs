#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { penaltyPowerAt, penaltyView, zoneCenter } from '../src/penaltyModel.js';
import PenaltyNet from '../src/penaltyNet.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const web = fs.readFileSync(path.join(root, 'userweb/src/penaltyGame.jsx'), 'utf8');
const webModel = fs.readFileSync(path.join(root, 'userweb/src/penaltyModel.js'), 'utf8');
const webSession = fs.readFileSync(path.join(root, 'userweb/src/games.jsx'), 'utf8')
  + fs.readFileSync(path.join(root, 'userweb/src/gameSession.js'), 'utf8');
const android = fs.readFileSync(
  path.join(root, 'mobile/lib/screens/user/games/penalty_board.dart'), 'utf8');
const androidSession = fs.readFileSync(
  path.join(root, 'mobile/lib/screens/user/games/game_session.dart'), 'utf8');

const base = {
  score: { X: 2, O: 1 }, taken: { X: 3, O: 2 },
  shooter: 'X', role: 'shooter', iChose: false,
  waitingForOpponent: false, history: [],
};
let view = penaltyView(base, 'X');
assert.equal(view.amShooter, true);
assert.equal(view.myScore, 2);

// After one kick the server swaps roles without changing the player's X/O
// identity. This was the web-breaking bug: `mySymbol === X` stayed true.
view = penaltyView({ ...base, shooter: 'O', role: 'keeper', iChose: true }, 'X');
assert.equal(view.amShooter, false);
assert.equal(view.alreadyChose, true);
assert.equal(view.myScore, 2);
assert.equal(view.foeScore, 1);

assert.equal(penaltyPowerAt(0), .35);
assert.equal(penaltyPowerAt(900), 1);
assert.equal(penaltyPowerAt(1800), .35);
assert.deepEqual(zoneCenter(0, 130, 100), { x: 31.2, y: 13.666666666666668 });
assert(zoneCenter(2, 130, 100).x > zoneCenter(0, 130, 100).x,
  'physical zone 2 must be right of zone 0 even in an RTL page');

const net = new PenaltyNet();
net.hit(.5, .5, .8);
assert.equal(net.settled, false);
let moved = false;
for (let i = 0; i < 15; i++) {
  net.step(1 / 60);
  moved ||= Math.abs(net.depth(7, 4)) > 0.001;
}
assert(moved, 'goal impact must visibly deform the net at the hit point');

assert(!web.includes("mySymbol === 'X'"), 'web role must not be fixed to X');
assert(!web.includes('state.pending'), 'private pending choices are never sent to clients');
assert(!web.includes('Math.random'), 'outcomes come from the authoritative server, never the browser');
for (const contract of ['state.iChose', 'state.role']) {
  assert(webSession.includes(contract) || web.includes(contract) || webModel.includes(contract),
    `web consumes ${contract}`);
}
assert(web.includes("onMove({ zone: selected, power: powerRef.current })"));
assert(web.includes('onMove({ zone })'));
assert(android.includes("widget.session.moveObject({'zone': _pickedZone, 'power': p})"));
assert(android.includes("widget.session.moveObject({'zone': zone})"));
for (const event of ['game:start', 'game:update', 'game:over', 'game:move']) {
  assert(webSession.includes(event) && androidSession.includes(event),
    `both clients use ${event}`);
}
assert(web.includes('new PenaltyNet()') && android.includes('final NetSim _net = NetSim()'),
  'both clients use the 15×9 mass-spring goal net');

console.log('✓ web/Android penalty roles, timing, zones, moves and net physics are in parity');
