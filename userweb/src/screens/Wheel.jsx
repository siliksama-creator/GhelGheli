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
import { heavyImpact } from '../haptics.js';
import { SvgIcon, AssetIcon } from '../components/IconAsset.jsx';

const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

/** شمارش معکوس فارسی. رو به بالا گرد می‌شود — «۱ ساعت» وقتی ۹۰ دقیقه مانده
 *  وعده‌ای است که زیرش می‌زنیم. */
function countdown(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'کمتر از یک دقیقه';
  if (mins < 60) return `${fa(mins)} دقیقه`;
  return `${fa(Math.ceil(mins / 60))} ساعت`;
}

// مالک: «گردونه یکم بیشتر بچرخه برای هیجان بیشتر».
// ۵.۶ ثانیه و ۹ دور. بیشتر از این، انتظار حس می‌شود نه هیجان.
const SPIN_MS = 5600;
const FULL_SPINS = 9;

export default function Wheel({ token, setMsg, reloadProfile, onSpinsChange }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState(null);
  // برشِ برنده، برای درخشش بعد از توقف. null یعنی هیچ.
  const [winner, setWinner] = useState(null);
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
      // نشانِ کنار آیکون گردونه در نوار بالا باید با این صفحه هم‌گام بماند،
      // وگرنه کاربر می‌چرخاند و نشان هنوز عدد قدیمی را نشان می‌دهد.
      onSpinsChange?.(s.unlimited ? '∞' : (s.spinsLeft ?? 0));
    } catch (e) {
      setError(e?.data?.message || 'گردونه در دسترس نیست');
    }
  }, [token, onSpinsChange]);

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
      const full = FULL_SPINS * 360;
      const next = spunRef.current + full
        + (((target + jitter) - (spunRef.current % 360)) + 360) % 360;
      spunRef.current = next;
      setAngle(next);

      playSfx('tick', 0.5);
      setWinner(null);   // درخشش قبلی وسط چرخش تازه نماند
      later(() => {
        setResult(res.prize);
        setWinner(idx);
        setState(s => ({ ...s, ...res }));
        onSpinsChange?.(res.unlimited ? '∞' : (res.spinsLeft ?? 0));
        playSfx(res.prize.kind === 'cash' ? 'win' : 'match_found');
        heavyImpact();
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
      <h2 className="wheelTitle"><AssetIcon name="wheel" size={30} /> گردونهٔ شانس</h2>

      <div className={`wheelStage${spinning ? ' spinning' : ''}`}>
        <img className="wheelPointer" src="/wheel/pointer.svg" alt="" />
        <div
          className="wheelSpinner"
          style={{
            transform: `rotate(${angle}deg)`,
            // فقط موقع چرخش transition داشته باشد: بدون این، بارگذاری اول
            // هم یک چرخش بی‌دلیل نشان می‌دهد.
            transition: spinning
              ? // easeOutQuint — انتهای نرم‌تر از منحنی قبلی، پس گردونه در
              // ثانیهٔ آخر آرام روی جایزه می‌نشیند به‌جای توقف ناگهانی.
              `transform ${SPIN_MS}ms cubic-bezier(.15,.85,.2,1)`
              : 'none',
          }}
        >
          <img className="wheelDisc" src="/wheel/wheel.svg" alt="گردونهٔ شانس" />
          {/* درخشش روی برشِ برنده — مهم‌ترین بازخورد بصری صفحه: بدون آن
              کاربر باید سوزن را با متنِ نتیجه تطبیق بدهد تا مطمئن شود
              گردونه واقعاً همان‌جا ایستاده. یک قطاعِ conic-gradient روی
              دیسک، پس با خودِ گردونه می‌چرخد. */}
          {winner != null && state.prizes.length > 0 && (
            <span
              className="wheelWin"
              style={{
                '--a0': `${(winner * 360) / state.prizes.length}deg`,
                '--a1': `${((winner + 1) * 360) / state.prizes.length}deg`,
              }}
            />
          )}
        </div>
        {/* سر شخصیت نمی‌چرخد — بیرون از عنصر چرخان است */}
        <img className="wheelHub" src="/wheel/hub_head.webp" alt="" />
      </div>

      <div className="wheelActions">
        <button className="primary wheelBtn" onClick={spin} disabled={!canSpin}>
          {spinning ? 'در حال چرخش…'
            : state.unlimited ? 'بچرخون (نامحدود)'
              : state.spinsLeft > 0 ? `بچرخون — ${fa(state.spinsLeft)} شانس`
                : 'شانس امروزت تمام شد'}
        </button>
        {state.spinsLeft <= 0 && !state.unlimited && (
          <p className="wheelReset">
            <SvgIcon name="support" size={16} /> شانس بعدی تا {countdown(state.resetInMs)} دیگر
          </p>
        )}
        {/* ⚠️ منبعِ چرخشِ جایزه یکی نیست.
            `users.bonus_spins` از **دو جا** پر می‌شود: دعوت دوستان
            (referralService) و پله‌های نوع `spins` در گذر نبرد
            (passService). متنِ قبلی همیشه می‌گفت «از دعوت دوستان» و
            روی حسابی که هیچ دعوتی نداشت ولی سه پلهٔ گذر نبرد گرفته بود،
            یک ادعای آشکارا نادرست نشان می‌داد. چون سرور تفکیکِ منبع را
            نمی‌فرستد، متن باید نسبت به منبع بی‌طرف باشد. */}
        {state.bonusSpins > 0 && (
          <p className="hint wheelBonus">
            {fa(state.bonusSpins)} چرخش جایزه داری
          </p>
        )}
      </div>

      {result && (
        <div className={`wheelResult ${result.kind}`}>
          <b>{result.kind === 'cash' ? ' برنده شدی!' : ' گرفتی!'}</b>
          <span>{result.label}</span>
        </div>
      )}

      {/* ── قوانین ────────────────────────────────────────────────────
          مالک خواست: «تمامی توضیحات گردونه و قسمت دعوت به کاربرها توضیح
          داده بشه». بدون این، کاربر نمی‌داند چرا امروز ۱ چرخش دارد و
          دوستش ۳ تا، و فکر می‌کند سیستم خراب است. */}
      <details className="wheelRules" open={state.spinsLeft <= 0}>
        <summary>گردونه چطور کار می‌کند؟</summary>
        <ul>
          <li>
            {state.unlimited
              ? <>این حساب <b>چرخش نامحدود</b> دارد (حالت تست).</>
              : <>هر روز <b>{fa(state.dailyQuota ?? 1)} چرخش رایگان</b> داری.
                {state.dailyQuota > 1 && ' (به‌خاطر دوستانی که دعوت کردی)'}</>}
          </li>
          <li>چرخاندن گردونه <b>هیچ هزینه‌ای ندارد</b> و هیچ‌وقت نخواهد داشت.</li>
          <li>
            به ازای هر <b>{fa(10)} دوستی</b> که دعوت کنی، یک چرخش رایگانِ
            روزانهٔ دیگر می‌گیری — تا سقف {fa(50)} دوست.
          </li>
          <li>
            هر دعوت موفق، <b>{fa(3)} چرخش فوری</b> هم به تو و هم به دوستت
            می‌دهد.
          </li>
          <li>سهمیهٔ روزانه هر شب ساعت ۱۲ به وقت تهران تازه می‌شود.</li>
          <li className="wheelRuleOdds">
            جایزه‌های بزرگ عمداً خیلی کم‌یاب‌اند؛ بیشتر چرخش‌ها امتیاز
            می‌دهند. جایزه را سرور انتخاب می‌کند، نه گوشی تو.
          </li>
        </ul>
      </details>

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
