import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * تقویمِ شمسیِ انتخابی برای تاریخِ شروع و پایانِ لیگ.
 *
 * ── چرا نوشتنِ دستی حذف شد ──
 *
 * مدیر باید «۱۴۰۵/۰۷/۰۲» را حرف‌به‌حرف تایپ می‌کرد. سه مشکل داشت:
 * کند بود، اشتباهِ تایپی (مثلاً ۱۴۰۵/۰۷/۳۲) تا لحظهٔ ذخیره معلوم نمی‌شد،
 * و مهم‌تر از همه مدیر نمی‌دید «۷ مهر» چه روزی از هفته است — در حالی که
 * شروعِ لیگ معمولاً باید روی یک روزِ مشخصِ هفته بنشیند.
 *
 * ── چرا بدونِ کتابخانه ──
 *
 * بستهٔ آمادهٔ تقویمِ شمسی یعنی یک وابستگیِ تازه در بیلدِ پنل. ریاضیِ
 * تبدیل از قبل در همین پروژه بود و تقویم چیزی جز یک جدولِ ۷ستونه روی
 * همان تبدیل نیست؛ پس وابستگی نیفزودیم.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
// شنبه‌محور — هفتهٔ ایرانی از شنبه شروع می‌شود، نه یک‌شنبه.
const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function pad2(n) { return String(n).padStart(2, '0'); }
export function faNum(v) {
  return String(v == null ? '' : v).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
export function latinDigits(value) {
  return String(value || '').replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** شمسی → میلادی. ورودیِ مدیر همیشه شمسی است؛ تقویمِ میلادی اینجا بی‌معناست. */
export function jalaliToGregorian(inputDate, inputTime = '00:00:00') {
  const m = latinDigits(inputDate).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  let jy = Number(m[1]); const jm = Number(m[2]); const jd = Number(m[3]);
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  jy += 1595;
  const days = -355668 + 365 * jy + Math.floor(jy / 33) * 8
    + Math.floor(((jy % 33) + 3) / 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  let gy = 400 * Math.floor(days / 146097); let rem = days % 146097;
  if (rem > 36524) {
    gy += 100 * Math.floor(--rem / 36524); rem %= 36524;
    if (rem >= 365) rem += 1;
  }
  gy += 4 * Math.floor(rem / 1461); rem %= 1461;
  if (rem > 365) { gy += Math.floor((rem - 1) / 365); rem = (rem - 1) % 365; }
  const gd = rem + 1;
  const sal = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1; let left = gd;
  while (gm <= 12 && left > sal[gm]) { left -= sal[gm]; gm += 1; }
  const tm = String(inputTime || '00:00:00').split(':').map(Number);
  const d = new Date(0);
  d.setFullYear(gy, gm - 1, left);
  d.setHours(tm[0] || 0, tm[1] || 0, tm[2] || 0, 0);
  return d;
}

/** میلادی → شمسی (برای پرکردنِ فرم از روی لیگِ ذخیره‌شده). */
export function gregorianToJalali(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: '', time: '' };
  const gy = d.getFullYear(); const gm = d.getMonth() + 1; const gd = d.getDate();
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return {
    date: `${jy}/${pad2(jm)}/${pad2(jd)}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
  };
}

/**
 * طولِ ماهِ شمسی.
 *
 * ۶ ماهِ اول ۳۱ روز، ۵ ماهِ بعد ۳۰ روز، و اسفند ۲۹ یا ۳۰. به‌جای پیاده‌سازیِ
 * جدولِ سال‌های کبیسه (که قاعده‌اش مورد اختلاف است) از خودِ تبدیل می‌پرسیم:
 * اگر ۳۰ اسفند وجود داشته باشد، تبدیلِ رفت‌وبرگشت همان ۳۰ اسفند را می‌دهد.
 * این یعنی تقویم هیچ‌وقت با منطقِ ذخیره‌سازی اختلاف پیدا نمی‌کند.
 */
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const probe = gregorianToJalali(jalaliToGregorian(`${jy}/12/30`));
  return probe.date === `${jy}/12/30` ? 30 : 29;
}

function todayJalali() {
  return gregorianToJalali(new Date()).date;
}

/**
 * ورودیِ تاریخِ شمسی با تقویمِ بازشو.
 *
 * `value` همان قالبِ `YYYY/MM/DD` است که بقیهٔ فرم انتظار دارد، پس این
 * کامپوننت جایگزینِ مستقیمِ `<Input>` قبلی است و هیچ‌چیز در مسیرِ ذخیره
 * تغییر نمی‌کند.
 */
export function JalaliDateInput({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const parsed = useMemo(() => {
    const m = latinDigits(value).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }, [value]);

  const fallback = useMemo(() => {
    const t = latinDigits(todayJalali()).split('/');
    return { y: Number(t[0]), m: Number(t[1]), d: Number(t[2]) };
  }, []);

  const [view, setView] = useState(() => ({
    y: (parsed || fallback).y,
    m: (parsed || fallback).m,
  }));

  // وقتی مدیر لیگِ ذخیره‌شده‌ای را برای ویرایش باز می‌کند، فرم بعد از
  // mount پر می‌شود؛ تقویم باید روی همان ماه بپرد نه ماهِ جاری.
  useEffect(() => {
    if (parsed) setView({ y: parsed.y, m: parsed.m });
  }, [parsed?.y, parsed?.m]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const shift = (delta) => setView((v) => {
    let m = v.m + delta; let y = v.y;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    return { y, m };
  });

  const grid = useMemo(() => {
    const len = jalaliMonthLength(view.y, view.m);
    const first = jalaliToGregorian(`${view.y}/${pad2(view.m)}/01`);
    // getDay(): ۰=یک‌شنبه … ۶=شنبه. هفتهٔ ما از شنبه شروع می‌شود.
    const lead = first ? (first.getDay() + 1) % 7 : 0;
    return { len, lead };
  }, [view.y, view.m]);

  const today = latinDigits(todayJalali());

  const pick = (day) => {
    onChange(`${view.y}/${pad2(view.m)}/${pad2(day)}`);
    setOpen(false);
  };

  const shown = parsed
    ? faNum(`${parsed.y}/${pad2(parsed.m)}/${pad2(parsed.d)}`)
    : '';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
          border: '1px solid rgba(148,163,184,.35)',
          background: 'rgba(15,23,42,.6)', color: shown ? '#E2E8F0' : '#64748B',
          fontFamily: 'inherit', fontSize: 14, textAlign: 'right',
        }}
      >
        <Calendar size={15} style={{ flexShrink: 0, opacity: .8 }} />
        <span style={{ flex: 1 }}>{shown || placeholder || 'انتخاب تاریخ'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', zIndex: 60, top: 'calc(100% + 6px)', right: 0,
            width: 268, padding: 10, borderRadius: 14,
            background: '#0F1B2D', border: '1px solid rgba(148,163,184,.3)',
            boxShadow: '0 18px 50px rgba(0,0,0,.55)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <button type="button" onClick={() => shift(-1)} title="ماه قبل"
              style={navBtn}><ChevronRight size={16} /></button>
            <b style={{ color: '#E2E8F0', fontSize: 13.5 }}>
              {J_MONTHS[view.m - 1]} {faNum(view.y)}
            </b>
            <button type="button" onClick={() => shift(1)} title="ماه بعد"
              style={navBtn}><ChevronLeft size={16} /></button>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2,
            marginBottom: 4,
          }}>
            {WEEK.map((w) => (
              <span key={w} style={{
                textAlign: 'center', fontSize: 10.5, color: '#64748B', fontWeight: 800,
              }}>{w}</span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {Array.from({ length: grid.lead }).map((_, i) => <span key={`x${i}`} />)}
            {Array.from({ length: grid.len }).map((_, i) => {
              const day = i + 1;
              const iso = `${view.y}/${pad2(view.m)}/${pad2(day)}`;
              const sel = parsed && parsed.y === view.y
                && parsed.m === view.m && parsed.d === day;
              const isToday = iso === today;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  style={{
                    padding: '6px 0', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12.5, fontWeight: sel ? 900 : 600,
                    fontFamily: 'inherit',
                    border: isToday && !sel
                      ? '1px solid rgba(56,189,248,.55)'
                      : '1px solid transparent',
                    background: sel ? '#2563EB' : 'rgba(255,255,255,.04)',
                    color: sel ? '#fff' : '#CBD5E1',
                  }}
                >
                  {faNum(day)}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" style={footBtn}
              onClick={() => { onChange(todayJalali()); setOpen(false); }}>
              امروز
            </button>
            <button type="button" style={footBtn}
              onClick={() => { onChange(''); setOpen(false); }}>
              پاک کردن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn = {
  display: 'grid', placeItems: 'center', width: 26, height: 26,
  borderRadius: 8, cursor: 'pointer', color: '#CBD5E1',
  border: '1px solid rgba(148,163,184,.25)', background: 'rgba(255,255,255,.04)',
};

const footBtn = {
  flex: 1, padding: '6px 0', borderRadius: 8, cursor: 'pointer',
  fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit', color: '#94A3B8',
  border: '1px solid rgba(148,163,184,.25)', background: 'rgba(255,255,255,.04)',
};
