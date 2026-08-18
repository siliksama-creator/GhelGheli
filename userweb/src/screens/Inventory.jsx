import React, { useMemo, useState } from 'react';
import { fa } from '../lib/api.js';
import PlayerCard from '../components/PlayerCard.jsx';
import { cardQtyOf } from '../lib/cards.js';
import { SvgIcon } from '../components/IconAsset.jsx';

const asInt = v => Number.parseInt(v || 0, 10) || 0;
const dateOf = m => new Date(m.updated_at || m.created_at || 0).getTime();
const fresh = m => Date.now() - dateOf(m) < 48 * 3600 * 1000;

function stats(items) {
  return items.reduce((a, x) => {
    const q = asInt(x.quantity);
    a.total += q;
    a.points += q * asInt(x.point_value);
    return a;
  }, { kinds: items.length, total: 0, points: 0 });
}

function CardDetail({ item, close }) {
  return (
    <div className="invModalShade" onClick={close}>
      <section className="invModal card" onClick={e => e.stopPropagation()}>
        <button className="ghost invModalClose" onClick={close}>×</button>
        <PlayerCard item={item} showStats />
        {item.description && <p className="hint">{item.description}</p>}
        <div className="invDetailStats">
          <span>تعداد <b>{fa(cardQtyOf(item))}</b></span>
          <span>ارزش هر کارت <b>{fa(item.point_value)}</b></span>
          <span>ارزش کل <b>{fa(cardQtyOf(item) * asInt(item.point_value))}</b></span>
        </div>
      </section>
    </div>
  );
}

export default function Inventory({ items = [], reload }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [open, setOpen] = useState(null);
  const summary = useMemo(() => stats(items), [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = items.filter(x => !q || String(x.name || '').toLowerCase().includes(q));
    out.sort((a, b) => sort === 'value'
      ? asInt(b.point_value) - asInt(a.point_value) || String(a.name).localeCompare(String(b.name), 'fa')
      : sort === 'name'
        ? String(a.name).localeCompare(String(b.name), 'fa')
        : dateOf(b) - dateOf(a) || String(a.name).localeCompare(String(b.name), 'fa'));
    return out;
  }, [items, query, sort]);

  return (
    <div className="inventoryPage">
      <div className="invStats card">
        <div><b>{fa(summary.kinds)}</b><span>نوع کارت</span></div>
        <div><b>{fa(summary.total)}</b><span>کل کارت‌ها</span></div>
        <div><b>{fa(summary.points)}</b><span>ارزش</span></div>
      </div>
      <div className="inventoryTools">
        {items.length >= 8 && <input type="search" value={query}
          onChange={e => setQuery(e.target.value)} placeholder="جست‌وجو در کارت‌ها…" />}
        {items.length >= 2 && <div className="invSorts">
          {[['recent', 'تازه‌ترین'], ['value', 'باارزش‌ترین'], ['name', 'الفبا']].map(([id, label]) =>
            <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>)}
        </div>}
        {reload && <button className="ghost" onClick={reload}>تازه‌سازی</button>}
      </div>
      {!shown.length ? (
        <div className="card pad center invEmpty">
          <span><SvgIcon name="card" size={48} /></span>
          <b>{items.length ? 'کارتی با این نام پیدا نشد' : 'هنوز کارتی در کلکسیون شما نیست'}</b>
          <p>{items.length ? 'نام دیگری را امتحان کن.' : 'یک کد کارت ثبت کن یا از کارتت عکس بگیر.'}</p>
        </div>
      ) : (
        <div className="inventoryGrid">
          {shown.map(item => <PlayerCard
            key={item.id || item.card_type_id}
            item={item}
            badge={fresh(item) ? 'جدید' : ''}
            onClick={() => setOpen(item)}
          />)}
        </div>
      )}
      {open && <CardDetail item={open} close={() => setOpen(null)} />}
    </div>
  );
}
