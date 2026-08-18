import React, { useCallback, useEffect, useState } from 'react';
import { req, fa } from '../lib/api.js';
import { CARD_RARITY_META } from '../lib/cards.js';
import { SvgIcon } from './IconAsset.jsx';

const money = n => `${fa(Number(n || 0).toLocaleString('en-US'))} تومان`;

/**
 * صندوقِ کارت.
 *
 * 🔴 چرا این فایل وجود دارد: بک‌اندِ صندوق کامل و زنده بود (`overview`,
 *    `buy`, `history`) ولی **هیچ کلاینتی صدایش نمی‌زد**. کاربری که کارتِ
 *    فیزیکی نداشت، در دوئل پیام «حداقل پنج کارت لازم داری» می‌گرفت و هیچ
 *    راهی برای گرفتنشان نبود — بن‌بستِ کامل. صندوق دقیقاً برای همین ساخته
 *    شده بود و فقط درِ ورودی‌اش جا مانده بود.
 *
 * دو جا رندر می‌شود: قفسهٔ فروشگاه، و درست همان‌جا که دوئل بن‌بست می‌شود.
 */
export default function CardBox({ token, compact = false, onGranted }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [won, setWon] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await req('/api/card-box/overview', 'GET', null, token));
    } catch (e) {
      setError(e.message || 'صندوق در دسترس نیست');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const buy = async () => {
    setBusy(true); setError(''); setWon(null);
    try {
      // همان سه‌گامِ فروشگاه: سفارش از سرور، پرداخت در بازار، تحویل بعد
      // از راستی‌آزماییِ سرور. کلاینت هیچ‌وقت خودش «تحویل شد» نمی‌گوید.
      const order = await req('/api/card-box/buy', 'POST', {}, token);
      if (!window.__ghBazaarPurchase) {
        throw new Error('برای خرید صندوق، اپ اندروید را از کافه‌بازار نصب کنید');
      }
      const purchaseToken = await window.__ghBazaarPurchase(order.productId, order.orderId);
      const result = await req('/api/purchase/verify', 'POST',
        { orderId: order.orderId, purchaseToken }, token);
      setWon(result?.cards || []);
      await load();
      onGranted?.(result);
    } catch (e) {
      setError(e.message || 'خرید انجام نشد');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="cardBox cardBoxLoading">
      {error || 'در حال باز کردن صندوق…'}
    </div>;
  }

  return <section className={`cardBox ${compact ? 'compact' : ''}`} dir="rtl">
    <style>{`
      .cardBox{border:1px solid rgba(255,209,102,.32);border-radius:20px;padding:15px;color:#fff;
        background:radial-gradient(circle at 88% 0,rgba(124,58,237,.28),transparent 44%),linear-gradient(140deg,#0d1b2c,#141033 68%,#2a1140);
        box-shadow:0 16px 44px rgba(0,0,0,.26);display:grid;gap:12px}
      .cardBoxLoading{text-align:center;color:#94a3b8;font-size:12px;padding:22px}
      .cardBoxHead{display:flex;align-items:flex-start;justify-content:space-between;gap:11px}
      .cardBoxHead h3{margin:0;font-size:17px;font-weight:950;display:flex;align-items:center;gap:7px}
      .cardBoxHead p{margin:5px 0 0;font-size:11px;line-height:1.7;color:#b9c5d5;max-width:46ch}
      .cardBoxPrice{white-space:nowrap;background:rgba(0,0,0,.3);border:1px solid rgba(255,209,102,.4);
        border-radius:14px;padding:8px 12px;color:#FFD166;font-weight:950;font-size:13px}
      .cardBoxOdds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
      .cardBoxOdd{border-radius:12px;padding:8px 5px;text-align:center;background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.09)}
      .cardBoxOdd b{display:block;font-size:14px;font-weight:950}
      .cardBoxOdd span{display:block;font-size:9.5px;color:#94a3b8;margin-top:2px}
      .cardBoxFoot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .cardBoxFoot small{color:#94a3b8;font-size:10.5px}
      .cardBoxBtn{border:0;border-radius:13px;padding:11px 20px;font-weight:950;font-size:13px;cursor:pointer;
        background:linear-gradient(135deg,#FFD166,#F97316);color:#1a0f02}
      .cardBoxBtn:disabled{opacity:.55;cursor:default}
      .cardBoxErr{color:#FCA5A5;font-size:11px;margin:0}
      .cardBoxWon{border-top:1px solid rgba(255,255,255,.1);padding-top:11px;display:grid;gap:7px}
      .cardBoxWon>b{font-size:12.5px;color:#22E7A6}
      .cardBoxWonList{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(84px,1fr);gap:7px;overflow-x:auto}
      .cardBoxWonCard{border-radius:11px;padding:8px 6px;text-align:center;background:rgba(0,0,0,.32);
        border:1px solid rgba(255,255,255,.12)}
      .cardBoxWonCard b{display:block;font-size:10.5px;margin-bottom:3px}
      .cardBoxWonCard span{font-size:9px;color:#94a3b8}
      .cardBoxOwned{font-size:11px;color:#dbe6f2}
      .cardBoxOwned b{color:#FFD166}
      @media(max-width:560px){.cardBoxOdds{grid-template-columns:repeat(3,minmax(0,1fr))}
        .cardBoxHead{flex-wrap:wrap}.cardBox{padding:13px}}
    `}</style>

    <div className="cardBoxHead">
      <div>
        <h3><SvgIcon name="gift" size={19} /> صندوق کارت</h3>
        <p>
          {data.needsBox
            ? <>برای دوئل به <b>{fa(data.size)} کارت</b> نیاز داری. این صندوق دقیقاً {fa(data.size)} کارتِ
              تصادفی می‌دهد و کارت‌ها <b>امتیاز</b> هم دارند.</>
            : <>کلکسیونت آمادهٔ دوئل است. هر صندوق {fa(data.size)} کارتِ تصادفیِ دیگر با امتیازشان اضافه می‌کند.</>}
        </p>
      </div>
      <div className="cardBoxPrice">{money(data.price)}</div>
    </div>

    <div className="cardBoxOdds">
      {(data.odds || []).map(o => {
        const meta = CARD_RARITY_META[o.rarity] || { label: o.rarity, accent: '#94A3B8' };
        return <div key={o.rarity} className="cardBoxOdd">
          <b style={{ color: meta.accent }}>{fa(o.percent)}٪</b>
          <span>{meta.label}</span>
        </div>;
      })}
    </div>

    <div className="cardBoxFoot">
      <span className="cardBoxOwned">
        کارت‌های فعال تو: <b>{fa(data.ownedCards)}</b>
        {data.needsBox ? ` از ${fa(data.size)}` : ' · آمادهٔ دوئل'}
      </span>
      <button type="button" className="cardBoxBtn" onClick={buy} disabled={busy}>
        {busy ? 'در حال باز کردن…' : `باز کردن صندوق · ${money(data.price)}`}
      </button>
    </div>

    <small style={{ color: '#94a3b8', fontSize: '10px' }}>
      شانسِ هر سطح بالا نوشته شده و برای همه یکسان است. کارت‌ها به کلکسیون اضافه می‌شوند و در دوئل قابل بازی‌اند.
    </small>

    {error && <p className="cardBoxErr">{error}</p>}

    {won && won.length > 0 && <div className="cardBoxWon">
      <b>صندوق باز شد — {fa(won.length)} کارت گرفتی</b>
      <div className="cardBoxWonList">
        {won.map((c, i) => {
          const meta = CARD_RARITY_META[c.rarity] || { label: c.rarity, accent: '#94A3B8' };
          return <div key={i} className="cardBoxWonCard" style={{ borderColor: `${meta.accent}55` }}>
            <b style={{ color: meta.accent }}>{c.name || 'کارت'}</b>
            <span>{meta.label} · {fa(c.pointValue || 0)} امتیاز</span>
          </div>;
        })}
      </div>
    </div>}
  </section>;
}
