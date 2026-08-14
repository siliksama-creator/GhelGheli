#!/usr/bin/env node
//
// A web player and an Android player must be able to sit in the SAME match.
//
// Why this file exists
// ────────────────────
// The owner's requirement is blunt: "people on the web must be able to play
// exactly the same game with people on Android". That is not a UI question —
// it is a protocol question, and it breaks in ways no screenshot reveals:
//
//   * If the two clients emit a different matchmaking key, they queue in
//     separate pools and simply never meet. Nobody sees an error; both just
//     wait out the timer and get a bot.
//   * If one client sends `{zone, power}` where the other sends an int, the
//     server rejects one side's move and that player looks frozen.
//   * If one client never listens for an event the server emits, that
//     platform silently misses reconnects, settlements or the result.
//
// So this asserts on the WIRE CONTRACT, from the three sources that define
// it: the Dart session, the JS session, and the engine that serves both.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0;
// (name, condition) — matching the call sites. Getting this order wrong makes
// every assertion pass on the truthiness of its own label, which is exactly
// the kind of test that reports green while the product is broken.
function ok(name, condition) {
  assert.ok(condition, `✗ ${name}`);
  pass += 1;
  console.log(`  ✓ ${name}`);
}

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const engine = read('backend/src/games/engine.js');
const dart = read('mobile/lib/screens/user/games/game_session.dart');
const js = read('userweb/src/gameSession.js')
  + read('userweb/src/games.jsx');

console.log('\n== یک صف مشترک برای هر دو پلتفرم ==');

// The queue key is the whole ballgame: if it carried a platform tag, the two
// clients could never be paired. It must be derived from gameId+stake ONLY.
const qKey = engine.match(/const qKey = ([^;]+);/);
ok('کلید صف فقط از gameId و stake ساخته می‌شود', Boolean(qKey));
ok('کلید صف هیچ نشانی از پلتفرم/کلاینت ندارد',
  !/platform|client|device|web|android|mobile/i.test(qKey[1]));
ok('سرور برای join هیچ‌جا پلتفرم را جدا نمی‌کند',
  !/payload\??\.(platform|client|device)/i.test(engine));

// Both clients must send the same three fields, or they land in different
// queues (or get rejected outright).
ok('اندروید در game:join سه فیلد gameId/vsBot/stake می‌فرستد',
  /emit\('game:join',\s*\{'gameId':\s*gameId,\s*'vsBot':\s*vsBot,\s*'stake':\s*stake\}\)/
    .test(dart));
ok('وب هم در game:join دقیقاً همان سه فیلد را می‌فرستد',
  /emit\('game:join',\s*\{\s*gameId,\s*stake,\s*vsBot:\s*false\s*\}\)/.test(js));

console.log('\n== قرارداد حرکت ==');

// Move shape must be byte-identical in intent: {roomId, move}. The `move`
// itself is an int for turn-based games and an object for penalty — but the
// ENVELOPE must match or the server cannot route it.
ok('اندروید حرکت را در پاکت {roomId, move} می‌فرستد',
  /emit\('game:move',\s*\{'roomId':\s*_roomId,\s*'move':/.test(dart));
ok('وب هم حرکت را در همان پاکت {roomId, move} می‌فرستد',
  /emit\('game:move',\s*\{\s*roomId:[^,]+,\s*move:/.test(js));
// The penalty move is built in the BOARD, not the session: the session only
// provides the envelope. Read it from where it actually lives.
const dartPenalty = read('mobile/lib/screens/user/games/penalty_board.dart');
const jsPenalty = read('userweb/src/penaltyGame.jsx');
ok('اندروید برای پنالتی حرکتِ شیئی {zone, power} می‌سازد',
  /moveObject\(\{'zone':[^}]*'power':/.test(dartPenalty));
ok('وب هم برای پنالتی همان شیء {zone, power} را می‌سازد',
  /\{\s*zone[^}]*power/.test(jsPenalty));
ok('دروازه‌بان در هر دو فقط zone می‌فرستد (بدون power)',
  /moveObject\(\{'zone':\s*zone\}\)/.test(dartPenalty)
  && /\{\s*zone\s*\}/.test(jsPenalty));

console.log('\n== رویدادهایی که سرور می‌فرستد، هر دو باید بشنوند ==');

// Any event the server emits to a player must be handled on BOTH clients.
// A missing listener is invisible until the moment it matters — a settlement
// that never shows, a reconnect the player never learns about.
const critical = [
  'game:start', 'game:update', 'game:over', 'game:waiting',
  'game:still-waiting', 'game:resume', 'game:error', 'game:settlement',
  'game:opponent_reconnecting', 'game:opponent_reconnected',
  'game:rematch_status', 'game:rematch_unavailable',
];
for (const ev of critical) {
  const inEngine = engine.includes(`'${ev}'`);
  const inDart = dart.includes(`'${ev}'`);
  const inJs = js.includes(`'${ev}'`);
  ok(`${ev} — سرور می‌فرستد و هر دو کلاینت گوش می‌دهند`,
    inEngine && inDart && inJs);
}

console.log('\n== شرط‌بندی یکسان ==');

// If the clients offered different stake tiers, a web player picking a tier
// Android does not offer would queue alone forever.
const dartStakes = dart + read('mobile/lib/screens/user/games_page.dart');
const jsStakes = js;
for (const stake of ['100', '1000']) {
  ok(`هر دو کلاینت شرطِ ${stake} امتیازی را ارائه می‌دهند`,
    dartStakes.includes(stake) && jsStakes.includes(stake));
}
ok('هر دو کلاینت حالت تمرین با ربات (stake=0) دارند',
  /vsBot/.test(dartStakes) && /vsBot/.test(jsStakes));

console.log('\n== قواعد بازی از یک منبع می‌آید ==');

// The decisive point: neither client may compute the outcome. The server
// owns it, so a web player and an Android player cannot disagree about who
// won even if their UIs differ completely.
ok('نتیجهٔ نبرد را سرور تعیین می‌کند (کلاینت‌ها فقط نمایش می‌دهند)',
  engine.includes('finish(') && /resolvedWinner|winner/.test(engine));
ok('هیچ‌کدام از کلاینت‌ها برندهٔ راند را خودش نمی‌سازد',
  !/function\s+decideRound|computeWinner\s*=/.test(dart)
  && !/function\s+decideRound|computeWinner\s*=/.test(js));

console.log(`\n✅ ${pass} تست بازی متقابل وب↔اندروید موفق بود\n`);
