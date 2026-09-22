# اعلانِ وب (Web Push) — راهنمای سریع

**خواست:** مالک ۲۰۲۶-۰۹-۲۲ — «از کاربران وب هم هنگامِ اولین ورود اجازهٔ
نوتیفیکیشن بگیر و بعد نوتیفیکیشن‌های مخصوص مثلِ موبایل برایشان برود.»

## اجزا
| لایه | فایل | نقش |
|---|---|---|
| جدول | `backend/migrations/095_web_push_subscriptions.sql` | اشتراکِ مرورگرها (user_id + endpoint یگانه + کلیدها) |
| سرویس | `backend/src/services/notificationService.js` | `subscribeWebPush/unsubscribeWebPush/sendWebPushToUser/All/Segment` — موازیِ FCM در `createNotification` و `sendSegmented` |
| مسیرها | `backend/src/routes/notifications.js` | `POST /api/notifications/web-push/subscribe|unsubscribe` پشتِ `auth` |
| کانفیگ | `backend/src/routes/clientConfig.js` | `GET /api/config` → `webPush.vapidPublicKey` (null = غیرفعال) |
| پرسش | `userweb/src/components/WebPushPrompt.jsx` | کارتِ فارسی پسِ اولین ورود؛ «بعداً» = ۷ روز سکوت؛ mount در `main.jsx` فقط با توکن |
| SW | `userweb/public/image-cache-sw.js` | هندلرهای `push` و `notificationclick` (همان SW موجود — اسکوپ یکی است) |
| گارد | `userweb/tool/webpush-check.mjs` | تستِ استاتیکِ پیوستگیِ زنجیره |

## کلیدهای VAPID
در `backend/.env` (و `.env.staging`) — **در ریپو نیستند**:
```
VAPID_SUBJECT=mailto:admin@ghelghelishop.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```
ساختِ کلیدِ تازه (مثلاً هنگامِ نشتی): 
`node -e "const k=require('webpush').generateVAPIDKeys();console.log(k.publicKey,k.privateKey)"`
بعد restart گره‌ها. کلیدِ عمومی به‌صورتِ خودکار از `/api/config` به مرورگر
می‌رسد؛ کلیدِ قدیمیِ کش‌شده در `liveConfig` با هر بارگیریِ صفحه تازه می‌شود.

## رفتارِ مهم
- نبودِ کلیدها = لایهٔ وب بی‌صدا غیرفعال؛ موبایل دست‌نخورده کار می‌کند.
- اشتراکِ مرده (۴۰۴/۴۱۰ از سرویسِ پوش) خودکار پاک می‌شود (مثلِ FCM).
- سقفِ ۱۲ اشتراکِ فعال per کاربر (قدیمی‌ترین‌ها حذف).
- اعلان‌های هم‌نوع با `tag` جای هم می‌گیرند (صف نمی‌شوند).
