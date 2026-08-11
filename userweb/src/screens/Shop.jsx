import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { req, fa } from '../lib/api.js';
import { nameColorStyle } from '../components/Cosmetics.jsx';

const KINDS = [
  ['club_badge', 'باشگاه‌ها'],
  ['card_frame', 'قاب‌ها'],
  ['name_color', 'افکت نام'],
  ['profile_background', 'پس‌زمینه'],
  ['result_template', 'نتیجه'],
  ['match_effect', 'ورود و پایان'],
  ['emote_pack', 'پیام‌ها'],
];

function CategoryMark({ kind }) {
  const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (kind === 'club_badge') return <svg {...common}><path d="M12 2 20 5v6c0 5.2-3.4 9-8 11-4.6-2-8-5.8-8-11V5Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>;
  if (kind === 'card_frame') return <svg {...common}><rect x="4" y="2.5" width="16" height="19" rx="3"/><rect x="7" y="5.5" width="10" height="13" rx="2"/><path d="M4 8h3M17 16h3"/></svg>;
  if (kind === 'name_color') return <svg {...common}><path d="m5 19 5.5-14h3L19 19M7 14h10"/><path d="M4 22h16"/></svg>;
  if (kind === 'profile_background') return <svg {...common}><rect x="2.5" y="3" width="19" height="18" rx="3"/><circle cx="12" cy="9" r="3"/><path d="M6.5 18c1.3-3 3.1-4.5 5.5-4.5s4.2 1.5 5.5 4.5"/></svg>;
  if (kind === 'result_template') return <svg {...common}><rect x="2.5" y="4" width="19" height="16" rx="3"/><path d="M7 9h3M14 9h3M11 15h2"/><path d="M10 7v4M14 7v4"/></svg>;
  if (kind === 'match_effect') return <svg {...common}><path d="m12 2 1.5 5.2L19 5l-2.2 5.5L22 12l-5.2 1.5L19 19l-5.5-2.2L12 22l-1.5-5.2L5 19l2.2-5.5L2 12l5.2-1.5L5 5l5.5 2.2Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
  return <svg {...common}><path d="M4 4h16v12H9l-5 4Z"/><path d="M8 9h8M8 12h5"/></svg>;
}

function money(value) { return `${fa(Number(value || 0))} تومان`; }

const EMOTE_COPY = {
  emote_respect: ['بازی خوبی بود', 'دوباره؟'],
  emote_comeback: ['این یکی شانسی بود!', 'آماده جبران باش'],
  emote_goal_club: ['گوووول! ⚽', 'باشگاه من همیشه آماده‌ست!'],
};

function CosmeticPreview({ item }) {
  // All 55 non-club SKUs have dedicated artwork; club products use their real
  // crest. Same-origin public assets avoid the old API-host 404 regression.
  const src = item.kind === 'club_badge'
    ? item.image_url
    : `/shop/cosmetics-v3/${item.slug}.webp`;
  const colorKey = item.payload || item.slug;
  const messages = Array.isArray(item.metadata?.messages)
    ? item.metadata.messages.slice(0, 2)
    : (EMOTE_COPY[item.slug] || []);
  return <div className={`shopArtwork art-${item.kind} art-${item.slug}`}>
    <img className="shopArtworkImage" src={src} alt={`تصویر ${item.name}`} loading="lazy" decoding="async" />
    {item.kind === 'name_color' && <strong className="shopNameSample" style={nameColorStyle(colorKey)}>قلقلی</strong>}
    {item.kind === 'result_template' && <div className="shopResultSample"><small>پایان بازی</small><b><span>۳</span><i>–</i><span>۲</span></b><em>MVP</em></div>}
    {item.kind === 'emote_pack' && <div className="shopEmoteSample">{messages.map((message, index) => <span key={message} className={index ? 'alt' : ''}>{message}</span>)}</div>}
  </div>;
}

