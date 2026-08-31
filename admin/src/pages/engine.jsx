import { useEffect, useState } from 'react';
import { SlidersHorizontal, Save, AlertTriangle } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * اهرم‌های موتور — تنظیماتِ فنی‌ای که قبلاً ثابتِ کد بودند.
 *
 * همه از `app_settings` خوانده می‌شوند و ذخیرهٔ همین‌جا بلافاصله روی
 * کلاینت‌ها اثر می‌گذارد؛ بدون ری‌استارت و بدون آپدیت اپ.
 */
export function EnginePage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [canned, setCanned] = useState('');

  const load = () => {
    request('/api/admin/settings/engine')
      .then((d) => {
        setData(d);
        setCanned((d.cannedMessages || []).join('\n'));
      })
      .catch((e) => notify(e.message || 'خواندن تنظیمات ناموفق بود', 'error'));
  };
  useEffect(load, [request]);

  async function save(path, body) {
    try {
      const r = await request(`/api/admin${path}`, { method: 'PATCH', body });
      notify(r.message || 'ذخیره شد', 'success');
      load();
    } catch (err) {
      notify(err.message || 'ذخیره ناموفق بود', 'error');
    }
  }

  if (!data) return <p>در حال خواندن…</p>;

  return (
    <div className="page-stack">
      <Card title="آستانه‌های موتور تشخیص کارت با عکس"
        subtitle="تعیین می‌کند عکس کارت خودکار تأیید شود، به صف بررسی برود یا رد شود"
        action={<span className="warn-chip"><AlertTriangle size={14} /> با احتیاط — روی پذیرش واقعی کاربران اثر می‌گذارد</span>}>
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          const f = e.target;
          save('/settings/photo-match', {
            acceptScore: Number(f.accept.value),
            reviewScore: Number(f.review.value),
            boundAcceptScore: Number(f.bound.value),
            freeAcceptScore: Number(f.free.value),
            duplicateSimilarity: Number(f.dup.value),
          });
        }}>
          <Field label="آستانهٔ پذیرش خودکار (بالای این = تأیید)"><Input name="accept" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.acceptScore} /></Field>
          <Field label="آستانهٔ صف بررسی"><Input name="review" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.reviewScore} /></Field>
          <Field label="آستانهٔ کد نام‌دار (عکس فقط اثباتِ داشتن کارت)"><Input name="bound" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.boundAcceptScore} /></Field>
          <Field label="آستانهٔ کد بی‌نام"><Input name="free" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.freeAcceptScore} /></Field>
          <Field label="آستانهٔ طرح تکراری"><Input name="dup" type="number" step="0.01" min="0" max="1" defaultValue={data.photoMatch.duplicateSimilarity} /></Field>
          <Button type="submit" icon={Save}>ذخیره آستانه‌ها</Button>
        </form>
      </Card>

      <Card title="منحنی سطح بازیکن" subtitle="XP لازم برای هر لول از این ضرایب ساخته می‌شود — نوار پیشرفت همه یک‌جا عوض می‌شود">
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          const f = e.target;
          save('/settings/levels', {
            base: Number(f.base.value), lin: Number(f.lin.value),
            exp: Number(f.exp.value), knee: Number(f.knee.value),
            tail: Number(f.tail.value),
          });
        }}>
          <Field label="پایه (XP لول‌های اول)"><Input name="base" type="number" step="0.1" defaultValue={data.levels.base} /></Field>
          <Field label="شیب خطی"><Input name="lin" type="number" step="0.1" defaultValue={data.levels.lin} /></Field>
          <Field label="توان نمایی (رشد اولیه)"><Input name="exp" type="number" step="0.05" defaultValue={data.levels.exp} /></Field>
          <Field label="زانو (از این لول رشد خطی می‌شود)"><Input name="knee" type="number" min="1" max="99" defaultValue={data.levels.knee} /></Field>
          <Field label="پلهٔ بعد از زانو"><Input name="tail" type="number" step="0.1" defaultValue={data.levels.tail} /></Field>
          <Button type="submit" icon={Save}>ذخیره منحنی</Button>
        </form>
      </Card>

      <Card title="چرخهٔ استریک ورود" subtitle="جایزهٔ هر روز پشت‌سرهم؛ طول چرخه = تعداد اعداد (۲ تا ۳۰)">
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          const f = e.target;
          const rewards = f.rewards.value.split(/[،,\s]+/).map(Number).filter((n) => Number.isFinite(n));
          if (rewards.length < 2 || rewards.length > 30) {
            notify('چرخه باید بین ۲ تا ۳۰ عدد باشد', 'error');
            return;
          }
          save('/settings/streak', { rewards });
        }}>
          <Field label="جوایز (با فاصله یا ویرگول)"><Input name="rewards" defaultValue={data.streak.rewards.join('، ')} /></Field>
          <Button type="submit" icon={Save}>ذخیره چرخه</Button>
        </form>
      </Card>

      <Card title="پیام‌های آمادهٔ چت" subtitle="هر خط یک پیام؛ کاربران همین‌ها را در روم چت می‌بینند (حداکثر ۶۰ پیام)">
        <Field label="پیام‌ها">
          <Textarea rows={14} value={canned} onChange={(e) => setCanned(e.target.value)} />
        </Field>
        <Button icon={Save} onClick={() => {
          const messages = canned.split('\n').map((x) => x.trim()).filter(Boolean);
          if (!messages.length) return notify('حداقل یک پیام لازم است', 'error');
          save('/chat/canned', { messages });
        }}>ذخیره پیام‌ها</Button>
      </Card>
    </div>
  );
}
