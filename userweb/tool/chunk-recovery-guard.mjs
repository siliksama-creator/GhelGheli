/* قفلِ بازیابیِ چانکِ گم‌شده در وب و پنل.
 *
 * پیامِ واقعیِ کروم «Failed to fetch dynamically imported module» است و
 * «Chunk» یا «Loading» داخلش نیست. نسخهٔ قبلیِ پنل فقط همان دو کلمه را
 * می‌دید، پس «تلاش دوباره» رفرش نمی‌کرد و خطا می‌ماند.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isChunkLoadError } from '../src/lib/chunkRecovery.js';

const root = path.resolve(import.meta.dirname, '../..');
const adminCopy = fs.readFileSync(path.join(root, 'admin/src/lib/chunkRecovery.js'), 'utf8');
const userCopy = fs.readFileSync(path.join(root, 'userweb/src/lib/chunkRecovery.js'), 'utf8');
if (adminCopy !== userCopy) {
  console.error('admin و userweb نسخهٔ chunkRecovery یکی نیستند');
  process.exit(1);
}

const mustMatch = [
  'Failed to fetch dynamically imported module: https://admin.ghelghelishop.com/assets/photo-cards-B61otYbN.js',
  'Loading chunk 12 failed.',
  'Loading CSS chunk 4 failed.',
  'Importing a module script failed.',
  'error loading dynamically imported module',
];
for (const sample of mustMatch) {
  if (!isChunkLoadError(new Error(sample))) {
    console.error('تشخیص داده نشد:', sample);
    process.exit(1);
  }
}
if (isChunkLoadError(new Error('password wrong'))) {
  console.error('خطای معمولی نباید بازیابیِ چانک شود');
  process.exit(1);
}

for (const file of ['admin/src/main.jsx', 'userweb/src/main.jsx']) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  for (const needle of ['installChunkRecovery', 'recoverFromChunkError', 'loadLazy', 'isChunkLoadError']) {
    if (!src.includes(needle)) {
      console.error(`${file} ${needle} ندارد`);
      process.exit(1);
    }
  }
  if (src.includes("includes('Chunk')") || src.includes('includes("Chunk")')) {
    console.error(`${file} هنوز فقط کلمهٔ Chunk را می‌بیند`);
    process.exit(1);
  }
}

for (const file of [
  'admin/public/chunk-recovery-sw.js',
  'userweb/public/image-cache-sw.js',
]) {
  const sw = fs.readFileSync(path.join(root, file), 'utf8');
  if (!sw.includes('gg-chunk-v1') || !sw.includes("cache: 'reload'")) {
    console.error(`${file} دورزدنِ ۴۰۴ِ کش‌شده را ندارد`);
    process.exit(1);
  }
}

console.log('chunk recovery guard ok');
