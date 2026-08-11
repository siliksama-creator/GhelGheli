// 1:1 با اندروید dashboard_page.dart — داشبورد دقیقاً مثل اپ
import React, { useMemo, useState, useEffect } from 'react';
import { req, asset, fa, avatars, avatarUrl } from '../lib/api.js';
import { EmptyView } from '../components/states.jsx';
import PhotoCardBox from '../components/PhotoCardBox.jsx';
import LoginStreak from '../components/LoginStreak.jsx';

const asInt = v => {
  const n = parseInt(String(v ?? 0).split('.')[0], 10);
  return Number.isFinite(n) ? n : 0;
};
const sortDate = m => {
  const t = Date.parse(m.updated_at || m.created_at || '');
  return Number.isFinite(t) ? t : 0;
};
export function filterAndSort(items, query = '', sort = 'recent') {
  const q = String(query).trim().toLowerCase();
  const out = q ? items.filter(m => String(m.name || '').toLowerCase().includes(q)) : [...items];
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa');
  if (sort === 'recent') out.sort((a, b) => (sortDate(b) - sortDate(a)) || byName(a, b));
  else if (sort === 'value') out.sort((a, b) => (asInt(b.point_value) - asInt(a.point_value)) || byName(a, b));
  else out.sort(byName);
  return out;
}
export function collectionStats(items) {
  let total = 0; let points = 0;
  for (const m of items) { const q = asInt(m.quantity); total += q; points += q * asInt(m.point_value); }
  return { kinds: items.length, total, points };
}
export function isNewCard(item) {
  const t = Date.parse(item.updated_at || item.created_at || '');
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 48 * 3600 * 1000;
}
const SORTS = [['recent', 'تازه‌ترین'], ['value', 'باارزش‌ترین'], ['name', 'الفبا']];

