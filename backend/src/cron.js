// ─────────────────────────────────────────────────────────────────────
// کارهای زمان‌بندی‌شدهٔ سرور — همه در یک ماژول (بندِ ۱ ممیزیِ ۸ مهر ۱۴۰۵).
//
// چرا: این scheduleها وسطِ server.js پخش بودند (بازیابیِ stake، بستنِ
// لیگ‌ها، یادآورِ گردونه، هرسِ nonce/تاریخچه/سهمیه/رویدادها، پاک‌سازی
// عکس‌های رها، جاروبِ بازبینیِ عکس) و خدافایل را سنگین‌تر می‌کردند.
// اینجا **هیچ منطقی تغییر نکرده**: همان cronها، همان timezoneها، همان
// ترتیبِ ثبت، همان startup recovery و همان جاروبِ ۴۵ثانیه‌بعدازبوت.
// وابستگی‌ها تزریق می‌شوند تا مثلِ بقیهٔ ماژول‌های پروژه، eslint
// (no-undef) هر شناسهٔ گم‌شده را در زمانِ lint بگیرد.
//
// نکتهٔ معماریِ موجود که دست‌نخورده ماند: بعضی jobها روی همهٔ گره‌های
// pm2 ثبت می‌شوند و قفلِ مشورتیِ پستگرس (یا idempotent بودن) جلوی کارِ
// دوباره را می‌گیرد — توضیحاتِ هر بلوک پایین‌تر آمده است.
// ─────────────────────────────────────────────────────────────────────
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

