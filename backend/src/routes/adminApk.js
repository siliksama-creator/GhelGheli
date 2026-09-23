/**
 * انتشارِ اپ (APK) از پنل ادمین — «انتشار اپ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این ماژول وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تا ۱ مهر ۱۴۰۵ دکمهٔ «به‌روزرسانی» اپ و وب، کاربر را به صفحهٔ کافه‌بازار
 * می‌فرستاد (`ops_limits.bazaarApiBase` + `app.bazaarPackage`). مالک انتشار
 * در بازار را کنار گذاشت، پس آن لینک به یک بستهٔ **ناموجود** اشاره می‌کرد:
 * کاربر روی «دانلود» می‌زد و به جایی می‌رفت که اپِ ما آن‌جا نبود.
 *
 * راه‌حل: خودِ سرور فایل را سرو می‌کند و ادمین از پنل آپلودش می‌کند. سه چیز
 * با هم عوض می‌شوند و همه در یک درخواست:
 *
 *   ۱. فایل در `/var/www/ghelgheli-apk` می‌نشیند و nginx سروش می‌کند
 *      (`deploy/ghelgheli-apk.conf` → `https://.../app/ghelgheli-latest.apk`).
 *   ۲. تنظیمِ `apk_release` نسخه/هش/حجم/تاریخ را نگه می‌دارد (ممیزی‌شدنی و
 *      از همین‌جا در صفحهٔ پنل دیده می‌شود).
 *   ۳. اگر ادمین بخواهد، `client_config` هم زنده به‌روز می‌شود: لینکِ
 *      به‌روزرسانی + حداقلِ نسخه + پرچمِ «اجباری» — **بدونِ دیپلوی** و برای
 *      هر دو کلاینت (وب و اندروید) هم‌زمان.
 *
 * ── چرا هشِ SHA-256 ─────────────────────────────────────────────────────
 *
 * کاربری که APK را از پیام تلگرام یا سایتِ واسطه می‌گیرد باید بتواند بفهمد
 * فایل دست‌کاری نشده. هش هم در پاسخِ API می‌آید، هم در فهرستِ فایل‌های پنل، و
 * هم کنارِ خودِ فایل به‌صورت `<name>.apk.sha256` سرو می‌شود.
 *
 * ── چرا اعتبارسنجیِ محتوا و نه فقط پسوندِ فایل ───────────────────────────
 *
 * یک فایلِ ناقص یا خراب که منتشر شود، برای **همهٔ** کاربران اپ را می‌شکند و
 * تا رسیدنِ نسخهٔ بعدی جبران‌شدنی نیست (کاربر اپِ خراب را حذف می‌کند و دیگر
 * برنمی‌گردد). پس پیش از پذیرش: امضای ZIP، وجودِ `AndroidManifest.xml` و
 * وجودِ امضای دیجیتال در `META-INF` بررسی می‌شوند.
 *
 * ── دسترسی ──────────────────────────────────────────────────────────────
 *
 * خواندنِ وضعیت: هر ادمینِ فعال (`support` به بالا).
 * آپلود/حذف: فقط `super_admin` (`requireRole()` بدونِ آرگومان) — همچون بقیهٔ
 * کارهای برگشت‌ناپذیرِ پنل؛ انتشارِ یک باینریِ خراب، بدترین نوعِ آن است.
 */
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const opsConfig = require('../services/opsConfig');

// پوشهٔ نگه‌داری — بیرونِ APP_DIR تا `git clean` دیپلوی پاکش نکند.
const APK_DIR = String(process.env.APK_DIR || '/var/www/ghelgheli-apk');
// سقفِ ۲۵۰ مگابایت: APKِ فعلی ~۶۰ مگابایت است؛ حاشیه برای بیلدهای سنگین‌تر
// (مدل‌های ONNX داخلِ اپ) و بدونِ بازکردنِ راهِ آپلودِ بی‌پایان.
const MAX_APK_BYTES = Number(process.env.APK_MAX_BYTES || 250 * 1024 * 1024);
const LATEST_NAME = 'ghelgheli-latest.apk';
// چند نسخه نگه داشته شود؟ پنل فقط «آخرین» را تبلیغ می‌کند؛ بقیه برای
// بازگشتِ سریع به نسخهٔ قبل‌اند (اگر نسخهٔ تازه مشکلی داشت، ادمین لینک را
// به فایلِ قبلی برگرداند بی‌آنکه چیزی آپلود کند).
const KEEP_VERSIONS = Number(process.env.APK_KEEP_VERSIONS || 4);

