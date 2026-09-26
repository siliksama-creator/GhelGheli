// Web penalty board, behaviorally and visually ported from Android's
// penalty_board.dart + penalty_net.dart. Both clients consume the exact same
// server state and emit the same {zone,power} moves, so a web player and an
// Android player can share one Socket.IO room without translation.
import React, { useEffect, useRef, useState } from 'react';
import { fa } from './lib/api.js';
import PenaltyNet from './penaltyNet.js';
import { play } from './gameAudio.js';
import { heavyImpact, lightImpact, mediumImpact, selectionClick } from './haptics.js';
import { penaltyPowerAt, penaltyView, zoneCenter, ZONES, ZONE_COLS, ZONE_ROWS } from './penaltyModel.js';
import { SvgIcon } from './components/IconAsset.jsx';

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

// ═══════════════════════════════════════════════════════════════════════
// دروازه‌بان = خودِ قلقلی (شخصیتِ لوگو)، تختِ ۲بعدی و هم‌سبکِ بقیهٔ صحنه
// ═══════════════════════════════════════════════════════════════════════
//
// ── چرا پارامتریک و نه فایلِ تصویر ──
//
// اگر PNG/SVG بارگذاری می‌کردیم، انیمیشن فقط «جابه‌جاییِ یک عکسِ ثابت»
// می‌شد. این‌طوری هر عضو مختصاتِ خودش را دارد، پس دست‌ها واقعاً به سمتِ
// توپ دراز می‌شوند، پاها عقب می‌مانند و بدن کش می‌آید. ضمناً هیچ فایلی
// لود نمی‌شود (نه تأخیر، نه کشِ مرورگر) و در هر رزولوشنی تیز است.
//
// ⚠️ همین هندسه مو‌به‌مو در `mobile/lib/screens/user/games/penalty_board.dart`
//    هم هست. هر تغییری اینجا باید آنجا هم بیفتد وگرنه دو کلاینت دو
//    دروازه‌بانِ متفاوت نشان می‌دهند. گاردِ `game-parity` همین را می‌سنجد.
//
// همهٔ اعداد ضریبِ `s` هستند (اندازهٔ پایه)، و مبدأ وسطِ تنه است.
const K = {
  body: '#BCCA21', arm: '#8C9E16', legA: '#7E8C12', legB: '#8C9E16',
  boot: '#52371A', shirt: '#F2EFD2', strap: '#6B5423', shorts: '#5E6816',
  gloveFill: '#F2EFD2', gloveEdge: '#5E6B0E',
  eyeA: '#F6F4E2', eyeB: '#F1EFD6', pupil: '#141804',
  browL: '#33400A', browR: '#3E4A08', mouth: '#2A1B06',
};

/** مسیرِ تنه (گلابی‌شکل) — نقطه‌ها ضریبِ s. */
function keeperBodyPath(ctx, s) {
  const P = (a, b) => [a * s, b * s];
  ctx.beginPath();
  ctx.moveTo(...P(0, -0.709));
  ctx.bezierCurveTo(...P(0.173, -0.709), ...P(0.300, -0.606), ...P(0.346, -0.456));
  ctx.bezierCurveTo(...P(0.404, -0.306), ...P(0.427, -0.167), ...P(0.415, -0.052));
  ctx.bezierCurveTo(...P(0.404, 0.087), ...P(0.300, 0.168), ...P(0.150, 0.191));
  ctx.bezierCurveTo(...P(0.058, 0.202), ...P(-0.058, 0.202), ...P(-0.150, 0.191));
  ctx.bezierCurveTo(...P(-0.300, 0.168), ...P(-0.404, 0.087), ...P(-0.415, -0.052));
  ctx.bezierCurveTo(...P(-0.427, -0.167), ...P(-0.404, -0.306), ...P(-0.346, -0.456));
  ctx.bezierCurveTo(...P(-0.300, -0.606), ...P(-0.173, -0.709), ...P(0, -0.709));
  ctx.closePath();
}

