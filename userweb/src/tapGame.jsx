// Tap game for the web app — the same game as the Flutter client.
//
// PARITY CONTRACT: the level curve, the skin schedule, the client-side rate
// limits and the signed-batch protocol here MUST match
// mobile/lib/screens/user/games/tap/*. The server re-derives all of it in
// backend/src/services/tapGameService.js, so a drift between the two clients
// shows up as one platform silently losing taps.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { req, asset, avatarUrl } from './lib/api.js';
import { heavyImpact, mediumImpact, selectionClick } from './haptics.js';
import { SvgIcon } from './components/IconAsset.jsx';

// ── config (mirrors TapGameConfig in Dart) ─────────────────────────────────
export const TAP_CONFIG = {
  levelCount: 50,
  // کل بازی ۵۰٬۰۰۰ امتیاز است و هر ضربه دقیقاً یک امتیاز. MIRRORS
  // TOTAL_POINTS در tapGameService.js.
  totalPoints: 50000,
  growthFactor: 1.05,
  levelsPerSkin: 5,
  // Levels clearable per calendar day (Asia/Tehran). MIRRORS
  // MAX_LEVELS_PER_DAY in tapGameService.js, which is the authority — this
  // copy exists so the UI can explain the rule and stop counting locally
  // instead of showing progress the next sync erases.
  levelsPerDay: 2,
  skins: [
    '/games/tap/skin_1.webp',
    '/games/tap/skin_2.webp',
    '/games/tap/skin_3.webp',
    '/games/tap/skin_4.webp',
    '/games/tap/skin_5.webp',
    '/games/tap/skin_6.webp',
    '/games/tap/skin_7.webp',
    '/games/tap/skin_8.webp',
    '/games/tap/skin_9.webp',
    '/games/tap/skin_10.webp',
  ],
  maxTapsPerSecond: 12,
  burstWindowMs: 1000,
  minTapIntervalMs: 45,
  flushIntervalMs: 8000,
  maxBatchTaps: 400,
};

// Shortest gap between two tap buzzes. Mirrors `_tapHapticMinGap` in
// tap_screen.dart. NOT part of TAP_CONFIG: that object is the protocol
// contract the server re-derives, and this is presentation only.
const TAP_HAPTIC_MIN_GAP_MS = 125;

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
  const key = `${cfg.levelCount}|${cfg.totalPoints}|${cfg.growthFactor}`;
  let table = _curveCache.get(key);
  if (!table) {
    // ساخته می‌شود تا جمعش **دقیقاً** totalPoints شود.
    //
    // پنجاه جملهٔ هندسیِ جداگانه گرد شده، جمعشان عدد رُندی نمی‌شود؛ خطای
    // گرد کردن در لول آخر جبران می‌شود. بدون این، بازی ۴۹٬۹۹۷ یا ۵۰٬۰۰۴
    // امتیاز می‌ارزید و دو سرِ سیستم سر «کی بازی تمام شد» اختلاف پیدا
    // می‌کردند. آینهٔ همین ساخت در tapGameService.js و tap_config.dart.
    const terms = [];
    let sum = 0;
    for (let i = 0; i < cfg.levelCount; i++) {
      const t = Math.pow(cfg.growthFactor, i);
      terms.push(t);
      sum += t;
    }
    const base = cfg.totalPoints / sum;
    table = terms.map((t) => {
      const v = base * t;
      if (!Number.isFinite(v) || v > 1e9) return 1e9;
      // هرگز صفر: لول رایگان حلقهٔ لول‌آپ را بی‌نهایت می‌چرخاند.
      return Math.max(1, Math.round(v));
    });
    const drift = cfg.totalPoints - table.reduce((a, b) => a + b, 0);
    table[table.length - 1] = Math.max(1, table[table.length - 1] + drift);
    _curveCache.set(key, table);
  }
  return table;
};

export const requiredTaps = (level, cfg = TAP_CONFIG) => {
  const capped = level < 1 ? 1
    : (level > cfg.levelCount ? cfg.levelCount : level);
  return _curve(cfg)[capped - 1];
};

