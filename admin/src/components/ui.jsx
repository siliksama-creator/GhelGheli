// Small, focused presentational primitives shared by every admin page.
// Keeping these in one file mirrors the mobile app's `lib/widgets/` folder:
// a compact, reusable design-system layer instead of ad-hoc markup per page.
import { Loader2 } from 'lucide-react';

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className = '', ...rest }) {
  const variantClass = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant];
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  return (
    <button className={`btn ${variantClass} ${sizeClass} ${className}`} disabled={loading || rest.disabled} {...rest}>
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

export function Table({ rows, cols }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c[0]}>{c[1]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {cols.map((c) => (
                <td key={c[0]}>{typeof r[c[0]] === 'boolean' ? (r[c[0]] ? 'بله' : 'خیر') : (r[c[0]] ?? '-')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
