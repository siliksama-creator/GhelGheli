#!/usr/bin/env python3
"""۴۰۴ِ فایلِ hashدار نباید یک سال کش شود.

علامتِ زنده (۲۶ سپتامبر ۲۰۲۶):
    GET /assets/photo-cards-B61otYbN.js
    HTTP 404
    Cache-Control: public, max-age=31536000, immutable

`add_header ... always` روی `location ^~ /assets/` هدر را به پاسخِ
`try_files $uri =404` هم می‌چسباند. مرورگر همان ۴۰۴ را immutable می‌کند
و «Failed to fetch dynamically imported module» حتی بعد از رفرش می‌ماند —
روی وب، کرومِ اندروید، و پنل.

فایلِ موجود همان کشِ یک‌ساله را نگه می‌دارد. فایلِ نبود به
`@ghelgheli_asset_miss` می‌رود و `Cache-Control: no-store` می‌گیرد.

بکاپ هرگز داخلِ sites-enabled نمی‌رود (nginx آن را vhostِ دوم می‌خواند).
اگر `nginx -t` رد کند، فایل برمی‌گردد.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time

BACKUP_DIR = '/root/ghelgheli-backups/nginx'
NGINX_LOADED = ('/etc/nginx/sites-enabled', '/etc/nginx/conf.d')

ASSET_OPEN = re.compile(r'^[ \t]*location\s+\^~\s+/assets/\s*\{', re.M)
ML_OPEN = re.compile(r'^[ \t]*location\s+\^~\s+/ml/\s*\{', re.M)
SERVER_OPEN = re.compile(r'^[ \t]*server\s*\{', re.M)
NAMED_OPEN = re.compile(r'location\s+@ghelgheli_asset_miss\s*\{')


def block_end(text: str, open_brace: int) -> int:
    depth = 0
    for i in range(open_brace, len(text)):
        c = text[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
    raise ValueError('آکولادِ بسته‌نشده در کانفیگِ nginx')


def spans(text: str, opener: re.Pattern[str]) -> list[tuple[int, int, str]]:
    found = []
    for match in opener.finditer(text):
        brace = text.find('{', match.start())
        end = block_end(text, brace)
        found.append((match.start(), end + 1, match.group(0)))
    return found


def rewrite_assets(text: str) -> tuple[str, int]:
    found = spans(text, ASSET_OPEN)
    out = text
    for start, end, opener in reversed(found):
        indent = re.match(r'[ \t]*', opener).group(0)
        block = (
            f"{indent}location ^~ /assets/ {{\n"
            f"{indent}  # فایلِ hashدار اگر هست یک سال کش می‌شود.\n"
            f"{indent}  # اگر نیست، named location با no-store جواب می‌دهد.\n"
            f"{indent}  # `always` اینجا ممنوع است: ۴۰۴ را هم یک‌ساله می‌کند و مرورگر\n"
            f"{indent}  # «Failed to fetch dynamically imported module» را تا یک سال تکرار می‌کند.\n"
            f"{indent}  try_files $uri @ghelgheli_asset_miss;\n"
            f"{indent}  expires 1y;\n"
            f"{indent}  add_header Cache-Control \"public, max-age=31536000, immutable\";\n"
            f"{indent}}}"
        )
        out = out[:start] + block + out[end:]
    return out, len(found)


def rewrite_ml(text: str) -> tuple[str, int]:
    found = spans(text, ML_OPEN)
    out = text
    changed = 0
    for start, end, _opener in reversed(found):
        block = out[start:end]
        new = block.replace(
            'try_files $uri =404;',
            'try_files $uri @ghelgheli_asset_miss;',
        )
        new = new.replace(
            'add_header Cache-Control "public, max-age=2592000" always;',
            'add_header Cache-Control "public, max-age=2592000";',
        )
        if new != block:
            changed += 1
        out = out[:start] + new + out[end:]
    return out, changed


NAMED_BLOCK = (
    "  location @ghelgheli_asset_miss {\n"
    "    internal;\n"
    "    default_type text/plain;\n"
    "    add_header Cache-Control \"no-store\" always;\n"
    "    add_header X-GG-Asset \"miss\" always;\n"
    "    return 404;\n"
    "  }"
)


def ensure_named(text: str) -> tuple[str, int]:
    # بلوکِ قبلی را هم نو کن تا هدرِ تشخیصیِ X-GG-Asset جا بماند.
    out = text
    replaced = 0
    for start, end, _opener in reversed(spans(out, NAMED_OPEN)):
        line = out.rfind('\n', 0, start) + 1
        out = out[:line] + NAMED_BLOCK + out[end:]
        replaced += 1
    found = spans(out, SERVER_OPEN)
    inserted = 0
    for start, end, _opener in reversed(found):
        body = out[start:end]
        if '@ghelgheli_asset_miss' not in body:
            continue
        if NAMED_OPEN.search(body):
            continue
        brace = end - 1
        out = out[:brace] + "\n" + NAMED_BLOCK + "\n" + out[brace:]
        inserted += 1
    return out, replaced + inserted


def transform(text: str) -> str:
    text, _assets = rewrite_assets(text)
    text, _ml = rewrite_ml(text)
    text, _named = ensure_named(text)
    return text


def under_nginx(path: str) -> bool:
    real = os.path.realpath(path)
    return real.startswith('/etc/nginx/')


def write_atomic(path: str, text: str) -> None:
    # فایلِ موقت هرگز داخلِ sites-enabled/conf.d نمی‌ماند؛ nginx آن را
    # به‌عنوانِ vhostِ دوم می‌خواند.
    if under_nginx(path):
        tmp = f'/tmp/nginx-asset-cache-{os.getpid()}.tmp'
    else:
        tmp = path + '.asset-cache.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(text)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def backup(path: str) -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    dest = os.path.join(
        BACKUP_DIR,
        os.path.basename(path) + '.' + time.strftime('%Y%m%d-%H%M%S') + '.asset-cache',
    )
    shutil.copy2(path, dest)
    return dest


def nginx_ok() -> bool:
    if shutil.which('nginx') is None:
        return True
    proc = subprocess.run(['nginx', '-t'], capture_output=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode('utf-8', 'replace'))
        return False
    return True


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        sys.stderr.write('usage: nginx-asset-cache.py <nginx-site-file>\n')
        return 2
    path = argv[1]
    if not os.path.isfile(path):
        print(f'  nginx asset-cache: فایل نیست، رد شد ({path})')
        return 0
    original = open(path, encoding='utf-8').read()
    try:
        updated = transform(original)
    except ValueError as exc:
        sys.stderr.write(f'  nginx asset-cache: {exc}\n')
        return 1
    if updated == original:
        if 'immutable" always' in original:
            sys.stderr.write('  nginx asset-cache: بلوکِ assets شناخته نشد ولی immutable always هنوز هست\n')
            return 1
        print(f'  nginx asset-cache: از قبل درست است ({path})')
        return 0
    if 'location @ghelgheli_asset_miss' not in updated:
        sys.stderr.write('  nginx asset-cache: named location ساخته نشد\n')
        return 1
    if 'immutable" always' in updated:
        sys.stderr.write('  nginx asset-cache: immutable still marked always\n')
        return 1
    saved = None
    if under_nginx(path):
        saved = backup(path)
    write_atomic(path, updated)
    if under_nginx(path) and not nginx_ok():
        if saved:
            shutil.copy2(saved, path)
        sys.stderr.write('  nginx asset-cache: nginx -t رد شد — فایل برگشت\n')
        return 1
    print(f'  nginx asset-cache: ۴۰۴ِ دارایی دیگر کش نمی‌شود ({path})')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
