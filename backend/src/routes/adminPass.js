/**
 * مدیریت گذر نبرد — پنل ادمین (وب و اندروید).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل تا امروز وجود نداشت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * فصلِ گذر نبرد و ۱۰۰ ردیفِ پاداشش فقط با مایگریشن SQL ساخته می‌شدند.
 * یعنی هر فصلِ جدید = کامیت + دیپلوی. از این پس ادمین می‌تواند:
 *
 *   - فصل بسازد (با کپیِ پاداش‌ها از فصل قبلی یا یک فصلِ الگو)،
 *   - تاریخ/نام/فعال بودنِ فصل را ویرایش کند،
 *   - پاداشِ تک‌تکِ پله‌ها (مسیر رایگان و پلاس) را عوض کند،
 *   - منحنی XP، سقف روزانه، مهلت دریافت و XP منابع را تنظیم کند.
 *
 * تعداد پله (۵۰) ثابت می‌ماند چون منطقِ منحنی و کلاینت‌ها روی آن
 * کالیبره شده‌اند؛ چیزی که فصل‌به‌فصل عوض می‌شود «پاداش هر پله» است.
 */
const express = require('express');

const TIER_KINDS = ['points', 'spins', 'cash', 'shop_item'];
const TRACKS = ['free', 'plus'];