const API_BASE = String(process.env.PUBLIC_API_URL || 'https://api.ghelghelishop.com').replace(/\/$/, '');
const WEB_BASE = String(process.env.PUBLIC_WEB_URL || 'https://user.ghelghelishop.com').replace(/\/$/, '');

/** مسیرِ عمومیِ فایل روی دامنهٔ API (اپ) و دامنهٔ وب (هم‌مبدأ برای مرورگر). */
const urlFor = (name) => `${API_BASE}/app/${name}`;
const webUrlFor = (name) => `${WEB_BASE}/app/${name}`;

function sanitizeVersion(v) {
  // «1.1.19» یا «1.1.19+21» یا «1.1.19-beta.1». هر چه غیرِ این باشد دور
  // ریخته می‌شود چون همین رشته در نامِ فایل می‌نشیند (path traversal و
  // نامِ عجیب روی دیسک).
  const s = String(v || '').trim().slice(0, 40);
  if (!s) return '';
  return /^[0-9A-Za-z._+-]+$/.test(s) ? s.replace(/\.\./g, '.') : '';
}

/** هشِ SHA-256 با استریم — فایلِ ۶۰ مگابایتی هرگز کامل در حافظه نمی‌آید. */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

/**
 * چند سنجهٔ ارزان اما تعیین‌کننده روی فایلِ آپلودشده:
 *   • امضای ZIP («PK») — APK یک zip است.
 *   • وجودِ `AndroidManifest.xml` در فهرستِ مرکزی (نام‌ها بدونِ فشرده‌سازی
 *     ذخیره می‌شوند، پس در چند صد کیلوبایتِ آخرِ فایل دیده می‌شوند).
 *   • امضای دیجیتال — APKِ بدونِ امضا روی گوشیِ کاربر نصب نمی‌شود
 *     (اندروید نصبش را رد می‌کند). دو طرحِ رایج:
 *       – v1 (JAR): فایل‌های `META-INF/*.RSA|.DSA|.EC` + `.SF`
 *       – v2/v3: بلوکی بین داده‌ها و فهرستِ مرکزیِ ZIP که با رشتهٔ جادوییِ
 *         `APK Sig Block 42` تمام می‌شود
 *     ⚠️ بیلدهای امروزی (minSdk 24) فقط v2/v3 دارند و **هیچ** فایلِ امضایی
 *     در `META-INF` نمی‌گذارند. نسخهٔ اولِ همین تابع فقط v1 را می‌شناخت و
 *     در اولین انتشارِ واقعی، APKِ سالمِ خودمان را «بی‌امضا» خواند.
 */
async function inspectApk(filePath) {
  const fd = await fsp.open(filePath, 'r');
  try {
    const { size } = await fd.stat();
    const head = Buffer.alloc(4);
    await fd.read(head, 0, 4, 0);
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    const tailLen = Math.min(size, 512 * 1024);
    const tail = Buffer.alloc(tailLen);
    await fd.read(tail, 0, tailLen, size - tailLen);
    const text = tail.toString('latin1');
    const hasV1 = /META-INF\/[^/]*\.(RSA|DSA|EC)/i.test(text)
      || /META-INF\/[^/]*\.SF/i.test(text);

    // ── امضای v2/v3 ──────────────────────────────────────────────────────
    // بلاکِ امضا دقیقاً پیش از فهرستِ مرکزی می‌نشیند: [داده‌ها][بلاکِ
    // امضا][فهرستِ مرکزی][EOCD]. پس آفستِ فهرستِ مرکزی را از EOCD
    // می‌خوانیم و ۱۶ بایتِ پیش از آن باید رشتهٔ جادویی باشد. این روش به
    // حجمِ فهرستِ مرکزی وابسته نیست (برخلافِ «دنبالِ رشته بگرد» در انتهای
    // فایل که برای APKهای بزرگ ممکن است رشته را نبیند).
    let hasV2 = false;
    try {
      const eocdLen = Math.min(size, 65557); // بیشینهٔ EOCD + کامنت
      const eocd = Buffer.alloc(eocdLen);
      await fd.read(eocd, 0, eocdLen, size - eocdLen);
      const eocdPos = eocd.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      if (eocdPos >= 0) {
        const cdOffset = eocd.readUInt32LE(eocdPos + 16);
        if (cdOffset >= 16 && cdOffset <= size) {
          const magic = Buffer.alloc(16);
          await fd.read(magic, 0, 16, cdOffset - 16);
          hasV2 = magic.toString('latin1') === 'APK Sig Block 42';
        }
      }
    } catch { /* اگر ساختار عجیب بود، به v1 تکیه می‌کنیم */ }

    return {
      size,
      isZip,
      hasManifest: text.includes('AndroidManifest.xml'),
      signed: hasV1 || hasV2,
      scheme: hasV1 && hasV2 ? 'v1+v2/v3' : (hasV2 ? 'v2/v3' : (hasV1 ? 'v1' : 'none')),
    };
  } finally {
    await fd.close();
  }
}

