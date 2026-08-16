import 'package:flutter/material.dart';

/// زبانِ تصویریِ مشترکِ برنامه — بدونِ ایموجی.
///
/// ── چرا این فایل وجود دارد ──
///
/// تا دورِ ۲۲، معناهایی مثل «ممنوع»، «سقفِ روزانه» یا «نبرد» با ایموجیِ
/// متنی (🚫 / 📅 / ⚔️) نوشته می‌شدند. سه ایرادِ واقعی داشت:
///
///   ۱. **ما آنها را نمی‌کشیم.** ایموجی را فونتِ سیستم‌عاملِ کاربر رسم
///      می‌کند. همان 🏆 روی سامسونگ، شیائومی، ویندوز و مرورگرها چهار شکلِ
///      متفاوت دارد — یعنی هویتِ بصریِ برنامه دستِ ما نیست.
///   ۲. **رنگ نمی‌گیرند.** ایموجی همیشه رنگیِ ثابت است و کنارِ پالتِ
///      طلایی/تیرهٔ برنامه مثل وصله دیده می‌شود. آیکونِ وکتور با
///      `currentColor` رنگ می‌گیرد.
///   ۳. **حسِ آماتور می‌دهند.** خواستهٔ صریحِ مالک در دورِ ۲۳.
///
/// تنها استثنا: **صفحهٔ چت**. آنجا ایموجی محتوایی است که کاربر خودش
/// می‌فرستد، نه عنصرِ رابطِ کاربری. آنها دست نمی‌خورند.
///
/// ── آینه بودن با وب ──
///
/// هر نامی که اینجا هست باید در `userweb/src/components/IconAsset.jsx`
/// هم باشد و همان معنی را بدهد. گاردِ `icon-parity.mjs` این را می‌سنجد.
/// عمداً از `Icons.*` متریال استفاده می‌کنیم نه SVG سفارشی: بستهٔ فونتِ
/// آیکونِ متریال از قبل در APK هست، پس این تغییر **یک بایت هم** به حجم
/// اضافه نمی‌کند — و شکلِ متریال روی همهٔ اندرویدها یکی است.
class UiIcons {
  const UiIcons._();

  /// نگاشتِ نام → آیکونِ متریال.
  ///
  /// کلیدها همان کلیدهای `PATHS` در نسخهٔ وب‌اند.
  static const Map<String, IconData> map = <String, IconData>{
    // ناوبری و عمومی
    'home': Icons.home_rounded,
    'wallet': Icons.account_balance_wallet_rounded,
    'gift': Icons.card_giftcard_rounded,
    'trophy': Icons.emoji_events_rounded,
    'game': Icons.sports_esports_rounded,
    'group': Icons.groups_rounded,
    'support': Icons.headset_mic_rounded,
    'profile': Icons.person_rounded,
    'shop': Icons.storefront_rounded,
    'bell': Icons.notifications_rounded,
    'camera': Icons.photo_camera_rounded,
    'warning': Icons.warning_amber_rounded,
    'lock': Icons.lock_rounded,
    'unlock': Icons.lock_open_rounded,
    'bulb': Icons.lightbulb_rounded,
    'check': Icons.check_rounded,
    'close': Icons.close_rounded,
    'search': Icons.search_rounded,
    'robot': Icons.smart_toy_rounded,
    'circle': Icons.circle,

    // دورِ ۲۳ — جایگزینِ ایموجی‌ها
    'ban': Icons.block_rounded,
    'calendar': Icons.event_rounded,
    'swords': Icons.sports_kabaddi_rounded,
    'shield': Icons.shield_rounded,
    'flame': Icons.local_fire_department_rounded,
    'bolt': Icons.bolt_rounded,
    'sparkle': Icons.auto_awesome_rounded,
    'football': Icons.sports_soccer_rounded,
    'handshake': Icons.handshake_rounded,
    'medal1': Icons.looks_one_rounded,
    'medal2': Icons.looks_two_rounded,
    'medal3': Icons.looks_3_rounded,
    'door': Icons.meeting_room_rounded,
    'soundOn': Icons.volume_up_rounded,
    'soundOff': Icons.volume_off_rounded,
    'party': Icons.celebration_rounded,
    'broken': Icons.heart_broken_rounded,
    'star': Icons.star_rounded,
    'key': Icons.vpn_key_rounded,
    'person': Icons.person_rounded,
    'people': Icons.people_rounded,
    'card': Icons.credit_card_rounded,
    'link': Icons.link_rounded,
    'moon': Icons.bedtime_rounded,
    'pin': Icons.push_pin_rounded,
    'chat': Icons.chat_bubble_rounded,
    'heart': Icons.favorite_rounded,
    'idcard': Icons.badge_rounded,
    'coins': Icons.monetization_on_rounded,
    'hand': Icons.back_hand_rounded,
    'crown': Icons.workspace_premium_rounded,
    'target': Icons.gps_fixed_rounded,
    'question': Icons.help_rounded,
    'ticket': Icons.confirmation_number_rounded,
    'glove': Icons.sports_mma_rounded,
  };

  static IconData of(String name) => map[name] ?? Icons.circle;
}

/// آیکونِ استانداردِ برنامه.
///
/// `size` و `color` عمداً اختیاری‌اند تا در جای‌های مختلف با
/// `IconTheme` هماهنگ شود، دقیقاً مثل `currentColor` در وب.
class UiIcon extends StatelessWidget {
  const UiIcon(this.name, {super.key, this.size = 22, this.color});

  final String name;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Icon(UiIcons.of(name), size: size, color: color);
  }
}
