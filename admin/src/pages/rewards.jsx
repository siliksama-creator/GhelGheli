import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Gift, Image as ImageIcon, Upload, XCircle } from 'lucide-react';
import { assetUrl, fmtNumber } from '../lib/api.js';
import { Badge, Button, Card, DataRow, EmptyState, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const CLAIM_LABELS = { pending: ['در انتظار', 'warning'], approved: ['تایید‌شده', 'info'], paid: ['پرداخت‌شده', 'success'], rejected: ['رد‌شده', 'danger'] };

export function RewardsPage({ request }) {
  const notify = useToast();
  const [rewards, setRewards] = useState([]);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState({ name: '', points: '', type: 'cash', value: '', desc: '', image: '' });
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    request('/api/admin/rewards').then(setRewards);
    request('/api/admin/reward-claims').then(setClaims);
  };
  useEffect(load, [request]);

  async function add(e) {
    e.preventDefault();
    if (rewards.length >= 30) {
      notify('حداکثر ۳۰ جایزه قابل تعریف است', 'error');
      return;
    }
    setSaving(true);
    try {
      let imageUrl = form.image;
      if (imageFile) imageUrl = await request.uploadImage(imageFile);
      await request('/api/admin/rewards', {
        method: 'POST',
        body: {
          name: form.name,
          requiredPoints: Number(form.points) || 0,
          rewardType: form.type,
          rewardValue: form.value,
          description: form.desc,
          imageUrl,
          displayOrder: rewards.length + 1,
        },
      });
      setForm({ name: '', points: '', type: 'cash', value: '', desc: '', image: '' });
      setImageFile(null);
      notify('جایزه ذخیره شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id, status) {
    await request(`/api/admin/reward-claims/${id}`, { method: 'PATCH', body: { status } });
    notify('وضعیت درخواست ثبت شد');
    load();
  }

  return (
    <div className="card-grid cols-2">
      <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
        <Card title={`سطح جایزه جدید (${fmtNumber(rewards.length)}/۳۰)`}>
          <form onSubmit={add}>
            <Field label="نام جایزه">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="آستانه امتیاز">
              <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} required />
            </Field>
            <Field label="نوع جایزه">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="cash">نقدی</option>
                <option value="physical">فیزیکی</option>
              </Select>
            </Field>
            <Field label="مبلغ / توضیح جایزه">
              <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
            <Field label="عکس جایزه">
              <div className="file-field">
                <Input placeholder="آدرس عکس آماده" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                <label className="btn btn-secondary btn-icon" style={{ cursor: 'pointer' }}>
                  <Upload size={16} />
                  <input type="file" accept="image/*" hidden onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </Field>
            <Field label="توضیحات">
              <Textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} />
            </Field>
            <Button type="submit" loading={saving} disabled={rewards.length >= 30} className="btn-block">
              ذخیره جایزه
            </Button>
          </form>
        </Card>

        <Card title="سطح‌های جایزه فعلی">
          {rewards.length === 0 ? (
            <EmptyState icon={Gift} title="هنوز جایزه‌ای تعریف نشده" />
          ) : (
            rewards.map((r) => (
              <DataRow
                key={r.id}
                thumb={
                  r.image_url ? (
                    <img className="thumb thumb-lg" src={assetUrl(r.image_url)} alt="" />
                  ) : (
                    <div className="thumb thumb-lg" style={{ display: 'grid', placeItems: 'center' }}>
                      <ImageIcon size={18} />
                    </div>
                  )
                }
                title={r.name}
                subtitle={`${fmtNumber(r.required_points)} امتیاز — ${r.reward_value}`}
              />
            ))
          )}
        </Card>
      </div>

      <Card title="درخواست‌های جایزه">
        {claims.length === 0 ? (
          <EmptyState icon={CreditCard} title="درخواستی وجود ندارد" />
        ) : (
          claims.map((c) => {
            const [label, tone] = CLAIM_LABELS[c.status] || [c.status, 'neutral'];
            return (
              <DataRow
                key={c.id}
                title={`${c.mobile} — ${c.reward_name}`}
                trailing={<Badge tone={tone}>{label}</Badge>}
                actions={
                  <>
                    <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => setStatus(c.id, 'approved')}>
                      تایید
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus(c.id, 'paid')}>
                      پرداخت‌شده
                    </Button>
                    <Button size="sm" variant="danger" icon={XCircle} onClick={() => setStatus(c.id, 'rejected')}>
                      رد
                    </Button>
                  </>
                }
              />
            );
          })
        )}
      </Card>
    </div>
  );
}
