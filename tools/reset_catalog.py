# -*- coding: utf-8 -*-
"""پاکسازیِ کاملِ کاتالوگِ کارت — برای شروعِ تازه.

═══════════════════════════════════════════════════════════════════════════
چرا این ابزار لازم شد
═══════════════════════════════════════════════════════════════════════════

مالک چند بار خواست «دیتابیس کارت‌ها را پاک کن تا از اول تست کنم». هر بار
دستی روی دیتابیس انجام می‌شد — که سه اشکال داشت:

  ۱. **ترتیبِ حذف حساس است.** پرونده‌ها به کد و طرح ارجاع دارند، کد به
     طرح، و همه به نوعِ کارت. یک ترتیبِ غلط یعنی خطای کلیدِ خارجی.

  ۲. **API عمداً اجازه نمی‌دهد.** مسیرِ `DELETE /photo-cards/designs/:id`
     اگر پرونده‌ای به طرح ارجاع داشته باشد ۴۰۹ می‌دهد:

         «این طرح در ۲ پروندهٔ ثبت استفاده شده و قابل حذف نیست»

     آن محافظ **درست** است و نباید ضعیف شود: در محیطِ واقعی، حذفِ طرحی
     که کاربری با آن کارت گرفته یعنی خراب کردنِ تاریخچهٔ او. ولی برای
     «پاکسازیِ کاملِ محیطِ تست» دقیقاً همان محافظ سرِ راه است.

  ۳. **جا افتادنِ جدول.** آخرین بار پاکسازیِ دستی ۴ پرونده و ۴ کد جا
     گذاشت، و پروندهٔ یتیم در صفِ بررسیِ مدیر ظاهر می‌شد — ردیفی با
     کدِ خالی که هیچ معنایی نداشت.

اجرا:
    python3 tools/reset_catalog.py            # فقط گزارش می‌دهد
    python3 tools/reset_catalog.py --yes      # واقعاً پاک می‌کند

⚠️ این ابزار **همهٔ** کارت‌ها را پاک می‌کند، نه فقط دادهٔ تست را. برای
   محیطِ زنده‌ای که مشتریِ واقعی دارد ساخته نشده. قبل از اجرا تعدادِ
   اینونتوریِ کاربرانِ فعال را نشان می‌دهد تا اگر اشتباهی است، معلوم شود.
"""
import subprocess
import sys

RX = '/home/user/tools/rx.py'


def psql(sql, tuples_only=False):
    """اجرای SQL روی دیتابیسِ زنده از راهِ SSH."""
    flag = '-tAc' if tuples_only else '-c'
    out = subprocess.run(
        ['python3', RX,
         f'sudo -u postgres psql -d ghelgheli {flag} "{sql}"'],
        capture_output=True, text=True, timeout=180)
    return out.stdout.strip()


REPORT = """
SELECT 'انواع کارت' AS بخش, count(*)::text AS تعداد FROM card_types
UNION ALL SELECT 'طرح تصویری', count(*)::text FROM photo_card_designs
UNION ALL SELECT 'کد عکسی', count(*)::text FROM photo_card_codes
UNION ALL SELECT 'کد قدیمی', count(*)::text FROM card_codes
UNION ALL SELECT 'پروندهٔ ثبت', count(*)::text FROM photo_card_submissions
UNION ALL SELECT 'اینونتوری (کل)', count(*)::text FROM user_card_inventory
UNION ALL SELECT 'اینونتوریِ کاربرِ فعال', count(*)::text
  FROM user_card_inventory i JOIN users u ON u.id = i.user_id
 WHERE u.status = 'active'
"""

# ── ترتیب حیاتی است ──
#
# از برگ به ریشه: پرونده → کد → طرح → اینونتوری/جوایز → نوعِ کارت.
# هر جابه‌جایی یعنی خطای کلیدِ خارجی و تراکنشِ برگشته.
#
# `reward_tier_cards` هم پاک می‌شود: جایزه‌ای که به کارتِ حذف‌شده ارجاع
# بدهد، در صفحهٔ جوایز خطا می‌دهد.
PURGE = """
BEGIN;
DELETE FROM photo_card_submissions;
DELETE FROM photo_card_codes;
DELETE FROM photo_card_designs;
DELETE FROM card_codes;
DELETE FROM reward_tier_cards;
DELETE FROM user_card_inventory;
DELETE FROM card_types;
COMMIT;
"""


def main():
    print('\n══ وضعیتِ فعلی ══')
    print(psql(REPORT.replace('\n', ' ')))

    if '--yes' not in sys.argv:
        print('\nℹ️  فقط گزارش. برای پاکسازیِ واقعی:')
        print('    python3 tools/reset_catalog.py --yes\n')
        return 0

    # ── فایل‌های تصویر هم باید بروند ──
    #
    # بدونِ این، هر پاکسازی چند صد کیلوبایت فایلِ یتیم روی دیسکِ VPS
    # می‌گذارد که هیچ‌وقت پاک نمی‌شود و کسی متوجهش نمی‌شود تا روزی که
    # سرور بنویسد «no space left».
    urls = psql('SELECT image_url FROM photo_card_designs;', tuples_only=True)
    files = [u.strip().split('/')[-1] for u in urls.splitlines() if u.strip()]

    print('\n══ پاکسازی ══')
    print(psql(PURGE.replace('\n', ' ')))

    if files:
        script = 'cd /var/www/GhelGheli/backend/uploads/images 2>/dev/null || exit 0\n'
        for f in files:
            script += f'rm -f "{f}"\n'
        script += 'echo "فایل‌های تصویر پاک شدند: %d"' % len(files)
        out = subprocess.run(['python3', RX, script],
                             capture_output=True, text=True, timeout=180)
        print(out.stdout.strip())

    print('\n══ وضعیتِ نهایی ══')
    print(psql(REPORT.replace('\n', ' ')))
    print('\n✅ کاتالوگ خالی است — آمادهٔ ثبتِ تازه.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
