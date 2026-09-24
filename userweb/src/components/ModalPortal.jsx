import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * پوششِ تمام‌صفحه که هیچ والدی نمی‌تواند حبسش کند.
 *
 * ── باگی که این کامپوننت برای آن ساخته شد ──
 *
 * `position: fixed` نسبت به viewport می‌نشیند «مگر» جدی داشته باشد که
 * containing block بسازد. در این پروژه دو جدِ این‌چنینی داریم و هر دو
 * بی‌سروصدا این کار را می‌کنند:
 *
 *   • `.card` با `backdrop-filter: blur(20px)`
 *   • `.tabPane` با `content-visibility: auto` — که به‌طور ضمنی
 *     `contain: layout style paint` است و **paint containment** هم
 *     دقیقاً همین اثر را دارد.
 *
 * چون کلِ محتوای هر تب داخلِ `.tabPane` است، هر پوششِ «تمام‌صفحه‌ای» که
 * مستقیم رندر شود در واقع نسبت به بلندیِ همان تب جای می‌گیرد: کاربر روی
 * کارت کلیک می‌کند و باید کلی اسکرول کند تا پنجره را پیدا کند. با
 * portal به `body`، دیگر هیچ جدی در مسیر نیست.
 *
 * ــ به‌علاوه ــ
 *   • اسکرولِ پس‌زمینه قفل می‌شود تا صفحه زیرِ پنجره جابه‌جا نشود.
 *   • خودِ لایه اسکرول‌پذیر است تا محتوای بلندتر از صفحه هم کامل دیده
 *     شود (پیش از این، محتوای بلند از بالا و پایین بریده می‌شد).
 *   • Escape و کلیکِ بیرون، پنجره را می‌بندند.
 */
export default function ModalPortal({ label, onClose, className = '', children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}
