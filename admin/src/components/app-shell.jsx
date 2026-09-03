import React, { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { ScrollHint } from './ScrollHint.jsx';

// Responsive app shell: permanent sidebar on desktop, slide-in drawer +
// hamburger on mobile — same principle as the Flutter admin shell
// (side-rail vs. Drawer) so the whole product family behaves consistently.
export function AppShell({ nav, navGroups = {}, activePage, onNavigate, onLogout, title, subtitle, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // گروه‌ها (۳.۲): یک سرتیترِ کوچک قبلِ اولین آیتمِ هر دسته. «دومین
  // آیتم» معیار است، نه «تغییرِ گروهِ قبلی»، تا گروهِ اول هم سرتیتر
  // بگیرد — بیِ این، مدیرِ تازه‌کار اولین دسته را بی‌نام می‌بیند.
  const groupAt = (i) => nav[i]?.[5];


  return (
    <div className="app-shell">
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/logo.png" alt="قلقلی" />
          <div>
            <b>قلقلی</b>
            <small>پنل مدیریت وفاداری</small>
          </div>
        </div>
        {nav.map(([id, label, Icon], i) => (
          <React.Fragment key={id}>
            {i > 0 && groupAt(i) !== groupAt(i - 1) && (
              <div className="nav-group-label">{navGroups[groupAt(i)] ?? ''}</div>
            )}
            {i === 0 && groupAt(0) && (
              <div className="nav-group-label">{navGroups[groupAt(0)] ?? ''}</div>
            )}
            <button
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
          </React.Fragment>
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
          </div>
        </header>
        <main className="content-area">
          <ScrollHint key={activePage} label="پایین‌تر هم هست" padBottom={8}>
            {children}
          </ScrollHint>
        </main>
      </div>
    </div>
  );
}
