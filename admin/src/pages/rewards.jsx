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
  const [groups, setGroups] = useState([]);
  const [cardTypes, setCardTypes] = useState([]);
  const [groupForm, setGroupForm] = useState({ name: '', groupType: 'mixed', accent: 'emerald', desc: '', image: '' });
  const [groupSaving, setGroupSaving] = useState(false);
  // Which tier's card requirements are being edited, and the draft list.
  const [cardEditor, setCardEditor] = useState(null);
  const [form, setForm] = useState({ name: '', points: '', type: 'cash', value: '', cash: '', desc: '', image: '', groupId: '', maxClaims: '0' });
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    request('/api/admin/rewards').then(setRewards);
    request('/api/admin/reward-claims').then(setClaims);
    request('/api/admin/reward-groups').then(d => setGroups(d.groups || []));
    // Needed for the "required cards" picker.
    request('/api/admin/card-types').then(d => setCardTypes(Array.isArray(d) ? d : (d.cardTypes || [])));
  };
  useEffect(load, [request]);

  async function add(e) {
    e.preventDefault();
    // ═══════════════════════════════════════════════════════════════════
    // باگِ «ثبت جوایز از کار افتاده»: سقفِ کلاینت ۳۰ بود ولی سرور اجازهٔ
    // ۵۰۰ جایزه می‌دهد و دیتابیسِ زنده از ۳۰ گذشته بود. نتیجه: دکمهٔ
    // «ذخیره جایزه» برای همیشه غیرفعال می‌ماند و مدیر نمی‌توانست
    // جایزهٔ تازه ثبت کند — بدون هیچ پیامی، فقط دکمه قفل.
    //
    // حالا کلاینت با سرور هم‌راستاست (۵۰۰) و فقط بالای همان سقفِ واقعیِ
    // سرور پیام می‌دهد. دکمه هم به‌جای قفل مطلق، فقط وقتی بالای ۵۰۰ باشد
    // غیرفعال است — سرور هنوز معتبرترین مرجعِ سقف است و همین‌جا هم بازتولید
    // واریانسِ کلاینت/سرور نمی‌شود.
    if (rewards.length >= 500) {
      notify('حداکثر ۵۰۰ جایزه فعال قابل تعریف است', 'error');
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
          // فقط جایزهٔ نقدی مبلغ واریزی دارد؛ برای جایزهٔ فیزیکی صفر می‌رود
          cashAmount: form.type === 'cash' ? Number(form.cash) || 0 : 0,
          description: form.desc,
          imageUrl,
          displayOrder: rewards.length + 1,
          groupId: form.groupId || null,
          maxClaimsPerUser: Number(form.maxClaims) || 0,
        },
      });
      setForm({ name: '', points: '', type: 'cash', value: '', cash: '', desc: '', image: '', groupId: form.groupId });
      setImageFile(null);
      notify('جایزه ذخیره شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function addGroup(e) {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setGroupSaving(true);
    try {
      await request('/api/admin/reward-groups', {
        method: 'POST',
        body: {
          name: groupForm.name.trim(),
          groupType: groupForm.groupType,
          accent: groupForm.accent,
          description: groupForm.desc,
          imageUrl: groupForm.image,
          displayOrder: groups.length + 1,
        },
      });
      setGroupForm({ name: '', groupType: 'mixed', accent: 'emerald', desc: '', image: '' });
      notify('گروه جایزه ساخته شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setGroupSaving(false);
    }
  }

  async function toggleGroup(g) {
    await request(`/api/admin/reward-groups/${g.id}`, {
      method: 'PATCH', body: { isActive: !g.is_active },
    });
    notify(g.is_active ? 'گروه غیرفعال شد' : 'گروه فعال شد');
    load();
  }

  async function moveTier(tierId, groupId) {
    await request(`/api/admin/rewards/${tierId}`, {
      method: 'PATCH', body: { groupId: groupId || null },
    });
    notify('گروه جایزه تغییر کرد');
    load();
  }

  async function saveCards() {
    if (!cardEditor) return;
    try {
      await request(`/api/admin/rewards/${cardEditor.tierId}/cards`, {
        method: 'PUT',
        body: { cards: cardEditor.cards.filter(c => c.cardTypeId && c.quantity > 0) },
      });
      notify('کارت‌های موردنیاز ذخیره شد');
      setCardEditor(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
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
        <Card title="گروه‌های جایزه"
          subtitle="جایزه‌ها را گروه‌بندی کنید (مثلاً «نقدی»، «فروشگاهی»)؛ هر گروه مستقل نمایش داده می‌شود">
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            هر گروه نوار پیشرفت مستقل دارد؛ کاربر می‌تواند در هر گروه جداگانه
            جایزه بگیرد و نوار همان گروه از ابتدا شروع می‌شود.
          </p>
          <form onSubmit={addGroup} style={{ display: 'grid', gap: 10 }}>
            <Field label="نام گروه"
              hint="تیترِ بخش در صفحهٔ جوایز؛ کاربر همین را می‌خواند نه نوعِ گروه را.">
              <Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} required />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="نوع گروه"
              hint="فرمِ دریافت را عوض می‌کند: «نقدی» آدرس/شماره کارت می‌خواهد و «فیزیکی» نشانیِ پست.">
                <Select value={groupForm.groupType} onChange={(e) => setGroupForm({ ...groupForm, groupType: e.target.value })}>
                  <option value="mixed">ترکیبی</option>
                  <option value="cash">نقدی</option>
                  <option value="physical">فیزیکی</option>
                </Select>
              </Field>
              <Field label="رنگ"
              hint="فقط یکی از پنج رنگِ همین فهرست؛ رنگِ دلخواه در پنل ساخته نمی‌شود (طرحِ کلاینت از همین پنج نام می‌آید).">
                <Select value={groupForm.accent} onChange={(e) => setGroupForm({ ...groupForm, accent: e.target.value })}>
                  <option value="emerald">زمردی</option>
                  <option value="gold">طلایی</option>
                  <option value="blue">آبی</option>
                  <option value="purple">بنفش</option>
                  <option value="rose">قرمز</option>
                </Select>
              </Field>
            </div>
            <Field label="توضیح"
              hint="زیرِ نامِ گروه در اپ نمایش داده می‌شود؛ اگر خالی بماند هیچ خطی چاپ نمی‌شود.">
              <Input value={groupForm.desc} onChange={(e) => setGroupForm({ ...groupForm, desc: e.target.value })} />
            </Field>
            <Field label="آدرس عکس گروه"
              hint="مسیرِ `/uploads/images/…` یا آدرسِ کامل؛ پاک‌سازیِ فایل‌های یتیم فقط فایلِ بی‌ارجاع را می‌برد.">
              <Input value={groupForm.image} onChange={(e) => setGroupForm({ ...groupForm, image: e.target.value })} placeholder="/uploads/images/..." />
            </Field>
            <Button type="submit" disabled={groupSaving}>
              {groupSaving ? 'در حال ذخیره...' : 'ساخت گروه'}
            </Button>
          </form>

          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            {groups.filter((g) => g.id).map((g) => (
              <DataRow key={g.id}
                title={g.name}
                subtitle={`${g.group_type === 'cash' ? 'نقدی' : g.group_type === 'physical' ? 'فیزیکی' : 'ترکیبی'} · ${fmtNumber((g.tiers || []).length)} جایزه`}
                right={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge tone={g.is_active ? 'success' : 'muted'}>
                      {g.is_active ? 'فعال' : 'غیرفعال'}
                    </Badge>
                    <Button variant="ghost" onClick={() => toggleGroup(g)}>
                      {g.is_active ? 'غیرفعال' : 'فعال'}
                    </Button>
                  </div>
                } />
            ))}
            {!groups.filter((g) => g.id).length && <EmptyState title="هنوز گروهی نساخته‌اید" />}
          </div>
        </Card>

        <Card title={`سطح جایزه جدید (${fmtNumber(rewards.length)}/۵۰۰)`}>
          <form onSubmit={add}>
            <Field label="نام جایزه"
              hint="همان چیزی که کاربر رویِ کارتِ جایزه در اپ می‌بیند؛ در دفترِ امتیاز هم همین نوشته می‌شود.">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="گروه جایزه"
              hint="فقط جای نمایش را تعیین می‌کند؛ اگر گروهی «نقدی» باشد و این جایزه «فیزیکی»، فرمِ درخواستِ کاربر به همان گروه می‌رود.">
              <Select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                <option value="">بدون گروه</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="حداکثر دریافت برای هر کاربر (۰ = نامحدود)"
              hint="سرور با «تعدادِ درخواستِ تأییدشده» مقایسه می‌کند، نه تعدادِ کلیک؛ درخواستِ ردشده دوباره جا می‌گذارد.">
              <Input type="number" min="0" value={form.maxClaims}
                onChange={(e) => setForm({ ...form, maxClaims: e.target.value })} />
            </Field>
            <Field label="آستانه امتیاز"
              hint="روی «موجودیِ امروز» سنجیده می‌شود (`current_points`)، برخلافِ حداقلِ امتیازِ چت که «امتیازِ کلِ عمر» را می‌بیند — دو عددِ شبیه، دو منبعِ متفاوت.">
              <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} required />
            </Field>
            <Field label="نوع جایزه">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="cash">نقدی</option>
                <option value="physical">فیزیکی</option>
              </Select>
            </Field>
            <Field label="مبلغ / توضیح جایزه"
              hint="برای جایزهٔ نقدی فقط متن است (مبلغِ واقعی فیلدِ زیرین است)؛ برای فیزیکی، همان رشته در کارتِ کاربر چاپ می‌شود.">
              <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
            {form.type === 'cash' && (
              <Field label="مبلغ واریز به کیف پول (تومان)">
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.cash}
                  onChange={(e) => setForm({ ...form, cash: e.target.value })}
                />
                <span className="topbar-sub" style={{ fontSize: 12 }}>
                  {Number(form.cash) > 0
                    ? `هنگام «پرداخت شد»، ${new Intl.NumberFormat('fa-IR').format(Number(form.cash))} تومان به کیف پول واریز می‌شود`
                    : 'صفر = واریز خودکار انجام نمی‌شود؛ فیلد بالا فقط متن است'}
                </span>
              </Field>
            )}
            <Field label="عکس جایزه"
              hint="اگر فایل تازه انتخاب کنید، تصویرِ تازه آپلود می‌شود و فایلِ قدیمی رویِ دیسک می‌ماند تا پاک‌سازیِ بعد.">
              <div className="file-field">
                <Input placeholder="آدرس عکس آماده" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                <label className="btn btn-secondary btn-icon" style={{ cursor: 'pointer' }}>
                  <Upload size={16} />
                  <input type="file" accept="image/*" hidden onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </Field>
            <Field label="توضیحات"
              hint="متنِ کاملِ جایزه در صفحهٔ جزئیاتِ اپ؛ کاربر پیش از تأییدِ دریافت این را می‌خواند.">
              <Textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} />
            </Field>
            <Button type="submit" loading={saving} disabled={rewards.length >= 500} className="btn-block">
              ذخیره جایزه
            </Button>
          </form>
        </Card>

        <Card title="سطح‌های جایزه فعلی"
          subtitle="هر سطح یک آستانهٔ امتیاز و یک جایزه دارد — کاربر با رسیدن به آستانه می‌تواند ادعا کند">
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
                right={
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Select value={r.group_id || ''} onChange={(e) => moveTier(r.id, e.target.value)}
                      style={{ minWidth: 130 }}>
                      <option value="">بدون گروه</option>
                      {groups.filter((g) => g.id).map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </Select>
                    <Button variant="ghost" onClick={() => setCardEditor({
                      tierId: r.id,
                      name: r.name,
                      cards: (r.required_cards || []).map((c) => ({
                        cardTypeId: c.cardTypeId, quantity: c.quantity,
                      })),
                    })}>کارت‌های لازم</Button>
                  </div>
                }
              />
            ))
          )}
        </Card>
      </div>

      {cardEditor && (
        <div className="modal-shade" onClick={() => setCardEditor(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>کارت‌های لازم برای «{cardEditor.name}»</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              کاربر علاوه بر امتیاز، باید این کارت‌ها را داشته باشد. هنگام
              دریافت جایزه فقط همین تعداد از موجودی‌اش کم می‌شود.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {cardEditor.cards.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 8 }}>
                  <Select value={c.cardTypeId} onChange={(e) => {
                    const next = [...cardEditor.cards];
                    next[i] = { ...next[i], cardTypeId: e.target.value };
                    setCardEditor({ ...cardEditor, cards: next });
                  }}>
                    <option value="">انتخاب کارت...</option>
                    {cardTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>{ct.name}</option>
                    ))}
                  </Select>
                  <Input type="number" min="1" value={c.quantity} onChange={(e) => {
                    const next = [...cardEditor.cards];
                    next[i] = { ...next[i], quantity: Number(e.target.value) || 1 };
                    setCardEditor({ ...cardEditor, cards: next });
                  }} />
                  <Button variant="ghost" onClick={() => setCardEditor({
                    ...cardEditor,
                    cards: cardEditor.cards.filter((_, j) => j !== i),
                  })}>حذف</Button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="ghost" onClick={() => setCardEditor({
                ...cardEditor,
                cards: [...cardEditor.cards, { cardTypeId: '', quantity: 1 }],
              })}>+ افزودن کارت</Button>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" onClick={() => setCardEditor(null)}>انصراف</Button>
              <Button onClick={saveCards}>ذخیره</Button>
            </div>
          </div>
        </div>
      )}

      <Card title="درخواست‌های جایزه"
          subtitle="ادعاهای کاربران: تأیید = واریز جایزه؛ رد = برگشت امتیاز">
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
