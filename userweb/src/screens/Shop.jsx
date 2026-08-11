import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { req, asset, fa } from '../lib/api.js';

const KINDS = [
  ['club_badge', 'باشگاه‌ها', '⚽'],
  ['card_frame', 'قاب‌ها', '🪄'],
  ['name_color', 'افکت نام', '✨'],
  ['profile_background', 'پس‌زمینه', '🌃'],
  ['result_template', 'نتیجه', '🏆'],
  ['match_effect', 'ورود و پایان', '🎉'],
  ['emote_pack', 'پیام‌ها', '💬'],
];

const FRAME_STYLES = {
  gold: ['#FFD166', '#F59E0B'], neon: ['#22E7A6', '#06B6D4'], fire: ['#F97316', '#EF4444'],
  ice: ['#BAE6FD', '#0284C7'], holo: ['#22D3EE', '#F472B6'], blue_fire: ['#38BDF8', '#1D4ED8'],
  stadium_frame: ['#22C55E', '#0EA5E9'], animated_gold: ['#FFF0A3', '#D97706'], club_neon: ['#C026D3', '#22D3EE'],
  season_champion: ['#FFD166', '#DC2626'], champions_night: ['#1D4ED8', '#A78BFA'],
  pro_holographic: ['#22D3EE', '#F472B6'], annual_royal_frame: ['#FFD166', '#7C3AED'],
};

const KIND_PREVIEW = {
  card_frame: '🛡️', name_color: 'قلقلی', profile_background: '👤',
  result_template: '۳ - ۲', match_effect: 'VS', emote_pack: '💬', club_badge: '⚽',
};

function money(value) { return `${fa(Number(value || 0))} تومان`; }

function palette(item) {
  const meta = item.metadata || {};
  if (Array.isArray(meta.palette) && meta.palette.length) return meta.palette;
  return FRAME_STYLES[item.payload || item.slug] || ['#38BDF8', '#7C3AED'];
}