function keeperShirtPath(ctx, s) {
  const P = (a, b) => [a * s, b * s];
  ctx.beginPath();
  ctx.moveTo(...P(-0.300, -0.075));
  ctx.bezierCurveTo(...P(-0.150, 0.006), ...P(0.150, 0.006), ...P(0.300, -0.075));
  ctx.bezierCurveTo(...P(0.323, 0.052), ...P(0.277, 0.144), ...P(0.150, 0.179));
  ctx.bezierCurveTo(...P(0.058, 0.202), ...P(-0.058, 0.202), ...P(-0.150, 0.179));
  ctx.bezierCurveTo(...P(-0.277, 0.144), ...P(-0.323, 0.052), ...P(-0.300, -0.075));
  ctx.closePath();
}

/** ابرو/دهان — شکل‌های کوچکِ ثابت. */
function keeperBrowL(ctx, s) {
  const P = (a, b) => [a * s, b * s];
  ctx.beginPath();
  ctx.moveTo(...P(-0.254, -0.456));
  ctx.bezierCurveTo(...P(-0.173, -0.513), ...P(-0.058, -0.479), ...P(0.012, -0.398));
  ctx.lineTo(...P(-0.035, -0.340));
  ctx.bezierCurveTo(...P(-0.104, -0.409), ...P(-0.173, -0.409), ...P(-0.231, -0.386));
  ctx.closePath();
}
function keeperBrowR(ctx, s) {
  const P = (a, b) => [a * s, b * s];
  ctx.beginPath();
  ctx.moveTo(...P(0.012, -0.559));
  ctx.bezierCurveTo(...P(0.092, -0.606), ...P(0.208, -0.582), ...P(0.265, -0.513));
  ctx.lineTo(...P(0.231, -0.467));
  ctx.bezierCurveTo(...P(0.173, -0.525), ...P(0.092, -0.536), ...P(0.023, -0.513));
  ctx.closePath();
}

/**
 * ست انیمیشنِ دروازه‌بان.
 *
 * @param {object} o
 *  o.size   اندازهٔ پایه
 *  o.tilt   چرخشِ بدن (همان مقدارِ قبلی)
 *  o.dive   جهتِ شیرجه: -1 چپ، 0 بی‌حرکت، +1 راست
 *  o.t      پیشرفتِ شیرجه ۰..۱
 *  o.time   ثانیهٔ جاری — فقط برای نفس‌کشیدنِ حالتِ آماده
 *  o.caught توپ مهار شد؟ (برای پاپِ دستکش)
 */