/** فهرستِ فایل‌های APK روی دیسک (تازه‌ترین اول) + حجمِ مصرفی. */
async function listFiles() {
  let names = [];
  try {
    names = (await fsp.readdir(APK_DIR)).filter((n) => n.toLowerCase().endsWith('.apk'));
  } catch {
    return { files: [], totalBytes: 0 };
  }
  const files = [];
  let totalBytes = 0;
  for (const name of names) {
    try {
      const st = await fsp.stat(path.join(APK_DIR, name));
      totalBytes += st.size;
      files.push({
        name,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
        url: urlFor(name),
        webUrl: webUrlFor(name),
        // فایلِ نسخه‌دار + نسخهٔ جاری؛ هر دو از یک inode نیستند لزوماً
        // (hardlink معمولاً، ولی اگر کسی دستی عوض کند باز هم درست نشان
        // بدهیم) پس با نام تشخیص می‌دهیم.
        isLatest: name === LATEST_NAME,
        isVersioned: name !== LATEST_NAME && name.endsWith('.apk') && name.startsWith('ghelgheli-'),
      });
    } catch { /* فایل بین readdir و stat رفته — بی‌خیال */ }
  }
  files.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  return { files, totalBytes };
}

async function readRelease() {
  const rec = await opsConfig.get('apk_release');
  return rec && typeof rec === 'object' && !Array.isArray(rec) ? rec : null;
}

/** نگه‌داشتنِ فقط KEEP_VERSIONS نسخهٔ نسخه‌دار + نسخهٔ latest. */
async function pruneOldVersions() {
  const { files } = await listFiles();
  const versioned = files.filter((f) => f.isVersioned);
  const extra = versioned.slice(KEEP_VERSIONS);
  const removed = [];
  for (const f of extra) {
    try {
      await fsp.unlink(path.join(APK_DIR, f.name));
      await fsp.unlink(path.join(APK_DIR, `${f.name}.sha256`)).catch(() => {});
      removed.push(f.name);
    } catch { /* بی‌صدا: نگه‌داشتنِ نسخهٔ اضافه، خطای بحرانی نیست */ }
  }
  return removed;
}

// پوشه را در بارگذاریِ ماژول می‌سازیم، ولی **شکستِ آن هرگز نباید کلِ API را
// بخواباند**. درسِ گرانِ ۲ مهر ۱۴۰۵: نسخهٔ اول همین‌جا `mkdirSync` لخت داشت؛
// روی سرورِ واقعی، دیپلوی پوشه را با مالکیتِ کاربرِ سرویس نساخته بود، mkdir
// اجازه نگرفت، ماژول در بوتِ سرور استثنا داد و **کلِ سایت** (نه فقط انتشارِ
// اپ) در حلقهٔ کرش افتاد و health-check دیپلوی را رد کرد. حالا نبودِ پوشه
// فقط یعنی «انتشار اپ کار نمی‌کند» — بقیهٔ API سالم می‌ماند.
function ensureApkDir() {
  try {
    fs.mkdirSync(APK_DIR, { recursive: true });
    return true;
  } catch (e) {
    console.error(`[apk] پوشهٔ انتشار در دسترس نیست (${APK_DIR}): ${e.code || e.message}`);
    return false;
  }
}
ensureApkDir();

