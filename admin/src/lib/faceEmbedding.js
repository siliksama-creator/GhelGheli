/**
 * استخراجِ بردارِ **چهرهٔ بازیکن** در مرورگر (فاز ۳ — حالت سایه).
 *
 * خط لوله (همان دمو/پیاده‌سازیِ OpenCV که روی دادهٔ واقعی اعتبارسنجی شده):
 *   1) عکس به ۶۴۰×۶۴۰ → مدل YuNet (ONNX) → ۱۲ تنسور خروجی.
 *   2) پس‌پردازشِ YuNet (anchor/score/NMS) که در `yunetFace.js` تست‌شده است.
 *   3) بزرگ‌ترین چهره + ۵ نقطهٔ کلیدی → ماتریس شباهت (ArcFace) → وارپ ۱۱۲×۱۱۲
 *      (در `faceAlign.js`، در برابر مرجع عددی اعتبارسنجی شده).
 *   4) مدل SFace (ONNX) روی ۱۱۲×۱۱۲ RGB → بردار ۱۲۸تایی → نرمال L2.
 *
 * شکستِ بی‌صدا: اگر چهره‌ای پیدا نشد/مدل لود نشد، `null` برمی‌گردد تا جریانِ
 * ثبت کارت هیچ‌وقت به‌خاطر این لایهٔ افزوده نشکند.
 */
import { detectFacesFromOutputs } from './yunetFace';
import { similarityTransform } from './faceAlign';

const DET_URL = '/ml/yunet.onnx';
const REC_URL = '/ml/sface.onnx';
const DET_SIZE = 640;
const FACE_SIZE = 112;
const FACE_DIM = 128;

let _sessions = null;   // Promise<{ort,det,rec}>|null
let _disabled = false;
let _ortPromise = null;

function loadOrt() {
  if (typeof window !== 'undefined' && window.ort && window.ort.InferenceSession) {
    return Promise.resolve(window.ort);
  }
  if (_ortPromise) return _ortPromise;
  _ortPromise = new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const s = document.createElement('script');
    s.src = '/ml/ort.min.js';
    s.async = true;
    s.onload = () => resolve(window.ort || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _ortPromise;
}

async function getSessions() {
  if (_disabled) return null;
  if (_sessions) return _sessions;
  _sessions = (async () => {
    const ort = await loadOrt();
    if (!ort || !ort.InferenceSession) { _disabled = true; return null; }
    try { ort.env.wasm.wasmPaths = '/ml/'; } catch { /* بی‌خیال */ }
    const [det, rec] = await Promise.all([
      ort.InferenceSession.create(DET_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }).catch(() => null),
      ort.InferenceSession.create(REC_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }).catch(() => null),
    ]);
    if (!det || !rec) { _disabled = true; return null; }
    return { ort, det, rec };
  })();
  const r = await _sessions;
  if (!r) _sessions = null;
  return r;
}

// ImageData → بافرِ NCHW برای YuNet: پیکسل 0..255، BGR (مدل با کانال BGR).
function buildDetInput(ort, data) {
  const n = DET_SIZE * DET_SIZE;
  const buf = new Float32Array(3 * n);
  for (let y = 0; y < DET_SIZE; y++) {
    for (let x = 0; x < DET_SIZE; x++) {
      const s = (y * DET_SIZE + x) * 4;
      const d = y * DET_SIZE + x;
      buf[0 * n + d] = data[s + 2]; // B
      buf[1 * n + d] = data[s + 1]; // G
      buf[2 * n + d] = data[s + 0]; // R
    }
  }
  return new ort.Tensor('float32', buf, [1, 3, DET_SIZE, DET_SIZE]);
}

// وارپِ آفاین با canvas: ماتریس 2x3 نگاشتِ فضای منبع (۶۴۰) به ۱۱۲.
function warpFace(srcData, M) {
  const out = document.createElement('canvas');
  out.width = FACE_SIZE; out.height = FACE_SIZE;
  const octx = out.getContext('2d');
  // منبع را روی یک canvas می‌گذاریم.
  const src = document.createElement('canvas');
  src.width = DET_SIZE; src.height = DET_SIZE;
  const sctx = src.getContext('2d');
  const img = sctx.createImageData(DET_SIZE, DET_SIZE);
  img.data.set(srcData);
  sctx.putImageData(img, 0, 0);
  // setTransform(m11,m12,m21,m22,dx,dy): x'=m11 x+m21 y+dx, y'=m12 x+m22 y+dy
  // M = [a,b,tx; d,e,ty]
  octx.setTransform(M[0], M[3], M[1], M[4], M[2], M[5]);
  octx.drawImage(src, 0, 0);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  return octx.getImageData(0, 0, FACE_SIZE, FACE_SIZE).data;
}

// ۱۱۲×۱۱۲ RGB 0..255 → Tensor SFace (NCHW).
function buildRecInput(ort, data) {
  const n = FACE_SIZE * FACE_SIZE;
  const buf = new Float32Array(3 * n);
  for (let y = 0; y < FACE_SIZE; y++) {
    for (let x = 0; x < FACE_SIZE; x++) {
      const s = (y * FACE_SIZE + x) * 4;
      const d = y * FACE_SIZE + x;
      buf[0 * n + d] = data[s + 0]; // R (SFace با swapRB از BGR یعنی RGB)
      buf[1 * n + d] = data[s + 1]; // G
      buf[2 * n + d] = data[s + 2]; // B
    }
  }
  return new ort.Tensor('float32', buf, [1, 3, FACE_SIZE, FACE_SIZE]);
}

/**
 * بردارِ L2-نرمالِ چهره را از یک Blob تصویر می‌سازد، یا null (چهره نبود/خطا).
 * @returns {Promise<number[]|null>}
 */
export async function embedFaceImage(blob) {
  try {
    const ctx = await getSessions();
    if (!ctx) return null;
    const { ort, det, rec } = ctx;
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (!bmp) return null;

    // رِندر به ۶۴۰×۶۴۰ (همان فضایی که دیکودر تست شده).
    const c = document.createElement('canvas');
    c.width = DET_SIZE; c.height = DET_SIZE;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, DET_SIZE, DET_SIZE);
    const detData = g.getImageData(0, 0, DET_SIZE, DET_SIZE).data;

    const detInputName = det.inputNames[0];
    const out = await det.run({ [detInputName]: buildDetInput(ort, detData) });
    const faces = detectFacesFromOutputs(out, DET_SIZE, 0.6, 0.3);
    if (!faces.length) return null;

    // بزرگ‌ترین چهره (هدشات بازیکن).
    const face = faces.reduce((a, b2) => (b2.w * b2.h > a.w * a.h ? b2 : a), faces[0]);
    const srcPts = [];
    for (let i = 0; i < 5; i++) srcPts.push([face.kp[i * 2], face.kp[i * 2 + 1]]);
    const M = similarityTransform(srcPts);

    const aligned = warpFace(detData, M);
    const recInputName = rec.inputNames[0];
    const ro = await rec.run({ [recInputName]: buildRecInput(ort, aligned) });
    const vec = Array.from(ro[rec.outputNames[0]].data).slice(0, FACE_DIM);
    if (vec.length !== FACE_DIM) return null;
    let nrm = 0;
    for (const v of vec) nrm += v * v;
    nrm = Math.sqrt(nrm) || 1;
    return vec.map(v => v / nrm);
  } catch {
    return null;
  }
}

export const FACE_EMBED_DIM = FACE_DIM;
