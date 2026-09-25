// دعوت دوستان — کد اختصاصی، آمار، و اشتراک مستقیم در پیام‌رسان‌ها
//
// ── دو تبِ تازه (خواستهٔ مالک، ۴ مهر ۱۴۰۵) ─────────────────────────────────
//
//   «در قسمت دعوت از دوستان باید یک تب جدید ایجاد کنی که تاپ ۱۰ بیشترین
//    دعوت‌کننده مشخص باشه و رنک هر فرد رو هم نشون بده حتی اگه تو تاپ ۱۰ نباشه
//    … و اگه ادمین از پنل یه آفر مثل لیگ دعوت‌کنندگان قرار داد و کانفیگش کرد،
//    داخل تب دعوت‌کنندگان لیگ معرف‌ها برگزار بشه.»
//
// تصمیمِ مالک برای اسم‌ها: «معرف‌های برتر تا کنون» برای فهرستِ همیشه‌زنده و
// «لیگ معرف‌ها» برای آفرِ زمان‌دارِ ادمین. اگر ادمین آفری نساخته باشد، تبِ
// لیگ پیامِ «ساخته نشده» می‌دهد — نه جدولِ خالی، نه پنهان‌کردنِ تب.
//
// هر دو جدول از یک درخواست می‌آیند (`/api/referrals` → `inviteLeague`)، پس
// این صفحه هیچ‌وقت دو منبعِ حقیقتِ متفاوت برای «تعدادِ دعوت» ندارد.
import React, { useCallback, useEffect, useState } from 'react';
import { req } from '../lib/api.js';
// جملهٔ «هر N دعوت = M چرخش…» از live_copy می‌آید؛ «۱» دیگر در فایل
// ثابت نیست (فاز ۲ — باقی‌ماندهٔ موردِ ۶ نقشه‌راه).
import { ruleNumber, text, useLive } from '../lib/liveConfig.js';
import { SvgIcon } from '../components/IconAsset.jsx';

const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

