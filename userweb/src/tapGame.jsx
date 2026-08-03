// Tap game for the web app — the same game as the Flutter client.
//
// PARITY CONTRACT: the level curve, the skin schedule, the client-side rate
// limits and the signed-batch protocol here MUST match
// mobile/lib/screens/user/games/tap/*. The server re-derives all of it in
// backend/src/services/tapGameService.js, so a drift between the two clients
// shows up as one platform silently losing taps.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { play as playSfx } from './gameAudio.js';
import { req } from './lib/api.js';

// ── config (mirrors TapGameConfig in Dart) ─────────────────────────────────
export const TAP_CONFIG = {
  levelCount: 50,
  baseTaps: 100,
  growthFactor: 1.15,
  levelsPerSkin: 10,
  // Levels clearable per calendar day (Asia/Tehran). MIRRORS
  // MAX_LEVELS_PER_DAY in tapGameService.js, which is the authority — this
  // copy exists so the UI can explain the rule and stop counting locally
  // instead of showing progress the next sync erases.
  levelsPerDay: 3,
  skins: [
    '/games/tap/skin_1.webp',
    '/games/tap/skin_2.webp',
    '/games/tap/skin_3.webp',
    '/games/tap/skin_4.webp',
    '/games/tap/skin_5.webp',
  ],
  maxTapsPerSecond: 12,
  burstWindowMs: 1000,
  minTapIntervalMs: 45,
  flushIntervalMs: 8000,
  maxBatchTaps: 400,
};

// Taps needed to clear `level`.
//
// CRASH FIX, mirroring the Flutter side. The old version was an unbounded
// `baseTaps * growthFactor^(level-1)`:
//
//   * past level ~300 the result exceeds Number.MAX_SAFE_INTEGER and the
//     arithmetic silently loses precision;
//   * past level ~1100 it becomes Infinity, and then `taps >= Infinity` is
//     never true, so the level-up loop stops advancing and the progress bar
//     divides by Infinity — the UI freezes on a level it can never clear.
//
// A player cannot legitimately pass levelCount, but the client adopts
// whatever `level` the SERVER reports after a sync, and nothing clamped the
// upper end. Clamping is also semantically right: past the last level the
// game is complete and the requirement is meaningless.
//
// The curve is memoised because this is called several times per render and
// the render happens on every tap.
const _curveCache = new Map();
const _curve = (cfg) => {
  const key = `${cfg.levelCount}|${cfg.baseTaps}|${cfg.growthFactor}`;
  let table = _curveCache.get(key);
  if (!table) {
    table = new Array(cfg.levelCount);
    let v = cfg.baseTaps;
    for (let i = 0; i < cfg.levelCount; i++) {
      table[i] = Number.isFinite(v) && v < 1e15 ? Math.round(v) : 1e9;
      v *= cfg.growthFactor;
    }
    _curveCache.set(key, table);
  }
  return table;
};

export const requiredTaps = (level, cfg = TAP_CONFIG) => {
  if (level < 1) return cfg.baseTaps;
  const capped = level > cfg.levelCount ? cfg.levelCount : level;
  return _curve(cfg)[capped - 1];
};

// The character changes ON arrival at level 10, 20, 30, 40 — levels 1-9 are
// skin 1, level 10 is already skin 2. Dividing (level - 1) pushed every
// change one level late, which is the bug this replaces.
export const skinIndexForLevel = (level, cfg = TAP_CONFIG) => {
  if (level < cfg.levelsPerSkin) return 0;
  return Math.min(Math.floor(level / cfg.levelsPerSkin), cfg.skins.length - 1);
};

export const skinForLevel = (level, cfg = TAP_CONFIG) =>
  cfg.skins[skinIndexForLevel(level, cfg)];

const STORAGE_KEY = 'tap_game_progress_v1';
const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

// ── the Tehran day ─────────────────────────────────────────────────────────
//
// The daily cap resets at Tehran midnight for every player, never in the
// browser's own zone — otherwise a fresh allowance is one Settings change
// away. Unlike the Flutter client, the browser HAS a full timezone database
// (Intl), so this is exact and stays correct if Iran ever reinstates DST.
//
// `sv-SE` is used because its short date IS the ISO form, so the result
// matches the server's `tehranDay()` character for character — and these two
// strings are compared.
const TEHRAN = 'Asia/Tehran';
const _dayFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TEHRAN, year: 'numeric', month: '2-digit', day: '2-digit',
});
export const tehranDay = (now = new Date()) => _dayFmt.format(now);