function CosmeticPreview({ item }) {
  if (item.kind === 'club_badge' && item.image_url) {
    return <div className="shopArt"><img src={asset(item.image_url)} alt="" loading="lazy" /></div>;
  }
  const colors = palette(item);
  const icon = item.kind === 'emote_pack' ? (item.metadata?.icon || '💬') : KIND_PREVIEW[item.kind];
  return <div className={`shopArt art-${item.kind}`} style={{
    '--shopA': colors[0], '--shopB': colors[1] || colors[0],
    background: `radial-gradient(circle at 72% 22%, ${colors[1] || colors[0]}66, transparent 38%), linear-gradient(145deg, ${colors[0]}33, #071522 68%)`,
    borderColor: `${colors[0]}AA`, boxShadow: `inset 0 0 24px ${colors[0]}20, 0 8px 28px ${colors[1] || colors[0]}18`,
  }}><span>{icon}</span><i /></div>;
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
  const [showPlans, setShowPlans] = useState(true);
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
      .shopPlans{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}.shopPlan{border:1px solid rgba(255,255,255,.12);border-radius:17px;padding:13px;background:rgba(5,14,26,.78);min-height:224px;display:flex;flex-direction:column}.shopPlan.annual{border-color:rgba(255,209,102,.54);background:linear-gradient(145deg,rgba(64,38,9,.78),rgba(30,20,67,.82))}.shopPlan.active{box-shadow:0 0 0 2px rgba(34,231,166,.28)}.shopPlanHead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.shopPlanHead small{color:#94a3b8;font-size:9.5px}.shopPlanHead h3{margin:1px 0;font-size:16px}.shopPlanHead>b{font-size:10px;color:#94a3b8}.saveBadge{color:#071522!important;background:#FFD166;padding:5px 7px;border-radius:999px}.planPrice{color:#FFD166;font-size:20px;margin:7px 0}.planPrice small{font-size:10px;color:#cbd5e1}.annualCompare{font-size:9.5px;color:#cbd5e1;margin-top:-5px}.shopPlan ul{list-style:none;padding:0;margin:8px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 9px;font-size:9.7px;color:#dbe6f2;flex:1}.shopPlan li{line-height:1.55}.shopPlan li::first-letter{color:#22E7A6}.shopPlan button,.shopProduct button{border:0;border-radius:11px;padding:9px 12px;background:linear-gradient(135deg,#22E7A6,#38BDF8);color:#071522;font-weight:950;cursor:pointer}.shopPlan button:disabled,.shopProduct button:disabled{opacity:.55;cursor:default}
      .shopNotice{border-radius:12px;padding:9px 12px;background:rgba(56,189,248,.11);border:1px solid rgba(56,189,248,.28);font-size:11.5px;text-align:center}.shopNav{display:flex;gap:7px;overflow-x:auto;padding:3px 1px 7px;scrollbar-width:thin}.shopNav button{flex:0 0 auto;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#aebed0;border-radius:13px;padding:8px 11px;font-size:11px;font-weight:850;cursor:pointer}.shopNav button.active{color:#071522;border-color:#38BDF8;background:#38BDF8;box-shadow:0 6px 18px rgba(56,189,248,.24)}
      .shopShelf{border:1px solid rgba(255,255,255,.09);background:rgba(7,21,34,.6);border-radius:20px;padding:13px;overflow:hidden}.shopShelfHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.shopShelfHead h3{margin:0;font-size:14px}.shopShelfHead span{font-size:10px;color:#94a3b8}.shopCarousel{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,31%);gap:10px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 1px 9px;scrollbar-color:#334155 transparent}.shopProduct{scroll-snap-align:start;overflow:hidden;border-radius:17px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(155deg,rgba(255,255,255,.065),rgba(255,255,255,.025));min-height:296px;display:flex;flex-direction:column}.shopProduct.equipped{border-color:rgba(34,231,166,.65);box-shadow:inset 0 0 22px rgba(34,231,166,.07)}.shopArt{height:122px;position:relative;display:grid;place-items:center;border-bottom:1px solid rgba(255,255,255,.08);overflow:hidden}.shopArt img{width:82px;height:82px;object-fit:contain;filter:drop-shadow(0 8px 16px rgba(0,0,0,.5))}.shopArt>span{position:relative;z-index:1;font-size:39px;font-weight:950;text-shadow:0 5px 19px rgba(0,0,0,.65)}.art-name_color>span{font-size:22px;background:linear-gradient(90deg,var(--shopA),var(--shopB));color:transparent;background-clip:text;-webkit-background-clip:text}.shopArt>i{position:absolute;width:80px;height:80px;border:3px solid var(--shopA);border-radius:24px;transform:rotate(10deg);opacity:.45;filter:drop-shadow(0 0 8px var(--shopB))}.art-profile_background>i{width:150px;height:80px;border-radius:50% 50% 16px 16px}.art-emote_pack>i{border-radius:50%}.shopProductBody{padding:11px;display:flex;flex-direction:column;flex:1}.shopProductTitle{display:flex;align-items:center;justify-content:space-between;gap:6px}.shopProduct h3{margin:0;font-size:13.5px}.shopProductTitle span{font-size:9px;background:rgba(34,231,166,.15);color:#22E7A6;border-radius:999px;padding:3px 7px}.shopProduct p{color:#9cabbc;font-size:10px;line-height:1.6;margin:6px 0;min-height:32px}.shopProductFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.shopProductFoot strong{color:#FFD166;font-size:11px}.shopProduct button{font-size:10px;padding:7px 11px}.shopProduct button.secondary{background:#1e293b;color:#94a3b8}.plusAccess{display:block;color:#38BDF8;font-size:9px;margin-top:6px}.lockedGift{font-size:9px;color:#c4b5fd}.shopDisclosure{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#94a3b8;font-size:10.5px;padding:3px 5px}.shopDisclosure button{border:0;background:none;color:#38BDF8;cursor:pointer}.historyPanel{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px;background:rgba(255,255,255,.025);display:grid;gap:5px}.historyRow{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:9px;background:rgba(255,255,255,.035);font-size:10px}.historyRow span{color:#94a3b8}
      @media(max-width:720px){.shopHeroTop{align-items:flex-start;flex-wrap:wrap}.shopHero h2{font-size:19px}.shopPlans{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:96%;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:5px}.shopPlan{min-height:285px;scroll-snap-align:center}.shopPlan ul{grid-template-columns:1fr 1fr}.shopCarousel{grid-auto-columns:minmax(245px,84%)}.shopWallet{font-size:11px}.shopHero{padding:13px}.shopShelf{padding:10px}}
      @media(max-width:410px){.shopPlan ul{grid-template-columns:1fr}.shopCarousel{grid-auto-columns:91%}}
    `}</style>

    <section className="shopHero">
      <div className="shopHeroTop">
        <div><h2>فروشگاه قلقلی پلاس</h2><p>ظاهر حرفه‌ای، بدون قدرت رقابتی؛ خریدها دائمی‌اند مگر مزیت اشتراک.</p></div>
        <div className="shopWallet">کیف پول: {money(data.walletBalance)}</div>
        <button type="button" className="shopToggle" onClick={() => setShowPlans((v) => !v)}>{showPlans ? 'جمع کردن پلن‌ها' : 'دیدن پلن‌های پلاس'}</button>
      </div>
      {showPlans && <div className="shopPlans">{(data.plans || []).map((plan) => <PlanCard key={plan.billingCycle} plan={plan}
        activeTier={data.plus?.tier} busy={busy === `plus-${plan.billingCycle}`} onBuy={buyPlan} />)}</div>}
    </section>

    {notice && <div className="shopNotice">{notice}</div>}
    <nav className="shopNav" aria-label="دسته‌های فروشگاه">{availableKinds.map(([key, label, icon]) => <button key={key}
      type="button" className={activeKind === key ? 'active' : ''} onClick={() => setActiveKind(key)}>{icon} {label}</button>)}</nav>

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
