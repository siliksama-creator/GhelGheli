// دعوت دوستان — کد اختصاصی، آمار، و فهرست دوستان.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';

class ReferralPage extends StatefulWidget {
  const ReferralPage({super.key, required this.api});

  final ApiClient api;

  @override
  State<ReferralPage> createState() => _ReferralPageState();
}

class _ReferralPageState extends State<ReferralPage> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/api/referrals');
      if (!mounted) return;
      setState(() {
        _data = Map<String, dynamic>.from(res as Map);
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = apiError(e);
      });
    }
  }

  int _int(Object? v) =>
      v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

  Future<void> _copy(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      const SnackBar(
        content: Text('کد کپی شد ✅'),
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_data == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error ?? 'خطا', style: theme.textTheme.bodyMedium),
            Gaps.vSm,
            TextButton(onPressed: _load, child: const Text('تلاش دوباره')),
          ],
        ),
      );
    }

    final d = _data!;
    final code = (d['code'] ?? '').toString();
    final percent = _int(d['commissionPercent']);
    final spins = _int(d['spinsPerReferral']);
    final friends = (d['friends'] as List? ?? []).whereType<Map>().toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(Gaps.lg),
        children: [
          Text('🤝 دعوت دوستان',
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXs,
          Text(
            'کدت را به دوستانت بده. هر کس با آن عضو شود، '
            '${faNum(spins)} چرخش گردونه می‌گیری و برای همیشه '
            '${faNum(percent)}٪ از تمام امتیازهایی که او به دست می‌آورد به تو '
            'هم می‌رسد — بدون اینکه از امتیاز او کم شود.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              height: 1.7,
            ),
          ),
          Gaps.vMd,

          // ── کد ──────────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(Gaps.lg),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF84CC16).withValues(alpha: 0.14),
                  const Color(0xFF22D3EE).withValues(alpha: 0.10),
                ],
              ),
              borderRadius: Corners.rLg,
              border: Border.all(
                  color: const Color(0xFF84CC16).withValues(alpha: 0.4)),
            ),
            child: Column(
              children: [
                // Directionality صریح: کد لاتین داخل رابط راست‌به‌چپ
                // وگرنه کاراکترهایش جابه‌جا خوانده می‌شود.
                const Directionality(
                  textDirection: TextDirection.ltr,
                  child: SizedBox.shrink(),
                ),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: SelectableText(
                    code,
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 5,
                      color: Color(0xFFA3E635),
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
                Gaps.vSm,
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    OutlinedButton.icon(
                      onPressed: code.isEmpty ? null : () => _copy(code),
                      icon: const Icon(Icons.copy_rounded, size: 18),
                      label: const Text('کپی کد'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Gaps.vMd,

          // ── آمار ────────────────────────────────────────────────────────
          Row(
            children: [
              _Stat(value: _int(d['invitedCount']), label: 'دوست دعوت‌شده'),
              Gaps.hXs,
              _Stat(value: _int(d['totalEarned']), label: 'امتیاز از دوستان'),
              Gaps.hXs,
              _Stat(value: _int(d['bonusSpins']), label: 'چرخش باقی‌مانده'),
            ],
          ),
          Gaps.vLg,

          if (friends.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Gaps.lg),
              child: Text(
                'هنوز کسی با کد تو عضو نشده. اولین نفر را دعوت کن!',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            )
          else ...[
            Text('دوستان تو',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
            Gaps.vXs,
            // ListView.builder داخل ListView کار نمی‌کند و اینجا هم لازم
            // نیست: سرور حداکثر ۵۰ ردیف می‌فرستد.
            for (final f in friends)
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(
                    horizontal: Gaps.md, vertical: Gaps.sm),
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
                  borderRadius: Corners.rMd,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        (f['nickname'] ?? 'کاربر').toString(),
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    Text(
                      '${faNum(_int(f['earnedFromThem']))} امتیاز',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: const Color(0xFFA3E635),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Gaps.md),
        decoration: BoxDecoration(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
          borderRadius: Corners.rMd,
        ),
        child: Column(
          children: [
            Text(faNum(value),
                style: theme.textTheme.titleLarge?.copyWith(
                  color: const Color(0xFFA3E635),
                  fontWeight: FontWeight.w900,
                )),
            Gaps.vXxs,
            Text(label,
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                )),
          ],
        ),
      ),
    );
  }
}
