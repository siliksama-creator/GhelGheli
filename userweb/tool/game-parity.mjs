#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { penaltyPowerAt, penaltyView, zoneCenter, ZONES } from '../src/penaltyModel.js';
import PenaltyNet from '../src/penaltyNet.js';

// The server rule module is the single source of truth for the goal geometry
// and the kick count; it has no runtime dependencies, so requiring it here is
// safe and keeps one definition instead of three.
const require = createRequire(import.meta.url);
const serverRules = require('../../backend/src/games/rules/penalty.js');

const root = path.resolve(import.meta.dirname, '..', '..');
const web = fs.readFileSync(path.join(root, 'userweb/src/penaltyGame.jsx'), 'utf8');
const webModel = fs.readFileSync(path.join(root, 'userweb/src/penaltyModel.js'), 'utf8');
const webCss = fs.readFileSync(path.join(root, 'userweb/src/styles/brand-mark.css'), 'utf8');
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
// 3 columns x 2 rows: rows divide by TWO, so zone 0 sits at 1/4 of the
// goal height, not 1/6 (the old 3x3 geometry).
assert.deepEqual(zoneCenter(0, 130, 100), { x: 31.2, y: 17.5 });
assert(zoneCenter(2, 130, 100).x > zoneCenter(0, 130, 100).x,
  'physical zone 2 must be right of zone 0 even in an RTL page');
assert(zoneCenter(3, 130, 100).y > zoneCenter(0, 130, 100).y,
  'the bottom row must render below the top row');

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

// ═══════════════════════════════════════════════════════════════════════════
// هندسهٔ دروازه: ۳ ستون × ۲ ردیف، در هر سه جا یکی باشد
// ═══════════════════════════════════════════════════════════════════════════
//
// «دیگه نباید به ۹ جهت شوت زد و فقط به ۶ جهت میشه شوت زد».
//
// اگر یکی از سه تا جا بماند، بدترین حالت این است که کلاینت ۹ خانه رسم کند
// و سرور سه‌تایشان را رد کند: کاربر خانه‌ای را لمس می‌کند و هیچ اتفاقی
// نمی‌افتد، بی آنکه هیچ خطایی در جایی ثبت شود.
assert.equal(serverRules.ZONES, 6, 'server goal has six zones');
assert.equal(serverRules.ZONE_COLS, 3, 'server goal has three columns');
assert.equal(serverRules.ZONE_ROWS, 2, 'server goal has two rows');
assert.equal(serverRules.ROUNDS, 5, 'five kicks per side in regulation');
assert.equal(ZONES, serverRules.ZONES,
  'web zone count must equal the server zone count');
assert(/export const ZONE_COLS = 3;/.test(webModel),
  'web model declares three columns');
assert(/export const ZONE_ROWS = 2;/.test(webModel),
  'web model declares two rows');
assert(/const int kZoneCols = 3;/.test(android),
  'Android declares three columns');
assert(/const int kZoneRows = 2;/.test(android),
  'Android declares two rows');
assert(!/length:\s*9/.test(web), 'web must not render nine zone buttons');
assert(!/for \(var r = 0; r < 3; r\+\+\)/.test(android),
  'Android must not build three zone rows');

// The grid is CSS on the web, so the file above is only half the story.
const penZones = /\.penZones\{[^}]*\}/.exec(webCss);
assert(penZones, '.penZones grid rule must exist');
assert(/grid-template-columns:repeat\(3,1fr\)/.test(penZones[0]),
  '.penZones must have three columns');
assert(/grid-template-rows:repeat\(2,1fr\)/.test(penZones[0]),
  '.penZones must have two rows — the 3x3 goal is gone');

// ═══════════════════════════════════════════════════════════════════════════
// تساوی حذف شده؛ بازی راندبه‌راند ادامه پیدا می‌کند
// ═══════════════════════════════════════════════════════════════════════════
//
// «این بازی دیگه حالت مساوی نداره ... اگه در ۵ ۵ مساوی بود ۱ راند دیگه
//  اضافه میشه انقدر ادامه پیدا میکنه تا برنده داشته باشه».
//
// پس `suddenDeath` دوباره یک پرچمِ واقعی است (نه فقط کلیدِ سازگاری) و هر دو
// کلاینت باید آن را نشان دهند؛ وگرنه بعد از ضربهٔ پنجمِ هر دو، بازی بی‌هیچ
// توضیحی ادامه پیدا می‌کند.
{
  const tiedAfterRegulation = (() => {
    const s = serverRules.create();
    for (let i = 0; i < 10; i++) {
      const sh = s.shooter;
      const kp = sh === 'X' ? 'O' : 'X';
      serverRules.applyMove(s, { zone: 0, power: 0.5 }, sh);
      serverRules.applyMove(s, { zone: 5 }, kp); // wrong dive -> goal
    }
    return s;
  })();
  assert.equal(tiedAfterRegulation.taken.X, 5, 'five kicks for X');
  assert.equal(tiedAfterRegulation.taken.O, 5, 'five kicks for O');
  assert.notEqual(serverRules.result(tiedAfterRegulation), 'DRAW',
    'a 5-5 penalty shootout is no longer a draw');
  assert.equal(serverRules.result(tiedAfterRegulation), null,
    'and it is not over either — it goes to extra rounds');
  assert.equal(tiedAfterRegulation.suddenDeath, true,
    'the server flags the extra rounds');
  assert.equal(penaltyView({ suddenDeath: true }, 'X').extraRound, true,
    'web surfaces the extra-round flag');
  assert(/st\['suddenDeath'\] == true/.test(android),
    'Android reads the extra-round flag from the server state');
}

console.log('✓ web/Android penalty roles, timing, zones, moves, net physics, '
  + 'goal geometry (3×2) and the no-draw extra-round rule are in parity');
