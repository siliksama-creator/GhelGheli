/**
 * Worker برای کارهای سنگین هوش (onnx + sharp) — جدا از event loop اصلی
 * پیام: { id, task: 'embedCard'|'embedFace'|'cropVariants', buffer: <Buffer> }
 * پاسخ: { id, result, error }
 */
// این رشته، کارمندِ اجرایی است نه دروازه‌بان: هر پیامی که می‌رسد، والدِ خودش
// از قبل یک «جا» برایش گرفته است (lib/heavy.js). اگر اینجا هم بشماریم، سقفِ
// همزمانی دو برابر می‌شود و محافظت روی سرورِ ۲ هسته‌ای بی‌اثر می‌شود.
// env در worker_threads کپیِ والد است، پس این تغییر به حلقهٔ اصلی سرایت نمی‌کند.
process.env.HEAVY_OFF = '1';


const { parentPort } = require('worker_threads');

let vision = null;
async function getVision() {
  if (!vision) vision = require('../services/serverVision');
  return vision;
}

parentPort.on('message', async (msg) => {
  const { id, task, buffer } = msg;
  try {
    const v = await getVision();
    let result = null;
    if (task === 'embedCard') {
      result = await v.embedCard(buffer);
    } else if (task === 'embedFace') {
      result = await v.embedFace(buffer);
    } else if (task === 'cropVariants') {
      result = await v.cropVariants(buffer);
      // cropVariants returns buffers — serialize as base64 for transfer
      result = result.map(r => ({ label: r.label, buf: r.buf.toString('base64') }));
    } else {
      throw new Error('unknown task ' + task);
    }
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message });
  }
});