module.exports = function registerCronJobs({
  pool, logger, gameStakes, closeExpiredSeasons, addLeaguePoints,
  wheelReminder, tapGame, cardDuel, coins, analytics,
  imageUploadDir, thumbRoot, THUMB_WIDTHS, IMAGE_EXT_RE,
}) {
// اگر process بعد از کسر stake و قبل از تسویه خاموش شود، سند reserved در
// دیتابیس می‌ماند. startup و sweep ساعتی اصل امتیاز را برمی‌گردانند؛ در
// نتیجه crash/reboot هرگز ورودی کاربر را برای همیشه قفل نمی‌کند.
gameStakes.refundStaleMatches(60)
  .then(n => { if (n) logger.info(`[games:stake] startup refunded ${n} stale match(es)`); })
  .catch(e => logger.error('[games:stake] startup recovery failed:', e.message));
cron.schedule('29 * * * *', () => {
  gameStakes.refundStaleMatches(60)
    .then(n => { if (n) logger.info(`[games:stake] refunded ${n} stale match(es)`); })
    .catch(e => logger.error('[games:stake] recovery failed:', e.message));
});

// ── بستنِ لیگ‌های تمام‌شده — ساعتی، نه «اولِ ماه» ────────────────────────
//
// قبلاً `cron.schedule('5 0 1 * *', closeActiveSeason)` بود: فقط اولِ هر
// ماهِ میلادی و فقط روی **یک** لیگ.
//
// مالک تصریح کرد: «تعداد روز لیگ فقط توسط ادمین مشخص میشه و اصلا ربطی
// به ماهانه و هفتگی نداره، ساعت اتمامش هم ادمین به تاریخ ایران مشخص
// میکنه». پنلِ مدیر هم تا سه لیگِ هم‌زمان با تاریخِ دلخواه می‌سازد.
//
// با زمان‌بندِ قبلی، لیگی که مثلاً چهارشنبه ۲۰:۰۰ تمام می‌شد تا اولِ ماهِ
// بعد باز می‌ماند و هیچ‌کس جایزه‌اش را نمی‌گرفت.
//
// حالا هر ساعت سرِ دقیقهٔ ۵ اجرا می‌شود و هر لیگی که `ends_at`اش گذشته
// را می‌بندد. حداکثر تأخیر یک ساعت است — که برای واریزِ جایزه (که
// به‌هرحال منتظرِ تأییدِ مدیر می‌ماند) کاملاً قابل قبول است.
//
// timezone صریح داده شده تا اگر سرور مهاجرت کرد، تفسیرِ تاریخ‌هایی که
// مدیر به وقتِ ایران وارد کرده جابه‌جا نشود.
cron.schedule('5 * * * *', () => {
  closeExpiredSeasons()
    .then(r => { if (r.closed) logger.info(`[league] ${r.closed} فصل بسته شد`); })
    .catch(e => logger.error('[league] بستنِ خودکارِ فصل شکست خورد:', e.message));
}, { timezone: 'Asia/Tehran' });

// Sweep expired tap-game nonces hourly.
//
// submitBatch() prunes only the CALLING user's rows, so a player who stops
// playing leaves theirs behind forever — the table grew unbounded with
// replay-protection records that were long past their 30-minute TTL.
// ── یادآور چرخش رایگان ───────────────────────────────────────────────────
//
// ۱۸:۳۰ به وقت تهران. سرور روی Asia/Tehran است، ولی timezone صریح داده
// شده تا اگر روزی سرور مهاجرت کرد، ساعتِ اعلان جابه‌جا نشود و نیمه‌شب
// به گوشی مردم نرود.
//
// سرویس **خودش هم** ساعات استراحت (۲۲:۰۰–۰۹:۰۰) را بررسی می‌کند؛ این
// دو لایه عمدی است. جزئیات در wheelReminderService.
cron.schedule('30 18 * * *', () => {
  wheelReminder.sendDailyReminder()
    .catch(e => logger.error('[wheel-reminder] failed:', e.message));
}, { timezone: 'Asia/Tehran' });

cron.schedule('17 * * * *', () => {
  tapGame.pruneNonces()
    .then(n => { if (n > 0) logger.info(`[tap] pruned ${n} expired nonces`); })
    .catch(e => logger.error('[tap] nonce prune failed:', e.message));
});

// تاریخچهٔ دوئل فقط پنج بازی امتیازی اخیر را نشان می‌دهد؛ ربات و ردیف‌های
// کهنه‌تر از دو هفته اینجا پاک می‌شوند تا جدول سبک بماند.
cron.schedule('17 4 * * *', () => {
  cardDuel.pruneBattleHistory()
    .then(n => { if (n) logger.info(`[card-duel] pruned ${n} old battle log(s)`); })
    .catch(e => logger.error('[card-duel] history prune failed:', e.message));
}, { timezone: 'Asia/Tehran' });

// جدولِ سهمیهٔ سکه به ازای هر کاربرِ فعال روزی یک ردیف می‌سازد. بدونِ
// هرس، بعد از یک سال با ۱۰٬۰۰۰ کاربرِ فعال حدود ۳.۶ میلیون ردیفِ مرده
// می‌ماند. هفت روز نگه می‌داریم تا اگر لازم شد بشود دیروز را بررسی کرد.
cron.schedule('23 4 * * *', () => {
  coins.pruneQuota(7)
    .then(n => { if (n) logger.info(`[coins] pruned ${n} old quota row(s)`); })
    .catch(e => logger.error('[coins] quota prune failed:', e.message));
  // سهمیهٔ امتیازِ کسب‌شده — همان ریتمِ هفت‌روزهٔ سهمیهٔ سکه (۴ مهر ۱۴۰۵).
  require('./services/pointQuotaService').pruneQuota(7)
    .then(n => { if (n) logger.info(`[points] pruned ${n} old earn-quota row(s)`); })
    .catch(e => logger.error('[points] earn-quota prune failed:', e.message));
}, { timezone: 'Asia/Tehran' });

// هرسِ رویدادهای تحلیلیِ کهنه — بند ۶بِ ممیزیِ مستقلِ دوم: این جدول
// تنها جدولِ رویدادی بود که بدون سقف رشد می‌کرد. رویدادها فقط به‌دردِ
// نمودارهای پنل می‌خورند که حداکثر ۹۰ روز عقب را نشان می‌دهند؛ کهنه‌تر
// از آن نه کاربردی دارد نه ارزش نگهداری.
cron.schedule('41 4 * * *', () => {
  analytics.pruneOld(90)
    .then(n => { if (n) logger.info(`[analytics] pruned ${n} old event(s)`); })
    .catch(e => logger.error('[analytics] event prune failed:', e.message));
  // صندوقِ کرش هم سقف دارد: رخدادهای حل/نادیدهٔ قدیمی‌تر از ۱۸۰ روز پاک
  // می‌شوند (گزارش‌های «باز» هرگز). بدون این، جدولِ کرش برای همیشه رشد می‌کرد.
  analytics.pruneCrashes(180)
    .then(n => { if (n) logger.info(`[analytics] pruned ${n} old crash report(s)`); })
    .catch(e => logger.error('[analytics] crash prune failed:', e.message));
}, { timezone: 'Asia/Tehran' });
// ── پاک‌سازی عکس‌های رها شده (۳ روز) ───────────────────────────────────
// عکس کاربر بعد از تأیید خودکار حذف می‌شود (serverReviewQueue)، ولی اگر
// پنل ۳ روز پرونده را نبندد یا فایل orphan بماند، اینجا روزانه جارو می‌شود.
// فقط فایلی پاک می‌شود که در هیچ جدولِ تصویری ارجاع نداشته باشد.
//
// ⚠️ فهرست باید با KEEP_FILES در tools/reset_for_launch.py یکی باشد.
// برنامهٔ پیشنهادی (۰۹۳) آنجا بود و اینجا نبود؛ جاروی ۳:۳۳ صبح فایلِ
// `/uploads/images/…` را بعد از سه روز یتیم حساب کرد و پاک کرد، در حالی که
// ردیفِ پنل هنوز همان آدرس را داشت. نتیجه: عکس در پنل و اپ ۴۰۴ می‌شد.
const IMAGE_REF_QUERIES = [
  `SELECT user_image_path AS p FROM photo_card_submissions WHERE user_image_path IS NOT NULL`,
  `SELECT image_url AS p FROM photo_card_designs WHERE image_url IS NOT NULL`,
  `SELECT attachments::text AS p FROM support_ticket_messages WHERE attachments IS NOT NULL`,
  `SELECT image_url AS p FROM recommended_apps WHERE image_url IS NOT NULL`,
  `SELECT image_url AS p FROM shop_items WHERE image_url IS NOT NULL`,
  `SELECT image_url AS p FROM card_types WHERE image_url IS NOT NULL`,
  `SELECT image_url AS p FROM reward_tiers WHERE image_url IS NOT NULL`,
  `SELECT image_url AS p FROM reward_groups WHERE image_url IS NOT NULL`,
  `SELECT image_url AS p FROM chat_stickers WHERE image_url IS NOT NULL`,
  `SELECT profile_image_url AS p FROM users WHERE profile_image_url IS NOT NULL`,
  `SELECT reward_image AS p FROM user_reward_claims WHERE reward_image IS NOT NULL`,
];
async function referencedUploadNames() {
  const names = new Set();
  for (const sql of IMAGE_REF_QUERIES) {
    const { rows } = await pool.query(sql);
    for (const row of rows) {
      const text = String(row.p || '');
      const found = text.match(/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif)/gi) || [];
      for (const name of found) names.add(name);
    }
  }
  return names;
}
cron.schedule('33 3 * * *', async () => {
  try {
    // اگر حتی یک کوئریِ مرجع بشکند، هیچ فایلی پاک نمی‌شود. پاک‌کردن با
    // فهرستِ ناقص همان باگی است که عکسِ برنامهٔ پیشنهادی را برد.
    const referenced = await referencedUploadNames();
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(imageUploadDir)) {
      if (!IMAGE_EXT_RE.test(name)) continue;
      if (referenced.has(name)) continue;
      const fp = path.join(imageUploadDir, name);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs > cutoff) continue;
        fs.unlinkSync(fp);
        for (const w of THUMB_WIDTHS) {
          const tp = path.join(thumbRoot, `${w}-${name}.webp`);
          try { if (fs.existsSync(tp)) fs.unlinkSync(tp); } catch {}
        }
        removed++;
      } catch {}
    }
    if (removed) logger.info(`[cleanup] ${removed} عکس قدیمی رها پاک شد`);
  } catch (e) {
    logger.error('[cleanup] failed; no files deleted:', e.message);
  }
}, { timezone: 'Asia/Tehran' });


