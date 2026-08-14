// Web penalty board, behaviorally and visually ported from Android's
// penalty_board.dart + penalty_net.dart. Both clients consume the exact same
// server state and emit the same {zone,power} moves, so a web player and an
// Android player can share one Socket.IO room without translation.
import React, { useEffect, useRef, useState } from 'react';
import { fa } from './lib/api.js';
import PenaltyNet from './penaltyNet.js';
import { penaltyPowerAt, penaltyView, zoneCenter } from './penaltyModel.js';

const GOAL = '#84CC16';
const SAVE = '#38BDF8';
const MISS = '#EF4444';
const GOLD = '#FFD36B';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutQuad = t => 1 - (1 - t) * (1 - t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function drawNet(ctx, net, left, top, width, height) {
  const cols = PenaltyNet.cols;
  const rows = PenaltyNet.rows;
  const x = (c, r) => left + width * c / (cols - 1) + net.offX(c, r, width);
  const y = (c, r) => top + height * r / (rows - 1) + net.offY(c, r, height);
  const line = (hot) => {
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const isHot = Math.max(Math.abs(net.depth(c, r)),
          Math.abs(net.depth(c + 1, r))) > 0.25;
        if (isHot !== hot) continue;
        ctx.moveTo(x(c, r), y(c, r)); ctx.lineTo(x(c + 1, r), y(c + 1, r));
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows - 1; r++) {
        const isHot = Math.max(Math.abs(net.depth(c, r)),
          Math.abs(net.depth(c, r + 1))) > 0.25;
        if (isHot !== hot) continue;
        ctx.moveTo(x(c, r), y(c, r)); ctx.lineTo(x(c, r + 1), y(c, r + 1));
      }
    }
    ctx.strokeStyle = hot ? 'rgba(255,255,255,.60)' : 'rgba(255,255,255,.18)';
    ctx.lineWidth = hot ? 1.6 : 1;
    ctx.stroke();
  };
  line(false); line(true);
}

