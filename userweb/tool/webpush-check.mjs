#!/usr/bin/env node
//
// گاردِ پیوستگیِ «اعلانِ وب» — زنجیرهٔ SW → پرسشِ اجازه → مسیرِ ذخیره →
// سرویسِ ارسال → کانفیگِ عمومی → مهاجرتِ جدول باید وصل بماند. هر حلقه
// گم شود این تست قرمز می‌شود (الگو: همانadmin-monitoring — بدونِ سرور،
// فقط خواندنِ سورس؛ کامنت‌ها strip می‌شوند تا توضیحات خودِ تست را سبز
// نکنند).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}
const read = (p) => strip(fs.readFileSync(path.join(root, p), 'utf8'));

// ۱) سرویس‌ورکر: push + نمایش + کلیک
const sw = read('userweb/public/image-cache-sw.js');
assert.ok(sw.includes("addEventListener('push'"), 'SW باید هندلرِ push داشته باشد');
assert.ok(sw.includes('showNotification'), 'SW باید اعلان نمایش دهد');
assert.ok(sw.includes("addEventListener('notificationclick'"), 'SW باید هندلرِ کلیک داشته باشد');

// ۲) پرسشِ اجازه + نصب در پوسته
const prompt = read('userweb/src/components/WebPushPrompt.jsx');
assert.ok(prompt.includes('Notification.requestPermission'), 'باید از کاربر اجازه خواسته شود');
assert.ok(prompt.includes('pushManager.subscribe'), 'باید اشتراکِ push ساخته شود');
assert.ok(prompt.includes('userVisibleOnly: true'), 'userVisibleOnly الزامی است');
assert.ok(prompt.includes('/api/notifications/web-push/subscribe'), 'اشتراک باید روی سرور ذخیره شود');
assert.ok(prompt.includes("permission !== 'default'"), 'فقط وضعیتِ پرسیده‌نشده باید سوال شود');
const main = read('userweb/src/main.jsx');
assert.ok(main.includes('WebPushPrompt'), 'پرسش باید در پوستهٔ لاگین‌شده نصب شود');

// ۳) بک‌اند: مسیرها پشتِ auth
const notifRoutes = read('backend/src/routes/notifications.js');
const subIdx = notifRoutes.indexOf("'/notifications/web-push/subscribe'");
assert.ok(subIdx > 0, 'مسیرِ subscribe باید وجود داشته باشد');
assert.ok(notifRoutes.slice(subIdx, subIdx + 120).includes('auth'), 'subscribe باید پشتِ auth باشد');
assert.ok(notifRoutes.includes("'/notifications/web-push/unsubscribe'"), 'مسیرِ unsubscribe باید وجود داشته باشد');

// ۴) سرویس: ارسالِ وب موازیِ FCM
const svc = read('backend/src/services/notificationService.js');
assert.ok(svc.includes('sendWebPushToUser'), 'تابعِ ارسالِ وب باید وجود داشته باشد');
assert.ok(svc.includes('subscribeWebPush'), 'تابعِ اشتراک باید وجود داشته باشد');
assert.ok(svc.includes('sendWebPushSegment'), 'لایهٔ وبِ سگمنتِ ادمین باید وجود داشته باشد');
const cn = svc.indexOf('async function createNotification');
assert.ok(cn > 0, 'createNotification پیدا نشد');
assert.ok(svc.slice(cn, cn + 1600).includes('sendWebPushToUser'), 'createNotification باید لایهٔ وب را صدا بزند');
assert.ok(svc.includes('VAPID_PUBLIC_KEY'), 'کلیدهای VAPID باید از محیط بیایند');
assert.ok(svc.includes('410'), 'اشتراکِ مرده (404/410) باید پاک شود');

// ۵) کانفیگِ عمومی: کلید باید به مرورگر برسد
const cc = read('backend/src/routes/clientConfig.js');
assert.ok(cc.includes('vapidPublicKey'), '/api/config باید کلیدِ عمومی را بفرستد');

// ۶) مهاجرت + مانیفست
const mig = fs.readFileSync(
  path.join(root, 'backend/migrations/095_web_push_subscriptions.sql'), 'utf8');
assert.ok(mig.includes('web_push_subscriptions'), 'مهاجرت باید جدولِ اشتراک‌ها را بسازد');
const manifest = fs.readFileSync(path.join(root, 'backend/docs/api-manifest.json'), 'utf8');
assert.ok(manifest.includes('/api/notifications/web-push/subscribe'), 'مانیفست: subscribe');
assert.ok(manifest.includes('/api/notifications/web-push/unsubscribe'), 'مانیفست: unsubscribe');

console.log('✅ webpush-check: زنجیرهٔ اعلانِ وب وصل است (SW → پرسش → مسیر → سرویس → کانفیگ → مهاجرت)');
