/**
 * صفِ هوشِ جدا از حلقهٔ اصلی — همهٔ embedهای سنگین را به worker می‌سپارد
 * اگر worker در دسترس نبود (مثلاً تست یا محیط بدون thread)، به اجرای مستقیم برمی‌گردد
 */
const path = require('path');
let _worker = null;
let _nextId = 1;
const _pending = new Map();

function getWorker() {
  if (_worker) return _worker;
  try {
    const { Worker } = require('worker_threads');
    _worker = new Worker(path.join(__dirname, '../workers/visionWorker.js'));
    _worker.on('message', (msg) => {
      const cb = _pending.get(msg.id);
      if (cb) {
        _pending.delete(msg.id);
        if (msg.error) cb.reject(new Error(msg.error));
        else cb.resolve(msg.result);
      }
    });
    _worker.on('error', (e) => {
      console.error('[visionQueue] worker error:', e.message);
      for (const [, cb] of _pending) cb.reject(e);
      _pending.clear();
    });
  } catch (e) {
    console.warn('[visionQueue] worker_threads در دسترس نیست، اجرای مستقیم:', e.message);
    // fallback: بدون worker
    _worker = null;
  }
  return _worker;
}

function workerEmbed(task, buffer) {
  const w = getWorker();
  if (!w) {
    // fallback مستقیم
    const v = require('./serverVision');
    if (task === 'embedCard') return v.embedCard(buffer);
    if (task === 'embedFace') return v.embedFace(buffer);
    if (task === 'cropVariants') return v.cropVariants(buffer);
    throw new Error('unknown task');
  }
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    // برای جلوگیری از انتقال کپی بزرگ، Buffer را مستقیم می‌فرستیم
    w.postMessage({ id, task, buffer });
    // تایم‌اوت 30 ثانیه برای هر تسک
    setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        reject(new Error('vision task timeout'));
      }
    }, 30000);
  });
}

module.exports = { workerEmbed };
