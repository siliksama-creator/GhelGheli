// دورِ ۳۳ — منحنیِ زندهٔ ادمین برای بازی ضربه‌زن.
//
// خواستهٔ مالک: «هر تغییر ادمین بدون نیاز به بروزرسانی اپ اعمال بشه».
// صفحهٔ ضربه‌زن قبل از ساختِ موتور، منحنی را از /api/config می‌خواند و با
// copyWith روی پیکربندیِ پیش‌فرض می‌نشاند. این تست همان قرارداد را
// قفل می‌کند: هر چه ادمین فرستاد، جمعِ لول‌ها دقیقاً همان عدد است و
// سقف‌ها هیچ‌وقت خارج از محدوده نمی‌روند.
import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/screens/user/games/tap/tap_config.dart';

void main() {
  test('copyWith فقط همان فیلدهایی را عوض می‌کند که سرور فرستاده', () {
    const base = TapGameConfig();
    final cfg = base.copyWith(levelCount: 60, levelsPerDay: 3);
    expect(cfg.levelCount, 60);
    expect(cfg.levelsPerDay, 3);
    // بقیه دست‌نخورده:
    expect(cfg.totalPoints, base.totalPoints);
    expect(cfg.growthFactor, base.growthFactor);
    expect(cfg.skins, base.skins);
  });

  test('منحنیِ سفارشی دقیقاً به جمعِ امتیازِ خواسته‌شده می‌رسد', () {
    for (final spec in [
      (levelCount: 10, totalPoints: 3000, growth: 1.08),
      (levelCount: 60, totalPoints: 80000, growth: 1.04),
      (levelCount: 5, totalPoints: 1000, growth: 1.0),
    ]) {
      final cfg = TapGameConfig(
        levelCount: spec.levelCount,
        totalPoints: spec.totalPoints,
        growthFactor: spec.growth,
      );
      var sum = 0;
      for (var lv = 1; lv <= cfg.levelCount; lv++) {
        sum += cfg.requiredTaps(lv);
      }
      expect(sum, spec.totalPoints,
          reason: 'منحنی ${spec.levelCount} لولی باید دقیقاً '
              '${spec.totalPoints} شود');
    }
  });

  test('requiredTaps بیرون از محدوده قفل می‌شود (sentinel لول آخر)', () {
    const cfg = TapGameConfig(levelCount: 3, totalPoints: 300);
    expect(cfg.requiredTaps(0), cfg.requiredTaps(1));
    expect(cfg.requiredTaps(99), cfg.requiredTaps(3));
  });

  test('پیش‌فرضِ تاریخی دست‌نخورده است: ۵۰ لول، ۵۰ هزار امتیاز', () {
    // اگر این تست روزی قرمز شد یعنی کسی پیش‌فرض‌ها را بی‌دلیل عوض کرده —
    // پیش‌فرض فقط وقتی مجاز است عوض شود که سرور هم در همان کامیت عوض شود.
    const cfg = TapGameConfig();
    expect(cfg.levelCount, 50);
    expect(cfg.totalPoints, 50000);
    var sum = 0;
    for (var lv = 1; lv <= 50; lv++) {
      sum += cfg.requiredTaps(lv);
    }
    expect(sum, 50000);
  });
}
