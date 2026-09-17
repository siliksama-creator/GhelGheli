// ═══════════════════════════════════════════════════════════════════════════
// صفحهٔ بارگذاریِ وب — هم‌زادِ `mobile/lib/screens/auth/splash_screen.dart`
// ═══════════════════════════════════════════════════════════════════════════
//
// ── چرا این فایل وجود دارد ────────────────────────────────────────────────
//
// نسخهٔ قبلیِ وب، همان `LoadingView` عمومی بود: یک کارت با یک چرخندهٔ
// اسپینری و متنِ «در حال بارگذاری...». یعنی اولین چیزی که کاربرِ وبِ قلقلی
// می‌دید، دقیقاً همان چیزی بود که هر سایتِ دیگری نشان می‌دهد — و مهم‌تر،
// **هیچ ربطی به کارِ واقعیِ در جریان نداشت**.
//
// این کامپوننت همان چهار چیزی را می‌دهد که نسخهٔ اندروید می‌دهد، تا دو
// کلاینت یک‌شکل باز شوند:
//
//   ۱. **پیشرفتِ واقعی.** `progress` از بیرون می‌آید و از تمام‌شدنِ
//      `/api/config`، `/api/bootstrap` و رمزگشاییِ تصویرها ساخته می‌شود.
//      هیچ تایمری آن را پر نمی‌کند.
//   ۲. **متنِ برند.** مراحل به زبانِ خودِ بازی حرف می‌زنند، نه به زبانِ یک
//      پنلِ ادمین.
//   ۳. **ورودِ بازیگوشِ لوگو.** پرشِ کشسان با لهیدگی و کشیدگی
//      (`splashHop` در splash.css) — همان قوسِ `LogoEntrance.playful` در
//      موبایل.
//   ۴. **احترام به «کاهش حرکت».** `prefers-reduced-motion` هم در CSS و هم
//      اینجا رعایت شده: نه پرشی، نه ذره‌ای، نه نورافکنی.
//
// ── چرا CSS و نه canvas ───────────────────────────────────────────────────
//
// نورافکن‌ها دو گرادیان‌اند و غبار ۱۸ نقطه که همه با `transform` و
// `opacity` حرکت می‌کنند. هیچ‌کدام layout را لمس نمی‌کنند، پس روی CPU
// کامپوز می‌شوند؛ یک canvas با حلقهٔ rAF همین تصویر را می‌داد ولی روی هر
// فریم جاوااسکریپت مصرف می‌کرد — درست در لحظه‌ای که مرورگر مشغولِ باز کردنِ
// چانک‌های اپ است.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/splash.css';

/// مراحلِ واقعیِ راه‌اندازیِ وب. متن‌ها عیناً همان متن‌های اپ اندروید هستند؛
/// کاربری که هم اپ دارد هم وب، نباید دو روایتِ متفاوت از یک لحظه ببیند.
export const SPLASH_STAGES = {
  config: 'قوانینِ این فصل را از اتاقِ داور می‌گیریم…',
  session: 'نشستِ بازیکن را روی زمین می‌گذاریم…',
  // «چمنِ زمین» حالا تصویرِ خودِ قهرمان است (لوگوی صفحهٔ بارگذاری) — متن
  // باید همان چیزی را بگوید که واقعاً در جریان است، نه یک استعارهٔ باقی‌مانده
  // از نسخهٔ قبلی.
  art: 'چمنِ زمین را می‌کشیم…',
};

/// کفِ لحظهٔ برند — همان ۶۰۰ms اپ، با همین دلیل: «هر بار کاملِ سینمایی».
export const SPLASH_MIN_MS = 600;

/// رقم‌های فارسی، بدون وابستگی به helperهای صفحه‌های دیگر.
const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export function faDigits(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)))
    .split('').map((c) => FA[Number(c)] ?? c).join('');
}

