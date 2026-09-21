import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { ScrollHint } from './ScrollHint.jsx';

// ── جملهٔ راهنمای اسکرول برای صفحه‌های پنل ──────────────────────────────────
//
// چرا یک جملهٔ اختصاصی برای هر صفحه و نه «پایین‌تر هم هست»ِ عمومی: مدیر با
// این جمله می‌فهمد **چه چیزی** را دارد از دست می‌دهد (همان استدلالِ
// `SCROLL_HINTS` در وب‌کاربر و `_scrollHints` در اندروید). هر صفحهٔ دیگری
// که در نقشه نباشد، جملهٔ پیش‌فرض را می‌گیرد — پس هیچ صفحه‌ای بی‌راهنما
// نمی‌ماند، فقط کم‌دقیق‌تر می‌شود و افزودنِ یک صفحهٔ تازه لازم نیست این
// نقشه را هم آپدیت کند.
const ADMIN_SCROLL_HINTS = {
  dashboard: 'بخش‌های بعدی داشبورد پایین‌ترند',
  analytics: 'نمودارها و صندوق خطا پایین‌ترند',
  metrics: 'سرویس‌ها و لاگ‌ها پایین‌ترند',
  cloudflare: 'تنظیمات سپر پایین‌تر است',
  'photo-cards': 'کارت‌های در انتظار پایین‌ترند',
  shop: 'آیتم‌های بیشتر پایین‌ترند',
  'card-box': 'تاریخچهٔ خریدها پایین‌تر است',
  'battle-pass': 'پله‌های گذر پایین‌ترند',
  'custom-mission': 'ماموریت‌های دیگر پایین‌ترند',
  missions: 'ماموریت‌ها و جزئیات پایین‌ترند',
  wallet: 'تراکنش‌ها و درخواست‌ها پایین‌ترند',
  'league-countdown': 'شمارش و تنظیمات پایین‌ترند',
  league: 'ادامهٔ جدول پایین‌تر است',
  'game-rewards': 'سقف‌ها و ردیف‌های بازی پایین‌ترند',
  'game-economy': 'پارامترهای اقتصادی پایین‌ترند',
  wheel: 'شرط‌ها و تاریخچه پایین‌ترند',
  users: 'ادامهٔ فهرست کاربران پایین‌تر است',
  points: 'ادامهٔ ریز امتیازات پایین‌تر است',
  chat: 'پیام‌های قدیمی‌تر پایین‌ترند',
  support: 'تیکت‌های قدیمی‌تر پایین‌ترند',
  notifications: 'اطلاعیه‌های دیگر پایین‌ترند',
  settings: 'تنظیمات بیشتر پایین‌ترند',
  'recommended-apps': 'برنامه‌های دیگر پایین‌ترند',
  'live-copy': 'کلیدهای دیگر پایین‌ترند',
  engine: 'پارامترهای موتور پایین‌ترند',
  admins: 'حساب‌های دیگر پایین‌ترند',
};
const DEFAULT_HINT = 'ادامهٔ این صفحه پایین‌تر است';

// Responsive app shell: permanent sidebar on desktop, slide-in drawer +
// hamburger on mobile — same principle as the Flutter admin shell
// (side-rail vs. Drawer) so the whole product family behaves consistently.
export function AppShell({ nav, navGroups = {}, activePage, onNavigate, onLogout, title, subtitle, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // ظرفِ اسکرولِ پنل. راهنمای اسکرول باید بداند **کدام** عنصر اسکرول می‌شود؛
  // در پنل این `window` نیست، `.content-area` است. (باگِ نسخهٔ قبلی: به
  // `window` تکیه می‌کرد و روی دسکتاپ هیچ‌وقت سرریز نمی‌دید.)
  const contentRef = useRef(null);
  // ── عوض‌کردنِ صفحه = برگشت به بالای صفحه ──────────────────────────────
  //
  // بدونِ این، `scrollTop` از صفحهٔ قبلی می‌ماند: مدیر صفحهٔ تازه را باز
  // می‌کند و وسطِ جدول فرود می‌آید (سرِ صفحه و فیلترها دیده نمی‌شود) و
  // راهنمای اسکرول هم بی‌گناه می‌ماند، چون واقعاً پایینِ صفحه است. در
  // وب‌کاربر همان کار با `window.scrollTo` انجام می‌شود.
  useEffect(() => {
    const el = contentRef.current;
    if (el && el.scrollTop > 0) el.scrollTop = 0;
  }, [activePage]);
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
          {/* C5: روی موبایل کشو با دکمهٔ صریح بسته شود (نه فقط scrim/انتخاب آیتم) —
              دسترس‌پذیری و یافتنِ راه خروج برای مدیرِ تازه‌کار. روی دسکتاپ مخفی. */}
          <button
            className="btn btn-icon btn-ghost sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="بستن منو"
          >
            <X size={20} />
          </button>
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
        <main className="content-area" ref={contentRef}>
          {/* ⚠️ این wrapper **هیچ `key`ی ندارد**: قبلاً همین‌جا
              `<ScrollHint key={activePage}>` بود و کلیدش با کلیدهای
              هم‌سطحش تکرار می‌شد؛ React دو فرزندِ هم‌کلید را تکراری
              می‌بیند و لایه‌های راهنما را بدونِ حذفِ قبلی می‌سازد. */}
          <div className="contentPane">{children}</div>
        </main>
        {/* لایهٔ راهنما **بیرونِ** ظرفِ اسکرول است (وگرنه با محتوا اسکرول
            می‌شد و از دید می‌رفت) و داخلِ `.main-area` که `position:relative`
            است — پس لنگرش قابِ محتواست، نه لبهٔ نمایشگر. */}
        <ScrollHint
          targetRef={contentRef}
          resetKey={activePage}
          hintLabel={ADMIN_SCROLL_HINTS[activePage] || DEFAULT_HINT}
        />
      </div>
    </div>
  );
}
