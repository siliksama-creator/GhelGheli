/**
 * استنتاجِ عصبیِ **روی سرور** (فاز ۴ — تأیید خودکارِ صفِ بررسی).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا سرور؟
 * ═══════════════════════════════════════════════════════════════════════════
 * مدلِ بصری روی گوشی اجرا می‌شود ولی گوشی بردارِ ضعیف/کوچک می‌فرستد و اصلاً
 * برشِ چهره ندارد؛ برای همین بخشی از کارت‌های سالم به‌خاطر حاشیهٔ کم به صف
 * می‌روند. سرور عکسِ **کامل و تمام‌رزولوشن** را نگه می‌دارد و می‌تواند همان
 * خط‌لوله‌ای را که در وب ساختیم (یونِت + س‌فیس + امبد کارت) اینجا اجرا کند:
 *
 *   • YuNet  → آشکارسازِ چهره (۶۴۰×۶۴۰، BGR)
 *   • SFace  → شناساگرِ چهره (۱۱۲×۱۱۲ ترازشده، بردار ۱۲۸تایی)
 *   • MobileNetV3 → بردارِ بصریِ کارت (۲۲۴×۲۲۴، بردار ۱۲۸۰تایی)
 *
 * بارِ CPU فقط روی اقلیتِ مبهم می‌افتد (نه مسیر اصلی ثبت)، پس عملاً رایگان است.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * شکستِ بی‌صدا
 * ═══════════════════════════════════════════════════════════════════════════
 * اگر onnxruntime نصب/لود نشد یا مدل نبود، همهٔ توابع `null` برمی‌گردانند و
 * تصمیم‌گیر این لایه را «نبودِ شاهد» تلقی می‌کند → پرونده در صف می‌ماند. هیچ
 * خطایی نباید جریان را بشکند؛ صف همیشه مسیر امنِ پیش‌فرض است.
 */

const fs = require('fs');
const path = require('path');

const DET_SIZE = 640;
const FACE_SIZE = 112;
const FACE_DIM = 128;
const CARD_SIZE = 224;
const CARD_MEAN = [0.485, 0.456, 0.406];
const CARD_STD = [0.229, 0.224, 0.225];

let _sharp = null;
let _ort = null;
let _sessionsPromise = null;
let _modelDir = null;
let _disabled = false;

function sharp() {
  if (_sharp === null) {
    try { _sharp = require('sharp'); } catch { _sharp = false; }
  }
  return _sharp || null;
}

function ort() {
  if (_ort === null) {
    try { _ort = require('onnxruntime-node'); } catch { _ort = false; }
  }
  return _ort || null;
}

/**
 * مسیرِ پوشهٔ مدل‌ها را پیدا می‌کند. مدل‌ها در اپِ وب/ادمین سِرو می‌شوند؛ اینجا
 * همان فایل‌ها را مستقیم از دیسک می‌خوانیم تا بک‌اند به بیلدِ فرانت وابسته نباشد.
 */
function resolveModelDir() {
  if (_modelDir !== null) return _modelDir;
  const root = path.resolve(__dirname, '..', '..', '..');
  const candidates = [
    process.env.VISION_MODEL_DIR,
    path.join(root, 'ml-models'),
    path.join(root, 'userweb', 'public', 'ml'),
    path.join(root, 'admin', 'public', 'ml'),
    '/var/www/GhelGheli/userweb/public/ml',
    '/var/www/GhelGheli/ml-models',
  ].filter(Boolean);
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'yunet.onnx'))
      && fs.existsSync(path.join(dir, 'sface.onnx'))
      && fs.existsSync(path.join(dir, 'card_embed_mobilenetv3.onnx'))) {
      _modelDir = dir;
      return dir;
    }
  }
  _modelDir = false;
  return false;
}

async function getSessions() {
  if (_disabled) return null;
  if (_sessionsPromise) return _sessionsPromise;
  _sessionsPromise = (async () => {
    const o = ort();
    const dir = resolveModelDir();
    if (!o || !dir) { _disabled = true; return null; }
    try {
      // لاگ‌های پُرسروصدای گرافِ onnx را خفه می‌کنیم.
      try { o.env.logLevel = '3'; } catch { /* بی‌خیال */ }
      const [det, rec, card] = await Promise.all([
        o.InferenceSession.create(path.join(dir, 'yunet.onnx'), { executionProviders: ['cpu'] }),
        o.InferenceSession.create(path.join(dir, 'sface.onnx'), { executionProviders: ['cpu'] }),
        o.InferenceSession.create(path.join(dir, 'card_embed_mobilenetv3.onnx'), { executionProviders: ['cpu'] }),
      ]);
      return { o, det, rec, card };
    } catch {
      _disabled = true;
      return null;
    }
  })();
  const r = await _sessionsPromise;
  if (!r) _sessionsPromise = null;
  return r;
}