function PlanCard({ plan, activeTier, busy, onBuy }) {
  const annual = plan.billingCycle === 'annual';
  const active = activeTier === plan.billingCycle;
  return <article className={`shopPlan ${annual ? 'annual' : ''} ${active ? 'active' : ''}`}>
    <div className="shopPlanHead">
      <div><small>{annual ? 'بیشترین ارزش' : 'انعطاف ماهانه'}</small><h3>{plan.label}</h3></div>
      {annual ? <b className="saveBadge">حدود ۳۰٪ صرفه‌جویی</b> : <b>۳۰ روز</b>}
    </div>
    <strong className="planPrice">{money(plan.price)} <small>/ {annual ? 'سال' : 'ماه'}</small></strong>
    {annual && <div className="annualCompare">به‌جای {money(59000 * 12)} پرداخت ماهانه</div>}
    <div className="planVisuals" aria-label="نمونه مزایای ظاهری پلن">
      {(annual ? ['annual_royal_frame','annual_royal_result'] : ['blue_fire','gold_gradient']).map((slug) =>
        <img key={slug} src={`/shop/cosmetics-v3/${slug}.webp`} alt="" />)}
      <span>{annual ? 'عنوان دائمی ستاره سالانه' : 'قاب و افکت نام در همه‌جا'}</span>
    </div>
    <ul>{(plan.benefits || []).slice(0, annual ? 9 : 5).map((b) => <li key={b}>✓ {b}</li>)}</ul>
    <button type="button" disabled={busy} onClick={() => onBuy(plan.billingCycle)}>
      {busy ? 'در حال ثبت…' : active ? 'تمدید همین پلن' : `خرید ${plan.label}`}
    </button>
  </article>;
}

function ShopItem({ item, busy, onBuy, onEquip }) {
  const canEquip = item.usable;
  const annualGift = item.access_tier === 'annual';
  return <article className={`shopProduct ${item.equipped ? 'equipped' : ''}`}>
    <CosmeticPreview item={item} />
    <div className="shopProductBody">
      <div className="shopProductTitle"><h3>{item.name}</h3>{item.equipped && <span>فعال</span>}</div>
      <p>{item.description}</p>
      <div className="shopProductFoot">
        <strong>{annualGift ? 'هدیه سالانه' : item.owned ? 'خریداری شده' : money(item.price)}</strong>
        {canEquip ? (
          <button type="button" className={item.equipped ? 'secondary' : ''} disabled={busy || item.equipped}
            onClick={() => onEquip(item)}>{item.equipped ? 'انتخاب‌شده' : 'انتخاب'}</button>
        ) : annualGift ? <span className="lockedGift">🔒 اختصاصی</span> : (
          <button type="button" disabled={busy} onClick={() => onBuy(item)}>{busy ? '…' : 'خرید'}</button>
        )}
      </div>
      {item.unlockedByPlus && !item.owned && <small className="plusAccess">با پلاس در دسترس است</small>}
    </div>
  </article>;
}

