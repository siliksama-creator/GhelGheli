import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_test/flutter_test.dart';

/// ═══════════════════════════════════════════════════════════════════════
/// گاردِ «صدا وسطِ دوئل قطع نشود»
/// ═══════════════════════════════════════════════════════════════════════
///
/// ── باگی که این گارد جلویش را می‌گیرد ──
///
/// کاربر گزارش داد وسطِ بازیِ کارت صدا قطع می‌شود. ریشه‌اش پیش‌فرضِ
/// `audioplayers` روی اندروید بود: `AndroidAudioFocus.gain`، یعنی
/// «من تنها منبعِ صدای دستگاهم».
///
/// ما همزمان دو چیز پخش می‌کنیم — موزیکِ لوپِ دوئل و افکت‌های کوتاه — و
/// با آن پیش‌فرض این زنجیره در هر برخورد اجرا می‌شد (از سورسِ
/// `audioplayers_android`):
///
///   play() → maybeRequestAudioFocus() → requestAudioFocus(GAIN)
///          → دارندهٔ قبلی (موزیکِ خودمان) LOSS می‌گیرد → پکیج pause‌اش می‌کند
///   onCompletion() → releaseMode != LOOP ⇒ stop()
///          → focusManager.handleStop() → abandonAudioFocusRequest()
///
/// یعنی هر افکت تمرکز را از موزیک می‌قاپید و موقعِ تمام‌شدن رهایش می‌کرد.
/// موزیک هم خودش برنمی‌گشت. در یک مسابقهٔ پنج‌راندی ۱۱ نقطهٔ پخش داریم
/// (بدونِ تیک‌های ثانیه‌شمار)، پس صدا خیلی زود می‌مرد.
///
/// ── چرا تست به این شکل نوشته شده ──
///
/// پخشِ واقعی در محیطِ تست ممکن نیست (دستگاهِ صوتی و کانالِ پلتفرم وجود
/// ندارد). پس به‌جای رفتار، **قرارداد** را می‌سنجیم: پیکربندی‌ای که به
/// پخش‌کننده‌ها می‌دهیم باید روی اندروید به `AndroidAudioFocus.none`
/// ترجمه شود. این دقیقاً همان بیتی است که باگ را می‌ساخت، و اگر روزی
/// کسی `focus` را به `gain` برگرداند این تست قرمز می‌شود.
void main() {
  group('تمرکزِ صوتیِ بازی‌ها', () {
    test('پیکربندیِ ما روی اندروید تمرکز را «none» می‌کند', () {
      final ctx = AudioContextConfig(
        focus: AudioContextConfigFocus.mixWithOthers,
      ).buildAndroid();

      expect(
        ctx.audioFocus,
        AndroidAudioFocus.none,
        reason: 'هر چیزی جز none یعنی افکت‌ها موزیکِ دوئل را قطع می‌کنند',
      );
    });

    test('پیش‌فرضِ پکیج همان چیزی است که باگ را می‌ساخت', () {
      // این تست از نوعِ «مستندسازیِ اجرایی» است: اگر روزی پکیج پیش‌فرضش را
      // عوض کند، اینجا می‌فهمیم و می‌توانیم توضیحِ بالا را به‌روز کنیم.
      final fallback = AudioContextConfig().buildAndroid();
      expect(
        fallback.audioFocus,
        AndroidAudioFocus.gain,
        reason: 'اگر این عوض شد، دلیلِ وجودِ این گارد را بازبینی کن',
      );
    });

    test('حالتِ «کم‌کردنِ صدای بقیه» کافی نیست', () {
      // duckOthers وسوسه‌انگیز است ولی مشکل را حل نمی‌کند: باز هم یک
      // AudioFocusRequest می‌فرستد و باز هم در onCompletion رها می‌شود.
      final duck = AudioContextConfig(
        focus: AudioContextConfigFocus.duckOthers,
      ).buildAndroid();
      expect(duck.audioFocus, isNot(AndroidAudioFocus.none));
    });
  });
}
