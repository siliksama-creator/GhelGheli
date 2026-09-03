# -*- coding: utf-8 -*-
"""پاکسازیِ کاملِ محیط برای **عرضهٔ واقعی** — کاتالوگ، کاربران، فایل‌ها.

═══════════════════════════════════════════════════════════════════════════
تفاوتش با reset_catalog.py
═══════════════════════════════════════════════════════════════════════════

`reset_catalog.py` فقط کارت‌ها را پاک می‌کند؛ برای «از اول تست کردن» ساخته
شده بود. این ابزار یک قدم جلوتر است و برای **لحظهٔ عرضه** نوشته شده:

  ۱. کاتالوگِ کارت (نوع، طرح، کد، پرونده، اینونتوری)
  ۲. **همهٔ کاربران بجز حسابِ اصلیِ مدیر** و هر چیزی که به آن‌ها آویزان است
  ۳. دادهٔ جانبیِ تست: چت، گردونه، کیف پول، لاگ ممیزی، رکورد بازی‌ها
  ۴. **فایل‌های یتیمِ روی دیسک** — چیزی که هیچ ابزارِ قبلی انجام نمی‌داد

═══════════════════════════════════════════════════════════════════════════
چرا پاکسازیِ فایل‌ها جدا لازم است
═══════════════════════════════════════════════════════════════════════════

DELETE روی جدول فقط ردیف را می‌برد؛ فایلِ webp روی `uploads/images/` سرِ
جایش می‌ماند. اندازه‌گیری قبل از این ابزار: **۴۷۳ فایل روی دیسک، ۳۵
مگابایت — که فقط ۱۶ تای آن‌ها در دیتابیس ارجاعی داشتند.** ۴۵۷ فایل زبالهٔ
محض بودند که هر روز در بک‌آپِ تلگرام هم تکرار می‌شدند (حجمِ بک‌آپ از
۸۰۰ کیلوبایت به ۲۸ مگابایت رسیده بود — همین بود).

⚠️ فهرستِ «نگه‌دار» از **همهٔ** ستون‌هایی که به فایل ارجاع می‌دهند ساخته
   می‌شود، نه فقط کارت‌ها: shop_items، reward_tiers، reward_groups،
   chat_stickers، users.profile_image_url، user_reward_claims.reward_image.
   اگر فردا ستونِ تصویریِ تازه‌ای اضافه شد و اینجا اضافه نشد، فایل‌های آن
   ستون پاک می‌شوند — پس این فهرست باید همراه هر مایگریشنِ تصویری به‌روز
   شود.

═══════════════════════════════════════════════════════════════════════════
چه چیزهایی عمداً دست‌نخورده می‌مانند
═══════════════════════════════════════════════════════════════════════════

  • `admin_users`        — حسابِ مدیرِ پنل
  • کاربرِ `Admin`       — حسابِ اصلیِ مالک در اپ
  • `app_settings`       — تنظیماتِ پیامک، کیف پول، چت
  • `reward_tiers`       — پلکانِ جوایز (۶۳ ردیف؛ ساختار است نه دادهٔ تست)
  • `pass_tiers` / `pass_seasons` / `league_seasons` — تقویمِ فصل‌ها
  • `shop_items`         — کاتالوگِ فروشگاهِ کازمتیک
  • `wheel_prizes`       — چیدمانِ گردونه
  • `chat_stickers`      — استیکرهایِ پیش‌فرض (چیزی که کاربر می‌فرستد در
    `chat_messages` است و آنجا پاک می‌شود؛ خودِ کاتالوگ تنظیمات است)
  • `card_box_odds` / `mission_definitions` / `reward_groups` /
    `league_perk_tiers` — شانسِ صندوق، تعریفِ ماموریت‌ها، گروه‌هایِ جایزه و
    پلکانِ پاداشِ لیگ: این‌ها همان اعدادی‌اند که *ادمین با پنل* ساخته و اگر
    پاک شوند، «صبحِ انتشار با پنلِ خالی» را داریم. نام‌برده‌شدنِ این چهار در
    فهرستِ پایین، خودِ همان باگِ تاریخیِ این ابزار بود (جدولِ تازه‌ای که
    مایگریشن می‌سازد و پاک‌ساز نمی‌شناسدش) — و گاردِ `testResetGuard.js`
    دقیقاً برای همین نوشته شد.
  • `live_content_history` — تاریخچهٔ ویرایشِ متن/قاعدهٔ زنده: «چه کسی چه
    چیزی را عوض کرد» بخشی از دادهٔ محصول است نه ردپایِ تستِ کاربر.
  • `schema_migrations`  — وگرنه مایگریشن‌ها دوباره اجرا می‌شوند

اجرا (رویِ خودِ سرور، چون به فایل‌هایِ uploads هم کار دارد):
    python3 tools/reset_for_launch.py            # فقط گزارش
    python3 tools/reset_for_launch.py --yes      # واقعاً پاک می‌کند (اول pg_dump)
"""
import re
import subprocess
import sys

