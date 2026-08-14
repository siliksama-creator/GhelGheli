import React, { useEffect, useState } from 'react';
import { asset } from '../lib/api.js';
import { lookupCachedImage } from '../lib/imageCache.js';

/**
 * @param {number} [w] عرضِ بندانگشتیِ درخواستی (۱۶۰/۲۴۰/۳۲۰/۴۸۰/۶۴۰)
 *
 * ── چرا ──
 * سرور تصویرِ کارت را در ۹۹۶×۱۵۷۸ و ~۱۳۷KB نگه می‌دارد، ولی قفسهٔ
 * انتخاب آن را با عرضِ ۱۳۰px نشان می‌دهد. بدونِ `w`، کاربر ~۹۰٪
 * بایت‌ها را بی‌جهت دانلود می‌کند.
 */
export default function CachedImg({ src, w, ...rest }) {
  const base = !src ? '' : String(src).startsWith('http') ? String(src) : asset(src);
  const resolved = base && w && !base.includes('?')
    ? `${base}?w=${w}` : base;
  // شروع با رشتهٔ خالی: اگر از همان فریم اول resolved را روی <img> بگذاریم
  // تگ img خودش یک درخواست مستقیم می‌فرستد و بعد lookupCachedImage هم یکی
  // دیگر. وقتی کشِ پایدار داریم، تصویر باید اول cache.match را امتحان کند.
  const [href, setHref] = useState('');

  useEffect(() => {
    let alive = true;
    let blobUrl = '';
    // نسخهٔ قبلی همین‌جا resolved را روی <img> می‌گذاشت و هم‌زمان
    // lookupCachedImage هم fetch می‌کرد: دو درخواست برای یک کارت. تا جواب
    // Cache Storage معلوم نشده، img اصلاً src نمی‌گیرد.
    setHref('');
    if (!resolved) return undefined;
    lookupCachedImage(resolved).then((next) => {
      if (!alive) {
        if (String(next).startsWith('blob:')) URL.revokeObjectURL(next);
        return;
      }
      if (String(next).startsWith('blob:')) blobUrl = next;
      setHref(next);
    });
    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [resolved]);

  if (!href) return null;
  return <img src={href} {...rest} />;
}
