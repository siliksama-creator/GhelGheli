/**
 * فاز ۱ — «چشم هندسی»: تصحیحِ پرسپکتیوِ کارت.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این لازم شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * لایهٔ بردارِ عصبی (فاز ۲) روی عکسِ **کادرشدهٔ کارت** به ۱۰۰٪ رتبهٔ درست و
 * تأییدِ غلطِ صفر رسید، ولی روی عکسِ «کارت روی میز با کادربندیِ کج» افت می‌کند:
 * پس‌زمینهٔ میز/دست بخش بزرگی از فریم را می‌گیرد و بردار بیشتر «میز» را می‌بیند
 * تا کارت.
 *
 * `cardCrop.cropCard` فقط یک مستطیلِ محور-راست (axis-aligned) دورِ محتوا می‌برد؛
 * گوشه‌های کجِ کارت هنوز مثلث‌های میز را در خود دارند و خودِ کارت صاف نمی‌شود.
 * این ماژول چهار گوشهٔ کارت را پیدا می‌کند و آن را به یک مستطیلِ روبه‌رو
 * (face-on) وارپ می‌کند — دقیقاً مانند اسکنرِ مدارک.
 *
 * ── همه چیز خالصِ JS است ──
 *
 * روی VPS هیچ کتابخانهٔ کامپیوتربینری نصب نیست و نباید باشد (قیدِ بدونِ ارتقای
 * سرور). محاسبات روی یک بافرِ خامِ RGB در ابعادِ کوچک (WORK≈۷۰۰px) انجام
 * می‌شود؛ هوموگرافی و نمونه‌برداریِ دوخطی خودمان پیاده شده و وابستگی‌ای جز
 * sharp (که از قبل هست) ندارد.
 *
 * ── شکستِ بی‌صدا و امن ──
 *
 * اگر گوشه‌ها با اطمینان پیدا نشوند، `null` برمی‌گردد تا caller به همان برشِ
 * مستطیلیِ قبلی برگردد. برشِ اشتباه بدتر از نبریدن است: هرگز با اطمینانِ کم
 * وارپ نمی‌کنیم.
 */

// ابعادِ کاریِ کوچک برای تحلیل (مستقل از ابعادِ خروجیِ وارپ).
const WORK = 700;

// نسبتِ ابعادِ کارت (عرض:ارتفاع) — کارتِ بازی/کارتِ تجاری نزدیک به استاندارد
// 2.5in × 3.5in یعنی ۵:۷. با حاشیهٔ آزاد می‌گیریم تا وارپِ اشتباه نکنیم.
const CARD_ASPECT = 5 / 7; // عرض/ارتفاع

/**
 * برچسب‌گذاریِ چهار نقطهٔ پوسته به TL، TR، BR، BL بر اساس مرکز.
 */
function orderQuad(pts) {
  let cx = 0; let cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const tl = pts.reduce((b, p) => (!b || (p.x + p.y) < (b.x + b.y) ? p : b), null);
  const br = pts.reduce((b, p) => (!b || (p.x + p.y) > (b.x + b.y) ? p : b), null);
  const tr = pts.reduce((b, p) => (!b || (p.x - p.y) > (b.x - b.y) ? p : b), null);
  const bl = pts.reduce((b, p) => (!b || (p.y - p.x) > (b.y - b.x) ? p : b), null);
  return [tl, tr, br, bl];
}

/**
 * پوستهٔ محدب (monotone chain) روی نقاط پیش‌زمینه.
 */
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper); // CCW
}

/** مساحتِ دوبرابرِ مثلث (قدرمطلق). */
function triArea2(a, b, c) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/**
 * چهارضلعیِ محدبِ بیشینه‌مساحتِ داخلِ پوسته — همان چهار گوشهٔ کارت.
 * الگوریتمِ کالیپرِ دوار (O(n²)) روی قطرِ (i,j).
 */
