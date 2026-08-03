// گردونهٔ شانس — نسخهٔ وب.
//
// ─────────────────────────────────────────────────────────────────────────
// چرا انیمیشن از روی جواب سرور ساخته می‌شود، نه برعکس
//
// کلاینت جایزه را انتخاب نمی‌کند. اول POST می‌زند، سرور می‌گوید کدام برش
// برنده شده، و بعد گردونه دقیقاً روی همان برش می‌ایستد. اگر ترتیب برعکس
// بود — اول انیمیشن، بعد اعلام نتیجه — هرکسی با devtools می‌توانست جایزه را
// عوض کند.
//
// نتیجه از قبل معلوم است ولی کاربر ۴ ثانیه انتظار می‌کشد؛ این «تعلیق» است
// نه فریب: همان کاری که هر گردونهٔ فیزیکی هم می‌کند.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { req } from '../lib/api.js';
import { play as playSfx } from '../gameAudio.js';

const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

/** شمارش معکوس فارسی. رو به بالا گرد می‌شود — «۱ ساعت» وقتی ۹۰ دقیقه مانده
 *  وعده‌ای است که زیرش می‌زنیم. */
function countdown(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'کمتر از یک دقیقه';
  if (mins < 60) return `${fa(mins)} دقیقه`;
  return `${fa(Math.ceil(mins / 60))} ساعت`;
}

const SPIN_MS = 4200;

export default function Wheel({ token, setMsg, reloadProfile }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  // مجموع چرخش تجمعی است و هرگز کم نمی‌شود: اگر زاویه را ریست کنیم، گردونه
  // بین دو چرخش به عقب می‌پرد.
  const spunRef = useRef(0);
  const timers = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        req('/api/wheel', 'GET', null, token),
        req('/api/wheel/history', 'GET', null, token),
      ]);
      setState(s);
      setHistory(h.spins || []);
      setError('');
    } catch (e) {
      setError(e?.data?.message || 'گردونه در دسترس نیست');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const spin = useCallback(async () => {
    if (spinning || !state || state.spinsLeft <= 0) return;
    setSpinning(true);
    setResult(null);
    try {
      const res = await req('/api/wheel/spin', 'POST', {}, token);
      const n = state.prizes.length;
      const idx = state.prizes.findIndex(p => p.sliceOrder === res.prize.sliceOrder);
      const seg = 360 / n;

      // زاویهٔ لازم تا وسطِ برشِ برنده زیر سوزن (بالای گردونه) بایستد.
      // برش i از i*seg شروع می‌شود، پس مرکزش (i + 0.5) * seg است؛ برای
      // آوردنش به بالا باید همان‌قدر خلاف جهت بچرخیم.
      const target = 360 - (idx + 0.5) * seg;
      // کمی تصادفی داخل خودِ برش، تا سوزن همیشه دقیقاً وسط نایستد و
      // چرخش‌ها یک‌شکل به‌نظر نرسند. ۳۵٪ عرض برش، پس هرگز از مرز رد نمی‌شود.
      const jitter = (Math.random() - 0.5) * seg * 0.7;
      const full = 6 * 360;                        // شش دور کامل
      const next = spunRef.current + full
        + (((target + jitter) - (spunRef.current % 360)) + 360) % 360;
      spunRef.current = next;
      setAngle(next);

      playSfx('tick', 0.5);
      later(() => {
        setResult(res.prize);
        setState(s => ({ ...s, ...res }));
        playSfx(res.prize.kind === 'cash' ? 'win' : 'match_found');
        setSpinning(false);
        load();
        // موجودی/امتیاز هدر باید فوراً درست شود، وگرنه کاربر جایزه را
        // می‌بیند ولی عددِ بالای صفحه هنوز قدیمی است.
        reloadProfile?.();
      }, SPIN_MS);
    } catch (e) {
      setSpinning(false);
      const m = e?.data?.message || 'چرخش ناموفق بود';
      setError(m);
      setMsg?.(m);
      load();
    }
  }, [spinning, state, token, later, load, setMsg, reloadProfile]);

  if (error && !state) {
    return <section className="card wide"><p className="hint">{error}</p></section>;
  }
  if (!state) {
    return <section className="card wide"><p className="hint">در حال بارگذاری…</p></section>;
  }

  const canSpin = state.spinsLeft > 0 && !spinning;

  return (
    <section className="card wide wheelPage">
      <h2 className="wheelTitle">🎡 گردونهٔ شانس</h2>

      <div className="wheelStage">
        <img className="wheelPointer" src="/wheel/pointer.svg" alt="" />
        <div
          className="wheelSpinner"
          style={{
            transform: `rotate(${angle}deg)`,
            // فقط موقع چرخش transition داشته باشد: بدون این، بارگذاری اول
            // هم یک چرخش بی‌دلیل نشان می‌دهد.
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(.17,.67,.16,1)`
              : 'none',
          }}
        >
          <img className="wheelDisc" src="/wheel/wheel.svg" alt="گردونهٔ شانس" />
        </div>
        {/* سر شخصیت نمی‌چرخد — بیرون از عنصر چرخان است */}
        <img className="wheelHub" src="/wheel/hub_head.webp" alt="" />
      </div>

      <div className="wheelActions">
        <button className="primary wheelBtn" onClick={spin} disabled={!canSpin}>
          {spinning ? 'در حال چرخش…'
            : state.spinsLeft > 0 ? `بچرخان (${fa(state.spinsLeft)} شانس)`
              : 'شانس امروزت تمام شد'}
        </button>
        {state.spinsLeft <= 0 && (
          <p className="wheelReset">
            ⏳ شانس بعدی تا {countdown(state.resetInMs)} دیگر
          </p>
        )}
        {state.bonusSpins > 0 && (
          <p className="hint wheelBonus">
            {fa(state.bonusSpins)} چرخش جایزه از دعوت دوستان داری 🎁
          </p>
        )}
      </div>

      {result && (
        <div className={`wheelResult ${result.kind}`}>
          <b>{result.kind === 'cash' ? '🎉 برنده شدی!' : '✨ گرفتی!'}</b>
          <span>{result.label}</span>
        </div>
      )}

      {history.length > 0 && (
        <div className="wheelHistory">
          <h3>چرخش‌های اخیر</h3>
          <ul>
            {history.slice(0, 8).map((h, i) => (
              <li key={i}>
                <span className={h.kind === 'cash' ? 'cash' : ''}>{h.label}</span>
                <small>{new Date(h.at).toLocaleDateString('fa-IR')}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
