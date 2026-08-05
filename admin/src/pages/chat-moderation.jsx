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

// ═══════════════════════════════════════════════════════════════════════════
// همان اکسنت‌ها برای پیش‌نمایشِ تم روشن
// ═══════════════════════════════════════════════════════════════════════════
//
// پیش‌نمایش متن را با رنگِ اکسنت روی تینتِ ۱۳٪ همان رنگ می‌کشد. روی
// پس‌زمینهٔ روشنِ پنل طلایی فقط ۱.۴۷:۱ می‌داد — مدیر متنی را که دارد
// می‌نویسد نمی‌دید.
//
// باید با `PIN_COLORS_LIGHT` در userweb/src/lib/api.js و
// `pinAccentsOnLight` در mobile/lib/.../pinned_banner.dart یکی بماند،
// وگرنه پیش‌نمایشِ مدیر با چیزی که کاربر می‌بیند فرق می‌کند — که
// بدترین حالتِ ممکن برای یک ابزارِ پیش‌نمایش است.
const ACCENTS_LIGHT = {
  gold: '#885F00', green: '#197554', blue: '#0762D3', red: '#C90A0A',
};

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

  // متغیرِ CSS به‌جای مقدارِ ثابت: پیش‌نمایش باید همان چیزی را نشان دهد
  // که کاربر می‌بیند، و کاربر بسته به تمش دو رنگِ متفاوت می‌بیند.
  const accentKey = ACCENTS.some((a) => a.key === accent) ? accent : 'gold';
  // نکتهٔ آبشار: `--pin` را درون‌خطی **نمی‌نویسیم**. اعلانِ درون‌خطی از
  // هر انتخابگری قوی‌تر است، پس قانونِ تم هیچ‌وقت نمی‌توانست عوضش کند
  // (این دقیقاً همان اشتباهی بود که تلاشِ اول را بی‌اثر کرد). فقط دو
  // متغیرِ ورودی می‌دهیم و `--pin` را theme.css می‌سازد.
  const colorVars = {
    '--pin-dark': (ACCENTS.find((a) => a.key === accentKey) || ACCENTS[0]).color,
    '--pin-light': ACCENTS_LIGHT[accentKey],
  };
  const color = 'var(--pin)';

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
        {/* `${color}8c` جواب نمی‌دهد وقتی color یک `var()` است — الحاقِ
            رشته‌ای روی متغیرِ CSS مقدارِ نامعتبر می‌سازد. `color-mix`
            همان کار را می‌کند و با متغیر هم سازگار است. */}
        <div className="pinPreview" style={{
          ...colorVars,
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid color-mix(in srgb, var(--pin) 55%, transparent)',
          background: 'color-mix(in srgb, var(--pin) 13%, transparent)',
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
  // ═══════════════════════════════════════════════════════════════════
  // چرا () => { load(); } و نه useEffect(load, ...)
  // ═══════════════════════════════════════════════════════════════════
  //
  // اگر `load` یک Promise برگرداند (یعنی arrow بدون آکولاد)، ری‌اکت آن
  // مقدارِ برگشتی را **تابعِ پاک‌سازی** فرض می‌کند و هنگام خروج از صفحه
  // صدایش می‌زند. یک Promise تابع نیست، پس:
  //
  //     TypeError: n is not a function
  //
  // و کل پنل سفید می‌شود. روی سرور زنده بازتولید شد: رفتن به «لیگ
  // ماهانه» و بعد «کاربران» → پنل خالی، بدنهٔ صفحه صفر بایت.
  //
  // پیچیدنِ فراخوانی در آکولاد یعنی effect همیشه undefined برمی‌گرداند
  // و ری‌اکت هیچ‌وقت چیزی را به‌عنوان cleanup صدا نمی‌زند.
  useEffect(() => { load(); }, [request]);

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
