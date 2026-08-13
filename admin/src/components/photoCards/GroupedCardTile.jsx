import { Pencil, Trash2 } from 'lucide-react';

import { assetUrl, fmtNumber } from '../../lib/api.js';
import { Button } from '../ui.jsx';

const SIDE_LABELS = { front: 'روی کارت', back: 'پشت کارت', alternate: 'نمای دیگر' };
const RARITY_LABELS = {
  normal: 'معمولی', silver: 'نقره‌ای', gold: 'طلایی', premium: 'پرمیوم', legend: 'لجند',
};
const STAT_LABELS = [
  ['duel_attack','حمله'],['duel_defense','دفاع'],['duel_speed','سرعت'],
  ['duel_technique','تکنیک'],['duel_goal_chance','گل'],['duel_energy','انرژی'],
];

/** One administrative card, regardless of how many recognition images it has. */
export function GroupedCardTile({ card, deleting = false, onEdit, onToggle, onDelete }) {
  const rarity = RARITY_LABELS[card.duel_rarity] ? card.duel_rarity : 'normal';
  const primary = card.sides?.find(side => side.side === 'front') || card.sides?.[0];
  return (
    <article className="card adminCardShowcase" style={{ opacity: card.is_active ? 1 : 0.6 }}>
      <div className="adminCardTop">
        <div className={`adminRarityFrame rarity-${rarity}`}>
          <span>{rarity === 'legend' ? '♛ ' : rarity === 'premium' ? '✦ ' : ''}{RARITY_LABELS[rarity]}</span>
          {primary && <img src={assetUrl(primary.image_url)} alt={card.card_type_name || 'کارت'} loading="lazy" />}
          <i aria-hidden="true" />
        </div>
        <div className="adminCardInfo">
          <b>{card.card_type_name || 'نامشخص'}</b>
          <p>{fmtNumber(card.point_value || 0)} امتیاز · {fmtNumber(card.side_count || card.sides?.length || 0)} تصویر تشخیص</p>
          <small>{fmtNumber(card.redeemed_count || 0)} بار ثبت‌شده{card.code_count != null ? ` · ${fmtNumber(card.code_count)} کد` : ''}</small>
          <div className="adminAnalysisState">
            <strong className={card.analysis_complete ? 'ok' : 'bad'}>{card.analysis_complete ? '✓ اثرانگشت کامل' : '⚠ آنالیز ناقص'}</strong>
            <span>OCR: {fmtNumber(card.ocr_token_count || 0)} توکن</span>
          </div>
          {/* کارتِ کلکسیونی استاتس ندارد؛ نمایشِ شش عددِ بی‌معنی فقط مدیر
              را گمراه می‌کند که انگار این کارت در بازی نقشی دارد. */}
          {card.is_collectible
            ? <p className="adminCollectibleTag">🏅 کارت کلکسیونی — در آرنای دوئل نیست</p>
            : (
              <div className="adminDuelStats">
                {STAT_LABELS.map(([key,label]) => <span key={key}>{label}<b>{fmtNumber(card[key] ?? 0)}</b></span>)}
              </div>
            )}
        </div>
      </div>

      <div className="adminCardSides">
        {(card.sides || []).map((side, index) => (
          <figure key={side.id || index}>
            <img src={assetUrl(side.image_url)} alt={`${card.card_type_name || 'کارت'} — ${SIDE_LABELS[side.side] || SIDE_LABELS.alternate}`} loading="lazy" />
            <figcaption>
              <b>{SIDE_LABELS[side.side] || `تصویر ${fmtNumber(index + 1)}`}</b>
              <span>{fmtNumber(side.width)}×{fmtNumber(side.height)}</span>
              <i className={side.fingerprint_complete ? 'ok' : 'bad'}>{side.fingerprint_complete ? 'آنالیز کامل' : 'ناقص'}</i>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="adminCardActions">
        <Button size="sm" icon={Pencil} onClick={() => onEdit(card)}>ویرایش کارت و کدها</Button>
        <Button size="sm" variant="ghost" onClick={() => onToggle(card)}>{card.is_active ? 'غیرفعال کردن کارت' : 'فعال کردن کارت'}</Button>
        <Button size="sm" variant="danger" icon={Trash2} loading={deleting} onClick={() => onDelete(card)}>حذف کارت</Button>
      </div>
    </article>
  );
}
