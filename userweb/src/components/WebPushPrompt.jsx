// 🔔 پرسشِ اعلان‌های وب — خواستهٔ مالک (۲۰۲۶-۰۹-۲۲): «وقتی برای بار اول
// لوگین می‌کنند اجازهٔ نوتیفیکیشن بگیر و بعد نوتیفیکیشن‌های مخصوص مثل
// موبایل برایشان برود.»
//
// قواعد:
//   • فقط وقتی نشان داده می‌شود که: کاربر لاگین باشد، مرورگر Push داشته
//     باشد، وضعیتِ اجازه هنوز «پرسیده‌نشده» (default) باشد، سرور کلیدِ
//     VAPID را در /api/config داده باشد و کاربر قبلاً جواب نداده باشد.
//   • «بعداً» = هفت روز سوال نشود، بعد دوباره یک بار بپرس. «فعال کن» یا
//     ردِ سطحِ مرورگر (denied) = دیگر هیچ‌وقت نشان نده.
//   • اشتراک به /api/notifications/web-push/subscribe می‌رود و در جدولِ
//     web_push_subscriptions می‌نشیند؛ از آن پس هر اعلانی که به گوشی
//     می‌رود (یادآورِ چرخش، نتیجهٔ کارت، پیام‌های ادمین…) به این
//     مرورگر هم می‌رسد — همان مسیرِ notificationService.
import React, { useEffect, useRef, useState } from 'react';
import { req } from '../lib/api.js';
import { liveConfig, loadLiveConfig } from '../lib/liveConfig.js';
import { SvgIcon } from './IconAsset.jsx';

const ASK_KEY = 'gg-webpush-ask';
const LATER_MS = 7 * 24 * 60 * 60 * 1000;

// تبدیلِ استانداردِ کلیدِ VAPID: base64url → Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function WebPushPrompt({ token }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const keyRef = useRef('');
  const askedRef = useRef(false);

  useEffect(() => {
    if (!token || askedRef.current || ok) return undefined;
    if (typeof window === 'undefined' || !('Notification' in window)
      || !('serviceWorker' in navigator) || !('PushManager' in window)) return undefined;
    if (Notification.permission !== 'default') {
      // قبلاً اجازه داده/رد کرده — سوالِ دوباره بی‌ادبی است.
      try { localStorage.setItem(ASK_KEY, 'done'); } catch { /* حالتِ خصوصی */ }
      return undefined;
    }
    let asked = '';
    try { asked = localStorage.getItem(ASK_KEY) || ''; } catch { return undefined; }
    if (asked === 'done') return undefined;
    if (asked.startsWith('later:')) {
      const t = Number(asked.slice(6));
      if (Number.isFinite(t) && Date.now() - t < LATER_MS) return undefined;
    }
    let cancelled = false;
    loadLiveConfig().then(() => {
      const key = liveConfig()?.webPush?.vapidPublicKey;
      if (cancelled || !key || typeof key !== 'string' || key.length < 20) return;
      keyRef.current = key;
      askedRef.current = true;
      setVisible(true);
    }).catch(() => { /* بدونِ کانفیگ، بی‌صدا رد شو */ });
    return () => { cancelled = true; };
  }, [token, ok]);

  function remember(value) {
    try { localStorage.setItem(ASK_KEY, value); } catch { /* مشکلی نیست */ }
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { remember('done'); setVisible(false); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyRef.current),
        });
      }
      const json = sub.toJSON();
      await req('/api/notifications/web-push/subscribe', 'POST', {
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }, token);
      remember('done');
      setOk(true);
      setTimeout(() => setVisible(false), 2600);
    } catch {
      // اشتراک یا ذخیره ناموفق — «done» نمی‌نویسیم تا دفعهٔ بعد دوباره
      // شانسِ فعال‌سازی داشته باشد (بدونِ آزار: فقط هنگامِ ورود).
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  function later() { remember(`later:${Date.now()}`); setVisible(false); }

  if (!visible) return null;
  return (
    <div role="dialog" aria-label="فعال‌سازی اعلان‌ها" style={{
      position: 'fixed', insetInline: 0, bottom: 16, zIndex: 4000,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto', direction: 'rtl', maxWidth: 380, width: 'calc(100% - 24px)',
        background: 'rgba(20,22,34,0.97)', color: '#fff', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.14)', padding: '12px 14px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.35)', fontSize: 13, lineHeight: 1.7,
      }}>
        {ok ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SvgIcon name="check" size={18} /><span>اعلان‌ها فعال شد — از این به بعد مثل اپ موبایل خبرت می‌کنیم.</span></div>
        ) : (
          <>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><SvgIcon name="bell" size={18} /><span>اعلان‌های قلقلی روی مرورگر</span></div>
            <div style={{ opacity: 0.85, marginBottom: 10 }}>
              از چرخش رایگان، ماموریت‌ها و خبرهای مهم جا نمانی — مثل اپ موبایل،
              روی همین مرورگر هم اعلان می‌گیری. هر وقت بخواهی از تنظیماتِ
              مرورگر خاموشش می‌کنی.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={enable} disabled={busy} style={{
                flex: 1, border: 0, borderRadius: 10, padding: '8px 10px',
                background: 'linear-gradient(135deg,#7c4dff,#448aff)', color: '#fff',
                fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: 13,
              }}>
                {busy ? 'در حال فعال‌سازی…' : 'فعال کردن اعلان‌ها'}
              </button>
              <button type="button" onClick={later} disabled={busy} style={{
                border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10,
                padding: '8px 12px', background: 'transparent', color: '#fff',
                cursor: 'pointer', fontSize: 13,
              }}>
                بعداً
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
