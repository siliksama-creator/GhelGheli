// گذر نبرد فصلی — «مسیر قلقلی»
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection } from '../components/states.jsx';
import { AssetIcon, SvgIcon, UiIcon } from '../components/IconAsset.jsx';

const ART = {
  points: '/icon_points.png',
  spins: '/icon_spins.png',
  shop_item: '/icon_item.png',
};

function rewardText(r) {
  if (!r) return '—';
  if (r.kind === 'points') return `${fa(r.amount)} امتیاز`;
  if (r.kind === 'spins') return `${fa(r.amount)} چرخش`;
  if (r.kind === 'cash') return `${fa(r.amount)} تومان`;
  return r.label || 'آیتم ویژه';
}

function RewardTile({ r, unlocked, track, onClaim, onOpenShop, busy }) {
  if (!r) return <div className="pTile pTileEmpty">—</div>;
  const claimed = r.claimed;
  const locked = r.locked;
  const ready = unlocked && !claimed && !locked;
  const cls = ['pTile', `pTile-${track}`,
    claimed ? 'is-claimed' : '', locked ? 'is-locked' : '',
    ready ? 'is-ready' : ''].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={claimed || busy}
      onClick={() => {
        if (ready) onClaim(r.id);
        else if (locked && onOpenShop) onOpenShop();
      }}
      title={locked ? 'مخصوص اعضای قلقلی پلاس — برای فعال‌سازی کلیک کنید' : rewardText(r)}>
      <span className="pTileArt">
        {ART[r.kind]
          ? <img src={ART[r.kind]} alt="" width="28" height="28" loading="lazy" />
          : <AssetIcon name={r.kind === 'cash' ? 'points' : 'gift'} size={28} />}
      </span>
      <span className="pTileBody">
        <b>{rewardText(r)}</b>
        {claimed && <small className="ok">✓ گرفتی</small>}
        {locked && <small className="plus">★ پلاس</small>}
        {ready && <small className="ready">برای گرفتن بزن</small>}
      </span>
    </button>
  );
}

