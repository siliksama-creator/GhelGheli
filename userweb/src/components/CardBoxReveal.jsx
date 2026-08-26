import React, { useEffect, useRef, useState } from 'react';
import { fa, API, req } from '../lib/api.js';
import { CARD_RARITY_META } from '../lib/cards.js';
import { play, playShake, stopShake, warmup } from '../gameAudio.js';

// صدای رونمایی هر سطح — همان جدول خرید صندوق. جدا بودنش یعنی جایزهٔ
// گردونه و خرید فروشگاه حس دو بازیِ متفاوت ندهند.
const REVEAL_SFX = {
  normal: 'card_normal', silver: 'card_silver', gold: 'card_gold',
  premium: 'card_premium', legend: 'card_legend',
};

const REVEAL_CSS = `
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
  .cardBoxTotalPts{font-size:12px;color:#FFC24B;font-weight:900}
  .cardBoxRevealNote{margin:2px 0 0;text-align:center;font-size:10.5px;
    color:#7ee0b8;animation:cbFade .4s ease both}
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
  .grantChestStage{position:relative;width:min(220px,70vw);aspect-ratio:1;display:grid;place-items:center}
  .grantChestGlow{position:absolute;width:88%;height:88%;border-radius:50%;
    background:radial-gradient(circle,rgba(255,209,102,.45),rgba(249,115,22,.16) 45%,transparent 70%);
    filter:blur(9px)}
  .grantChestImg{position:relative;width:100%;height:100%;object-fit:contain;
    filter:drop-shadow(0 12px 20px rgba(0,0,0,.5))}
  .grantChestStage.shaking .grantChestImg{animation:cbShake .16s linear infinite}
  .grantChestStage.bursting .grantChestImg{animation:cbPop .55s cubic-bezier(.2,1.5,.4,1) both}
  @keyframes cbShake{0%,100%{transform:translate(0,0) rotate(0)}
    20%{transform:translate(-3px,1px) rotate(-3deg)}40%{transform:translate(3px,-1px) rotate(3deg)}
    60%{transform:translate(-2px,-2px) rotate(-2deg)}80%{transform:translate(2px,2px) rotate(2deg)}}
  @keyframes cbPop{0%{transform:scale(.86)}60%{transform:scale(1.13)}100%{transform:scale(1)}}
  .grantChestBtn{border:0;border-radius:14px;padding:10px 18px;font-weight:950;
    font-size:13px;cursor:pointer;color:#1a0f02;margin-inline-end:8px;margin-bottom:6px;
    background:linear-gradient(135deg,#FFE9A8,#FFD166 40%,#F97316)}
  .grantChestBtn:disabled{opacity:.6;cursor:default}
  @media(max-width:560px){.cardBoxPrize{width:86px}}
  @media(prefers-reduced-motion:reduce){
    .cardBoxPrize.shown,.grantChestStage.shaking .grantChestImg,.grantChestStage.bursting .grantChestImg{animation:none}
    .cardBoxPrize.shown{opacity:1;transform:none}
  }
`;

/**
 * رونمایی تمام‌صفحهٔ کارت‌های صندوق.
 *
 * از خرید فروشگاه و از جایزهٔ گردونه/لیگ یک شکل دیده می‌شود. قبلاً مسیر
 * جایزه فقط نام کارت را در یک ردیف می‌نوشت — یعنی همان لحظه‌ای که باید
 * حس «باز شدن» بدهد، تبدیل به رسید حسابداری می‌شد.
 */
