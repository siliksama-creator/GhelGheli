import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/assets.dart';
import '../core/share_invite.dart';
import '../theme/tokens.dart';
import '../widgets/avatar_image.dart';

/// کارت گرافیکی فوق‌العاده شیک استوری برای اشتراک‌گذاری پیروزی و جذب کاربر
class VictoryShareDialog extends StatelessWidget {
  const VictoryShareDialog({
    super.key,
    required this.nickname,
    this.avatarKey,
    this.avatarUrl,
    this.hasPlus = false,
    required this.gameTitle,
    required this.scoreText,
    required this.referralCode,
    this.pointsEarned = 25,
  });

  final String nickname;
  final String? avatarKey;
  final String? avatarUrl;
  final bool hasPlus;
  final String gameTitle;
  final String scoreText;
  final String referralCode;
  final int pointsEarned;

  static Future<void> show(
    BuildContext context, {
    required String nickname,
    String? avatarKey,
    String? avatarUrl,
    bool hasPlus = false,
    required String gameTitle,
    required String scoreText,
    required String referralCode,
    int pointsEarned = 25,
  }) {
    return showDialog(
      context: context,
      builder: (ctx) => VictoryShareDialog(
        nickname: nickname,
        avatarKey: avatarKey,
        avatarUrl: avatarUrl,
        hasPlus: hasPlus,
        gameTitle: gameTitle,
        scoreText: scoreText,
        referralCode: referralCode,
        pointsEarned: pointsEarned,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shareMsg = 'من در بازی «$gameTitle» قلقلی با نتیجه $scoreText برنده شدم! 🏆\n\nبا کد معرف من ثبت‌نام کن و جایزه نقدی ببر:\nکد معرف: $referralCode\nhttps://user.ghelghelishop.ir';

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── کارت گرافیکی استوری (۹:۱۶ Aspect Ratio Look) ──
            Container(
              width: 320,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                gradient: const LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [
                    Color(0xFF1E3A8A),
                    Color(0xFF0F172A),
                    Color(0xFF090D16),
                  ],
                ),
                border: Border.all(color: const Color(0xFFFFD166).withValues(alpha: 0.6), width: 1.8),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF1E3A8A).withValues(alpha: 0.5),
                    blurRadius: 28,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Logo & Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Image.asset('assets/brand/logo.webp', width: 36, height: 36, fit: BoxFit.contain),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          color: const Color(0xFFFFD166).withValues(alpha: 0.20),
                          border: Border.all(color: const Color(0xFFFFD166)),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.stars_rounded, size: 14, color: Color(0xFFFFD166)),
                            SizedBox(width: 4),
                            Text('پیروزی قلقلی', style: TextStyle(color: Color(0xFFFFD166), fontSize: 11, fontWeight: FontWeight.w900)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // Avatar & Player
                  AvatarImage(imageUrl: avatarUrl, keyName: avatarKey, radius: 34),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(nickname, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
                      if (hasPlus) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.star_rounded, size: 18, color: Color(0xFFFFD166)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('قهرمان بازی $gameTitle', style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                  const SizedBox(height: 16),

                  // Score & Trophy Box
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      color: Colors.white.withValues(alpha: 0.05),
                      border: Border.all(color: const Color(0xFF22E7A6).withValues(alpha: 0.4)),
                    ),
                    child: Column(
                      children: [
                        Text(scoreText, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Color(0xFF22E7A6))),
                        const SizedBox(height: 4),
                        Text('+${faNum(pointsEarned)} امتیاز لیگ دریافت شد',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFFFD166))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Referral Code Footer
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      color: const Color(0xFF1E293B),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('کد معرف من:', style: TextStyle(fontSize: 11, color: Color(0xFFCBD5E1))),
                        Text(referralCode, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF38BDF8), letterSpacing: 2)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Action Buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF22E7A6),
                    foregroundColor: const Color(0xFF00281D),
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: const Icon(Icons.share_rounded, size: 18),
                  label: const Text('اشتراک‌گذاری در استوری و شبکه‌ها', style: TextStyle(fontWeight: FontWeight.w900)),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: shareMsg));
                    ShareInvite.shareText(shareMsg);
                    Navigator.pop(context);
                  },
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  style: IconButton.styleFrom(backgroundColor: Colors.white12),
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