module.exports = ({ pool, adminAuth, requireRole, asyncHandler, audit }) => {
  const router = express.Router();

  // محافظِ میانی برای مسیرهایی که واقعاً به دیسک می‌نویسند: اگر پوشه نیست و
  // ساختنی هم نیست، پیامِ فارسیِ روشن بده (۵۰۰)، نه استثنای گنگِ multer.
  const requireApkDir = (req, res, next) => {
    if (fs.existsSync(APK_DIR) || ensureApkDir()) return next();
    return res.status(500).json({
      message: `پوشهٔ انتشار روی سرور در دسترس نیست (${APK_DIR}) — به مدیرِ سرور اطلاع بده`,
    });
  };

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, APK_DIR),
      // نامِ موقت؛ پس از اعتبارسنجی به نامِ نسخه‌دار تغییر می‌کند.
      filename: (req, file, cb) => cb(null, `upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.apk`),
    }),
    limits: { fileSize: MAX_APK_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      const ok = /\.apk$/i.test(file.originalname || '')
        || file.mimetype === 'application/vnd.android.package-archive'
        || file.mimetype === 'application/octet-stream';
      cb(ok ? null : new Error('فقط فایل APK پذیرفته می‌شود'), ok);
    },
  });

  // خطاهای multer (سقفِ حجم، تعدادِ فایل) باید پیامِ فارسی و ۴۰۰ بدهند، نه
  // ۵۰۰ی بی‌توضیح در لاگِ سرور.
  const uploadOne = (req, res, next) => upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `حجم فایل بیش از سقفِ ${Math.round(MAX_APK_BYTES / (1024 * 1024))} مگابایت است`
      : (err.message || 'آپلود ناموفق بود');
    return res.status(400).json({ message });
  });

  // ── خواندنِ وضعیتِ انتشار ──────────────────────────────────────────────
  router.get('/admin/apk', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
    const [release, { files, totalBytes }] = await Promise.all([readRelease(), listFiles()]);
    let freeBytes = null;
    try {
      const st = fs.statfsSync(APK_DIR);
      freeBytes = Number(st.bavail) * Number(st.bsize);
    } catch { /* statfs روی همهٔ فایل‌سیستم‌ها نیست؛ نبودنش مشکلی نیست */ }
    // `writable` را صریح می‌فرستیم: اگر پوشه روی سرور با مالکیتِ اشتباه
    // ساخته شود، پنل باید همین‌جا هشدار بدهد، نه بعد از آپلودِ ۶۰ مگابایتی.
    let writable = false;
    try { fs.accessSync(APK_DIR, fs.constants.W_OK); writable = true; } catch { /* نه */ }
    res.json({
      release,
      files,
      dir: { path: APK_DIR, totalBytes, freeBytes, writable },
      limits: { maxBytes: MAX_APK_BYTES, keepVersions: KEEP_VERSIONS },
      latestUrl: urlFor(LATEST_NAME),
      latestWebUrl: webUrlFor(LATEST_NAME),
    });
  }));

  // ── آپلودِ نسخهٔ تازه ──────────────────────────────────────────────────
  router.post('/admin/apk/upload', adminAuth, requireRole(), requireApkDir, uploadOne, asyncHandler(async (req, res) => {
    const tmpPath = req.file?.path;
    if (!tmpPath) return res.status(400).json({ message: 'فایلی ارسال نشد' });

    // از این نقطه به بعد، در هر شکستی فایلِ موقت پاک می‌شود تا پوشهٔ انتشار
    // پرِ فایل‌های نیمه‌کاره نشود.
    const cleanupTmp = () => fsp.unlink(tmpPath).catch(() => {});

    try {
      const info = await inspectApk(tmpPath);
      if (!info.isZip) { await cleanupTmp(); return res.status(400).json({ message: 'فایل یک APK معتبر نیست (ساختار ZIP ندارد)' }); }
      if (!info.hasManifest) { await cleanupTmp(); return res.status(400).json({ message: 'فایل APK ناقص است (AndroidManifest.xml ندارد)' }); }
      if (!info.signed) {
        await cleanupTmp();
        return res.status(400).json({ message: 'این APK امضای دیجیتال ندارد (نه v1 نه v2/v3)؛ اندروید نصبش را رد می‌کند. از خروجیِ «Build APK» استفاده کن.' });
      }

      const version = sanitizeVersion(req.body?.version) || `build-${new Date().toISOString().slice(0, 10)}`;
      const versionCode = Number(String(req.body?.versionCode || '').replace(/[^0-9]/g, '')) || null;
      const notes = String(req.body?.notes || '').trim().slice(0, 500);
      const setUpdateUrl = String(req.body?.setUpdateUrl ?? 'true') !== 'false';
      const promoteMin = String(req.body?.promoteMinVersion ?? 'true') !== 'false';
      const forceUpdate = String(req.body?.forceUpdate ?? 'false') === 'true';
      const minVersion = sanitizeVersion(req.body?.minVersion) || version;

      // ── «آرشیو» یعنی آرشیو، نه انتشار ────────────────────────────────────
      // ⚠️ یافتهٔ آزمونِ زندهٔ ۲ مهر: با `setUpdateUrl=false` هم فایل به
      // نامِ `ghelgheli-latest.apk` هاردلینک می‌شد و رکوردِ نسخهٔ زنده
      // نوشته می‌شد — پس «فقط آرشیو» عملاً اپِ همهٔ کاربران را عوض می‌کرد.
      // حالا: فایل می‌ماند، نسخهٔ زنده دست‌نخورده.
      const prevRelease = await readRelease().catch(() => null);
      const archiveOnly = !setUpdateUrl && !!prevRelease && prevRelease.filename !== filename;

      const filename = `ghelgheli-${version}.apk`;
      const finalPath = path.join(APK_DIR, filename);
      const latestPath = path.join(APK_DIR, LATEST_NAME);

      // اگر همین نسخه از قبل هست، جایگزین می‌شود (آپلودِ دوبارهٔ همان نسخه
      // نباید فایلِ دوم بسازد و پنل را شلوغ کند).
      await fsp.rm(finalPath, { force: true });
      await fsp.rename(tmpPath, finalPath);
      const sha256 = await sha256File(finalPath);
      const stat = await fsp.stat(finalPath);

      // نسخهٔ جاری = hardlink (فضای اضافه نمی‌گیرد، ولی دو نامِ مستقل دارد).
      // اگر hardlink ممکن نبود (فایل‌سیستمِ متفاوت)، کپی می‌کنیم.
      // در حالتِ آرشیوی، نامِ «latest» دست‌نخورده می‌ماند تا فایلِ منتشرشدهٔ
      // فعلی همان باشد که کاربران می‌گیرند.
      if (!archiveOnly) {
        await fsp.rm(latestPath, { force: true });
        try {
          await fsp.link(finalPath, latestPath);
        } catch {
          await fsp.copyFile(finalPath, latestPath);
        }
      }
      await fsp.writeFile(`${finalPath}.sha256`, `${sha256}  ${filename}\n`, 'utf8');

      if (archiveOnly) {
        await audit(req.admin.id, 'archive_apk', 'app_settings', null, null, {
          version, versionCode, sizeBytes: stat.size, sha256, keptRelease: prevRelease.version,
        }).catch(() => {});
        return res.json({
          ok: true,
          archiveOnly: true,
          file: {
            filename, version, versionCode, sizeBytes: stat.size, sha256, signed: true,
          },
          release: prevRelease,
          applied: null,
          message: `فایلِ ${version} آرشیو شد — نسخهٔ زنده (${prevRelease.version}) عوض نشد`,
        });
      }

      const record = {
        version,
        versionCode,
        filename,
        sizeBytes: stat.size,
        sha256,
        notes,
        signed: true,
        url: urlFor(LATEST_NAME),
        versionedUrl: urlFor(filename),
        webUrl: webUrlFor(LATEST_NAME),
        versionedWebUrl: webUrlFor(filename),
        publishedAt: new Date().toISOString(),
        publishedBy: req.admin?.username || null,
        minVersionApplied: promoteMin ? minVersion : null,
        forceUpdateApplied: promoteMin ? forceUpdate : null,
      };
      await opsConfig.set('apk_release', record, req.admin?.id || null);

      // ── به‌روزرسانیِ زندهٔ client_config ────────────────────────────────
      // همان کلیدی که `/api/config` می‌خواند. از `opsConfig.merge` استفاده
      // می‌شود تا کشِ پرچم‌ها در همهٔ پروسه‌ها بلافاصله تازه شود (نوشتنِ
      // مستقیمِ SQL فقط همین پروسه را باخبر می‌کرد و تا ۵ ثانیه کاربر
      // لینکِ قدیمی می‌دید).
      let applied = null;
      if (setUpdateUrl || promoteMin) {
        const current = (await opsConfig.get('client_config')) || {};
        const app = { ...(current.app || {}) };
        app.updateUrl = {
          ...(app.updateUrl || {}),
          ...(setUpdateUrl ? { android: record.url, web: record.webUrl } : {}),
        };
        if (promoteMin) {
          app.minVersion = { ...(app.minVersion || {}), android: minVersion };
          app.forceUpdate = { ...(app.forceUpdate || {}), android: forceUpdate };
        }
        await opsConfig.merge('client_config', { app }, req.admin?.id || null);
        applied = {
          updateUrl: setUpdateUrl ? { android: record.url, web: record.webUrl } : null,
          minVersion: promoteMin ? minVersion : null,
          forceUpdate: promoteMin ? forceUpdate : null,
        };
      }

      const removed = await pruneOldVersions();

      await audit(req.admin.id, 'publish_apk', 'app_settings', null, null, {
        version, versionCode, sizeBytes: record.sizeBytes, sha256, setUpdateUrl, promoteMin, forceUpdate,
      }).catch(() => {});

      res.json({ ok: true, release: record, applied, pruned: removed, message: `نسخهٔ ${version} منتشر شد` });
    } catch (e) {
      await cleanupTmp();
      throw e;
    }
  }));

  // ── حذفِ یک فایلِ قدیمی ────────────────────────────────────────────────
  router.post('/admin/apk/delete', adminAuth, requireRole(), requireApkDir, asyncHandler(async (req, res) => {
    const name = path.basename(String(req.body?.name || ''));
    if (!/^[0-9A-Za-z._+-]+\.apk$/.test(name)) return res.status(400).json({ message: 'نام فایل معتبر نیست' });
    if (name === LATEST_NAME) {
      return res.status(400).json({ message: 'فایلِ «آخرین نسخه» را نمی‌توان حذف کرد؛ نسخهٔ تازه‌ای منتشر کن یا لینک را عوض کن.' });
    }
    const release = await readRelease();
    if (release?.filename === name) {
      return res.status(400).json({ message: 'این فایل همان نسخهٔ منتشرشدهٔ فعلی است؛ اول نسخهٔ دیگری را منتشر کن.' });
    }
    const target = path.join(APK_DIR, name);
    await fsp.unlink(target).catch(() => {});
    await fsp.unlink(`${target}.sha256`).catch(() => {});
    await audit(req.admin.id, 'delete_apk_file', 'apk_file', null, name, {}).catch(() => {});
    res.json({ ok: true, message: `${name} حذف شد` });
  }));

  // ── عمومی: آخرین نسخه ─────────────────────────────────────────────────
  //
  // برای وب و اپ (و هر کس که می‌خواهد هش را چک کند). هیچ دادهٔ حساسی داخلش
  // نیست: نسخه، حجم، هش و لینک — همان چیزی که در HTML صفحهٔ دانلود هم
  // دیده می‌شود.
  router.get('/app/latest', asyncHandler(async (req, res) => {
    const release = await readRelease();
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    if (!release) {
      return res.json({
        available: false,
        message: 'هنوز نسخه‌ای از اپ منتشر نشده است',
        latestUrl: urlFor(LATEST_NAME),
      });
    }
    let exists = true;
    try { await fsp.access(path.join(APK_DIR, release.filename)); } catch { exists = false; }
    res.json({ available: exists, ...release });
  }));

  return router;
};
