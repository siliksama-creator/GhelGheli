// گذر نبرد فصلی — «مسیر قلقلی»
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه این شکلی است
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «یه جایگاه زیبا مناسب بزار هم تو چشم باشن و هم فارسی
// برای کاربر قابل فهم باشه».
//
// سه تصمیم طراحی که از همین جمله در آمد:
//
// ۱. دو ردیفِ موازی، نه یک لیست.
//    مسیر رایگان بالا، مسیر پلاس پایین، پله‌ها زیر هم. کاربر در یک نگاه
//    می‌بیند که در هر پله **چه چیزی را از دست می‌دهد** اگر پلاس نخرد.
//    اگر جوایز پلاس پنهان بودند، هیچ‌کس دلیلی برای خرید نداشت.
//
// ۲. اسکرول افقی با پله‌های بزرگ.
//    ۵۰ پله در یک صفحهٔ موبایل جا نمی‌شود. اسکرول افقی همان الگویی است
//    که همهٔ گذرهای نبرد دارند و کاربر ایرانی هم با آن آشناست.
//
// ۳. همه‌چیز فارسی و بدون اصطلاح فنی.
//    «XP» نوشته نشده؛ «امتیاز تجربه» هم گنگ است. به‌جایش نوار پیشرفت و
//    «تا پلهٔ بعد: ۴۵» — عدد ملموس، بدون اصطلاح.
import React, { useCallback, useState } from 'react';

import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection } from '../components/states.jsx';

/** آیکون هر نوع جایزه. */
const KIND_ICON = {
  points: '🎯',
  spins: '🎡',
  cash: '💰',
  shop_item: '🎨',
};

/** متن فارسیِ خواناى جایزه. */
function rewardText(r) {
  if (!r) return '—';
  if (r.kind === 'points') return `${fa(r.amount)} امتیاز`;
  if (r.kind === 'spins') return `${fa(r.amount)} چرخش`;
  if (r.kind === 'cash') return `${fa(r.amount)} تومان`;
  return r.label || 'آیتم ویژه';
}

function RewardCell({ r, unlocked, onClaim, busy }) {
  if (!r) return <div className="passCell passCellEmpty">—</div>;
  const cls = [
    'passCell',
    r.claimed ? 'is-claimed' : '',
    r.locked ? 'is-locked' : '',
    unlocked && !r.claimed && !r.locked ? 'is-ready' : '',
  ].join(' ');
  return (
    <button
      className={cls}
      disabled={!unlocked || r.claimed || r.locked || busy}
      onClick={() => onClaim(r.id)}
      title={r.locked ? 'مخصوص اعضای قلقلی پلاس' : rewardText(r)}
    >
      <span className="passCellIcon">{KIND_ICON[r.kind] || '🎁'}</span>
      <span className="passCellText">{rewardText(r)}</span>
      {r.claimed && <span className="passCellTick">✓</span>}
      {r.locked && <span className="passCellLock">🔒</span>}
    </button>
  );
}

export default function Pass({ token, setMsg, openShop }) {
  const load = useCallback(() => req('/api/pass', 'GET', null, token), [token]);
  const st = useAsync(load);
  const [busy, setBusy] = useState(false);

  const claim = async (tierId) => {
    setBusy(true);
    try {
      const r = await req(`/api/pass/claim/${tierId}`, 'POST', {}, token);
      setMsg?.(r.message || 'جایزه دریافت شد');
      st.reload();
    } catch (e) {
      setMsg?.(e.message || 'دریافت جایزه ناموفق بود');
    } finally { setBusy(false); }
  };

  const claimAll = async () => {
    setBusy(true);
    try {
      const r = await req('/api/pass/claim-all', 'POST', {}, token);
      setMsg?.(r.message);
      st.reload();
    } catch (e) {
      setMsg?.(e.message || 'ناموفق');
    } finally { setBusy(false); }
  };

  return (
    <AsyncSection state={st}>
      {(d) => {
        if (!d?.active) {
          return (
            <div className="card">
              <h2>🏅 گذر نبرد</h2>
              <p className="muted">الان فصلی فعال نیست. به‌زودی برمی‌گردیم!</p>
            </div>
          );
        }
        const pct = d.tierNeeds > 0
          ? Math.round((d.intoTier / d.tierNeeds) * 100) : 100;
        return (
          <div className="passWrap">
            {/* ── سربرگ فصل ── */}
            <div className="card passHead">
              <div className="passHeadTop">
                <div>
                  <h2 className="passTitle">🏅 {d.season.name}</h2>
                  <p className="passSub">
                    {fa(d.season.daysLeft)} روز تا پایان فصل
                  </p>
                </div>
                <div className="passTierBadge">
                  <b>{fa(d.tier)}</b>
                  <small>از {fa(d.tierCount)}</small>
                </div>
              </div>

              <div className="passBar">
                <div className="passBarFill" style={{ width: `${pct}%` }} />
              </div>
              <p className="passBarNote">
                {d.tier >= d.tierCount
                  ? '🎉 کل مسیر را تمام کردی!'
                  : <>تا پلهٔ بعد: <b>{fa(Math.max(0, d.tierNeeds - d.intoTier))}</b> امتیاز تجربه</>}
              </p>

              {!d.hasPlus && (
                <div className="passUpsell">
                  <div>
                    <b>مسیر پلاس قفل است</b>
                    <span>جایزهٔ نقدی، چرخش گردونه و آیتم‌های ویژه</span>
                  </div>
                  <button className="btn primary" onClick={openShop}>
                    فعال‌سازی پلاس
                  </button>
                </div>
              )}

              {d.claimable > 0 && (
                <button className="btn primary passClaimAll"
                  disabled={busy} onClick={claimAll}>
                  🎁 دریافت {fa(d.claimable)} جایزهٔ آماده
                </button>
              )}
            </div>

            {/* ── مسیر ── */}
            <div className="card passTrackCard">
              <div className="passLegend">
                <span><i className="dot free" /> رایگان</span>
                <span><i className="dot plus" /> پلاس</span>
              </div>

              <div className="passScroll">
                <div className="passRowLabels">
                  <span>رایگان</span>
                  <span>پله</span>
                  <span>پلاس</span>
                </div>
                <div className="passTiers">
                  {d.tiers.map((row) => (
                    <div key={row.tier}
                      className={`passCol${row.unlocked ? ' is-unlocked' : ''}`}>
                      <RewardCell r={row.free} unlocked={row.unlocked}
                        onClaim={claim} busy={busy} />
                      <div className="passTierNo">{fa(row.tier)}</div>
                      <RewardCell r={row.plus} unlocked={row.unlocked}
                        onClaim={claim} busy={busy} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── چطور امتیاز تجربه بگیرم ── */}
            <div className="card">
              <h3 className="passHow">چطور در مسیر جلو بروم؟</h3>
              <p className="muted passHowNote">
                امتیاز تجربه فقط با <b>بازی کردن</b> به دست می‌آید — خریدنی
                نیست. هر کار سقف روزانهٔ خودش را دارد.
              </p>
              <ul className="passSources">
                {d.sources.map((s) => (
                  <li key={s.source}>
                    <b>{s.label}</b>
                    <span>{fa(s.xp)} امتیاز</span>
                    <small>تا {fa(s.dailyCap)} در روز</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      }}
    </AsyncSection>
  );
}