export default function Shop({ token, reloadProfile }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeKind, setActiveKind] = useState('card_frame');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showPlans, setShowPlans] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const [catalogue, purchases] = await Promise.all([
        req('/api/shop', 'GET', null, token),
        req('/api/shop/history?limit=24', 'GET', null, token),
      ]);
      setData(catalogue); setHistory(Array.isArray(purchases) ? purchases : []); setError('');
    } catch (e) { setError(e.message || 'فروشگاه در دسترس نیست'); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const availableKinds = useMemo(() => KINDS.filter(([key]) => (data?.groups?.[key] || []).length), [data]);
  useEffect(() => {
    if (data && !(data.groups?.[activeKind] || []).length && availableKinds[0]) setActiveKind(availableKinds[0][0]);
  }, [data, activeKind, availableKinds]);

  const act = async (key, request, success) => {
    if (busy) return;
    setBusy(key); setNotice('');
    try {
      await request(); setNotice(success); await load(); await reloadProfile?.();
    } catch (e) { setNotice(e.message || 'عملیات انجام نشد'); }
    finally { setBusy(''); }
  };

  const buyPlan = (billingCycle) => act(`plus-${billingCycle}`,
    () => req('/api/shop/plus', 'POST', { billingCycle }, token),
    billingCycle === 'annual' ? 'پلاس سالانه و هدیه‌های دائمی فعال شد' : 'پلاس ماهانه فعال شد');
  const buyItem = (item) => act(`buy-${item.id}`,
    () => req(`/api/shop/items/${item.id}/buy`, 'POST', {}, token), `${item.name} به کلکسیونت اضافه شد`);
  const equipItem = (item) => act(`equip-${item.id}`,
    () => req('/api/shop/equip', 'POST', { slug: item.slug, kind: item.kind }, token), `${item.name} فعال شد`);

  if (!data && !error) return <div className="card pad center muted">در حال چیدن ویترین…</div>;
  if (!data) return <div className="card pad center"><p className="err">{error}</p><button onClick={load}>تلاش دوباره</button></div>;
  const current = data.groups?.[activeKind] || [];

  return <div className="shopCompact" dir="rtl">
    <style>{`
      .shopCompact{max-width:1040px;margin:0 auto;padding:0 12px 90px;color:#fff;display:grid;gap:12px}
      .shopHero{position:relative;overflow:hidden;border:1px solid rgba(255,209,102,.3);border-radius:22px;padding:17px;background:radial-gradient(circle at 10% 0,rgba(124,58,237,.3),transparent 38%),linear-gradient(135deg,#0b1c2d,#10172e 60%,#26123b);box-shadow:0 18px 55px rgba(0,0,0,.24)}
      .shopHero:after{content:'+';position:absolute;left:28px;top:-48px;font:900 180px/1 sans-serif;color:rgba(255,209,102,.06);transform:rotate(10deg)}
      .shopHeroTop{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px}.shopHero h2{margin:0;font-weight:950;font-size:23px}.shopHero p{margin:4px 0 0;color:#b9c5d5;font-size:11.5px}.shopWallet{white-space:nowrap;background:rgba(0,0,0,.28);border:1px solid rgba(34,231,166,.35);padding:8px 12px;border-radius:14px;color:#22E7A6;font-weight:900}.shopToggle{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:11px;padding:7px 10px;cursor:pointer}
      .shopPlans{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}.shopPlan{border:1px solid rgba(255,255,255,.12);border-radius:17px;padding:13px;background:rgba(5,14,26,.78);min-height:224px;display:flex;flex-direction:column}.shopPlan.annual{border-color:rgba(255,209,102,.54);background:linear-gradient(145deg,rgba(64,38,9,.78),rgba(30,20,67,.82))}.shopPlan.active{box-shadow:0 0 0 2px rgba(34,231,166,.28)}.shopPlanHead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.shopPlanHead small{color:#94a3b8;font-size:9.5px}.shopPlanHead h3{margin:1px 0;font-size:16px}.shopPlanHead>b{font-size:10px;color:#94a3b8}.saveBadge{color:#071522!important;background:#FFD166;padding:5px 7px;border-radius:999px}.planPrice{color:#FFD166;font-size:20px;margin:7px 0}.planPrice small{font-size:10px;color:#cbd5e1}.annualCompare{font-size:9.5px;color:#cbd5e1;margin-top:-5px}.planVisuals{display:grid;grid-template-columns:70px 70px 1fr;gap:6px;align-items:center;margin:8px 0;padding:6px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}.planVisuals img{width:70px;height:40px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,.12)}.planVisuals span{font-size:9px;line-height:1.45;color:#dbeafe;font-weight:800}.shopPlan ul{list-style:none;padding:0;margin:8px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 9px;font-size:9.7px;color:#dbe6f2;flex:1}.shopPlan li{line-height:1.55}.shopPlan li::first-letter{color:#22E7A6}.shopPlan button,.shopProduct button{border:0;border-radius:11px;padding:9px 12px;background:linear-gradient(135deg,#22E7A6,#38BDF8);color:#071522;font-weight:950;cursor:pointer}.shopPlan button:disabled,.shopProduct button:disabled{opacity:.55;cursor:default}
      .shopNotice{border-radius:12px;padding:9px 12px;background:rgba(56,189,248,.11);border:1px solid rgba(56,189,248,.28);font-size:11.5px;text-align:center}.shopPlans,.shopNav,.shopCarousel{scrollbar-width:none;-ms-overflow-style:none}.shopPlans::-webkit-scrollbar,.shopNav::-webkit-scrollbar,.shopCarousel::-webkit-scrollbar{display:none}.shopNav{display:flex;gap:7px;overflow-x:auto;padding:3px 1px 7px}.shopNav button{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#aebed0;border-radius:13px;padding:8px 11px;font-size:11px;font-weight:850;cursor:pointer}.shopNav button.active{color:#071522;border-color:#38BDF8;background:#38BDF8;box-shadow:0 6px 18px rgba(56,189,248,.24)}
      .shopShelf{border:1px solid rgba(255,255,255,.09);background:rgba(7,21,34,.6);border-radius:20px;padding:13px;overflow:hidden}.shopShelfHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.shopShelfHead h3{margin:0;font-size:14px}.shopShelfHead span{font-size:10px;color:#94a3b8}.shopCarousel{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,31%);gap:10px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 1px 9px}.shopProduct{scroll-snap-align:start;overflow:hidden;border-radius:18px;border:1px solid rgba(255,255,255,.11);background:linear-gradient(155deg,rgba(255,255,255,.075),rgba(255,255,255,.025));min-height:282px;display:flex;flex-direction:column;box-shadow:0 14px 35px rgba(0,0,0,.22);transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}.shopProduct:hover{transform:translateY(-3px);border-color:rgba(56,189,248,.38);box-shadow:0 18px 42px rgba(0,0,0,.3)}.shopProduct.equipped{border-color:rgba(34,231,166,.7);box-shadow:0 0 0 1px rgba(34,231,166,.2),0 18px 42px rgba(34,231,166,.08)}.shopArtwork{height:144px;position:relative;border-bottom:1px solid rgba(255,255,255,.1);overflow:hidden;background:#03070d}.shopArtworkImage{display:block;width:100%;height:100%;object-fit:cover;filter:saturate(1.14) brightness(1.08) contrast(1.04);transition:transform .35s ease}.art-card_frame .shopArtworkImage{transform:scale(1.12)}.art-match_effect .shopArtworkImage{transform:scale(1.05)}.art-result_template .shopArtworkImage{transform:scale(1.02)}.shopProduct:hover .art-card_frame .shopArtworkImage{transform:scale(1.16)}.shopProduct:hover .art-match_effect .shopArtworkImage{transform:scale(1.09)}.shopProduct:hover .art-result_template .shopArtworkImage{transform:scale(1.06)}.shopProduct:hover .shopArtworkImage{filter:saturate(1.22) brightness(1.12)}.art-club_badge .shopArtworkImage{object-fit:contain;padding:10px;background:radial-gradient(circle,rgba(255,255,255,.1),transparent 62%),#071522}.shopNameSample{position:absolute;z-index:2;inset-inline:34px;top:50%;transform:translateY(-50%);text-align:center;font-size:24px!important;line-height:1.2;letter-spacing:-.5px;filter:drop-shadow(0 3px 8px rgba(0,0,0,.9))}.art-digital_typing .shopNameSample:after{content:'|';margin-inline-start:3px;color:#67E8F9;-webkit-text-fill-color:#67E8F9;animation:shopCursor 1s steps(1) infinite}.shopResultSample{position:absolute;z-index:2;left:50%;top:50%;transform:translate(-50%,-48%);display:flex;flex-direction:column;align-items:center;color:#fff;text-shadow:0 3px 12px #000;pointer-events:none}.shopResultSample small{font-size:7px;letter-spacing:.4px;color:#dbeafe}.shopResultSample b{display:flex;direction:ltr;align-items:center;gap:12px;font-size:31px;line-height:1;font-weight:950}.shopResultSample i{font-style:normal;color:#fff9;font-size:18px}.shopResultSample em{font-style:normal;font-size:6.5px;font-weight:900;letter-spacing:2px;color:#FFD166;margin-top:4px}.shopEmoteSample{position:absolute;z-index:2;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px 55px;pointer-events:none}.shopEmoteSample span{max-width:100%;padding:7px 13px;border-radius:14px 14px 4px 14px;background:rgba(248,250,252,.95);color:#0f172a;font-size:9px;font-weight:950;box-shadow:0 7px 18px #0008;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.shopEmoteSample span.alt{align-self:flex-start;background:linear-gradient(135deg,#FFD166,#F59E0B);border-radius:14px 14px 14px 4px;color:#301600}.shopProductBody{padding:11px;display:flex;flex-direction:column;flex:1}.shopProductTitle{display:flex;align-items:center;justify-content:space-between;gap:6px}.shopProduct h3{margin:0;font-size:13.5px}.shopProductTitle span{font-size:9px;background:rgba(34,231,166,.15);color:#22E7A6;border-radius:999px;padding:3px 7px}.shopProduct p{color:#9cabbc;font-size:10px;line-height:1.6;margin:6px 0;min-height:28px}.shopProductFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.shopProductFoot strong{color:#FFD166;font-size:11px}.shopProduct button{font-size:10px;padding:7px 11px}.shopProduct button.secondary{background:#1e293b;color:#94a3b8}.plusAccess{display:block;color:#38BDF8;font-size:9px;margin-top:6px}.lockedGift{font-size:9px;color:#c4b5fd}.shopDisclosure{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#94a3b8;font-size:10.5px;padding:3px 5px}.shopDisclosure button{border:0;background:none;color:#38BDF8;cursor:pointer}.historyPanel{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px;background:rgba(255,255,255,.025);display:grid;gap:5px}.historyRow{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:9px;background:rgba(255,255,255,.035);font-size:10px}.historyRow span{color:#94a3b8}
      @keyframes shopCursor{0%,48%{opacity:1}49%,100%{opacity:0}}
      @media(max-width:720px){.shopHeroTop{align-items:flex-start;flex-wrap:wrap}.shopHero h2{font-size:19px}.shopPlans{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:96%;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:5px}.shopPlan{min-height:285px;scroll-snap-align:center}.shopPlan ul{grid-template-columns:1fr 1fr}.shopCarousel{grid-auto-columns:minmax(245px,84%)}.shopWallet{font-size:11px}.shopHero{padding:13px}.shopShelf{padding:10px}}
      @media(max-width:410px){.shopPlan ul{grid-template-columns:1fr}.shopCarousel{grid-auto-columns:96%}}
    `}</style>

    <section className="shopHero">
      <div className="shopHeroTop">
        <div><h2>فروشگاه قلقلی پلاس</h2><p>نمونه واقعی هر آیتم را ببین · پلاس از {money(59000)} در ماه</p></div>
        <div className="shopWallet">کیف پول: {money(data.walletBalance)}</div>
        <button type="button" className="shopToggle" onClick={() => setShowPlans((v) => !v)}>{showPlans ? 'جمع کردن پلن‌ها' : 'دیدن پلن‌های پلاس'}</button>
      </div>
      {showPlans && <div className="shopPlans">{(data.plans || []).map((plan) => <PlanCard key={plan.billingCycle} plan={plan}
        activeTier={data.plus?.tier} busy={busy === `plus-${plan.billingCycle}`} onBuy={buyPlan} />)}</div>}
    </section>

    {notice && <div className="shopNotice">{notice}</div>}
    <nav className="shopNav" aria-label="دسته‌های فروشگاه">{availableKinds.map(([key, label]) => <button key={key}
      type="button" className={activeKind === key ? 'active' : ''} onClick={() => setActiveKind(key)}><CategoryMark kind={key} /> {label}</button>)}</nav>

    <section className="shopShelf">
      <div className="shopShelfHead"><h3>{KINDS.find(([k]) => k === activeKind)?.[1]}</h3><span>{fa(current.length)} انتخاب در این دسته</span></div>
      <div className="shopCarousel">{current.map((item) => <ShopItem key={item.id} item={item}
        busy={busy === `buy-${item.id}` || busy === `equip-${item.id}`} onBuy={buyItem} onEquip={equipItem} />)}</div>
    </section>

    <div className="shopDisclosure">
      <span>همه قیمت‌ها تومان است. آیتم‌ها فقط ظاهری‌اند و شانس برد یا امتیاز را تغییر نمی‌دهند.</span>
      <button type="button" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'بستن سوابق' : `سوابق خرید (${fa(history.length)})`}</button>
    </div>
    {showHistory && <section className="historyPanel">{history.length ? history.map((h) => <div className="historyRow" key={`${h.type}-${h.id}`}><b>{h.name}</b><span>{money(h.price_paid)} · {new Date(h.purchased_at).toLocaleDateString('fa-IR')}</span></div>) : <span className="muted">هنوز خریدی ثبت نشده است.</span>}</section>}
  </div>;
}
