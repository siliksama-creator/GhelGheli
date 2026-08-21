import React, { useCallback, useEffect, useRef, useState } from 'react';
import { req, fa, API } from '../lib/api.js';
import { CARD_RARITY_META } from '../lib/cards.js';
import { play, playShake, stopShake, warmup } from '../gameAudio.js';

// ⚠️ `fa()` خودش جداکنندهٔ هزارگان می‌گذارد و ورودی را `Number()` می‌کند.
// اگر اول `toLocaleString()` بزنیم، رشتهٔ «100,000» به `fa()` می‌رسد و
// `Number('100,000')` مقدارِ NaN می‌دهد ⇒ روی صفحه «ناعدد تومان» چاپ
// می‌شد. عدد را خام بده؛ قالب‌بندی کارِ خودِ `fa()` است.
const money = n => `${fa(Number(n || 0))} تومان`;

// صدای رونمایی هر سطح — بالاتر = باشکوه‌تر.
const REVEAL_SFX = { normal: 'flip', silver: 'drop', gold: 'duel_points', premium: 'win', legend: 'duel_victory' };

/**
 * صندوقِ کارت.
 *
 * 🔴 چرا این فایل وجود دارد: بک‌اندِ صندوق کامل و زنده بود (`overview`,
 *    `buy`, `history`) ولی **هیچ کلاینتی صدایش نمی‌زد**. کاربری که کارتِ
 *    فیزیکی نداشت، در دوئل پیام «حداقل پنج کارت لازم داری» می‌گرفت و هیچ
 *    راهی برای گرفتنشان نبود — بن‌بستِ کامل. صندوق دقیقاً برای همین ساخته
 *    شده بود و فقط درِ ورودی‌اش جا مانده بود.
 *
 * ── دورِ ۲۸: از «یک ردیفِ دیگر» به «قهرمانِ صفحه» ──
 *
 * تا دیروز صندوق یک کارتِ مستطیلی بود که بینِ پلن‌های پلاس و چیپ‌های
 * دسته‌بندی گم می‌شد؛ هم‌وزنِ یک آیتمِ ظاهریِ ده‌هزار تومانی دیده می‌شد در
 * حالی که تنها درِ ورود به دوئل است. سه چیز عوض شد:
 *
 *   ۱. **بنرِ شاخص** با تصویرِ ترنسپرنتِ صندوق، نه آیکونِ کوچکِ کنارِ تیتر.
 *   ۲. **باز شدنِ انیمیشنی**: لرزش → انفجارِ نور → تعویضِ درِ بسته با باز.
 *   ۳. **رونماییِ کارت‌ها** روی تمامِ صفحه، یکی‌یکی و با رنگِ سطحِ خودشان،
 *      به‌جای فهرستِ افقیِ ریزی که کاربر اصلاً نمی‌دیدش.
 *
 * دو جا رندر می‌شود: قفسهٔ فروشگاه، و درست همان‌جا که دوئل بن‌بست می‌شود.
 */
