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
const mobileCachedImg = read('mobile/lib/widgets/cached_card_image.dart');
const sw = read('userweb/public/image-cache-sw.js');
const main = read('userweb/src/main.jsx');
const inventory = read('userweb/src/screens/Inventory.jsx');
const playerCardWeb = read('userweb/src/components/PlayerCard.jsx');
const cardsLib = read('userweb/src/lib/cards.js');
const server = read('backend/src/server.js');
const imageService = read('backend/src/services/imageService.js');
const deploy = read('scripts/deploy.sh');
const mobileDuel = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const mobileShell = read('mobile/lib/screens/user/home_shell.dart');
const webDuel = read('userweb/src/cardDuelGame.jsx');

check(/bool isVersionedImageUrl/.test(disk) && /\/uploads\//.test(disk) && /\/public\//.test(disk),
  'اندروید URL نسخه‌دار را از روی نام فایل تشخیص می‌دهد');
check(/sha1\.convert/.test(disk) && /\.tmp'/.test(disk) && /\.rename\(/.test(disk)
  && /getApplicationSupportDirectory/.test(disk),
  'کلید کش هش URL است، نوشتن اتمی است، و روی دیسک پایدار ذخیره می‌شود');
check(/CachedCardImage/.test(player),
  'کارت کلکسیونی از کش دیسک می‌خواند');
check(/isVersionedImageUrl\(resolved\)/.test(safe) && /CachedCardImage\(/.test(safe),
  'SafeImage برای آپلود نسخه‌دار به دیسک می‌رود نه Image.network');
check(/CachedCardImage\(/.test(avatar),
  'عکس پروفایل ریموت بعد از بار اول از دیسک خوانده می‌شود');
// ⚠️ نسخهٔ کش عمداً سفت‌وسخت چک **نمی‌شود**.
//
// نسخهٔ قبلیِ همین سطر `ghelgheli-img-v2` را دقیق می‌خواست. وقتی کشِ
// مسمومِ کاربران (index.html به‌جای تصویر) مجبورمان کرد نسخه را به v3
// ببریم، این تست قرمز شد — در حالی که محصول **درست‌تر** شده بود.
//
// تستی که به‌جای رفتار، یک مقدارِ ثابت را قفل کند، جلوی رفعِ باگ را
// می‌گیرد. حالا فقط الگو سنجیده می‌شود، نه شماره.
check(/CACHE_NAME = 'ghelgheli-img-v\d+'/.test(webCache) && /caches\.open/.test(webCache),
  'وب از Cache Storage با کلید URL استفاده می‌کند');
// نسخهٔ کشِ اپ و سرویس‌ورکر باید یکی بماند وگرنه دو کشِ جدا ساخته
// می‌شود: دو برابر فضا و رفتارِ ناسازگار بین بار اول و بارهای بعد.
check((webCache.match(/ghelgheli-img-v(\d+)/) || [])[1]
  === (sw.match(/ghelgheli-img-v(\d+)/) || [])[1],
  'نسخهٔ کشِ وب و سرویس‌ورکر یکی است');
check(/isVersionedImage/.test(webCache) && /\/uploads\//.test(webCache),
  'وب فقط تصویر نسخه‌دار را ماندگار می‌کند');
check(/lookupCachedImage/.test(cachedImg) && /asset\(src\)/.test(cachedImg),
  'تگ CachedImg URL را resolve و از کش می‌خواند');
check(/cache\.match\(url\)/.test(sw) && /cache\.put\(url/.test(sw),
  'سرویس‌ورکر /uploads و /public را بدون درخواست تکراری برمی‌گرداند');
check(/registerImageCacheWorker/.test(main),
  'وب سرویس‌ورکر کش تصویر را ثبت می‌کند');
check(/<PlayerCard/.test(inventory) && /<CachedImg/.test(playerCardWeb) && /cardArtOf/.test(playerCardWeb)
  && /imageUrl/.test(cardsLib) && /image_url/.test(cardsLib),
  'کلکسیون وب از کامپوننت مشترک کارت با CachedImg و URL واقعی کارت استفاده می‌کند');
check(/max-age=31536000, immutable/.test(server),
  'سرور هنوز هدر immutable روی آپلودها می‌فرستد');
check(/memoryHit\(String rawUrl\)/.test(disk)
  && /_rememberMemory\(url, target\)/.test(disk)
  && /_cardPrewarmPx = 420/.test(disk),
  'prewarm اندروید به مسیر همگام UI وصل است و همان variant ۴۸۰ را می‌گیرد');
check(/downloadWidth: 420/.test(player)
  && /widget\.downloadWidth \?\? widget\.cacheWidth/.test(mobileCachedImg),
  'کارت فشرده و بزرگ یک فایل شبکهٔ مشترک دارند ولی جداگانه decode می‌شوند');
check(/cacheVariantUrl/.test(webCache) && /\?w=\$\{width\}/.test(webCache)
  && /const width = AVATAR_IMAGE_KEYS\.has\(key\) \? 240 : 480/.test(webCache),
  'prewarm وب دقیقاً URL نسخهٔ مورد استفادهٔ img را کش می‌کند');
check(/setHref\(''\)/.test(cachedImg) && !/setHref\(resolved\)/.test(cachedImg),
  'CachedImg پیش از cache lookup درخواست مستقیم و تکراری نمی‌فرستد');
check(/prewarmThumbnailVariants/.test(imageService)
  && /CARD_THUMB_WIDTHS = \[320, 480\]/.test(imageService)
  && /npm run thumbs:prewarm/.test(deploy),
  'thumbnailهای کارت هنگام upload و deploy پیش‌ساخته می‌شوند');
check(/thumbnailJobs = new Map/.test(server) && /ensureThumbnail/.test(server),
  'درخواست‌های هم‌زمان thumbnail یک job مشترک دارند');
check(/_buildPersistentPages/.test(mobileShell)
  && /Offstage\(/.test(mobileShell) && /TickerMode\(/.test(mobileShell)
  && !/child: AnimatedSwitcher\(/.test(mobileShell),
  'تب‌های اندروید State زنده را نگه می‌دارند و دوباره init/load نمی‌شوند');
check(/role:\s*'تو',[\s\S]{0,120}score:\s*myScore/.test(mobileDuel)
  && /role:\s*opponentRole,[\s\S]{0,120}score:\s*theirScore/.test(mobileDuel)
  && /textDirection:\s*TextDirection\.rtl/.test(mobileDuel),
'اسکوربورد اندروید عدد را کنار صاحب درست نمایش می‌دهد');
check(/امتیاز تو/.test(webDuel) && /امتیاز \{opponentRole\}/.test(webDuel)
  && /roundForViewer/.test(webDuel)
  && /primeImageCache\(session\.g\.state\)/.test(webDuel),
  'وب برچسب امتیاز و prewarm راند را هم‌زمان با اندروید دارد');

console.log(`\n✅ ${passed} تست کش تصویر موفق بود\n`);