function drawKeeper(ctx, x, y, o) {
  const s = o.size;
  const dive = o.dive || 0;
  const t = clamp(o.t || 0);
  const moving = dive !== 0 && t > 0;

  // ── ۱) نفس کشیدنِ حالتِ آماده ──
  // بدونِ این، دروازه‌بانِ منتظر مثل مجسمه است. دامنه عمداً کوچک است
  // (۲٪) تا حواسِ بازیکن را از انتخابِ ناحیه پرت نکند.
  const breath = moving ? 0 : Math.sin((o.time || 0) * 2.1) * 0.02;

  // ── ۲) آمادگی (anticipation) ──
  // تا ۱۸٪ اولِ حرکت کمی جمع می‌شود و خلافِ جهت تکیه می‌دهد؛ همان
  // قاعدهٔ کلاسیکِ انیمیشن که پرش را باورپذیر می‌کند.
  const antic = moving ? Math.max(0, 1 - t / 0.18) : 0;
  const crouch = antic * 0.06;

  // ── ۳) کشِ بدن در جهتِ حرکت ──
  const stretch = moving ? Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.14 : 0;

  ctx.save();
  ctx.translate(x, y);
  // شیبِ ترسیم عمداً نرم‌تر از شیبِ منطقی است: چرخشِ کاملِ ۵۰ درجه
  // «افتادن» خوانده می‌شود نه «شیرجه».
  const bodyTilt = (o.tilt || 0) * 0.72;
  ctx.rotate(bodyTilt);
  ctx.scale(1 + stretch, 1 - stretch * 0.45 - crouch + breath);

  // ── پاها: هنگامِ شیرجه عقب می‌مانند ──
  const legSwing = -dive * t * 0.42;
  ctx.save();
  ctx.translate(0, 0.13 * s);
  ctx.rotate(legSwing);
  ctx.translate(0, -0.13 * s);
  const rr = (px, py, w, h, r) => {
    ctx.beginPath(); ctx.roundRect(px * s, py * s, w * s, h * s, r * s); ctx.fill();
  };
  ctx.fillStyle = K.legA; rr(-0.162, 0.133, 0.127, 0.208, 0.058);
  ctx.fillStyle = K.legB; rr(0.035, 0.133, 0.127, 0.208, 0.058);
  ctx.fillStyle = K.boot;
  ctx.beginPath(); ctx.ellipse(-0.127 * s, 0.364 * s, 0.127 * s, 0.069 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.127 * s, 0.364 * s, 0.127 * s, 0.069 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── دست‌ها: به سمتِ توپ دراز می‌شوند ──
  // بازوی سمتِ شیرجه بیشتر باز و بالا می‌رود، بازوی دیگر جمع می‌شود.
  const arm = (sign) => {
    const lead = sign === Math.sign(dive) && dive !== 0;
    // ── چرا زاویه در «دنیای واقعی» حساب می‌شود، نه نسبت به بدن ──
    //
    // بدن که می‌چرخد، شانهٔ سمتِ مخالف به بالای تصویر می‌رود. اگر بازوها
    // را نسبت به بدن بچرخانیم، همان بازوی عقب بالا می‌ایستد و دستِ سمتِ
    // توپ پایین می‌ماند — یعنی دقیقاً برعکسِ شیرجه. پس اول `-bodyTilt`
    // چرخشِ بدن را خنثی می‌کند و بعد زاویهٔ دلخواه اعمال می‌شود.
    const swing = lead
      ? -bodyTilt + sign * 0.23 * t
      : -bodyTilt * 0.2 - sign * 0.35 * t;
    // دستِ سمتِ توپ واقعاً دراز می‌شود — همین «رسیدن» است که شیرجه را
    // باورپذیر می‌کند.
    const reach = lead ? 1 + t * 0.55 : 1 - t * 0.20;
    ctx.save();
    ctx.translate(sign * 0.231 * s, -0.190 * s);
    ctx.rotate(swing);
    ctx.strokeStyle = K.arm;
    ctx.lineWidth = 0.150 * s;
    ctx.lineCap = 'round';
    const hx = sign * 0.346 * reach * s, hy = -0.138 * reach * s;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(hx, hy); ctx.stroke();
    // پاپِ دستکش موقعِ مهار — بازخوردِ لحظهٔ گرفتنِ توپ
    const pop = o.caught ? 1 + 0.35 * Math.sin(clamp((t - 0.55) / 0.45) * Math.PI) : 1;
    ctx.fillStyle = K.gloveFill;
    ctx.strokeStyle = K.gloveEdge;
    ctx.lineWidth = 0.023 * s;
    ctx.beginPath();
    ctx.arc(hx + sign * 0.058 * s, hy - 0.023 * s, 0.121 * s * pop, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  arm(-1); arm(1);

  // ── شورت ──
  ctx.fillStyle = K.shorts;
  ctx.beginPath(); ctx.roundRect(-0.231 * s, 0.041 * s, 0.462 * s, 0.185 * s, 0.046 * s); ctx.fill();

  // ── تنه ──
  ctx.fillStyle = K.body; keeperBodyPath(ctx, s); ctx.fill();

  // ── زیرپوش + بندها ──
  ctx.fillStyle = K.shirt; keeperShirtPath(ctx, s); ctx.fill();
  ctx.strokeStyle = K.strap; ctx.lineCap = 'round';
  ctx.lineWidth = 0.035 * s;
  ctx.beginPath(); ctx.moveTo(0.231 * s, -0.098 * s); ctx.lineTo(0.173 * s, 0.168 * s); ctx.stroke();
  ctx.lineWidth = 0.030 * s;
  ctx.beginPath(); ctx.moveTo(-0.196 * s, -0.052 * s); ctx.lineTo(-0.173 * s, 0.179 * s); ctx.stroke();

  // ── صورت ──
  // مردمک‌ها به سمتِ شیرجه می‌چرخند: نگاه کردن به توپ، ارزانْ‌ترین
  // حقه‌ای است که شخصیت را «زنده» نشان می‌دهد.
  const look = dive * t * 0.030;
  ctx.fillStyle = K.eyeA;
  ctx.beginPath(); ctx.arc(0.081 * s, -0.444 * s, 0.088 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = K.eyeB;
  ctx.beginPath(); ctx.arc(-0.115 * s, -0.352 * s, 0.081 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = K.pupil;
  ctx.beginPath(); ctx.arc((0.099 + look) * s, -0.426 * s, 0.043 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc((-0.097 + look) * s, -0.333 * s, 0.040 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = K.browL; keeperBrowL(ctx, s); ctx.fill();
  ctx.fillStyle = K.browR; keeperBrowR(ctx, s); ctx.fill();
  ctx.strokeStyle = K.mouth;
  ctx.lineWidth = 0.046 * s;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.173 * s, -0.167 * s); ctx.lineTo(0.208 * s, -0.271 * s); ctx.stroke();

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

  // ── تپشِ حالتِ آماده ──
  //
  // بوم فقط وقتی state عوض شود دوباره کشیده می‌شود، پس نفس‌کشیدنِ
  // دروازه‌بان بدونِ یک تیکِ آرام اصلاً دیده نمی‌شود.
  //
  // ⚠️ عمداً ۸ فریم بر ثانیه و **فقط وقتی حرکتی در جریان نیست**: یک
  //    حلقهٔ rAF کاملِ ۶۰fps برای یک بالا-پایینِ ۲٪ باتریِ گوشی را
  //    بی‌دلیل می‌سوزاند. وقتی شوت شروع شود، خودِ `kick` هر فریم
  //    رندر را جلو می‌برد و این تیک خاموش می‌شود.
  const [idleTick, setIdleTick] = useState(0);
  useEffect(() => {
    if (animating) return undefined;
    const id = setInterval(() => setIdleTick(v => (v + 1) % 100000), 125);
    return () => clearInterval(id);
  }, [animating]);

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
    let diveDir = 0;
    let diveT = 0;
    if (animating && dive != null) {
      const target = zoneCenter(dive, w, h);
      const t = easeOutCubic(clamp(kick / .55));
      keeper = { x: lerp(keeper.x, target.x, t), y: lerp(keeper.y, target.y, t) };
      tilt = (target.x - w / 2) / (goalW / 2) * .9 * t;
      // جهت از خودِ ناحیه می‌آید نه از tilt: ناحیه‌های وسط tilt صفر دارند
      // ولی باز هم شیرجهٔ بالا/پایین‌اند و باید دست‌ها حرکت کنند.
      diveDir = Math.sign(Math.round(target.x - w / 2));
      diveT = clamp(kick / .55);
    }
    // ⚠️ اندازه از 0.30 به 0.37 رفت (خواستهٔ مالک: «یکم بزرگتر»).
    const keeperOpts = {
      size: goalH * .37, tilt, dive: diveDir, t: diveT,
      time: idleTick * 0.125,
      caught: outcome === 'save',
    };
    const keeperFront = animating && outcome === 'save' && kick > .38;
    if (!keeperFront) drawKeeper(ctx, keeper.x, keeper.y, keeperOpts);

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
        const col = shot % ZONE_COLS, row = Math.floor(shot / ZONE_COLS);
        const side = col === 0 ? -1 : col === ZONE_COLS - 1 ? 1 : 0;
        const up = row === 0 ? -1 : 0;
        const over = Math.max(0, (kick - .62) / .38);
        ball.x += side * goalW * (.16 * e + .55 * over);
        ball.y += up * goalH * (.28 * e + .9 * over);
        if (over > .85) visible = false;
      }
    }
    if (visible) drawBall(ctx, ball.x, ball.y, radius, animating ? kick * 14 : 0);
    if (keeperFront) drawKeeper(ctx, keeper.x, keeper.y, keeperOpts);
    if (isGoal && kick > .62 && shot != null) {
      drawConfetti(ctx, zoneCenter(shot, w, h), clamp((kick - .62) / .38), Math.min(w, h));
    }
    if (charging) drawPower(ctx, power, w, h);
  }, [kick, animating, lastKick, selected, power, charging, net, sizeEpoch, idleTick]);

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
      {view.extraRound && (
        <b>راندِ اضافه — تا رسیدن به برنده</b>
      )}
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
  // The outcome cue fires once per kick, at the same 62% of the timeline
  // Android uses. `netHit` cannot double as the latch because it only ever
  // trips on a goal, leaving saves and misses silent.
  const outcomeCued = useRef(false);
  const net = useRef(new PenaltyNet());

  useEffect(() => {
    if (view.history.length > played.current && view.lastKick) {
      played.current = view.history.length;
      setSelected(null); setCharging(false); setKick(0); setAnimating(true);
      kickStart.current = performance.now();
      netHit.current = false;
      outcomeCued.current = false;
      // The strike itself, as the ball leaves the boot — `penalty_board.dart`
      // plays Sfx.tap at 0.9 with a light impact at exactly this point.
      play('tap', .9);
      lightImpact();
    } else if (view.history.length === 0 && played.current !== 0) {
      played.current = 0; net.current.reset(); setKick(0); setAnimating(false);
      outcomeCued.current = false;
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
          // ⚠️ هندسه از `penaltyModel` می‌آید، نه عددِ ثابت: با ۳ ستون × ۲
          //    ردیف، تقسیمِ سطر بر ۳ (نسخهٔ ۹ ناحیه‌ای) موج را به نیمهٔ
          //    بالاییِ تور می‌چسباند و برخوردِ پایینِ دروازه را کج نشان
          //    می‌داد.
          net.current.hit(((z % ZONE_COLS) + .5) / ZONE_COLS,
            (Math.floor(z / ZONE_COLS) + .5) / ZONE_ROWS,
            Number(view.lastKick.power || .7));
          netHit.current = true;
        }
        // The verdict lands with the ball, not when the socket message
        // arrived — the same 62% mark the goal-net impact uses, so sound,
        // haptic and the on-screen `Outcome` label all agree.
        if (value >= .62 && !outcomeCued.current && view.lastKick) {
          outcomeCued.current = true;
          const outcome = view.lastKick.outcome;
          if (outcome === 'goal') { play('win', 1); heavyImpact(); }
          else if (outcome === 'save') { play('drop', .9); mediumImpact(); }
          else { play('timeout', .8); selectionClick(); }
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
          {Array.from({ length: ZONES }, (_, zone) => (
            <button key={zone} type="button"
              className={selected === zone ? (view.amShooter ? 'aim' : 'dive') : ''}
              disabled={!enabled}
              aria-label={`ناحیه ${zone + 1}`}
              onPointerDown={e => startShot(zone, e)}
              onPointerUp={releaseShot}
              onPointerCancel={releaseShot}
              onClick={() => dive(zone)}>
              {selected === zone ? (view.amShooter ? <SvgIcon name="target" size={20} /> : <SvgIcon name="glove" size={20} />) : ''}
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
