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
const assets = {
  duel_music: [29, 31], duel_lock: [.30, .50], duel_intro: [1, 1.3],
  duel_round_win: [1.2, 1.5], duel_round_lose: [1.2, 1.5],
  duel_round_draw: [1.2, 1.5], duel_points: [1.6, 1.9],
  duel_final_draw: [1.9, 2.2],
  duel_victory: [2.2, 2.5], duel_defeat: [2.2, 2.5],
};

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
  assert(info.bytes > 5000, `${name} is suspiciously small or silent`);
  pass += 1;
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