/** true اگر حداقلِ ابزار (شَرپ + onnx + مدل‌ها) آماده است. */
async function available() {
  return !!(sharp() && await getSessions());
}

async function rawRgb(imageBuf, w, h) {
  const { data } = await sharp()(imageBuf)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data; // RGB، row-major
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // هر دو نرمال‌اند
}

function l2norm(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

// ── YuNet: ورودی ۶۴۰ BGR ──
function buildDetTensor(o, buf) {
  const n = DET_SIZE * DET_SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const s = i * 3;
    out[i] = buf[s + 2];        // B
    out[n + i] = buf[s + 1];    // G
    out[2 * n + i] = buf[s];    // R
  }
  return new o.Tensor('float32', out, [1, 3, DET_SIZE, DET_SIZE]);
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni <= 0 ? 0 : inter / uni;
}

function nms(faces, th) {
  faces.sort((a, b) => b.score - a.score);
  const keep = [];
  const used = new Array(faces.length).fill(false);
  for (let i = 0; i < faces.length; i++) {
    if (used[i]) continue;
    keep.push(faces[i]);
    for (let j = i + 1; j < faces.length; j++) {
      if (!used[j] && iou(faces[i], faces[j]) > th) used[j] = true;
    }
  }
  return keep;
}

function tensorData(out, name) {
  return out[name] ? out[name].data : null;
}

// پس‌پردازشِ YuNet (پورتِ مو‌به‌موِ cv::FaceDetectorYN).
function detectFaces(out, scoreTh = 0.6, nmsTh = 0.3) {
  const strides = [8, 16, 32];
  const faces = [];
  for (const st of strides) {
    const cls = tensorData(out, `cls_${st}`);
    const obj = tensorData(out, `obj_${st}`);
    const bbox = tensorData(out, `bbox_${st}`);
    const kps = tensorData(out, `kps_${st}`);
    if (!cls || !obj || !bbox || !kps) continue;
    const cols = DET_SIZE / st, rows = DET_SIZE / st;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cs = Math.min(1, Math.max(0, cls[idx]));
        const os = Math.min(1, Math.max(0, obj[idx]));
        const score = Math.sqrt(cs * os);
        if (score < scoreTh) continue;
        const cx = (c + bbox[idx * 4 + 0]) * st;
        const cy = (r + bbox[idx * 4 + 1]) * st;
        const w = Math.exp(bbox[idx * 4 + 2]) * st;
        const h = Math.exp(bbox[idx * 4 + 3]) * st;
        const kp = [];
        for (let n = 0; n < 5; n++) {
          kp.push((kps[idx * 10 + 2 * n] + c) * st,
                  (kps[idx * 10 + 2 * n + 1] + r) * st);
        }
        faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, kp, score });
      }
    }
  }
  return nms(faces, nmsTh);
}

// ── هم‌ترازیِ ArcFace/SFace (پورتِ cv::FaceRecognizerSF) ──
const DST = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
  [41.5493, 92.3655], [70.7299, 92.2041],
];
const DST_MEAN = [56.0262, 71.9008];

function svd2(A) {
  const [a, b, c, d] = A;
  const E = a * a + b * b + c * c + d * d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, E * E - 4 * det * det));
  const s1 = Math.sqrt((E + disc) / 2);
  const s2 = Math.sqrt(Math.max(0, (E - disc) / 2));
  const phi = Math.atan2(c - b, a + d);
  const cp = Math.cos(phi), sp = Math.sin(phi);
  return { s: [s1, s2], R: [cp, -sp, sp, cp] };
}

function similarityTransform(src) {
  const m = [0, 0];
  for (const p of src) { m[0] += p[0]; m[1] += p[1]; }
  m[0] /= 5; m[1] /= 5;
  const sdm = src.map((p) => [p[0] - m[0], p[1] - m[1]]);
  const ddm = DST.map((p) => [p[0] - DST_MEAN[0], p[1] - DST_MEAN[1]]);
  let A00 = 0, A01 = 0, A10 = 0, A11 = 0;
  for (let i = 0; i < 5; i++) {
    A00 += ddm[i][0] * sdm[i][0];
    A01 += ddm[i][0] * sdm[i][1];
    A10 += ddm[i][1] * sdm[i][0];
    A11 += ddm[i][1] * sdm[i][1];
  }
  A00 /= 5; A01 /= 5; A10 /= 5; A11 /= 5;
  const detA = A00 * A11 - A01 * A10;
  const detSign = detA < 0 ? -1 : 1;
  const { s, R } = svd2([A00, A01, A10, A11]);
  if (detSign < 0) { R[1] = -R[1]; R[3] = -R[3]; }
  let v = 0;
  for (const p of sdm) v += p[0] * p[0] + p[1] * p[1];
  const scale = (s[0] + detSign * s[1]) / (v / 5);
  const ts0 = R[0] * m[0] + R[1] * m[1];
  const ts1 = R[2] * m[0] + R[3] * m[1];
  return [R[0] * scale, R[1] * scale, DST_MEAN[0] - scale * ts0,
          R[2] * scale, R[3] * scale, DST_MEAN[1] - scale * ts1];
}

