import React, { useEffect, useState } from 'react';
import { asset } from '../lib/api.js';
import { lookupCachedImage } from '../lib/imageCache.js';

export default function CachedImg({ src, ...rest }) {
  const resolved = !src ? '' : String(src).startsWith('http') ? String(src) : asset(src);
  // شروع با رشتهٔ خالی: اگر از همان فریم اول resolved را روی <img> بگذاریم
  // تگ img خودش یک درخواست مستقیم می‌فرستد و بعد lookupCachedImage هم یکی
  // دیگر. وقتی کشِ پایدار داریم، تصویر باید اول cache.match را امتحان کند.
  const [href, setHref] = useState('');

  useEffect(() => {
    let alive = true;
    let blobUrl = '';
    setHref(resolved);
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