function HeroHeader({ points, nickname, nextReward, user, cosmetics, onOpenProfile, onOpenWallet }) {
  const required = asInt(nextReward?.required_points);
  const remaining = required > points ? required - points : 0;
  const progress = required > 0 ? Math.min(1, points / required) : 0;
  const requiredFields = { first_name:'نام', last_name:'نام خانوادگی', age:'سن', province:'استان', city:'شهر', bank_account:'شماره کارت' };
  const missing = user ? Object.entries(requiredFields).filter(([k]) => !String(user[k]||'').trim()).map(([,v])=>v) : [];
  const done = Object.keys(requiredFields).length - missing.length;
  return (
    <div style={{ padding:'10px 10px 10px', borderRadius:'20px', background:'linear-gradient(135deg, #1A2B45, #111D30, #0A1220)', border:'1.2px solid rgba(255,215,0,0.28)', boxShadow:'0 8px 18px rgba(255,215,0,0.08), 0 8px 16px rgba(0,0,0,0.4)' }}>
      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
        <div onClick={onOpenProfile} style={{ flex:1, display:'flex', gap:'8px', alignItems:'center', cursor:'pointer' }}>
          <img src={user?.profile_image_url ? asset(user.profile_image_url) : avatarUrl(user?.profile_avatar_key)} alt="" decoding="async" style={{ width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover' }} />
          <div>
            <div style={{ color:'#FFF', fontWeight:'900', fontSize:'14.5px', display:'flex', alignItems:'center', gap:'4px' }}>
              سلام {nickname} {cosmetics?.plus && <span style={{ color:'#FFD700', textShadow:'0 0 8px #FFD700', fontSize:'13px' }}>★</span>}
            </div>
            <div style={{ color:'#CBD5E1', fontSize:'11px', fontWeight:'700', display:'flex', alignItems:'center', gap:'2px' }}>پروفایل من ‹</div>
          </div>
        </div>
        <div style={{ padding:'6px 10px', borderRadius:'13px', background:'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,159,67,0.08), rgba(0,0,0,0.14))', border:'1.2px solid rgba(255,215,0,0.5)', boxShadow:'0 4px 10px rgba(255,215,0,0.16)', textAlign:'right' }}>
          <div style={{ color:'#FFDF70', fontWeight:'900', fontSize:'18px', display:'flex', alignItems:'center', gap:'4px', justifyContent:'flex-end', textShadow:'0 0 6px rgba(255,179,0,0.4)' }}>{fa(points)} <span style={{ fontSize:'14px' }}>★</span></div>
          <div style={{ color:'#FFE599', fontWeight:'700', fontSize:'9.5px', textAlign:'right' }}>امتیاز کل</div>
        </div>
      </div>
      <div style={{ height:'5px', background:'rgba(255,255,255,0.12)', borderRadius:'99px', overflow:'hidden', marginTop:'8px' }}>
        <div style={{ width: `${progress*100}%`, height:'100%', background:'#22E7A6', transition:'width 0.5s' }} />
      </div>
      <div style={{ color:'rgba(255,255,255,0.7)', fontWeight:'700', fontSize:'10.5px', marginTop:'4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {nextReward ? (remaining===0 ? `به جایزه ${nextReward.name} رسیدی!` : `تا جایزه ${nextReward.name}: ${fa(remaining)} امتیاز`) : 'هنوز جایزه‌ای تعریف نشده است'}
      </div>
      {onOpenWallet && (
        <div className="walletEntry" onClick={onOpenWallet} style={{ marginTop:'8px', background:'rgba(0,0,0,0.28)', border:`1px solid ${asInt(user?.wallet_balance)>0?'rgba(255,211,107,0.5)':'rgba(255,255,255,0.15)'}`, borderRadius:'12px', padding:'6px 10px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
          <span style={{ width:'26px', height:'26px', borderRadius:'50%', background: asInt(user?.wallet_balance)>0 ? 'linear-gradient(135deg, #FFE9A8, #D4A227)' : 'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>💰</span>
          <span style={{ flex:1, color:'rgba(255,255,255,0.7)', fontSize:'10.5px', fontWeight:'600' }}>کیف پول من</span>
          <span style={{ color: asInt(user?.wallet_balance)>0 ? '#FFD36B' : '#FFF', fontWeight:'900', fontSize:'14px' }}>{fa(user?.wallet_balance||0)} <span style={{ fontSize:'9.5px', color:'rgba(255,211,107,0.8)' }}>تومان</span></span>
          <span style={{ background:'rgba(255,211,107,0.18)', color:'#FFD36B', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px', fontWeight:'800' }}>{asInt(user?.wallet_balance)>0?'برداشت':'مشاهده'} ‹</span>
        </div>
      )}
      {missing.length>0 && (
        <div onClick={onOpenProfile} style={{ marginTop:'6px', background:'rgba(0,0,0,0.25)', borderRadius:'8px', padding:'6px 8px', display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
          <span style={{ color:'#FFD36B', fontSize:'12px' }}>🪪</span>
          <span style={{ flex:1, color:'#FFF', fontSize:'10.5px', fontWeight:'700', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>تکمیل پروفایل ({done} از {Object.keys(requiredFields).length}): {missing.slice(0,2).join('، ')}{missing.length>2?` +${missing.length-2} مورد`:''}</span>
          <span style={{ color:'#FFD36B', fontSize:'10.5px', fontWeight:'800' }}>تکمیل ‹</span>
        </div>
      )}
    </div>
  );
}

function CardLightbox({ item, close }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={close}>
      <div style={{ background:'#0F172A', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'16px', padding:'16px', maxWidth:'90%', textAlign:'center' }} onClick={e=>e.stopPropagation()}>
        <button onClick={close} style={{ position:'absolute', top:'8px', right:'8px', background:'none', border:'none', color:'#FFF', fontSize:'20px', cursor:'pointer' }}>×</button>
        <img src={asset(item.image_url) || avatarUrl('avatar_1_football.png')} alt={item.name||'کارت'} style={{ maxWidth:'300px', borderRadius:'12px' }} />
        <h2 style={{ color:'#FFF', margin:'8px 0 4px' }}>{item.name||'کارت'}</h2>
        <p style={{ color:'#94A3B8' }}>تعداد: {fa(item.quantity)} — {fa(item.point_value)} امتیاز</p>
        {item.description && <p style={{ color:'#64748B', fontSize:'12px' }}>{item.description}</p>}
      </div>
    </div>
  );
}

export default function Home({ token, p, rewards, load, setMsg, openProfile, openWallet, openWheel, openInvite, openInventory }) {
  const [bigCard, setBigCard] = useState(null);
  const u = p.user;
  const sorted = [...rewards].sort((a,b)=>a.required_points-b.required_points);
  const next = sorted.find(r=>u.current_points < r.required_points) || sorted.at(-1);
  const inventory = p.inventory || [];
  const recentInventory = useMemo(
    () => filterAndSort(inventory, '', 'recent').slice(0, 6),
    [inventory],
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px', padding:'0 12px 80px' }}>
      <HeroHeader points={asInt(u.current_points)} nickname={u.nickname||u.mobile||'قهرمان'} nextReward={next} user={u} cosmetics={p.cosmetics} onOpenProfile={openProfile} onOpenWallet={openWallet} />

      <LoginStreak token={token} initialData={p.loginStreak} setMsg={setMsg} onClaimed={load} />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
        <button onClick={openWheel} style={{ background:'linear-gradient(135deg, #F59E0B22, #F59E0B0A)', border:'1px solid #F59E0B55', borderRadius:'16px', padding:'12px 6px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', boxShadow:'0 4px 12px #F59E0B22' }}>
          <span style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#F59E0B22', display:'flex', alignItems:'center', justifyContent:'center' }}><img src="/pass/wheel_icon.webp" alt="" style={{ width:'26px', height:'26px' }} /></span>
          <b style={{ color:'#FFF', fontSize:'12px', fontWeight:'900' }}>گردونه</b>
          <small style={{ color:'#F59E0B', fontSize:'10px', fontWeight:'700' }}>گردونه شانس</small>
        </button>
        <button onClick={openInvite} style={{ background:'linear-gradient(135deg, #84CC1622, #84CC160A)', border:'1px solid #84CC1655', borderRadius:'16px', padding:'12px 6px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', boxShadow:'0 4px 12px #84CC1622' }}>
          <span style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#84CC1622', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px' }}>👥</span>
          <b style={{ color:'#FFF', fontSize:'12px', fontWeight:'900' }}>دعوت</b>
          <small style={{ color:'#84CC16', fontSize:'10px', fontWeight:'700' }}>دوستان</small>
        </button>
        <button onClick={openInventory} style={{ background:'linear-gradient(135deg, #38BDF822, #38BDF80A)', border:'1px solid #38BDF855', borderRadius:'16px', padding:'12px 6px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', boxShadow:'0 4px 12px #38BDF822' }}>
          <span style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#38BDF822', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px' }}>🃏</span>
          <b style={{ color:'#FFF', fontSize:'12px', fontWeight:'900' }}>کلکسیون</b>
          <small style={{ color:'#38BDF8', fontSize:'10px', fontWeight:'700' }}>{fa(inventory.length)} نوع</small>
        </button>
      </div>

      <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'12px' }}>
        <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'8px' }}>
          <div style={{ width:'58px', height:'58px', borderRadius:'12px', background:'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(56,189,248,0.12))', border:'1px solid rgba(16,185,129,0.35)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <img src="/brand/card_scan_glow.png" alt="" style={{ width:'40px', height:'40px' }} onError={e=>e.currentTarget.style.display='none'} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <b style={{ color:'#FFF', fontSize:'14px', fontWeight:'900' }}>ثبت کارت‌های قلقلی</b>
              <span style={{ background:'rgba(245,158,11,0.16)', border:'1px solid rgba(245,158,11,0.45)', color:'#F59E0B', padding:'3px 8px', borderRadius:'99px', fontSize:'10px', fontWeight:'900' }}>کارت داری اینجا ثبت کن !</span>
            </div>
            <p style={{ color:'#CBD5E1', fontSize:'11.5px', margin:'4px 0 0', lineHeight:1.45, fontWeight:'600' }}>کارت‌های فیزیکی قلقلی را می‌توانید از فروشگاه‌ها و سوپرمارکت‌ها تهیه کنید</p>
          </div>
        </div>
        <PhotoCardBox token={token} setMsg={setMsg} onDone={load} />
      </div>

      <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'12px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
          <h2 style={{ color:'#FFF', fontSize:'16px', fontWeight:'900', margin:0 }}>کلکسیون من</h2>
          {inventory.length>6 && <button className="ghost" onClick={openInventory}
            style={{ color:'#38BDF8', fontSize:'12px', fontWeight:'700', margin:0, padding:'4px 8px' }}>
            همه ({fa(inventory.length)})
          </button>}
        </div>
        {inventory.length ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {recentInventory.map(i=>(
                  <button key={i.id} onClick={()=>setBigCard(i)} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'12px', padding:'6px', cursor:'pointer', textAlign:'center' }}>
                    <div style={{ position:'relative', aspectRatio:'0.66', background:'rgba(0,0,0,0.2)', borderRadius:'8px', overflow:'hidden', marginBottom:'6px' }}>
                      <img src={asset(i.image_url) || avatarUrl('avatar_1_football.png')} alt={i.name||'کارت'} loading="lazy" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      {isNewCard(i) && <span style={{ position:'absolute', top:'4px', right:'4px', background:'#22E7A6', color:'#000', padding:'2px 6px', borderRadius:'6px', fontSize:'9px', fontWeight:'900' }}>جدید</span>}
                      {asInt(i.quantity)>1 && <span style={{ position:'absolute', bottom:'4px', left:'4px', background:'rgba(0,0,0,0.6)', color:'#FFF', padding:'2px 6px', borderRadius:'6px', fontSize:'10px' }}>×{fa(i.quantity)}</span>}
                    </div>
                    <b style={{ color:'#FFF', fontSize:'11px', display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{i.name}</b>
                    <small style={{ color:'#94A3B8', fontSize:'10px' }}>{fa(i.point_value)} امتیاز</small>
                  </button>
            ))}
          </div>
        ) : (
          <div style={{ textAlign:'center', padding:'20px' }}>
            <div style={{ fontSize:'40px', marginBottom:'8px' }}>🃏</div>
            <b style={{ color:'#FFF' }}>هنوز کارتی در کلکسیون شما نیست</b>
            <p style={{ color:'#94A3B8', fontSize:'12px', marginTop:'4px' }}>یک کد کارت را ثبت کن یا از کارتت عکس بگیر تا اینجا نمایش داده شود.</p>
            <img src="/games/empty_collection.webp" alt="" style={{ width:'120px', opacity:0.6, marginTop:'12px' }} onError={e=>e.currentTarget.style.display='none'} />
          </div>
        )}
      </div>
      {bigCard && <CardLightbox item={bigCard} close={()=>setBigCard(null)} />}
    </div>
  );
}

