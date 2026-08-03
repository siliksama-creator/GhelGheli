# -*- coding: utf-8 -*-
"""مدل اقتصادی گذر نبرد (Battle Pass) — قبل از نوشتن کد، عدد در بیاور.

هدف: مسیر رایگان جذاب باشد ولی تقریباً بدون خرج نقدی؛ مسیر پولی ارزشِ
درک‌شده‌اش خیلی بیشتر از قیمتش باشد ولی هزینهٔ واقعی‌اش کمتر از درآمد.
"""
SEASON_DAYS = 42          # ۶ هفته
TIERS = 50
PLUS_PRICE = 59000        # قیمت جدید پلاس (شامل گذر نبرد)

# ── مسیر رایگان ────────────────────────────────────────────────────────
# نقدی خیلی کم (خواستهٔ مالک)، بیشتر امتیاز و چرخش.
free = {
    'points_total': 3000,      # مجموع امتیاز در کل فصل
    'spins_total': 12,         # چرخش گردونه
    'cash_total': 5000,        # ۵ هزار تومان در کل ۶ هفته — نمادین
    'shop_items': 1,           # یک آیتم ارزان
}
# ── مسیر پلاس ──────────────────────────────────────────────────────────
paid = {
    'points_total': 12000,
    'spins_total': 45,
    'cash_total': 35000,
    'shop_items': 5,           # شامل یکی گران
}

SPIN_EV = 0.80              # تومان به ازای هر چرخش (محاسبهٔ قبلی)
ITEM_AVG_NEW = 15000        # میانگین قیمت جدید آیتم (بعد از ارزان‌سازی)
ITEM_REAL_COST = 0          # آیتم ظاهری = هزینهٔ واقعی صفر

def cost(p, item_price):
    return {
        'cash': p['cash_total'],
        'spins_ev': round(p['spins_total'] * SPIN_EV),
        'items_perceived': p['shop_items'] * item_price,
        'items_real': p['shop_items'] * ITEM_REAL_COST,
    }

print("="*66)
print(f"گذر نبرد — فصل {SEASON_DAYS} روزه، {TIERS} پله")
print("="*66)
for name, p in [('رایگان', free), ('پلاس', paid)]:
    c = cost(p, ITEM_AVG_NEW)
    real = c['cash'] + c['spins_ev'] + c['items_real']
    perceived = c['cash'] + c['spins_ev'] + c['items_perceived'] + p['points_total']//10
    print(f"\n▸ مسیر {name}")
    print(f"   امتیاز: {p['points_total']:,}   چرخش: {p['spins_total']}   آیتم: {p['shop_items']}")
    print(f"   هزینهٔ واقعی برای شما : {real:,} تومان")
    print(f"      نقدی {c['cash']:,} + چرخش {c['spins_ev']:,} + آیتم {c['items_real']:,}")
    print(f"   ارزش درک‌شدهٔ کاربر   : {perceived:,} تومان")

pc = cost(paid, ITEM_AVG_NEW)
paid_real = pc['cash'] + pc['spins_ev'] + pc['items_real']
print("\n" + "="*66)
print(f"قیمت پلاس (شامل گذر): {PLUS_PRICE:,} تومان")
print(f"هزینهٔ واقعی مسیر پلاس: {paid_real:,} تومان")
print(f"سود ناخالص هر خریدار : {PLUS_PRICE - paid_real:,} تومان  ({(PLUS_PRICE-paid_real)/PLUS_PRICE*100:.0f}٪ حاشیه)")
gw = 1000*0.02*PLUS_PRICE/1000
print("="*66)
print("\nسناریو: ۱۰٬۰۰۰ کاربر فعال")
for rate in (0.02, 0.05, 0.10):
    buyers = int(10000*rate)
    rev = buyers*PLUS_PRICE
    cst = buyers*paid_real
    free_cost = (10000-buyers)*(free['cash_total']+round(free['spins_total']*SPIN_EV))
    print(f"  نرخ تبدیل {rate*100:4.0f}٪ → {buyers:5,} خریدار | درآمد {rev:12,} | هزینهٔ پلاس {cst:9,} | هزینهٔ رایگان {free_cost:10,} | خالص {rev-cst-free_cost:12,} تومان")