/** امتیاز جمع‌شده تا این نقطه از منحنی. آینهٔ cumulativePoints سرور. */
export const cumulativePoints = (level, levelTaps, cfg = TAP_CONFIG) => {
  const lv = Math.max(1, Math.min(level, cfg.levelCount + 1));
  const table = _curve(cfg);
  let sum = 0;
  for (let i = 0; i < lv - 1 && i < cfg.levelCount; i++) sum += table[i];
  if (lv > cfg.levelCount) return sum;
  return sum + Math.max(0, Math.min(levelTaps || 0, table[lv - 1]));
};

/** جمع کل امتیاز بازی — همان totalPoints، ولی از روی جدول واقعی. */
export const totalGamePoints = (cfg = TAP_CONFIG) =>
  _curve(cfg).reduce((a, b) => a + b, 0);

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
export default function TapGame({ token, onBack, economy }) {
  // ── سکهٔ لول‌آپ جلوی چشمِ کاربر (خواستهٔ مالک) ──
  // وقتی سرور پاسخِ بسته را با coinsEarned برمی‌گرداند، یک نشانِ شناور
  // «+N سکه» چند ثانیه نمایش داده می‌شود.
  const [coinToast, setCoinToast] = useState(null);
  const coinToastTimer = useRef(null);
  // ── «بازی تمام شد» (دورِ ۳۳) ──
  // پرچم و جمعِ واقعی از سرور می‌آیند؛ تا ادمین ریست نکند بازیکن می‌ماند.
  const [srvFinished, setSrvFinished] = useState(false);
  const [coinsTotalFromSrv, setCoinsTotalFromSrv] = useState(null);
  const [pointsTotalFromSrv, setPointsTotalFromSrv] = useState(null);
  const [progress, setProgress] = useState(loadProgress);
  const [notice, setNotice] = useState('');
  const [rate, setRate] = useState(0);
  const [floaters, setFloaters] = useState([]);
  const [pulse, setPulse] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [board, setBoard] = useState(null);
  const [boardErr, setBoardErr] = useState('');

  const guardRef = useRef(createGuard());
  const seqRef = useRef(0);
  const batchRef = useRef({ taps: 0, flagged: 0, startMs: 0 });
  const progressRef = useRef(progress);
  const floaterId = useRef(0);
  const syncingRef = useRef(false);
  const areaRef = useRef(null);
  // Remaining slowdown guard: accepted taps are capped, but rejected bursts
  // can be far denser. Keep telemetry exact while limiting UI/audio churn.
  const lastRejectedUi = useRef(-1000000);
  // Mirrors `_hapticClock` in tap_screen.dart. Same sentinel as above so the
  // very first tap of a session always buzzes.
  const lastTapHaptic = useRef(-1000000);
  // performance.now() is monotonic: changing the device clock cannot reset
  // the rate-limit window, which Date.now() would allow.
  const clock = useCallback(() => Math.round(performance.now()), []);

  // ── منحنیِ زندهٔ ادمین (دورِ ۳۳) ────────────────────────────────────────
  // خواستهٔ مالک: «هر تغییر ادمین بدون نیاز به بروزرسانی کامل اپلیکیشن
  // اندروید باید اعمال بشه». همین کار برای وب هم انجام شد: تعداد لول،
  // جمعِ امتیاز، شیب و سقفِ روزانه از GET /api/config (propِ economy)
  // می‌آیند و با پیش‌فرضِ تاریخی مرج می‌شوند. اگر سرور چیزی نگفته بود
  // (کشِ خالی، شبکهٔ قطع) بازی با همان اعدادِ همیشگی ادامه می‌دهد.
  const CFG = useMemo(() => {
    const tc = economy?.tapCurve || {};
    const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return {
      ...TAP_CONFIG,
      levelCount: Math.min(200, Math.max(1, Math.round(num(tc.levelCount, TAP_CONFIG.levelCount)))),
      totalPoints: num(tc.totalPoints, TAP_CONFIG.totalPoints),
      growthFactor: Number(tc.growthFactor) > 1 ? Number(tc.growthFactor) : TAP_CONFIG.growthFactor,
      levelsPerDay: Number.isFinite(Number(tc.levelsPerDay))
        ? Math.min(50, Math.max(0, Math.round(Number(tc.levelsPerDay))))
        : TAP_CONFIG.levelsPerDay,
    };
  }, [economy]);

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
    clearTimeout(coinToastTimer.current);
  }, []);

  const level = progress.level;
  // «تمام‌شدن» فقط عبورِ محلی از لولِ آخر نیست؛ مهرِ سرور (srvFinished)
  // حکمِ نهایی است — حتی اگر ادمین بعداً تعداد لول را بالا ببرد، تا
  // ریست نکند بازیکن همان‌جا قفل می‌ماند (خواستهٔ صریحِ مالک).
  const isComplete = srvFinished || level > CFG.levelCount;
  const need = requiredTaps(level, CFG);
  const pct = isComplete ? 100 : Math.min(100, (progress.taps / need) * 100);
  const skin = skinForLevel(Math.min(level, CFG.levelCount), CFG);
  const remaining = isComplete ? 0 : Math.max(0, need - progress.taps);
  // امتیاز، نه تعداد ضربه — خواستهٔ مالک. هر ضربه یک امتیاز است، پس این
  // عدد همان کاری است که کاربر کرده.
  const points = cumulativePoints(progress.level, progress.taps, CFG);

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
    const here = skinIndexForLevel(level, CFG);
    for (let lv = level + 1; lv <= CFG.levelCount; lv++) {
      if (skinIndexForLevel(lv, CFG) !== here) return lv - level;
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
    const affordable = Math.ceil((elapsed / 1000) * CFG.maxTapsPerSecond) + 20;
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
          // ── بازیِ تمام‌شده (دورِ ۳۳) ──
          // سرور بازیکنِ تمام‌کرده را با 409 و پرچمِ finished برمی‌گرداند؛
          // ضربه‌های کش‌شده هم دور ریخته می‌شوند چون دیگر شمرده نمی‌شوند.
          if (err.data && err.data.finished) {
            setSrvFinished(true);
            if (typeof err.data.coinsAwardedTotal === 'number') {
              setCoinsTotalFromSrv(err.data.coinsAwardedTotal);
            }
            setProgress(p => {
              const next = { ...p, pendingTaps: 0 };
              saveProgress(next);
              return next;
            });
            return;
          }
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
      // همین بسته ممکن است لولِ آخر را بسته باشد — جمع‌ها را همان لحظه
      // نگه می‌داریم تا صفحهٔ پایان با عددِ واقعی باز شود، نه محلی.
      if (res && res.finished) {
        setSrvFinished(true);
        if (typeof res.coinsAwarded === 'number') setCoinsTotalFromSrv(res.coinsAwarded);
        if (typeof res.pointsAwarded === 'number') setPointsTotalFromSrv(res.pointsAwarded);
      }
      if (typeof res?.coinsAwarded === 'number' && !res.finished) {
        setCoinsTotalFromSrv(res.coinsAwarded);
      }
      if (typeof res?.pointsAwarded === 'number' && !res.finished) {
        setPointsTotalFromSrv(res.pointsAwarded);
      }
      // ── سکهٔ لول‌آپ: «+۵ سکه» جلوی چشمِ کاربر ──
      if (res && Number(res.coinsEarned) > 0) {
        setCoinToast({
          coins: Number(res.coinsEarned),
          total: Number(res.coinsTotal ?? 0),
          at: Date.now(),
        });
        clearTimeout(coinToastTimer.current);
        coinToastTimer.current = setTimeout(() => setCoinToast(null), 3000);
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
              CFG.levelsPerDay,
              CFG.levelsPerDay - res.levelsLeftToday));
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
            CFG.levelCount + 1,
          );
          if (safeLevel !== p.level || Math.abs((res.levelTaps ?? p.taps) - p.taps) > 5) {
            next.level = safeLevel;
            next.taps = Math.min(res.levelTaps ?? 0, requiredTaps(safeLevel, CFG));
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
        // وضعیتِ پایان و جمعِ واقعی از سرور — منبعِ حقیقتِ «تمام‌شدن»
        // مهرِ سرور است، نه مقایسهٔ سطح با عددِ کش‌شدهٔ محلی.
        if (server.finished) setSrvFinished(true);
        if (typeof server.coinsAwarded === 'number') {
          setCoinsTotalFromSrv(server.coinsAwarded);
        }
        if (typeof server.pointsAwarded === 'number') {
          setPointsTotalFromSrv(server.pointsAwarded);
        }
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
              CFG.levelsPerDay,
              CFG.levelsPerDay - server.levelsLeftToday));
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
    const t = setInterval(() => flush(), CFG.flushIntervalMs);
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
    // Use the compositor directly instead of two React state changes and a
    // timer per tap. Restarting the tiny transform animation is allocation-
    // bounded even during a long burst and does not rebuild the game tree.
    areaRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.05, .94)', offset: 0.42 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: 170, easing: 'ease-out' },
    );

    if (verdict !== 'accepted') {
      batchRef.current.flagged++;
      const now = clock();
      const message = verdict === 'rateLimited'
        ? 'یواش‌تر! سرعت ضربه‌ها بیش از حد مجاز است'
        : '';
      const shouldPaint = now - lastRejectedUi.current >= 250 || (message && message !== notice);
      if (shouldPaint) {
        lastRejectedUi.current = now;
        setProgress(p => ({ ...p, flaggedTaps: p.flaggedTaps + 1 }));
        if (message) setNotice(message);
      }
      return;
    }

    setNotice('');
    batchRef.current.taps++;

    // Only ACCEPTED taps buzz — a rejected tap already gets its own visible
    // notice, and buzzing on it would reward exactly the autoclicker the
    // guard just caught. Throttled to the same 125 ms Android uses
    // (`_tapHapticMinGap`): without it a fast tapper drives the motor
    // continuously, which drains battery and stops reading as feedback.
    const hapticNow = clock();
    if (hapticNow - lastTapHaptic.current >= TAP_HAPTIC_MIN_GAP_MS) {
      lastTapHaptic.current = hapticNow;
      selectionClick();
    }

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
      const prevSkin = skinIndexForLevel(lv, CFG);
      let leveled = false;

      // Allowance read once, before the loop, from the value being mutated.
      const today = tehranDay();
      let left = levelsLeftToday(p, today);

      // `while`, not `if`: a big offline batch can clear several levels.
      // Bounded: a zero-cost level would otherwise spin forever and lock the
      // tab. requiredTaps can no longer return 0, but the guard is free.
      let spins = 0;
      while (lv <= CFG.levelCount
             && taps >= requiredTaps(lv, CFG)
             && spins++ < CFG.levelCount) {
        const cost = requiredTaps(lv, CFG);
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
        next.levelsToday = CFG.levelsPerDay - left;
        next.levelsDay = today;
      }
      saveProgress(next);

      if (leveled) {
        setPulse(true);
        later(() => setPulse(false), 450);
        if (skinIndexForLevel(lv, CFG) !== prevSkin) {
          setNotice('شخصیت جدید باز شد! ');
          later(() => setNotice(''), 2500);
          // skinChanged — the loudest thing that can happen mid-run.
          heavyImpact();
        } else if (lv > CFG.levelCount) {
          heavyImpact();          // gameCompleted
        } else if (left <= 0) {
          heavyImpact();          // dailyCapHit, once, on the level that spent it
        } else {
          mediumImpact();         // levelUp
        }
        // A level boundary is a natural checkpoint.
        later(() => flush(true), 0);
      } else if (batchRef.current.taps >= CFG.maxBatchTaps) {
        later(() => flush(), 0);
      }
      return next;
    });
  }, [isComplete, capped, notice, clock, flush, later]);

  const nearLimit = rate >= CFG.maxTapsPerSecond - 2;

  // رتبه‌بندی ضربه‌زن — GET /api/games/tap/leaderboard. عدد و نام‌ها از
  // سرور می‌آیند تا همیشه تازه باشد و به هیچ آپدیتی نیاز نداشته باشد.
  const loadBoard = useCallback(async () => {
    if (board) return;
    setBoardErr('');
    try {
      const d = await req('/api/games/tap/leaderboard?limit=30', 'GET', null, token);
      setBoard(d.entries || []);
    } catch (e) {
      setBoardErr(e.message || 'خطا در گرفتن رتبه‌بندی');
    }
  }, [board, token]);

  return (
    <section className="card wide tapGame">
      <div className="tapHead">
        <button className="ghost" onClick={() => { flush(true); onBack(); }}>‹ بازگشت</button>
        <div className="tapTitle">
          <b>ضربه‌زن</b>
          <span>لول {fa(Math.min(level, CFG.levelCount))} از {fa(CFG.levelCount)}</span>
        </div>
        {/* Today's allowance, as dots. Shown BEFORE the cap is hit, not only
            after — a limit the player discovers by hitting it reads as a
            bug; one they can see coming reads as a rule. */}
        {!isComplete && (
          <span className="tapDots"
            title={`امروز ${fa(levelsLeft)} لول از ${fa(CFG.levelsPerDay)} باقی مانده`}
            aria-label={`امروز ${levelsLeft} لول از ${CFG.levelsPerDay} باقی مانده`}>
            {Array.from({ length: CFG.levelsPerDay }, (_, i) => (
              <i key={i} className={i < levelsLeft ? 'on' : ''} />
            ))}
          </span>
        )}
        <span className="tapTotal"> {fa(points)} امتیاز</span>
        <button type="button" className="ghost tapBoardBtn"
          onClick={() => {
            if (!showBoard && !board && !boardErr) loadBoard();
            setShowBoard(v => !v);
          }}>
          <SvgIcon name="trophy" size={15} />
          رتبه‌بندی
        </button>
      </div>

      {showBoard && (
        <div className="soloBoard">
          <h3>
            رتبه‌بندی ضربه‌زن
            <small>بر اساس مجموع ضربه‌ها</small>
          </h3>
          {boardErr ? (
            <p className="hint">{boardErr}</p>
          ) : !board ? (
            <p className="hint">در حال بارگذاری...</p>
          ) : !board.length ? (
            <p className="hint">هنوز ضربه‌ای ثبت نشده. اولین نفر باش!</p>
          ) : (
            board.map((e, i) => (
              <div className="soloRow" key={e.userId}>
                <span className="rk">{fa(i + 1)}</span>
                <span className="tapBoardWho">
                  <img
                    src={e.profileImageUrl ? asset(e.profileImageUrl) : avatarUrl(e.profileAvatarKey)}
                    alt="" width="22" height="22" loading="lazy"
                  />
                  <b>{e.nickname}</b>
                </span>
                <span className="soloTime">{fa(e.totalTaps)} ضربه</span>
                <small>لول {fa(e.level)}</small>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── راهنمای سکه: «هر لول N سکه» — عدد از تنظیماتِ ادمین می‌آید ── */}
      <div className="tapCoinGuide">
        <img src="/pass/icon_coin.webp" alt="" width={15} height={15}
          style={{ display: 'block', opacity: 0.9 }} />
        <span>
          هر لول <b>{fa(economy?.tapCoinsPerLevel ?? 5)} سکه</b> می‌دهد؛ سکهٔ
          هر لول همان لحظه به موجودی‌ات اضافه می‌شود.
        </span>
      </div>

      <div className="tapProgress">
        <div className="tapProgressTop">
          <b dir="ltr">{fa(progress.taps)} / {fa(need)}</b>
          <small className="tapUnit">امتیاز</small>
          {untilNextSkin != null &&
            <small>{fa(untilNextSkin)} لول تا شخصیت بعدی</small>}
        </div>
        <div className="tapBar"><span style={{ width: pct + '%' }} /></div>
        <div className="tapMeta">
          <small className={nearLimit ? 'warn' : ''}> {fa(rate)} ضربه بر ثانیه</small>
          {progress.pendingTaps > 0 && <small>در حال ثبت: {fa(progress.pendingTaps)}</small>}
        </div>
      </div>

      {coinToast && (
        // ── جشنِ سکهٔ لول‌آپ (دورِ ۳۳) ──
        // خواستهٔ مالک: «۵ سکهٔ دریافتی بصورت انیمیشنی جذاب نمایش داده
        // بشه». سه لایه: سکهٔ SVG با چرخشِ سه‌بعدی و پرتو، ذراتِ
        // جرقه، و شمارندهٔ «+N» با پاپ. بدونِ ایموجی — همه SVG/CSS.
        <div className="tapCoinBurst" role="status" aria-live="polite">
          <span className="tapCoinRing" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="46" height="46">
              <defs>
                <linearGradient id="tcg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FFE38A" />
                  <stop offset=".5" stopColor="#FFC53D" />
                  <stop offset="1" stopColor="#E59A1F" />
                </linearGradient>
              </defs>
              <circle cx="20" cy="20" r="17" fill="url(#tcg)" />
              <circle cx="20" cy="20" r="17" fill="none" stroke="#B9770E" strokeWidth="2" />
              <circle cx="20" cy="20" r="12.5" fill="none" stroke="#B9770E" strokeWidth="1.4" opacity=".55" />
              <path d="M20 12.5v15M15.8 15.2h5.1a2.6 2.6 0 0 1 0 5.2h-5.1h6a2.6 2.6 0 0 1 0 5.2h-5.1"
                fill="none" stroke="#8C5E0B" strokeWidth="2.1" strokeLinecap="round" />
            </svg>
          </span>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="tapCoinSpark" style={{ '--i': i }} aria-hidden="true" />
          ))}
          <b className="tapCoinNum">+{fa(coinToast.coins)} سکه</b>
          <span className="tapCoinWallet">موجودی: {fa(coinToast.total)}</span>
        </div>
      )}

      {notice && <div className="tapNotice">{notice}</div>}

      {isComplete ? (
        // ── صفحهٔ «بازی تمام شد» (دورِ ۳۳) ──
        // خواستهٔ مالک: «به کاربر تمامی امتیازات بدست‌آورده از بازی
        // ضربه‌زن و همینطور سکه نمایش داده بشه» و تا ریستِ ادمین قفل.
        // اعداد از خودِ سرور می‌آیند (pointsTotalFromSrv/coinsTotalFromSrv)
        // و فقط در نبودِ‌شان روی حسابِ محلی می‌مانیم.
        <div className="tapDone tapFinished">
          <span className="tapFinishTrophy" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="86" height="86">
              <defs>
                <linearGradient id="tfg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFE38A" />
                  <stop offset="1" stopColor="#E5A61F" />
                </linearGradient>
              </defs>
              <path d="M18 10h28v10a14 14 0 0 1-28 0V10z" fill="url(#tfg)" />
              <path d="M18 12h-6a8 8 0 0 0 8 10M46 12h6a8 8 0 0 1-8 10"
                fill="none" stroke="url(#tfg)" strokeWidth="3" strokeLinecap="round" />
              <path d="M29 33h6v7h-6z" fill="url(#tfg)" />
              <path d="M22 44h20v4H22z" fill="url(#tfg)" />
              <path d="M18 50h28v5H18a2.5 2.5 0 0 1 0-5z" fill="url(#tfg)" />
              <circle cx="32" cy="20" r="5.5" fill="#FFF7DF" opacity=".85" />
            </svg>
          </span>
          <h2>تبریک! بازی ضربه‌زن را کامل تمام کردی</h2>
          <div className="tapFinishStats">
            <div className="tapFinishStat">
              <SvgIcon name="star" size={17} />
              <b>{fa(pointsTotalFromSrv ?? points)}</b>
              <span>امتیاز از ضربه‌زن</span>
            </div>
            <div className="tapFinishStat tapFinishStat--coin">
              <img src="/pass/icon_coin.webp" alt="" width={17} height={17} />
              <b>{fa(coinsTotalFromSrv ?? 0)}</b>
              <span>سکهٔ کسب‌شده</span>
            </div>
          </div>
          <p className="tapFinishLock">
            <SvgIcon name="lock" size={15} />
            تا زمانی که مدیر بازی را ریست نکند نمی‌توانی دوباره بازی کنی.
          </p>
        </div>
      ) : capped ? (
        // The tap area is REPLACED, not merely disabled. Leaving a tappable
        // character that silently does nothing is the worst version of a
        // limit — the player assumes the game is broken.
        <div className="tapDone tapCapped">
          <img src={skin} alt="" />
          <h2> سهمیهٔ امروز تمام شد</h2>
          <p>هر روز {fa(CFG.levelsPerDay)} لول می‌توانی بالا بروی.</p>
          <p className="tapResetIn"><SvgIcon name="support" size={16} /> باز شدن تا {formatCountdown(resetIn)} دیگر</p>
        </div>
      ) : (
        <div
          className={`tapArea${pulse ? ' pulse' : ''}`}
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
        {isComplete ? `همهٔ ${fa(CFG.levelCount)} لول تمام شد!`
          : capped ? 'فردا دوباره سر بزن'
            : `ضربه بزن — ${fa(remaining)} امتیاز تا لول بعد`}
      </p>
    </section>
  );
}
