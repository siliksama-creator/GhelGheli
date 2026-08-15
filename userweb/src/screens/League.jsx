// 1:1 با اندروید league_page.dart — لیگ ماهانه با پودیوم جدید (بدون پس‌زمینه زرد)
import React, { useCallback, useEffect, useState } from 'react';
import { req, fa, asset, avatarUrl } from '../lib/api.js';
import { DisplayName } from '../components/Cosmetics.jsx';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';
import { ASSETS } from '../components/IconAsset.jsx';
import Clubs from './Clubs.jsx';
import CoinChip from '../components/CoinChip.jsx';
import CoinGuide from '../components/CoinGuide.jsx';

/**
 * نشانِ سکه در ردیفِ جدول.
 *
 * ⚠️ جدولِ لیگ از دورِ دهم بر اساس **سکه** مرتب می‌شود و امتیاز فقط
 *    تساوی‌شکن است. اگر فقط امتیاز را نشان می‌دادیم، کاربر ردیفی را
 *    می‌دید که «۵۰۰ امتیاز» بالای «۹۰۰ امتیاز» نشسته و ترتیب برایش
 *    تصادفی به نظر می‌رسید. معیارِ مرتب‌سازی باید دیده شود.
 */
function PodiumCard({ rank, row, onTap }) {
  const isFirst = rank === 1;
  const borderColor = isFirst ? '#FFD700' : rank === 2 ? '#CBD5E1' : '#CD7F32';
  const bg = 'rgba(255,255,255,0.05)';
  const badgeBg = isFirst ? '#FFD700' : rank === 2 ? '#CBD5E1' : '#CD7F32';
  const badgeColor = isFirst ? '#241900' : rank === 2 ? '#1E293B' : '#FFF';
  return (
    <div onClick={onTap} style={{ flex:1, margin:'0 3px', padding: isFirst ? '16px 6px' : '12px 6px', background: bg, borderRadius:'16px', border: `1.4px solid ${borderColor}`, borderWidth: isFirst?'1.8px':'1.4px', boxShadow: isFirst ? '0 4px 14px rgba(255,215,0,0.28)' : rank===2 ? '0 4px 10px rgba(203,213,225,0.18)' : '0 4px 10px rgba(205,127,50,0.16)', textAlign:'center', cursor:'pointer' }}>
      <div style={{ display:'inline-block', padding:'2px 7px', borderRadius:'99px', background: badgeBg, color: badgeColor, fontSize:'9.5px', fontWeight:'900', boxShadow: isFirst?'0 2px 8px rgba(255,215,0,0.4)':'none' }}>
        رتبه {fa(rank)}
      </div>
      <div style={{ fontSize:'22px', margin:'6px 0 4px' }}>{rank===1?'🥇':rank===2?'🥈':'🥉'}</div>
      <div style={{ fontWeight:'700', fontSize:'12.5px', color:'#FFF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        <DisplayName name={row.nickname || 'کاربر'} cosmetics={row.cosmetics} level={row.level} />
      </div>
      <div style={{ display:'flex', justifyContent:'center', marginTop:'5px' }}>
        <CoinChip value={row.coins} size={isFirst ? 30 : 25} />
      </div>
      <div style={{ fontSize:'11.5px', color:'rgba(255,255,255,0.6)', marginTop:'2px' }}>{fa(row.points)} امتیاز</div>
    </div>
  );
}

function PreviousWinners({ data }) {
  const prev = data?.previousSeason;
  let winners = [];
  if (prev && Array.isArray(prev.winners)) winners = prev.winners;
  else if (Array.isArray(data?.previousWinners)) winners = data.previousWinners;
  else if (Array.isArray(prev)) winners = prev;

  if (!winners.length) {
    return (
      <div style={{ padding:'16px' }}>
        <div style={{ padding:'24px', borderRadius:'20px', background:'linear-gradient(135deg, #3D2E00, #1A1400)', textAlign:'center' }}>
          <div style={{ fontSize:'48px' }}>🏆</div>
          <h3 style={{ color:'#FFD700', fontWeight:'900', margin:'8px 0 4px' }}>برندگان دوره قبل لیگ</h3>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'12px' }}>پس از پایان لیگ، برندگان تا شروع لیگ بعدی اینجا نمایش داده می‌شوند.</p>
        </div>
        <div style={{ marginTop:'24px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'20px', textAlign:'center' }}>
          <div style={{ fontSize:'32px' }}>🎖️</div>
          <b style={{ color:'#FFF' }}>هنوز دوره قبلی بسته نشده است</b>
          <p style={{ color:'#94A3B8', fontSize:'12px', marginTop:'4px' }}>به محض پایان این دوره لیگ و پرداخت جوایز، لیست برندگان در این قسمت ثبت خواهد شد.</p>
        </div>
      </div>
    );
  }
  const monthLabel = prev?.monthYear || winners[0]?.month_year || 'فصل گذشته';
  return (
    <div style={{ padding:'16px' }}>
      <div style={{ padding:'24px', borderRadius:'20px', background:'linear-gradient(135deg, #3D2E00, #1A1400)', boxShadow:'0 4px 20px rgba(255,215,0,0.15)', textAlign:'center' }}>
        <div style={{ fontSize:'48px' }}>🏆</div>
        <h3 style={{ color:'#FFD700', fontWeight:'900', margin:'8px 0 4px' }}>برندگان دوره قبل لیگ</h3>
        <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'12px' }}>فصل {monthLabel} — این برندگان تا پایان لیگ بعدی اینجا نمایش داده می‌شوند</p>
      </div>
      <div style={{ marginTop:'16px', display:'flex', flexDirection:'column', gap:'8px' }}>
        {winners.map((w, idx) => (
          <div key={idx} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px', background:'#FFF', borderRadius:'16px', color:'#000' }}>
            <div style={{ width:'40px', height:'40px', borderRadius:'50%', background: w.rank===1?'#FFD700':w.rank===2?'#C0C0C0':w.rank===3?'#CD7F32':'#334155', display:'flex', alignItems:'center', justifyContent:'center', color:'#FFF', fontWeight:'900' }}>{w.rank}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:'800' }}>{w.nickname || w.first_name || 'کاربر'}</div>
              {w.points && <div style={{ fontSize:'11px', color:'#64748B' }}>{fa(w.points)} امتیاز</div>}
            </div>
            {w.prize_amount>0 && <div style={{ background:'rgba(34,231,166,0.15)', border:'1px solid rgba(34,231,166,0.4)', color:'#059669', padding:'5px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'900' }}>{fa(w.prize_amount)} تومان</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function League({ token, openProfile }) {
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const load = useCallback(() => req(selectedLeagueId ? `/api/league/current?seasonId=${selectedLeagueId}` : '/api/league/current', 'GET', null, token), [token, selectedLeagueId]);
  const state = useAsync(load, [load]);
  const [tab, setTab] = useState('table');
  // راهنمای سکه بارِ اول باز است: کاربر روی چیزی که نمی‌شناسد کلیک نمی‌کند،
  // پس اگر بسته شروع شود هرگز خوانده نمی‌شود. بعد از اولین بستن، انتخابش
  // را به خاطر می‌سپاریم تا هر بار جلوی چشمش نباشد.
  const [guideOpen, setGuideOpen] = useState(() => {
    try { return localStorage.getItem('coinGuideSeen') !== '1'; } catch { return true; }
  });
  const toggleGuide = useCallback(() => {
    setGuideOpen(v => {
      if (v) { try { localStorage.setItem('coinGuideSeen', '1'); } catch { /* حالت خصوصی مرورگر */ } }
      return !v;
    });
  }, []);

  // polling like mobile LifecyclePoller 12s
  useEffect(() => {
    if (tab !== 'table') return;
    const id = setInterval(() => { load().catch(()=>{}); }, 12000);
    return () => clearInterval(id);
  }, [tab, load]);

  if (tab === 'clubs') {
    return (
      <section className="card wide leaguePage">
        <div className="leagueTabs">
          <button onClick={()=>setTab('table')} >جدول لیگ</button>
          <button className="on">باشگاه‌ها</button>
          <button onClick={()=>setTab('prev')} >برندگان قبل</button>
        </div>
        <Clubs token={token} openProfile={openProfile} />
      </section>
    );
  }

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری لیگ...">
      {d => {
        const entries = d.entries || [];
        const season = d.season || {};
        const end = season.ends_at ? new Date(season.ends_at) : null;
        const days = end ? Math.max(0, Math.ceil((end - Date.now()) / 86400000)) : 0;
        const top = entries.slice(0, 3);
        const rest = entries.slice(3);

        if (tab === 'prev') {
          return (
            <section className="card wide leaguePage">
              <div className="leagueTabs">
                <button onClick={()=>setTab('table')} >جدول لیگ</button>
                <button onClick={()=>setTab('clubs')} >باشگاه‌ها</button>
                <button className="on">برندگان قبل</button>
              </div>
              <PreviousWinners data={d} />
            </section>
          );
        }

        return (
          <section className="card wide leaguePage" style={{ padding:'16px' }}>
            <div className="leagueTabs">
              <button className="on">جدول لیگ</button>
              <button onClick={()=>setTab('clubs')} >باشگاه‌ها</button>
              <button onClick={()=>setTab('prev')} >برندگان قبل</button>
            </div>

            {/* ── ترتیبِ عمدی: راهنمای سکه پیش از بنر ──
                خواستهٔ مالک این بود که «سکه چطور به دست می‌آید» بدونِ
                اسکرول دیده شود. بنرِ قبلی ۱۱۶px عکس + تیتر + پاراگراف +
                چیپِ شمارش‌معکوس بود و به‌تنهایی کلِ نیمهٔ بالای صفحه را
                می‌گرفت؛ راهنما زیرِ خطِ تا می‌افتاد و عملاً دیده نمی‌شد.

                بنر حذف نشد، فشرده شد: عکس به نوارِ ۵۶px پس‌زمینه تبدیل شد
                و تیتر و شمارش‌معکوس در یک ردیف نشستند. پاراگرافِ توضیحیِ
                لیگ به پایینِ صفحه منتقل شد — اطلاعاتِ لازم است ولی کسی
                برای خواندنش وارد صفحهٔ لیگ نمی‌شود. */}
            <div style={{ margin:'14px 0 12px', position:'relative', overflow:'hidden', background:'linear-gradient(135deg, #16345F, #071521)', border:'1px solid rgba(56,189,248,0.3)', padding:'12px 14px', borderRadius:'16px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
              <img src="/brand/league_banner.webp" alt="" aria-hidden="true" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.22, pointerEvents:'none' }} onError={e=>e.currentTarget.style.display='none'} />
              <h2 style={{ position:'relative', color:'#FFF', fontWeight:'900', margin:0, fontSize:'20px', flex:1, minWidth:0 }}>لیگ قلقلی</h2>
              <div style={{ position:'relative', display:'inline-flex', alignItems:'center', gap:'6px', background:'rgba(255,255,255,0.16)', padding:'6px 12px', borderRadius:'20px', fontSize:'12.5px', color:'#FFF', fontWeight:'800' }}>
                ⏱ {days>0 ? `${fa(days)} روز تا پایان این دوره لیگ` : 'در حال محاسبه'}
              </div>
            </div>

            <CoinGuide open={guideOpen} onToggle={toggleGuide} />

            {top.length>0 && (
              <div style={{ display:'flex', gap:'6px', marginBottom:'20px', alignItems:'flex-end' }}>
                {top.map((r,i) => (
                  <PodiumCard key={r.user_id} rank={i+1} row={r} onTap={()=>openProfile && openProfile(r.user_id)} />
                ))}
              </div>
            )}

            {/* جایگاه شما */}
            {d.myEntry && (
              <div style={{ marginBottom:'12px', padding:'12px 16px', borderRadius:'16px', background:'linear-gradient(135deg, #1E293B, #0F172A)', border:'1px solid rgba(56,189,248,0.4)', display:'flex', alignItems:'center', gap:'12px' }}>
                <span style={{ width:'36px', height:'36px', borderRadius:'50%', background:'rgba(56,189,248,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>👤</span>
                <div>
                  <div style={{ color:'#94A3B8', fontSize:'13px', fontWeight:'700' }}>جایگاه شما در این دوره لیگ:</div>
                  <div style={{ color:'#FFF', fontWeight:'900', fontSize:'16px', display:'flex', alignItems:'center', gap:'9px', flexWrap:'wrap', marginTop:'2px' }}>
                    <span>رتبه {fa(d.myEntry.rank)}</span>
                    <CoinChip value={d.myEntry.coins} size={24} />
                    <span style={{ color:'#94A3B8', fontWeight:'700', fontSize:'13px' }}>{fa(d.myEntry.points)} امتیاز</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              {rest.map((r, idx) => (
                <div key={r.user_id} onClick={()=>openProfile && openProfile(r.user_id)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.03)', borderRadius:'12px', marginBottom:'6px', cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{ fontWeight:'bold', width:'26px', textAlign:'center', color:'#94A3B8', fontSize:'14px' }}>{fa(idx+4)}</span>
                    <DisplayName name={r.nickname || 'کاربر'} cosmetics={r.cosmetics} level={r.level} />
                  </div>
                  <span style={{ display:'flex', alignItems:'center', gap:'9px' }}>
                    <CoinChip value={r.coins} />
                    <span style={{ fontWeight:'bold', color:'#38BDF8', fontSize:'13px' }}>{fa(r.points)}</span>
                  </span>
                </div>
              ))}
            </div>

            <p style={{ color:'rgba(255,255,255,0.62)', fontSize:'12.5px', lineHeight:1.65, margin:'14px 2px 0', textAlign:'center' }}>
              برترین کاربران تا پایان زمان اعلام شده؛ جوایز پس از پایان لیگ پرداخت و لیگ بعدی آغاز می‌شود.
            </p>

            {entries.length===0 && <div style={{ textAlign:'center', padding:'30px', color:'#64748B' }}><div style={{ fontSize:'40px' }}>🏆</div><b style={{ fontSize:'15px', display:'block', marginTop:'6px' }}>هنوز کسی در این لیگ سکه‌ای نبرده است</b><span style={{ fontSize:'13px', display:'block', marginTop:'6px', lineHeight:1.6 }}>اولین برد شما مقابل حریف واقعی، شما را صدرنشین می‌کند.</span></div>}
          </section>
        );
      }}
    </AsyncSection>
  );
}
