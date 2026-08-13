#!/usr/bin/env python3
"""بازتولیدِ زندهٔ شکایتِ مالک: «عدد ربات پایین‌تر است ولی راند را می‌برد».

    python3 tools/probe_duel_bot.py <mobile> <password>

قاعدهٔ این پروژه: قبل از تغییرِ هر آستانه‌ای، اول بازتولید کن. این ابزار
یک بازیِ واقعیِ ربات را از طریقِ همان سوکتی که اپ استفاده می‌کند اجرا
می‌کند و برای هر راند مقایسه می‌کند:

    عددی که کاربر می‌بیند   در برابر   برنده‌ای که سرور اعلام می‌کند

اگر ناسازگاری باشد، دقیقاً همان‌جا چاپ می‌شود.
"""
import json
import sys
import time
import urllib.request

import socketio

BASE = 'https://api.ghelghelishop.ir'
MOB = sys.argv[1] if len(sys.argv) > 1 else ''
PW = sys.argv[2] if len(sys.argv) > 2 else ''
if not MOB or not PW:
    print('usage: probe_duel_bot.py <mobile> <password>')
    sys.exit(2)


def post(path, body, token=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json',
                 **({'Authorization': 'Bearer ' + token} if token else {})},
        method='POST')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode() or '{}')


def get(path, token):
    req = urllib.request.Request(
        BASE + path, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode() or '{}')


tok = post('/api/auth/login', {'mobile': MOB, 'password': PW})['token']
print('ورود موفق')

duel = get('/api/card-duel', tok)
cards = duel.get('cards') or []
print(f'کارت‌های قابل بازی: {len(cards)}')
if len(cards) < 5:
    print('⚠️ کمتر از پنج کارت — ربات با ترکیب استارتر بازی می‌کند')
else:
    ids = [c['cardTypeId'] for c in cards[:5]]
    post('/api/card-duel/deck', {'cardTypeIds': ids}, tok)
    print('ترکیب ذخیره شد')

sio = socketio.Client(reconnection=False)
state = {'rounds': [], 'me': None, 'done': False, 'deck': [], 'score': None,
         'room': None}


@sio.event
def connect():
    # نامِ رویدادها باید مو‌به‌مو همان چیزی باشد که اپ می‌فرستد
    # (game_session.dart:455) وگرنه سرور اتاق نمی‌سازد و تست بی‌صدا
    # صفر راند می‌گیرد — که با «باگ نیست» اشتباه گرفته می‌شود.
    sio.emit('game:play_bot', {'gameId': 'card_duel'})


@sio.on('game:start')
def on_start(d):
    state['me'] = d.get('yourSymbol')
    state['room'] = d.get('roomId') or d.get('id')
    s = d.get('state') or {}
    state['deck'] = s.get('myDeck') or []
    print(f"نمادِ من: {state['me']} · کارت‌های دستم: {len(state['deck'])}")
    play(s)


def play(s):
    remaining = [str(x) for x in (s.get('myRemainingCardIds') or [])]
    if not remaining or s.get('iChose'):
        return
    sio.emit('game:move', {'roomId': state.get('room'),
                           'move': {'cardId': remaining[0]}})


@sio.on('game:update')
def on_update(d):
    s = d.get('state') or d
    last = s.get('lastRound')
    if last and last.get('round') not in [r.get('round') for r in state['rounds']]:
        state['rounds'].append(last)
    state['score'] = s.get('score')
    if not s.get('iChose'):
        time.sleep(0.35)
        play(s)


@sio.on('game:over')
def on_over(d):
    s = d.get('state') or {}
    last = s.get('lastRound')
    if last and last.get('round') not in [r.get('round') for r in state['rounds']]:
        state['rounds'].append(last)
    state['score'] = s.get('score') or state['score']
    state['done'] = True


sio.connect(BASE, transports=['websocket'],
            headers={'Authorization': 'Bearer ' + tok},
            auth={'token': tok})

for _ in range(600):
    if state['done']:
        break
    time.sleep(0.1)
sio.disconnect()

me = state['me'] or 'X'
other = 'O' if me == 'X' else 'X'
print('\n' + '=' * 70)
print(f'  {len(state["rounds"])} راند · نماد من: {me}')
print('=' * 70)

bad = 0
for r in sorted(state['rounds'], key=lambda x: x.get('round', 0)):
    my_power = r.get(f'power{me}')
    op_power = r.get(f'power{other}')
    my_focus = r.get(f'focusStat{me}')
    op_focus = r.get(f'focusStat{other}')
    winner = r.get('winner')
    label = 'من' if winner == me else ('ربات' if winner == other else 'مساوی')

    # ناسازگاری = برنده کسی است که عددِ نمایشیِ کمتری دارد
    mismatch = ''
    if winner == me and my_power < op_power:
        mismatch = '  ⛔ من بردم ولی عددم کمتر است'
        bad += 1
    if winner == other and op_power < my_power:
        mismatch = '  ⛔ ربات برد ولی عددش کمتر است'
        bad += 1

    print(f"راند {r.get('round')} · {r.get('focusLabel')}")
    print(f"   قدرت:  من {my_power}  |  ربات {op_power}")
    print(f"   ویژگی: من {my_focus}  |  ربات {op_focus}")
    print(f"   برنده: {label}{mismatch}")

print(f"\nامتیاز نهایی: {state['score']}")
print(f"ناسازگاریِ عدد/برنده: {bad}")
if bad:
    print('\n⛔ بازتولید شد — عددی که کاربر می‌بیند با برنده نمی‌خواند.')
else:
    print('\n✅ عدد و برنده در همهٔ راندها سازگارند.')
