
import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../core/money.dart';
import '../../../theme/colors.dart';
import '../../../theme/brand_theme.dart';
import '../../../theme/tokens.dart';
import '../../../utils/fa_date.dart';
import '../../../widgets/app_card.dart';

/// ---------------------------------------------------------------------------
///  کارت موجودی — قطعهٔ اصلی صفحهٔ کیف پول
/// ---------------------------------------------------------------------------
///
/// شبیه یک کارت بانکی واقعی طراحی شده: گرادیان عمیق، نقش‌مایهٔ منحنی، تراشهٔ
/// طلایی و شمارهٔ ماسک‌شده. هدف این است که کاربر در نگاه اول بفهمد این «پول
/// واقعی» است، نه یک شمارندهٔ امتیاز دیگر.
class WalletBalanceCard extends StatefulWidget {
  final int balance;
  final int totalIn;
  final int totalOut;
  final int pendingAmount;
  final Map? card;
  final VoidCallback? onTapCard;

  const WalletBalanceCard({
    super.key,
    required this.balance,
    required this.totalIn,
    required this.totalOut,
    required this.pendingAmount,
    this.card,
    this.onTapCard,
  });

  @override
  State<WalletBalanceCard> createState() => _WalletBalanceCardState();
}

class _WalletBalanceCardState extends State<WalletBalanceCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..forward();

  // موجودی از صفر تا مقدار واقعی بالا می‌رود. یک لحظهٔ کوچک ولی مؤثر: عدد
  // «زنده» به نظر می‌رسد به‌جای اینکه ناگهان روی صفحه ظاهر شود.
  late Animation<double> _count = Tween<double>(begin: 0, end: widget.balance.toDouble())
      .animate(CurvedAnimation(parent: _c, curve: Curves.easeOutExpo));

  @override
  void didUpdateWidget(covariant WalletBalanceCard old) {
    super.didUpdateWidget(old);
    if (old.balance != widget.balance) {
      // از مقدار قبلی به مقدار جدید، نه از صفر — وقتی کاربر برداشت می‌زند،
      // عدد باید «کم شود»، نه دوباره از صفر بالا بیاید.
      _count = Tween<double>(
        begin: old.balance.toDouble(),
        end: widget.balance.toDouble(),
      ).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutCubic));
      _c
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasCard = widget.card != null;

    return ClipRRect(
      borderRadius: BorderRadius.circular(Corners.xxl),
      child: Stack(
        children: [
          // پس‌زمینهٔ گرادیان
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF0B2B4F), Color(0xFF0E5C4A), BrandColors.emerald],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
            ),
          ),
          // نقش‌مایهٔ منحنی تزئینی
          Positioned.fill(
            child: CustomPaint(painter: _WaveDecorPainter()),
          ),
          Padding(
            padding: const EdgeInsets.all(Gaps.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const _GoldChip(),
                    Gaps.hSm,
                    Text('کیف پول قلقلی',
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: Colors.white.withValues(alpha: 0.92),
                          fontWeight: FontWeight.w600,
                        )),
                    const Spacer(),
                    Icon(Icons.account_balance_wallet_rounded,
                        color: Colors.white.withValues(alpha: 0.85), size: 22),
                  ],
                ),
                Gaps.vMd,
                Text('موجودی قابل برداشت',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white.withValues(alpha: 0.75),
                    )),
                Gaps.vXxs,
                AnimatedBuilder(
                  animation: _count,
                  builder: (_, __) => FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerStart,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          Money.format(_count.value.round()),
                          style: theme.textTheme.displaySmall?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                          ),
                        ),
                        Gaps.hXs,
                        Text('تومان',
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: Colors.white.withValues(alpha: 0.85),
                            )),
                      ],
                    ),
                  ),
                ),
                if (widget.pendingAmount > 0) ...[
                  Gaps.vXs,
                  _Pill(
                    icon: Icons.hourglass_top_rounded,
                    label: '${Money.withUnit(widget.pendingAmount)} در حال بررسی',
                    color: BrandColors.amber,
                  ),
                ],
                Gaps.vMd,
                Row(
                  children: [
                    Expanded(
                      child: _MiniStat(
                        icon: Icons.south_west_rounded,
                        label: 'کل دریافتی',
                        value: Money.compact(widget.totalIn),
                        color: const Color(0xFF7BFFCE),
                      ),
                    ),
                    Container(
                      width: 1,
                      height: 30,
                      color: Colors.white.withValues(alpha: 0.18),
                    ),
                    Expanded(
                      child: _MiniStat(
                        icon: Icons.north_east_rounded,
                        label: 'کل برداشتی',
                        value: Money.compact(widget.totalOut),
                        color: const Color(0xFFFFD59E),
                      ),
                    ),
                  ],
                ),
                Gaps.vMd,
                // نوار کارت بانکی
                InkWell(
                  onTap: widget.onTapCard,
                  borderRadius: Corners.rMd,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: Gaps.sm, vertical: Gaps.xs),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: Corners.rMd,
                      border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          hasCard ? Icons.credit_card_rounded : Icons.add_card_rounded,
                          color: Colors.white.withValues(alpha: 0.9),
                          size: 20,
                        ),
                        Gaps.hSm,
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                hasCard
                                    ? faNum('${widget.card!['maskedNumber'] ?? ''}')
                                    : 'کارت بانکی ثبت نشده',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 1.1,
                                ),
                              ),
                              if (hasCard && widget.card!['bank'] != null)
                                Text('${widget.card!['bank']}',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: Colors.white.withValues(alpha: 0.7),
                                    )),
                              if (!hasCard)
                                Text('برای برداشت لازم است',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: BrandColors.amber,
                                    )),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_left_rounded,
                            color: Colors.white.withValues(alpha: 0.7)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// تراشهٔ طلایی کارت بانکی
