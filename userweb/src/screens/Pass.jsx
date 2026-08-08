// گذر نبرد فصلی — «مسیر قلقلی»
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این صفحه از صفر بازنویسی شد
// ═══════════════════════════════════════════════════════════════════════════
//
// بازخورد مالک روی نسخهٔ اول: «ظاهرش خیلی زشت و غیر قابل مفهوم هستش ...
// یه اسکرول بار هم باید طراحی کنی که کاربرها بفهمن بعضی چیزا تو صفحه
// پایین تر قرار داده شده».
//
// سه اشکال ریشه‌ای داشت و هر سه اینجا حل شده:
//
// ۱. **اسکرول افقی برای ۵۰ پله** — کاربر نمی‌فهمید مسیر ادامه دارد و
//    خانه‌های کوچک متن فارسی را می‌بریدند. حالا لیست عمودی است.
// ۲. **هیچ نشانه‌ای از ادامهٔ صفحه نبود** — حالا یک نوار پیشرفتِ اسکرول
//    همیشه‌پیدا در لبه هست که شمارهٔ پله را هم نشان می‌دهد.
// ۳. **مسطح و بی‌روح** — حالا بنر تصویری، آیکون‌های سه‌بعدی و انیمیشن.
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

function RewardTile({ r, unlocked, track, onClaim, busy }) {
  if (!r) return <div className="pTile pTileEmpty">—</div>;
  const claimed = r.claimed;
  const locked = r.locked;
  const ready = unlocked && !claimed && !locked;
  const cls = ['pTile', `pTile-${track}`,
    claimed ? 'is-claimed' : '', locked ? 'is-locked' : '',
    ready ? 'is-ready' : ''].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={!ready || busy}
      onClick={() => ready && onClaim(r.id)}
      title={locked ? 'مخصوص اعضای قلقلی پلاس' : rewardText(r)}>
      <span className="pTileArt">
        {ART[r.kind]
          ? <img src={ART[r.kind]} alt="" width="30" height="30" loading="lazy" />
          : <AssetIcon name={r.kind === 'cash' ? 'points' : 'gift'} size={30} />}
      </span>
      <span className="pTileBody">
        <b>{rewardText(r)}</b>
        {claimed && <small className="ok"><SvgIcon name="check" size={13} /> گرفتی</small>}
        {locked && <small className="plus"><SvgIcon name="trophy" size={13} /> فقط پلاس</small>}
        {ready && <small className="ready">برای گرفتن بزن</small>}
      </span>
    </button>
  );
}

