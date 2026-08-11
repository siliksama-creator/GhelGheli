// Versus bar: both players with avatars, a live 15s countdown ring on the
// player who is on move, and tap-to-open public profile for the opponent.
// Split out of game_scaffold.dart to keep each file small.
import 'package:flutter/material.dart';
import '../../../api_client.dart';
import '../../../core/cosmetics.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/avatar_image.dart';
import '../../shared/public_profile_sheet.dart';
import 'game_session.dart';

class VersusBar extends StatelessWidget {
  const VersusBar({
    super.key,
    required this.session,
    required this.api,
    required this.symbols,
    required this.accent,
  });

  final GameSession session;
  final ApiClient api;
  final Map<String, String> symbols;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xs),
      child: Row(
        children: [
          _Side(session: session, api: api, symbol: 'X', symbols: symbols, accent: accent),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Gaps.xxs),
            child: Text('VS',
                style: theme.textTheme.labelLarge
                    ?.copyWith(color: theme.colorScheme.outline)),
          ),
          _Side(session: session, api: api, symbol: 'O', symbols: symbols, accent: accent),
        ],
      ),
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({
    required this.session,
    required this.api,
    required this.symbol,
    required this.symbols,
    required this.accent,
  });

  final GameSession session;
  final ApiClient api;
  final String symbol;
  final Map<String, String> symbols;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final info = session.playerInfo(symbol);
    final isBot = info?['isBot'] == true;
    final isMe = session.mySymbol == symbol;
    final active = session.turn == symbol && session.phase == GamePhase.playing;
    final id = info?['id'];
    // Only real users have a profile worth opening.
    final canOpen = !isBot && !isMe && id != null;

    return Expanded(
      child: InkWell(
        borderRadius: Corners.rMd,
        onTap: canOpen ? () => showPublicProfile(context, api, id) : null,
        child: AnimatedContainer(
          duration: Motion.fast,
          padding: const EdgeInsets.symmetric(vertical: Gaps.xs, horizontal: 4),
          decoration: BoxDecoration(
            borderRadius: Corners.rMd,
            color: active ? accent.withValues(alpha: 0.14) : Colors.transparent,
            border: Border.all(
              color: active ? accent : Colors.transparent,
              width: 1.4,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Portrait(
                session: session,
                info: info,
                isBot: isBot,
                active: active,
                accent: accent,
                fallback: symbols[symbol] ?? symbol,
              ),
              Gaps.vXxs,
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // ═══════════════════════════════════════════════════
                  // لولِ حریف، حین بازی
                  // ═══════════════════════════════════════════════════
                  //
                  // درخواست مالک: «در حین بازی هم لول بقیه رو بشه دید».
                  //
                  // سرور آن را داخل `players` می‌فرستد (همان‌جا که نام
                  // و آواتار می‌آید)، پس هیچ درخواستِ اضافه‌ای لازم
                  // نیست. ربات لول ندارد و نشانش هم نباید بیاید —
                  // وگرنه «Level 0» کنارِ ربات، معنیِ اشتباه می‌دهد.
                  Flexible(
                    child: DisplayName(
                      name: isMe ? 'شما' : session.nameOf(symbol),
                      cosmetics: info?['cosmetics'] is Map ? info!['cosmetics'] as Map : null,
                      level: !isBot && info?['level'] != null
                          ? (info!['level'] as num?)?.toInt()
                          : null,
                      style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (canOpen) ...[
                    const SizedBox(width: 2),
                    Icon(Icons.info_outline_rounded,
                        size: 12, color: theme.colorScheme.outline),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Avatar with the countdown ring drawn around it while this player is on move.
class _Portrait extends StatelessWidget {
  const _Portrait({
    required this.session,
    required this.info,
    required this.isBot,
    required this.active,
    required this.accent,
    required this.fallback,
  });

  final GameSession session;
  final Map? info;
  final bool isBot;
  final bool active;
  final Color accent;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    // ═══════════════════════════════════════════════════════════════════
    // چرا اینجا به `session.clock` گوش می‌دهیم و نه به خودِ `session`
    // ═══════════════════════════════════════════════════════════════════
    //
    // این تنها ویجتی است که شمارش معکوس را نشان می‌دهد. تیکِ ساعت
    // به‌جای اعلانِ سراسری، فقط `clock` را اعلان می‌دهد (توضیح کامل در
    // game_session.dart)، پس این `ListenableBuilder` لازم است تا عدد
    // همچنان هر ثانیه به‌روز شود.
    //
    // سودش این است که بازسازی در همین زیردرختِ کوچک محبوس می‌ماند و
    // تختهٔ بازی — که ۶۴ خانه یا یک نقاشِ کامل دارد — دست‌نخورده
    // می‌ماند.
    return ListenableBuilder(
      listenable: session.clock,
      builder: (context, _) => _buildPortrait(context),
    );
  }

  Widget _buildPortrait(BuildContext context) {
    const size = 44.0;
    final total = session.turnSeconds <= 0 ? 15 : session.turnSeconds;
    final left = session.secondsLeft;
    final progress = active ? (left / total).clamp(0.0, 1.0) : 0.0;
    final urgent = active && left <= 5 && left > 0;
    final ringColor = urgent ? const Color(0xFFEF4444) : accent;

    return SizedBox(
      width: size + 12,
      height: size + 12,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (active)
            SizedBox(
              width: size + 10,
              height: size + 10,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: progress, end: progress),
                duration: Motion.fast,
                builder: (_, v, __) => CircularProgressIndicator(
                  value: v,
                  strokeWidth: 3,
                  backgroundColor:
                      Theme.of(context).colorScheme.outline.withValues(alpha: 0.22),
                  valueColor: AlwaysStoppedAnimation(ringColor),
                ),
              ),
            ),
          if (isBot)
            Icon(Icons.smart_toy_rounded, size: 26, color: accent)
          else if (info?['profileImageUrl'] != null ||
              info?['profileAvatarKey'] != null)
            AvatarImage(
              imageUrl: info?['profileImageUrl'],
              keyName: info?['profileAvatarKey'],
              radius: (size - 8) / 2,
            )
          else
            Image.asset(
                fallback,
                width: 34,
                height: 34,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => Icon(Icons.person_rounded, size: 24, color: accent),
              ),
          if (active)
            Positioned(
              bottom: 0,
              child: AnimatedScale(
                duration: Motion.fast,
                scale: urgent ? 1.15 : 1.0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: ringColor,
                    borderRadius: Corners.rPill,
                  ),
                  child: Text(
                    faNum(left),
                    style: const TextStyle(
                      fontSize: 11,
                      height: 1.2,
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
