import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Save, Link2, Eye } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ماموریت اختصاصی — متن، امتیاز و لینکِ رنگی، بدون آپدیت اپ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک (۱۷ شهریور): «قبلِ ماموریتِ امروز یک قسمت به‌عنوانِ ماموریتِ
 * اختصاصی قرار بگیرد. این ماموریت را ادمین در پنل مشخص و امتیازدهی کند.
 * اگر ادمین این ماموریت را فعال کرد، کاربران همه این ماموریت را می‌بینند.
 * ادمین بتواند یک لینکِ قابلِ کلیک هم بسازد و حتی لینک را پشتِ کلماتی مثلِ
 * «اینجا کلیک کنید» بگذارد — با رنگِ مثلاً آبی یا سبز.»
 *
 * ── چه چیزی اینجا تعیین می‌شود ────────────────────────────────────────────
 *
 *   • کلیدِ روشن/خاموش — تا وقتی خاموش است، هیچ کاربری چیزی نمی‌بیند و
 *     رفتارِ امروزِ اپ دست‌نخورده می‌ماند.
 *   • عنوان + توضیح — همان چیزی که کاربر در کارتِ بالای «ماموریت‌های امروز»
 *     می‌خواند.
 *   • امتیاز — به ازای هر کاربر، در «دفتر امتیاز» با منبعِ «ماموریت» ثبت
 *     می‌شود (نه با تنطیمِ دستی، پس قابلِ ردیابی است).
 *   • لینکِ اختیاری: نشانی + متنِ روی لینک + رنگ. اگر متن خالی بماند،
 *     «اینجا کلیک کنید» می‌نشیند.
 *
 * ── چرا «ذخیره» یک شناسهٔ تازه می‌سازد ────────────────────────────────────
 *
 * هر ذخیره، ماموریتِ **دورهٔ تازه** می‌شود: کاربری که امتیازِ ماموریتِ قبلی
 * را گرفته، می‌تواند امتیازِ این یکی را هم بگیرد. بدونِ این، ادمین برای
 * کمپینِ دوم باید کلید را خاموش/روشن می‌کرد و همان کاربران دیگر امتیازی
 * نمی‌گرفتند (یا بدتر: دوباره امتیاز می‌گرفتند بدونِ کارِ تازه).
 */
