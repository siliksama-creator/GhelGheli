import { useEffect, useState } from 'react';
import { Save, Trophy } from 'lucide-react';
import { fmtNumber } from '../lib/api.js';
import { Button, Card, Field, Input } from '../components/ui.jsx';
import { RankList } from '../components/rank-list.jsx';
import { useToast } from '../lib/toast.jsx';

export function LeaguePage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [winnerCount, setWinnerCount] = useState(10);
  const [prizes, setPrizes] = useState(Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, amount: 0 })));
  const [saving, setSaving] = useState(false);

  const load = () =>
    request('/api/admin/league').then((x) => {
      setData(x);
      const table = x.season?.prize_table;
      if (table?.length) setPrizes(table);
      setWinnerCount(x.winnerCount || table?.length || 10);
    });
  useEffect(load, [request]);

  function changeWinnerCount(n) {
    setWinnerCount(n);
    setPrizes((prev) => Array.from({ length: n }, (_, i) => prev[i] || { rank: i + 1, amount: 0 }));
  }

  async function save() {
    setSaving(true);
    try {
      await request('/api/admin/league/current/prizes', { method: 'PATCH', body: { prizeTable: prizes, winnerCount } });
      notify('جوایز لیگ ذخیره شد');
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-grid cols-2">
      <Card title="لیدربرد زنده" subtitle="به‌روزرسانی خودکار بر اساس امتیاز ماه جاری">
        {data ? <RankList entries={data.entries} /> : null}
      </Card>
      <Card title="تعداد برندگان و جدول جوایز" subtitle="مبلغ هر رتبه در پایان ماه به کاربر تعلق می‌گیرد">
        <Field label="تعداد برندگان">
          <Input type="number" value={winnerCount} onChange={(e) => changeWinnerCount(Number(e.target.value) || 0)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {prizes.map((p, i) => (
            <Field key={p.rank} label={`رتبه ${fmtNumber(p.rank)}`}>
              <Input
                type="number"
                value={p.amount}
                onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
              />
            </Field>
          ))}
        </div>
        <Button icon={Save} onClick={save} loading={saving} className="btn-block" style={{ marginTop: 8 }}>
          ذخیره جدول جوایز
        </Button>
      </Card>
    </div>
  );
}