class _GoldChip extends StatelessWidget {
  const _GoldChip();

  @override
  Widget build(BuildContext context) => Container(
        width: 32,
        height: 24,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: const LinearGradient(
            colors: [Color(0xFFFFE9A8), Color(0xFFD4A227)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: Container(
            width: 18,
            height: 12,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(2),
              border: Border.all(
                  color: const Color(0xFF8A6A16).withValues(alpha: 0.55), width: 0.8),
            ),
          ),
        ),
      );
}

/// منحنی‌های تزئینی پس‌زمینهٔ کارت
class _WaveDecorPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = Colors.white.withValues(alpha: 0.10);

    for (var i = 0; i < 3; i++) {
      final path = Path();
      final offset = size.width * (0.45 + i * 0.14);
      path.moveTo(offset, -20);
      path.quadraticBezierTo(
        offset + size.width * 0.30, size.height * 0.45,
        offset - size.width * 0.10, size.height + 20,
      );
      canvas.drawPath(path, paint);
    }

    // هالهٔ نرم گوشهٔ بالا
    canvas.drawCircle(
      Offset(size.width * 0.12, -size.height * 0.15),
      size.height * 0.42,
      Paint()..color = Colors.white.withValues(alpha: 0.05),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _MiniStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _MiniStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        // BUG FIX: با مبلغ‌های خیلی بزرگ، برچسبِ کنار آیکون از عرض ستون
        // بیرون می‌زد (RenderFlex overflow). Flexible اجازه می‌دهد متن
        // کوچک/کوتاه شود به‌جای اینکه چیدمان را بشکند.
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            Gaps.hXxs,
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: Colors.white.withValues(alpha: 0.72),
                ),
              ),
            ),
          ],
        ),
        Gaps.vXxs,
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(value,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              )),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _Pill({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.20),
          borderRadius: Corners.rPill,
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        // BUG FIX: برچسب بلند («۶۰٬۰۰۰ تومان در حال بررسی») روی گوشی باریک
        // از عرض کارت بیرون می‌زد. Flexible + ellipsis جلوی سرریز را
        // می‌گیرد بدون اینکه متن کوتاه را بشکند.
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: color),
            Gaps.hXxs,
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: color, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
}

