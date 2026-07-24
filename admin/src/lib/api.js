// Thin fetch-based API client shared by every admin page.
// Behavior is unchanged from the legacy implementation: same base URL
// resolution, same auth header injection, same error shape.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

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