// ── فاز ۴: جاروبِ بازبینیِ خودکارِ صفِ کارت‌های عکسی ──
//
// ── فاز ۴: جاروبِ بازبینیِ خودکارِ صفِ کارت‌های عکسی ──
//
// پرونده‌های «در انتظار» را با مدلِ روی سرور (یونِت/س‌فیس + امبد بصریِ
// تمام‌رزولوشن) دوباره می‌سنجد. مواردِ پراطمینان خودکار تأیید می‌شوند
// (اگر SERVER_AUTO_APPROVE=true باشد)؛ بقیه در صفِ ادمین می‌مانند. هنگام
// ورود به صف هم یک بازبینیِ فوری (آسنکرون) اجرا می‌شود؛ این کرون فقط پوششِ
// عقب‌افتاده‌ها و مواردی که مدل دیرتر لود شد را تضمین می‌کند.
//
// ── چرا «هر پنج دقیقه» و چرا اینجا شرطِ نقش نیست ──
//
// این بلوک روی **هر سه** پروسه ثبت می‌شود و این عمدی است: کدام پروسه جاروب
// را بردارد به قفلِ مشورتیِ پستگرس تصمیم می‌گیرد (توضیحِ کامل در
// `services/serverReviewQueue.js`). اگر به‌جای قفل، اینجا شرطِ
// `PROCESS_ROLE === 'game'` می‌گذاشتیم، خوابیدنِ گرهِ بازی جاروب را هم
// متوقف می‌کرد؛ با قفل، هر پروسهٔ زنده‌ای می‌تواند مسئول شود.
//
// بازه از ۱۰ دقیقه به ۵ دقیقه آمد چون پس از تک‌مسئول‌شدن، هزینهٔ هر جاروب
// محدود و قابل پیش‌بینی است (حداکثر ۲۰ پرونده × ~۱۰۰ms استنتاج، ترتیبی) و
// کوتاه‌ترشدنِ بازه یعنی دیرترین حالتِ انتظارِ کاربر برای تأییدِ خودکار
// نصف می‌شود: ۱۰ → ۵ دقیقه.
{
  const serverReviewQueue = require('./services/serverReviewQueue');
  const runPhotoSweep = () => serverReviewQueue.sweepPending(pool, {
    addLeaguePoints,
    leaderboardSignal: () => {
      try { require('./services/leaderboardSignal').leaderboardChanged(); } catch { /* بی‌خیال */ }
    },
  }).then(r => {
    if (r.skipped) return; // پروسهٔ دیگری قفل را دارد — بی‌سروصدا رد شو
    if (r.processed || r.approved) {
      logger.info(`[photoReview] sweep: ${r.processed} بررسی، ${r.approved} تأیید خودکار، ${r.queued} در صف، ${r.errors} خطا${
        r.retries ? `، ${r.retries} تلاشِ مجدد` : ''}`);
    }
  }).catch(e => logger.error('[photoReview] sweep failed:', e.message));
  // یک‌بار بعد از بالا‌آمدن (فرصت لودشدن مدل)، سپس هر پنج دقیقه.
  setTimeout(runPhotoSweep, 45 * 1000);
  cron.schedule('*/5 * * * *', runPhotoSweep);
}
};
