// Dashboard: points, next reward, wallet shortcut, card redemption, inventory.
import React, { useState } from 'react';

import { req, asset, fa, avatars } from '../lib/api.js';
import { EmptyView } from '../components/states.jsx';

function Avatar({ u, size = 72 }) {
  const src = u.profile_image_url
    ? asset(u.profile_image_url)
    : `/avatars/${u.profile_avatar_key || avatars[0]}`;
  return (
    <img className="avatar" src={src} alt="آواتار"
      style={{ width: size, height: size }} />
  );
}

function CardLightbox({ item, close }) {
  return (
    <div className="modalShade" onClick={close}>
      <div className="cardBig" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <img src={asset(item.image_url) || '/avatars/avatar_1_football.png'}
          alt={item.name || 'کارت'} />
        <h2>{item.name || 'کارت'}</h2>
        <p>تعداد: {fa(item.quantity)} — {fa(item.point_value)} امتیاز</p>
        {item.description && <p className="hint">{item.description}</p>}
      </div>
    </div>
  );
}

export default function Home({ token, p, rewards, load, setMsg, openWallet }) {
  const [code, setCode] = useState('');
  const [bigCard, setBigCard] = useState(null);
  const [redeeming, setRedeeming] = useState(false);

  const u = p.user;
  const sorted = [...rewards].sort(
    (a, b) => a.required_points - b.required_points);
  const next = sorted.find(r => u.current_points < r.required_points)
    || sorted.at(-1);
  const progress = next
    ? Math.min(1, u.current_points / next.required_points) : 0;

  async function redeem() {
    // Guard against a double-tap submitting the same code twice: the second
    // request always fails with "already used", which looks like the first
    // one failed.
    if (redeeming || !code.trim()) return;
    setRedeeming(true);
    try {
      const d = await req('/api/cards/redeem', 'POST', { code }, token);
      setMsg(d.message);
      setCode('');
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setRedeeming(false);
    }
  }

  const inventory = p.inventory || [];

  return (
    <div className="grid">
      <section className="card heroCard">
        <Avatar u={u} />
        <h2>{u.nickname || u.mobile}</h2>
        <h1>{fa(u.current_points)} امتیاز</h1>
        <div className="bar"><span style={{ width: progress * 100 + '%' }} /></div>
        <p>
          {next
            ? `تا جایزه ${next.name}: ${fa(Math.max(0, next.required_points - u.current_points))} امتیاز مانده`
            : 'هنوز جایزه‌ای تعریف نشده'}
        </p>

        <button
          className={`walletEntry${Number(u.wallet_balance) > 0 ? ' hasMoney' : ''}`}
          onClick={openWallet}>
          <span className="weIcon">👛</span>
          <span className="weBody">
            <small>کیف پول من</small>
            <b>{fa(u.wallet_balance)} <i>تومان</i></b>
          </span>
          <span className="weCta">
            {Number(u.wallet_balance) > 0 ? 'برداشت' : 'مشاهده'} ‹
          </span>
        </button>

        <h2>ثبت کد کارت های قلقلی</h2>
        <p className="hint">
          (پک کارت های قلقلی بصورت فیزیکی در فروشگاه ها و سوپرمارکت ها به فروش
          می رسند.)
        </p>
        <input value={code} placeholder="کد کارت"
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') redeem(); }} />
        <button className="main" onClick={redeem}
          disabled={redeeming || !code.trim()}>
          {redeeming ? 'در حال ثبت...' : 'ثبت کد'}
        </button>
      </section>

      <section className="card">
        <h2>موجودی کارت‌ها</h2>
        {inventory.length ? (
          <div className="invGrid">
            {inventory.map(i => (
              <button className="invCard" key={i.id} title="نمایش بزرگ کارت"
                onClick={() => setBigCard(i)}>
                <span className="invArt">
                  <img src={asset(i.image_url) || '/avatars/avatar_1_football.png'}
                    alt={i.name || 'کارت'} />
                </span>
                <b>{i.name}</b>
                <small>{fa(i.quantity)}× · {fa(i.point_value)} امتیاز</small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyView icon="🃏">
            هنوز کارتی ثبت نکرده‌ای. کد پشت کارت را بالا وارد کن.
          </EmptyView>
        )}
      </section>

      {bigCard && <CardLightbox item={bigCard} close={() => setBigCard(null)} />}
    </div>
  );
}

export { Avatar };
