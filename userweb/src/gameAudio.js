// Web SFX. Fire-and-forget: audio must never break gameplay, so every call
// is guarded (autoplay policy, missing file, decode error...).
const FILES = [
  'move', 'move_opponent', 'drop', 'flip', 'match_found', 'your_turn',
  'tick', 'tick_urgent', 'timeout', 'win', 'lose', 'draw', 'tap',
];

const KEY = 'game_sound_enabled';
const cache = {};
let enabled = localStorage.getItem(KEY) !== '0';

function get(name) {
  if (!cache[name]) {
    const a = new Audio(`/sfx/${name}.mp3`);
    a.preload = 'auto';
    cache[name] = a;
  }
  return cache[name];
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(v) {
  enabled = !!v;
  localStorage.setItem(KEY, enabled ? '1' : '0');
  if (!enabled) {
    Object.values(cache).forEach(a => {
      try { a.pause(); a.currentTime = 0; } catch { /* ignore */ }
    });
  }
  return enabled;
}

export function play(name, volume = 1) {
  if (!enabled || !FILES.includes(name)) return;
  try {
    const base = get(name);
    // Clone so rapid repeats (ticks) don't cut each other off.
    const a = base.cloneNode();
    a.volume = Math.max(0, Math.min(1, volume));
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked until first tap */ });
  } catch { /* never let audio break the game */ }
}