module.exports = function createAdminPassRoutes(deps) {
  const {
    pool, adminAuth, requireRole, asyncHandler, audit, validateUuid, pass, opsConfig,
  } = deps;
  const router = express.Router();

  const num = (x, fallback, min, max) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const str = (x, fallback, max = 200) => {
    const s = String(x ?? '').trim();
    return s ? s.slice(0, max) : fallback;
  };
  const iso = (x, fallback) => {
    const d = new Date(x);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  };

  // ── نمای کلی ───────────────────────────────────────────────────────────
  router.get('/admin/pass', adminAuth, asyncHandler(async (req, res) => {
    const [seasons, config, active] = await Promise.all([
      pool.query(
        `SELECT s.*, count(t.id)::int AS tier_rows
           FROM pass_seasons s LEFT JOIN pass_tiers t ON t.season_id = s.id
          GROUP BY s.id ORDER BY s.created_at DESC`),
      pass.getPassConfig(),
      pass.activeSeason ? pass.activeSeason() : Promise.resolve(null),
    ]);
    res.json({ seasons: seasons.rows, config, activeSeasonId: active?.id || null });
  }));

  // ── جزئیات یک فصل (تایرها) ─────────────────────────────────────────────
  router.get('/admin/pass/seasons/:id', adminAuth, validateUuid('id'),
    asyncHandler(async (req, res) => {
      const { rows: seasons } = await pool.query(
        'SELECT * FROM pass_seasons WHERE id=$1', [req.params.id]);
      if (!seasons[0]) return res.status(404).json({ message: 'فصل پیدا نشد' });
      const { rows: tiers } = await pool.query(
        `SELECT * FROM pass_tiers WHERE season_id=$1 ORDER BY tier, track`, [req.params.id]);
      const grouped = [];
      for (const tier of tiers) {
        let row = grouped.find((g) => g.tier === tier.tier);
        if (!row) { row = { tier: tier.tier, free: null, plus: null }; grouped.push(row); }
        row[tier.track] = {
          id: tier.id, kind: tier.kind, amount: Number(tier.amount),
          payload: tier.payload, label: tier.label,
        };
      }
      res.json({ season: seasons[0], tiers: grouped });
    }));

  // ── ساخت فصل (کپی پاداش‌ها از فصل الگو) ─────────────────────────────────
  router.post('/admin/pass/seasons', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const name = str(b.name, '');
      const startsAt = iso(b.startsAt, null);
      const endsAt = iso(b.endsAt, null);
      if (!name) return res.status(400).json({ message: 'نام فصل الزامی است' });
      if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
        return res.status(400).json({ message: 'بازهٔ زمانی فصل معتبر نیست' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // فقط یک فصل فعال مجاز است (ایندکس یکتا). فصلِ تازه جایگزین می‌شود.
        await client.query('UPDATE pass_seasons SET is_active=false WHERE is_active=true');
        const { rows: created } = await client.query(
          `INSERT INTO pass_seasons(name, starts_at, ends_at, is_active)
           VALUES($1,$2,$3,true) RETURNING *`,
          [name, startsAt, endsAt]);

        // الگو: فصلِ خواسته‌شده، وگرنه آخرین فصلِ موجود، وگرنه خالی.
        const templateId = b.templateSeasonId || null;
        const { rows: templateTiers } = await client.query(
          `SELECT tier, track, kind, amount, payload, label
             FROM pass_tiers
            WHERE season_id = COALESCE($1::uuid,
                    (SELECT id FROM pass_seasons WHERE id <> $2 ORDER BY created_at DESC LIMIT 1))
            ORDER BY tier, track`,
          [templateId, created[0].id]);
        let copied = 0;
        for (const t of templateTiers) {
          await client.query(
            `INSERT INTO pass_tiers(season_id, tier, track, kind, amount, payload, label)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [created[0].id, t.tier, t.track, t.kind, t.amount, t.payload, t.label]);
          copied++;
        }
        await client.query('COMMIT');
        await audit(req.admin.id, 'create_pass_season', 'pass_seasons', created[0].id,
          b.reason || null,
          { name, startsAt, endsAt, templateSeasonId: templateId, copiedTiers: copied });
        res.json({
          message: `فصل «${name}» ساخته شد و فعال است${copied ? ` (${copied} پاداش از فصل الگو کپی شد)` : ' — پاداش پله‌ها را از صفحهٔ فصل تعریف کنید'}`,
          season: created[0], copiedTiers: copied,
        });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }));

  // ── ویرایش فصل (نام/بازه/فعال) ─────────────────────────────────────────
  router.patch('/admin/pass/seasons/:id', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const { rows: curRows } = await pool.query(
        'SELECT * FROM pass_seasons WHERE id=$1', [req.params.id]);
      const cur = curRows[0];
      if (!cur) return res.status(404).json({ message: 'فصل پیدا نشد' });

      const name = b.name !== undefined ? str(b.name, cur.name, 120) : cur.name;
      const startsAt = b.startsAt !== undefined ? iso(b.startsAt, cur.starts_at.toISOString()) : cur.starts_at;
      const endsAt = b.endsAt !== undefined ? iso(b.endsAt, cur.ends_at.toISOString()) : cur.ends_at;
      if (new Date(endsAt) <= new Date(startsAt)) {
        return res.status(400).json({ message: 'پایان فصل باید بعد از شروعش باشد' });
      }
      const active = b.isActive !== undefined ? Boolean(b.isActive) : cur.is_active;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (active && !cur.is_active) {
          await client.query('UPDATE pass_seasons SET is_active=false WHERE is_active=true');
        }
        const { rows } = await client.query(
          `UPDATE pass_seasons SET name=$2, starts_at=$3, ends_at=$4, is_active=$5
            WHERE id=$1 RETURNING *`,
          [req.params.id, name, startsAt, endsAt, active]);
        await client.query('COMMIT');
        await audit(req.admin.id, 'update_pass_season', 'pass_seasons', req.params.id,
          b.reason || null, { name, startsAt, endsAt, isActive: active });
        res.json({ message: 'فصل ذخیره شد', season: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }));

  // ── ویرایش/ساخت پاداش یک پله ───────────────────────────────────────────
  router.patch('/admin/pass/tiers/:id', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const { rows: curRows } = await pool.query(
        'SELECT * FROM pass_tiers WHERE id=$1', [req.params.id]);
      const cur = curRows[0];
      if (!cur) return res.status(404).json({ message: 'پاداش پله پیدا نشد' });

      const kind = b.kind !== undefined ? str(b.kind, cur.kind, 16) : cur.kind;
      if (!TIER_KINDS.includes(kind)) {
        return res.status(400).json({ message: `نوع پاداش باید یکی از ${TIER_KINDS.join('/')} باشد` });
      }
      const amount = b.amount !== undefined ? Math.round(num(b.amount, Number(cur.amount), 0, 1e12)) : Number(cur.amount);
      const label = b.label !== undefined ? str(b.label, cur.label, 120) : cur.label;
      const payload = b.payload !== undefined ? str(b.payload, null, 64) : cur.payload;

      const { rows } = await pool.query(
        `UPDATE pass_tiers SET kind=$2, amount=$3, label=$4, payload=$5
          WHERE id=$1 RETURNING *`,
        [req.params.id, kind, amount, label, payload]);
      await audit(req.admin.id, 'update_pass_tier', 'pass_tiers', req.params.id,
        b.reason || null, { kind, amount, label });
      res.json({ message: `پاداش پلهٔ ${cur.tier} (${cur.track === 'plus' ? 'مسیر پلاس' : 'مسیر رایگان'}) ذخیره شد`, tier: rows[0] });
    }));

  // ── افزودن پاداش به پله‌ای که ردیف ندارد ───────────────────────────────
  router.post('/admin/pass/tiers', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const seasonId = str(b.seasonId, '');
      const tier = Math.round(num(b.tier, 0, 1, 50));
      const track = str(b.track, '');
      const kind = str(b.kind, 'points');
      if (!TRACKS.includes(track)) return res.status(400).json({ message: 'مسیر باید free یا plus باشد' });
      if (!TIER_KINDS.includes(kind)) return res.status(400).json({ message: 'نوع پاداش معتبر نیست' });
      if (tier < 1 || tier > 50) return res.status(400).json({ message: 'شمارهٔ پله باید بین ۱ تا ۵۰ باشد' });
      const { rows: seasonRows } = await pool.query(
        'SELECT id FROM pass_seasons WHERE id=$1', [seasonId]);
      if (!seasonRows[0]) return res.status(404).json({ message: 'فصل پیدا نشد' });

      const { rows } = await pool.query(
        `INSERT INTO pass_tiers(season_id, tier, track, kind, amount, payload, label)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (season_id, tier, track) DO UPDATE
           SET kind=EXCLUDED.kind, amount=EXCLUDED.amount,
               payload=EXCLUDED.payload, label=EXCLUDED.label
         RETURNING *`,
        [seasonId, tier, track, kind,
          Math.round(num(b.amount, 0, 0, 1e12)),
          str(b.payload, null, 64),
          str(b.label, `پلهٔ ${tier}`, 120)]);
      await audit(req.admin.id, 'upsert_pass_tier', 'pass_tiers', rows[0].id,
        b.reason || null, { seasonId, tier, track, kind });
      res.json({ message: 'پاداش پله ثبت شد', tier: rows[0] });
    }));

  // ── مقیاس‌دهی دسته‌ای امتیازات پله‌ها (نوار ادمین) ─────────────────────
  //
  // خواستهٔ مالک: «با یک نوار، تمام امتیازات گذر نبرد را به‌صورت
  // درجه‌بندی اضافه کن» — بدون ویرایش تک‌تک پله‌ها.
  //
  // فقط kind=points لمس می‌شود (اسپین/نقدی/آیتم دست‌نخورده می‌ماند).
  // amount جدید = round(amount * factor) با کف ۰.
  // track: 'both' | 'free' | 'plus'
  router.post('/admin/pass/seasons/:id/scale-points', adminAuth, validateUuid('id'), requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const factor = Number(b.factor);
      if (!Number.isFinite(factor) || factor < 0 || factor > 20) {
        return res.status(400).json({ message: 'ضریب باید عددی بین ۰ و ۲۰ باشد' });
      }
      const track = str(b.track, 'both');
      if (!['both', 'free', 'plus'].includes(track)) {
        return res.status(400).json({ message: 'مسیر نامعتبر است' });
      }
      const { rows: seasonRows } = await pool.query(
        'SELECT id, name FROM pass_seasons WHERE id=$1', [req.params.id]);
      if (!seasonRows[0]) return res.status(404).json({ message: 'فصل پیدا نشد' });

      const params = [req.params.id];
      let trackSql = '';
      if (track !== 'both') {
        params.push(track);
        trackSql = ` AND track = $2`;
      }
      const { rows: before } = await pool.query(
        `SELECT id, tier, track, amount FROM pass_tiers
          WHERE season_id=$1 AND kind='points'${trackSql}
          ORDER BY tier, track`,
        params);

      if (before.length === 0) {
        return res.json({ message: 'هیچ پلهٔ امتیازی برای مقیاس‌دهی نبود', updated: 0, factor });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let updated = 0;
        for (const row of before) {
          const next = Math.max(0, Math.round(Number(row.amount) * factor));
          if (next === Number(row.amount)) continue;
          await client.query(
            'UPDATE pass_tiers SET amount=$2 WHERE id=$1',
            [row.id, next]);
          updated += 1;
        }
        await client.query('COMMIT');
        await audit(req.admin.id, 'scale_pass_points', 'pass_seasons', req.params.id,
          b.reason || null, { factor, track, updated, total: before.length });
        res.json({
          message: `امتیاز ${updated} پله با ضریب ${factor} به‌روز شد`,
          updated,
          total: before.length,
          factor,
          track,
        });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally {
        client.release();
      }
    }));

  // ── پیکربندی منحنی/سقف/منابع ───────────────────────────────────────────
  router.patch('/admin/pass/config', adminAuth, requireRole(),
    asyncHandler(async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const cur = await pass.getPassConfig();
      const sources = {};
      if (b.sources && typeof b.sources === 'object') {
        for (const [key, def] of Object.entries(cur.sources)) {
          const d = b.sources[key] && typeof b.sources[key] === 'object' ? b.sources[key] : {};
          sources[key] = {
            xp: Math.round(num(d.xp, def.xp, 0, 100000)),
            dailyCap: Math.round(num(d.dailyCap, def.dailyCap, 0, 1000000)),
            label: str(d.label, def.label, 60),
          };
        }
      }
      const next = {
        xpBase: Math.round(num(b.xpBase, cur.xpBase, 1, 10000)),
        xpStep: Math.round(num(b.xpStep, cur.xpStep, 0, 10000)),
        maxTiersPerDay: Math.round(num(b.maxTiersPerDay, cur.maxTiersPerDay, 1, 50)),
        claimGraceDays: Math.round(num(b.claimGraceDays, cur.claimGraceDays, 0, 90)),
        sources: Object.keys(sources).length ? sources : cur.sources,
      };
      await opsConfig.set('pass_config', next, req.admin.id);
      await audit(req.admin.id, 'update_pass_config', 'app_settings', null,
        b.reason || null, next);
      res.json({ message: 'پیکربندی گذر نبرد ذخیره شد — از همین لحظه اعمال می‌شود', config: next });
    }));

  return router;
};
