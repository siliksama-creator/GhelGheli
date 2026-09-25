// 1:1 با اندروید dashboard_page.dart — داشبورد دقیقاً مثل اپ
import React from 'react';
import { fa, avatarUrl } from '../lib/api.js';
import LoginStreak from '../components/LoginStreak.jsx';
import { CosmeticAvatarFrame, DisplayName } from '../components/Cosmetics.jsx';
import CachedImg from '../components/CachedImg.jsx';
import { SvgIcon } from '../components/IconAsset.jsx';

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

function HeroHeader({ points, nickname, user, cosmetics, onOpenProfile, onOpenWallet }) {
  const requiredFields = { first_name:'نام', last_name:'نام خانوادگی', age:'سن', province:'استان', city:'شهر', bank_account:'شماره کارت' };
  const missing = user ? Object.entries(requiredFields).filter(([k]) => !String(user[k]||'').trim()).map(([,v])=>v) : [];
  const done = Object.keys(requiredFields).length - missing.length;
  return (
    <div data-tour="home:hero" style={{ padding:'10px 10px 10px', borderRadius:'20px', background:'linear-gradient(135deg, #1A2B45, #111D30, #0A1220)', border:'1.2px solid rgba(255,215,0,0.28)', boxShadow:'0 8px 18px rgba(255,215,0,0.08), 0 8px 16px rgba(0,0,0,0.4)' }}>
      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
        <div onClick={onOpenProfile} style={{ flex:1, display:'flex', gap:'8px', alignItems:'center', cursor:'pointer' }}>
          <CosmeticAvatarFrame frame={cosmetics?.frame} style={{width:46,height:46,padding:cosmetics?.frame?3:0}}>
            {user?.profile_image_url
              ? <CachedImg src={user.profile_image_url} alt="" decoding="async" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover',border:'1px solid #071522'}} />
              : <img src={avatarUrl(user?.profile_avatar_key)} alt="" decoding="async" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover',border:'1px solid #071522'}} />}
          </CosmeticAvatarFrame>
          <div>
            <div style={{ color:'#FFF', fontWeight:'900', fontSize:'14.5px', display:'flex', alignItems:'center', gap:'4px' }}>
              سلام <DisplayName name={nickname} cosmetics={cosmetics} level={user?.level?.level ?? user?.level} />
            </div>
            <div style={{ color:'#CBD5E1', fontSize:'11px', fontWeight:'700', display:'flex', alignItems:'center', gap:'2px' }}>پروفایل من ‹</div>
          </div>
        </div>
        <div style={{ padding:'6px 10px', borderRadius:'13px', background:'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,159,67,0.08), rgba(0,0,0,0.14))', border:'1.2px solid rgba(255,215,0,0.5)', boxShadow:'0 4px 10px rgba(255,215,0,0.16)', textAlign:'right' }}>
          <div style={{ color:'#FFDF70', fontWeight:'900', fontSize:'18px', display:'flex', alignItems:'center', gap:'4px', justifyContent:'flex-end', textShadow:'0 0 6px rgba(255,179,0,0.4)' }}>{fa(points)} <span style={{ fontSize:'14px' }}>★</span></div>
          <div style={{ color:'#FFE599', fontWeight:'700', fontSize:'9.5px', textAlign:'right' }}>امتیاز کل</div>
        </div>
      </div>
      {onOpenWallet && (
        <div className="walletEntry" onClick={onOpenWallet} style={{ marginTop:'8px', background:'rgba(0,0,0,0.28)', border:`1px solid ${asInt(user?.wallet_balance)>0?'rgba(255,211,107,0.5)':'rgba(255,255,255,0.15)'}`, borderRadius:'12px', padding:'6px 10px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
          <span style={{ width:'26px', height:'26px', borderRadius:'50%', background: asInt(user?.wallet_balance)>0 ? 'linear-gradient(135deg, #FFE9A8, #D4A227)' : 'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}><SvgIcon name="wallet" size={15} /></span>
          <span style={{ flex:1, color:'rgba(255,255,255,0.7)', fontSize:'10.5px', fontWeight:'600' }}>کیف پول من</span>
          <span style={{ color: asInt(user?.wallet_balance)>0 ? '#FFD36B' : '#FFF', fontWeight:'900', fontSize:'14px' }}>{fa(user?.wallet_balance||0)} <span style={{ fontSize:'9.5px', color:'rgba(255,211,107,0.8)' }}>تومان</span></span>
          <span style={{ background:'rgba(255,211,107,0.18)', color:'#FFD36B', padding:'2px 8px', borderRadius:'99px', fontSize:'9.5px', fontWeight:'800' }}>{asInt(user?.wallet_balance)>0?'برداشت':'مشاهده'} ‹</span>
        </div>
      )}
      {missing.length>0 && (
        <div onClick={onOpenProfile} style={{ marginTop:'6px', background:'rgba(0,0,0,0.25)', borderRadius:'8px', padding:'6px 8px', display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
          <span style={{ color:'#FFD36B', display:'flex' }}><SvgIcon name="idcard" size={13} /></span>
          <span style={{ flex:1, color:'#FFF', fontSize:'10.5px', fontWeight:'700', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>تکمیل پروفایل ({done} از {Object.keys(requiredFields).length}): {missing.slice(0,2).join('، ')}{missing.length>2?` +${missing.length-2} مورد`:''}</span>
          <span style={{ color:'#FFD36B', fontSize:'10.5px', fontWeight:'800' }}>تکمیل ‹</span>
        </div>
      )}
    </div>
  );
}

export default function Home({ token, p, load, setMsg, openProfile, openWallet, openWheel, openInvite, openCardReg, openTap }) {
  const u = p.user;
  const inventory = p.inventory || [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px', padding:'0 12px 80px' }}>
      {(p.pendingGrants || []).length > 0 && (
        <button type="button" onClick={openCardReg} style={{
          background: 'linear-gradient(135deg,#F59E0B22,#2a1140)',
          border: '1.5px solid #FFD166', borderRadius: 16, padding: '12px 14px',
          color: '#FFD166', fontWeight: 900, cursor: 'pointer', textAlign: 'right',
        }}>
          صندوق کارت برنده‌ای — از کلکسیون بازش کن
          <small style={{ display: 'block', color: '#FDE68A', fontWeight: 700, marginTop: 4 }}>
            {fa((p.pendingGrants || []).length)} صندوق منتظر توست
          </small>
        </button>
      )}

      <HeroHeader points={asInt(u.current_points)} nickname={u.nickname||u.mobile||'قهرمان'} user={u} cosmetics={p.cosmetics} onOpenProfile={openProfile} onOpenWallet={openWallet} />

      <LoginStreak token={token} initialData={p.loginStreak} setMsg={setMsg} onClaimed={load} />

      {/* ── کاشیِ تمام‌عرضِ ضربه‌زن (خواستهٔ مالک، ۳۱ شهریور ۱۴۰۵) ──
          «جایگاهش را عوض کنم که خیلی تو چشم‌تر باشد» — خانه اولین صفحهٔ
          هر کاربر است. همان زبانِ بصریِ سه کاشیِ پایین (سبزِ ضربه‌زن +
          درخشش) ولی تمام‌عرض و بالاتر؛ مستقیم خودِ بازی را باز می‌کند.
          دوقلوی اندروید: _AnimatedQuickTile در dashboard_page.dart. */}
      {openTap && (
        <button type="button" onClick={openTap} data-tour="home:tapTile" style={{ background:'linear-gradient(135deg, #84CC1626, #84CC160A)', border:'1.5px solid #84CC1699', borderRadius:'16px', padding:'12px 14px', display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', boxShadow:'0 4px 14px #84CC1633', textAlign:'right' }}>
          <img src="/games/tap/skin_1.webp" alt="" decoding="async" style={{ width:'40px', height:'40px', objectFit:'contain', flexShrink:0 }} />
          <span style={{ flex:1 }}>
            <b style={{ display:'block', color:'#FFF', fontSize:'13px', fontWeight:'900' }}>ضربه‌زن</b>
            <small style={{ color:'#A3E635', fontSize:'10.5px', fontWeight:'700' }}>بزن، سکه و امتیاز بگیر</small>
          </span>
          <span style={{ background:'#84CC1622', color:'#A3E635', padding:'4px 10px', borderRadius:'99px', fontSize:'10px', fontWeight:'800', flexShrink:0 }}>بازی ‹</span>
        </button>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
        <button onClick={openWheel} data-tour="home:wheelTile" style={{ background:'linear-gradient(135deg, #F59E0B22, #F59E0B0A)', border:'1px solid #F59E0B55', borderRadius:'16px', padding:'12px 6px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', boxShadow:'0 4px 12px #F59E0B22' }}>
          <span style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#F59E0B22', display:'flex', alignItems:'center', justifyContent:'center' }}><img src="/pass/wheel_icon.webp" alt="" style={{ width:'26px', height:'26px' }} /></span>
          <b style={{ color:'#FFF', fontSize:'12px', fontWeight:'900' }}>گردونه</b>
          <small style={{ color:'#F59E0B', fontSize:'10px', fontWeight:'700' }}>گردونه شانس</small>
        </button>
        <button onClick={openInvite} data-tour="home:inviteTile" style={{ background:'linear-gradient(135deg, #84CC1622, #84CC160A)', border:'1px solid #84CC1655', borderRadius:'16px', padding:'12px 6px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', boxShadow:'0 4px 12px #84CC1622' }}>
          <span style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#84CC1622', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px' }}><SvgIcon name="people" size={20} /></span>
          <b style={{ color:'#FFF', fontSize:'12px', fontWeight:'900' }}>دعوت و کسب درآمد</b>
          <small style={{ color:'#84CC16', fontSize:'10px', fontWeight:'700' }}>دوستان</small>
        </button>
        <button onClick={openCardReg} data-tour="home:collection" style={{ background:'linear-gradient(135deg, #38BDF822, #38BDF80A)', border:'1px solid #38BDF855', borderRadius:'16px', padding:'12px 6px', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer', boxShadow:'0 4px 12px #38BDF822' }}>
          <span style={{ width:'40px', height:'40px', borderRadius:'50%', background:'#38BDF822', display:'flex', alignItems:'center', justifyContent:'center' }}><img src="/games/card_duel_glow.webp" alt="" width="30" height="30" style={{ objectFit:'contain' }} /></span>
          <b style={{ color:'#FFF', fontSize:'12px', fontWeight:'900' }}>کلکسیون</b>
          <small style={{ color:'#38BDF8', fontSize:'10px', fontWeight:'700' }}>{fa(inventory.length)} نوع</small>
        </button>
      </div>


    </div>
  );
}

