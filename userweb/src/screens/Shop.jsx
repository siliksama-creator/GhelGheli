// 1:1 با اندروید shop_page.dart — فروشگاه دقیقاً مثل اپ
import React, { useCallback, useState } from 'react';
import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection } from '../components/states.jsx';
import { FRAME_STYLE, clubImg } from '../components/Cosmetics.jsx';

export default function Shop({ token, setMsg, reloadProfile }) {
  const load = useCallback(() => req('/api/shop', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [plusConfirm, setPlusConfirm] = useState(false);
  const [avatarOffer, setAvatarOffer] = useState(null);

  async function run(fn, key) {
    if (busy) return;
    setBusy(key);
    try {
      const d = await fn();
      setMsg?.(d.message);
      state.reload();
      reloadProfile?.();
      return d;
    } catch (e) { setMsg?.(e.message); } finally { setBusy(null); setConfirm(null); setPlusConfirm(false); }
  }
  const buy = async (it) => {
    const d = await run(() => req(`/api/shop/items/${it.id}/buy`, 'POST', {}, token), it.id);
    if (d?.joinedClub) setAvatarOffer({ slug: d.joinedClub, name: it.name });
  };
  const equip = (slug, kind) => run(() => req('/api/shop/equip', 'POST', { slug, kind }, token), 'equip' + (slug||kind));
  const buyPlus = () => run(() => req('/api/shop/plus', 'POST', {}, token), 'plus');
  const useAsAvatar = club => run(() => req('/api/shop/club-avatar', 'POST', { club }, token), 'avatar');

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری فروشگاه...">
      {d => {
        const equippedFor = k => k==='club_badge'?d.equipped.club : k==='card_frame'?d.equipped.frame : d.equipped.color;
        const KINDS = [
          ['club_badge','باشگاه‌ها','با خرید نشان، عضو دائمی باشگاه می‌شوی؛ اسمت در فهرست هواداران آن باشگاه می‌آید و می‌توانی نشان را عکس پروفایلت کنی.'],
          ['card_frame','قاب کارت','دور کارت‌های داخل پروفایلت'],
          ['name_color','رنگ اسم','رنگ اسمت در جدول لیگ و چت'],
        ];
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:'16px', maxWidth:'820px', margin:'0 auto', padding:'0 12px 80px' }}>
            <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'16px' }}>
              <h2 style={{ color:'#FFF', fontWeight:'900', margin:'0 0 6px' }}> فروشگاه قلقلی</h2>
              <p style={{ color:'#CBD5E1', fontSize:'12.5px', lineHeight:1.6 }}>هر آیتمی که <b>جداگانه</b> بخری، برای همیشه مال توست — با تمام شدن اشتراک هم از بین نمی‌رود. آیتم‌ها فقط ظاهر بازی را عوض می‌کنند.</p>
              <p style={{ color:'#94A3B8', fontSize:'11px', marginTop:'6px' }}>موجودی کیف پول: <b style={{ color:'#FFD36B' }}>{fa(d.balance)} تومان</b></p>
            </div>

            <div style={{ background: d.plus.active ? 'linear-gradient(135deg, #FFD70022, #FF9F4322)' : 'rgba(255,255,255,0.04)', border: d.plus.active ? '1.5px solid #FFD700' : '1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px' }}>
                <span style={{ fontSize:'28px', textShadow:'0 0 14px rgba(255,209,102,0.8)' }}>★</span>
                <div style={{ flex:1 }}>
                  <h2 style={{ color:'#FFF', fontWeight:'900', margin:0, fontSize:'16px' }}>قلقلی پلاس</h2>
                  <p style={{ color:'#94A3B8', fontSize:'11px', margin:0 }}>{d.plus.active ? `فعال — ${fa(d.plus.daysLeft)} روز باقی مانده` : `${fa(d.plus.days)} روز دسترسی به همهٔ آیتم‌ها`}</p>
                </div>
                <b style={{ color:'#FFD700', fontSize:'15px' }}>{fa(d.plus.price)} <i style={{ fontSize:'11px' }}>تومان</i></b>
              </div>
              <ul style={{ background:'rgba(0,0,0,0.2)', borderRadius:'12px', padding:'10px 16px', margin:'0 0 10px' }}>
                {(d.plus.perks||[]).map(p=><li key={p} style={{ color:'#E2E8F0', fontSize:'11.5px', margin:'4px 0' }}>• {p}</li>)}
              </ul>
              <div style={{ background:'rgba(255,211,107,0.08)', border:'1px solid rgba(255,211,107,0.2)', borderRadius:'10px', padding:'8px 10px', marginBottom:'10px' }}>
                <b style={{ color:'#FFD36B', fontSize:'11px' }}>بعد از پایان اشتراک چه می‌شود؟</b>
                <p style={{ color:'#CBD5E1', fontSize:'11px', margin:'4px 0 0' }}>{d.plus.expiryNote}</p>
              </div>
              <button disabled={busy==='plus'} onClick={()=>setPlusConfirm(true)} style={{ width:'100%', padding:'12px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg, #FFD700, #FF9F43, #FF007A)', color:'#1E0A00', fontWeight:'900', fontSize:'14px', cursor:'pointer', boxShadow:'0 4px 16px rgba(255,159,67,0.4)' }}>
                {busy==='plus' ? 'در حال خرید...' : d.plus.active ? 'تمدید یک ماه دیگر' : 'فعال‌سازی پلاس'}
              </button>
              {d.plus.active && <p style={{ color:'#94A3B8', fontSize:'10.5px', textAlign:'center', marginTop:'6px' }}>اگر زودتر تمدید کنی، روزهای باقی‌مانده از بین نمی‌رود و ۳۰ روز به آن اضافه می‌شود.</p>}
            </div>

            {d.clubs?.length>0 && (
              <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'16px' }}>
                <h2 style={{ color:'#FFF', fontWeight:'900', margin:'0 0 10px' }}>باشگاه‌های من</h2>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:'10px' }}>
                  {d.clubs.map(c=>(
                    <div key={c.slug} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'12px', padding:'10px', textAlign:'center' }}>
                      <img src={clubImg(c.slug)} alt={c.name} width="46" height="46" style={{ objectFit:'contain' }} />
                      <b style={{ display:'block', color:'#FFF', fontSize:'11px', margin:'6px 0 2px' }}>{c.name}</b>
                      <span style={{ background: c.permanent?'rgba(181,239,88,0.15)':'rgba(255,211,107,0.15)', color: c.permanent?'#B5EF58':'#FFD36B', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px', fontWeight:'800' }}>{c.permanent?'دائمی':'با پلاس'}</span>
                      <button disabled={busy==='avatar'} onClick={()=>useAsAvatar(c.slug)} style={{ marginTop:'6px', width:'100%', padding:'6px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#FFF', fontSize:'10px', cursor:'pointer' }}>عکس پروفایلم شود</button>
                    </div>
                  ))}
                </div>
                {d.clubs.some(c=>!c.permanent) && !d.plus.active && <p style={{ color:'#F59E0B', fontSize:'11px', marginTop:'8px', background:'rgba(245,158,11,0.08)', padding:'8px', borderRadius:'8px' }}>باشگاه‌هایی که با پلاس عضو شده‌ای، بدون اشتراک فعال فقط تا آخرین انتخابت باقی می‌مانند.</p>}
              </div>
            )}

            {KINDS.map(([kind,label,note])=>{
              const items = d.items.filter(i=>i.kind===kind);
              if(!items.length) return null;
              const active = equippedFor(kind);
              return (
                <div key={kind} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'16px' }}>
                  <div style={{ display:'flex', gap:'10px', alignItems:'center', marginBottom:'12px' }}>
                    <div style={{ flex:1 }}>
                      <h2 style={{ color:'#FFF', fontWeight:'900', margin:0, fontSize:'15px' }}>{label}</h2>
                      <p style={{ color:'#94A3B8', fontSize:'11px', margin:'2px 0 0' }}>{note}</p>
                    </div>
                    {active && <button onClick={()=>equip(null,kind)} style={{ padding:'6px 12px', borderRadius:'99px', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.06)', color:'#FFF', fontSize:'11px', cursor:'pointer' }}>برداشتن</button>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:'8px' }}>
                    {items.map(it=>{
                      const on = active===it.payload;
                      const usable = it.usable || it.member;
                      return (
                        <div key={it.id} style={{ background: on?'rgba(181,239,88,0.08)':'rgba(255,255,255,0.03)', border: on?'2px solid #B5EF58':'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', padding:'10px', textAlign:'center' }}>
                          <div style={{ height:'48px', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'6px' }}>
                            {kind==='name_color' ? <span style={{ width:'34px', height:'34px', borderRadius:'50%', background: it.payload==='rainbow'?'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)':it.payload, border:'2px solid rgba(255,255,255,0.15)' }} /> :
                             kind==='card_frame' ? <span style={{ width:'36px', height:'36px', borderRadius:'8px', background: FRAME_STYLE[it.payload]||'#334155' }} /> :
                             <img src={it.imageUrl} alt={it.name} width="56" height="56" style={{ objectFit:'contain' }} />}
                          </div>
                          <b style={{ color:'#FFF', fontSize:'11px', display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.name}</b>
                          <div style={{ margin:'4px 0' }}>
                            {on ? <span style={{ background:'rgba(181,239,88,0.15)', color:'#B5EF58', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px', fontWeight:'800' }}>انتخاب‌شده</span> :
                             it.owned ? <span style={{ background:'rgba(181,239,88,0.15)', color:'#B5EF58', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px' }}>دائمی</span> :
                             it.member ? <span style={{ background:'rgba(255,211,107,0.15)', color:'#FFD36B', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px' }}>عضوی</span> :
                             it.unlockedByPlus ? <span style={{ background:'rgba(255,211,107,0.15)', color:'#FFD36B', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px' }}>با پلاس</span> :
                             <span style={{ color:'#FFD36B', fontSize:'11px', fontWeight:'800' }}>{fa(it.price)} تومان</span>}
                          </div>
                          {usable ? <button disabled={on || busy==='equip'+it.slug} onClick={()=>equip(it.slug,kind)} style={{ width:'100%', padding:'6px', borderRadius:'8px', border:'none', background: on?'#334155':'#38BDF8', color: on?'#94A3B8':'#000', fontSize:'11px', fontWeight:'800', cursor:'pointer' }}>{on?'فعال':'انتخاب'}</button> :
                           <button disabled={busy===it.id} onClick={()=>setConfirm(it)} style={{ width:'100%', padding:'6px', borderRadius:'8px', border:'none', background:'#FFD700', color:'#1E0A00', fontSize:'11px', fontWeight:'900', cursor:'pointer' }}>{busy===it.id?'...':'خرید'}</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {confirm && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={()=>setConfirm(null)}>
                <div style={{ background:'#1E293B', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'16px', padding:'20px', maxWidth:'90%', width:'400px' }} onClick={e=>e.stopPropagation()}>
                  <h3 style={{ color:'#FFF', fontWeight:'900', margin:'0 0 8px' }}>خرید «{confirm.name}»</h3>
                  <p style={{ color:'#CBD5E1', fontSize:'12.5px', lineHeight:1.6 }}><b style={{ color:'#FFD36B' }}>{fa(confirm.price)} تومان</b> از کیف پولت کم می‌شود.<br/>این آیتم <b>برای همیشه</b> مال تو می‌شود.<br/><small style={{ color:'#94A3B8' }}>موجودی فعلی: {fa(d.balance)} تومان</small>{d.balance < confirm.price && <><br/><small style={{ color:'#EF4444' }}>موجودی‌ات {fa(confirm.price-d.balance)} تومان کم است.</small></>}</p>
                  <div style={{ display:'flex', gap:'8px', marginTop:'16px' }}>
                    <button onClick={()=>setConfirm(null)} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#FFF', cursor:'pointer' }}>انصراف</button>
                    <button disabled={d.balance < confirm.price} onClick={()=>buy(confirm)} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'none', background: d.balance < confirm.price ? '#334155' : '#FFD700', color: d.balance < confirm.price ? '#64748B' : '#1E0A00', fontWeight:'900', cursor:'pointer' }}>بله، بخر</button>
                  </div>
                </div>
              </div>
            )}
            {plusConfirm && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={()=>setPlusConfirm(false)}>
                <div style={{ background:'#1E293B', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'16px', padding:'20px', maxWidth:'90%', width:'400px' }} onClick={e=>e.stopPropagation()}>
                  <h3 style={{ color:'#FFF', fontWeight:'900' }}>{d.plus.active?'تمدید قلقلی پلاس':'فعال‌سازی قلقلی پلاس'}</h3>
                  <p style={{ color:'#CBD5E1', fontSize:'12px', marginTop:'8px' }}><b>{fa(d.plus.price)} تومان</b> برای <b>{fa(d.plus.days)} روز</b>.<br/>{d.plus.expiryNote}<br/><small>موجودی فعلی: {fa(d.balance)} تومان</small></p>
                  <div style={{ display:'flex', gap:'8px', marginTop:'16px' }}>
                    <button onClick={()=>setPlusConfirm(false)} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', color:'#FFF', cursor:'pointer' }}>انصراف</button>
                    <button disabled={d.balance < d.plus.price} onClick={buyPlus} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'none', background:'#FFD700', color:'#1E0A00', fontWeight:'900', cursor:'pointer' }}>بله، فعال کن</button>
                  </div>
                </div>
              </div>
            )}
            {avatarOffer && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={()=>setAvatarOffer(null)}>
                <div style={{ background:'#1E293B', borderRadius:'16px', padding:'20px', textAlign:'center', maxWidth:'90%', width:'380px' }} onClick={e=>e.stopPropagation()}>
                  <h3 style={{ color:'#FFF', fontWeight:'900' }}>عکس پروفایلت را عوض کنیم؟</h3>
                  <img src={clubImg(avatarOffer.slug)} alt="" width="84" height="84" style={{ margin:'12px 0' }} />
                  <p style={{ color:'#CBD5E1', fontSize:'12px' }}>نشان باشگاه «{avatarOffer.name}» به آواتارهای پروفایل شما اضافه شد.<br/>می‌توانید همین حالا آن را عکس پروفایل خود کنید.</p>
                  <div style={{ display:'flex', gap:'8px', marginTop:'16px' }}>
                    <button onClick={()=>setAvatarOffer(null)} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.12)', background:'transparent', color:'#FFF', cursor:'pointer' }}>نه، فعلاً نه</button>
                    <button onClick={()=>{ const s=avatarOffer.slug; setAvatarOffer(null); useAsAvatar(s); }} style={{ flex:1, padding:'10px', borderRadius:'10px', border:'none', background:'#38BDF8', color:'#000', fontWeight:'900', cursor:'pointer' }}>بله، عوض کن</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
