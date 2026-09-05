// 1:1 با اندروید league_page.dart — لیگ ماهانه با پودیوم جدید (بدون پس‌زمینه زرد)
import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { req, fa, asset, avatarUrl, API } from '../lib/api.js';
import { DisplayName } from '../components/Cosmetics.jsx';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';
import { ASSETS, SvgIcon } from '../components/IconAsset.jsx';
import Clubs from './Clubs.jsx';
import CoinChip from '../components/CoinChip.jsx';
import CoinGuide from '../components/CoinGuide.jsx';
// اقتصادِ بازی از کشِ مشترکِ config خوانده می‌شود (فاز ۲). این صفحه یکی از
// fetchهای تکراریِ `/api/config` بود که حالا حذف شده است.
import { useLive } from '../lib/liveConfig.js';

/**
 * نشانِ سکه در ردیفِ جدول.
 *
 * ⚠️ جدولِ لیگ از دورِ دهم بر اساس **سکه** مرتب می‌شود و امتیاز فقط
 *    تساوی‌شکن است. اگر فقط امتیاز را نشان می‌دادیم، کاربر ردیفی را
 *    می‌دید که «۵۰۰ امتیاز» بالای «۹۰۰ امتیاز» نشسته و ترتیب برایش
 *    تصادفی به نظر می‌رسید. معیارِ مرتب‌سازی باید دیده شود.
 */
/**
 * ردیفِ تک‌سطریِ صدرنشین — برای وقتی که کمتر از سه نفر در جدول‌اند.
 *
 * ⚠️ چرا لازم شد: پودیومِ سه‌ستونه با `flex:1` طراحی شده. وقتی فقط یک
 *    یا دو نفر در لیگ هستند، همان کارت تمامِ عرض را می‌گیرد و چون
 *    محتوایش عمودی چیده شده (مدال / نام / سکه)، یک ستونِ بلندِ سه‌طبقه
 *    وسطِ صفحه می‌شود که با ردیفِ تک‌سطریِ «جایگاه شما» درست زیرش
 *    ناهماهنگ است. با کمتر از سه نفر، پودیوم معنای بصری‌اش (سکوی
 *    مقایسه‌ای) را هم از دست می‌دهد.
 *
 * پس زیرِ سه نفر، همان اطلاعات در یک سطر و هم‌تراز با بقیهٔ جدول
 * نمایش داده می‌شود. `PodiumRow` عمداً همان چیدمانِ ردیفِ «جایگاه شما»
 * را دارد تا همهٔ نفرات در یک سطح دیده شوند.
 */
function PodiumRow({ rank, row, onTap }) {
  const accent = rank === 1 ? '#FFD700' : rank === 2 ? '#CBD5E1' : '#CD7F32';
  const badgeColor = rank === 1 ? '#241900' : rank === 2 ? '#1E293B' : '#FFF';
  return (
    <div onClick={onTap} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 12px', marginBottom:'6px', borderRadius:'14px', background:'rgba(255,255,255,0.05)', border:`1.4px solid ${accent}`, boxShadow:`0 4px 12px ${accent}22`, cursor:'pointer' }}>
      <span style={{ lineHeight:1, display:'flex', flexShrink:0, color: rank===1?'#FFD166':rank===2?'#CBD5E1':'#D08B5B' }}>
        <SvgIcon name={rank===1?'medal1':rank===2?'medal2':'medal3'} size={19} /></span>
      <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:'99px', background:accent, color:badgeColor, fontSize:'10px', fontWeight:'900', flexShrink:0 }}>{fa(rank)}</span>
      <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:'700', fontSize:'13px', color:'#FFF' }}>
        <DisplayName name={row.nickname || 'کاربر'} cosmetics={row.cosmetics} level={row.level} />
      </span>
      <span style={{ marginInlineStart:'auto', display:'flex', alignItems:'center', gap:'7px', flexShrink:0 }}>
        <CoinChip value={row.coins} size={22} />
        <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.6)', fontWeight:'700' }}>{fa(row.points)}</span>
      </span>
    </div>
  );
}

