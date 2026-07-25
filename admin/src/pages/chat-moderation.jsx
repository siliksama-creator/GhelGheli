import { useEffect, useState } from 'react';
import { Ban, Flag, MessageCircle, Pin, PinOff, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DataRow, EmptyState, Field, IconButton, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

// Must match PIN_ACCENTS on the server and pinAccents in the Flutter app.
const ACCENTS = [
  { key: 'gold', label: 'طلایی', color: '#FFC53D' },
  { key: 'green', label: 'سبز', color: '#34D399' },
  { key: 'blue', label: 'آبی', color: '#60A5FA' },
  { key: 'red', label: 'قرمز', color: '#F87171' },
];

/// Editor for the announcement pinned above the chat room. Replaces the old
/// static "avoid profanity" strip, which became meaningless once users could
/// only send predefined messages.
function PinnedMessageCard({ request }) {
  const notify = useToast();
  const [text, setText] = useState('');
  const [accent, setAccent] = useState('gold');
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    request('/api/admin/chat/pinned')
      .then((d) => {
        setText(d.text || '');
        setAccent(d.accent || 'gold');
        setActive(!!d.active);
      })
      .catch(() => {});
  }, [request]);

  async function save(nextActive) {
    if (nextActive && !text.trim()) {
      notify('ابتدا متن پیام را بنویسید', 'error');
      return;
    }
    setSaving(true);
    try {
      const d = await request('/api/admin/chat/pinned', {
        method: 'PATCH',
        body: { text: text.trim(), accent, active: nextActive },
      });
      setActive(!!d.active);
      notify(d.message || 'ذخیره شد');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const color = (ACCENTS.find((a) => a.key === accent) || ACCENTS[0]).color;

  return (
    <Card
      title="پیام سنجاق‌شده چت روم"
      subtitle="بالای چت روم همه کاربران با رنگ متفاوت نمایش داده می‌شود"
      action={active ? <Badge tone="success">فعال</Badge> : null}
    >
      <Field label="متن اعلان">
        <Textarea
          rows={3}
          maxLength={300}
          value={text}
          placeholder="مثال: مسابقه ویژه این هفته آغاز شد 🎉"
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <Field label="رنگ نمایش">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAccent(a.key)}
              className={`btn btn-sm ${accent === a.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                background: a.color, display: 'inline-block',
              }} />
              {a.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="پیش‌نمایش">
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
          borderRadius: 12, border: `1px solid ${color}8c`, background: `${color}22`,
        }}>
          <Pin size={15} style={{ color, flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ color, fontSize: 11, fontWeight: 800 }}>اعلان مدیریت</div>
            <div style={{ color, fontWeight: 700, lineHeight: 1.5 }}>
              {text.trim() || 'متن اعلان اینجا نمایش داده می‌شود'}
            </div>
          </div>
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button icon={Pin} loading={saving} onClick={() => save(true)}>
          {active ? 'به‌روزرسانی سنجاق' : 'سنجاق کن'}
        </Button>
        {active && (
          <Button variant="secondary" icon={PinOff} loading={saving} onClick={() => save(false)}>
            برداشتن سنجاق
          </Button>
        )}
      </div>
    </Card>
  );
}

export function ChatModerationPage({ request }) {
  const notify = useToast();
  const [rows, setRows] = useState([]);

  const load = () => request('/api/admin/chat/messages').then(setRows);
  useEffect(load, [request]);

  async function del(id) {
    await request(`/api/admin/chat/messages/${id}/delete`, { method: 'PATCH', body: { reason: 'پیام نامناسب' } });
    notify('پیام حذف شد');
    load();
  }

  async function ban(uid) {
    await request(`/api/admin/chat/users/${uid}/ban`, { method: 'PATCH', body: { minutes: 1440, reason: 'اسپم/تخلف' } });
    notify('کاربر از چت محروم شد');
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
    <PinnedMessageCard request={request} />
    <Card title="پیام‌های اخیر چت روم" subtitle="حذف پیام و محرومیت ۲۴ ساعته کاربر از چت">
      {rows.length === 0 ? (
        <EmptyState icon={MessageCircle} title="پیامی وجود ندارد" />
      ) : (
        rows.map((m) => (
          <DataRow
            key={m.id}
            title={m.nickname || m.mobile}
            subtitle={m.message_text}
            trailing={m.is_reported ? <Badge tone="warning"><Flag size={11} /> گزارش‌شده</Badge> : null}
            actions={
              <>
                <IconButton icon={Trash2} variant="ghost" title="حذف پیام" onClick={() => del(m.id)} />
                <IconButton icon={Ban} variant="danger" title="بن چت" onClick={() => ban(m.user_id)} />
              </>
            }
          />
        ))
      )}
    </Card>
    </div>
  );
}
