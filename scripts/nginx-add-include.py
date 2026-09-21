#!/usr/bin/env python3
"""افزودنِ یک خطِ include به کانفیگِ nginx — امن، idempotent و با بکاپِ بیرون.

اجرا:
    python3 scripts/nginx-add-include.py /etc/nginx/sites-enabled/ghelgheli \
        "include /etc/nginx/snippets/ghelgheli-scanner-block.conf;"

چرا این فایل وجود دارد (دو باگِ واقعی، ۲۹ شهریور):

  ۱) **بکاپ داخلِ `sites-enabled/` فاجعه است.** نسخهٔ اولِ این کار داخلِ خودِ
     deploy.sh با `cp -a "$file" "${file}.bak-..."` بکاپ می‌گرفت — و nginx
     **همهٔ** فایل‌های `sites-enabled/` را می‌خواند، نه فقط فایل‌های بدونِ
     پسوند. نتیجه: بکاپ به‌عنوانِ یک vhostِ دوم بارگذاری شد و چون خطِ
     `include .../ghelgheli-upstream.conf;` را هم داشت، خطای
     `duplicate upstream "ghelgheli_game"` داد و `nginx -t` شکست.
     (خوشبختانه nginx قدیمی در حافظه زنده ماند و سایت نیفتاد — ولی هر
     ری‌استارتِ بعدیِ nginx می‌توانست سایت را بخواباند.)
     پس بکاپ همیشه بیرون از مسیرهای nginx می‌رود.

  ۲) **هر «فایلِ درست‌شده» باید فقط یک anchors مشخص داشته باشد.** لنگرِ پیش‌فرض
     خطِ `root` دو سایتِ ایستا است (وبِ کاربر و پنل ادمین) — یکتا و بی‌ابهام؛
     پس include دقیقاً داخلِ همان دو server-block می‌نشیند، نه جای دیگر.

نوشتنِ فایل اتمیک است (temp + rename) تا اگر وسطِ کار قطع شد، کانفیگِ نیمه‌کاره
روی دیسک نماند.
"""
import argparse
import os
import re
import shutil
import sys
import time

DEFAULT_ANCHOR = r'\s*root\s+/var/www/GhelGheli/(admin|userweb)/dist;'
DEFAULT_BACKUP_DIR = '/root/ghelgheli-backups/nginx'
# هر مسیری که nginx آن را می‌خواند: بکاپ هرگز نباید این‌جا بیفتد.
NGINX_LOADED = ('/etc/nginx/sites-enabled', '/etc/nginx/conf.d', '/etc/nginx/nginx.conf')


def main() -> int:
    ap = argparse.ArgumentParser(description='Add an include line to an nginx config (idempotent).')
    ap.add_argument('config', help='مسیرِ فایلِ کانفیگ')
    ap.add_argument('include', help='خطِ include که اضافه می‌شود (بدونِ فاصلهٔ ابتدایی)')
    ap.add_argument('--anchor', default=DEFAULT_ANCHOR, help='regexِ لنگر؛ include بعد از آن می‌آید')
    ap.add_argument('--backup-dir', default=DEFAULT_BACKUP_DIR)
    ap.add_argument('--indent', default='  ')
    args = ap.parse_args()

    if not os.path.isfile(args.config):
        print(f'✗ کانفیگ نیست: {args.config}', file=sys.stderr)
        return 2

    backup_dir = os.path.realpath(args.backup_dir)
    for loaded in NGINX_LOADED:
        if backup_dir == os.path.realpath(loaded) or backup_dir.startswith(os.path.realpath(loaded) + os.sep):
            print(f'✗ پوشهٔ بکاپ داخلِ مسیرِ بارگذاری‌شدهٔ nginx است: {backup_dir}\n'
                  '  (nginx همهٔ فایل‌های sites-enabled را می‌خواند و بکاپ می‌شود vhostِ دوم)',
                  file=sys.stderr)
            return 3

    with open(args.config, encoding='utf-8') as fh:
        src = fh.read()

    line = args.indent + args.include.strip() + '\n'
    if args.include.strip() in src:
        print('include از قبل هست — تغییری لازم نبود')
        return 0

    inserted = 0
    out = []
    for raw in src.splitlines(keepends=True):
        out.append(raw)
        if re.match(args.anchor, raw):
            out.append(line)
            inserted += 1

    if inserted == 0:
        print('✗ لنگر پیدا نشد — کانفیگ دست‌نخورده ماند', file=sys.stderr)
        return 4

    os.makedirs(backup_dir, exist_ok=True)
    stamp = time.strftime('%Y%m%d%H%M%S')
    backup = os.path.join(backup_dir, f'{os.path.basename(args.config)}.{stamp}')
    shutil.copy2(args.config, backup)

    tmp = f'{args.config}.new'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(''.join(out))
    os.replace(tmp, args.config)          # اتمیک: کانفیگِ نیمه‌کاره نمی‌ماند
    print(f'include بعد از {inserted} لنگر اضافه شد (بکاپ: {backup})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