ADMIN_MOBILE = 'Admin'
UPLOADS = '/var/www/GhelGheli/backend/uploads/images'
DB = 'ghelgheli'
BACKUP_DIR = '/var/backups/ghelgheli'


def ssh(cmd, timeout=900):
    """اجرای فرمان.

    تا پیش از این، اینجا فراخوانیِ یک اسکریپتِ کمکیِ *بیرونِ مخزن* بود که در
    هیچ clone تازه‌ای نیست: ابزارِ لحظهٔ عرضه به مسیرِ یک پوشهٔ شخصی وابسته بود و
    با پاک‌سازیِ ورک‌اسپیس، عملاً «اجرا شدنی» نبود — بدترین شکلِ وابستگی،
    یعنی چیزی که فقط رویِ لپ‌تاپِ یک نفر کار می‌کند و این در روزِ انتشار
    کشف می‌شود. حالا خودِ اسکریپت با psql کار می‌کند و همان‌جا روی سرور
    اجرا می‌شود:

        ssh root@server 'cd /var/www/GhelGheli && python3 tools/reset_for_launch.py'
    """
    out = subprocess.run(['bash', '-lc', cmd], capture_output=True, text=True,
                         timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError((out.stderr or out.stdout)[:2000])
    return out.stdout


def psql(sql, tuples_only=True):
    # تک‌کوتیشن داخلِ SQL با کوتیشنِ پوسته تداخل دارد؛ heredoc امن است و
    # ON_ERROR_STOP=1 لازم است، وگرنه `psql` خطایِ وسطِ تراکنش را چاپ می‌کند
    # و exit ۰ می‌دهد: یعنی «پاکسازیِ نصفه» سبز رد می‌شد.
    q = "-tAc" if tuples_only else "-c"
    return ssh("sudo -u postgres psql -d %s -v ON_ERROR_STOP=1 %s \"$(cat <<'__SQL__'\n%s\n__SQL__\n)\""
               % (DB, q, sql))


def existing_tables():
    rows = psql("select table_name from information_schema.tables "
                "where table_schema='public' and table_type='BASE TABLE'")
    return set(x.strip() for x in rows.split('\n') if x.strip())


# ═══════════════════════════════════════════════════════════════════════════
# گزارشِ قبل و بعد
# ═══════════════════════════════════════════════════════════════════════════
REPORT = """
SELECT 'نوع کارت'          , count(*)::text FROM card_types
UNION ALL SELECT 'طرح تصویری'   , count(*)::text FROM photo_card_designs
UNION ALL SELECT 'کد عکسی'      , count(*)::text FROM photo_card_codes
UNION ALL SELECT 'کد قدیمی'     , count(*)::text FROM card_codes
UNION ALL SELECT 'پروندهٔ ثبت'  , count(*)::text FROM photo_card_submissions
UNION ALL SELECT 'اینونتوری'    , count(*)::text FROM user_card_inventory
UNION ALL SELECT 'کاربر'        , count(*)::text FROM users
UNION ALL SELECT 'پیام چت'      , count(*)::text FROM chat_messages
UNION ALL SELECT 'چرخشِ گردونه' , count(*)::text FROM wheel_spins
UNION ALL SELECT 'تیم دوئل'     , count(*)::text FROM card_duel_decks
UNION ALL SELECT 'نبرد دوئل'    , count(*)::text FROM card_duel_battles
UNION ALL SELECT 'escrow بازی'   , count(*)::text FROM game_stake_matches
UNION ALL SELECT 'تراکنش کیف'   , count(*)::text FROM wallet_transactions
UNION ALL SELECT 'لاگ ممیزی'    , count(*)::text FROM audit_log
UNION ALL SELECT 'تلاشِ ناموفق' , count(*)::text FROM photo_card_attempts
"""


# ═══════════════════════════════════════════════════════════════════════════
# پاکسازیِ دیتابیس
# ═══════════════════════════════════════════════════════════════════════════
#
# ── چرا ترتیب مهم است ──
#
# از برگ به ریشه. `photo_card_codes.used_by_user_id` کلیدِ خارجی با
# ON DELETE SET NULL دارد، پس حذفِ کاربر قبل از کد مشکلی نمی‌سازد؛ ولی
# `user_card_inventory.card_type_id` روی RESTRICT است — یعنی حذفِ
# `card_types` **قبل** از خالی شدنِ اینونتوری با خطا برمی‌گردد.
#
# ── چرا DELETE و نه TRUNCATE ──
#
# TRUNCATE روی جدولی که کلیدِ خارجیِ ورودی دارد بدونِ CASCADE کار نمی‌کند،
# و TRUNCATE ... CASCADE سکوت می‌کند و جدول‌هایی را خالی می‌کند که در این
# فهرست نیستند — دقیقاً همان چیزی که نمی‌خواهیم. حجمِ داده کم است
# (کمتر از ۲۰ هزار ردیف) پس کندیِ DELETE بی‌اهمیت است.
PURGE = f"""
BEGIN;

-- ── ۱) کاتالوگِ کارت ──
DELETE FROM photo_card_submissions;
DELETE FROM photo_card_codes;
DELETE FROM photo_card_designs;
DELETE FROM card_codes;
DELETE FROM reward_tier_cards;
DELETE FROM user_card_inventory;
DELETE FROM card_types;

-- ── ۲) دادهٔ جانبیِ تست ──
--
-- این‌ها اغلب با حذفِ کاربر cascade می‌شوند، ولی صریح نوشتنشان دو فایده
-- دارد: ردیف‌های یتیمی که کاربرشان قبلاً رفته هم پاک می‌شوند، و اگر
-- روزی کلیدِ خارجی عوض شد این اسکریپت بی‌صدا ناقص نمی‌شود.
DELETE FROM chat_message_likes;
DELETE FROM chat_messages;
DELETE FROM friendships;
DELETE FROM user_mission_progress;
DELETE FROM analytics_events;
DELETE FROM app_crash_reports;
DELETE FROM wheel_spins;
DELETE FROM game_stake_matches;
DELETE FROM card_duel_battles;
DELETE FROM card_duel_decks;
DELETE FROM game_results;
DELETE FROM game_xp_log;
DELETE FROM solo_records;
DELETE FROM tap_game_nonces;
DELETE FROM tap_game_progress;
DELETE FROM pass_xp_log;
DELETE FROM user_pass_claims;
DELETE FROM user_pass_progress;
DELETE FROM user_reward_claims;
DELETE FROM user_group_progress;
DELETE FROM user_entitlements;
DELETE FROM purchase_referral_commissions;
DELETE FROM user_shop_items;
DELETE FROM user_subscriptions;
DELETE FROM user_clubs;
DELETE FROM referral_earnings;
DELETE FROM league_leaderboard_entries;
DELETE FROM league_payouts;
DELETE FROM user_league_history;
DELETE FROM withdrawal_status_history;
DELETE FROM withdrawal_requests;
DELETE FROM support_ticket_messages;
DELETE FROM support_tickets;
DELETE FROM notifications;
DELETE FROM photo_card_attempts;
-- سفارش‌های شارژ کیف پول (مایگریشن ۰۶۷) باید **قبل از**
-- wallet_transactions پاک شوند: ستون `wallet_tx_id` به آن ارجاع دارد.
DELETE FROM payment_orders;
DELETE FROM wallet_transactions;
DELETE FROM otp_codes;
DELETE FROM audit_log;
-- ⚠️ جدول‌های تازه (مایگریشن ۰۴۵) — بدونِ این‌ها ردیفِ یتیم می‌ماند.
--
-- بعد از پاکسازی، یک ردیفِ `point_transactions` باقی مانده بود که
-- کاربرش حذف شده بود. عددِ کوچکی بود ولی همان دسته خطاست که در
-- «۴۵۷ فایلِ یتیم» هم دیده شد: ابزارِ پاکسازی باید همراهِ هر مایگریشنِ
-- تازه به‌روز شود، وگرنه بی‌صدا ناقص می‌شود.
DELETE FROM point_transactions;
DELETE FROM login_streaks;
DELETE FROM league_payouts;
DELETE FROM league_leaderboard_entries;
-- ⚠️ سهمیهٔ سکه (مایگریشن ۰۶۶). گاردِ testShopAssets.js همین را گرفت:
-- جدولِ تازه اضافه شد و ابزار نمی‌شناختش. بدونِ این خط، سهمیهٔ روزِ
-- کاربرانِ حذف‌شده باقی می‌ماند و بی‌معنا جدول را پر می‌کند.
DELETE FROM user_coin_quota;
-- ⚠️ جدول‌های مایگریشنِ ۰۷۲ (دورِ ۲۶). باز هم همان گارد این‌ها را گرفت.
--
--   • card_box_purchases — تاریخچهٔ خریدِ صندوقِ کارت. ردیفش به کاربر
--     ارجاع دارد و کارت‌های تحویلی‌اش در user_card_inventory بالاتر پاک
--     می‌شوند، پس بدونِ این خط سندِ خرید بی‌صاحب می‌ماند.
--   • league_perk_awards — جوایزِ غیرنقدیِ ۲۰ نفرِ بعد از رتبهٔ ۵۰.
-- ⚠️ مایگریشن ۰۷۷: صندوقِ بازنشدهٔ گردونه/لیگ به کاربر ارجاع دارد و
--    box_id به card_box_purchases. باید قبل از خریدهای صندوق پاک شود.
DELETE FROM user_item_grants;
DELETE FROM card_box_purchases;
DELETE FROM league_perk_awards;

-- ⚠️ فاز ۲/۳ (لایو-کانتنت و متن‌هایِ زنده) دو جدولِ تازه آورد که در این
--    فهرست نبودند و همان دامِ «۴۵۷ فایل یتیم» را تکرار می‌کردند:
--      • card_box_odds و mission_definitions *تنظیماتِ محصول‌اند* و عمداً
--        پایین‌تر، در بخشِ «دست‌نخورده‌ها» نگه داشته می‌شوند؛
--      • ردیف‌هایِ کاربریِ باقی‌مانده از فصل‌ها/لیگ:
DELETE FROM league_perk_grants;
DELETE FROM user_coin_quota;

-- ── ۳) کاربران، بجز حسابِ اصلیِ مدیر ──
DELETE FROM users WHERE mobile <> '{ADMIN_MOBILE}';

-- ── ۴) ریستِ خودِ حسابِ مدیر ──
--
-- حساب می‌ماند ولی امتیاز و کیف پولش صفر می‌شود: هر عددی که الان دارد
-- از تست آمده و بردنش به محیطِ واقعی یعنی مالک از روزِ اول در صدرِ
-- جدولِ لیگ باشد.
UPDATE users SET
  current_points = 0, lifetime_points = 0, monthly_league_points = 0,
  wallet_balance = 0, game_xp = 0, bonus_spins = 0, unlimited_spins = false,
  referred_by = NULL, referred_at = NULL, updated_at = NOW()
WHERE mobile = '{ADMIN_MOBILE}';

COMMIT;
"""


# ═══════════════════════════════════════════════════════════════════════════
# فایل‌های یتیم
# ═══════════════════════════════════════════════════════════════════════════
#
# ⚠️ این کوئری فهرستِ **نگه‌دار** است، نه فهرستِ حذف. یعنی پیش‌فرض روی
#    «پاک کن» است. هر ستونِ تصویریِ تازه‌ای که به اسکیما اضافه شود باید
#    اینجا هم بیاید، وگرنه فایل‌هایش قربانی می‌شوند.
KEEP_FILES = """
SELECT image_url         FROM card_types            WHERE image_url IS NOT NULL
UNION ALL SELECT image_url FROM photo_card_designs
UNION ALL SELECT user_image_path FROM photo_card_submissions WHERE user_image_path IS NOT NULL
UNION ALL SELECT image_url FROM shop_items          WHERE image_url IS NOT NULL
UNION ALL SELECT image_url FROM reward_tiers        WHERE image_url IS NOT NULL
UNION ALL SELECT image_url FROM reward_groups       WHERE image_url IS NOT NULL
UNION ALL SELECT image_url FROM chat_stickers       WHERE image_url IS NOT NULL
UNION ALL SELECT profile_image_url FROM users       WHERE profile_image_url IS NOT NULL
UNION ALL SELECT reward_image FROM user_reward_claims WHERE reward_image IS NOT NULL
"""


def prune_missing(sql):
    """حذفِ خط‌هایی که به جدولِ ناموجود اشاره می‌کنند (به‌جای خطایِ زمانِ اجرا).

    باگِ واقعی و *اجراشده*: `card_codes` در مایگریشن ۰۰۱ ساخته شد و در
    ۰۸۰_stickers_and_card_codes_cleanup.sql حذف؛ این ابزار هر دو را می‌شناخت و
    رویِ `DELETE FROM card_codes` (و همان سطرِ شمارش در گزارش) می‌سوخت —
    یعنی دقیقاً در لحظه‌ای که نباید بسوزد. فهرستِ جدول‌ها بعدِ یک حذفِ
    schema، «حرفِ باقی‌مانده» است نه فرضِ ابدی. اینجا از دیتابیس می‌پرسیم و
    رد می‌کنیم، ولی **گزارشش می‌دهیم**: سکوت در ابزارِ پاکسازی = دروغ.
    """
    live = existing_tables()
    kept, skipped = [], []
    for line in sql.split('\n'):
        tables = set(re.findall(r'\b(?:from|update)\s+([a-z_][a-z0-9_]*)', line, re.I))
        missing = sorted(t for t in tables if t not in live)
        if missing:
            skipped.append(', '.join(missing))
            continue
        kept.append(line)
    body = '\n'.join(kept)
    # اگر *اولین* سطرِ یک کوئریِ UNION حذف شده باشد، سطرِ بعدی «UNION ALL»
    # می‌ماند و SQL بی‌سرِخود می‌شود (نخستین اجرایِ این اصلاح، همین را با
    # IndexError رویِ پروداکشنِ کپی‌شده نشان داد).
    body = re.sub(r'^\s*\n*', '', body)
    m = re.match(r'^(\s*)UNION ALL\s+', body)
    if m:
        body = body[:m.start()] + body[m.end():]
    return body, sorted(set(skipped))


def show(title):
    print(f'\n── {title} ──')
    q, skipped = prune_missing(REPORT)
    print(psql(q).strip())
    if skipped:
        print('   (ستون‌هایِ بی‌جدول حذف شدند: ' + '; '.join(skipped) + ')')


def main():
    global DB, UPLOADS
    dry = '--yes' not in sys.argv
    args = sys.argv[1:]
    # ── --db/--uploads: «کپیِ دیتابیس» قبلِ اجرا رویِ پروداکشن ──────────────
    # بدونِ این دو، آزمودنِ این ابزار رویِ پروداکشن است یا هیچ. رویِ کپی
    # (pg_dump + `--db reset_probe`) سنجیده شد و همان‌جا سه باگِ اجرا پیدا شد.
    if '--db' in args:
        DB = args[args.index('--db') + 1]
        print(f'· دیتابیسِ هدف: {DB}')
    if '--uploads' in args:
        UPLOADS = args[args.index('--uploads') + 1]
        print(f'· پوشهٔ فایل‌ها: {UPLOADS}')

    show('وضعیت فعلی')

    files_before = ssh(f'ls -1 {UPLOADS} 2>/dev/null | wc -l').strip()
    size_before = ssh(f'du -sh {UPLOADS} 2>/dev/null | cut -f1').strip()
    print(f'\nفایل روی دیسک: {files_before} ({size_before})')

    if dry:
        print('\n⚠️  اجرای آزمایشی. برای پاکسازیِ واقعی: --yes')
        return

    # ── بکاپ: بیِ آن هیچ حذفی اجرا نمی‌شود ──
    # «فکر می‌کردم dry-run بود» تنها با یک بکاپِ سالم جبران می‌شود؛ و
    # صحتِ بکاپ با *حجم* سنجیده می‌شود نه exit code، چون `pg_dump | gzip`
    # با لوله‌هایِ شکسته هم می‌تواند صفر برگرداند و فایلِ ۲۰ بایتی بدهد.
    if '--no-backup' in args:
        # فقط برایِ آزمون رویِ کپی؛ رویِ پروداکشن بی‌بکاپ اجرا نکنید.
        print('⚠ بکاپ عمداً گرفته نشد (--no-backup)')
        stamp = None
    else:
        stamp = subprocess.run(['date', '-u', '+%Y%m%dT%H%M%SZ'],
                               capture_output=True, text=True).stdout.strip()
    if stamp:
        dest = f'{BACKUP_DIR}/pre-reset-{stamp}.sql.gz'
        ssh(f'mkdir -p {BACKUP_DIR} && sudo -u postgres pg_dump -d {DB} | gzip > {dest}'
            f' && test $(stat -c%s {dest}) -gt 2048')
        print(f'\n✓ بکاپ: {dest}')

    print('\n▸ پاکسازیِ دیتابیس…')
    purge, skipped = prune_missing(PURGE)
    if skipped:
        print('   (جمله‌هایِ بی‌جدول رد شد: ' + '; '.join(skipped) + ')')
    psql(purge, tuples_only=False)

    print('▸ پاکسازیِ فایل‌های یتیم…')
    # فهرستِ «نگه‌دار» را در فایلی روی سرور می‌نویسیم و با comm مقایسه می‌کنیم
    # — نه با حلقهٔ shell، که با ۵۰۰ فایل کند و شکننده است.
    keepf, killf = f'/tmp/keep-{DB}.txt', f'/tmp/kill-{DB}.txt'
    # نامِ فایلِ موقت با نامِ دیتابیس قفل می‌شود: نسخهٔ قبلی `/tmp/keep.txt`
    # مشترک داشت و دو اجرایِ هم‌زمان (یکی رویِ پروداکشن، یکی رویِ کپیِ آزمون)
    # یکدیگر را با فهرستِ *دیگری* پاک می‌کردند — بدترین حالتِ ممکن برای ابزاری
    # که فایل حذف می‌کند.
    q_keep, skipped_keep = prune_missing(KEEP_FILES)
    if skipped_keep:
        print('  (ارجاع‌هایِ بی‌جدول رد شد: ' + '; '.join(skipped_keep) + ')')
    ssh("sudo -u postgres psql -d %s -v ON_ERROR_STOP=1 -tAc \"$(cat <<'__SQL__'\\n%s\\n__SQL__\\n)\""
        % (DB, q_keep) + " | sed 's|.*/||' | sed '/^$/d' | sort -u > " + keepf)
    # پوشهٔ نبودنی = «صفر فایل»، نه exception: در اجرایِ اولِ این اصلاح رویِ
    # کپی، `cd` به پوشهٔ نبودنی *بعد از* پاک‌شدنِ دیتابیس خطا می‌داد و ابزار
    # نیمی‌کاره می‌مرد (دیتابیس پاک، فایل‌ها سرجایشان).
    removed = ssh(
        f"if [ -d {UPLOADS} ]; then cd {UPLOADS} && comm -23 <(ls -1 | sort) {keepf}"
        f" > {killf} && wc -l < {killf} && xargs -a {killf} -d '\\n' -r rm -f --;"
        f" else echo '0 (پوشهٔ فایل نیست: {UPLOADS})'; fi")
    print(f'  {removed.strip()} فایل حذف شد')

    # ── شمارشِ دوباره: «صفرشدن» را باور نمی‌کنیم مگر اندازه بگیریم ──
    # تریگر/RLS/کلیدِ خارجیِ RESTRICT می‌تواند ردیفی را نگه دارد و psql هم
    # exit ۰ بدهد؛ ابزارِ پاکسازی که فقط «دستور را اجرا کرد» و نگاه نکرد،
    # در بهترین حالت دادهٔ تستی را به محیطِ واقعی منتقل می‌کند.
    leftovers = psql("select coalesce(string_agg(t, ', '), '') from ("
                     "  select 'users' t, count(*) n from users where mobile <> '{m}'"
                     "  union all select 'chat_messages', count(*) from chat_messages"
                     "  union all select 'wallet_transactions', count(*) from wallet_transactions"
                     "  union all select 'analytics_events', count(*) from analytics_events"
                     "  union all select 'point_transactions', count(*) from point_transactions"
                     "  union all select 'user_coin_quota', count(*) from user_coin_quota"
                     "  union all select 'card_box_purchases', count(*) from card_box_purchases"
                     ") x where x.n > 0".format(m=ADMIN_MOBILE)).strip()
    if leftovers:
        raise SystemExit('✗ این جدول‌ها صفر نشدند (کلیدِ خارجی/تریگر؟): ' + leftovers)
    print('✓ بازبینی: ردیف‌هایِ هدف صفر شدند')

    show('وضعیت پس از پاکسازی')
    files_after = ssh(f'ls -1 {UPLOADS} 2>/dev/null | wc -l').strip()
    size_after = ssh(f'du -sh {UPLOADS} 2>/dev/null | cut -f1').strip()
    print(f'\nفایل روی دیسک: {files_after} ({size_after})')


if __name__ == '__main__':
    main()
