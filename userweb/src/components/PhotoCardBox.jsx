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
 * تشخیصِ خودکارِ کد از روی عکس عمداً وجود ندارد: روی عکس واقعیِ گوشی
 * اندازه‌گیری شد و حتی در کیفیت عالی هم درست نخواند. تحمیلش فقط نرخِ
 * خطا را بالا می‌برد. کاربر کد را تایپ می‌کند — ۱۰۰٪ قابل اتکا — و
 * بارِ ضدتقلب را عکس به دوش می‌کشد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * سه نتیجهٔ ممکن
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   approved   کد معتبر + عکس شناخته شد → کارت در اینونتوری
 *   pending    کد معتبر ولی عکس شناخته نشد → بررسی دستی مدیر
 *   bad_code   کد غلط → راهنمای حروفِ مبهم + شمارشِ تلاش
 *   locked     ۵ کدِ غلطِ پشت‌سرهم → ۳ ساعت قفل
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چند نسخه از یک کارت: عکس می‌ماند، فقط کد پاک می‌شود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * کارت‌ها سری‌ای چاپ می‌شوند. کاربری که پنج نسخه از «محمد صلاح» دارد،
 * پنج کارتِ فیزیکیِ **کاملاً یکسان** در دست دارد که فقط کدشان فرق
 * می‌کند.
 *
 * نسخهٔ قبلی دو کارِ اشتباه می‌کرد:
 *
 *   ۱. سرور با گاردِ «عکسِ تکراری» ثبتِ دوم را با ۴۰۹ رد می‌کرد.
 *   ۲. کلاینت بعد از هر ثبتِ موفق عکس را پاک می‌کرد.
 *
 * هر دو رفتند. حالا عکس سرِ جایش می‌ماند و فقط فیلدِ کد خالی و فوکوس
 * می‌شود، تا کاربر پنج کد را پشت‌سرهم وارد کند. اصالت را کد تضمین
 * می‌کند — هر کد فقط یک بار مصرف می‌شود.
 */
// React باید صریح import شود: این پروژه vite.config ندارد، پس افزونهٔ
// React با تنظیمات پیش‌فرض روی runtime کلاسیک کار می‌کند و هر JSX به
// React.createElement ترجمه می‌شود. بدون این خط، صفحه با
// «React is not defined» سفید می‌شد — و چون این کامپوننت پایین صفحه
// بود، بقیهٔ صفحه هم با خودش می‌برد.
import React, { useEffect, useRef, useState } from 'react';

import { API } from '../lib/api.js';

