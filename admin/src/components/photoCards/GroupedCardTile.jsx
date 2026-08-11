import { Pencil, Trash2 } from 'lucide-react';

import { assetUrl, fmtNumber } from '../../lib/api.js';
import { Button } from '../ui.jsx';

const SIDE_LABELS = {
  front: 'روی کارت',
  back: 'پشت کارت',
  alternate: 'نمای دیگر',
};

/** One administrative card, regardless of how many recognition images it has. */
export function GroupedCardTile({ card, deleting = false, onEdit, onToggle, onDelete }) {
  return (
    <article
      className="card"
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: card.is_active ? 1 : 0.6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
          {(card.sides || []).map((side, index) => (
            <figure key={side.id || index} style={{ margin: 0, textAlign: 'center' }}>
              <img
                src={assetUrl(side.image_url)}
                alt={`${card.card_type_name || 'کارت'} — ${SIDE_LABELS[side.side] || SIDE_LABELS.alternate}`}
                loading="lazy"
                style={{ width: 48, height: 64, objectFit: 'cover', borderRadius: 6 }}
              />
              <figcaption style={{ color: '#94A3B8', fontSize: 9, marginTop: 2 }}>
                {SIDE_LABELS[side.side] || `تصویر ${fmtNumber(index + 1)}`}
              </figcaption>
            </figure>
          ))}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: 'block', fontSize: 14 }}>{card.card_type_name || 'نامشخص'}</b>
          <div style={{ color: '#94A3B8', fontSize: 12 }}>
            {fmtNumber(card.point_value || 0)} امتیاز · {fmtNumber(card.side_count || card.sides?.length || 0)} تصویر تشخیص
          </div>
          <div style={{ color: '#64748B', fontSize: 11 }}>
            {fmtNumber(card.redeemed_count || 0)} بار ثبت‌شده
            {card.code_count != null ? ` · ${fmtNumber(card.code_count)} کد` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
        <Button size="sm" icon={Pencil} onClick={() => onEdit(card)}>
          ویرایش کارت و کدها
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onToggle(card)}>
          {card.is_active ? 'غیرفعال کردن کارت' : 'فعال کردن کارت'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={Trash2}
          loading={deleting}
          onClick={() => onDelete(card)}
        >
          حذف کارت
        </Button>
      </div>
    </article>
  );
}
