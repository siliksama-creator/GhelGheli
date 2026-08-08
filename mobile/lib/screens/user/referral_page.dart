// دعوت دوستان — کد اختصاصی، آمار، و فهرست دوستان.
import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/share_invite.dart';
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
    final ok = await copyCode(code);
    if (!mounted) return;
    _toast(ok ? 'کد کپی شد ' : 'کپی نشد؛ کد را دستی بردارید');
  }

  /// اشتراک‌گذاری در یک پیام‌رسان.
  ///
  /// پیامِ بازخورد به نتیجه بستگی دارد و این عمدی است: اگر روبیکا باز
  /// شود ولی متن خودکار پر نشود، کاربر باید بداند که باید بچسباند —
  /// وگرنه فکر می‌کند اپ خراب است.
  Future<void> _share(ShareTarget t, String code) async {
    final outcome = await shareInvite(t, code);
    if (!mounted) return;
    switch (outcome) {
      case ShareOutcome.opened:
        // اپ باز شد و متن آماده است؛ پیام لازم نیست و فقط مزاحم است.
        break;
      case ShareOutcome.openedWithClipboard:
        _toast('متن دعوت کپی شد — در ${t.label} بچسبانید ');
      case ShareOutcome.copiedOnly:
        _toast('${t.label} باز نشد؛ متن دعوت کپی شد ');
    }
  }

  void _toast(String text) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(
        content: Text(text, textAlign: TextAlign.center),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
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
          Text(' دعوت دوستان',
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXs,
          Text(
            'کدت را به دوستانت بده. هر کس موقع ثبت‌نام آن را وارد کند، '
            'هر دوی شما ${faNum(spins)} چرخش گردونه می‌گیرید.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              height: 1.7,
            ),
          ),
          Gaps.vSm,
          _Rules(
            percent: percent,
            spins: spins,
            perDaily: _int(d['invitesPerDailySpin']),
            maxDaily: _int(d['maxInvitesForDaily']),
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
                if (code.isNotEmpty) ...[
                  Gaps.vSm,
                  Divider(
                      height: 1,
                      color: theme.colorScheme.outline.withValues(alpha: 0.3)),
                  Gaps.vSm,
                  Text('ارسال برای دوستان',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.75),
                      )),
                  Gaps.vXs,
                  // ═══════════════════════════════════════════════════
                  // چرا Wrap و نه Row
                  // ═══════════════════════════════════════════════════
                  //
                  // چهار دکمه روی یک گوشیِ باریک (۳۲۰dp) سرریز
                  // می‌کند و فلاتر نوارِ زرد-مشکی می‌کشد. Wrap خودش
                  // به خطِ دوم می‌رود.
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: Gaps.xs,
                    runSpacing: Gaps.xs,
                    children: [
                      for (final t in shareTargets)
                        _ShareChip(
                          target: t,
                          onTap: () => _share(t, code),
                        ),
                    ],
                  ),
                ],
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
              _Stat(value: _int(d['dailySpins']), label: 'چرخش روزانه'),
            ],
          ),
          Gaps.vSm,
          // پیشرفت تا چرخش روزانهٔ بعدی. یک هدف نزدیک و دیدنی، خیلی
          // مؤثرتر از یک قانون نوشته‌شده در متن است.
          if (d['atDailyCap'] != true && d['invitesToNextDailySpin'] != null)
            _NextSpinProgress(
              toNext: _int(d['invitesToNextDailySpin']),
              perDaily: _int(d['invitesPerDailySpin']),
              nextTotal: _int(d['dailySpins']) + 1,
            )
          else if (d['atDailyCap'] == true)
            Text(
              ' به سقف ${faNum(_int(d['maxInvitesForDaily']))} دوست رسیدی — '
              'هر روز ${faNum(_int(d['dailySpins']))} چرخش رایگان داری!',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: const Color(0xFFA3E635),
                fontWeight: FontWeight.w700,
              ),
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


/// توضیح قوانین دعوت.
class _Rules extends StatelessWidget {
  const _Rules({
    required this.percent,
    required this.spins,
    required this.perDaily,
    required this.maxDaily,
  });

