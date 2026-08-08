// Notification bell + panel.
//
// The admin panel can broadcast announcements and the API serves them from
// /api/notifications, but for a long time no client rendered them, so every
// announcement was written to the database and never seen.
//
// Polls on a slow interval; failures are silent because an announcement is
// not worth an error toast.
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { req, fa } from '../lib/api.js';
import { EmptyView } from './states.jsx';
import { SvgIcon } from './IconAsset.jsx';

const POLL_MS = 60000;

export default function Notifications({ token }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await req('/api/notifications', 'GET', null, token);
      // A response landing after unmount must not set state.
      if (alive.current) setItems(res || []);
    } catch {
      /* announcements are best-effort */
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Close on Escape — a modal with no keyboard escape traps desktop users.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unread = items.filter(n => !n.is_read).length;

  async function markRead(n) {
    if (n.is_read) return;
    setItems(list => list.map(x => (x.id === n.id ? { ...x, is_read: true } : x)));
    try {
      await req(`/api/notifications/${n.id}/read`, 'PATCH', {}, token);
    } catch {
      /* local state already reflects it */
    }
  }

  return (
    <>
      <button className="iconBtn bell" title="اعلان‌ها"
        aria-label={unread > 0 ? `اعلان‌ها، ${unread} خوانده‌نشده` : 'اعلان‌ها'}
        onClick={() => setOpen(o => !o)}>
        <SvgIcon name="bell" size={19} />{unread > 0 && <i className="badge">{fa(unread)}</i>}
      </button>

      {open && (
        <div className="notifShade" onClick={() => setOpen(false)}>
          <div className="notifPanel" onClick={e => e.stopPropagation()}
            role="dialog" aria-label="اعلان‌ها">
            <div className="notifHead">
              <b>اعلان‌ها</b>
              <button className="ghost" onClick={() => setOpen(false)}>بستن</button>
            </div>
            {items.length ? (
              <div className="notifList">
                {items.map(n => (
                  <div key={n.id}
                    className={`notifItem${n.is_read ? '' : ' unread'}`}
                    onClick={() => markRead(n)}>
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                    <small>
                      {new Date(n.created_at).toLocaleDateString('fa-IR')}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyView icon="bell">اعلانی نداری.</EmptyView>
            )}
          </div>
        </div>
      )}
    </>
  );
}