function maxAreaQuad(hull) {
  const n = hull.length;
  if (n < 4) return null;
  let best = -1; let bestQ = null;
  for (let i = 0; i < n; i++) {
    let k = (i + 2) % n;
    let l = (i + 1) % n;
    for (let s = 0; s < n - 2; s++) {
      const j = (i + 2 + s) % n;
      // کالیپرِ نقطهٔ سوم روی کمانِ i→j
      for (let guard = 0; guard < n; guard++) {
        const k2 = (k + 1) % n;
        if (k2 === j || k2 === i) break;
        if (triArea2(hull[i], hull[k2], hull[j]) > triArea2(hull[i], hull[k], hull[j])) k = k2;
        else break;
      }
      // کالیپرِ نقطهٔ چهارم روی کمانِ j→i (دورِ دیگر)
      for (let guard = 0; guard < n; guard++) {
        const l2 = (l + 1) % n;
        if (l2 === i || l2 === j) break;
        if (triArea2(hull[j], hull[l2], hull[i]) > triArea2(hull[j], hull[l], hull[i])) l = l2;
        else break;
      }
      const area = triArea2(hull[i], hull[k], hull[j]) + triArea2(hull[j], hull[l], hull[i]);
      if (area > best) {
        best = area;
        bestQ = [hull[i], hull[k], hull[j], hull[l]];
      }
    }
  }
  return bestQ ? { quad: bestQ, area2: best } : null;
}

/**
 * هوموگرافیِ ۳×۳ از چهار گوشهٔ مقصد (مربع) به چهار گوشهٔ مبدأ (کارتِ کج).
 * خروجی نگاشتی است که پیکسلِ تصویرِ صاف‌شده را به تصویرِ کج می‌برد (برای
 * نمونه‌برداریِ معکوس).
 */