  final int percent;
  final int spins;
  final int perDaily;
  final int maxDaily;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dim = theme.colorScheme.onSurface.withValues(alpha: 0.72);

    Widget row(String bold, String rest) => Padding(
          padding: const EdgeInsets.only(bottom: Gaps.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('•  ', style: TextStyle(color: dim, height: 1.75)),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: bold,
                      style: const TextStyle(
                        color: Color(0xFFA3E635),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    TextSpan(text: rest),
                  ]),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: dim, height: 1.75),
                ),
              ),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
        borderRadius: Corners.rLg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          row('${faNum(percent)}٪ کمیسیون دائمی',
              ' — از امتیازی که دوستت با ثبت کد کارت یا بازی ضربه‌زن به دست '
              'می‌آورد، ${faNum(percent)}٪ به تو هم می‌رسد. از امتیاز او '
              'چیزی کم نمی‌شود؛ این را ما اضافه می‌کنیم.'),
          row('هر ${faNum(perDaily)} دعوت = یک چرخش روزانهٔ دائمی',
              ' — با ${faNum(perDaily)} دوست، هر روز ${faNum(2)} چرخش داری '
              'به‌جای یکی. تا سقف ${faNum(maxDaily)} دوست ادامه دارد.'),
          row('دعوت نامحدود است',
              ' — هر چند نفر که بخواهی می‌توانی دعوت کنی.'),
          row('یک بار برای هر دوست',
              ' — جایزهٔ ${faNum(spins)} چرخش فقط یک بار داده می‌شود.'),
        ],
      ),
    );
  }
}

/// نوار پیشرفت تا چرخش روزانهٔ بعدی.
class _NextSpinProgress extends StatelessWidget {
  const _NextSpinProgress({
    required this.toNext,
    required this.perDaily,
    required this.nextTotal,
  });

  final int toNext;
  final int perDaily;
  final int nextTotal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // perDaily صفر نمی‌شود، ولی تقسیم بر صفر یک NaN می‌سازد که فلاتر
    // موقع رسم نوار پرتاب می‌کند.
    final done = perDaily > 0 ? (perDaily - toNext) / perDaily : 0.0;
    return Column(
      children: [
        ClipRRect(
          borderRadius: Corners.rPill,
          child: LinearProgressIndicator(
            value: done.clamp(0.0, 1.0),
            minHeight: 8,
            backgroundColor:
                theme.colorScheme.onSurface.withValues(alpha: 0.08),
            valueColor:
                const AlwaysStoppedAnimation(Color(0xFF84CC16)),
          ),
        ),
        Gaps.vXxs,
        Text(
          '${faNum(toNext)} دوست دیگر تا ${faNum(nextTotal)} چرخش روزانه ',
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
          ),
        ),
      ],
    );
  }
}

/// دکمهٔ کوچکِ یک پیام‌رسان.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا رنگِ برند فقط در حاشیه و پس‌زمینهٔ کم‌رنگ استفاده می‌شود
/// ═══════════════════════════════════════════════════════════════════════════
///
/// رنگِ سبزِ واتس‌اپ (#25D366) روی سطحِ روشن کنتراستِ ۱.۹:۱ دارد —
/// همان دسته مشکلی که در رنگ‌های معنایی رفع شد. پس رنگِ برند فقط برای
/// **شناسایی** به‌کار می‌رود (حاشیه و ته‌رنگ) و خودِ متن از تم می‌آید،
/// که در هر دو حالت خوانا است.
class _ShareChip extends StatelessWidget {
  const _ShareChip({required this.target, required this.onTap});

  final ShareTarget target;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final brand = Color(target.color);
    return Material(
      color: brand.withValues(alpha: 0.10),
      borderRadius: Corners.rPill,
      child: InkWell(
        borderRadius: Corners.rPill,
        onTap: onTap,
        child: Container(
          padding:
              const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: Gaps.xs),
          decoration: BoxDecoration(
            borderRadius: Corners.rPill,
            border: Border.all(color: brand.withValues(alpha: 0.55)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(target.icon, size: 18, color: brand),
              Gaps.hXxs,
              Text(
                target.label,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  // رنگِ متن از تم، نه از برند — توضیح بالای کلاس.
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