export default function Pass({ token, setMsg, openShop }) {
  const load = useCallback(() => req('/api/pass', 'GET', null, token), [token]);
  const st = useAsync(load);
  const [busy, setBusy] = useState(false);
  const [showClaimed, setShowClaimed] = useState(false);
  const jumped = useRef(false);

  const claim = async (tierId) => {
    setBusy(true);
    try {
      const r = await req(`/api/pass/claim/${tierId}`, 'POST', {}, token);
      setMsg?.(r.message || 'جایزه گرفتی!');
      st.reload();
    } catch (e) { setMsg?.(e.message || 'دریافت جایزه ناموفق بود'); }
    finally { setBusy(false); }
  };

  const claimAll = async () => {
    setBusy(true);
    try {
      const r = await req('/api/pass/claim-all', 'POST', {}, token);
      setMsg?.(r.message || 'جوایز دریافت شد');
      st.reload();
    } catch (e) { setMsg?.(e.message || 'ناموفق'); }
    finally { setBusy(false); }
  };

  return (
    <AsyncSection state={st}>
      {(d) => {
        if (!d?.active) {
          return (
            <div className="card pEmpty">
              <div className="pEmptyIcon"><UiIcon name="trophy" size={56} /></div>
              <h2>فصلی در جریان نیست</h2>
              <p className="muted">فصل بعدی به‌زودی شروع می‌شود</p>
            </div>
          );
        }
        const pct = d.tierNeeds > 0
          ? Math.round((d.intoTier / d.tierNeeds) * 100) : 100;
        const done = d.tier >= d.tierCount;

        // Fold already-completed tiers
        const isTierDone = (row) => {
          const freeDone = !row.free || row.free.claimed;
          const plusDone = !row.plus || row.plus.claimed || row.plus.locked;
          return row.unlocked && freeDone && plusDone && row.tier < d.tier;
        };

        const claimedTiers = d.tiers.filter(isTierDone);
        const activeTiers = d.tiers.filter(r => showClaimed || !isTierDone(r));

        return (
          <div className="pWrap">
            {/* ── بنر فشرده ── */}
            <div className="pBanner">
              <img src="/pass_banner.webp" alt="" loading="eager" />
              <div className="pBannerFade" />
              <div className="pBannerText">
                <div>
                  <h2>{d.season.name}</h2>
                  <span>{fa(d.season.daysLeft)} روز تا پایان فصل</span>
                </div>
                <div className="pMedal">
                  <b>{fa(d.tier)}</b>
                  <small>از {fa(d.tierCount)}</small>
                </div>
              </div>
            </div>

            {/* ── پیشرفت ── */}
            <div className="card pProgress">
              <div className="pProgressTop">
                <b>{done ? 'کل مسیر را تمام کردی!' : `تا پلهٔ ${fa(d.tier + 1)}`}</b>
                {!done && <span>{fa(d.intoTier)} / {fa(d.tierNeeds)} XP</span>}
              </div>
              <div className="pBar"><div className="pBarFill" style={{ width: `${pct}%` }} /></div>

              <div className="pDayCap">
                <span className={d.dayCapReached ? 'capFull' : ''}>
                  {d.dayCapReached
                    ? `سقف امروز پر شد — فردا ${fa(d.maxTiersPerDay)} پلهٔ دیگر`
                    : `امروز ${fa(d.tiersToday)} از ${fa(d.maxTiersPerDay)} پله باز شد`}
                </span>
                <span className="pDots">
                  {Array.from({ length: d.maxTiersPerDay }).map((_, i) => (
                    <i key={i} className={i < d.tiersToday ? 'on' : ''} />
                  ))}
                </span>
              </div>

              {d.claimable > 0 && (
                <button className="btn primary pClaimAll" disabled={busy} onClick={claimAll}>
                  دریافت {fa(d.claimable)} جایزهٔ آماده
                </button>
              )}
            </div>

            {/* ── اینفوگرافیک سریع کسب تجربه (Visual XP Infographic) ── */}
            <div className="card pXpInfographic">
              <div className="pXpTitle">
                <span>چطور پله‌های گذر نبرد را سریع‌تر باز کنم؟</span>
                <small>حداکثر {fa(d.maxTiersPerDay)} پله در هر روز</small>
              </div>
              <div className="pSourcesPills">
                <span className="xpPill"><UiIcon name="game" size={14} /> بازی آنلاین <b>+۱۵/۲۵</b></span>
                <span className="xpPill"><UiIcon name="bolt" size={14} /> ضربه‌زن <b>+۳۰</b></span>
                <span className="xpPill"><UiIcon name="wheel" size={14} /> گردونه <b>+۲۰</b></span>
                <span className="xpPill"><UiIcon name="group" size={14} /> دعوت دوست <b>+۱۰۰</b></span>
                <span className="xpPill"><UiIcon name="calendar" size={14} /> ورود روزانه <b>+۲۰</b></span>
              </div>
            </div>

            {!d.hasPlus && (
              <div className="card pUpsell">
                <span className="pUpsellStar" style={{ color: '#FFD166' }}>★</span>
                <div>
                  <b>مسیر طلایی پلاس</b>
                  <span>جوایز نقدی، چرخش گردونه و آیتم‌های اختصاصی</span>
                </div>
                <button className="btn" onClick={openShop}>خرید پلاس</button>
              </div>
            )}

            {/* ── راهنمای مسیرها ── */}
            <div className="pLegend">
              <i className="chip free">مسیر رایگان</i>
              <i className="chip plus" style={{ color: '#FFD166' }}>★ مسیر پلاس</i>
              <span className="muted">{fa(d.tierCount)} پله</span>
            </div>

            {/* دکمه باز/بستن پله‌های قبلی */}
            {claimedTiers.length > 0 && (
              <button className="btn ghost pFoldBtn" onClick={() => setShowClaimed(!showClaimed)}>
                {showClaimed
                  ? `▲ بستن پله‌های قبلی`
                  : `▼ مشاهده ${fa(claimedTiers.length)} پله تکمیل‌شده قبلی`}
              </button>
            )}

            {/* ── پله‌ها ── */}
            <div className="pTiers">
              {activeTiers.map((row) => {
                const isCurrent = row.tier === d.tier + 1;
                const isMilestone = row.tier % 5 === 0;
                return (
                  <div key={row.tier} id={`pass-tier-${row.tier}`}
                    className={`pRow${isCurrent ? ' is-current' : ''}${row.unlocked ? ' is-unlocked' : ''}${isMilestone ? ' is-milestone' : ''}`}>
                    <div className="pNum">
                      <b>{fa(row.tier)}</b>
                    </div>
                    <RewardTile r={row.free} unlocked={row.unlocked}
                      track="free" onClaim={claim} busy={busy} />
                    <RewardTile r={row.plus} unlocked={row.unlocked}
                      track="plus" onClaim={claim} busy={busy} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      }}
    </AsyncSection>
  );
}