function findHomography(src, dst) {
  // src و dst: آرایهٔ ۴ نقطه [x,y]. حلِ کمترین مربعات (۸ معادله، ۹ مجهول).
  const A = [];
  const B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = [src[i].x, src[i].y];
    const [u, v] = [dst[i].x, dst[i].y];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }
  // گاوس-جردن روی دستگاهِ خطی.
  const N = 8;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < N; col++) {
    let piv = col;
    for (let r = col + 1; r < N; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let c = col; c <= N; c++) M[col][c] /= d;
    for (let r = 0; r < N; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= N; c++) M[r][c] -= f * M[col][c];
    }
  }
  const h = M.map(row => row[N]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

const DBG = process.env.GG_PERSPECTIVE_DEBUG === '1';
function dlog(...a) { if (DBG) console.error('[persp]', ...a); }

/**
 * تحلیلِ تصویر و استخراجِ چهار گوشهٔ کارت.
 * @returns {Promise<{corners:object[], w:number, h:number, confident:boolean}|null>}
 */
async function detectCardQuad(normBuf) {
  const sharp = require('sharp');
  const img = sharp(normBuf, { failOn: 'none' })
    .rotate()
    .resize(WORK, WORK, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .blur(1)
    .raw();
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  const w = info.width; const h = info.height; const ch = info.channels;
  if (w < 120 || h < 120) return null;
  const at = (x, y) => {
    const i = (y * w + x) * ch;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // ── رنگِ پس‌زمینه از حاشیه (میانه) ──
  const b = Math.max(3, Math.round(Math.min(w, h) * 0.06));
  const sr = []; const sg = []; const sb = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= b && x < w - b && y >= b && y < h - b) continue;
      const [r, g, bl] = at(x, y);
      sr.push(r); sg.push(g); sb.push(bl);
    }
  }
  const mid = (arr) => { const a = Float64Array.from(arr).sort(); return a[a.length >> 1]; };
  const bg = [mid(sr), mid(sg), mid(sb)];

  // یکدستیِ حاشیه: اگر پرتنوع بود، کارت تمام‌کادر است → بدونِ وارپ.
  const distB = sr.map((_, i) =>
    Math.abs(sr[i] - bg[0]) + Math.abs(sg[i] - bg[1]) + Math.abs(sb[i] - bg[2])).sort((a, z) => a - z);
  const p50 = distB[Math.floor(distB.length * 0.50)];
  if (p50 > 30) return null;
  const spread = distB[Math.floor(distB.length * 0.75)];
  const thr = Math.max(30, spread);

  // ── ماسکِ «پس‌زمینه نیست» ──
  const mask = new Uint8Array(w * h);
  let fg = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, bl] = at(x, y);
      const d = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(bl - bg[2]);
      if (d > thr) { mask[y * w + x] = 1; fg++; }
    }
  }
  const areaRatio = fg / (w * h);
  // کارت باید بخشِ معقولی از کادر باشد، نه تمامِ آن (آن‌وقت تمام‌کادر است و
  // وارپ لازم نیست) و نه یک لکهٔ کوچک. بازهٔ پایین واقعی‌تر گرفته شده: در عکسِ
  // گوشی کارت می‌تواند ~۲۰٪ کادر باشد.
  if (areaRatio < 0.07 || areaRatio > 0.90) return null;

  // ── گاردِ «تمام‌کادر» (full-bleed) ──
  //
  // طرحِ مرجعِ تمام‌کادر (مثل کارت‌های پوسترمانند که کل فریم را می‌گیرند) هیچ
  // پس‌زمینه‌ای ندارند: خودِ کارت تا لبه‌های تصویر می‌رسد. در آن حالت «رنگِ
  // پس‌زمینه» در واقع رنگِ لبهٔ کارت است و آستانه‌گذاری، محتوای داخلیِ کارت را
  // به‌غلط پیش‌زمینه می‌گیرد و یک چهارضلعیِ کاذب می‌سازد.
  //
  // تشخیص: کارتِ روی میز از **هر چهار طرف** با پس‌زمینه احاطه شده، پس نوارِ
  // بیرونیِ تصویر تقریباً همه پس‌زمینه است. در طرحِ تمام‌کادر، نوارِ بیرونی
  // مقدار زیادی پیش‌زمینه دارد. اگر سهمِ پیش‌زمینه در این نوار بالا بود، وارپ
  // بی‌معناست.
  const ring = Math.max(3, Math.round(Math.min(w, h) * 0.03));
  let ringTot = 0; let ringFg = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inRing = x < ring || x >= w - ring || y < ring || y >= h - ring;
      if (!inRing) continue;
      ringTot++;
      if (mask[y * w + x]) ringFg++;
    }
  }
  if (ringTot && ringFg / ringTot > 0.30) return null;


  // ── نقاطِ پیش‌زمینه (گام ۳ برای سبک‌شدنِ پوسته) ──
  //
  // ⚠️ مختصات‌ها در فضای پیکسلِ کامل نگه داشته می‌شوند (نه اندیسِ گام‌۳)،
  // وگرنه پوسته روی شبکهٔ ۱/۳ ساخته می‌شود و همهٔ سنجه‌های کجی/مساحت سه برابر
  // کوچک‌تر از واقعیت می‌شوند.
  const STEP = 3;
  const on = [];
  for (let y = 0; y < h; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      if (mask[y * w + x]) on.push({ x, y });
    }
  }
  if (on.length < 30) return null;

  // ── پوستهٔ محدب → چهارضلعیِ بیشینه‌مساحت = چهار گوشهٔ کارت ──
  //
  // روشِ استانداردِ اسکنرِ مدارک: کارت بزرگ‌ترین شیء محدبِ صحنه است؛ چهار
  // گوشه‌اش آن چهار‌ضلعیِ محدبی است که بیشترین مساحت را روی پوسته می‌سازد.
  // نسبت به «نزدیک‌ترین پیکسل به گوشهٔ فریم» بسیار مقاوم‌تر است چون کلِ مرز
  // را می‌بیند، نه یک گوشه.
  const hull = convexHull(on);
  if (hull.length < 4) return null;
  const found = maxAreaQuad(hull);
  if (!found) return null;
  const quad = orderQuad(found.quad);

  // ── اعتبارسنجیِ چهار‌ضلعی ──
  const Q = quad;
  const distPt = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const edges = [distPt(Q[0], Q[1]), distPt(Q[1], Q[2]), distPt(Q[2], Q[3]), distPt(Q[3], Q[0])];
  const diagA = distPt(Q[0], Q[2]); const diagB = distPt(Q[1], Q[3]);
  // محدب‌بودن (مساحتِ علامتی یکدست)
  const area2 = Math.abs(
    (Q[1].x - Q[0].x) * (Q[2].y - Q[0].y) - (Q[2].x - Q[0].x) * (Q[1].y - Q[0].y))
    + Math.abs((Q[1].x - Q[3].x) * (Q[2].y - Q[3].y) - (Q[2].x - Q[3].x) * (Q[1].y - Q[3].y));
  const quadArea = found.area2 / 2; // px² در مختصاتِ تحلیلی
  const quadRatio = quadArea / (w * h);
  if (quadRatio < 0.10 || quadRatio > 0.9) return null;
  // اضلاع نباید خیلی نامتوازن باشند (کارت تحریفِ آن‌قدر شدید ندارد)
  const minE = Math.min(...edges); const maxE = Math.max(...edges);
  dlog('quadRatio', quadRatio.toFixed(3), 'edgeMin/Max', (minE / maxE).toFixed(2),
    'diagRatio', (Math.min(diagA, diagB) / Math.max(diagA, diagB)).toFixed(2));
  if (minE < 0.35 * maxE) return null;
  // قطرها نباید بیش از حد نابرابر باشند (چهار‌ضلعیِ ناجور = تشخیص غلط)
  if (Math.min(diagA, diagB) < 0.55 * Math.max(diagA, diagB)) return null;

  // ── گاردِ «کجی» (skew) ──
  //
  // تصویرِ مرجعِ تمیز، کارتی روبه‌رو با حاشیهٔ یکدست است؛ چهارگوشه‌اش تقریباً
  // محور-راست است. اگر در این حالت وارپ کنیم، کارتِ درست را بی‌دلیل دستکاری
  // (و گاهی کمی کشیده) می‌کنیم. وارپ فقط وقتی ارزش دارد که کارت **واقعاً کج**
  // باشد (عکسِ گوشی روی میز).
  //
  // معیار: زاویهٔ انحرافِ هر ضلع از محورِ خودش. لبه‌های بالا/پایین کارتِ صاف
  // تقریباً افقی‌اند (Δy کوچک نسبت به طول)؛ لبه‌های چپ/راست تقریباً قائم
  // (Δx کوچک نسبت به طول). با sin زاویه می‌سنجیم:
  //   sin(زاویه از افق) = |Δy| / طول   برای لبه‌های افقی
  //   sin(زاویه از قائم) = |Δx| / طول  برای لبه‌های قائم
  const sinFromHoriz = (p, q) => Math.abs(q.y - p.y) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
  const sinFromVert = (p, q) => Math.abs(q.x - p.x) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
  const tiltTop = sinFromHoriz(Q[0], Q[1]);
  const tiltBot = sinFromHoriz(Q[3], Q[2]);
  const tiltLeft = sinFromVert(Q[0], Q[3]);
  const tiltRight = sinFromVert(Q[1], Q[2]);
  const maxTilt = Math.max(tiltTop, tiltBot, tiltLeft, tiltRight);
  // sin(≈۶°)≈۰.۱۰. کجیِ کمتر از ~۶ درجه یعنی کارت عملاً روبه‌روست؛ وارپ
  // سودی ندارد و خطرِ دستکاریِ بی‌دلیل دارد.
  if (maxTilt < 0.05) return null;

  // ── گاردِ «پوشش» ──
  //
  // در کارتِ واقعی روی میز، تقریباً همهٔ پیش‌زمینه **داخل** چهارگوشه است
  // (خودِ کارت). در طرحِ تمام‌کادر با فضای روشنِ داخلی، چهارگوشه فقط دورِ
  // یکی از فیگورها کشیده می‌شود و بخش بزرگی از پیش‌زمینه (بازیکن‌های دیگر،
  // تیترها) بیرونش می‌ماند. پس سهمِ پیش‌زمینه‌ای که داخلِ چهارگوشه افتاده را
  // می‌سنجیم؛ اگر کم بود، یعنی این چهارگوشه کلِ شیء نیست → تشخیص غلط.
  const inQuad = (px, py) => {
    // علامتِ یکدستِ حاصل‌ضربِ برداری برای چهار‌ضلعیِ محدبِ مرتب.
    let pos = 0; let neg = 0;
    for (let i = 0; i < 4; i++) {
      const a = Q[i]; const b2 = Q[(i + 1) % 4];
      const cr = (b2.x - a.x) * (py - a.y) - (b2.y - a.y) * (px - a.x);
      if (cr > 0) pos++; else if (cr < 0) neg++;
      if (pos > 0 && neg > 0) return false;
    }
    return true;
  };
  let fgTot2 = 0; let fgInside = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      if (mask[y * w + x]) {
        fgTot2++;
        if (inQuad(x, y)) fgInside++;
      }
    }
  }
  const cover = fgTot2 ? fgInside / fgTot2 : 0;
  if (cover < 0.90) return null;

  // ── گاردِ «حلقهٔ بیرونی یکنواخت» ──
  //
  // در عکسِ کارت روی میز، بیرونِ چهارگوشه واقعاً پس‌زمینه است و رنگش با
  // میانهٔ حاشیه (bg) یکی می‌ماند. در طرحِ تمام‌کادر، بیرونِ چهارگوشه فیگور/
  // متنِ رنگی است که با bg فرق دارد. پس پیکسل‌های بیرونِ چهارگوشه را که
  // «پس‌زمینه‌شمرده» نشده‌اند می‌سنجیم: اگر سهم بزرگی از حلقهٔ بیرونی،
  // پیش‌زمینهٔ رنگیِ خارج از چهارگوشه باشد، این یک طرحِ تمام‌کادر است نه کارت
  // روی میز → وارپ نکن.
  const outsideQ = Q.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const insideQ2 = (px, py) => {
    let pos = 0; let neg = 0;
    for (let i = 0; i < 4; i++) {
      const a = outsideQ[i]; const b2 = outsideQ[(i + 1) % 4];
      const cr = (b2.x - a.x) * (py - a.y) - (b2.y - a.y) * (px - a.x);
      if (cr > 0) pos++; else if (cr < 0) neg++;
      if (pos && neg) return false;
    }
    return true;
  };
  let ringPixels = 0; let ringNonBg = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      if (insideQ2(x, y)) continue;
      // فقط پیکسل‌های نسبتاً نزدیک به چهارگوشه/فریم را هم مهم نیست؛ کل بیرون.
      ringPixels++;
      if (mask[y * w + x]) ringNonBg++;
    }
  }
  const outsideFgRatio = ringPixels ? ringNonBg / ringPixels : 0;
  // کارتِ روی میز: بیرونش ~۰٪ پیش‌زمینهٔ غیر از بدنهٔ کارت است. اگر بیشتر از
  // چند درصد باشد، یعنی محتوای کارت بیرون چهارگوشه هم هست → تمام‌کادر.
  if (outsideFgRatio > 0.06) return null;

  // ── گاردِ «حاشیهٔ چهارگوشه» ──
  //
  // کارتِ واقعی روی میز از هر چهار طرف با پس‌زمینه احاطه شده، پس بین چهارگوشه
  // و لبه‌های تصویر فاصله است. در طرحِ تمام‌کادر کارت تا لبه می‌رسد؛ چهارگوشه‌ای
  // که به لبه می‌چسبد یعنی در حال وارپِ خودِ تصویرِ مرجعیم. اگر کمترین فاصله
  // از هر لبه از ~۴٪ کمتر بود، وارپ نکن.
  const padL = Math.min(Q[0].x, Q[3].x) / w;
  const padR = (w - Math.max(Q[1].x, Q[2].x)) / w;
  const padT = Math.min(Q[0].y, Q[1].y) / h;
  const padB = (h - Math.max(Q[2].y, Q[3].y)) / h;
  if (Math.min(padL, padR, padT, padB) < 0.04) return null;

  return { corners: Q, w, h, confident: true, scale: 1 };
}