const _clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TEHRAN, hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

/** Milliseconds until the Tehran day rolls over. Never zero or negative. */
export function untilTehranMidnight(now = new Date()) {
  const parts = _clockFmt.formatToParts(now);
  const get = t => Number(parts.find(p => p.type === t)?.value || 0);
  // Some ICU builds report midnight as hour 24.
  const elapsed = ((get('hour') % 24) * 3600 + get('minute') * 60
    + get('second')) * 1000;
  const left = 86400000 - elapsed;
  return left <= 0 ? 86400000 : left;
}

/**
 * Short Persian phrasing of a duration, for the "unlocks in" line.
 *
 * Rounds UP: with 90 minutes left, "۲ ساعت" is a promise the game keeps and
 * "۱ ساعت" is one it breaks.
 */
export function formatCountdown(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'کمتر از یک دقیقه';
  if (mins < 60) return `${fa(mins)} دقیقه`;
  return `${fa(Math.ceil(mins / 60))} ساعت`;
}

// ── local persistence (mirrors TapStorage) ─────────────────────────────────
const EMPTY_PROGRESS = {
  level: 1, taps: 0, totalTaps: 0, pendingTaps: 0, flaggedTaps: 0,
  levelsToday: 0, levelsDay: '',
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    const p = JSON.parse(raw);
    const int = k => (Number.isFinite(Number(p[k])) && Number(p[k]) > 0 ? Math.floor(Number(p[k])) : 0);
    const level = int('level');
    // Only an ISO date is meaningful. Anything else — a number, an object, a
    // hand-edited "tomorrow" — reads as "no day recorded", which grants a
    // fresh allowance. That is the safe direction to fail: the server holds
    // the real counter and corrects it on the first batch, whereas refusing
    // to play on a corrupt string would brick the game offline.
    const day = typeof p.levelsDay === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(p.levelsDay) ? p.levelsDay : '';
    return {
      level: level < 1 ? 1 : Math.min(level, TAP_CONFIG.levelCount + 1),
      taps: int('taps'),
      totalTaps: int('totalTaps'),
      pendingTaps: int('pendingTaps'),
      flaggedTaps: int('flaggedTaps'),
      levelsToday: int('levelsToday'),
      levelsDay: day,
    };
  } catch {
    // Corrupt storage must never brick the game.
    return { ...EMPTY_PROGRESS };
  }
}

/** Levels cleared today, with the stored day checked against the real one. */
const levelsUsedToday = (p, today = tehranDay()) =>
  (p.levelsDay === today ? p.levelsToday : 0);

const levelsLeftToday = (p, today = tehranDay()) =>
  Math.max(0, TAP_CONFIG.levelsPerDay - levelsUsedToday(p, today));

function saveProgress(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* quota/private mode */ }
}

// ── batch signing (mirrors TapSync) ────────────────────────────────────────
//
// Key = SHA-256 of the session token, exactly like the Flutter client, so the
// server derives the identical key from the token it just authenticated.
// A constant secret shipped in JS would be readable in devtools, which is why
// the key is session-derived instead.
async function signBatch(token, payload, nonce) {
  const enc = new TextEncoder();
  const keyBytes = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // Field ORDER is part of the wire contract — never reorder.
  const canonical = [
    payload.taps, payload.flagged, payload.elapsedMs,
    payload.level, payload.levelTaps, payload.seq, nonce,
  ].join('|');
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(canonical));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── anti-cheat guard (mirrors TapGuard) ────────────────────────────────────
function createGuard(cfg = TAP_CONFIG) {
  return { window: [], lastTapMs: -1, accepted: 0, rejected: 0, cfg };
}

function registerTap(guard, nowMs) {
  const { cfg } = guard;
  // Gate 1: hard debounce — faster than a human can physically tap.
  if (guard.lastTapMs >= 0 && nowMs - guard.lastTapMs < cfg.minTapIntervalMs) {
    guard.rejected++;
    return 'tooFast';
  }
  // Gate 2: sustained rate over a sliding window.
  const cutoff = nowMs - cfg.burstWindowMs;
  while (guard.window.length && guard.window[0] <= cutoff) guard.window.shift();
  if (guard.window.length >= cfg.maxTapsPerSecond) {
    guard.rejected++;
    return 'rateLimited';
  }
  guard.window.push(nowMs);
  guard.lastTapMs = nowMs;
  guard.accepted++;
  return 'accepted';
}