export function CardBoxReveal({ cards, points, distinct, revealed, onClose, title }) {
  const list = Array.isArray(cards) ? cards : [];
  return (
    <div className="cardBoxReveal" role="dialog" aria-label="کارت‌های صندوق">
      <style>{REVEAL_CSS}</style>
      <div className="cardBoxRevealInner">
        <h4 className="cardBoxRevealTitle">{title || 'صندوق باز شد'}</h4>
        <p className="cardBoxRevealSub">
          <span className="cardBoxTotal">{fa(list.length)} کارت</span> به کلکسیونت اضافه شد
          {Number(points) > 0 && <>
            {' · '}
            <span className="cardBoxTotalPts">{fa(points)} امتیاز</span>
          </>}
        </p>
        {distinct && <p className="cardBoxRevealNote">
          همهٔ کارت‌ها متفاوت‌اند — ترکیبت کامل است
        </p>}
        <div className="cardBoxDeck">
          {list.map((c, i) => {
            const meta = CARD_RARITY_META[c.rarity] || { label: c.rarity, accent: '#94A3B8' };
            const src = c.imageUrl || c.image_url || '';
            return <div
              key={i}
              className={`cardBoxPrize cardBoxPrize--${c.rarity || 'normal'} ${i < revealed ? 'shown' : ''}`}
              style={{ '--accent': meta.accent }}
            >
              <span className="cardBoxPrizeTier">{meta.label}</span>
              {src && (
                <img
                  className="cardBoxPrizeImg"
                  src={src.startsWith('http') ? src : API + src}
                  alt={c.name || 'کارت'}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <span className="cardBoxPrizeName">{c.name || 'کارت'}</span>
              <span className="cardBoxPrizePts">{fa(c.pointValue || c.point_value || 0)} امتیاز</span>
            </div>;
          })}
        </div>
        {revealed >= list.length && (
          <button type="button" className="cardBoxDone" onClick={onClose}>
            عالی
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * دکمهٔ باز کردن صندوق جایزه + همان انیمیشن خرید.
 *
 * ── چرا این کامپوننت جدا از CardBox است ──
 *
 * CardBox سفارش می‌سازد و از کافه‌بازار/کیف پول پول می‌گیرد. جایزهٔ
 * گردونه و لیگ قبلاً مال کاربر است؛ فقط باید باز شود. اگر همان بنر خرید
 * را نشان می‌دادیم، کاربر فکر می‌کرد باید دوباره پول بدهد.
 */
export function GrantChestOpener({
  token, grantId, label, disabled, onBusy, onOpened,
}) {
  const [phase, setPhase] = useState('idle');
  const [won, setWon] = useState(null);
  const [wonMeta, setWonMeta] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState('');
  const timers = useRef([]);
  const resultRef = useRef(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { clearTimers(); stopShake(); }, []);

  const close = () => {
    clearTimers();
    stopShake();
    setPhase('idle');
    setWon(null);
    setWonMeta(null);
    setRevealed(0);
    // ── چرا onOpened اینجاست، نه همان لحظهٔ جواب سرور ──
    //
    // کلکسیون بعد از باز شدن، grant را از فهرست pending حذف می‌کند.
    // اگر همان لحظهٔ POST صدا می‌زدیم، همین دکمه (و overlay رویش)
    // وسط لرزش unmount می‌شد و کاربر فقط یک فلش می‌دید. جایزه روی
    // سرور همان لحظه باز شده؛ تازه کردنِ لیست می‌تواند صبر کند تا
    // کارت‌ها دیده شوند.
    const r = resultRef.current;
    resultRef.current = null;
    if (r) onOpened?.(r);
  };

  const open = async () => {
    if (!grantId || disabled || phase !== 'idle') return;
    setError('');
    setWon(null);
    setWonMeta(null);
    setRevealed(0);
    setPhase('shaking');
    onBusy?.(grantId);
    warmup(['box_shake', 'box_open', 'card_normal', 'card_silver', 'card_gold', 'card_premium', 'card_legend']);
    play('box_open');
    playShake();
    const t0 = Date.now();
    try {
      const r = await req(`/api/grants/${grantId}/open`, 'POST', {}, token);
      const cards = r?.cards || [];
      setWon(cards);
      setWonMeta({
        points: Number(r?.points || 0),
        distinct: r?.distinctCards === true,
      });
      onOpened?.(r);
      const shakeRemain = Math.max(0, 3000 - (Date.now() - t0));
      later(() => {
        stopShake();
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
      stopShake();
      setError(e.message || 'باز کردن صندوق ناموفق بود');
      setPhase('idle');
    } finally {
      onBusy?.(null);
    }
  };

  const openChest = phase === 'bursting' || phase === 'revealing';

  return (
    <>
      <style>{REVEAL_CSS}</style>
      <button type="button" className="grantChestBtn"
        disabled={disabled || phase !== 'idle'}
        onClick={open}>
        {phase !== 'idle' ? 'در حال باز کردن…' : (label || 'باز کردن صندوق')}
      </button>
      {error && <p style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</p>}
      {phase !== 'idle' && phase !== 'revealing' && (
        <div className="cardBoxReveal" role="dialog" aria-label="باز کردن صندوق">
          <div className="cardBoxRevealInner">
            <div className={`grantChestStage ${phase}`}>
              <span className="grantChestGlow" />
              <img
                className="grantChestImg"
                src={openChest ? '/shop/card_box_open.webp' : '/shop/card_box_closed.webp'}
                alt="صندوق کارت"
                width={220}
                height={220}
              />
            </div>
            <h4 className="cardBoxRevealTitle">
              {phase === 'shaking' ? 'صندوق داره باز می‌شه…' : 'صندوق باز شد'}
            </h4>
          </div>
        </div>
      )}
      {phase === 'revealing' && won && (
        <CardBoxReveal
          cards={won}
          points={wonMeta?.points || 0}
          distinct={wonMeta?.distinct}
          revealed={revealed}
          onClose={close}
        />
      )}
    </>
  );
}
