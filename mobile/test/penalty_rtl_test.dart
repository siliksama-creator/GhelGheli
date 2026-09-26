// باگ آینه‌ای بودن پنالتی — «به راست میزنیم به چپ میزنه».
//
// ═══════════════════════════════════════════════════════════════════════════
// علت باگ
// ═══════════════════════════════════════════════════════════════════════════
//
// کل اپ داخل `Directionality(textDirection: TextDirection.rtl)` است
// (main.dart). یک `Row` معمولی این جهت را به ارث می‌برد، پس فرزند اول در
// سمت **راست** رندر می‌شود.
//
// شبکهٔ لمسیِ دروازه با `Row` ساخته شده بود:
//
//     for (var col = 0; col < 3; col++)  →  ناحیهٔ ۰ در سمت راست
//
// ولی نقاشِ زمین (`_PitchPainter.zoneCenter`) ریاضیِ چپ‌به‌راست دارد:
//
//     x = gl + gw * (col + 0.5) / 3      →  ناحیهٔ ۰ در سمت چپ
//
// نتیجه: کاربر گوشهٔ راست را لمس می‌کرد، ناحیهٔ ۰ ثبت می‌شد، و توپ به
// گوشهٔ **چپ** می‌رفت. دقیقاً چیزی که مالک دید. دروازه‌بان هم آینه‌ای
// شیرجه می‌زد.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ تعدادِ **ستون‌ها** عاملِ این باگ است، نه تعدادِ ردیف‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// وقتی هندسه از ۳×۳ به **۳ ستون × ۲ ردیف** رفت، شماره‌گذاریِ ستونی دست‌نخورده
// ماند (ستون = `zone % 3`) و فقط یک ردیف کم شد. پس این تست هنوز با همان شدت
// معتبر است و نباید برای «سبز شدن» سست شود.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const int kZoneCols = 3;
const int kZoneRows = 2;
const int kZoneCount = kZoneCols * kZoneRows;

/// همان ریاضیِ `_PitchPainter.zoneCenter` — مرکز افقیِ یک ناحیه.
double painterX(int zone, double goalLeft, double goalWidth) {
  final col = zone % kZoneCols;
  return goalLeft + goalWidth * (col + 0.5) / kZoneCols;
}

void main() {
  const gl = 20.0, gw = 300.0; // دروازه از x=20 تا x=320

  group('ریاضیِ نقاش', () {
    test('ستون ۰ سمت چپ است، ستون ۲ سمت راست', () {
      expect(painterX(0, gl, gw), lessThan(painterX(1, gl, gw)));
      expect(painterX(1, gl, gw), lessThan(painterX(2, gl, gw)));
    });

    test('ناحیه‌های هم‌ستون، x یکسان دارند', () {
      // ستون ۰ در هر دو ردیف: ناحیهٔ ۰ (بالا) و ۳ (پایین)
      expect(painterX(0, gl, gw), painterX(3, gl, gw));
      // ستون ۲ در هر دو ردیف: ناحیهٔ ۲ (بالا) و ۵ (پایین)
      expect(painterX(2, gl, gw), painterX(5, gl, gw));
    });
  });

  group('شبکهٔ لمسی باید LTR باشد، نه RTL', () {
    /// یک شبکهٔ ۳×۲ می‌سازد و مرکز افقیِ هر ناحیه را برمی‌گرداند.
    Future<Map<int, double>> centersOf(
        WidgetTester tester, TextDirection? forced) async {
      final keys = {for (var z = 0; z < kZoneCount; z++) z: GlobalKey()};
      Widget grid = Column(
        children: [
          for (var r = 0; r < kZoneRows; r++)
            Expanded(
              child: Row(
                children: [
                  for (var c = 0; c < kZoneCols; c++)
                    Expanded(
                      child: Container(
                          key: keys[r * kZoneCols + c], color: Colors.red),
                    ),
                ],
              ),
            ),
        ],
      );
      if (forced != null) {
        grid = Directionality(textDirection: forced, child: grid);
      }

      await tester.pumpWidget(
        // شبیه‌سازی اپ واقعی: همه‌چیز داخل RTL
        Directionality(
          textDirection: TextDirection.rtl,
          child: MediaQuery(
            data: const MediaQueryData(size: Size(320, 240)),
            child: SizedBox(width: 320, height: 240, child: grid),
          ),
        ),
      );
      return {
        for (var z = 0; z < kZoneCount; z++)
          z: tester.getCenter(find.byKey(keys[z]!)).dx,
      };
    }

    testWidgets('بدون تصریح جهت، شبکه آینه می‌شود — همان باگ', (t) async {
      final c = await centersOf(t, null);
      expect(c[0]!, greaterThan(c[2]!),
          reason: 'این همان باگ است: ناحیهٔ ۰ به‌جای چپ، راست رندر شده');
    });

    testWidgets('با LTR صریح، شبکه با نقاش هم‌جهت می‌شود', (t) async {
      final c = await centersOf(t, TextDirection.ltr);
      expect(c[0]!, lessThan(c[1]!));
      expect(c[1]!, lessThan(c[2]!));

      final painterOrder = [0, 1, 2]
        ..sort((a, b) => painterX(a, gl, gw).compareTo(painterX(b, gl, gw)));
      final gridOrder = [0, 1, 2]..sort((a, b) => c[a]!.compareTo(c[b]!));
      expect(gridOrder, painterOrder,
          reason: 'ترتیب افقیِ شبکه و نقاش باید یکی باشد');
    });

    testWidgets('هر دو ردیف هم‌جهت‌اند', (t) async {
      final c = await centersOf(t, TextDirection.ltr);
      for (final row in [0, 1]) {
        final base = row * kZoneCols;
        expect(c[base]!, lessThan(c[base + 1]!),
            reason: 'ردیف $row باید چپ‌به‌راست باشد');
        expect(c[base + 1]!, lessThan(c[base + 2]!));
      }
      // ستونِ اول در هر دو ردیف باید روی یک x باشد
      expect(c[0], c[3]);
    });
  });

  group('کد منبع', () {
    final src =
        File('lib/screens/user/games/penalty_board.dart').readAsStringSync();

    test('شبکهٔ پنالتی صریحاً LTR اعلام شده', () {
      expect(src.contains('TextDirection.ltr'), isTrue,
          reason: 'بدون Directionality صریح، شبکه از RTL اپ ارث می‌برد و '
              'آینه می‌شود');
    });

    test('نقاش هم در همان جهت می‌کشد', () {
      expect(src.contains('gw * (c + 0.5) / kZoneCols'), isTrue,
          reason: 'ریاضی نقاش باید ستون را مستقیم به x نگاشت کند');
    });

    test('هندسه از ثابت می‌آید، نه عددِ پراکنده', () {
      // نگهبان: اگر کسی دوباره `/ 3` بنویسد، تغییرِ بعدیِ هندسه همان باگِ
      // تقسیمِ اشتباه را برمی‌گرداند (سطر تقسیم‌بر ستون).
      expect(src.contains('const int kZoneCols = 3;'), isTrue);
      expect(src.contains('const int kZoneRows = 2;'), isTrue);
      expect(RegExp(r'gt \+ gh \* \(r \+ 0\.5\) / kZoneRows').hasMatch(src),
          isTrue, reason: 'تقسیمِ سطر باید بر تعدادِ ردیف‌ها باشد');
    });
  });
}
