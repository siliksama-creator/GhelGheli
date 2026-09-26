#!/usr/bin/env node
/**
 * انتشارِ یک APKِ ازپیش‌ساخته، بدونِ به‌روزرسانیِ اجباری.
 *
 * همان قراردادِ پنلِ «انتشار اپ»: فایل در APK_DIR، هاردلینکِ latest،
 * رکوردِ apk_release، و لینکِ به‌روزرسانی. minVersion و forceUpdate
 * دست نمی‌خورند — دستورِ مالک: انتشار به‌خودی‌خود اجباری نیست.
 *
 *   node scripts/publishApkFromFile.js /path/app-release.apk 1.1.34 2036
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const BACKEND = path.resolve(__dirname, '..');
const srcArg = path.resolve(process.argv[2] || '');
process.chdir(BACKEND);
require('dotenv').config({ path: path.join(BACKEND, '.env') });

const opsConfig = require('../src/services/opsConfig');

const APK_DIR = String(process.env.APK_DIR || '/var/www/ghelgheli-apk');
const LATEST_NAME = 'ghelgheli-latest.apk';
const KEEP = Number(process.env.APK_KEEP_VERSIONS || 4);
const API_BASE = String(process.env.PUBLIC_API_URL || 'https://api.ghelghelishop.com').replace(/\/$/, '');
const WEB_BASE = String(process.env.PUBLIC_WEB_URL || 'https://user.ghelghelishop.com').replace(/\/$/, '');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sanitizeVersion(v) {
  const s = String(v || '').trim().slice(0, 40);
  if (!s || !/^[0-9A-Za-z._+-]+$/.test(s)) return '';
  return s.replace(/\.\./g, '.');
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('end', resolve).on('error', reject);
  });
  return hash.digest('hex');
}

async function inspectApk(filePath) {
  const fd = await fsp.open(filePath, 'r');
  try {
    const { size } = await fd.stat();
    const head = Buffer.alloc(4);
    await fd.read(head, 0, 4, 0);
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    const tailLen = Math.min(size, 512 * 1024);
    const tail = Buffer.alloc(tailLen);
    await fd.read(tail, 0, tailLen, Math.max(0, size - tailLen));
    const text = tail.toString('latin1');
    const hasV1 = /META-INF\/[^/]*\.(RSA|DSA|EC)/i.test(text) || /META-INF\/[^/]*\.SF/i.test(text);
    let hasV2 = false;
    const eocdLen = Math.min(size, 65557);
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
    return { size, isZip, hasManifest: text.includes('AndroidManifest.xml'), signed: hasV1 || hasV2 };
  } finally {
    await fd.close();
  }
}

async function prune(keepName) {
  const names = (await fsp.readdir(APK_DIR)).filter((n) => n.endsWith('.apk') && n !== LATEST_NAME && n !== keepName);
  const stats = [];
  for (const name of names) {
    const st = await fsp.stat(path.join(APK_DIR, name));
    stats.push({ name, mtime: st.mtimeMs });
  }
  stats.sort((a, b) => b.mtime - a.mtime);
  for (const extra of stats.slice(KEEP)) {
    await fsp.unlink(path.join(APK_DIR, extra.name)).catch(() => {});
    await fsp.unlink(path.join(APK_DIR, `${extra.name}.sha256`)).catch(() => {});
  }
}

async function main() {
  const src = srcArg;
  const version = sanitizeVersion(process.argv[3]);
  const versionCode = Number(String(process.argv[4] || '').replace(/[^0-9]/g, '')) || null;
  const notes = String(process.argv[5] || 'رفع ذخیرهٔ کلکسیونی، کلاس جعبه، افکت کارت، و آهنگ جایزه').slice(0, 500);
  if (!src || !fs.existsSync(src)) fail(`مسیرِ APK معتبر نیست: ${src || '(خالی)'}`);
  if (!version || !versionCode) fail('نسخه و کدِ نسخه لازم است');

  const info = await inspectApk(src);
  if (!info.isZip || !info.hasManifest || !info.signed) {
    fail(`APK پذیرفته نشد (zip=${info.isZip} manifest=${info.hasManifest} signed=${info.signed})`);
  }
  await fsp.mkdir(APK_DIR, { recursive: true });
  try { await fsp.access(APK_DIR, fs.constants.W_OK); } catch { fail(`پوشهٔ انتشار قابل نوشتن نیست: ${APK_DIR}`); }

  const filename = `ghelgheli-${version}.apk`;
  const finalPath = path.join(APK_DIR, filename);
  const latestPath = path.join(APK_DIR, LATEST_NAME);
  const tmp = `${finalPath}.publishing`;
  await fsp.copyFile(src, tmp);
  await fsp.rm(finalPath, { force: true });
  await fsp.rename(tmp, finalPath);
  const sha256 = await sha256File(finalPath);
  const stat = await fsp.stat(finalPath);
  await fsp.rm(latestPath, { force: true });
  try {
    await fsp.link(finalPath, latestPath);
  } catch {
    await fsp.copyFile(finalPath, latestPath);
  }
  await fsp.writeFile(`${latestPath}.sha256`, `${sha256}  ${LATEST_NAME}\n`, 'utf8');
  await fsp.writeFile(`${finalPath}.sha256`, `${sha256}  ${filename}\n`, 'utf8');

  const record = {
    version,
    versionCode,
    filename,
    sizeBytes: stat.size,
    sha256,
    notes,
    signed: true,
    url: `${API_BASE}/app/${LATEST_NAME}`,
    versionedUrl: `${API_BASE}/app/${filename}`,
    webUrl: `${WEB_BASE}/app/${LATEST_NAME}`,
    versionedWebUrl: `${WEB_BASE}/app/${filename}`,
    publishedAt: new Date().toISOString(),
    publishedBy: 'publish-script',
    minVersionApplied: null,
    forceUpdateApplied: false,
  };
  await opsConfig.set('apk_release', record, null);

  const current = (await opsConfig.get('client_config')) || {};
  const app = { ...(current.app || {}) };
  app.updateUrl = {
    ...(app.updateUrl || {}),
    android: record.url,
    web: record.webUrl,
  };
  await opsConfig.merge('client_config', { app }, null);
  await prune(filename);
  console.log(JSON.stringify({
    ok: true,
    version,
    versionCode,
    sizeBytes: stat.size,
    sha256,
    url: record.url,
    forceUpdate: false,
  }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
