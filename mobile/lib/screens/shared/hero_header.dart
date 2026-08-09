import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../core/money.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar_image.dart';
import '../../core/cosmetics.dart';

/// Compact and ultra-sleek dashboard hero header: greeting, avatar, points, wallet strip.
class HeroHeader extends StatelessWidget {
  final int points;
  final String nickname;
  final Map<String, dynamic>? nextReward;
  final Map<String, dynamic>? user;
  final Map<String, dynamic>? cosmetics;
  final VoidCallback? onOpenProfile;
  final VoidCallback? onOpenWallet;

  const HeroHeader({
    super.key,
    required this.points,
    required this.nickname,
    this.nextReward,
    this.user,
    this.cosmetics,
    this.onOpenProfile,
    this.onOpenWallet,
  });

  static const _required = <String, String>{
    'first_name': 'نام',
    'last_name': 'نام خانوادگی',
    'age': 'سن',
    'province': 'استان',
    'city': 'شهر',
    'bank_account': 'شماره کارت',
  };

  List<String> get _missing {
    final u = user;
    if (u == null) return const [];
    return _required.entries
        .where((e) => '${u[e.key] ?? ''}'.trim().isEmpty)
        .map((e) => e.value)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final required = NumberParser.toInt(nextReward?['required_points']);
    final remaining = required > points ? required - points : 0;
    final progress = required > 0 ? (points / required).clamp(0.0, 1.0) : 0.0;
    final missing = _missing;
    final done = _required.length - missing.length;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A2B45),
            Color(0xFF111D30),
            Color(0xFF0A1220),
          ],
        ),
        border: Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.28), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFFD700).withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.40),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── greeting + golden points Box Row ──
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: onOpenProfile,
                  borderRadius: Corners.rPill,
                  child: Row(
                    children: [
                      AvatarImage(
                        imageUrl: user?['profile_image_url'],
                        keyName: user?['profile_avatar_key'],
                        radius: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            DisplayName(
                              name: 'سلام $nickname ',
                              cosmetics: cosmetics,
                              avatarKey: user?['profile_avatar_key'],
                              maxLines: 1,
                              style: const TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white),
                            ),
                            const SizedBox(height: 2),
                            const Row(
                              children: [
                                Text('پروفایل من',
                                    style: TextStyle(
                                        color: Color(0xFFCBD5E1),
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700)),
                                SizedBox(width: 2),
                                Icon(Icons.chevron_left_rounded,
                                    size: 13, color: Color(0xFFCBD5E1)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // ── باکس طلایی درخشان امتیاز ──
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(13),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0x38FFD700),
                      Color(0x14FF9F43),
                      Color(0x24000000),
                    ],
                  ),
                  border: Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.50), width: 1.2),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFFFD700).withValues(alpha: 0.16),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          faNum(points),
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFFFFDF70),
                            height: 1.1,
                            shadows: [
                              Shadow(color: Color(0x66FFB300), blurRadius: 6),
                            ],
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.stars_rounded, size: 14, color: Color(0xFFFFDF70)),
                      ],
                    ),
                    const Text(
                      'امتیاز کل',
                      style: TextStyle(
                        color: Color(0xFFFFE599),
                        fontWeight: FontWeight.w700,
                        fontSize: 9.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // ── reward progress ──
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: Corners.rPill,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 5,
              color: const Color(0xFF22E7A6),
              backgroundColor: Colors.white.withValues(alpha: 0.12),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            nextReward == null
                ? 'هنوز جایزه‌ای تعریف نشده است'
                : remaining == 0
                    ? 'به جایزه ${nextReward!['name']} رسیدی!'
                    : 'تا جایزه ${nextReward!['name']}: ${faNum(remaining)} امتیاز',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: Colors.white70,
                fontWeight: FontWeight.w700,
                fontSize: 10.5),
          ),

          // ── ورودی کیف پول ──
          if (onOpenWallet != null) ...[
            const SizedBox(height: 7),
            _WalletStrip(
              balance: NumberParser.toInt(user?['wallet_balance']),
              onTap: onOpenWallet!,
            ),
          ],

          // ── profile completion nudge ──
          if (missing.isNotEmpty) ...[
            const SizedBox(height: 6),
            _CompletionBar(
              done: done,
              total: _required.length,
              missing: missing,
              onTap: onOpenProfile,
            ),
          ],
        ],
      ),
    );
  }
}

class _CompletionBar extends StatelessWidget {
  const _CompletionBar({
    required this.done,
    required this.total,
    required this.missing,
    this.onTap,
  });

  final int done;
  final int total;
  final List<String> missing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final shown = missing.take(2).join('، ');
    final extra = missing.length - 2;
    return Material(
      color: Colors.black.withValues(alpha: 0.25),
      borderRadius: Corners.rMd,
      child: InkWell(
        onTap: onTap,
        borderRadius: Corners.rMd,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            children: [
              const Icon(Icons.badge_outlined, size: 14, color: Color(0xFFFFD36B)),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  'تکمیل پروفایل ($done از $total): $shown${extra > 0 ? ' +$extra مورد' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700),
                ),
              ),
              const Text('تکمیل',
                  style: TextStyle(color: Color(0xFFFFD36B), fontSize: 10.5, fontWeight: FontWeight.w800)),
              const Icon(Icons.chevron_left_rounded, size: 14, color: Color(0xFFFFD36B)),
            ],
          ),
        ),
      ),
    );
  }
}

class _WalletStrip extends StatelessWidget {
  const _WalletStrip({required this.balance, required this.onTap});

  final int balance;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xFFFFD36B);
    final hasMoney = balance > 0;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: Colors.black.withValues(alpha: 0.28),
            border: Border.all(
              color: gold.withValues(alpha: hasMoney ? 0.5 : 0.22),
              width: 1.0,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          child: Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: hasMoney
                        ? const [Color(0xFFFFE9A8), Color(0xFFD4A227)]
                        : [
                            Colors.white.withValues(alpha: 0.2),
                            Colors.white.withValues(alpha: 0.1),
                          ],
                  ),
                ),
                child: Icon(
                  Icons.account_balance_wallet_rounded,
                  size: 14,
                  color: hasMoney ? const Color(0xFF6B4E00) : Colors.white70,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('کیف پول من', style: TextStyle(color: Colors.white70, fontSize: 10.5, fontWeight: FontWeight.w600)),
                      Text(
                        Money.format(balance),
                        style: TextStyle(
                          color: hasMoney ? gold : Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 3),
                      Text('تومان', style: TextStyle(color: gold.withValues(alpha: 0.8), fontSize: 9.5, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: gold.withValues(alpha: 0.18),
                  borderRadius: Corners.rPill,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(hasMoney ? 'برداشت' : 'مشاهده',
                        style: const TextStyle(color: gold, fontSize: 9.5, fontWeight: FontWeight.w800)),
                    const Icon(Icons.chevron_left_rounded, size: 12, color: gold),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