/**
 * «کاهش حرکت» — با شنونده، نه فقط با CSS.
 *
 * چرا لازم است: در حالتِ کم‌حرکت `animation`ها خاموش می‌شوند، ولی اگر کدِ
 * جاوااسکریپت همچنان منتظرِ پایانِ یک انیمیشن بماند، صفحه **گیر می‌کند**.
 * یعنی دقیقاً همان کاربری که برای راحتی، حرکت را خاموش کرده، پشتِ یک صفحهٔ
 * مرده می‌ماند. این هوک به کامپوننت می‌گوید که «کوتاه‌ترین مسیر» را برود.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    const on = (e) => setReduced(e.matches);
    // `addEventListener` در همهٔ مرورگرهای هدف هست؛ `addListener` منسوخ است
    // ولی برای مرورگرهای قدیمیِ اندروید نگه داشته شده.
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else if (mq.removeListener) mq.removeListener(on);
    };
  }, []);

  return reduced;
}

/// غبارِ چمن — همان ۲۲ ذرهٔ اپ، با فازِ **قطعی**.
///
/// عمداً از `Math.random()` استفاده نشده: صفحه باید در هر بازکردن دقیقاً
/// یک‌شکل باشد. غبارِ تصادفی در هر رفرش، مثلِ «چیزی که درست لود نشده»
/// خوانده می‌شود.
function dust(count = 22) {
  const out = [];
  let seed = 7;
  const next = () => {
    // مولدِ عددِ شبه‌تصادفیِ خطیِ ساده — همان نقشِ `Random(seed)` در موبایل.
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < count; i++) {
    out.push({
      left: `${(next() * 100).toFixed(2)}%`,
      size: 1 + next() * 2,
      dur: 7 + next() * 9,
      delay: -next() * 14,
      gold: i % 4 === 0,
    });
  }
  return out;
}

export default function SplashScreen({
  /// وقتی تصویرِ خودِ قهرمان رمزگشایی شد خبر می‌دهد.
  ///
  /// چرا از داخلِ خودِ کامپوننت و نه با یک پیش‌دانلود در والد: تنها تصویری
  /// که کاربر در این صفحه **می‌بیند** همین است، پس تنها کاری که ارزشِ
  /// نگه‌داشتنِ پوشش را دارد همین است. پیش‌دانلودِ چیزهای دیگر (پس‌زمینهٔ
  /// صفحهٔ ورود و…) در پس‌زمینه انجام می‌شود و کاربر را معطل نمی‌کند.
  onHeroReady,
  stage,
  label,
  progress = 0,
  notice = null,
  onRetry,
  onSkip,
  // کلاسِ خروج را والد می‌گذارد؛ کامپوننت از زمان‌بندیِ والد خبر ندارد و
  // نباید داشته باشد (اپ اندروید هم دقیقاً همین قرارداد را دارد:
  // `SplashScreenState.exit()`).
  leaving = false,
}) {
  const reduced = usePrefersReducedMotion();
  const motes = useMemo(() => dust(), []);
  const pct = Math.max(0, Math.min(1, Number(progress) || 0));
  const heroImgRef = useRef(null);

  useEffect(() => {
    const img = heroImgRef.current;
    if (!img) return undefined;
    if (img.complete && img.naturalWidth > 0) { onHeroReady?.(); return undefined; }
    let alive = true;
    const done = () => { if (alive) onHeroReady?.(); };
    img.addEventListener('load', done);
    img.addEventListener('error', done);   // شکست هم «تمام شد» است، نه «منتظر بمان»
    // `decode()` جلوتر از تصویر جبران می‌کند: روی موبایل، لحظهٔ «لود شد»
    // با «آماده برای نقاشی» یکی نیست و بدونِ این، اولین فریمِ قهرمان می‌تواند
    // خالی باشد.
    if (img.decode) img.decode().then(done).catch(() => {});
    return () => { alive = false; img.removeEventListener('load', done); img.removeEventListener('error', done); };
  }, [onHeroReady]);

  return (
    <div
      className={`splashRoot ${leaving ? 'isLeaving' : ''}`}
      role="status"
      aria-live="polite"
      data-stage={stage || 'boot'}
    >
      {/* ── نورافکن‌های ورزشگاه ──
          متنِ `data-reduced` جایش را به CSS می‌دهد تا خاموش‌کردنِ حرکت
          فقط یک‌جا (در استایل) نگه داشته شود. */}
      {!reduced && (
        <div className="splashStadium" aria-hidden="true">
          <span className="splashCone splashConeA" />
          <span className="splashCone splashConeB" />
          <div className="splashDust">
            {motes.map((m, i) => (
              <i
                key={i}
                style={{
                  left: m.left,
                  width: `${m.size}px`,
                  height: `${m.size}px`,
                  animationDuration: `${m.dur}s`,
                  animationDelay: `${m.delay}s`,
                  background: m.gold ? '#B5EF58' : '#ffffff',
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="splashStack">
        {/* ── قهرمان ──
            کلاس‌های `heroMark/heroAurora/heroSweep/heroGlint` از
            brand-mark.css می‌آیند — همان موتورِ لوگویی که صفحهٔ ورود از آن
            استفاده می‌کند. یعنی حرکتِ لوگو اینجا و آنجا یکی است و لحظهٔ
            انتقال، «همان برند» را ادامه می‌دهد، نه یک نسخهٔ نزدیک. */}
        {/* دو لایه، عمداً.
            لایهٔ بیرونی فقط کارِ «مورفِ انتقال» را انجام می‌دهد و لایهٔ
            داخلی کارِ پرشِ ورود. اگر هر دو روی یک عنصر بودند، کلاسِ خروج
            انیمیشنِ پرش را **جایگزین** می‌کرد و اگر کاربر سریع وارد می‌شد
            (پرش هنوز تمام نشده)، لوگو از میانهٔ پرش به نقطهٔ صفر می‌پرید —
            دقیقاً همان «لرزشی» که این پروژه یک‌بار هزینه‌اش را داده. با دو
            لایه، دو تبدیل با هم ضرب می‌شوند و پرش داخلِ لایهٔ در حالِ حرکت
            کامل می‌شود. (اپ اندروید همین ساختار را دارد: `AnimatedBuilder`
            بیرون، `AnimatedLogo` داخل.) */}
        <div className={`splashMarkWrap ${leaving ? 'isLeaving' : ''}`}>
        <div className={`splashMark ${reduced ? 'isReduced' : ''}`}>
          <span className="heroAurora" aria-hidden="true" />
          <span className="splashGlow" aria-hidden="true" />
          {/* ⚠️ **همان فایلی که صفحهٔ ورود استفاده می‌کند** — و این یک
              انتخابِ ظاهری نیست، دو دلیلِ اندازه‌گیری‌شده دارد:

              ۱. **هم‌راستاییِ ماسک.** `heroSweep` در brand-mark.css با
                 `mask-image: url(/logo.webp)` بریده می‌شود. اگر تصویرِ
                 اسپلش فایلِ دیگری باشد (مثلاً نسخهٔ بزرگ‌تر)، ماسک و تصویر
                 دو هندسهٔ متفاوت دارند و ردِ نور روی جای اشتباه می‌افتد.
              ۲. **وزنِ دروازه.** نسخهٔ بزرگ ۳۵۶KB است و صفحهٔ ورود ۱۲۵KB.
                 پوششِ بارگذاری باید فقط تا وقتی بماند که کارِ **دیده‌شده**
                 تمام شود؛ دانلودِ ۲۳۱KB اضافه که کاربر هیچ‌وقت در این صفحه
                 نمی‌بیند، یعنی ثانیه‌های اضافیِ انتظار. ۲۴۸px عرضِ نمایشی
                 است و این فایل ۷۲۰px پهنا دارد — برای هر صفحهٔ ۳x کافی است. */}
          <div className="heroMark">
            <img src="/logo.webp" alt="" width="720" height="595"
                 ref={heroImgRef} />
            <span className="heroSweep" aria-hidden="true" />
            <span className="heroGlint" aria-hidden="true" />
          </div>
        </div>
        </div>

        {/* ── پیام ── */}
        <div className="splashNotice">
          {notice ? (
            <div className="splashFailCard">
              <p>{notice}</p>
              <div className="splashFailBtns">
                <button type="button" className="main" onClick={onRetry}>
                  تلاش دوباره
                </button>
                <button type="button" onClick={onSkip}>رد کردن</button>
              </div>
            </div>
          ) : (
            <p className="splashLabel">{label || SPLASH_STAGES.config}</p>
          )}
        </div>

        {/* ── نوارِ پیشرفت ──
            `width: X%` و نه `transform` تنها: عرض باعث layout نمی‌شود
            (نوار absolute است) ولی جهتِ راست‌به‌چپ را خودکار رعایت
            می‌کند — با `translateX` در حالتِ RTL نوار از سمتِ اشتباه پر
            می‌شد. */}
        <div className="splashBar" aria-hidden="true">
          <span className="splashBarFill" style={{ width: `${pct * 100}%` }} />
        </div>
        <p className="splashPct">{faDigits(pct * 100)}٪</p>

        <p className="splashFoot">
          کارت‌ها را جمع کن، امتیاز بگیر، به لیگ برس
        </p>
      </div>
    </div>
  );
}