/// ---------------------------------------------------------------------------
///  ردیف تراکنش
/// ---------------------------------------------------------------------------
class WalletTransactionTile extends StatelessWidget {
  final Map tx;
  const WalletTransactionTile({super.key, required this.tx});

  static const _sourceMeta = <String, (String, IconData)>{
    'card_cash': ('جایزهٔ نقدی کارت', Icons.credit_score_rounded),
    'wheel': ('گردونهٔ شانس', Icons.casino_rounded),
    'reward': ('جایزهٔ نقدی', Icons.card_giftcard_rounded),
    'league': ('جایزهٔ لیگ', Icons.emoji_events_rounded),
    'admin_credit': ('افزایش توسط مدیریت', Icons.admin_panel_settings_rounded),
    'admin_debit': ('کسر توسط مدیریت', Icons.admin_panel_settings_rounded),
    'withdrawal_hold': ('درخواست برداشت', Icons.north_east_rounded),
    'withdrawal_refund': ('برگشت وجه', Icons.undo_rounded),
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCredit = tx['direction'] == 'credit';
    final meta = _sourceMeta[tx['source']] ?? ('تراکنش', Icons.swap_vert_rounded);
    final color = isCredit ? context.brand.success : context.brand.warning;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gaps.xs),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: Corners.rSm,
            ),
            child: Icon(meta.$2, size: 20, color: color),
          ),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(meta.$1,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                if ((tx['description'] ?? '').toString().isNotEmpty)
                  Text('${tx['description']}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall),
                Text(_faDate(tx['created_at']),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant
                          .withValues(alpha: 0.75),
                    )),
              ],
            ),
          ),
          Gaps.hXs,
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${isCredit ? '+' : '−'} ${Money.format(tx['amount'])}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text('مانده ${Money.format(tx['balance_after'])}',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}

/// ---------------------------------------------------------------------------
///  ردیف درخواست برداشت
/// ---------------------------------------------------------------------------
class WithdrawalTile extends StatelessWidget {
  final Map request;
  final VoidCallback? onCancel;
  const WithdrawalTile({super.key, required this.request, this.onCancel});

  /// آیکونِ هر وضعیت — ثابت است و به تم ربطی ندارد.
  static const _statusIcon = <String, IconData>{
    'pending': Icons.hourglass_top_rounded,
    'approved': Icons.verified_rounded,
    'paid': Icons.check_circle_rounded,
    'rejected': Icons.cancel_rounded,
    'canceled': Icons.remove_circle_outline_rounded,
  };

