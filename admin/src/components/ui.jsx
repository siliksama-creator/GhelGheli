// Small, focused presentational primitives shared by every admin page.
// Keeping these in one file mirrors the mobile app's `lib/widgets/` folder:
// a compact, reusable design-system layer instead of ad-hoc markup per page.
import { Loader2 } from 'lucide-react';

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className = '', type = 'button', ...rest }) {
  const variantClass = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant];
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  return (
    // ── چرا `type` صریح است ──
    //
    // ⚠️ باگی که ممیزیِ مرورگر پیدا کرد.
    //
    // `<button>` بدونِ `type`، پیش‌فرض `submit` است. تا امروز بی‌ضرر بود
    // چون هیچ دکمه‌ای داخلِ `<form>` نبود. با اضافه شدنِ فرمِ جست‌وجو در
    // صفحهٔ «ریز امتیازات»، **هر** دکمهٔ داخلِ فرم ناخواسته فرم را ارسال
    // می‌کرد و صفحه رفرش می‌شد.
    //
    // پیش‌فرضِ `button` امن است: دکمه‌ای که واقعاً باید فرم را ارسال کند
    // صریحاً `type="submit"` می‌گیرد.
    //
    // ترتیب هم مهم است: `{...rest}` **بعد** از `type` می‌آید تا
    // `type="submit"`ی که فراخوان می‌دهد بتواند پیش‌فرض را بازنویسی کند.
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      type={type}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, variant = 'secondary', ...rest }) {
  const variantClass = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant];
  return (
    <button className={`btn btn-icon ${variantClass}`} {...rest}>
      <Icon size={17} />
    </button>
  );
}

export function Card({ title, subtitle, action, children, className = '', style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {children}
    </label>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Textarea(props) {
  return <textarea className="textarea" {...props} />;
}

export function Select({ children, ...rest }) {
  return (
    <select className="select" {...rest}>
      {children}
    </select>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-icon">
          <Icon size={24} />
        </div>
      )}
      <p style={{ fontWeight: 700, color: 'var(--gg-text)' }}>{title}</p>
      {message && <p>{message}</p>}
    </div>
  );
}

export function Skeleton({ height = 90 }) {
  return <div className="skeleton" style={{ minHeight: height }} />;
}

export function DataRow({ title, subtitle, thumb, selected, onClick, actions, trailing }) {
  return (
    <div className={`data-row ${onClick ? 'clickable' : ''} ${selected ? 'selected' : ''}`} onClick={onClick}>
      {thumb}
      <div className="data-row-main">
        <div className="data-row-title">{title}</div>
        {subtitle && <div className="data-row-sub">{subtitle}</div>}
      </div>
      {trailing}
      {actions && <div className="data-row-actions">{actions}</div>}
    </div>
  );
}

/**
 * جدولِ داده.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️ قراردادِ این کامپوننت عوض شد — و دلیلش مهم است
 * ═══════════════════════════════════════════════════════════════════════
 *
 * نسخهٔ قبلی `cols` را آرایه‌ای از جفتِ `[کلید, برچسب]` می‌خواست و
 * `rows` را آرایه‌ای از **شیء**. هیچ صفحه‌ای از آن استفاده نمی‌کرد —
 * کدِ مرده بود، پس قراردادش هرگز آزموده نشده بود.
 *
 * وقتی صفحهٔ «ریز امتیازات» اولین کاربرش شد، شکلِ طبیعی‌تر (آرایهٔ
 * رشته برای سرآیند، آرایهٔ آرایه برای ردیف‌ها) پاس داده شد. نتیجه در
 * مرورگر: `c[1]` روی رشتهٔ «کاربر» یعنی **حرفِ دوم**، پس هر سرآیند
 * یک نویسه شد — `'ا'`، `'و'`، `'س'`.
 *
 * ممیزیِ مرورگر گرفتش. هیچ خطایی پرتاب نشد و React هم شکایتی نکرد:
 * جدول رندر می‌شد، فقط سرآیندهایش بی‌معنی بودند.
 *
 * حالا **هر دو شکل** پشتیبانی می‌شوند تا اگر روزی کسی شکلِ قدیمی را
 * استفاده کند نشکند، ولی شکلِ ساده پیش‌فرض است:
 *
 *     cols={['نام', 'امتیاز']}          rows={[['علی', 10]]}
 *     cols={[['name','نام']]}           rows={[{name:'علی'}]}
 */
export function Table({ rows = [], cols = [], head = null, children = null }) {
  // ══ شکلِ سوم: <Table head={[...]}>{<tr>...}</Table> ══
  //
  // 🔴 این شاخه نبود و جدولِ «لیگ‌های هم‌زمان» در پنلِ زنده **کاملاً
  //    خالی** رندر می‌شد: نه سرآیند، نه ردیف. چون `head` و `children`
  //    اصلاً از props بیرون کشیده نمی‌شدند، React بی‌صدا دورشان
  //    می‌انداخت — هیچ خطایی هم در کنسول نبود.
  //
  //    وقتی ردیف‌ها ورودیِ تعاملی دارند (Input/select)، شکلِ آرایه‌ایِ
  //    `rows` کار نمی‌کند چون هر بار آرایهٔ تازه ساخته می‌شود و فوکوس
  //    از فیلد می‌پرد. پس این شکل لازم است، نه سلیقه‌ای.
  if (head) {
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {head.map((h, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    );
  }

  // اگر عضوِ اول رشته باشد، شکلِ ساده است.
  const simple = cols.length === 0 || typeof cols[0] === 'string';
  const headers = simple ? cols : cols.map((c) => c[1]);

  const cellsOf = (r, i) => {
    if (simple) return Array.isArray(r) ? r : [r];
    return cols.map((c) => {
      const v = r[c[0]];
      if (typeof v === 'boolean') return v ? 'بله' : 'خیر';
      return v ?? '-';
    });
  };

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              // کلید از اندیس: سرآیندها ممکن است تکراری یا خالی باشند
              // (ستونِ دکمه سرآیند ندارد) و `key={h}` آن‌وقت تکراری
              // می‌شود و React هشدار می‌دهد.
              // eslint-disable-next-line react/no-array-index-key
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={r?.id || i}>
              {cellsOf(r, i).map((cell, j) => (
                // eslint-disable-next-line react/no-array-index-key
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
