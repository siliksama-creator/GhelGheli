// Reward groups: two parallel prize tracks, each with its own progress bar,
// prize artwork and required-card strip.
import React, { useCallback, useState } from 'react';

import { req, asset, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection, EmptyView } from '../components/states.jsx';

const ACCENTS = {
  emerald: '#00D49A', gold: '#FFC53D', blue: '#60A5FA',
  purple: '#A855F7', rose: '#F87171', slate: '#94A3B8',
};

function GroupBar({ group, accent }) {
  const next = group.nextTier;
  const pct = Math.round((group.progress || 0) * 100);
  const remaining = next
    ? Math.max(0, next.requiredPoints - group.earnedPoints) : 0;

  return (
    <div className="rgBar">
      <div className="rgBarHead">
        {next?.imageUrl && (
          <img className="rgPrizeArt" src={asset(next.imageUrl)}
            alt={next.name} />
        )}
        <div className="rgBarText">
          <b>{next ? next.name : 'همهٔ جوایز این گروه دریافت شد'}</b>
          {next && (
            <small>
              {remaining > 0
                ? `${fa(remaining)} امتیاز تا دریافت`
                : 'آمادهٔ دریافت!'}
            </small>
          )}
        </div>
        <span className="rgPct" style={{ color: accent }}>{fa(pct)}٪</span>
      </div>

      <div className="rgTrack">
        <span style={{ width: pct + '%', background: accent }} />
      </div>
      <div className="rgScale">
        <span>{fa(group.earnedPoints)}</span>
        <span>{next ? fa(next.requiredPoints) : '—'}</span>
      </div>

      {/* Cards this prize needs, with the artwork and how many you hold. */}
      {next?.requiredCards?.length > 0 && (
        <div className="rgCards">
          <small>کارت‌های لازم:</small>
          <div className="rgCardStrip">
            {next.requiredCards.map(c => (
              <div className={`rgCard${c.met ? ' met' : ''}`} key={c.cardTypeId}
                title={c.name}>
                <img src={asset(c.imageUrl) || '/avatars/avatar_1_football.png'}
                  alt={c.name} />
                <b>{fa(c.have)}/{fa(c.quantity)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TierCard({ tier, accent, onClaim, busy }) {
  return (
    <div className={`rgTier${tier.eligible ? ' eligible' : ''}`}>
      <div className="rgTierArt">
        <img src={asset(tier.imageUrl) || '/avatars/avatar_2_trophy.png'}
          alt={tier.name} />
        <span className={`rgKind ${tier.rewardType}`}>
          {tier.rewardType === 'cash' ? '💰 نقدی' : '🎁 فیزیکی'}
        </span>
      </div>
      <b>{tier.name}</b>
      <p className="rgPoints">{fa(tier.requiredPoints)} امتیاز</p>
      {tier.rewardType === 'cash' && tier.cashAmount > 0 && (
        <p className="rgCash">{fa(tier.cashAmount)} تومان</p>
      )}
      {tier.rewardValue && <small>{tier.rewardValue}</small>}

      {tier.requiredCards?.length > 0 && (
        <div className="rgTierCards">
          {tier.requiredCards.map(c => (
            <span key={c.cardTypeId} className={c.met ? 'met' : ''}>
              {c.name} {fa(c.have)}/{fa(c.quantity)}
            </span>
          ))}
        </div>
      )}

      {tier.eligible ? (
        <button className="main rgClaim" disabled={busy}
          onClick={() => onClaim(tier)} style={{ background: accent }}>
          {busy ? 'در حال ثبت...' : 'دریافت'}
        </button>
      ) : (
        <span className="rgLocked">
          {!tier.pointsMet ? 'امتیاز کافی نیست' : 'کارت‌های لازم را نداری'}
        </span>
      )}
    </div>
  );
}

export default function Rewards({ token, setMsg, reloadProfile }) {
  const load = useCallback(
    () => req('/api/reward-groups', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);

  async function claim(tier) {
    if (busy) return;
    setBusy(tier.id);
    setConfirm(null);
    try {
      const d = await req(`/api/rewards/${tier.id}/claim`, 'POST', {}, token);
      setMsg?.(d.message);
      // Claiming moves the group baseline and may credit the wallet, so both
      // the catalogue and the header balance must be re-read.
      state.reload();
      reloadProfile?.();
    } catch (e) {
      setMsg?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری جوایز...">
      {data => {
        const groups = (data.groups || []).filter(g => g.tiers?.length);
        if (!groups.length) {
          return (
            <section className="card wide">
              <h2>جوایز</h2>
              <EmptyView icon="🎁">هنوز جایزه‌ای تعریف نشده است.</EmptyView>
            </section>
          );
        }

        return (
          <div className="rgWrap">
            {groups.map(g => {
              const accent = ACCENTS[g.accent] || ACCENTS.emerald;
              return (
                <section className="card wide rgGroup" key={g.id || 'none'}
                  style={{ '--accent': accent }}>
                  <div className="rgHead">
                    {g.imageUrl && (
                      <img className="rgGroupArt" src={asset(g.imageUrl)}
                        alt={g.name} />
                    )}
                    <div>
                      <h2>{g.name}</h2>
                      {g.description && <p className="hint">{g.description}</p>}
                    </div>
                    <span className="rgType" style={{ background: accent }}>
                      {g.groupType === 'cash' ? 'نقدی'
                        : g.groupType === 'physical' ? 'فیزیکی' : 'ترکیبی'}
                    </span>
                  </div>

                  <GroupBar group={g} accent={accent} />

                  <div className="rgTiers">
                    {g.tiers.map(t => (
                      <TierCard key={t.id} tier={t} accent={accent}
                        busy={busy === t.id}
                        onClaim={() => setConfirm({ tier: t, group: g })} />
                    ))}
                  </div>
                </section>
              );
            })}

            {confirm && (
              <div className="modalShade" onClick={() => setConfirm(null)}>
                <div className="confirmBox" onClick={e => e.stopPropagation()}
                  role="dialog" aria-label="تایید دریافت جایزه">
                  <h3>دریافت «{confirm.tier.name}»</h3>
                  <p>
                    {confirm.tier.rewardType === 'cash'
                      ? <>مبلغ <b>{fa(confirm.tier.cashAmount)} تومان</b> به کیف
                          پولت اضافه می‌شود.</>
                      : <>این جایزه پس از تایید مدیر برایت ارسال می‌شود و در
                          پروفایلت ثبت می‌ماند.</>}
                    {' '}
                    <b>{fa(confirm.tier.requiredPoints)} امتیاز</b> کم می‌شود و
                    نوار پیشرفت «{confirm.group.name}» از ابتدا شروع می‌شود.
                  </p>
                  <div className="confirmActions">
                    <button className="ghost" onClick={() => setConfirm(null)}>
                      انصراف
                    </button>
                    <button className="main"
                      onClick={() => claim(confirm.tier)}>
                      بله، دریافت کن
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
