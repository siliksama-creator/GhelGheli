// 1:1 با اندروید profile_page.dart — پروفایل خصوصی دقیقاً مثل اپ
import React, { useCallback, useState } from 'react';
import { req, avatars, asset, avatarUrl, fa } from '../lib/api.js';
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
    </div>
  );
}