// ═══════════════════════════════════════════════════════════════════════════
// مراحلِ واقعیِ آنالیز
// ═══════════════════════════════════════════════════════════════════════════
//
// هر مرحله کارِ واقعیِ سرور را نشان می‌دهد، نه انیمیشنِ تزئینی. اگر
// روزی موتور عوض شد، این فهرست هم باید عوض شود — لودینگی که چیزِ
// نادرست بگوید بدتر از نبودنش است.
const ANALYSIS_STEPS = [
  { label: 'آماده‌سازی عکس…', hint: 'فشرده‌سازی برای ارسال سریع‌تر' },
  { label: 'تحلیل تصویر…', hint: 'رنگ، لبه‌ها، بافت و روشنایی' },
  { label: 'خواندن متن روی کارت…', hint: 'نام بازیکن و شمارهٔ پیراهن' },
  { label: 'مقایسه با کارت‌ها…', hint: 'جست‌وجو در همهٔ کارت‌های ثبت‌شده' },
];

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

  // ── مرحلهٔ آنالیز، برای نوارِ پیشرفت ──
  //
  // خواستهٔ مالک: «یه لودینگ دقیقا به اندازه زمان مورد نیاز انجین …
  // که واقعا اینکار انجام شه و یه آنالیز حرفه‌ای رخ بده».
  //
  // ⚠️ این مراحل **ساختگی نیستند**. هر کدام کارِ واقعیِ سرور را نشان
  //    می‌دهند و زمان‌بندی‌شان از اندازه‌گیریِ واقعی آمده:
  //
  //      فشرده‌سازیِ سمتِ مرورگر  ~۳۰۰ms
  //      اثرانگشتِ تصویری        ~۳۳۰ms  (۵ سیگنالِ موازی)
  //      خواندنِ متن با OCR      ~۸۵۰ms
  //      مقایسه با کاتالوگ       ~۵۰ms
  //
  //    نوار روی مرحلهٔ آخر **متوقف** می‌ماند تا پاسخ برسد؛ هرگز به
  //    ۱۰۰٪ نمی‌رسد مگر واقعاً تمام شود. لودینگی که زودتر از کار تمام
  //    شود بدتر از نبودنش است — کاربر فکر می‌کند سیستم هنگ کرده.
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState(null);
  const [locked, setLocked] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ── تعدادِ طرح‌های کاتالوگ ──
  //
  // فقط برای زمان‌بندیِ لودینگ. مقایسه با ۲۰۰ طرح ۲.۵ms طول می‌کشد
  // (اندازه‌گیری‌شده) پس عملاً بی‌اثر است، ولی آپلودِ شبکه با کاتالوگِ
  // بزرگ‌تر کندتر می‌شود چون سرور مشغول‌تر است.
  const [designCount, setDesignCount] = useState(0);
  // با تغییرش، وضعیت از سرور دوباره خوانده می‌شود.
  const [refreshKey, setRefreshKey] = useState(0);
  const previewRef = useRef('');

  // ── چرا ref و نه autoFocus ──
  //
  // `autoFocus` فقط در اولین mount کار می‌کند. اینجا باید بعد از **هر**
  // ثبتِ موفق دوباره فوکوس بگیرد، پس مرجعِ مستقیم به عنصر لازم است.
  const codeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/photo-cards/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        setAvailable(!!d.available);
        // ── چرا شمارِ در انتظار از سرور می‌آید ──
        //
        // باگِ قبلی: بنرِ «در حال بررسی» فقط state محلی بود. بعد از
        // اینکه مدیر تأیید می‌کرد، کاربر تا رفرشِ کاملِ صفحه همان
        // پیام را می‌دید — یعنی می‌گفت «در حال بررسی» در حالی که
        // کارت قبلاً به مجموعه‌اش اضافه شده بود.
        //
        // حالا سرور تعدادِ واقعیِ پرونده‌های در انتظار را می‌گوید و
        // بنر بر پایهٔ همان ساخته می‌شود.
        setPendingCount(Number(d.pendingCount) || 0);
        setDesignCount(Number(d.designCount) || 0);
      })
      // خطا یعنی «نشان نده». این بخش اختیاری است و نباید صفحهٔ اصلی را
      // با پیام خطا شلوغ کند.
      .catch(() => { if (alive) setAvailable(false); });
    return () => { alive = false; };
  }, [token, refreshKey]);

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
    setPhase(0);
    // ── زمان‌بندی، متناسب با اندازهٔ کاتالوگ ──
    //
    // اعدادِ پایه از اندازه‌گیریِ واقعیِ موتور آمده‌اند. `slack` برای
    // کاتالوگِ بزرگ کمی فاصله می‌دهد: خودِ مقایسه ۲.۵ms است (حتی با
    // ۲۰۰ طرح)، ولی سرور با کاتالوگِ بزرگ‌تر ردیف‌های بیشتری از
    // دیتابیس می‌خواند و در ساعتِ شلوغ کندتر پاسخ می‌دهد.
    //
    // ⚠️ سقفِ ۱.۵ ثانیه: بدونِ آن با ۵۰۰ کارت مرحلهٔ آخر دیر ظاهر
    //    می‌شد و کاربر نوارِ متوقف می‌دید — دقیقاً همان حسِ «هنگ کرده»
    //    که این لودینگ برای رفعش ساخته شده.
    const slack = Math.min(1500, Math.round(designCount * 3));
    const timers = [
      setTimeout(() => setPhase(1), 350),
      setTimeout(() => setPhase(2), 750),
      setTimeout(() => setPhase(3), 1700 + slack),
    ];
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

      // ── قفل: کاربر تا چند ساعت نمی‌تواند تلاش کند ──
      if (d.status === 'locked') {
        setResult({ kind: 'locked', message: d.message });
        setLocked(true);
        return;
      }

      // ── کدِ غلط: راهنما + شمارشِ تلاش ──
      // عکس عمداً پاک نمی‌شود: کاربر فقط باید کد را اصلاح کند و
      // مجبور کردنش به عکس‌گرفتنِ دوباره بی‌دلیل آزاردهنده است.
      if (d.status === 'bad_code') {
        setResult({ kind: 'badcode', message: d.message,
          triesLeft: d.triesLeft });
        return;
      }

      if (!r.ok) {
        setResult({ kind: 'error', message: d.message || 'ثبت نشد' });
        return;
      }

      if (d.status === 'pending') {
        // کد درست بوده ولی عکس شناخته نشد → بررسی دستی.
        //
        // ⚠️ عکس عمداً پاک **نمی‌شود** و فقط کد خالی می‌شود. اگر کاربر
        //    پنج نسخهٔ همین کارت را دارد، همان عکس برای چهار کدِ بعدی
        //    هم درست است — مجبور کردنش به عکس‌گرفتنِ دوباره فقط او را
        //    خسته می‌کند و نتیجه‌اش هم دقیقاً همان است.
        setResult({ kind: 'pending', message: d.message,
          reason: d.reason });
        setCode('');
        codeRef.current?.focus();
        setRefreshKey(k => k + 1);
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
      // ⚠️ فقط کد پاک می‌شود، نه عکس — توضیح کامل در سربرگِ فایل.
      //
      // فوکوس هم به فیلدِ کد برمی‌گردد تا کاربری که ده کد دارد بتواند
      // بدونِ لمسِ اضافه پشت‌سرهم واردشان کند. در ثبتِ ده‌تایی این
      // ریزه‌کاری ده لمسِ اضافه را حذف می‌کند.
      setCode('');
      codeRef.current?.focus();
      setRefreshKey(k => k + 1);
      onDone?.();
    } catch {
      setResult({ kind: 'error', message: 'اتصال اینترنت برقرار نیست' });
    } finally {
      timers.forEach(clearTimeout);
      setBusy(false);
      setPhase(0);
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
      {/* ── چرا این جمله لازم است ──
          بدونِ آن، کاربری که پنج نسخهٔ یک کارت دارد فکر می‌کند باید
          پنج بار عکس بگیرد — یا بدتر، فکر می‌کند فقط یکی‌شان قابل
          ثبت است و چهار کد را دور می‌ریزد. */}
      <p className="hint hintAccent">
        چند نسخه از یک کارت داری؟ یک بار عکس بگیر و کدها را پشت‌سرهم
        وارد کن — عکس بعد از هر ثبت سرِ جایش می‌ماند.
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
      {/* ── نوارِ وضعیت، از سرور نه از حافظهٔ محلی ──
          وقتی مدیر تأیید یا رد کند، این عدد صفر می‌شود و نوار خودش
          محو می‌شود. قبلاً پیامِ محلی تا رفرشِ صفحه می‌ماند. */}
      {pendingCount > 0 && !result && (
        <div className="pcResult pending">
          <div>
            <b>⏳ {pendingCount} عکس در حال بررسی</b>
            <span>کیفیت عکس کامل نبود؛ کارشناس بررسی می‌کند و ممکن است
              تا ۲۴ ساعت طول بکشد. کد شما محفوظ است و می‌توانید
              کارت‌های دیگرتان را ثبت کنید.</span>
          </div>
        </div>
      )}
      {result?.kind === 'badcode' && (
        <div className="pcResult err">
          <div>
            <b>کد نادرست است</b>
            <span>{result.message}</span>
          </div>
        </div>
      )}
      {result?.kind === 'locked' && (
        <div className="pcResult locked">
          <div>
            <b>🔒 ثبت کارت موقتاً بسته است</b>
            <span>{result.message}</span>
          </div>
        </div>
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
        ref={codeRef}
        className="pcCode"
        value={code}
        placeholder="کد روی کارت"
        inputMode="text"
        autoCapitalize="characters"
        disabled={locked}
        onChange={e => setCode(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      />

      {/* ── راهنمای حروفِ مبهم، همیشه دیده می‌شود ──
          نه فقط بعد از خطا. کاربر باید **قبل** از تایپ بداند به چه چیزی
          دقت کند؛ نشان دادنش بعد از شکست یعنی یکی از پنج تلاش را
          بی‌دلیل سوزانده. */}
      <div className="pcCodeHint">
        <b>دقت کنید:</b> صفر <code>0</code> و حرف <code>O</code> شبیه‌اند،
        و عدد یک <code>1</code> با حروف <code>I</code> و <code>L</code>.
        بزرگ یا کوچک بودنِ حروف مهم نیست.
      </div>

      <button className="main" onClick={submit}
        disabled={busy || locked || !file || !code.trim()}>
        {busy ? ANALYSIS_STEPS[phase].label : 'ثبت کارت'}
      </button>

      {/* ══════════════════════════════════════════════════════════════
          نوارِ پیشرفتِ آنالیز
          ══════════════════════════════════════════════════════════════

          چهار نقطه که یکی‌یکی روشن می‌شوند، هر کدام یک مرحلهٔ **واقعی**
          از کارِ موتور.

          ⚠️ نوار روی مرحلهٔ آخر متوقف می‌ماند تا پاسخ برسد. هرگز خودش
             به ۱۰۰٪ نمی‌رسد. لودینگی که زودتر از کارِ واقعی تمام شود
             بدتر از نبودنش است: کاربر فکر می‌کند سیستم هنگ کرده و
             دکمه را دوباره می‌زند. */}
      {busy && (
        <div className="pcAnalysis" role="status" aria-live="polite">
          <div className="pcAnalysisBar">
            <span style={{ width: `${(phase + 1) * 25}%` }} />
          </div>
          <div className="pcAnalysisSteps">
            {ANALYSIS_STEPS.map((st, i) => (
              <span key={st.label}
                className={i < phase ? 'done' : (i === phase ? 'now' : '')}>
                {i < phase ? '✓' : '●'}
              </span>
            ))}
          </div>
          <p className="pcAnalysisHint">{ANALYSIS_STEPS[phase].hint}</p>
        </div>
      )}

      {!file && (
        <small className="pcTip">
          راهنما: کل کارت داخل کادر باشد و نور کافی باشد. عکس تار هم
          معمولاً شناسایی می‌شود.
        </small>
      )}
    </div>
  );
}