// وارپِ آفاینِ معکوس: پیکسل مقصد (x,y) را از منبع (sx,sy) نمونه‌برداری می‌کند.
function warpFace(srcBuf, M) {
  const [a, b, c, d, e, f] = M;
  const det = a * e - b * d;
  const out = Buffer.alloc(FACE_SIZE * FACE_SIZE * 3);
  for (let y = 0; y < FACE_SIZE; y++) {
    for (let x = 0; x < FACE_SIZE; x++) {
      const sx = Math.round((e * (x - c) - b * (y - f)) / det);
      const sy = Math.round((-d * (x - c) + a * (y - f)) / det);
      let r = 0, g = 0, bl = 0;
      if (sx >= 0 && sx < DET_SIZE && sy >= 0 && sy < DET_SIZE) {
        const sidx = (sy * DET_SIZE + sx) * 3;
        r = srcBuf[sidx]; g = srcBuf[sidx + 1]; bl = srcBuf[sidx + 2];
      }
      const o = (y * FACE_SIZE + x) * 3;
      out[o] = r; out[o + 1] = g; out[o + 2] = bl;
    }
  }
  return out;
}

function buildRecTensor(o, buf) {
  const n = FACE_SIZE * FACE_SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const s = i * 3;
    out[i] = buf[s];          // R (س‌فیس با swapRB → RGB)
    out[n + i] = buf[s + 1];  // G
    out[2 * n + i] = buf[s + 2]; // B
  }
  return new o.Tensor('float32', out, [1, 3, FACE_SIZE, FACE_SIZE]);
}

function buildCardTensor(o, buf) {
  const n = CARD_SIZE * CARD_SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const s = i * 3;
    out[i] = (buf[s] / 255 - CARD_MEAN[0]) / CARD_STD[0];
    out[n + i] = (buf[s + 1] / 255 - CARD_MEAN[1]) / CARD_STD[1];
    out[2 * n + i] = (buf[s + 2] / 255 - CARD_MEAN[2]) / CARD_STD[2];
  }
  return new o.Tensor('float32', out, [1, 3, CARD_SIZE, CARD_SIZE]);
}

/**
 * بردارِ چهره را از یک تصویر می‌سازد.
 * @param {Buffer} imageBuf
 * @returns {Promise<{v:number[], faceCount:number, detScore:number}|null>}
 */
async function embedFace(imageBuf) {
  try {
    const ctx = await getSessions();
    if (!ctx) return null;
    const detBuf = await rawRgb(imageBuf, DET_SIZE, DET_SIZE);
    const out = await ctx.det.run({ [ctx.det.inputNames[0]]: buildDetTensor(ctx.o, detBuf) });
    const faces = detectFaces(out);
    if (!faces.length) return { faceCount: 0, v: null, detScore: 0 };
    const face = faces.reduce((a, b2) => (b2.w * b2.h > a.w * a.h ? b2 : a), faces[0]);
    const src = [];
    for (let i = 0; i < 5; i++) src.push([face.kp[i * 2], face.kp[i * 2 + 1]]);
    const M = similarityTransform(src);
    const aligned = warpFace(detBuf, M);
    const ro = await ctx.rec.run({ [ctx.rec.inputNames[0]]: buildRecTensor(ctx.o, aligned) });
    const vec = Array.from(ro[ctx.rec.outputNames[0]].data).slice(0, FACE_DIM);
    if (vec.length !== FACE_DIM) return { faceCount: faces.length, v: null, detScore: face.score };
    return { v: l2norm(vec), faceCount: faces.length, detScore: face.score };
  } catch {
    return null;
  }
}

/**
 * بردارِ بصریِ کارت (MobileNetV3) از تصویرِ کامل، نرمال L2.
 * @returns {Promise<number[]|null>}
 */
async function embedCard(imageBuf) {
  try {
    const ctx = await getSessions();
    if (!ctx) return null;
    const buf = await rawRgb(imageBuf, CARD_SIZE, CARD_SIZE);
    const ro = await ctx.card.run({ [ctx.card.inputNames[0]]: buildCardTensor(ctx.o, buf) });
    const vec = Array.from(ro[ctx.card.outputNames[0]].data);
    return l2norm(vec);
  } catch {
    return null;
  }
}

module.exports = {
  available,
  embedFace,
  embedCard,
  cosine,
  l2norm,
  FACE_DIM,
};