// ── component ──────────────────────────────────────────────────────────────
export default function TapGame({ token, onBack }) {
  const [progress, setProgress] = useState(loadProgress);
  const [notice, setNotice] = useState('');
  const [rate, setRate] = useState(0);
  const [floaters, setFloaters] = useState([]);
  const [pulse, setPulse] = useState(false);
  const [squash, setSquash] = useState(false);

  const guardRef = useRef(createGuard());
  const seqRef = useRef(0);
  const batchRef = useRef({ taps: 0, flagged: 0, startMs: 0 });
  const progressRef = useRef(progress);
  const floaterId = useRef(0);
  const syncingRef = useRef(false);
  const areaRef = useRef(null);
  // performance.now() is monotonic: changing the device clock cannot reset
  // the rate-limit window, which Date.now() would allow.
  const clock = useCallback(() => Math.round(performance.now()), []);

  useEffect(() => { progressRef.current = progress; }, [progress]);

  // TRACKED TIMEOUTS.
  //
  // The tap handler fired bare setTimeout()s that call setState — one for the
  // squash reset and one per floating "+1", plus more on level-up. None were
  // cancelled, so leaving the screen mid-session left up to ~15 pending
  // callbacks that then ran against an unmounted component. React logs a
  // warning for each and the closures keep the whole component tree alive
  // until they fire.
  //
  // At several taps per second over a long session this is the browser-side
  // twin of the Flutter ticker leak, and it is why the game degraded the
  // longer it was played.
  const timers = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
  }, []);

  const level = progress.level;
  const isComplete = level > TAP_CONFIG.levelCount;
  const need = requiredTaps(level);
  const pct = isComplete ? 100 : Math.min(100, (progress.taps / need) * 100);
  const skin = skinForLevel(Math.min(level, TAP_CONFIG.levelCount));
  const remaining = isComplete ? 0 : Math.max(0, need - progress.taps);

  // ── daily cap ────────────────────────────────────────────────────────────
  // Recomputed from `progress` on every render rather than held in its own
  // state: derived state that can go stale is how the two clients drift.
  const levelsLeft = levelsLeftToday(progress);
  const capped = !isComplete && levelsLeft <= 0;

  // Live countdown for the locked panel. Ticks once a minute — a per-second
  // countdown is a re-render per second for a number nobody is watching that
  // closely — and only while the panel is actually on screen.
  const [resetIn, setResetIn] = useState(() => untilTehranMidnight());
  useEffect(() => {
    if (!capped) return undefined;
    setResetIn(untilTehranMidnight());
    const t = setInterval(() => setResetIn(untilTehranMidnight()), 30000);
    return () => clearInterval(t);
  }, [capped]);

  // Search for the next level whose skin differs instead of duplicating the
  // boundary arithmetic — that duplication is what drifted out of sync with
  // skinIndexForLevel when the boundary was corrected.
  const untilNextSkin = useMemo(() => {
    if (isComplete) return null;
    const here = skinIndexForLevel(level);
    for (let lv = level + 1; lv <= TAP_CONFIG.levelCount; lv++) {
      if (skinIndexForLevel(lv) !== here) return lv - level;
    }
    return null;
  }, [level, isComplete]);

  // ── server sync ──────────────────────────────────────────────────────────
  const flush = useCallback(async (force = false) => {
    if (syncingRef.current) return;
    const b = batchRef.current;
    if (!force && b.taps <= 0 && b.flagged <= 0) return;
    if (b.taps <= 0 && b.flagged <= 0) return;
    if (!token) return;

    syncingRef.current = true;
    const nowMs = clock();
    const elapsed = Math.max(1, nowMs - b.startMs);

    // CAP THE BATCH TO WHAT ITS OWN WINDOW CAN JUSTIFY.
    //
    // The server refuses any batch carrying more taps than a human could
    // produce in the reported window, and a refused batch is BURNED. Two
    // honest cases used to trip that: back-to-back flushes from
    // `maxBatchTaps`, and the forced flush on a level-up landing right after
    // a timed one — both send a full batch with a near-zero window.
    // Sending only the affordable slice and carrying the rest loses nothing,
    // and gains an attacker nothing since the server checks independently.
    const affordable = Math.ceil((elapsed / 1000) * TAP_CONFIG.maxTapsPerSecond) + 20;
    const sentTaps = Math.min(b.taps, affordable);
    const sentFlagged = b.flagged;
    if (sentTaps <= 0 && sentFlagged <= 0) {
      syncingRef.current = false;
      return;
    }
    // Reset BEFORE awaiting so taps during the round trip land in the next
    // batch instead of being counted twice; the remainder is carried forward.
    batchRef.current = { taps: b.taps - sentTaps, flagged: 0, startMs: nowMs };

    try {
      const cur = progressRef.current;
      const payload = {
        taps: sentTaps, flagged: sentFlagged, elapsedMs: elapsed,
        level: cur.level, levelTaps: cur.taps, seq: ++seqRef.current,
      };
      const nonce = makeNonce();
      const sig = await signBatch(token, payload, nonce);
      let res;
      try {
        res = await req('/api/games/tap/progress', 'POST',
          { ...payload, nonce, sig }, token);
      } catch (err) {
        // A rejected batch (409/400) is an ANSWER, not a network failure:
        // retrying it would just replay the same refusal forever.
        if (err.status && err.status !== 0 && err.status < 500) {
          if (err.data && err.data.rejected) {
            setNotice(err.data.message || 'ضربه‌های غیرعادی نادیده گرفته شد');
          }
          setProgress(p => {
            const next = { ...p, pendingTaps: Math.max(0, p.pendingTaps - sentTaps) };
            saveProgress(next);
            return next;
          });
          return;
        }
        throw err;
      }

      if (res && res.rejected) {
        setNotice(res.message || 'ضربه‌های غیرعادی نادیده گرفته شد');
      }
      // The server is authoritative: adopt its numbers when they differ.
      if (res && typeof res.level === 'number') {
        setProgress(p => {
          const next = {
            ...p,
            pendingTaps: Math.max(0, p.pendingTaps - sentTaps),
          };
          // ADOPT THE STRICTER ALLOWANCE, never the looser one. The server
          // sees every device on the account so its count can only be
          // higher — but responses can also arrive out of order, and
          // blindly adopting a stale one would hand back an allowance that
          // was just spent. min() is right in both directions.
          if (typeof res.levelsLeftToday === 'number') {
            const serverUsed = Math.max(0, Math.min(
              TAP_CONFIG.levelsPerDay,
              TAP_CONFIG.levelsPerDay - res.levelsLeftToday));
            const today = tehranDay();
            if (serverUsed > levelsUsedToday(p, today)) {
              next.levelsToday = serverUsed;
              next.levelsDay = today;
            }
          }
          // Clamp the level the SERVER pushes, not just the one loaded from
          // storage. This is the path that actually reached the broken curve
          // in production: it needs a sync to happen first, which is why the
          // fault only appeared "after a while".
          const safeLevel = Math.min(
            Math.max(1, Math.floor(res.level)),
            TAP_CONFIG.levelCount + 1,
          );
          if (safeLevel !== p.level || Math.abs((res.levelTaps ?? p.taps) - p.taps) > 5) {
            next.level = safeLevel;
            next.taps = Math.min(res.levelTaps ?? 0, requiredTaps(safeLevel));
            next.totalTaps = res.totalTaps ?? p.totalTaps;
          }
          saveProgress(next);
          return next;
        });
      }
    } catch {
      // Offline or a server hiccup: put the taps back so the next flush
      // retries them. Losing a batch must never lose the player's progress.
      batchRef.current.taps += sentTaps;
      batchRef.current.flagged += sentFlagged;
    } finally {
      syncingRef.current = false;
    }
  }, [token, clock]);

  // Reconcile on entry, then flush on a timer.
  useEffect(() => {
    batchRef.current.startMs = clock();
    let alive = true;
    (async () => {
      try {
        const server = await req('/api/games/tap/progress', 'GET', null, token);
        if (!alive || !server || typeof server.level !== 'number') return;
        setProgress(p => {
          let next = p;
          // Another device may be ahead; the server always wins. Only move
          // FORWARD — a tab that played offline is legitimately ahead until
          // its taps are flushed.
          if (server.level > p.level ||
              (server.level === p.level && server.levelTaps > p.taps)) {
            next = {
              ...next, level: server.level, taps: server.levelTaps,
              totalTaps: server.totalTaps, pendingTaps: 0,
            };
          }
          // The allowance is shared across devices, so unlike level progress
          // it is adopted whenever the server says more of it is spent.
          if (typeof server.levelsLeftToday === 'number') {
            const serverUsed = Math.max(0, Math.min(
              TAP_CONFIG.levelsPerDay,
              TAP_CONFIG.levelsPerDay - server.levelsLeftToday));
            const today = tehranDay();
            if (serverUsed > levelsUsedToday(p, today)) {
              next = { ...next, levelsToday: serverUsed, levelsDay: today };
            }
          }
          if (next !== p) saveProgress(next);
          return next;
        });
      } catch { /* offline: keep playing locally */ }
    })();
    const t = setInterval(() => flush(), TAP_CONFIG.flushIntervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [token, flush, clock]);

  // Bank taps before the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flush(true);
    };
  }, [flush]);

  // Live rate readout, so the player can see why taps stop counting.
  useEffect(() => {
    const t = setInterval(() => {
      const g = guardRef.current;
      const cutoff = clock() - g.cfg.burstWindowMs;
      while (g.window.length && g.window[0] <= cutoff) g.window.shift();
      setRate(g.window.length);
    }, 250);
    return () => clearInterval(t);
  }, [clock]);

  // ── tap handling ─────────────────────────────────────────────────────────
  const handleTap = useCallback(e => {
    if (isComplete) return;
    // DAILY CAP. The locked panel replaces the tap area, so nothing normally
    // reaches here; the check stays because a pointer event queued in the
    // same frame the cap is hit would otherwise slip through, and because
    // "the UI hides it" is not a rule.
    if (capped) return;
    // Ignore synthetic events: a script dispatching click() has isTrusted
    // false. Real users are unaffected.
    if (e && e.isTrusted === false) return;

    const verdict = registerTap(guardRef.current, clock());
    setSquash(true);
    later(() => setSquash(false), 110);

    if (verdict !== 'accepted') {
      batchRef.current.flagged++;
      setProgress(p => ({ ...p, flaggedTaps: p.flaggedTaps + 1 }));
      if (verdict === 'rateLimited') setNotice('یواش‌تر! سرعت ضربه‌ها بیش از حد مجاز است');
      return;
    }

    setNotice('');
    batchRef.current.taps++;

    // Floating +1 at the pointer.
    const box = areaRef.current?.getBoundingClientRect();
    if (box) {
      const cx = (e.clientX ?? box.left + box.width / 2) - box.left;
      const cy = (e.clientY ?? box.top + box.height / 2) - box.top;
      const id = floaterId.current++;
      setFloaters(f => [...f.slice(-13), { id, x: cx, y: cy, dx: (Math.random() - 0.5) * 50 }]);
      later(() => setFloaters(f => f.filter(x => x.id !== id)), 700);
    }

    setProgress(p => {
      let lv = p.level;
      let taps = p.taps + 1;
      const prevSkin = skinIndexForLevel(lv);
      let leveled = false;

      // Allowance read once, before the loop, from the value being mutated.
      const today = tehranDay();
      let left = levelsLeftToday(p, today);

      // `while`, not `if`: a big offline batch can clear several levels.
      // Bounded: a zero-cost level would otherwise spin forever and lock the
      // tab. requiredTaps can no longer return 0, but the guard is free.
      let spins = 0;
      while (lv <= TAP_CONFIG.levelCount
             && taps >= requiredTaps(lv)
             && spins++ < TAP_CONFIG.levelCount) {
        const cost = requiredTaps(lv);
        if (cost <= 0) break;
        if (left <= 0) {
          // Out of levels for today. DISCARD the surplus rather than banking
          // it — banking would mean waking up tomorrow with three levels
          // already cleared, turning the cap into a queue.
          //
          // Clamp, do not set: `min` leaves an honest counter alone and only
          // bites when a batch genuinely overshot. Setting it to cost-1 would
          // park the bar at 99% every day, which reads as "one tap away" all
          // evening. The server's advance() clamps identically.
          taps = Math.min(taps, cost - 1);
          break;
        }
        taps -= cost;
        lv += 1;
        leveled = true;
        left -= 1;
      }
      const next = {
        ...p, level: lv, taps,
        totalTaps: p.totalTaps + 1,
        pendingTaps: p.pendingTaps + 1,
      };
      if (leveled) {
        // Count and day written together — a count without the day it
        // belongs to is what makes a stale counter look current.
        next.levelsToday = TAP_CONFIG.levelsPerDay - left;
        next.levelsDay = today;
      }
      saveProgress(next);

      if (leveled) {
        playSfx('match_found');
        setPulse(true);
        later(() => setPulse(false), 450);
        if (skinIndexForLevel(lv) !== prevSkin) {
          playSfx('win');
          setNotice('شخصیت جدید باز شد! 🎉');
          later(() => setNotice(''), 2500);
        }
        // A level boundary is a natural checkpoint.
        later(() => flush(true), 0);
      } else {
        playSfx('tap', 0.5);
        if (batchRef.current.taps >= TAP_CONFIG.maxBatchTaps) later(() => flush(), 0);
      }
      return next;
    });
  }, [isComplete, clock, flush]);

  const nearLimit = rate >= TAP_CONFIG.maxTapsPerSecond - 2;

  return (
    <section className="card wide tapGame">
      <div className="tapHead">
        <button className="ghost" onClick={() => { flush(true); onBack(); }}>‹ بازگشت</button>
        <div className="tapTitle">
          <b>ضربه‌زن</b>
          <span>لول {fa(Math.min(level, TAP_CONFIG.levelCount))} از {fa(TAP_CONFIG.levelCount)}</span>
        </div>
        {/* Today's allowance, as dots. Shown BEFORE the cap is hit, not only
            after — a limit the player discovers by hitting it reads as a
            bug; one they can see coming reads as a rule. */}
        {!isComplete && (
          <span className="tapDots"
            title={`امروز ${fa(levelsLeft)} لول از ${fa(TAP_CONFIG.levelsPerDay)} باقی مانده`}
            aria-label={`امروز ${levelsLeft} لول از ${TAP_CONFIG.levelsPerDay} باقی مانده`}>
            {Array.from({ length: TAP_CONFIG.levelsPerDay }, (_, i) => (
              <i key={i} className={i < levelsLeft ? 'on' : ''} />
            ))}
          </span>
        )}
        <span className="tapTotal">⚡ {fa(progress.totalTaps)}</span>
      </div>

      <div className="tapProgress">
        <div className="tapProgressTop">
          <b dir="ltr">{fa(progress.taps)} / {fa(need)}</b>
          {untilNextSkin != null &&
            <small>{fa(untilNextSkin)} لول تا شخصیت بعدی</small>}
        </div>
        <div className="tapBar"><span style={{ width: pct + '%' }} /></div>
        <div className="tapMeta">
          <small className={nearLimit ? 'warn' : ''}>⚡ {fa(rate)} ضربه بر ثانیه</small>
          {progress.pendingTaps > 0 && <small>در حال ثبت: {fa(progress.pendingTaps)}</small>}
        </div>
      </div>

      {notice && <div className="tapNotice">{notice}</div>}

      {isComplete ? (
        <div className="tapDone">
          <img src={skinForLevel(TAP_CONFIG.levelCount)} alt="" />
          <h2>🏆 تبریک! همهٔ لول‌ها را تمام کردی</h2>
          <p>مجموع ضربه‌ها: {fa(progress.totalTaps)}</p>
        </div>
      ) : capped ? (
        // The tap area is REPLACED, not merely disabled. Leaving a tappable
        // character that silently does nothing is the worst version of a
        // limit — the player assumes the game is broken.
        <div className="tapDone tapCapped">
          <img src={skin} alt="" />
          <h2>😴 سهمیهٔ امروز تمام شد</h2>
          <p>هر روز {fa(TAP_CONFIG.levelsPerDay)} لول می‌توانی بالا بروی.</p>
          <p className="tapResetIn">⏳ باز شدن تا {formatCountdown(resetIn)} دیگر</p>
        </div>
      ) : (
        <div
          className={`tapArea${squash ? ' squash' : ''}${pulse ? ' pulse' : ''}`}
          ref={areaRef}
          onPointerDown={handleTap}
          role="button"
          tabIndex={0}
          aria-label="ضربه بزن"
        >
          <img src={skin} alt="شخصیت" draggable="false" />
          {floaters.map(f => (
            <span key={f.id} className="tapFloat"
              style={{ left: f.x, top: f.y, '--dx': f.dx + 'px' }}>+۱</span>
          ))}
        </div>
      )}

      <p className="tapHint">
        {isComplete ? `همهٔ ${fa(TAP_CONFIG.levelCount)} لول تمام شد!`
          : capped ? 'فردا دوباره سر بزن'
            : `روی شخصیت ضربه بزن — ${fa(remaining)} ضربه تا لول بعد`}
      </p>
    </section>
  );
}
