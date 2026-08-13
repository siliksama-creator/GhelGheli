// 1:1 با اندروید profile_page.dart — پروفایل خصوصی دقیقاً مثل اپ
import React, { useCallback, useState } from 'react';
import { req, avatars, asset, avatarUrl, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { clubImg, CosmeticAvatarFrame, DisplayName, profileBackgroundClass, profileBackgroundStyle } from '../components/Cosmetics.jsx';
import Field from '../components/Field.jsx';

export default function Profile({ token, p, load, setMsg }) {
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
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await req('/api/profile', 'PATCH', edit, token);
      setMsg('پروفایل ذخیره شد');
      load();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  }
  async function changePassword(e) {
    e.preventDefault();
    if (changingPw) return;
    setPwMsg('');
    setChangingPw(true);
    try {
      await req('/api/profile/change-password', 'POST', pw, token);
      setPwMsg('رمز عبور با موفقیت تغییر کرد');
      setPw({ currentPassword: '', newPassword: '' });
    } catch (err) { setPwMsg(err.message); } finally { setChangingPw(false); }
  }

  return (
    <div className={profileBackgroundClass(p.cosmetics?.profileBackground)} style={{ maxWidth:'820px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'16px', padding:'14px 12px 80px', borderRadius:'22px', ...profileBackgroundStyle(p.cosmetics?.profileBackground) }}>
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
          </div>
        </div>
        <p style={{ color:'#D7DEE8', fontSize:'11px', margin:'0 0 12px' }}>این اطلاعات فقط برای مدیر است. در چت فقط نام مستعار و عکس دیده می‌شود.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' }}>
          <Field label="نام" value={edit.firstName} onChange={v=>setEdit({...edit, firstName:v})} />
          <Field label="نام خانوادگی" value={edit.lastName} onChange={v=>setEdit({...edit, lastName:v})} />
          <Field label="نام مستعار" value={edit.nickname} onChange={v=>setEdit({...edit, nickname:v})} />
          <Field label="سن" value={edit.age} onChange={v=>setEdit({...edit, age:v})} type="number" />
          <Field label="استان" value={edit.province} onChange={v=>setEdit({...edit, province:v})} />
          <Field label="شهر" value={edit.city} onChange={v=>setEdit({...edit, city:v})} />
          <Field label="شماره کارت" value={edit.bankAccount} onChange={v=>setEdit({...edit, bankAccount:v})} />
        </div>
        <div style={{ marginTop:'16px' }}>
          <b style={{ color:'#FFF', fontSize:'12px', display:'block', marginBottom:'8px' }}>انتخاب آواتار پروفایل (۱۰ مدل اختصاصی):</b>
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

      <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'16px' }}>
        <h3 style={{ color:'#FFF', fontWeight:'900', margin:'0 0 12px' }}>تغییر رمز عبور</h3>
        <form onSubmit={changePassword} style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="رمز فعلی" value={pw.currentPassword} onChange={v=>setPw({...pw, currentPassword:v})} type="password" />
          <Field label="رمز جدید" value={pw.newPassword} onChange={v=>setPw({...pw, newPassword:v})} type="password" />
          {pwMsg && <div style={{ background: pwMsg.includes('موفق')?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)', color: pwMsg.includes('موفق')?'#22C55E':'#EF4444', padding:'8px 12px', borderRadius:'8px', fontSize:'12px' }}>{pwMsg}</div>}
          <button type="submit" disabled={changingPw} style={{ padding:'10px', borderRadius:'10px', border:'none', background:'#FFD700', color:'#000', fontWeight:'900', cursor:'pointer' }}>{changingPw?'در حال تغییر...':'تغییر رمز'}</button>
        </form>
      </div>
    </div>
  );
}
