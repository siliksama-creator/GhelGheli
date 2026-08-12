#!/usr/bin/env node
// نگهبان کش تصویر نسخه‌دار: بار اول شبکه، بار بعد دیسک/مرورگر.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function check(value, message) {
  assert.ok(value, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

console.log('\n== کش تصویر نسخه‌دار ==');
const disk = read('mobile/lib/services/image_disk_cache.dart');
const safe = read('mobile/lib/widgets/safe_image.dart');
const avatar = read('mobile/lib/widgets/avatar_image.dart');
const player = read('mobile/lib/widgets/player_card.dart');
const webCache = read('userweb/src/lib/imageCache.js');
const cachedImg = read('userweb/src/components/CachedImg.jsx');
const sw = read('userweb/public/image-cache-sw.js');
const main = read('userweb/src/main.jsx');
const inventory = read('userweb/src/screens/Inventory.jsx');
const server = read('backend/src/server.js');

check(/bool isVersionedImageUrl/.test(disk) && /\/uploads\//.test(disk) && /\/public\//.test(disk),
  'اندروید URL نسخه‌دار را از روی نام فایل تشخیص می‌دهد');
check(/sha1\.convert/.test(disk) && /\.tmp'/.test(disk) && /\.rename\(/.test(disk),
  'کلید کش هش URL است و نوشتن اتمی است');
check(/CachedCardImage/.test(player),
  'کارت کلکسیونی از کش دیسک می‌خواند');
check(/isVersionedImageUrl\(resolved\)/.test(safe) && /CachedCardImage\(/.test(safe),
  'SafeImage برای آپلود نسخه‌دار به دیسک می‌رود نه Image.network');
check(/CachedCardImage\(/.test(avatar),
  'عکس پروفایل ریموت بعد از بار اول از دیسک خوانده می‌شود');
check(/CACHE_NAME = 'ghelgheli-img-v1'/.test(webCache) && /caches\.open/.test(webCache),
  'وب از Cache Storage با کلید URL استفاده می‌کند');
check(/isVersionedImage/.test(webCache) && /\/uploads\//.test(webCache),
  'وب فقط تصویر نسخه‌دار را ماندگار می‌کند');
check(/lookupCachedImage/.test(cachedImg) && /asset\(src\)/.test(cachedImg),
  'تگ CachedImg URL را resolve و از کش می‌خواند');
check(/cache\.match\(url\)/.test(sw) && /cache\.put\(url/.test(sw),
  'سرویس‌ورکر /uploads و /public را بدون درخواست تکراری برمی‌گرداند');
check(/registerImageCacheWorker/.test(main),
  'وب سرویس‌ورکر کش تصویر را ثبت می‌کند');
check(/<CachedImg/.test(inventory) && /item\.image_url \|\| item\.imageUrl/.test(inventory),
  'کلکسیون وب از CachedImg و URL واقعی کارت استفاده می‌کند');
check(/max-age=31536000, immutable/.test(server),
  'سرور هنوز هدر immutable روی آپلودها می‌فرستد');

console.log(`\n✅ ${passed} تست کش تصویر موفق بود\n`);