/**
 * وارپِ تصویر با هوموگرافی به مستطیلِ مقصد.
 * @param {Buffer} normBuf تصویرِ rotate()شده (RGB)
 * @param {Array} quad چهار گوشه در مختصاتِ WORK
 * @param {{dw:number,dh:number, offx:number, offy:number, workW:number, workH:number}} ctx
 */
async function warpToRect(normBuf, quad, ctx) {
  const sharp = require('sharp');
  // تصویرِ منبع را در همان ابعادِ تحلیلی (WORK) می‌خوانیم تا مختصات‌ها جور باشد.
  const { data, info } = await sharp(normBuf, { failOn: 'none' })
    .rotate()
    .resize(ctx.workW, ctx.workH, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sw = info.width; const sh = info.height; const ch = info.channels;
  const DW = ctx.dw; const DH = ctx.dh;
  const out = Buffer.alloc(DW * DH * 3).fill(40); // پس‌زمینهٔ خنثیِ تیره

  // مقصد: مستطیلِ کامل در ابعاد خروجی.
  const dst = [
    { x: 0, y: 0 }, { x: DW - 1, y: 0 }, { x: DW - 1, y: DH - 1 }, { x: 0, y: DH - 1 },
  ];
  // مختصاتِ گوشه‌ها به مقیاسِ تصویرِ تحلیلیِ واقعی (sw/sh ممکن است با w/h فرق
  // جزئی داشته باشند چون fit:inside).
  const sx = sw / ctx.workW; const sy = sh / ctx.workH;
  const src = quad.map(p => ({ x: p.x * sx, y: p.y * sy }));
  // برای نمونه‌برداریِ معکوس به ماتریسی نیاز داریم که پیکسلِ خروجی (مستطیلِ
  // مقصد) را به تصویرِ کج (مبدأ) ببرد: dst → src.
  const H = findHomography(dst, src);

  const bilinear = (fx, fy) => {
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const tx = fx - x0; const ty = fy - y0;
    const x1 = x0 + 1; const y1 = y0 + 1;
    if (x0 < 0 || y0 < 0 || x1 >= sw || y1 >= sh) return null;
    const idx = (x, y) => (y * sw + x) * ch;
    const c = (x, y, k) => data[idx(x, y) + k];
    const px = (k) => {
      const v = (1 - tx) * (1 - ty) * c(x0, y0, k)
        + tx * (1 - ty) * c(x1, y0, k)
        + (1 - tx) * ty * c(x0, y1, k)
        + tx * ty * c(x1, y1, k);
      return v;
    };
    return [px(0), px(1), px(2)];
  };

  for (let y = 0; y < DH; y++) {
    for (let x = 0; x < DW; x++) {
      const w0 = H[6] * x + H[7] * y + H[8];
      const fx = (H[0] * x + H[1] * y + H[2]) / w0;
      const fy = (H[3] * x + H[4] * y + H[5]) / w0;
      const col = bilinear(fx, fy);
      const o = (y * DW + x) * 3;
      if (col) { out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; }
    }
  }
  return sharp(out, { raw: { width: DW, height: DH, channels: 3 } })
    .webp({ quality: 82 })
    .toBuffer();
}

/**
 * تصحیحِ پرسپکتیوِ کارت در یک تصویر.
 *
 * @param {Buffer} buf تصویرِ ورودی
 * @returns {Promise<{buffer:Buffer, warped:true, quad:number[][]|null}>} یا
 *   `{ buffer: buf, warped:false, quad:null }` اگر نتوان با اطمینان وارپ کرد.
 */
async function straightenCard(buf) {
  const fail = { buffer: buf, warped: false, quad: null };
  try {
    const sharp = require('sharp');
    const norm = await sharp(buf, { failOn: 'none' }).rotate().removeAlpha().toBuffer();
    const det = await detectCardQuad(norm);
    if (!det || !det.confident) return fail;

    // ابعادِ خروجی: طولِ متوسطِ دو ضلعِ قائم (بلند) و دو ضلعِ افقی (کوتاه).
    // گرفتنِ نسبت از خودِ چهارگوشه، کشیدگیِ کارت‌های غیراستاندارد را صفر
    // می‌کند (به‌جای فرضِ ثابتِ ۵:۷).
    const edgeLen = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const C = det.corners;
    const wAvg = (edgeLen(C[0], C[1]) + edgeLen(C[3], C[2])) / 2;
    const hAvg = (edgeLen(C[1], C[2]) + edgeLen(C[0], C[3])) / 2;
    // کارت عمودی است؟ در عمل هریک از دو ضلع بزرگ‌تر را «بلند» می‌گیریم.
    const portrait = hAvg >= wAvg;
    const OUT_LONG = 720;
    let DW, DH;
    if (portrait) {
      DH = OUT_LONG;
      DW = Math.max(220, Math.round(OUT_LONG * (wAvg / hAvg)));
    } else {
      DW = OUT_LONG;
      DH = Math.max(220, Math.round(OUT_LONG * (hAvg / wAvg)));
    }
    const out = await warpToRect(norm, det.corners, {
      dw: DW, dh: DH, workW: det.w, workH: det.h,
    });
    return { buffer: out, warped: true, quad: det.corners.map(p => [Math.round(p.x), Math.round(p.y)]) };
  } catch {
    return fail;
  }
}

module.exports = {
  straightenCard,
  _internals: { findHomography, orderQuad, detectCardQuad, warpToRect, CARD_ASPECT },
};