/** «۲ روز و ۳ ساعت مانده» — برای سرشماریِ معکوسِ لیگ. */
function remainingLabel(endsAt) {
  if (!endsAt) return '';
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'پایان یافته';
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${fa(days)} روز و ${fa(hours)} ساعت مانده`;
  if (hours > 0) return `${fa(hours)} ساعت و ${fa(mins)} دقیقه مانده`;
  return `${fa(mins)} دقیقه مانده`;
}

/** ردیفِ یک نفر در جدولِ معرف‌ها. */
function BoardRow({ row, me }) {
  const top = row.rank <= 3;
  return (
    <li className={`refBoardRow${top ? ' top' : ''}${me ? ' me' : ''}`}>
      <span className={`refMedal${top ? ` m${row.rank}` : ''}`}>{fa(row.rank)}</span>
      {row.avatarUrl
        ? <img className="refAvatar" src={row.avatarUrl} alt="" loading="lazy" />
        : <span className="refAvatar refAvatarEmpty" aria-hidden="true">{String(row.nickname || '؟').slice(0, 1)}</span>}
      <span className="refBoardName">{row.nickname}</span>
      <b className="refBoardValue">{fa(row.invites)} دعوت</b>
    </li>
  );
}

export default function Referral({ token, setMsg }) {
  useLive();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('top');
  // سرشماریِ معکوس هر دقیقه تازه می‌شود؛ بدونِ آن، جملهٔ «۲ روز مانده»
  // ساعت‌ها کهنه می‌ماند و کاربر فکر می‌کند لیگ تمام شده.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setD(await req('/api/referrals', 'GET', null, token));
      setErr('');
    } catch (e) {
      setErr(e?.data?.message || 'دریافت اطلاعات ناموفق بود');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setTick(n => n + 1), 60000);
    return () => window.clearInterval(t);
  }, []);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(d.code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = d.code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setMsg?.('کد دعوت کپی شد ✓');
    } catch {
      setMsg?.('کپی نشد — کد را دستی کپی کنید');
    }
  };

  const inviteMsg = (code) =>
    `کد دعوت من به قلقلی: ${code}\nبا این کد ثبت‌نام کن؛ هر دومون ${fa(d.spinsPerReferral ?? 3)} چرخش هدیه می‌گیریم و من از خریدهای مستقیم تو ${fa(d.purchaseCommissionPercent ?? 5)}٪ درآمد معرفی می‌گیرم.\nhttps://user.ghelghelishop.com`;

  const shareTo = (target) => {
    const text = encodeURIComponent(inviteMsg(d.code));
    let url = '';
    if (target === 'telegram') url = `https://t.me/share/url?url=${text}`;
    else if (target === 'whatsapp') url = `https://wa.me/?text=${text}`;
    else if (target === 'rubika') { copy(); url = 'https://rubika.ir'; }
    else if (target === 'bale') { copy(); url = 'https://web.bale.ai'; }

    if (url) window.open(url, '_blank');
  };

  if (err && !d) return <section className="card wide"><p className="hint">{err}</p></section>;
  if (!d) return <section className="card wide"><p className="hint">در حال بارگذاری…</p></section>;

  const board = d.inviteLeague || {};
  const allTime = board.allTime || { rows: [], me: null, meInTop: false };
  const league = board.league || null;
  const history = board.history || [];
  // رتبهٔ من وقتی در تاپ ۱۰ هست در همان جدول دیده می‌شود؛ وگرنه ردیفِ
  // جداگانه‌ای زیرِ جدول می‌آید («رنک هر فرد رو هم نشون بده حتی اگه تو تاپ
  // ۱۰ نباشه»).
  const showMyRow = (data) => data.me && !data.meInTop;

  return (
    /* لنگرِ تور: بخشِ «دعوت دوستان» بعد از بازکردنِ شیت و کلیکِ آیتم،
       روی همین سرصفحه می‌نشیند. */
    <section className="card wide refPage" data-tour="invite:top">
      <div className="refHead">
        <h2>دعوت از دوستان</h2>
        <p className="hint">
          کدت را به دوستانت بده. هر کس موقع ثبت‌نام آن را وارد کند،
          {' '}<b>هر دوی شما {fa(d.spinsPerReferral)} چرخش گردونه</b> هدیه می‌گیرید.
        </p>
      </div>

      <div className="refCodeBox">
        <div className="refCodeInner">
          <span className="refLabel">کد اختصاصی شما:</span>
          <span className="refCode" dir="ltr">{d.code}</span>
        </div>
        <button className="btn primary" onClick={copy}>کپی کد</button>
      </div>

      <div className="refMessengers">
        <span>ارسال مستقیم برای دوستان:</span>
        <div className="refBtnGroup">
          <button className="msgBtn tg" onClick={() => shareTo('telegram')}>
            <span className="msgDot" /> تلگرام
          </button>
          <button className="msgBtn wa" onClick={() => shareTo('whatsapp')}>
            <span className="msgDot" /> واتس‌اپ
          </button>
          <button className="msgBtn rb" onClick={() => shareTo('rubika')}>
            <span className="msgDot" /> روبیکا
          </button>
          <button className="msgBtn bl" onClick={() => shareTo('bale')}>
            <span className="msgDot" /> بله
          </button>
        </div>
      </div>

      <div style={{ margin:'12px 0', padding:'14px', borderRadius:'16px', border:'1px solid rgba(34,231,166,.38)', background:'linear-gradient(135deg,rgba(34,231,166,.12),rgba(56,189,248,.08))' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
          <div><small style={{color:'#9FB0C3'}}>درآمد نقدی معرفی از خریدها</small><div style={{fontSize:'24px',fontWeight:950,color:'#22E7A6'}}>{fa(d.cashCommissionEarned)} تومان</div></div>
          <div style={{textAlign:'left'}}><small style={{color:'#9FB0C3'}}>موجودی کیف پول</small><div style={{fontWeight:900}}>{fa(d.walletBalance)} تومان</div></div>
          <span style={{padding:'6px 9px',borderRadius:'999px',fontSize:'10px',fontWeight:900,background:d.cashWithdrawReady?'rgba(34,197,94,.18)':'rgba(255,209,102,.14)',color:d.cashWithdrawReady?'#4ADE80':'#FFD166'}}>
            {d.cashWithdrawReady ? 'آماده درخواست برداشت' : `تا برداشت: حداقل ${fa(d.withdrawalThreshold)} تومان`}
          </span>
        </div>
        <p style={{margin:'9px 0 0',fontSize:'10px',color:'#B8C5D4'}}>{fa(d.purchaseCommissionPercent)}٪ هر خرید دوست مستقیم، اتمیک و قابل رهگیری به کیف پولت واریز می‌شود. سطح دوم و کمیسیون زنجیره‌ای نداریم.</p>
      </div>

      <div className="refStats">
        <div><b>{fa(d.invitedCount)}</b><span>دوست دعوت‌شده</span></div>
        <div><b>{fa(d.totalEarned)}</b><span>امتیاز از دوستان</span></div>
        <div><b>{fa(d.dailySpins)}</b><span>چرخش روزانه</span></div>
      </div>

      {/* ═══════════════ دو تبِ معرف‌ها ═══════════════ */}
      <div className="refTabs" role="tablist">
        <button role="tab" aria-selected={tab === 'top'}
          className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>
          <SvgIcon name="trophy" size={16} />
          {text('inviteLeague.allTimeTitle', <>معرف‌های برتر تا کنون</>)}
        </button>
        <button role="tab" aria-selected={tab === 'league'}
          className={tab === 'league' ? 'on' : ''} onClick={() => setTab('league')}>
          <SvgIcon name="game" size={16} />
          {text('inviteLeague.leagueTitle', <>لیگ معرف‌ها</>)}
          {league && <i className="refTabDot" aria-hidden="true" />}
        </button>
      </div>

      {tab === 'top' && (
        <div className="refBoard">
          <div className="refBoardHead">
            <b>{text('inviteLeague.allTimeTitle', <>معرف‌های برتر تا کنون</>)}</b>
            <span className="refBoardSub">رکورددارانِ معرفی از ابتدا تا امروز</span>
          </div>
          {allTime.rows.length === 0 ? (
            <p className="hint refEmpty">هنوز کسی کسی را دعوت نکرده. تو اولین نفر باش!</p>
          ) : (
            <ul className="refBoardList">
              {allTime.rows.map((row, i) => (
                <BoardRow key={row.userId || i} row={row} me={allTime.me?.userId === row.userId} />
              ))}
              {showMyRow(allTime) && (
                <>
                  <li className="refBoardGap" aria-hidden="true">•••</li>
                  <BoardRow row={allTime.me} me />
                </>
              )}
            </ul>
          )}
          <p className="hint" style={{ marginTop: 10 }}>
            {text('inviteLeague.rulesNote',
              <>فقط دعوتِ معتبر شمرده می‌شود (کاربری که با کد شما ثبت‌نام کرده و فعال است). اگر دو نفر تعدادشان برابر شود، آن‌که زودتر به آن عدد رسیده بالاتر می‌ایستد.</>)}
          </p>
          {allTime.me && (
            <p className="hint">
              {text('inviteLeague.myRankNote', <>رتبهٔ تو همیشه پایینِ جدول می‌آید؛ حتی وقتی بیرونِ ده نفرِ اول باشی.</>)}
            </p>
          )}
        </div>
      )}

      {tab === 'league' && (
        <div className="refBoard">
          {!league ? (
            <p className="hint refEmpty">
              {text('inviteLeague.emptyNote',
                <>هنوز لیگی برای معرف‌ها ساخته نشده است. هر وقت مدیر یک لیگ بسازد، همین‌جا برگزار می‌شود.</>)}
            </p>
          ) : (
            <>
              <div className="refBoardHead">
                <b>{league.title}</b>
                <span className="refBoardSub">{remainingLabel(league.endsAt)}</span>
              </div>
              {league.prizes?.length > 0 && (
                <ul className="refPrizes">
                  {league.prizes.map((p, i) => (
                    <li key={i}>
                      <span>{p.label || `رتبهٔ ${fa(p.rank)}`}</span>
                      <b>
                        {[
                          p.cash > 0 ? `${fa(p.cash)} تومان` : null,
                          p.points > 0 ? `${fa(p.points)} امتیاز` : null,
                          p.coins > 0 ? `${fa(p.coins)} سکه` : null,
                          p.spins > 0 ? `${fa(p.spins)} چرخش` : null,
                        ].filter(Boolean).join(' + ')}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
              {Number(league.minInvites) > 1 && (
                <p className="hint">برای ورود به جدولِ این لیگ حداقل {fa(league.minInvites)} دعوتِ معتبر لازم است.</p>
              )}
              {league.rows.length === 0 ? (
                <p className="hint refEmpty">هنوز کسی به حداقلِ دعوتِ این لیگ نرسیده — جای اول خالیه!</p>
              ) : (
                <ul className="refBoardList">
                  {league.rows.map((row, i) => (
                    <BoardRow key={row.userId || i} row={row} me={league.me?.userId === row.userId} />
                  ))}
                  {showMyRow(league) && (
                    <>
                      <li className="refBoardGap" aria-hidden="true">•••</li>
                      <BoardRow row={league.me} me />
                    </>
                  )}
                </ul>
              )}
              <p className="hint" style={{ marginTop: 10 }}>
                {text('inviteLeague.payoutNote',
                  <>جایزه پس از پایانِ لیگ، بعد از تأییدِ مدیر به حسابت واریز می‌شود.</>)}
              </p>
            </>
          )}

          {history.length > 0 && (
            <div className="refPast">
              <b>لیگ‌های تمام‌شده:</b>
              <ul>
                {history.map((h, i) => (
                  <li key={i}>
                    <span>{h.title}</span>
                    <b>
                      {h.top?.length
                        ? h.top.map(t => `${t.nickname} (${fa(t.invites)})`).join(' · ')
                        : 'بدون برنده'}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="refRulesBox">
        <b>مزایای معرفی دوستان:</b>
        <ul>
          <li><b>{fa(d.purchaseCommissionPercent)}٪ درآمد نقدی</b> از تمام خریدهای دوستان مستقیم، با آستانه برداشت {fa(d.withdrawalThreshold)} تومان.</li>
          <li><b>{fa(d.commissionPercent)}٪ کمیسیون امتیازی</b> از امتیازات حاصل از ثبت کارت و بازی ضربه‌زن دوست شما.</li>
          <li>{text('referral.dailySpinRule',
            <>هر <b>{fa(d.invitesPerDailySpin)} دعوت</b> = ۱ چرخش روزانه دائمی به گردونه شانس (تا سقف {fa(d.maxInvitesForDaily)} نفر).</>,
            {
              invitesPerDailySpin: d.invitesPerDailySpin,
              // `?? 1` فقط وقتی لازم است که سرورِ قدیمی این عدد را در
              // `referral` نگذارد؛ همان لحظه هم بهتر است از `live_rules`
              // بخوانیم تا از یک رقمِ دستی: ادمین «هر آستانه = ۲ چرخش» را
              // در همان پنل تنظیم می‌کند.
              spinsPerDailyThreshold: d.spinsPerDailyThreshold
                ?? ruleNumber('spinsPerDailyThreshold', 1),
              maxInvitesForDaily: d.maxInvitesForDaily,
            })}</li>
          <li><b>دعوت نامحدود</b> برای دریافت چرخش‌های هدیه و جوایز.</li>
        </ul>
      </div>

      {d.friends.length > 0 ? (
        <div className="refList">
          <h3>دوستان تو ({fa(d.friends.length)})</h3>
          <ul>
            {d.friends.map((f, i) => (
              <li key={i}>
                <span>{f.nickname}</span>
                <b style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'flex-end'}}><span>+{fa(f.earnedFromThem)} امتیاز</span><span style={{color:'#22E7A6'}}>+{fa(f.cashEarnedFromThem)} تومان</span></b>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint refEmpty">
          هنوز کسی با کد تو عضو نشده. اولین نفر را دعوت کن!
        </p>
      )}
    </section>
  );
}