function PodiumCard({ rank, row, onTap }) {
  const isFirst = rank === 1;
  const borderColor = isFirst ? '#FFD700' : rank === 2 ? '#CBD5E1' : '#CD7F32';
  const bg = 'rgba(255,255,255,0.05)';
  const badgeBg = isFirst ? '#FFD700' : rank === 2 ? '#CBD5E1' : '#CD7F32';
  const badgeColor = isFirst ? '#241900' : rank === 2 ? '#1E293B' : '#FFF';
  return (
    <div onClick={onTap} style={{ flex:1, margin:'0 3px', padding: isFirst ? '11px 5px' : '9px 5px', background: bg, borderRadius:'14px', border: `1.4px solid ${borderColor}`, borderWidth: isFirst?'1.8px':'1.4px', boxShadow: isFirst ? '0 4px 14px rgba(255,215,0,0.28)' : rank===2 ? '0 4px 10px rgba(203,213,225,0.18)' : '0 4px 10px rgba(205,127,50,0.16)', textAlign:'center', cursor:'pointer' }}>
      {/* مدال و شمارهٔ رتبه در یک خط: قبلاً دو سطرِ جدا بودند و هر کارت
          ۱۸۷px ارتفاع می‌گرفت. مدال خودش رتبه را می‌گوید، پس چیپِ
          «رتبه ۱» فقط تکرار بود. */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
        <span style={{ lineHeight:1, display:'flex', color: rank===1?'#FFD166':rank===2?'#CBD5E1':'#D08B5B' }}>
          <SvgIcon name={rank===1?'medal1':rank===2?'medal2':'medal3'} size={19} /></span>
        <span style={{ display:'inline-block', padding:'1px 6px', borderRadius:'99px', background: badgeBg, color: badgeColor, fontSize:'9.5px', fontWeight:'900' }}>{fa(rank)}</span>
      </div>
      <div style={{ fontWeight:'700', fontSize:'12px', color:'#FFF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:'5px' }}>
        <DisplayName name={row.nickname || 'کاربر'} cosmetics={row.cosmetics} level={row.level} />
      </div>
      {/* سکه و امتیاز کنارِ هم، نه زیرِ هم */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', marginTop:'4px', flexWrap:'wrap' }}>
        <CoinChip value={row.coins} size={isFirst ? 26 : 22} />
        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.6)' }}>{fa(row.points)}</span>
      </div>
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
          <div style={{ color:'#FFD700', display:'flex', justifyContent:'center' }}><SvgIcon name="trophy" size={46} /></div>
          <h3 style={{ color:'#FFD700', fontWeight:'900', margin:'8px 0 4px' }}>برندگان دوره قبل لیگ</h3>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'12px' }}>پس از پایان لیگ، برندگان تا شروع لیگ بعدی اینجا نمایش داده می‌شوند.</p>
        </div>
        <div style={{ marginTop:'24px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'20px', textAlign:'center' }}>
          <div style={{ color:'#94A3B8', display:'flex', justifyContent:'center' }}><SvgIcon name="medal1" size={30} /></div>
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
        <div style={{ color:'#FFD700', display:'flex', justifyContent:'center' }}><SvgIcon name="trophy" size={46} /></div>
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
  // اقتصادِ بازی‌ها (نرخِ سکه، درصدِ انتقال بین لیگ‌ها) — از همان کشِ مشترک؛
  // وقتی ادمین در پنل عوض کند این راهنما هم بدونِ آپدیت به‌روز می‌شود.
  const live = useLive();
  const economy = live?.economy ?? null;
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

  // به‌روزرسانیِ زندهٔ جدول به‌جای pollِ ثابتِ ۱۲ ثانیه.
  //
  // قبلاً این صفحه هر ۱۲ ثانیه یک HTTP می‌زد؛ حتی وقتی هیچ رتبه‌ای عوض
  // نشده بود، هر بینندهٔ بازِ صفحه بی‌وقفه به سرور فشار می‌آورد و تازه‌شدن
  // هم تا ۱۲ ثانیه تأخیر داشت. حالا سرور فقط وقتی جدول واقعاً تغییر می‌کند
  // (پایان بازی، ثبت امتیاز/سکه) رویدادِ `leaderboard:update` را پخش
  // می‌کند و کلاینت همان لحظه دوباره `/api/league/current` را می‌خواند.
  //
  // سیگنال داده ندارد؛ کلاینت خودش مسیر را می‌زند چون آن پاسخ رتبهٔ شخصیِ
  // بیننده (myEntry) را هم دارد و منطقِ رتبه‌بندی یک‌جا روی سرور می‌ماند.
  //
  // تورِ ایمنی (نه pollِ زمانی): وقتی تبِ مرورگر دوباره دیده می‌شود یا
  // سوکت بعد از قطعی وصل می‌شود، یک‌بار تازه می‌کنیم تا رکابی که هنگامِ
  // قطعی از دست رفته باشد جا نماند. سوکت اختیاری است؛ اگر وصل نشد جدول
  // همان دادهٔ بارگذاری‌شده را نشان می‌دهد و خطا هم نمی‌دهد.
  useEffect(() => {
    if (tab !== 'table' || !token) return;
    let socket = null;
    try {
      socket = io(API, {
        auth: { token }, transports: ['websocket', 'polling'],
        forceNew: true, reconnection: true,
      });
      const refresh = () => state.reload().catch(() => {});
      socket.on('leaderboard:update', refresh);
      // فقط این کلاینت (که جدول را باز کرده) عضو اتاقِ لیدربورد می‌شود تا
      // سرور رویداد را فقط به بیننده‌های جدول بفرستد. بعد از هر وصلِ مجدد
      // (reconnect) باید دوباره عضو شد، چون عضویتِ اتاق با اتصالِ تازه reset
      // می‌شود. هنگامِ وصل یک‌بار هم می‌خوانیم تا تغییرِ حینِ قطعی جا نماند.
      socket.on('connect', () => {
        socket.emit('leaderboard:subscribe');
        refresh();
      });
    } catch { /* سوکت اختیاری است */ }

    const onVisible = () => { if (document.visibilityState === 'visible') state.reload().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      try {
        socket?.emit('leaderboard:unsubscribe');
        socket?.off('leaderboard:update');
        socket?.off('connect');
        socket?.disconnect();
      } catch { /* noop */ }
    };
  }, [tab, token, state.reload]);

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

            <CoinGuide open={guideOpen} onToggle={toggleGuide} economy={economy} />

            {/* سکوی سه‌نفره فقط وقتی معنا دارد که سه نفر باشند؛ زیرِ آن،
                ردیفِ تک‌سطری تا همهٔ نفرات با «جایگاه شما» هم‌تراز بمانند. */}
            {top.length>0 && (
              top.length < 3 ? (
                <div style={{ marginBottom:'12px' }}>
                  {top.map((r,i) => (
                    <PodiumRow key={r.user_id} rank={i+1} row={r} onTap={()=>openProfile && openProfile(r.user_id)} />
                  ))}
                </div>
              ) : (
                <div style={{ display:'flex', gap:'6px', marginBottom:'12px', alignItems:'flex-end' }}>
                  {top.map((r,i) => (
                    <PodiumCard key={r.user_id} rank={i+1} row={r} onTap={()=>openProfile && openProfile(r.user_id)} />
                  ))}
                </div>
              )
            )}

            {/* جایگاه شما */}
            {d.myEntry && (
              <div style={{ marginBottom:'10px', padding:'9px 12px', borderRadius:'14px', background:'linear-gradient(135deg, #1E293B, #0F172A)', border:'1px solid rgba(56,189,248,0.4)', display:'flex', alignItems:'center', gap:'9px' }}>
                <span style={{ width:'28px', height:'28px', borderRadius:'50%', background:'rgba(56,189,248,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#38BDF8' }}><SvgIcon name="person" size={15} /></span>
                <span style={{ color:'#94A3B8', fontSize:'12.5px', fontWeight:'700', flexShrink:0 }}>جایگاه شما</span>
                <span style={{ color:'#FFF', fontWeight:'900', fontSize:'15px' }}>{fa(d.myEntry.rank)}</span>
                <span style={{ marginInlineStart:'auto', display:'flex', alignItems:'center', gap:'7px' }}>
                  <CoinChip value={d.myEntry.coins} size={21} />
                  <span style={{ color:'#94A3B8', fontWeight:'700', fontSize:'12px' }}>{fa(d.myEntry.points)}</span>
                </span>
              </div>
            )}

            <div>
              {rest.map((r, idx) => (
                <div key={r.user_id} onClick={()=>openProfile && openProfile(r.user_id)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 12px', background:'rgba(255,255,255,0.03)', borderRadius:'11px', marginBottom:'4px', cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'9px', minWidth:0 }}>
                    <span style={{ fontWeight:'bold', width:'22px', textAlign:'center', color:'#94A3B8', fontSize:'13px', flexShrink:0 }}>{fa(idx+4)}</span>
                    <DisplayName name={r.nickname || 'کاربر'} cosmetics={r.cosmetics} level={r.level} />
                  </div>
                  <span style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
                    <CoinChip value={r.coins} size={20} />
                    <span style={{ fontWeight:'bold', color:'#38BDF8', fontSize:'12px' }}>{fa(r.points)}</span>
                  </span>
                </div>
              ))}
            </div>

            <p style={{ color:'rgba(255,255,255,0.62)', fontSize:'12.5px', lineHeight:1.65, margin:'14px 2px 0', textAlign:'center' }}>
              مبنای دریافتِ جایزهٔ لیگ، رتبه بر اساسِ سکه است و با سکه‌ها در استخرِ جایزه شرکت می‌کنی.
              برترین کاربران تا پایان زمان اعلام شده؛ جوایز پس از پایان لیگ پرداخت و لیگ بعدی آغاز می‌شود.
              سکه‌ها بعد از پایانِ لیگ صفر می‌شوند و {(Number(economy?.coinCarryoverPercent ?? 10) === 0)
                ? 'انتقالِ سکه به لیگِ بعدی صفر است'
                : `${fa(economy?.coinCarryoverPercent ?? 10)}٪ از سکه به لیگِ بعدی منتقل می‌شود`}.
            </p>

            {entries.length===0 && <div style={{ textAlign:'center', padding:'30px', color:'#64748B' }}><div style={{ color:'#FFD166', display:'flex', justifyContent:'center' }}><SvgIcon name="trophy" size={38} /></div><b style={{ fontSize:'15px', display:'block', marginTop:'6px' }}>هنوز کسی در این لیگ سکه‌ای نبرده است</b><span style={{ fontSize:'13px', display:'block', marginTop:'6px', lineHeight:1.6 }}>اولین برد شما مقابل حریف واقعی، شما را صدرنشین می‌کند.</span></div>}
          </section>
        );
      }}
    </AsyncSection>
  );
}
