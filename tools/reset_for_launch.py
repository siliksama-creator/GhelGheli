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
  • `schema_migrations`  — وگرنه مایگریشن‌ها دوباره اجرا می‌شوند

اجرا:
    python3 tools/reset_for_launch.py            # فقط گزارش
    python3 tools/reset_for_launch.py --yes      # واقعاً پاک می‌کند
"""
import subprocess
import sys

RX = '/home/user/tools/rx.py'
ADMIN_MOBILE = 'Admin'
UPLOADS = '/var/www/GhelGheli/backend/uploads/images'


def ssh(cmd, timeout=600):
    """اجرای فرمان روی سرورِ زنده."""
    out = subprocess.run(['python3', RX, cmd],
                         capture_output=True, text=True, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(out.stderr[:2000])
    return out.stdout


def psql(sql, tuples_only=True):
    flag = '-tAc' if tuples_only else '-c'
    # تک‌کوتیشن داخلِ SQL با کوتیشنِ پوستهٔ SSH تداخل دارد؛ heredoc امن است.
    return ssh(f"sudo -u postgres psql -d ghelgheli {flag} \"$(cat <<'__SQL__'\n{sql}\n__SQL__\n)\"")


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
DELETE FROM wheel_spins;
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
DELETE FROM user_shop_items;
DELETE FROM user_subscriptions;
DELETE FROM user_clubs;
DELETE FROM referral_earnings;
DELETE FROM league_leaderboard_entries;
DELETE FROM league_payouts;
DELETE FROM user_league_history;
DELETE FROM withdrawal_requests;
DELETE FROM support_ticket_messages;
DELETE FROM support_tickets;
DELETE FROM notifications;
DELETE FROM photo_card_attempts;
DELETE FROM wallet_transactions;
DELETE FROM otp_codes;
DELETE FROM audit_log;

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


def show(title):
    print(f'\n── {title} ──')
    print(psql(REPORT).strip())


def main():
    dry = '--yes' not in sys.argv

    show('وضعیت فعلی')

    files_before = ssh(f'ls -1 {UPLOADS} 2>/dev/null | wc -l').strip()
    size_before = ssh(f'du -sh {UPLOADS} 2>/dev/null | cut -f1').strip()
    print(f'\nفایل روی دیسک: {files_before} ({size_before})')

    if dry:
        print('\n⚠️  اجرای آزمایشی. برای پاکسازیِ واقعی: --yes')
        return

    print('\n▸ پاکسازیِ دیتابیس…')
    psql(PURGE, tuples_only=False)

    print('▸ پاکسازیِ فایل‌های یتیم…')
    # فهرستِ نگه‌دار را در فایلی روی سرور می‌نویسیم و با comm مقایسه
    # می‌کنیم — نه با حلقهٔ shell، که با ۵۰۰ فایل کند و شکننده است.
    ssh(f"sudo -u postgres psql -d ghelgheli -tAc \"$(cat <<'__SQL__'\n{KEEP_FILES}\n__SQL__\n)\""
        " | sed 's|.*/||' | sed '/^$/d' | sort -u > /tmp/keep.txt")
    removed = ssh(
        f"cd {UPLOADS} && comm -23 <(ls -1 | sort) /tmp/keep.txt > /tmp/kill.txt;"
        " wc -l < /tmp/kill.txt;"
        f" cd {UPLOADS} && xargs -a /tmp/kill.txt -d '\\n' -r rm -f --")
    print(f'  {removed.strip()} فایل حذف شد')

    show('وضعیت پس از پاکسازی')
    files_after = ssh(f'ls -1 {UPLOADS} 2>/dev/null | wc -l').strip()
    size_after = ssh(f'du -sh {UPLOADS} 2>/dev/null | cut -f1').strip()
    print(f'\nفایل روی دیسک: {files_after} ({size_after})')


if __name__ == '__main__':
    main()
