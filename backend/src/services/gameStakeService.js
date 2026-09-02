const { pool } = require('../config/db');
const { faAmount } = require('../lib/faNum');
const pointService = require('./pointService');
const coinService = require('./coinService');
const {
  coinRewardFor, hasCoinReward, quotaTracked, tehranDate,
} = require('./coinService');

// پیش‌فرض تاریخی — فقط fallback وقتی ops_limits هنوز بار نشده.
const DEFAULT_PUBLIC_STAKES = Object.freeze([0, 100, 1000]);
const DEFAULT_LOBBY_STAKES = Object.freeze([0, 100, 1000, 5000]);

// سازگاری با importهای قدیمی که PUBLIC_STAKES/LOBBY_STAKES را مستقیم
// می‌خوانند: Proxy تا همیشه فهرستِ زنده‌ی ops_limits را بدهد.
function livePublicStakes() {
  try {
    const ops = require('./opsLimits').get();
    const list = ops?.publicStakes;
    if (Array.isArray(list) && list.length) return list;
  } catch { /* */ }
  return DEFAULT_PUBLIC_STAKES;
}
function liveLobbyStakes() {
  try {
    const ops = require('./opsLimits').get();
    const list = ops?.lobbyStakes;
    if (Array.isArray(list) && list.length) return list;
  } catch { /* */ }
  return DEFAULT_LOBBY_STAKES;
}

const PUBLIC_STAKES = new Proxy([], {
  get(_t, prop) {
    const live = livePublicStakes();
    if (prop === Symbol.iterator) return live[Symbol.iterator].bind(live);
    if (prop === 'length') return live.length;
    if (prop === 'includes') return (...a) => live.includes(...a);
    if (prop === 'map') return (...a) => live.map(...a);
    if (prop === 'filter') return (...a) => live.filter(...a);
    if (prop === 'slice') return (...a) => live.slice(...a);
    if (prop === 'indexOf') return (...a) => live.indexOf(...a);
    if (typeof prop === 'string' && /^\d+$/.test(prop)) return live[Number(prop)];
    if (prop === 'toJSON' || prop === Symbol.toStringTag) return undefined;
    const v = live[prop];
    return typeof v === 'function' ? v.bind(live) : v;
  },
});
const LOBBY_STAKES = new Proxy([], {
  get(_t, prop) {
    const live = liveLobbyStakes();
    if (prop === Symbol.iterator) return live[Symbol.iterator].bind(live);
    if (prop === 'length') return live.length;
    if (prop === 'includes') return (...a) => live.includes(...a);
    if (prop === 'map') return (...a) => live.map(...a);
    if (prop === 'filter') return (...a) => live.filter(...a);
    if (prop === 'slice') return (...a) => live.slice(...a);
    if (prop === 'indexOf') return (...a) => live.indexOf(...a);
    if (typeof prop === 'string' && /^\d+$/.test(prop)) return live[Number(prop)];
    const v = live[prop];
    return typeof v === 'function' ? v.bind(live) : v;
  },
});

class StakeError extends Error {
  constructor(message, code = 'STAKE_ERROR') {
    super(message);
    this.name = 'StakeError';
    this.code = code;
    this.status = 400;
  }
}

function parseStake(raw, allowed) {
  const value = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
  const list = Array.isArray(allowed) ? allowed : [...allowed];
  if (!Number.isSafeInteger(value) || !list.includes(value)) {
    throw new StakeError('مقدار امتیاز مسابقه معتبر نیست', 'INVALID_STAKE');
  }
  return value;
}

const parsePublicStake = raw => parseStake(raw, livePublicStakes());
const parseLobbyStake = raw => parseStake(raw, liveLobbyStakes());

