// 1:1 با اندروید profile_page.dart — پروفایل خصوصی دقیقاً مثل اپ
import React, { useCallback, useState } from 'react';
import { req, avatars, asset, avatarUrl, fa, plusRemainingText } from '../lib/api.js';
// «۱۰ مدل اختصاصی» دیگر عددِ داخل فایل نیست: تعداد از /api/config و
// جمله از live_copy می‌آید، پس افزودن آواتارِ تازه متن را به‌روز می‌کند.
import { text, avatarCount, useLive } from '../lib/liveConfig.js';
import { useAsync } from '../lib/useAsync.js';
import { clubImg, CosmeticAvatarFrame, DisplayName, profileBackgroundClass, profileBackgroundStyle } from '../components/Cosmetics.jsx';
import Field from '../components/Field.jsx';


export default function Profile({ token, p, load, setMsg, onToken }) {
  useLive();
  const u = p.user;
  const [edit, setEdit] = useState({
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    nickname: u.nickname || '',
    age: u.age || '',
    city: u.city || '',
    province: u.province || '',
    bankAccount: u.bank_account || '',
    profileAvatarKey: u.profile_avatar_key || avatars[0],
  });
  const loadClubs = useCallback(() => req('/api/clubs', 'GET', null, token).then(d => d.mine || []), [token]);
  const clubs = useAsync(loadClubs, [loadClubs]);
  const loadHistory = useCallback(
    () => req('/api/profile/league-history', 'GET', null, token)
      .then(d => Array.isArray(d) ? d : (d?.seasons || [])),
    [token],
  );
  const leagueHistory = useAsync(loadHistory, [loadHistory]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await req('/api/profile', 'PATCH', edit, token);
      setMsg('پروفایل ذخیره شد');
      load();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  }
  return (
    <div data-tour="profile:top" className={profileBackgroundClass(p.cosmetics?.profileBackground)} style={{ maxWidth:'820px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'16px', padding:'14px 12px 80px', borderRadius:'22px', ...profileBackgroundStyle(p.cosmetics?.profileBackground) }}>
      {/* ── «دوباره ببین» (۴ مهر ۱۴۰۵) ──
          تور یک بار بعدِ ورود می‌آید و پرچمش روی سرور می‌نشیند. بدونِ این
          دکمه، تنها راهِ دیدنِ دوبارهٔ آموزش پاک‌کردنِ حساب بود. رویداد به
          موتورِ تور می‌رسد و از بخشِ اول شروع می‌کند. */}
      <button type="button" data-tour="profile:tourReplay"
        onClick={() => window.dispatchEvent(new CustomEvent('gg:tour-replay'))}
        style={{ alignSelf:'flex-start', background:'rgba(255,209,102,0.12)', border:'1px solid rgba(255,209,102,0.38)', color:'#FFD166', borderRadius:'13px', padding:'9px 13px', fontSize:'12.5px', fontWeight:800, cursor:'pointer' }}>
        دوباره دیدن آموزش صوتی
      </button>
      {(leagueHistory.data || []).length > 0 && (
        <section style={{ background:'linear-gradient(135deg, rgba(255,209,102,0.12), rgba(56,189,248,0.08))', border:'1px solid rgba(255,209,102,0.28)', borderRadius:'16px', padding:'14px' }}>
          <h3 style={{ color:'#FFD166', fontWeight:'900', margin:'0 0 10px' }}>سابقه لیگ من</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {(leagueHistory.data || []).map((h, i) => {
              const rank = Number(h.rank || 0);
              const prize = Number(h.prizeAmount || h.prize || h.prize_amount || 0);
              return (
                <div key={h.id || `${h.monthYear}-${i}`} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', borderRadius:'10px', background:'rgba(255,255,255,0.045)' }}>
                  <span style={{ width:'32px', color:rank <= 3 ? '#FFD166' : '#94A3B8', fontWeight:'900' }}>#{fa(rank)}</span>
                  <span style={{ flex:1, color:'#FFF', fontSize:'11.5px', fontWeight:'700' }}>{h.monthYear} · رتبه {fa(rank)} ({fa(h.points)} امتیاز)</span>
                  {prize > 0 && <b style={{ color:'#84CC16', fontSize:'11px' }}>{fa(prize)} تومان</b>}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'10px' }}>
          <CosmeticAvatarFrame frame={p.cosmetics?.frame} style={{ width:62, height:62 }}>
            <img src={avatarUrl(edit.profileAvatarKey)} alt="آواتار فعلی" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover', border:'2px solid #071522' }}/>
          </CosmeticAvatarFrame>
          <div><h2 style={{ color:'#FFF', fontWeight:'900', margin:'0 0 4px' }}>پروفایل من</h2>
            <DisplayName name={u.nickname || u.first_name || 'کاربر'} cosmetics={p.cosmetics} level={p.level?.level} showTitle />
            {plusRemainingText(p.plus) && (
              <div style={{ marginTop:'6px', color:'#FFD166', fontWeight:'900', fontSize:'12.5px' }}>★ {plusRemainingText(p.plus)}</div>
            )}
          </div>
        </div>
        <p style={{ color:'#D7DEE8', fontSize:'11px', margin:'0 0 12px' }}>این اطلاعات فقط برای مدیر است. در چت فقط نام مستعار و عکس دیده می‌شود.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' }}>
          <Field label="نام" value={edit.firstName} onChange={v=>setEdit({...edit, firstName:v})} />
          <Field label="نام خانوادگی" value={edit.lastName} onChange={v=>setEdit({...edit, lastName:v})} />
          <Field label="نام مستعار" value={edit.nickname} maxLength={8}
            hint="حداکثر ۸ نویسه — حرف، عدد و کاراکتر خاص"
            onChange={v=>setEdit({...edit, nickname:v})} />
          <Field label="سن" value={edit.age} onChange={v=>setEdit({...edit, age:v})} type="number" />
          <Field label="استان" value={edit.province} onChange={v=>setEdit({...edit, province:v})} />
          <Field label="شهر" value={edit.city} onChange={v=>setEdit({...edit, city:v})} />
          <Field label="شماره کارت" value={edit.bankAccount} onChange={v=>setEdit({...edit, bankAccount:v})} />
        </div>
        <div style={{ marginTop:'16px' }}>
          <b style={{ color:'#FFF', fontSize:'12px', display:'block', marginBottom:'8px' }}>{text('avatars.countLabel', `انتخاب آواتار پروفایل (${fa(avatarCount(avatars.length))} مدل اختصاصی):`, { count: avatarCount(avatars.length) })}</b>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
            {avatars.map(a=>(
              <img key={a} src={avatarUrl(a)} alt="آواتار" width="62" height="62" loading="lazy" style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', border: edit.profileAvatarKey===a?'2.5px solid #38BDF8':'1px solid rgba(255,255,255,0.1)', cursor:'pointer', objectFit:'cover' }} onClick={()=>setEdit({...edit, profileAvatarKey:a})} />
            ))}
            {(clubs.data||[]).map(c=>(
              <img key={c.slug} src={clubImg(c.slug)} alt={c.name} width="62" height="62" loading="lazy" title={`نشان ${c.name}`} style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', border: edit.profileAvatarKey===`club:${c.slug}`?'2.5px solid #38BDF8':'1px solid rgba(255,255,255,0.1)', cursor:'pointer', objectFit:'contain', background:'rgba(255,255,255,0.04)' }} onClick={()=>setEdit({...edit, profileAvatarKey:`club:${c.slug}`})} />
            ))}
          </div>
        </div>
        <button onClick={save} disabled={saving} style={{ marginTop:'16px', width:'100%', padding:'12px', borderRadius:'12px', border:'none', background: saving?'#334155':'#38BDF8', color: saving?'#64748B':'#000', fontWeight:'900', cursor:'pointer' }}>{saving?'در حال ذخیره...':'ذخیره پروفایل'}</button>
      </div>

    </div>
  );
}