  /// رنگِ هر وضعیت — **از تم** خوانده می‌شود، نه از یک ثابت.
  ///
  /// ═════════════════════════════════════════════════════════════════════
  /// چرا این نگاشت از `static const` به تابع تبدیل شد
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// نسخهٔ قبلی یک `static const` بود که مستقیم `BrandColors.warning`
  /// و همتایانش را نگه می‌داشت. آن رنگ‌ها برای سطحِ **تیره** ساخته
  /// شده‌اند و اینجا روی یک `AppCard` می‌نشینند که در تم روشن سفید
  /// است. نتیجه: نسبتِ کنتراست ۲.۰:۱ برای «در انتظار» و ۲.۲:۱ برای
  /// «پرداخت شد» — یعنی زیر حداقلِ WCAG و دقیقاً همان چیزی که مالک
  /// دید.
  ///
  /// `const` بودن مانعِ خواندن از تم بود، چون `context` در زمانِ
  /// کامپایل وجود ندارد. تبدیل به تابع تنها راهِ درست است؛ سربارش هم
  /// صفر است چون فقط یک switch روی رشته است.
  static Color _statusColor(BuildContext context, String status) {
    final b = context.brand;
    switch (status) {
      case 'pending':
        return b.warning;
      case 'approved':
        return b.info;
      case 'paid':
        return b.success;
      case 'rejected':
        return b.danger;
      case 'canceled':
        return Theme.of(context).colorScheme.outline;
      default:
        return Theme.of(context).colorScheme.outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = '${request['status']}';
    final style = (
      _statusColor(context, status),
      _statusIcon[status] ?? Icons.help_outline_rounded,
    );

    return AppCard(
      padding: const EdgeInsets.all(Gaps.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // BUG FIX: مبلغ و برچسب وضعیت با هم از عرض ردیف بیرون می‌زدند.
          // مبلغ داخل Expanded می‌رود تا در صورت نیاز کوچک شود؛ برچسب
          // وضعیت کوتاه است و اندازهٔ طبیعی خودش را نگه می‌دارد.
          Row(
            children: [
              Icon(style.$2, color: style.$1, size: 20),
              Gaps.hXs,
              Expanded(
                child: Text(
                  Money.withUnit(request['amount']),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              Gaps.hXs,
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
                decoration: BoxDecoration(
                  color: style.$1.withValues(alpha: 0.14),
                  borderRadius: Corners.rPill,
                ),
                child: Text('${request['statusLabel']}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: style.$1,
                      fontWeight: FontWeight.w700,
                    )),
              ),
            ],
          ),
          Gaps.vXs,
          Row(
            children: [
              Icon(Icons.credit_card_rounded,
                  size: 15, color: theme.colorScheme.onSurfaceVariant),
              Gaps.hXxs,
              Text(faNum('${request['cardMasked'] ?? ''}'),
                  style: theme.textTheme.bodySmall?.copyWith(letterSpacing: 0.8)),
              if (request['cardBank'] != null) ...[
                Gaps.hXs,
                Flexible(
                  child: Text('${request['cardBank']}',
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall),
                ),
              ],
            ],
          ),
          Gaps.vXxs,
          Text(_faDate(request['createdAt']),
              style: theme.textTheme.bodySmall?.copyWith(fontSize: 11)),
          if ((request['trackingCode'] ?? '').toString().isNotEmpty) ...[
            Gaps.vXs,
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.xs),
              decoration: BoxDecoration(
                color: context.brand.success.withValues(alpha: 0.10),
                borderRadius: Corners.rSm,
              ),
              child: Text('کد پیگیری: ${faNum(request['trackingCode'])}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: context.brand.success)),
            ),
          ],
          if ((request['adminNote'] ?? '').toString().isNotEmpty) ...[
            Gaps.vXs,
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.xs),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: Corners.rSm,
              ),
              child: Text('پیام مدیریت: ${request['adminNote']}',
                  style: theme.textTheme.bodySmall),
            ),
          ],
          if (request['timeline'] is List && (request['timeline'] as List).isNotEmpty) ...[
            Gaps.vXs,
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.xs),
              decoration: BoxDecoration(
                color: theme.colorScheme.onSurface.withValues(alpha: .025),
                borderRadius: Corners.rSm,
              ),
              child: Column(children: [
                for (final step in (request['timeline'] as List).whereType<Map>())
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 4),
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF22E7A6))),
                      Gaps.hXs,
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${step['statusLabel'] ?? step['toStatus']}', style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800)),
                        Text('${_faDate(step['createdAt'])}${step['note'] != null ? ' · ${step['note']}' : ''}',
                            style: const TextStyle(fontSize: 8.5, color: Colors.white54)),
                      ])),
                    ]),
                  ),
              ]),
            ),
          ],
          if (status == 'pending' && onCancel != null) ...[
            Gaps.vXs,
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: onCancel,
                style: TextButton.styleFrom(
                    foregroundColor: context.brand.danger,
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact),
                icon: const Icon(Icons.close_rounded, size: 16),
                label: const Text('لغو درخواست'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// تاریخ شمسی ساده و خوانا — پیاده‌سازی واقعی در `utils/fa_date.dart`
/// مشترک شد تا صفحهٔ گردونه (چرخش‌های اخیر) هم همان قالب را نشان دهد.
String _faDate(Object? iso) => faDate(iso);
