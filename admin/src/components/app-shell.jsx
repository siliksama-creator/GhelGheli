import { useState } from 'react';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';

// Responsive app shell: permanent sidebar on desktop, slide-in drawer +
// hamburger on mobile — same principle as the Flutter admin shell
// (side-rail vs. Drawer) so the whole product family behaves consistently.
export function AppShell({ nav, activePage, onNavigate, onLogout, theme, onToggleTheme, title, subtitle, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/logo.png" alt="قلقلی" />
          <div>
            <b>قل‌قلی</b>
            <small>پنل مدیریت وفاداری</small>
          </div>
        </div>
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={`nav-item ${activePage === id ? 'active' : ''}`}
            onClick={() => {
              onNavigate(id);
              setMobileOpen(false);
            }}
          >
            <span className="nav-icon">
              <Icon size={18} />
            </span>
            {label}
          </button>
        ))}
        <div className="sidebar-footer">
          <button className="nav-item" onClick={onLogout}>
            <span className="nav-icon">
              <LogOut size={18} />
            </span>
            خروج
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-icon btn-ghost mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="باز کردن منو">
              <Menu size={20} />
            </button>
            <div>
              <h1>{title}</h1>
              {subtitle && <div className="topbar-sub">{subtitle}</div>}
            </div>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-icon btn-ghost" onClick={onToggleTheme} aria-label="تغییر پوسته">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
