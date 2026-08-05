/**
 * ثبت کارت با عکس — بخش کاربر.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا کنارِ «ثبت کد کارت» و نه به‌جای آن
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ صریح مالک: بخش قبلی دست‌نخورده بماند. کاربری که کارت قدیمی
 * دارد باید بتواند مثل همیشه فقط کد را وارد کند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا کد هم لازم است، وقتی عکس داریم
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * عکس ثابت می‌کند کارت فیزیکی در دست کاربر است. کد ثابت می‌کند این
 * **نسخهٔ** خاص هنوز خرج نشده. بدون عکس، هر کس کد را بداند امتیاز
 * می‌گیرد؛ بدون کد، یک کارت بی‌نهایت بار ثبت می‌شود.
 *
 * OCR عمداً اجباری نیست: روی عکس واقعی گوشی اندازه‌گیری شد و قابل اتکا
 * نبود. تحمیلش یعنی رد کردن کاربران درستکار.
 */
import { useEffect, useRef, useState } from 'react';

import { API } from '../lib/api.js';

/** حداکثر حجم قبل از فشرده‌سازی سمت کلاینت. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * عکس را قبل از ارسال کوچک می‌کند.
 *
 * چرا سمت کلاینت: عکس گوشی مدرن ۴ تا ۸ مگابایت است. روی اینترنت موبایل
 * ایران این یعنی ۳۰ ثانیه انتظار و گاهی قطع شدن آپلود. سرور هرحال تصویر
 * را به ۱۶۰۰ پیکسل کوچک می‌کند، پس فرستادن نسخهٔ بزرگ‌تر هیچ سودی ندارد.
 *
 * ۱۴۰۰ پیکسل عمداً از سقف سرور بزرگ‌تر نیست ولی برای اثر انگشت بیش از
 * کافی است — موتور تطبیق تصویر را به ۳۲×۳۲ و ۱۲۸×۱۲۸ کاهش می‌دهد.
 *
 * اگر هر مرحله شکست بخورد، فایل اصلی فرستاده می‌شود: آپلودِ کند بهتر از
 * آپلودِ ناموفق است.
 */
async function shrink(file) {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bmp = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size < 1.5 * 1024 * 1024) {
      bmp.close?.();
      return file;
    }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(
      res => canvas.toBlob(res, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'card.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function PhotoCardBox({ token, onDone, setMsg }) {
  const [available, setAvailable] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const previewRef = useRef('');

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/photo-cards/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (alive) setAvailable(!!d.available); })
      // خطا یعنی «نشان نده». این بخش اختیاری است و نباید صفحهٔ اصلی را
      // با پیام خطا شلوغ کند.
      .catch(() => { if (alive) setAvailable(false); });
    return () => { alive = false; };
  }, [token]);

  // آزادسازی بلاب هنگام خروج، وگرنه با هر انتخاب یک شیء در حافظه می‌ماند.
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function pick(f) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setMsg?.('حجم عکس خیلی زیاد است');
      return;
    }
    setFile(f);
    setResult(null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(f);
    setPreview(previewRef.current);
  }

  function reset() {
    setFile(null);
    setCode('');
    setResult(null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = '';
    setPreview('');
  }

  async function submit() {
    if (busy || !file || !code.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const small = await shrink(file);
      const fd = new FormData();
      fd.append('image', small);
      fd.append('code', code.trim());
      // Content-Type دستی ست نمی‌شود: مرورگر باید boundary را خودش
      // اضافه کند، وگرنه سرور بدنه را خالی می‌بیند.
      const r = await fetch(`${API}/api/photo-cards/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setResult({ kind: 'error', message: d.message || 'ثبت نشد' });
        return;
      }
      if (d.status === 'pending') {
        setResult({ kind: 'pending', message: d.message });
        reset();
        return;
      }
      setResult({
        kind: 'ok',
        message: d.message,
        cardType: d.cardType,
        points: d.addedPoints,
        cash: d.addedCash,
        imageUrl: d.imageUrl,
      });
      setFile(null);
      setCode('');
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = '';
      setPreview('');
      onDone?.();
    } catch {
      setResult({ kind: 'error', message: 'اتصال اینترنت برقرار نیست' });
    } finally {
      setBusy(false);
    }
  }

  // تا وقتی مدیر طرحی آپلود نکرده، این بخش اصلاً نشان داده نمی‌شود —
  // بهتر از نشان دادن چیزی که همیشه شکست می‌خورد.
  if (!available) return null;

  return (
    <div className="photoCardBox">
      <h2>📸 ثبت کارت با عکس</h2>
      <p className="hint">
        از کارت عکس بگیر و کدش را وارد کن. عکس ثابت می‌کند کارت را داری،
        پس کسی نمی‌تواند فقط با دانستن کد امتیاز بگیرد.
      </p>

      {result?.kind === 'ok' && (
        <div className="pcResult ok">
          {result.imageUrl && (
            <img src={result.imageUrl.startsWith('http')
              ? result.imageUrl : API + result.imageUrl} alt={result.cardType} />
          )}
          <div>
            <b>{result.cardType}</b>
            <span>+{result.points} امتیاز
              {result.cash > 0 && ` · ${result.cash.toLocaleString('fa-IR')} تومان`}
            </span>
          </div>
        </div>
      )}
      {result?.kind === 'pending' && (
        <div className="pcResult pending">⏳ {result.message}</div>
      )}
      {result?.kind === 'error' && (
        <div className="pcResult err">{result.message}</div>
      )}

      <div className="pcPickRow">
        {/*
          دو دکمهٔ جدا برای دوربین و گالری.
          `capture="environment"` به گوشی می‌گوید مستقیم دوربینِ پشت را
          باز کند. روی دسکتاپ نادیده گرفته می‌شود و مثل انتخاب فایل عمل
          می‌کند، پس نیازی به تشخیص دستگاه نیست.
        */}
        <label className="pcPick">
          <span className="pcPickIcon">📷</span>
          دوربین
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={e => pick(e.target.files?.[0])} />
        </label>
        <label className="pcPick">
          <span className="pcPickIcon">🖼️</span>
          گالری
          <input type="file" accept="image/*" hidden
            onChange={e => pick(e.target.files?.[0])} />
        </label>
      </div>

      {preview && (
        <div className="pcPreview">
          <img src={preview} alt="عکس انتخاب‌شده" />
          <button className="pcClear" onClick={reset} aria-label="حذف عکس">×</button>
        </div>
      )}

      <input
        className="pcCode"
        value={code}
        placeholder="کد روی کارت"
        inputMode="text"
        autoCapitalize="characters"
        onChange={e => setCode(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      />

      <button className="main" onClick={submit} disabled={busy || !file || !code.trim()}>
        {busy ? 'در حال بررسی عکس…' : 'ثبت کارت'}
      </button>

      {!file && (
        <small className="pcTip">
          راهنما: کل کارت داخل کادر باشد و نور کافی باشد. عکس تار هم
          معمولاً شناسایی می‌شود.
        </small>
      )}
    </div>
  );
}
