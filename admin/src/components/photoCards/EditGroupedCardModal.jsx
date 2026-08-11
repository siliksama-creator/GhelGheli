import { useState } from 'react';

import { Button, Field, Input, Textarea } from '../ui.jsx';

function initialForm(card) {
  return {
    name: card.card_type_name || '',
    points: String(card.point_value || 0),
    cash: String(card.cash_amount || 0),
    duel: {
      attack: String(card.duel_attack ?? 50),
      defense: String(card.duel_defense ?? 50),
      speed: String(card.duel_speed ?? 50),
      technique: String(card.duel_technique ?? 50),
      goalChance: String(card.duel_goal_chance ?? 50),
      energy: String(card.duel_energy ?? 100),
    },
    newCodes: '',
    newBatch: '',
    isActive: card.is_active !== false,
  };
}

/** Edits shared card_type metadata and adds codes once for all card sides. */
export function EditGroupedCardModal({ card, request, notify, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialForm(card));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const typeId = card.card_type_id;
      await request(`/api/admin/photo-cards/card-types/${typeId}`, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          pointValue: Number(form.points || 0),
          cashAmount: Number(form.cash || 0),
          isActive: form.isActive,
          duelAttack: Number(form.duel.attack || 50),
          duelDefense: Number(form.duel.defense || 50),
          duelSpeed: Number(form.duel.speed || 50),
          duelTechnique: Number(form.duel.technique || 50),
          duelGoalChance: Number(form.duel.goalChance || 50),
          duelEnergy: Number(form.duel.energy || 100),
        },
      });
      if (form.newCodes.trim()) {
        const result = await request(`/api/admin/photo-cards/card-types/${typeId}/add-codes`, {
          method: 'POST',
          body: {
            rawCodes: form.newCodes.trim(),
            batchLabel: form.newBatch.trim() || undefined,
          },
        });
        notify(result.message || 'کدها اضافه شدند', 'success');
      } else {
        notify('مشخصات کارت با موفقیت به‌روزرسانی شد', 'success');
      }
      onClose();
      onSaved();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalShade" onClick={() => !saving && onClose()}>
      <div className="publicModal" style={{ maxWidth: 540 }} onClick={event => event.stopPropagation()}>
        <button className="close" onClick={() => !saving && onClose()}>×</button>
        <h2>ویرایش کارت «{card.card_type_name}»</h2>
        <p className="topbar-sub">این تغییرات روی کارت و همهٔ تصاویر رو و پشت آن اعمال می‌شود.</p>

        <div className="stack" style={{ marginTop: 14 }}>
          <Field label="نام کارت">
            <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
          </Field>
          <div className="card-grid cols-2">
            <Field label="امتیاز کارت">
              <Input type="number" min="0" value={form.points}
                onChange={event => setForm({ ...form, points: event.target.value })} />
            </Field>
            <Field label="جایزه نقدی (تومان)">
              <Input type="number" min="0" value={form.cash}
                onChange={event => setForm({ ...form, cash: event.target.value })} />
            </Field>
          </div>

          <div className="card" style={{ padding: 10 }}>
            <b>استات دوئل کارت (Ghost)</b>
            <div className="card-grid cols-3" style={{ marginTop: 6 }}>
              {[
                ['attack', 'حمله'], ['defense', 'دفاع'], ['speed', 'سرعت'],
                ['technique', 'تکنیک'], ['goalChance', 'شانس گل'], ['energy', 'انرژی'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input type="number" min="0" max="100" value={form.duel[key] ?? 50}
                    onChange={event => setForm({
                      ...form,
                      duel: { ...form.duel, [key]: event.target.value },
                    })} />
                </Field>
              ))}
            </div>
          </div>

          <Field label="افزودن کدهای جدید برای همین کارت (اختیاری — هر خط یک کد)">
            <Textarea rows={4} dir="ltr" className="codeInput" value={form.newCodes}
              onChange={event => setForm({ ...form, newCodes: event.target.value })}
              placeholder={'GHP-A2B3-C4D5\nGHP-X7K9-M1N2\n…'} />
          </Field>
          {form.newCodes.trim() && (
            <Field label="برچسب دسته کدهای جدید">
              <Input value={form.newBatch}
                onChange={event => setForm({ ...form, newBatch: event.target.value })}
                placeholder="مثلاً: چاپ مجدد آذر" />
            </Field>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Button loading={saving} onClick={save}>ذخیره تغییرات</Button>
            <Button variant="secondary" disabled={saving} onClick={onClose}>انصراف</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
