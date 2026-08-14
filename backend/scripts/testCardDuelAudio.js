#!/usr/bin/env node
/** Guard the original Card Duel soundtrack/SFX and Android↔Web parity. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const mobileDir = path.join(root, 'mobile', 'assets', 'sfx');
const webDir = path.join(root, 'userweb', 'public', 'sfx');
// Card Duel soundtrack and cues.
const duelAssets = {
  duel_music: [29, 31], duel_lock: [.30, .50], duel_intro: [1, 1.3],
  duel_round_win: [1.2, 1.5], duel_round_lose: [1.2, 1.5],
  duel_round_draw: [1.2, 1.5], duel_points: [1.6, 1.9],
  duel_final_draw: [1.9, 2.2],
  duel_victory: [2.2, 2.5], duel_defeat: [2.2, 2.5],
};
// Cues shared by every game. These were once checked-in mono blips with no
// generator; they are now synthesized by the same script and held to the same
// bar. The upper bounds are deliberately tight: `tap`/`tick` fire many times
// per second, so a regression that lengthens them would smear.
//
// NOTE: durations here are frame-count durations, which include the ~0.057 s
// of encoder/decoder padding every MP3 carries. The decoded audio is shorter
// by that amount — e.g. `tick` is a 0.05 s sound in a 0.10 s frame stream.
// The duel bounds above were likewise set against this same measure.
const sharedAssets = {
  move: [.10, .21], move_opponent: [.14, .27], drop: [.12, .25],
  flip: [.12, .25], tap: [.09, .20], tick: [.06, .15], tick_urgent: [.07, .17],
  match_found: [.48, .68], your_turn: [.36, .54], timeout: [.62, .82],
  win: [1.25, 1.55], lose: [1.05, 1.32], draw: [.70, .92],
};
const assets = { ...duelAssets, ...sharedAssets };

function mp3Info(file) {
  const b = fs.readFileSync(file);
  const rates = [44100, 48000, 32000];
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  let offset = 0; let frames = 0; let samples = 0; let sampleRate = 0; let channels = 0;
  while (offset + 4 <= b.length) {
    const h = b.readUInt32BE(offset);
    if ((h & 0xffe00000) !== (0xffe00000 | 0)) break;
    const version = (h >>> 19) & 3;
    const layer = (h >>> 17) & 3;
    const bitrateIndex = (h >>> 12) & 15;
    const rateIndex = (h >>> 10) & 3;
    const padding = (h >>> 9) & 1;
    assert(version === 3 && layer === 1, `${file} must be MPEG-1 Layer III`);
    const bitrate = bitrates[bitrateIndex] || 0;
    sampleRate = rates[rateIndex] || 0;
    assert(bitrate > 0 && sampleRate > 0, `${file} invalid MP3 frame`);
    channels = ((h >>> 6) & 3) === 3 ? 1 : 2;
    const frameBytes = Math.floor((144000 * bitrate) / sampleRate) + padding;
    offset += frameBytes; frames += 1; samples += 1152;
  }
  assert(frames > 2, `${file} has too few MP3 frames`);
  return { channels, sampleRate, duration: samples / sampleRate, frames, bytes: b.length };
}

let pass = 0;
for (const [name, [min, max]] of Object.entries(assets)) {
  const a = path.join(mobileDir, `${name}.mp3`);
  const w = path.join(webDir, `${name}.mp3`);
  assert(fs.existsSync(a) && fs.existsSync(w), `missing ${name} on a platform`);
  const ah = crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex');
  const wh = crypto.createHash('sha256').update(fs.readFileSync(w)).digest('hex');
  assert.strictEqual(ah, wh, `${name} differs between Android and Web`);
  const info = mp3Info(a);
  assert.deepStrictEqual([info.channels, info.sampleRate], [2, 44100], `${name} format`);
  assert(info.duration >= min && info.duration <= max, `${name} duration ${info.duration.toFixed(2)}s`);
  // Size is checked as a bitrate floor rather than a flat byte count, so the
  // 0.05 s `tick` and the 30 s soundtrack are held to the same *quality* bar.
  // 96 kbps is the floor below which VBR stereo starts audibly smearing.
  const kbps = (info.bytes * 8) / info.duration / 1000;
  assert(kbps > 96, `${name} encoded too low: ${kbps.toFixed(0)} kbps`);
  assert(info.bytes > 1500, `${name} is suspiciously small or silent`);
  pass += 1;
}

// Every clip the players can hear must be stereo. The old shared cues were
// mono, which on a phone collapsed them into the centre while the duel set
// had a stereo image — the mismatch was audible when switching games.
assert.strictEqual(Object.keys(assets).length, 23, 'all 23 game clips must be guarded');
for (const name of Object.keys(sharedAssets)) {
  assert.strictEqual(mp3Info(path.join(mobileDir, `${name}.mp3`)).channels, 2,
    `${name} must be stereo like the rest of the set`);
}

assert.notDeepStrictEqual(
  fs.readFileSync(path.join(mobileDir, 'duel_round_draw.mp3')),
  fs.readFileSync(path.join(mobileDir, 'duel_final_draw.mp3')),
  'round draw and match draw must have distinct cues',
);

const generator = read('tools/generateDuelAudio.py');
const dartAudio = read('mobile/lib/screens/user/games/game_audio.dart');
const dartSession = read('mobile/lib/screens/user/games/game_session.dart');
const webAudio = read('userweb/src/gameAudio.js');
const webSession = read('userweb/src/gameSession.js');
const engine = read('backend/src/games/engine.js');
const mobileDuel = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const webDuel = read('userweb/src/cardDuelGame.jsx');
assert(generator.includes('RNG = np.random.default_rng(20260814)'));
assert(generator.includes('No samples or third-party music are used'));
// The generator must own every clip, so no asset can silently drift back to
// being an unreproducible checked-in binary.
for (const name of Object.keys(assets)) {
  assert(generator.includes(`write("${name}.mp3"`), `generator does not produce ${name}.mp3`);
}
assert(generator.includes('quality=.0'), 'the looping soundtrack must use the top VBR tier');
assert(/ReleaseMode\.loop/.test(dartAudio) && /setVolume\(0\.20\)/.test(dartAudio));
assert(/duelMusic\.loop = true/.test(webAudio) && /duelMusic\.volume = 0\.20/.test(webAudio));
for (const event of ['duelIntro', 'duelLock', 'duelRoundWin', 'duelRoundLose',
  'duelRoundDraw', 'duelPoints', 'duelFinalDraw', 'duelVictory', 'duelDefeat']) {
  assert(dartAudio.includes(event), `Android enum missing ${event}`);
}
for (const event of ['duel_intro', 'duel_lock', 'duel_round_win', 'duel_round_lose',
  'duel_round_draw', 'duel_points', 'duel_final_draw', 'duel_victory', 'duel_defeat']) {
  assert(webAudio.includes(`'${event}'`), `Web registry missing ${event}`);
  assert(webSession.includes(event), `Web session does not trigger ${event}`);
}
assert(dartSession.includes('startDuelMusic()') && dartSession.includes('stopDuelMusic()'));
assert(webSession.includes('startDuelMusic()') && webSession.includes('stopDuelMusic()'));
assert(dartSession.includes('currentRound < totalRounds'), 'Android final round must not double-play outcome');
assert(webSession.includes('currentRound < totalRounds'), 'Web final round must not double-play outcome');
assert(engine.includes("payout: !result.duplicate && !draw"), 'payout animation must follow committed settlement');
assert(engine.includes('winner: draw ? \'DRAW\' : winnerSym') && engine.includes('netPot: result.netPot'),
  'settlement event must carry authoritative winner and pot');
assert(engine.includes('balanceAfter: sym === winnerSym ? result.winnerBalanceAfter : null'),
  'winner must receive the authoritative post-payout balance');
assert(dartSession.includes('m[\'payout\'] == true') && dartSession.includes('Sfx.duelPoints'));
assert(webSession.includes('d?.payout === true') && webSession.includes("play('duel_points'"));
assert(mobileDuel.includes('class _StakePayoutFlight') && webDuel.includes('function StakePayoutFlight'));

console.log(`✓ ${pass} byte-identical original high-quality MP3 assets plus lifecycle/event audio wiring passed`);