export default function Pass({ token, setMsg, openShop }) {
  const load = useCallback(() => req('/api/pass', 'GET', null, token), [token]);
  const st = useAsync(load);
  const [busy, setBusy] = useState(false);
  const [frac, setFrac] = useState(0);
  const listRef = useRef(null);
  const jumped = useRef(false);

  // نوار پیشرفتِ اسکرول — روی کل پنجره، چون لیست داخل جریان صفحه است.
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setFrac(max <= 0 ? 0 : Math.min(1, Math.max(0, h.scrollTop / max)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // پرش خودکار به پلهٔ فعلی: کاربری که در پلهٔ ۲۰ است نباید از ۱ شروع کند.
  useEffect(() => {
    if (jumped.current || !st.data?.active) return;
    const t = st.data.tier;
    if (t > 1) {
      const el = document.getElementById(`pass-tier-${Math.max(1, t - 1)}`);
      if (el) {
        jumped.current = true;
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
      }
    } else {
      jumped.current = true;
    }
  }, [st.data]);

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
      setMsg?.(r.message);
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

        return (
          <div className="pWrap" ref={listRef}>
            {/* نوار پیشرفتِ اسکرول — همیشه پیدا */}
            <div className="pRail" aria-hidden="true">
              <div className="pRailThumb" style={{ top: `${frac * 100}%` }}>
                {fa(Math.max(1, Math.round(frac * d.tierCount)))}
              </div>
            </div>

            {/* ── بنر ── */}
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
                {!done && <span>{fa(d.intoTier)} / {fa(d.tierNeeds)}</span>}
              </div>
              <div className="pBar"><div className="pBarFill" style={{ width: `${pct}%` }} /></div>

              <div className="pDayCap">
                <span className={d.dayCapReached ? 'capFull' : ''}>
                  {d.dayCapReached
                    ? `سقف امروز پر شد — فردا ${fa(d.maxTiersPerDay)} پلهٔ دیگر`
                    : `امروز ${fa(d.tiersToday)} از ${fa(d.maxTiersPerDay)} پله`}
                </span>
                <span className="pDots">
                  {Array.from({ length: d.maxTiersPerDay }).map((_, i) => (
                    <i key={i} className={i < d.tiersToday ? 'on' : ''} />
                  ))}
                </span>
              </div>
              {d.pendingTiers > 0 && (
                <p className="pPending">
                  {fa(d.pendingTiers)} پله ذخیره شده — به‌محض باز شدن سقف آزاد می‌شود
                </p>
              )}

              {d.claimable > 0 && (
                <button className="btn primary pClaimAll" disabled={busy} onClick={claimAll}>
                  دریافت {fa(d.claimable)} جایزهٔ آماده
                </button>
              )}
            </div>

            {!d.hasPlus && (
              <div className="card pUpsell">
                <span className="pUpsellStar"><UiIcon name="trophy" size={24} /></span>
                <div>
                  <b>مسیر طلایی قفل است</b>
                  <span>چرخش گردونه، آیتم‌های ویژه و امتیاز دو برابر</span>
                </div>
                <button className="btn" onClick={openShop}>بازکردن</button>
              </div>
            )}

            {/* ── راهنمای مسیرها ── */}
            <div className="pLegend">
              <i className="chip free">رایگان</i>
              <i className="chip plus"><UiIcon name="trophy" size={15} /> پلاس</i>
              <span className="muted">{fa(d.tierCount)} پله</span>
            </div>

            {/* ── پله‌ها ── */}
            <div className="pTiers">
              {d.tiers.map((row) => {
                const isCurrent = row.tier === d.tier + 1;
                // ── نشانهٔ مایلستون هر ۵ پله ──
                //
                // ۵۰ ردیفِ کاملاً یکسان هیچ نقطهٔ اتکایی برای چشم
                // نداشت: در اسکرین‌شاتِ تمام‌صفحه، ۱۰٬۶۸۲ پیکسل یکنواخت
                // بود و کاربر موقعِ اسکرول نمی‌فهمید کجای مسیر است.
                //
                // هر پنجمین ردیف شمارهٔ درشتِ طلایی می‌گیرد و مثلِ
                // تابلوی کیلومترشمار کار می‌کند.
                const isMilestone = row.tier % 5 === 0;
                return (
                  <div key={row.tier} id={`pass-tier-${row.tier}`}
                    className={`pRow${isCurrent ? ' is-current' : ''}${row.unlocked ? ' is-unlocked' : ''}${isMilestone ? ' is-milestone' : ''}`}>
                    <div className="pNum">
                      <span className="pLock"><SvgIcon name={row.unlocked ? 'unlock' : 'lock'} size={16} /></span>
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

            {/* ── راهنما ── */}
            <div className="card pHow">
              <h3><SvgIcon name="bulb" size={21} /> چطور جلو بروم؟</h3>
              <p className="muted">
                با بازی کردن تجربه می‌گیری —
                هر روز حداکثر {fa(d.maxTiersPerDay)} پله باز می‌شود، پس هر روز سر بزن.
              </p>
              <ul className="pSources">
                {d.sources.map((s) => (
                  <li key={s.source}>
                    <b>{s.label}</b>
                    <span className="xp">+{fa(s.xp)}</span>
                    <small>تا {fa(s.dailyCap)}</small>
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
