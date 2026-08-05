// Thin fetch-based API client shared by every admin page.
// Behavior is unchanged from the legacy implementation: same base URL
// resolution, same auth header injection, same error shape.
// Falls back to the production API instead of http://localhost:4000: a
// production build made without VITE_API_BASE used to silently ship a
// localhost URL, so the deployed panel called the *visitor's own* machine
// and every request failed with a connection error. Override with
// VITE_API_BASE=http://localhost:4000 for local development.
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.ghelghelishop.ir';

// The admin JWT expires after 12h server-side, but the panel previously had
// no way to notice — every request after expiry just failed silently with a
// generic "خطای ارتباط با سرور" toast on whatever page happened to be open,
// leaving the admin stuck without knowing why. onUnauthorized (wired up in
// main.jsx) lets us drop back to the login screen automatically on any 401.
export function createApi(token, onUnauthorized) {
  const request = async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
    if (res.status === 401 && token) onUnauthorized?.();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'خطای ارتباط با سرور');
    return data;
  };
  request.uploadImage = async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`${API_BASE}/api/admin/uploads/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (res.status === 401 && token) onUnauthorized?.();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'خطای آپلود عکس');
    return data.url;
  };

  // ── ارسال چندبخشی به یک مسیر دلخواه ──
  //
  // `uploadImage` بالا عمداً دست‌نخورده ماند چون چند صفحه از آن استفاده
  // می‌کنند و فقط URL برمی‌گرداند. «ثبت کارت با عکس» به چیز دیگری نیاز
  // دارد: فایل **به‌همراه فیلدهای متنی** به یک مسیر مشخص، و پاسخ کامل
  // (نه فقط url) — چون سرور شناسهٔ طرح و پیام برمی‌گرداند.
  //
  // نکتهٔ ظریف: Content-Type عمداً ست نمی‌شود. مرورگر باید خودش
  // `boundary` را تولید و اضافه کند؛ اگر دستی بنویسیم boundary ندارد و
  // multer در سرور بدنه را خالی می‌بیند.
  request.postForm = async (path, { file, fileField = 'image', fields = {} } = {}) => {
    const fd = new FormData();
    if (file) fd.append(fileField, file);
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    }
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (res.status === 401 && token) onUnauthorized?.();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'خطای ارتباط با سرور');
    return data;
  };

  // دانلود فایل (CSV کدها). fetch لازم است تا هدر Authorization برود؛
  // یک <a download> ساده توکن را نمی‌فرستد و ۴۰۱ می‌گیرد.
  request.download = async (path, filename) => {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401 && token) onUnauthorized?.();
    if (!res.ok) throw new Error('خطا در دریافت فایل');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // بدون revoke، بلاب تا بسته شدن تب در حافظه می‌ماند.
    URL.revokeObjectURL(url);
  };

  return request;
}


export function fmtNumber(n) {
  return new Intl.NumberFormat('fa-IR').format(Number(n || 0));
}

export function assetUrl(value) {
  if (!value) return '';
  return String(value).startsWith('http') ? value : API_BASE + value;
}

export function fmtDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fa-IR');
  } catch {
    return '-';
  }
}