function createGameStakeService(db = pool, points = pointService, coins = coinService) {
  async function canAfford(userId, stake) {
    if (stake === 0) return { ok: true, balance: null };
    const { rows } = await db.query(
      'SELECT current_points, status FROM users WHERE id=$1', [userId]);
    const user = rows[0];
    if (!user || user.status !== 'active') {
      throw new StakeError('حساب کاربری برای مسابقه در دسترس نیست', 'USER_UNAVAILABLE');
    }
    const balance = Number(user.current_points || 0);
    return { ok: balance >= stake, balance };
  }

  /**
   * ورودی هر دو بازیکن را پیش از game:start در یک تراکنش رزرو می‌کند.
   * قفل‌ها بر اساس UUID مرتب می‌شوند تا دو بازی هم‌زمان با بازیکنان مشترک
   * deadlock نسازند. بعد از این تابع، ساخت اتاق امن است؛ قبلش نه.
   */
  async function reserveMatch({
    matchId, gameId, stake, playerXId, playerOId, matchMode = null,
  }) {
    if (!matchId || !playerXId || !playerOId || playerXId === playerOId) {
      throw new StakeError('بازیکنان مسابقه معتبر نیستند', 'INVALID_PLAYERS');
    }
    if (!liveLobbyStakes().includes(stake) || stake === 0) {
      throw new StakeError('ورودی مسابقه امتیازی معتبر نیست', 'INVALID_STAKE');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const ids = [playerXId, playerOId].sort();
      const { rows } = await client.query(
        `SELECT id, current_points, status
           FROM users
          WHERE id = ANY($1::uuid[])
          ORDER BY id
          FOR UPDATE`, [ids]);
      if (rows.length !== 2 || rows.some(u => u.status !== 'active')) {
        throw new StakeError('یکی از بازیکنان در دسترس نیست', 'USER_UNAVAILABLE');
      }
      const byId = new Map(rows.map(r => [r.id, Number(r.current_points || 0)]));
      const low = rows.find(r => Number(r.current_points || 0) < stake);
      if (low) {
        throw new StakeError('برای ورود به این مسابقه امتیاز کافی نداری', 'INSUFFICIENT_POINTS');
      }

      const grossPot = stake * 2;
      const commission = Math.ceil(grossPot * 0.10);
      const netPot = grossPot - commission;

      // ── سهمیهٔ سکه ──
      //
      // سهمیه در **شروع** مصرف می‌شود، نه در برد. دلیلِ کامل در
      // coinService.consumeQuota آمده؛ خلاصه‌اش: هر مسابقه از سهمیهٔ هر دو
      // طرف خرج می‌کند، پس دو حسابِ هماهنگ نمی‌توانند نوبتی ببرند و هر دو
      // سقف را پر کنند.
      //
      // ⚠️ نداشتنِ سهمیه **مسابقه را متوقف نمی‌کند**. این تصمیمِ محصولی
      //    مهمی است: کاربری که سقفش پر شده باید همچنان بتواند بازی کند و
      //    امتیاز ببرد، فقط سکه نمی‌گیرد. اگر بازی را می‌بستیم، سقفِ سکه
      //    عملاً تبدیل به سقفِ بازی می‌شد — یعنی محبوب‌ترین کاربران بعد از
      //    ۳۰ بازی از اپ بیرون انداخته می‌شدند.
      //
      // ⚠️ ترتیبِ `ids` (مرتب‌شده) رعایت می‌شود تا با ترتیبِ قفلِ بالا یکی
      //    باشد و دو مسابقهٔ هم‌زمانِ دارای بازیکنِ مشترک deadlock نسازند.
      // ── 🔴 لابیِ خصوصی سکه نمی‌دهد ──────────────────────────────────
      //
      // این شرط رفعِ یک باگِ واقعی است، نه احتیاط.
      //
      // `matchMode` در `engine.js` ساخته می‌شد ('lobby' یا 'online') ولی
      // هرگز به این تابع نمی‌رسید. نتیجه: مسابقهٔ لابیِ خصوصیِ ۱۰۰ یا
      // ۱۰۰۰ امتیازی سکهٔ کاملِ لیگ می‌داد. دو نفر دوست می‌توانستند لابیِ
      // رمزدار بسازند، نوبتی ببرند و بی‌آنکه با کسی رقابت کنند سهمیهٔ
      // روزانه‌شان را پر کنند — یعنی جدولِ لیگ (و جایزهٔ نقدیِ ۵۰ نفر)
      // با مسابقه‌های تشریفاتی تعیین می‌شد.
      //
      // شرطِ ۵۰۰۰ این را نمی‌پوشاند: ۵۰۰۰ چون در `DAILY_QUOTA` نیست
      // اتفاقی امن بود، ولی ۱۰۰ و ۱۰۰۰ در لابی کاملاً باز بودند.
      //
      // امتیاز و پات همچنان عادی جابه‌جا می‌شوند — لابی برای بازی با
      // دوستان است و باید کار کند. فقط **سکه** که ارزِ رتبه‌بندیِ لیگ
      // است، از مسابقهٔ غیرعمومی ساخته نمی‌شود.
      const coinEligibleMode = matchMode !== 'lobby';
      const coinReward = coinEligibleMode
        ? coinRewardFor(gameId, stake)
        : { win: 0, draw: 0, loss: 0 };
      const quotaDate = (coinEligibleMode && quotaTracked(stake))
        ? tehranDate() : null;
      const quotaByUser = new Map();
      if (coinEligibleMode && hasCoinReward(gameId, stake) && quotaDate) {
        for (const userId of ids) {
          quotaByUser.set(
            userId, await coins.consumeQuota(client, userId, stake));
        }
      }

      await client.query(
        `INSERT INTO game_stake_matches
           (id, game_id, player_x_id, player_o_id, stake_points,
            gross_pot, commission_points, net_pot, status,
            coin_reward, coin_reward_win, coin_reward_draw, coin_reward_loss,
            coin_quota_x, coin_quota_o, coin_quota_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'reserved',$9,$10,$11,$12,$13,$14,$15)`,
        [matchId, gameId, playerXId, playerOId, stake, grossPot, commission, netPot,
          // ستونِ قدیمی معنایش «سکهٔ برنده» است و همان می‌ماند.
          coinReward.win,
          coinReward.win, coinReward.draw, coinReward.loss,
          quotaByUser.get(playerXId) === true,
          quotaByUser.get(playerOId) === true,
          quotaDate]);

      // چون ردیف‌های users همین بالا FOR UPDATE شده‌اند، هر debit باید دقیقاً
      // کل stake را کم کند. کسر جزئی اینجا خطاست و کل transaction برمی‌گردد.
      for (const userId of ids) {
        const d = await points.debit(client, {
          userId,
          points: stake,
          source: 'game',
          referenceType: 'game_stake_entry',
          referenceId: matchId,
          description: `ورودی مسابقه ${faAmount(stake)} امتیازی`,
          league: false,
        });
        if (!d || d.delta !== -stake) {
          throw new StakeError('رزرو امتیاز مسابقه کامل نشد', 'RESERVE_FAILED');
        }
        byId.set(userId, d.balanceAfter);
      }

      await client.query('COMMIT');
      return {
        matchId, stake, grossPot, commission, netPot,
        balances: Object.fromEntries(byId),
        // کلاینت باید بداند این مسابقه اصلاً سکه دارد یا نه، تا نشانِ سکه
        // را فقط وقتی نشان دهد که واقعاً چیزی در میان است.
        coinReward,
        coinEligible: {
          [playerXId]: quotaByUser.get(playerXId) === true,
          [playerOId]: quotaByUser.get(playerOId) === true,
        },
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** تسویهٔ برد یا تساوی؛ قفل ردیف match آن را idempotent می‌کند. */
  async function settleMatch({ matchId, winnerUserId = null, draw = false }) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM game_stake_matches WHERE id=$1 FOR UPDATE', [matchId]);
      const match = rows[0];
      if (!match) throw new StakeError('سند مسابقه پیدا نشد', 'MATCH_NOT_FOUND');
      if (match.status !== 'reserved') {
        await client.query('COMMIT');
        return { duplicate: true, status: match.status, outcome: match.outcome };
      }

      const stake = Number(match.stake_points);
      const netPot = Number(match.net_pot);
      const players = [match.player_x_id, match.player_o_id].sort();
      let outcome;
      let winnerBalanceAfter = null;
      let coinsAwarded = 0;
      // سکهٔ بازنده جدا نگه داشته می‌شود تا engine بتواند به هر سوکت عددِ
      // خودش را بفرستد. در تساوی بی‌معناست و صفر می‌ماند.
      let loserCoins = 0;

      // ── پرداختِ سکه به هر دو طرف ────────────────────────────────────
      //
      // اعداد از **سندِ رزرو** خوانده می‌شوند نه از جدولِ زندهٔ سکه؛ دلیلش
      // در مایگریشن ۰۷۲ آمده (قراردادِ لحظهٔ ورود نباید وسطِ بازی عوض شود).
      //
      // `eligibleOf` همان قاعدهٔ قبلی است: سکه فقط به کسی می‌رسد که موقعِ
      // شروع سهمیهٔ روزانه‌اش سوخته. اگر سقفِ کاربر پر بوده، بازی کرده و
      // امتیازش را برده ولی سکه نمی‌گیرد — چه ببرد چه ببازد.
      const rewardOf = {
        win:  Number(match.coin_reward_win  ?? match.coin_reward ?? 0),
        draw: Number(match.coin_reward_draw ?? 0),
        loss: Number(match.coin_reward_loss ?? 0),
      };
      const eligibleOf = userId => (userId === match.player_x_id
        ? match.coin_quota_x === true
        : match.coin_quota_o === true);
      /** سکه می‌دهد اگر سهمیه‌اش سوخته و مبلغ مثبت است. */
      const coinsByUser = {};
      const payCoins = async (userId, amount) => {
        // ⚠️ صفر هم ثبت می‌شود، نه فقط پرداختِ موفق. موتور با «آیا کلید
        //    وجود دارد؟» تصمیم می‌گیرد به عددِ جدول برگردد یا نه؛ اگر
        //    کاربرِ سقف‌پر اینجا کلید نگیرد، کلاینتش عددی را نشان می‌دهد
        //    که هرگز واریز نشده.
        if (!(amount > 0) || !eligibleOf(userId)) {
          coinsByUser[userId] = coinsByUser[userId] || 0;
          return 0;
        }
        const paid = await coins.awardCoins(client, userId, amount);
        // آنچه **واقعاً** پرداخت شد، کلیدخورده به کاربر. عددِ جدول کافی
        // نیست: اگر سهمیهٔ کاربر پر باشد یا لیگِ فعالی نباشد، پرداخت صفر
        // می‌شود و کلاینت نباید عددی ببیند که به موجودی‌اش اضافه نشده.
        coinsByUser[userId] = (coinsByUser[userId] || 0) + Number(paid || 0);
        return paid;
      };

      if (draw) {
        for (const userId of players) {
          await points.credit(client, {
            userId,
            points: stake,
            source: 'game',
            referenceType: 'game_stake_draw_refund',
            referenceId: matchId,
            description: `بازگشت ورودی مسابقه مساوی (${faAmount(stake)} امتیاز)`,
            league: false,
            lifetimeGain: 0,
          });
        }
        outcome = 'draw';

        // ── سکهٔ تساوی: به هر دو ──
        //
        // پیش از دورِ ۲۶ تساوی هیچ سکه‌ای نداشت. یعنی دو بازیکن یک مسابقهٔ
        // کاملِ نزدیک انجام می‌دادند، سهمیهٔ هر دو می‌سوخت و هیچ‌کدام چیزی
        // نمی‌گرفت — بدترین حالتِ ممکن از دیدِ بازیکن، چون تساوی نتیجهٔ
        // یک بازیِ برابر است نه شکست.
        //
        // ⚠️ عمداً در `coinsAwarded` جمع نمی‌شود. آن فیلد قراردادش «سکهٔ
        //    برنده» است و در تساوی برنده‌ای وجود ندارد؛ جمع‌کردنِ سکهٔ دو
        //    نفر در آن باعث می‌شد هر بازیکن رویِ صفحهٔ نتیجه، دو برابرِ
        //    چیزی که گرفته ببیند. مقدارِ تساوی در `drawCoins` می‌رود.
        for (const userId of players) {
          await payCoins(userId, rewardOf.draw);
        }
        // ⚠️ سهمیه در تساوی **برنمی‌گردد** و این انتخاب است، نه فراموشی.
        //    سهمیه هزینهٔ «شرکت کردن» است و مسابقه واقعاً انجام شده. اگر
        //    برمی‌گشت، دو حسابِ هماهنگ می‌توانستند بی‌نهایت بار عمداً
        //    مساوی کنند تا فقط ردیف‌های دفتر را شلوغ کنند، بی‌آنکه چیزی
        //    خرج شود. حالا که تساوی سکه **می‌دهد**، این هزینه از همیشه
        //    مهم‌تر است: بدونِ آن، تبانیِ تساوی یک چاهِ بی‌انتهای سکه بود.
      } else {
        if (![match.player_x_id, match.player_o_id].includes(winnerUserId)) {
          throw new StakeError('برنده مسابقه معتبر نیست', 'INVALID_WINNER');
        }
        // lifetime فقط سود واقعی را می‌گیرد؛ برگشت اصل stake «کسب تازه» نیست.
        const payout = await points.credit(client, {
          userId: winnerUserId,
          points: netPot,
          source: 'game',
          referenceType: 'game_stake_payout',
          referenceId: matchId,
          description: `برد پات مسابقه ${faAmount(stake)} امتیازی`,
          league: false,
          lifetimeGain: Math.max(0, netPot - stake),
        });
        winnerBalanceAfter = Number(payout?.balanceAfter ?? 0);
        outcome = 'winner';

        // ── سکهٔ برنده ──
        //
        // فقط اگر سهمیهٔ **خودِ برنده** موقعِ شروع سوخته باشد. اگر سقفش پر
        // بود، مسابقه انجام شد و امتیازش را برد، ولی سکه نمی‌گیرد.
        //
        // ⚠️ سهمیهٔ بازنده برنمی‌گردد و این عمدی است. سهمیه هزینهٔ
        //    «شرکت کردن» است نه «بردن»؛ اگر فقط از برنده کم می‌شد، یک
        //    حسابِ فدایی می‌توانست بی‌نهایت بار ببازد و سهمیهٔ شریکش هرگز
        //    تمام نشود.
        // ── سکهٔ بازنده ──
        //
        // بازنده هم سکه می‌گیرد (۱ در سطحِ ۱۰۰، ۳ در سطحِ ۱۰۰۰). خواستهٔ
        // مالک بود که «پرداخت به هر دو طرف باشد نه فقط برنده»، و دلیلِ
        // فنی‌اش هم روشن است: چون سهمیه در شروع خرج می‌شود، پاداشِ صفر
        // برای باخت یعنی رها کردنِ بازیِ در حالِ باخت هیچ هزینه‌ای ندارد.
        //
        // ⚠️ `coinsAwarded` عمداً فقط سکهٔ **برنده** را برمی‌گرداند، نه
        //    جمعِ دو نفر. این عدد به کلاینت می‌رود تا «+۱۰ سکه» را روی
        //    صفحهٔ نتیجه نشان دهد؛ اگر جمع بود، برنده عددی می‌دید که
        //    نگرفته. سکهٔ بازنده جدا در `loserCoins` برمی‌گردد و engine
        //    آن را به سوکتِ بازنده می‌فرستد.
        const loserUserId = winnerUserId === match.player_x_id
          ? match.player_o_id
          : match.player_x_id;

        coinsAwarded = await payCoins(winnerUserId, rewardOf.win);
        loserCoins = await payCoins(loserUserId, rewardOf.loss);
      }

      await client.query(
        `UPDATE game_stake_matches
            SET status='settled', outcome=$2, winner_user_id=$3, settled_at=NOW()
          WHERE id=$1 AND status='reserved'`,
        [matchId, outcome, draw ? null : winnerUserId]);
      await client.query('COMMIT');
      return {
        duplicate: false,
        status: 'settled',
        outcome,
        stake,
        netPot,
        commission: Number(match.commission_points),
        winnerUserId: draw ? null : winnerUserId,
        winnerBalanceAfter: draw ? null : winnerBalanceAfter,
        coinsAwarded,
        loserCoins,
        // در تساوی هر دو یک مقدار گرفته‌اند؛ engine برای نمایش لازمش دارد.
        drawCoins: draw ? Number(match.coin_reward_draw ?? 0) : 0,
        // سکهٔ واقعاً پرداخت‌شده به هر کاربر. engine باید این را ترجیح
        // بدهد: بازیکنی که سهمیه‌اش پر بوده اینجا صفر دارد، در حالی که
        // `drawCoins`/`coinsAwarded` عددِ جدول را نشان می‌دهند.
        coinsByUser,
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function refundMatch(matchId, referenceType = 'game_stake_stale_refund') {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM game_stake_matches WHERE id=$1 FOR UPDATE', [matchId]);
      const match = rows[0];
      if (!match || match.status !== 'reserved') {
        await client.query('COMMIT');
        return { refunded: false, status: match?.status || 'missing' };
      }
      const stake = Number(match.stake_points);
      for (const userId of [match.player_x_id, match.player_o_id].sort()) {
        await points.credit(client, {
          userId,
          points: stake,
          source: 'game',
          referenceType,
          referenceId: matchId,
          description: 'بازگشت خودکار ورودی مسابقه ناتمام',
          league: false,
          lifetimeGain: 0,
        });
      }
      // ── برگشتِ سهمیهٔ سکه ──
      //
      // مسابقه هرگز نتیجه نداد، پس سهمیه‌ای که موقعِ شروع سوخت باید
      // برگردد — وگرنه یک قطعیِ شبکه یا کرشِ سرور، سهمیهٔ کاربر را
      // می‌بلعد بی‌آنکه او حتی یک بازیِ کامل کرده باشد.
      //
      // ⚠️ فقط برای کسی که واقعاً سهمیه‌اش سوخته بود. اگر آن موقع سقفش
      //    پر بود، `coin_quota_*` برایش false است و برگشتی در کار نیست؛
      //    وگرنه به کاربرِ سقف‌پر یک سهمیهٔ رایگان هدیه می‌دادیم.
      //
      // ⚠️ تاریخِ ذخیره‌شده استفاده می‌شود، نه تاریخِ امروز. مسابقهٔ ناتمام
      //    تا ۶۰ دقیقه بعد refund می‌شود و ۶۰ دقیقه به‌راحتی از نیمه‌شبِ
      //    تهران رد می‌شود؛ با تاریخِ امروز، سهمیهٔ دیروز سوخته می‌ماند و
      //    به امروز یکی هدیه می‌شد.
      const quotaDate = match.coin_quota_date;
      if (quotaDate) {
        if (match.coin_quota_x) {
          await coins.releaseQuota(
            client, match.player_x_id, stake, quotaDate);
        }
        if (match.coin_quota_o) {
          await coins.releaseQuota(
            client, match.player_o_id, stake, quotaDate);
        }
      }

      await client.query(
        `UPDATE game_stake_matches
            SET status='refunded', outcome='stale_refund', settled_at=NOW()
          WHERE id=$1 AND status='reserved'`, [matchId]);
      await client.query('COMMIT');
      return { refunded: true, stake };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function refundStaleMatches(olderMinutes = 60) {
    const mins = Math.min(24 * 60, Math.max(10, Number(olderMinutes) || 60));
    const { rows } = await db.query(
      `SELECT id FROM game_stake_matches
        WHERE status='reserved'
          AND created_at < NOW() - ($1::text || ' minutes')::interval
        ORDER BY created_at LIMIT 100`, [mins]);
    let refunded = 0;
    for (const row of rows) {
      const result = await refundMatch(row.id);
      if (result.refunded) refunded++;
    }
    return refunded;
  }

  return { canAfford, reserveMatch, settleMatch, refundMatch, refundStaleMatches };
}

module.exports = {
  ...createGameStakeService(),
  createGameStakeService,
  parsePublicStake,
  parseLobbyStake,
  PUBLIC_STAKES,
  LOBBY_STAKES,
  StakeError,
};