export function CustomMissionPage({ request }) {
  const notify = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({ colors: ['blue', 'green'], defaultLinkText: 'اینجا کلیک کنید', hint: '' });
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({
    enabled: false, title: '', body: '', points: 0,
    linkUrl: '', linkText: '', linkColor: 'blue',
  });

  const applyMission = useCallback((m, colors) => {
    const link = m?.link || {};
    setForm({
      enabled: m?.enabled === true,
      title: m?.title || '',
      body: m?.body || '',
      points: Number(m?.points || 0),
      linkUrl: link.url || '',
      linkText: link.text || '',
      linkColor: colors?.includes(link.color) ? link.color : 'blue',
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    request('/api/admin/custom-mission')
      .then((d) => {
        const colors = d.colors || ['blue', 'green'];
        setMeta({ colors, defaultLinkText: d.defaultLinkText || 'اینجا کلیک کنید', hint: d.hint || '' });
        applyMission(d.mission, colors);
        setPreview(d.preview);
      })
      .catch((e) => notify(e.message || 'خواندنِ ماموریت ناموفق بود', 'error'))
      .finally(() => setLoading(false));
  }, [request, notify, applyMission]);

  useEffect(load, [load]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await request('/api/admin/custom-mission', {
        method: 'PUT',
        body: {
          enabled: form.enabled,
          title: form.title,
          body: form.body,
          points: Number(form.points) || 0,
          link: { url: form.linkUrl, text: form.linkText, color: form.linkColor },
        },
      });
      notify(r.message, 'success');
      if (r.preview !== undefined) setPreview(r.preview);
      if (r.mission) applyMission(r.mission, meta.colors);
    } catch (e) {
      notify(e.message || 'ذخیره ناموفق بود', 'error');
    } finally {
      setBusy(false);
    }
  }

  const linkColor = form.linkColor === 'green' ? '#22E7A6' : '#7DD8FF';
  const linkText = form.linkText.trim() || meta.defaultLinkText;

  return (
    <div className="grid" style={{ display: 'grid', gap: 16 }}>
      <Card
        title="ماموریت اختصاصی"
        subtitle={meta.hint || 'کارتِ بالای «ماموریت‌های امروز» برای همهٔ کاربران — بدون آپدیت اپ.'}
        action={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge tone={form.enabled ? 'success' : 'neutral'}>
              {form.enabled ? 'فعال — کاربران می‌بینند' : 'خاموش — کسی نمی‌بیند'}
            </Badge>
            <Button icon={Save} loading={busy} onClick={save}>ذخیره و اعمال</Button>
          </div>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field label="عنوان ماموریت" hint="حداکثر ۶۰ نویسه — همان خطِ درشتِ کارت.">
            <Input
              value={form.title}
              maxLength={60}
              placeholder="مثلاً: کانال ما را دنبال کن"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <Field label="امتیاز" hint="به ازای هر کاربر، یک‌بار برای هر دوره؛ در دفتر امتیاز با منبعِ «ماموریت» ثبت می‌شود.">
            <Input
              type="number"
              min={0}
              value={form.points}
              onChange={(e) => setForm({ ...form, points: e.target.value })}
            />
          </Field>
        </div>

        <Field label="توضیح" hint="حداکثر ۳۰۰ نویسه — یک جملهٔ روشن که بگوید کاربر چه کار کند.">
          <Textarea
            rows={3}
            maxLength={300}
            value={form.body}
            placeholder="مثلاً: وارد کانال شو و ما را دنبال کن؛ بعد دکمهٔ دریافت را بزن."
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field label="نشانی لینک (اختیاری)" hint="فقط http:// یا https:// پذیرفته می‌شود؛ لینکِ نامعتبر ذخیره نمی‌شود.">
            <Input
              value={form.linkUrl}
              placeholder="https://t.me/…"
              onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
            />
          </Field>
          <Field label="متنِ روی لینک" hint="اگر خالی بماند، «اینجا کلیک کنید» می‌نشیند.">
            <Input
              value={form.linkText}
              maxLength={24}
              placeholder={meta.defaultLinkText}
              onChange={(e) => setForm({ ...form, linkText: e.target.value })}
            />
          </Field>
          <Field label="رنگ لینک" hint="رنگِ متنِ لینک در اپ و وب.">
            <Select
              value={form.linkColor}
              onChange={(e) => setForm({ ...form, linkColor: e.target.value })}
            >
              <option value="blue">آبی</option>
              <option value="green">سبز</option>
            </Select>
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <span style={{ fontWeight: 800 }}>
            فعال باشد — همهٔ کاربرانِ وب و اندروید این ماموریت را می‌بینند
          </span>
        </label>
      </Card>

      <Card
        title="پیش‌نمایشِ زنده"
        subtitle="دقیقاً همان چیزی که کاربر در اپ و وب می‌بیند."
        action={<Button variant="secondary" icon={Eye} onClick={load} loading={loading}>تازه‌سازی</Button>}
      >
        {!form.title.trim() ? (
          <p style={{ color: 'var(--gg-muted)' }}>
            عنوان را پر کنید تا پیش‌نمایش ساخته شود. تا وقتی کلیدِ «فعال» روشن
            نباشد، این کارت برای هیچ کاربری نمایش داده نمی‌شود.
          </p>
        ) : (
          <div style={{
            maxWidth: 420, padding: 14, borderRadius: 16,
            background: 'linear-gradient(135deg, #241b45, #0c2135)',
            border: '1px solid rgba(255,209,102,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Megaphone size={16} color="#FFD166" />
              <strong style={{ color: '#FFD166', fontSize: 12.5 }}>ماموریت اختصاصی</strong>
              <span style={{ marginInlineStart: 'auto', color: '#FFD166', fontWeight: 900 }}>
                +{Number(form.points || 0).toLocaleString('fa-IR')}
              </span>
            </div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 14.5, marginBottom: 4 }}>{form.title}</div>
            {form.body.trim() && (
              <div style={{ color: '#B6C6D8', fontSize: 12, lineHeight: 1.7 }}>{form.body}</div>
            )}
            {form.linkUrl.trim() && (
              <div style={{ marginTop: 7 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: linkColor, fontWeight: 900, fontSize: 13, textDecoration: 'underline' }}>
                  <Link2 size={14} /> {linkText}
                </span>
              </div>
            )}
            {Number(form.points) > 0 && (
              <div style={{ marginTop: 10 }}>
                <span style={{
                  display: 'inline-block', padding: '7px 14px', borderRadius: 10, fontWeight: 900, fontSize: 12,
                  background: 'rgba(132,204,22,0.16)', border: '1px solid rgba(132,204,22,0.45)', color: '#B8F06B',
                }}>دریافت امتیاز</span>
              </div>
            )}
            <div style={{ marginTop: 8, color: '#94A3B8', fontSize: 10.5, lineHeight: 1.8 }}>
              {form.enabled
                ? 'این کارت الان بالای «ماموریت‌های امروز» به همهٔ کاربران نشان داده می‌شود.'
                : 'کلیدِ فعال خاموش است — کاربران این کارت را نمی‌بینند.'}
            </div>
          </div>
        )}
        {preview === null && !loading && (
          <p style={{ color: 'var(--gg-muted)', marginTop: 10 }}>
            در حالِ حاضر ماموریتِ فعالی برای کاربران وجود ندارد.
          </p>
        )}
      </Card>
    </div>
  );
}