export default function CardBox({ token, compact = false, onGranted }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [won, setWon] = useState(null);
  const [wonMeta, setWonMeta] = useState(null);

  // مرحلهٔ نمایش: idle → shaking → bursting → revealing
  //
  // این جدا از `busy` است: `busy` وضعیتِ شبکه را می‌گوید و `phase` وضعیتِ
  // نمایش را. اگر یکی‌شان می‌کردیم، پرداختِ سریع باعث می‌شد انیمیشن نصفه
  // بپرد و پرداختِ کند باعث می‌شد صندوق قبل از رسیدنِ کارت‌ها باز شود.
  const [phase, setPhase] = useState('idle');
  const [revealed, setRevealed] = useState(0);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };

  // ── صدای لرزشِ صندوق ──────────────────────────────────────────────
  // در طولِ ۳ ثانیهٔ لرزش، یک صدای شبیه به هم‌زدنِ کارت پخش می‌شود
  // (تناوبِ flip/drop) و هنگامِ ترکِ مرحلهٔ shaking قطع می‌شود.
  const stopShakeSound = () => { stopShake(); };
  const startShakeSound = () => { playShake(); };

  useEffect(() => () => { clearTimers(); stopShakeSound(); }, []);

  const load = useCallback(async () => {
    try {
      setData(await req('/api/card-box/overview', 'GET', null, token));
    } catch (e) {
      setError(e.message || 'صندوق در دسترس نیست');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const closeReveal = () => {
    clearTimers();
    setPhase('idle');
    setWon(null);
    setWonMeta(null);
    setRevealed(0);
  };

  const buy = async () => {
    setBusy(true); setError(''); setWon(null); setWonMeta(null); setRevealed(0);
    setPhase('shaking');
    warmup(['box_shake', 'draw', 'flip', 'drop', 'duel_points', 'win', 'duel_victory']);
    play('draw');
    startShakeSound();
    const t0 = Date.now();
    try {
      // همان سه‌گامِ فروشگاه: سفارش از سرور، پرداخت در بازار، تحویل بعد
      // از راستی‌آزماییِ سرور. کلاینت هیچ‌وقت خودش «تحویل شد» نمی‌گوید.
      const order = await req('/api/card-box/buy', 'POST', {}, token);
      if (!window.__ghBazaarPurchase) {
        throw new Error('برای خرید صندوق، اپ اندروید را از کافه‌بازار نصب کنید');
      }
      const purchaseToken = await window.__ghBazaarPurchase(order.productId, order.orderId);
      const result = await req('/api/purchase/verify', 'POST',
        { orderId: order.orderId, purchaseToken }, token);
      const cards = result?.cards || [];
      setWon(cards);
      // امتیازِ کل و پرچمِ «پنج کارتِ متفاوت» از پاسخِ سرور می‌آید، نه از
      // جمعِ کلاینت: منبعِ حقیقت همان چیزی است که در تراکنش ثبت شد.
      setWonMeta({
        points: Number(result?.points || 0),
        distinct: result?.distinctCards === true,
      });
      await load();
      onGranted?.(result);

      // ترتیبِ نمایش، بعد از قطعی‌شدنِ تحویل: در باز می‌شود، نور می‌ترکد،
      // بعد کارت‌ها یکی‌یکی رو می‌آیند. هر کارت ۲۶۰ms فاصله دارد تا چشم
      // فرصتِ دیدنِ هرکدام را داشته باشد.
      const shakeRemain = Math.max(0, 3000 - (Date.now() - t0));
      later(() => {
        stopShakeSound();
        setPhase('bursting');
      }, shakeRemain);
      later(() => {
        setPhase('revealing');
        cards.forEach((c, i) => later(() => {
          setRevealed(i + 1);
          play(REVEAL_SFX[c.rarity] || 'flip');
        }, 260 * i + 180));
      }, shakeRemain + 640);
    } catch (e) {
      stopShakeSound();
      setError(e.message || 'خرید انجام نشد');
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  // خرید مستقیم با موجودیِ کیف پول: سرور همان‌جا کسر و تحویل می‌دهد؛
  // درگاهی در کار نیست و کلاینت فقط نتیجه را نمایش می‌دهد.
  const buyWithWallet = async () => {
    setBusy(true); setError(''); setWon(null); setWonMeta(null); setRevealed(0);
    setPhase('shaking');
    warmup(['box_shake', 'draw', 'flip', 'drop', 'duel_points', 'win', 'duel_victory']);
    play('draw');
    startShakeSound();
    const t0 = Date.now();
    try {
      const result = await req('/api/card-box/buy', 'POST', { useWallet: true }, token);
      const cards = result?.cards || [];
      setWon(cards);
      setWonMeta({
        points: Number(result?.points || 0),
        distinct: result?.distinctCards === true,
      });
      await load();
      onGranted?.(result);
      const shakeRemain = Math.max(0, 3000 - (Date.now() - t0));
      later(() => {
        stopShakeSound();
        setPhase('bursting');
      }, shakeRemain);
      later(() => {
        setPhase('revealing');
        cards.forEach((c, i) => later(() => {
          setRevealed(i + 1);
          play(REVEAL_SFX[c.rarity] || 'flip');
        }, 260 * i + 180));
      }, shakeRemain + 640);
    } catch (e) {
      stopShakeSound();
      setError(e.message || 'خرید با کیف پول انجام نشد');
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="cardBox cardBoxLoading">
      {error || 'در حال باز کردن صندوق…'}
    </div>;
  }

  const open = phase === 'bursting' || phase === 'revealing';

  return <section className={`cardBox${phase === 'shaking' ? ' shaking' : ''} ${compact ? 'compact' : ''}`} dir="rtl">
    <style>{`
      /* ── بنرِ شاخص ─────────────────────────────────────────────────
         عمداً از قابِ آیتم‌های فروشگاه پیروی نمی‌کند: هالهٔ طلایی، قابِ
         ضخیم‌تر و عرضِ کامل، تا در یک نگاه از قفسهٔ آیتم‌ها جدا بیفتد. */
      .cardBox{position:relative;overflow:hidden;border:1.5px solid rgba(255,209,102,.55);
        border-radius:26px;padding:0;color:#fff;margin:18px 0 22px;
        background:radial-gradient(120% 130% at 82% -18%,rgba(249,115,22,.32),transparent 52%),
          radial-gradient(100% 120% at 12% 110%,rgba(124,58,237,.34),transparent 56%),
          linear-gradient(140deg,#0d1b2c,#141033 62%,#2a1140);
        box-shadow:0 20px 60px rgba(0,0,0,.42),0 0 0 5px rgba(255,209,102,.07),
          inset 0 1px 0 rgba(255,255,255,.09)}
      /* نوارِ نورِ کندی که آرام روی بنر می‌لغزد — «زنده» بودنِ بی‌سروصدا */
      .cardBox::after{content:'';position:absolute;inset:0;pointer-events:none;
        background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.09) 47%,transparent 56%);
        transform:translateX(-120%);animation:cbSheen 5.6s ease-in-out infinite}
      @keyframes cbSheen{0%,72%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
      .cardBoxLoading{text-align:center;color:#94a3b8;font-size:12px;padding:26px}

      .cardBoxRibbon{position:absolute;top:15px;left:-40px;transform:rotate(-38deg);
        background:linear-gradient(135deg,#FFD166,#F97316);color:#2a1002;font-weight:950;
        font-size:10px;letter-spacing:.4px;padding:5px 44px;box-shadow:0 5px 16px rgba(0,0,0,.35);z-index:3}

      .cardBoxBody{position:relative;z-index:2;display:grid;
        grid-template-columns:minmax(0,168px) minmax(0,1fr);gap:16px;padding:18px 18px 16px;align-items:center}

      /* ── صحنهٔ صندوق ──────────────────────────────────────────────── */
      .cardBoxStage{position:relative;aspect-ratio:1;display:grid;place-items:center}
      .cardBoxGlow{position:absolute;width:88%;height:88%;border-radius:50%;
        background:radial-gradient(circle,rgba(255,209,102,.45),rgba(249,115,22,.16) 45%,transparent 70%);
        filter:blur(9px);animation:cbPulse 3.1s ease-in-out infinite}
      @keyframes cbPulse{0%,100%{opacity:.55;transform:scale(.93)}50%{opacity:1;transform:scale(1.07)}}
      .cardBoxImg{position:relative;width:100%;height:100%;object-fit:contain;
        filter:drop-shadow(0 12px 20px rgba(0,0,0,.5));animation:cbFloat 3.6s ease-in-out infinite}
      @keyframes cbFloat{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-7px) rotate(1deg)}}
      /* لرزشِ قبل از باز شدن: تند و کوتاه، مثل چیزی که دارد از تو فشار می‌آورد */
      .cardBox.shaking{animation:cbBoxShake .38s ease-in-out infinite}
      .cardBox.shaking .cardBoxImg{animation:cbShake .16s linear infinite}
      .cardBox.shaking .cardBoxGlow{animation:cbGlowPulse .55s ease-in-out infinite}
      @keyframes cbBoxShake{0%,100%{transform:translate(0,0) rotate(0)}18%{transform:translate(-7px,3px) rotate(-1.4deg)}36%{transform:translate(6px,-4px) rotate(1.2deg)}54%{transform:translate(-5px,-3px) rotate(-.9deg)}72%{transform:translate(7px,3px) rotate(1.3deg)}90%{transform:translate(-3px,2px) rotate(-.5deg)}}
      @keyframes cbGlowPulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
      @keyframes cbShake{0%,100%{transform:translate(0,0) rotate(0)}
        20%{transform:translate(-3px,1px) rotate(-3deg)}40%{transform:translate(3px,-1px) rotate(3deg)}
        60%{transform:translate(-2px,-2px) rotate(-2deg)}80%{transform:translate(2px,2px) rotate(2deg)}}
      .cardBox.open .cardBoxImg{animation:cbPop .55s cubic-bezier(.2,1.5,.4,1) both}
      @keyframes cbPop{0%{transform:scale(.86)}60%{transform:scale(1.13)}100%{transform:scale(1)}}
      .cardBox.open .cardBoxGlow{animation:cbBurst .62s ease-out both}
      @keyframes cbBurst{0%{opacity:.4;transform:scale(.6)}55%{opacity:1;transform:scale(1.7)}
        100%{opacity:.85;transform:scale(1.15)}}
      /* پرتوهای نوری که فقط لحظهٔ باز شدن می‌زنند */
      .cardBoxRays{position:absolute;inset:-14%;border-radius:50%;opacity:0;pointer-events:none;
        background:conic-gradient(from 0deg,rgba(255,209,102,.7) 0 3deg,transparent 3deg 30deg,
          rgba(255,209,102,.5) 30deg 33deg,transparent 33deg 60deg,rgba(249,115,22,.6) 60deg 63deg,
          transparent 63deg 90deg,rgba(255,209,102,.7) 90deg 93deg,transparent 93deg 120deg,
          rgba(255,209,102,.5) 120deg 123deg,transparent 123deg 150deg,rgba(249,115,22,.6) 150deg 153deg,
          transparent 153deg 180deg,rgba(255,209,102,.7) 180deg 183deg,transparent 183deg 210deg,
          rgba(255,209,102,.5) 210deg 213deg,transparent 213deg 240deg,rgba(249,115,22,.6) 240deg 243deg,
          transparent 243deg 270deg,rgba(255,209,102,.7) 270deg 273deg,transparent 273deg 300deg,
          rgba(255,209,102,.5) 300deg 303deg,transparent 303deg 330deg,rgba(249,115,22,.6) 330deg 333deg,
          transparent 333deg 360deg);
        -webkit-mask:radial-gradient(circle,transparent 24%,#000 42%,transparent 74%);
        mask:radial-gradient(circle,transparent 24%,#000 42%,transparent 74%)}
      .cardBox.open .cardBoxRays{animation:cbRays 1s ease-out both}
      @keyframes cbRays{0%{opacity:0;transform:scale(.5) rotate(0)}
        35%{opacity:1}100%{opacity:0;transform:scale(1.5) rotate(58deg)}}

      /* ── متنِ بنر ─────────────────────────────────────────────────── */
      .cardBoxInfo{display:grid;gap:9px;min-width:0}
      .cardBoxTitleRow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .cardBoxInfo h3{margin:0;font-size:20px;font-weight:950;letter-spacing:-.2px;
        background:linear-gradient(100deg,#FFF3D0,#FFD166 45%,#F97316);
        -webkit-background-clip:text;background-clip:text;color:transparent}
      .cardBoxInfo p{margin:0;font-size:11.5px;line-height:1.75;color:#c3cedd}
      .cardBoxInfo p b{color:#FFD166}
      .cardBoxPrice{white-space:nowrap;background:rgba(0,0,0,.34);border:1px solid rgba(255,209,102,.45);
        border-radius:14px;padding:7px 12px;color:#FFD166;font-weight:950;font-size:13.5px}

      .cardBoxOdds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
      .cardBoxOdd{border-radius:12px;padding:7px 4px;text-align:center;background:rgba(0,0,0,.26);
        border:1px solid rgba(255,255,255,.1)}
      .cardBoxOdd b{display:block;font-size:14px;font-weight:950}
      .cardBoxOdd span{display:block;font-size:9.5px;color:#9aa8ba;margin-top:2px}

      .cardBoxFoot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .cardBoxOwned{font-size:11px;color:#dbe6f2}
      .cardBoxOwned b{color:#FFD166}
      .cardBoxBtn{position:relative;border:0;border-radius:14px;padding:12px 22px;font-weight:950;
        font-size:13.5px;cursor:pointer;color:#1a0f02;overflow:hidden;
        background:linear-gradient(135deg,#FFE9A8,#FFD166 40%,#F97316);
        box-shadow:0 8px 22px rgba(249,115,22,.34)}
      .cardBoxBtn:disabled{opacity:.6;cursor:default;box-shadow:none}
      .cardBoxHint{color:#8fa0b4;font-size:10px;line-height:1.65;margin:0;padding:0 18px 15px}
      .cardBoxErr{color:#FCA5A5;font-size:11px;margin:0;padding:0 18px 14px}

      /* ── رونماییِ کارت‌ها ───────────────────────────────────────────
         z-index برابرِ ۱۳۰۰ است چون قراردادِ مودال‌های همین اپ همین است
         (.invModalShade در style.css). با عددِ کمتر، نویگیشنِ پایین و
         هدر روی کارت‌ها می‌افتند — دقیقاً روی لحظه‌ای که کاربر باید
         جایزه‌اش را ببیند. */
      .cardBoxReveal{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:18px;
        background:radial-gradient(circle at 50% 42%,rgba(42,17,64,.94),rgba(4,8,15,.97));
        animation:cbFade .3s ease both;overflow-y:auto}
      @keyframes cbFade{from{opacity:0}to{opacity:1}}
      .cardBoxRevealInner{width:min(100%,540px);display:grid;gap:16px;justify-items:center}
      .cardBoxRevealTitle{margin:0;text-align:center;font-size:19px;font-weight:950;color:#FFD166}
      .cardBoxRevealSub{margin:0;text-align:center;font-size:11.5px;color:#a9b7c8}
      .cardBoxDeck{display:flex;flex-wrap:wrap;gap:11px;justify-content:center}
      .cardBoxPrize{width:98px;border-radius:16px;padding:12px 8px;text-align:center;
        background:linear-gradient(165deg,rgba(255,255,255,.13),rgba(0,0,0,.4));
        border:1.5px solid var(--accent);box-shadow:0 0 22px -6px var(--accent);
        opacity:0;transform:rotateY(90deg) scale(.7)}
      .cardBoxPrize.shown{animation:cbFlip .55s cubic-bezier(.2,1.3,.4,1) both}
      @keyframes cbFlip{0%{opacity:0;transform:translateY(48px) scale(.4) rotate(-10deg)}
        55%{opacity:1;transform:translateY(-12px) scale(1.16) rotate(4deg)}
        80%{transform:translateY(2px) scale(.97) rotate(-1deg)}
        100%{opacity:1;transform:translateY(0) scale(1) rotate(0)}}
      .cardBoxPrizeTier{display:block;font-size:9.5px;font-weight:900;color:var(--accent);
        letter-spacing:.3px;margin-bottom:6px}
      .cardBoxPrizeName{display:block;font-size:11.5px;font-weight:950;color:#fff;line-height:1.5;
        min-height:2.9em;overflow:hidden}
      .cardBoxPrizePts{display:block;margin-top:6px;font-size:10px;color:#FFD166;font-weight:900}
      .cardBoxDone{border:0;border-radius:14px;padding:12px 34px;font-weight:950;font-size:13.5px;
        cursor:pointer;color:#1a0f02;background:linear-gradient(135deg,#FFD166,#F97316)}
      .cardBoxTotal{font-size:12px;color:#22E7A6;font-weight:900}
      /* امتیازِ کل با رنگِ کهربایی از تعدادِ کارت جدا می‌شود تا در یک نگاه
         دو عددِ متفاوت خوانده شوند، نه یک رشتهٔ یکدست. */
      .cardBoxTotalPts{font-size:12px;color:#FFC24B;font-weight:900}
      .cardBoxRevealNote{margin:2px 0 0;text-align:center;font-size:10.5px;
        color:#7ee0b8;animation:cbFade .4s ease both}

      /* حالتِ فشرده — جایی که صندوق داخلِ بن‌بستِ دوئل می‌نشیند و
         نباید کلِ صفحه را بگیرد: هالهٔ کوچک‌تر، متنِ کمکی پنهان. */
      .cardBox.compact{margin:12px 0}
      .cardBox.compact .cardBoxBody{grid-template-columns:minmax(0,116px) minmax(0,1fr);
        gap:12px;padding:14px 14px 12px}
      .cardBox.compact .cardBoxInfo h3{font-size:17px}
      .cardBox.compact .cardBoxHint{display:none}
      @media(max-width:560px){
        .cardBoxBody{grid-template-columns:minmax(0,110px) minmax(0,1fr);gap:12px;padding:15px 14px 13px}
        .cardBoxInfo h3{font-size:17px}
        .cardBoxOdds{grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
        .cardBoxOdd b{font-size:12px}.cardBoxOdd span{font-size:8.5px}
        .cardBoxBtn{width:100%}.cardBoxFoot{gap:8px}
        .cardBoxPrize{width:86px}
      }
      @media(prefers-reduced-motion:reduce){
        .cardBox::after,.cardBox.shaking,.cardBoxGlow,.cardBoxImg,.cardBoxRays,.cardBoxPrize.shown{animation:none}
        .cardBoxPrize--silver.shown,.cardBoxPrize--gold.shown,
        .cardBoxPrize--premium.shown,.cardBoxPrize--legend.shown{animation:none}
        .cardBoxPrize.shown{opacity:1;transform:none}
      }
      /* ── عکسِ کارت + انیمیشنِ رونماییِ هر سطح ─────────────────── */
      .cardBoxPrizeImg{width:62px;height:62px;object-fit:cover;border-radius:10px;
        margin:0 auto 8px;display:block;background:#0b1422;
        border:1px solid rgba(255,255,255,.16)}
      .cardBoxPrize--silver.shown,.cardBoxPrize--gold.shown,
      .cardBoxPrize--premium.shown,.cardBoxPrize--legend.shown{position:relative;overflow:hidden}
      .cardBoxPrize--silver.shown{animation:cbFlip .5s cubic-bezier(.2,1.3,.4,1) both,
        cbShine 1.05s ease .08s both}
      .cardBoxPrize--gold.shown{animation:cbFlip .55s cubic-bezier(.2,1.4,.4,1) both,
        cbShine 1.15s ease .1s both,cbGlow 1.2s ease .1s 2}
      .cardBoxPrize--premium.shown{animation:cbFlip .55s cubic-bezier(.2,1.4,.4,1) both,
        cbShine 1.2s ease .12s both,cbGlow 1.3s ease .12s 3}
      .cardBoxPrize--legend.shown{animation:cbFlip .6s cubic-bezier(.2,1.5,.4,1) both,
        cbShine 1.25s ease .14s both,cbLegend 1.6s ease .3s infinite}
      .cardBoxPrize--silver::after,.cardBoxPrize--gold::after,
      .cardBoxPrize--premium::after,.cardBoxPrize--legend::after{
        content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;
        background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.55) 50%,transparent 68%);
        background-size:250% 100%;opacity:0}
      .cardBoxPrize--silver.shown::after,.cardBoxPrize--gold.shown::after,
      .cardBoxPrize--premium.shown::after,.cardBoxPrize--legend.shown::after{
        opacity:1;animation:cbShine 1.1s ease .12s both}
      @keyframes cbShine{0%{background-position:130% 0}100%{background-position:-130% 0}}
      @keyframes cbGlow{0%,100%{box-shadow:0 0 18px -4px var(--accent)}
        50%{box-shadow:0 0 36px 4px var(--accent)}}
      @keyframes cbLegend{0%,100%{transform:translateY(0) scale(1.02)}
        50%{transform:translateY(-6px) scale(1.06)}}
    `}</style>

    <span className="cardBoxRibbon">ویژه</span>

    <div className="cardBoxBody">
      <div className="cardBoxStage">
        <span className="cardBoxGlow" />
        <span className="cardBoxRays" />
        <img
          className="cardBoxImg"
          src={open ? '/shop/card_box_open.webp' : '/shop/card_box_closed.webp'}
          alt="صندوق کارت"
          width={168}
          height={168}
        />
      </div>

      <div className="cardBoxInfo">
        <div className="cardBoxTitleRow">
          <h3>صندوق کارت</h3>
          <span className="cardBoxPrice">{money(data.price)}</span>
        </div>
        <p>
          {data.needsBox
            ? <>برای شروعِ دوئل به <b>{fa(data.size)} کارت</b> نیاز داری. این صندوق دقیقاً
              همان‌قدر کارتِ تصادفی می‌دهد و هر کارت <b>امتیاز</b> هم دارد.</>
            : <>کلکسیونت آمادهٔ دوئل است. هر صندوق <b>{fa(data.size)} کارتِ</b> تصادفیِ
              دیگر با امتیازشان اضافه می‌کند.</>}
        </p>

        <div className="cardBoxOdds">
          {(data.odds || []).map(o => {
            const meta = CARD_RARITY_META[o.rarity] || { label: o.rarity, accent: '#94A3B8' };
            return <div key={o.rarity} className="cardBoxOdd">
              <b style={{ color: meta.accent }}>{fa(o.percent)}٪</b>
              <span>{meta.label}</span>
            </div>;
          })}
        </div>

        <div className="cardBoxFoot">
          <span className="cardBoxOwned">
            کارت‌های فعال تو: <b>{fa(data.ownedCards)}</b>
            {data.needsBox ? ` از ${fa(data.size)}` : ' · آمادهٔ دوئل'}
          </span>
          <div className="cardBoxBuyRow" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="cardBoxBtn" onClick={buy} disabled={busy}>
              {busy ? 'در حال باز کردن…' : 'باز کردن صندوق'}
            </button>
            {typeof data.walletBalance === 'number' && (
              <button type="button" className="cardBoxBtn cardBoxBtnWallet"
                style={{ fontSize: 11, padding: '8px 12px',
                  opacity: busy || data.walletBalance < data.price ? 0.55 : 1 }}
                onClick={buyWithWallet}
                disabled={busy || data.walletBalance < data.price}>
                خرید با کیف پول
                <small style={{ display: 'block', opacity: 0.75, fontWeight: 400 }}>
                  موجودی: {money(data.walletBalance)}
                </small>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    <p className="cardBoxHint">
      شانسِ هر سطح بالا نوشته شده و برای همه یکسان است. کارت‌ها به کلکسیون اضافه
      می‌شوند و در دوئل قابل بازی‌اند.
    </p>

    {error && <p className="cardBoxErr">{error}</p>}

    {phase === 'revealing' && won && won.length > 0 && (
      <div className="cardBoxReveal" role="dialog" aria-label="کارت‌های صندوق">
        <div className="cardBoxRevealInner">
          <h4 className="cardBoxRevealTitle">صندوق باز شد</h4>
          <p className="cardBoxRevealSub">
            <span className="cardBoxTotal">{fa(won.length)} کارت</span> به کلکسیونت اضافه شد
            {wonMeta?.points > 0 && <>
              {' · '}
              <span className="cardBoxTotalPts">{fa(wonMeta.points)} امتیاز</span>
            </>}
          </p>
          {wonMeta?.distinct && <p className="cardBoxRevealNote">
            همهٔ کارت‌ها متفاوت‌اند — ترکیبت کامل است
          </p>}
          <div className="cardBoxDeck">
            {won.map((c, i) => {
              const meta = CARD_RARITY_META[c.rarity] || { label: c.rarity, accent: '#94A3B8' };
              return <div
                key={i}
                className={`cardBoxPrize cardBoxPrize--${c.rarity || 'normal'} ${i < revealed ? 'shown' : ''}`}
                style={{ '--accent': meta.accent }}
              >
                <span className="cardBoxPrizeTier">{meta.label}</span>
                {c.imageUrl && (
                  <img
                    className="cardBoxPrizeImg"
                    src={c.imageUrl.startsWith('http') ? c.imageUrl : API + c.imageUrl}
                    alt={c.name || 'کارت'}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <span className="cardBoxPrizeName">{c.name || 'کارت'}</span>
                <span className="cardBoxPrizePts">{fa(c.pointValue || 0)} امتیاز</span>
              </div>;
            })}
          </div>
          {revealed >= won.length && (
            <button type="button" className="cardBoxDone" onClick={closeReveal}>
              عالی
            </button>
          )}
        </div>
      </div>
    )}
  </section>;
}
