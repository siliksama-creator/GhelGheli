// Reward groups: two parallel prize tracks, each with its own progress bar,
// prize artwork and required-card strip.
import React, { useCallback, useState } from 'react';

import { req, asset, fa, avatarUrl } from '../lib/api.js';
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
      {/* Label the numbers. Bare "۱۰۰ ... ۲۵۰" at the ends of a bar is
          ambiguous in RTL — a reader cannot tell which end is their score
          and which is the target. */}
      <div className="rgScale">
        <span>امتیاز تو: <b>{fa(group.earnedPoints)}</b></span>
        <span>هدف: <b>{next ? fa(next.requiredPoints) : '—'}</b></span>
      </div>

      {/* Cards this prize needs, with the artwork and how many you hold. */}
      {next?.requiredCards?.length > 0 && (
        <div className="rgCards">
          <small>کارت‌های لازم:</small>
          <div className="rgCardStrip">
            {next.requiredCards.map(c => (
              <div className={`rgCard${c.met ? ' met' : ''}`} key={c.cardTypeId}
                title={c.name}>
                <img src={asset(c.imageUrl) || avatarUrl('avatar_1_football.png')}
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
        <img src={asset(tier.imageUrl) || avatarUrl('avatar_2_trophy.png')}
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
                <div className="confirmBox claimConfirm"
                  onClick={e => e.stopPropagation()}
                  role="dialog" aria-label="تایید دریافت جایزه">
                  <div className="ccHead">
                    <img
                      src={asset(confirm.tier.imageUrl)
                        || avatarUrl('avatar_2_trophy.png')}
                      alt={confirm.tier.name} />
                    <div>
                      <h3>مطمئنی می‌خوای این جایزه رو بگیری؟</h3>
                      <b className="ccName">{confirm.tier.name}</b>
                    </div>
                  </div>

                  {/* Spelled out as a list of consequences rather than a
                      paragraph: claiming is irreversible and the two effects
                      (points spent, bar reset) are easy to miss in prose. */}
                  <ul className="ccList">
                    <li>
                      <span className="ccIcon">📉</span>
                      <span>
                        <b>{fa(confirm.tier.requiredPoints)} امتیاز</b> از
                        امتیازت کم می‌شه
                        <small>
                          الان {fa(confirm.group.earnedPoints)} امتیاز داری،
                          بعدش {fa(Math.max(0,
                            confirm.group.earnedPoints
                            - confirm.tier.requiredPoints))} امتیاز می‌مونه
                        </small>
                      </span>
                    </li>
                    <li>
                      <span className="ccIcon">🔄</span>
                      <span>
                        نوار پیشرفت <b>«{confirm.group.name}»</b> از صفر شروع
                        می‌شه
                        <small>
                          برای جایزهٔ بعدی این گروه باید دوباره امتیاز جمع کنی
                        </small>
                      </span>
                    </li>
                    <li>
                      <span className="ccIcon">
                        {confirm.tier.rewardType === 'cash' ? '💰' : '🎁'}
                      </span>
                      <span>
                        {confirm.tier.rewardType === 'cash' ? (
                          <>
                            <b>{fa(confirm.tier.cashAmount)} تومان</b> همین الان
                            به کیف پولت اضافه می‌شه
                            <small>می‌تونی از بخش کیف پول برداشتش کنی</small>
                          </>
                        ) : (
                          <>
                            جایزه بعد از تایید مدیر برات فرستاده می‌شه
                            <small>
                              عکسش هم توی پروفایلت ثبت می‌مونه
                            </small>
                          </>
                        )}
                      </span>
                    </li>
                  </ul>

                  <p className="ccWarn">
                    این کار برگشت‌پذیر نیست.
                  </p>

                  <div className="confirmActions">
                    <button className="ghost" onClick={() => setConfirm(null)}>
                      نه، فعلاً نه
                    </button>
                    <button className="main"
                      onClick={() => claim(confirm.tier)}>
                      آره، جایزه‌مو بگیر
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
