import React from 'react';
import { CARD_RARITY_META, normalizeCardRarity } from '../lib/cards.js';

/**
 * چهار کلاسِ کارت — چهار **مادهٔ فیزیکی**، نه چهار رنگِ عوض‌شده.
 *
 * ── خواستهٔ مالک (۳ مهر ۱۴۰۵) ─────────────────────────────────────────
 *
 * «کلاسِ کارت رو یکپارچه بده … و برای هر کدوم افکتِ انیمیشنیِ فوق‌العاده
 *  جذاب درست کن.»
 *
 * ── زبانِ طرح ────────────────────────────────────────────────────────
 *
 *   معمولی    فولادِ ماتِ گرافیتی + خطِ حکاکی        → ساکن و باوقار
 *   کمیاب     زمردِ صیقلی با نورِ درونی              → نفس‌کشیدنِ آرام
 *   نایاب     شفقِ قطبیِ بنفش                        → چرخشِ aurora + جرقه
 *   افسانه‌ای طلای گداخته و اخگرِ آتش                 → تاجِ چرخان + هاله + اخگر
 *
 * ⚠️ چرا «معمولی» انیمیشن ندارد و عمدی است، نه تنبلی: کلکسیون تا ۲۴ کارت
 *    در یک صفحه نشان می‌دهد و بیشترشان معمولی‌اند. کارتِ رایگانِ ساکن =
 *    ۲۴ انیمیشنِ کمتر روی هر قاب؛ همان تصمیمی که در اندروید هم گرفته شد
 *    (`if (reduceMotion || rarity === 'normal') return _paint(.25)`).
 *
 * ذرات (`<i>`) فقط برای کلاس‌هایی ساخته می‌شوند که واقعاً ذره دارند، تا
 * کلکسیونِ معمولی‌ها DOMِ خالی حمل نکند.
 */
export const RARITY_META = CARD_RARITY_META;

/** تعدادِ ذراتِ هر کلاس. صفر یعنی `rarityCardAura` اصلاً ساخته نمی‌شود. */
export const RARITY_PARTICLES = { common: 0, uncommon: 0, rare: 5, legendary: 7 };

export function CardRarityFrame({ rarity = 'common', children, className = '', corner = null }) {
  const key = normalizeCardRarity(rarity);
  const meta = RARITY_META[key];
  const particles = RARITY_PARTICLES[key] || 0;
  return <div className={`rarityCardFrame rarity-${key} ${className}`}>
    <span className="rarityCardLabel"><i>{meta.icon}</i>{meta.label}</span>
    <div className="rarityCardContent">{children}</div>
    {/* هاله + ذراتِ شناور. `aria-hidden` چون کاملاً تزئینی است و
        صفحه‌خوان نباید هفت‌تا عنصرِ خالی را بخواند. */}
    {particles > 0 && <span className="rarityCardAura" aria-hidden="true">
      {Array.from({ length: particles }, (_, i) => <i key={i} />)}
    </span>}
    {/* نگینِ گوشهٔ پایین: وقتی صاحبِ کارت بیش از یک نسخه دارد، عددِ
        تعداد جای نگینِ کمیابی می‌نشیند (خواستِ مالک ۳۰ شهریور). عنصرِ
        واقعی است نه pseudo تا متنِ پویا بگیرد؛ مهارِ pseudo در CSS است. */}
    {corner}
    <span className="rarityCardShine" aria-hidden="true" />
  </div>;
}