function drawBall(ctx, x, y, radius, spin) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, radius * 1.25, radius * .85, radius * .25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16202C'; ctx.beginPath(); ctx.arc(0, 0, radius * .34, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 - Math.PI / 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * radius * .66,
      Math.sin(a) * radius * .66, radius * .19, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawKeeper(ctx, x, y, tilt, size) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath(); ctx.roundRect(-size * .25, -size * .5, size * .5, size, size * .18); ctx.fill();
  ctx.fillStyle = '#FFDBAC'; ctx.beginPath(); ctx.arc(0, -size * .68, size * .22, 0, Math.PI * 2); ctx.fill();
  const spread = size * (.55 + Math.abs(tilt) * .5);
  ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = size * .16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-size * .2, -size * .25); ctx.lineTo(-spread, -size * .55);
  ctx.moveTo(size * .2, -size * .25); ctx.lineTo(spread, -size * .55); ctx.stroke();
  ctx.fillStyle = '#22D3EE';
  ctx.beginPath(); ctx.arc(-spread, -size * .55, size * .13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(spread, -size * .55, size * .13, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawConfetti(ctx, origin, t, scale) {
  const fade = 1 - t;
  if (fade <= 0) return;
  for (let i = 0; i < 14; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const speed = .45 + ((i * 37) % 100) / 100 * .75;
    const d = t * scale * .42 * speed;
    const gy = t * t * scale * .30;
    const x = origin.x + Math.cos(a) * d;
    const y = origin.y + Math.sin(a) * d * .7 + gy;
    const r = scale * .011 * (.6 + (i % 3) * .25) * fade;
    ctx.fillStyle = i % 2 === 0
      ? `rgba(132,204,22,${fade * .85})` : `rgba(255,255,255,${fade * .85})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// نوار قدرت — فقط شدتِ **انیمیشن** شوت را نشان می‌دهد، نه شانس گل.
//
// ⚠️ «پنجرهٔ طلایی» از اینجا حذف شد. قبلاً یک نوار طلایی کشیده می‌شد و
//    به کاربر القا می‌کرد اگر داخلش رها کند شانس گلش بیشتر است — ولی
//    سرور هرگز قدرت را در نتیجه دخالت نمی‌داد. کشیدنِ چیزی که روی
//    نتیجه اثر ندارد، به کاربر دروغ گفتن است.
//
//    تنها قاعده: ناحیهٔ شوت == ناحیهٔ شیرجه → مهار، وگرنه گل.
function drawPower(ctx, power, width, height) {
  const barW = width * .075, barH = height * .46;
  const x = width * .03, y = height * .28;
  ctx.fillStyle = 'rgba(0,0,0,.58)';
  ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 9); ctx.fill();
  const fraction = clamp((power - .35) / .65);
  const fillH = barH * fraction;
  const red = clamp((power - .5) * 2);
  const r = Math.round(132 + (239 - 132) * red);
  const g = Math.round(204 + (68 - 204) * red);
  const b = Math.round(22 + (68 - 22) * red);
  ctx.fillStyle = `rgba(${r},${g},${b},.85)`;
  ctx.beginPath(); ctx.roundRect(x, y + barH - fillH, barW, fillH, 9); ctx.fill();
  const marker = y + barH - fillH;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 3, marker); ctx.lineTo(x + barW + 3, marker); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 9); ctx.stroke();
}

function PenaltyCanvas({ kick, animating, lastKick, selected, power, charging,
  net }) {
  const canvasRef = useRef(null);
  const [sizeEpoch, setSizeEpoch] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const observer = new ResizeObserver(() => setSizeEpoch(v => v + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const pxW = Math.round(rect.width * ratio), pxH = Math.round(rect.height * ratio);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW; canvas.height = pxH;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#0E3B1E'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i += 2) {
      ctx.fillStyle = 'rgba(255,255,255,.025)';
      ctx.fillRect(0, h * (.52 + i * .06), w, h * .06);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.24)'; ctx.lineWidth = 2;
    ctx.strokeRect(w * .10, h * .03, w * .80, h * .62);

    const goalW = w * .78, goalH = h * .46;
    const left = (w - goalW) / 2, top = h * .06;
    const outcome = lastKick?.outcome;
    const shot = lastKick?.shotZone;
    const dive = lastKick?.diveZone;
    const isGoal = animating && outcome === 'goal';
    if (isGoal && kick > .60) {
      const t = clamp((kick - .60) / .40);
      const alpha = t < .15 ? t / .15 : (1 - (t - .15) / .85) * .75;
      const center = shot == null ? { x: w / 2, y: top + goalH / 2 } : zoneCenter(shot, w, h);
      const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, goalW * .7);
      grad.addColorStop(0, `rgba(132,204,22,${.42 * alpha})`);
      grad.addColorStop(.55, `rgba(132,204,22,${.06 * alpha})`);
      grad.addColorStop(1, 'rgba(132,204,22,0)');
      ctx.fillStyle = grad; ctx.fillRect(left, top, goalW, goalH);
    }
    drawNet(ctx, net, left, top, goalW, goalH);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(left, top + goalH); ctx.lineTo(left, top);
    ctx.lineTo(left + goalW, top); ctx.lineTo(left + goalW, top + goalH); ctx.stroke();

    const spot = { x: w / 2, y: h * .88 };
    ctx.fillStyle = 'rgba(255,255,255,.58)'; ctx.beginPath(); ctx.arc(spot.x, spot.y, 3.5, 0, Math.PI * 2); ctx.fill();

    let keeper = { x: w / 2, y: top + goalH * .72 };
    let tilt = 0;
    if (animating && dive != null) {
      const target = zoneCenter(dive, w, h);
      const t = easeOutCubic(clamp(kick / .55));
      keeper = { x: lerp(keeper.x, target.x, t), y: lerp(keeper.y, target.y, t) };
      tilt = (target.x - w / 2) / (goalW / 2) * .9 * t;
    }
    const keeperFront = animating && outcome === 'save' && kick > .38;
    if (!keeperFront) drawKeeper(ctx, keeper.x, keeper.y, tilt, goalH * .30);

    let ball = { ...spot };
    let radius = Math.min(w, h) * .033;
    let visible = true;
    if (animating && shot != null) {
      const target = zoneCenter(shot, w, h);
      const t = clamp(kick / .62);
      const e = easeOutQuad(t);
      const arc = Math.sin(e * Math.PI) * h * .10 * (.5 + Number(lastKick?.power || .7) * .5);
      ball = { x: lerp(spot.x, target.x, e), y: lerp(spot.y, target.y, e) - arc };
      radius = lerp(radius, radius * .55, e);
      if (outcome === 'goal' && kick > .62) {
        const settle = easeOutCubic(clamp((kick - .62) / .38));
        ball.y += goalH * .30 * settle; radius *= 1 - .15 * settle;
      } else if (outcome === 'save' && kick > .62) {
        const back = clamp((kick - .62) / .38);
        ball = { x: lerp(ball.x, spot.x, back), y: lerp(ball.y, spot.y - h * .10, back) };
      } else if (outcome === 'miss') {
        const side = shot % 3 === 0 ? -1 : shot % 3 === 2 ? 1 : 0;
        const up = Math.floor(shot / 3) === 0 ? -1 : 0;
        const over = Math.max(0, (kick - .62) / .38);
        ball.x += side * goalW * (.16 * e + .55 * over);
        ball.y += up * goalH * (.28 * e + .9 * over);
        if (over > .85) visible = false;
      }
    }
    if (visible) drawBall(ctx, ball.x, ball.y, radius, animating ? kick * 14 : 0);
    if (keeperFront) drawKeeper(ctx, keeper.x, keeper.y, tilt, goalH * .30);
    if (isGoal && kick > .62 && shot != null) {
      drawConfetti(ctx, zoneCenter(shot, w, h), clamp((kick - .62) / .38), Math.min(w, h));
    }
    if (charging) drawPower(ctx, power, w, h);
  }, [kick, animating, lastKick, selected, power, charging, net, sizeEpoch]);

  return <canvas ref={canvasRef} className="penCanvas" aria-hidden="true" />;
}

function Scoreboard({ view }) {
  const marker = (h, i) => <i key={`${h.shooter}-${i}`}
    className={h.outcome === 'goal' ? 'goal' : 'save'} />;
  return (
    <section className="penScore">
      <div className={view.myScore > view.foeScore ? 'leading' : ''}>تو</div>
      <strong>{fa(view.myScore)} - {fa(view.foeScore)}</strong>
      <div className={view.foeScore > view.myScore ? 'leading' : ''}>حریف</div>
      {view.suddenDeath && <b>مرگ ناگهانی</b>}
      <div className="penMarkers mine">
        {view.history.filter(h => h.shooter === view.me).map(marker)}
      </div>
      <div className="penMarkers foe">
        {view.history.filter(h => h.shooter === view.foe).map(marker)}
      </div>
    </section>
  );
}

function Outcome({ lastKick, me, kick }) {
  if (!lastKick || kick <= .60) return null;
  const mine = lastKick.shooter === me;
  const text = lastKick.outcome === 'goal'
    ? (mine ? 'گل زدی!' : 'گل خوردی')
    : lastKick.outcome === 'save'
      ? (mine ? 'مهار شد' : 'مهارش کردی!')
      : (mine ? 'بیرون رفت' : 'بیرون زد');
  const color = lastKick.outcome === 'goal' ? (mine ? GOAL : MISS)
    : lastKick.outcome === 'save' ? (mine ? MISS : SAVE) : (mine ? MISS : GOAL);
  return (
    <div className="penOutcome" style={{ '--outcome': color }}>
      <strong>{text}</strong>
    </div>
  );
}

export default function PenaltyGame({ state, mySymbol, onMove }) {
  const view = penaltyView(state, mySymbol);
  const [selected, setSelected] = useState(null);
  const [charging, setCharging] = useState(false);
  const [power, setPower] = useState(.7);
  const [kick, setKick] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [, setFrame] = useState(0);
  const powerRef = useRef(.7);
  const chargeStart = useRef(0);
  const kickStart = useRef(0);
  const played = useRef(0);
  const netHit = useRef(false);
  const net = useRef(new PenaltyNet());

  useEffect(() => {
    if (view.history.length > played.current && view.lastKick) {
      played.current = view.history.length;
      setSelected(null); setCharging(false); setKick(0); setAnimating(true);
      kickStart.current = performance.now();
      netHit.current = false;
    } else if (view.history.length === 0 && played.current !== 0) {
      played.current = 0; net.current.reset(); setKick(0); setAnimating(false);
    }
  }, [view.history.length, view.lastKick]);

  useEffect(() => {
    let raf = 0;
    let previous = performance.now();
    const tick = now => {
      const dt = Math.min(.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      let active = false;
      if (charging) {
        const p = penaltyPowerAt(now - chargeStart.current);
        powerRef.current = p; setPower(p); active = true;
      }
      if (animating) {
        const value = clamp((now - kickStart.current) / 1900);
        setKick(value); active = value < 1;
        if (view.lastKick?.outcome === 'goal' && value >= .62 && !netHit.current) {
          const z = Number(view.lastKick.shotZone || 0);
          net.current.hit(((z % 3) + .5) / 3,
            (Math.floor(z / 3) + .5) / 3, Number(view.lastKick.power || .7));
          netHit.current = true;
        }
        if (value >= 1) setAnimating(false);
      }
      if (!net.current.settled) { net.current.step(dt); active = true; }
      if (active) { setFrame(v => v + 1); raf = requestAnimationFrame(tick); }
    };
    if (charging || animating || !net.current.settled) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charging, animating, view.lastKick]);

  const enabled = !view.alreadyChose && !animating;
  const startShot = (zone, event) => {
    if (!enabled || !view.amShooter) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelected(zone); setCharging(true);
    chargeStart.current = performance.now();
    powerRef.current = .35; setPower(.35);
  };
  const releaseShot = event => {
    if (!charging || selected == null || !view.amShooter) return;
    event?.preventDefault();
    setCharging(false);
    onMove({ zone: selected, power: powerRef.current });
  };
  const dive = zone => {
    if (!enabled || view.amShooter) return;
    setSelected(zone);
    onMove({ zone });
  };

  const prompt = animating ? '...'
    : charging ? 'رها کن تا شوت بزنی'
      : view.alreadyChose || view.waiting ? 'منتظر حریف...'
        : view.amShooter ? 'تو می‌زنی — انگشتت را روی یک گوشه نگه دار'
          : 'تو دروازه‌بانی — حدس بزن کجا می‌زند';

  return (
    <div className="penaltyExact">
      <Scoreboard view={view} />
      <div className="penPitch">
        <PenaltyCanvas kick={kick} animating={animating} lastKick={view.lastKick}
          selected={selected} power={power} charging={charging}
          net={net.current} />
        <div className="penZones" dir="ltr">
          {Array.from({ length: 9 }, (_, zone) => (
            <button key={zone} type="button"
              className={selected === zone ? (view.amShooter ? 'aim' : 'dive') : ''}
              disabled={!enabled}
              aria-label={`ناحیه ${zone + 1}`}
              onPointerDown={e => startShot(zone, e)}
              onPointerUp={releaseShot}
              onPointerCancel={releaseShot}
              onClick={() => dive(zone)}>
              {selected === zone ? (view.amShooter ? '◎' : '✋') : ''}
            </button>
          ))}
        </div>
        <Outcome lastKick={view.lastKick} me={view.me} kick={kick} />
      </div>
      <div className={`penPrompt${view.amShooter ? ' shooter' : ' keeper'}`}>
        {prompt}
      </div>
    </div>
  );
}
