/**
 * استخراجِ بردارِ عصبیِ کارت در **مرورگر** (فاز ۲ — حالت سایه).
 *
 * مدلِ MobileNetV3 (همان وزن‌های بک‌اند/گوشی) در وب با onnxruntime-web اجرا
 * می‌شود؛ فقط بردارِ ۱۲۸۰تایی به سرور می‌رود و سرور هیچ مدل سنگینی اجرا نمی‌کند.
 *
 * ── شکستِ بی‌صدا ──
 * هر خطایی (مرورگر قدیمی، بارگذاری‌نشدنِ WASM/مدل، بافتِ بزرگ) به `null`
 * تبدیل می‌شود تا جریانِ ثبت کارت هرگز به‌خاطر این قابلیتِ افزوده نشکند.
 */

const MODEL_URL = '/ml/card_embed_mobilenetv3.onnx';
const DIM = 1280;
const SIZE = 224;
const CROP = 0.875;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let _session = null;   // Promise<{ort,session}>|null
let _disabled = false;
let _ortPromise = null;

// بارگذاریِ تنبلِ onnxruntime-web به‌صورت اسکریپتِ گلوبال از پوشهٔ عمومی
// (نه از CDN، تا در شرایط تحریم/آفلاین هم کار کند و باندل سنگین نشود).
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

async function getSession() {
  if (_disabled) return null;
  if (_session) return _session;
  _session = (async () => {
    const ort = await loadOrt();
    if (!ort || !ort.InferenceSession) { _disabled = true; return null; }
    // فایلِ wasm کنار کتابخانه در /ml.
    try { ort.env.wasm.wasmPaths = '/ml/'; } catch { /* بی‌خیال */ }
    const session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).catch(() => null);
    if (!session) { _disabled = true; return null; }
    return { ort, session };
  })();
  const r = await _session;
  if (!r) _session = null;
  return r;
}

function buildInput(bitmap) {
  const w = bitmap.width || bitmap.videoWidth;
  const h = bitmap.height || bitmap.videoHeight;
  const sc = Math.min(w, h);
  const tw = Math.round(sc * CROP);
  const th = Math.round(sc * CROP);
  const cx = (w - tw) / 2;
  const cy = (h - th) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, cx, cy, tw, th, 0, 0, SIZE, SIZE);
  const img = ctx.getImageData(0, 0, SIZE, SIZE).data;

  const data = new Float32Array(3 * SIZE * SIZE);
  const stride = SIZE * SIZE;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = (y * SIZE + x) * 4;
      const d = y * SIZE + x;
      // RGB، نرمال‌سازی استاندارد ImageNet
      data[0 * stride + d] = (img[s] / 255 - MEAN[0]) / STD[0];
      data[1 * stride + d] = (img[s + 1] / 255 - MEAN[1]) / STD[1];
      data[2 * stride + d] = (img[s + 2] / 255 - MEAN[2]) / STD[2];
    }
  }
  return data;
}

/**
 * بردارِ L2-نرمال‌شدهٔ کارت را از یک File/Blob تصویر می‌سازد، یا null.
 * @param {Blob|File} blob
 * @returns {Promise<number[]|null>}
 */
export async function embedCardImage(blob) {
  try {
    const ctx = await getSession();
    if (!ctx) return null;
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (!bmp) return null;
    const input = buildInput(bmp);
    const tensor = new ctx.ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
    const out = await ctx.session.run({ input: tensor }).catch(() => null);
    if (!out) return null;
    const outName = ctx.session.outputNames[0];
    const vec = Array.from(out[outName].data).slice(0, DIM);
    if (vec.length !== DIM) return null;
    let nrm = 0;
    for (const v of vec) nrm += v * v;
    nrm = Math.sqrt(nrm) || 1;
    return vec.map(v => v / nrm);
  } catch {
    return null;
  }
}

export const CARD_EMBED_DIM = DIM;
