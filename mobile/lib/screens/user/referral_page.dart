import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/app_config.dart';
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
    _toast(ok ? 'کد دعوت کپی شد ✓' : 'کپی نشد؛ لطفاً دستی کپی کنید');
  }

  Future<void> _share(ShareTarget t, String code, {int spins = 3, int purchasePercent = 5}) async {
    final outcome = await shareInvite(t, code, spins: spins, purchasePercent: purchasePercent);
    if (!mounted) return;
    switch (outcome) {
      case ShareOutcome.opened:
        break;
      case ShareOutcome.openedWithClipboard:
        _toast('متن دعوت کپی شد — در ${t.label} بچسبانید');
      case ShareOutcome.copiedOnly:
        _toast('${t.label} باز نشد؛ متن دعوت کپی شد');
    }
  }

  void _toast(String text) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(
        content: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800)),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
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
            Text(_error ?? 'خطا در بارگذاری', style: theme.textTheme.bodyMedium),
            Gaps.vSm,
            TextButton(onPressed: _load, child: const Text('تلاش دوباره')),
          ],
        ),
      );
    }

    final d = _data!;
    final code = (d['code'] ?? '').toString();
    final percent = _int(d['commissionPercent']);
    final purchasePercent = _int(d['purchaseCommissionPercent']);
    final threshold = _int(d['withdrawalThreshold']);
    final spins = _int(d['spinsPerReferral']);
    final friends = (d['friends'] as List? ?? []).whereType<Map>().toList();
    // دو تبِ معرف‌ها (۴ مهر ۱۴۰۵). همان دادهٔ صفحهٔ وب، از همان درخواستِ
    // `/api/referrals` — تا «تعدادِ دعوت» در دو کلاینت هرگز دو عدد نباشد.
    final inviteBoard = (d['inviteLeague'] as Map?)?.cast<String, dynamic>()
        ?? const <String, dynamic>{};

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
        children: [
          // ── Header Card ──
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: const LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [Color(0xFF142B52), Color(0xFF091424)],
              ),
              border: Border.all(color: const Color(0xFF84CC16).withValues(alpha: 0.35)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF84CC16).withValues(alpha: 0.18),
                      ),
                      child: const Icon(Icons.group_add_rounded, color: Color(0xFFA3E635), size: 24),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('دعوت از دوستان',
                              style: theme.textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w900, color: Colors.white)),
                          const SizedBox(height: 2),
                          Text(
                            'به ازای هر دوست، هر دوی شما ${faNum(spins)} چرخش گردونه هدیه می‌گیرید!',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.72),
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── Unique Referral Code Box ──
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFA3E635).withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('کد اختصاصی شما:',
                              style: TextStyle(color: Colors.white60, fontSize: 10.5, fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Directionality(
                          textDirection: TextDirection.ltr,
                          child: SelectableText(
                            code,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 4,
                              color: Color(0xFFA3E635),
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: code.isEmpty ? null : () => _copy(code),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF84CC16),
                          foregroundColor: const Color(0xFF132B04),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.copy_rounded, size: 16),
                        label: const Text('کپی کد', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // ── Messenger Share Buttons ──
                const Text('ارسال مستقیم با پیام‌رسان‌ها:',
                    style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final t in shareTargets)
                      _ShareChip(
                        target: t,
                        onTap: () => _share(t, code, spins: spins, purchasePercent: purchasePercent),
                      ),
                  ],
                ),
              ],
            ),
          ),

          Gaps.vSm,

          // ── Stats Row ──
          Row(
            children: [
              _Stat(value: _int(d['invitedCount']), label: 'دوست دعوت‌شده'),
              Gaps.hXs,
              _Stat(value: _int(d['totalEarned']), label: 'امتیاز از کمیسیون'),
              Gaps.hXs,
              _Stat(value: _int(d['dailySpins']), label: 'چرخش روزانه'),
            ],
          ),

          Gaps.vSm,

          _CashIncomeCard(
            earned: _int(d['cashCommissionEarned']),
            walletBalance: _int(d['walletBalance']),
            threshold: threshold,
            ready: d['cashWithdrawReady'] == true,
            percent: purchasePercent,
          ),

          Gaps.vSm,

          // ── دو تبِ معرف‌ها: تاپِ همهٔ زمان‌ها و لیگِ جاری ──
          _InviteBoard(board: inviteBoard),

          Gaps.vSm,

          // ── Rules (Compact Accordion/Box) ──
          _CompactRules(
            percent: percent,
            purchasePercent: purchasePercent,
            threshold: threshold,
            spins: spins,
            perDaily: _int(d['invitesPerDailySpin']),
            maxDaily: _int(d['maxInvitesForDaily']),
          ),

          Gaps.vMd,

          // ── Friends List ──
          Text('دوستان دعوت‌شده (${faNum(friends.length)})',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
          Gaps.vXs,
          if (friends.isEmpty)
            Container(
              padding: const EdgeInsets.all(Gaps.lg),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: theme.colorScheme.surface.withValues(alpha: 0.3),
              ),
              child: Text(
                'هنوز دوستی با کد شما عضو نشده است. کد را برای دوستانتان بفرستید!',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.white60),
              ),
            )
          else
            ...friends.map((f) => Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.person_rounded, size: 18, color: Color(0xFFA3E635)),
                      Gaps.hXs,
                      Expanded(
                        child: Text(
                          (f['nickname'] ?? 'کاربر').toString(),
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '+${faNum(f['cashEarnedFromThem'] ?? 0)} تومان',
                            style: const TextStyle(color: Color(0xFF22E7A6), fontWeight: FontWeight.w900, fontSize: 11.5),
                          ),
                          Text(
                            '+${faNum(f['earnedFromThem'] ?? 0)} امتیاز',
                            style: const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.w800, fontSize: 9.5),
                          ),
                        ],
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }
}

class _CashIncomeCard extends StatelessWidget {
  const _CashIncomeCard({
    required this.earned,
    required this.walletBalance,
    required this.threshold,
    required this.ready,
    required this.percent,
  });
  final int earned;
  final int walletBalance;
  final int threshold;
  final bool ready;
  final int percent;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(16),
      gradient: const LinearGradient(colors: [Color(0x3322E7A6), Color(0x2238BDF8)]),
      border: Border.all(color: const Color(0xFF22E7A6).withValues(alpha: .38)),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFF22E7A6)),
        Gaps.hXs,
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('درآمد نقدی معرفی از خریدها', style: TextStyle(fontSize: 10.5, color: Colors.white60)),
          Text('${faNum(earned)} تومان',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF22E7A6))),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          const Text('موجودی کیف پول', style: TextStyle(fontSize: 9, color: Colors.white54)),
          Text('${faNum(walletBalance)} تومان', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900)),
        ]),
      ]),
      Gaps.vXs,
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          color: (ready ? const Color(0xFF22C55E) : const Color(0xFFFFD166)).withValues(alpha: .14),
        ),
        child: Text(
          ready ? 'آماده درخواست برداشت' : 'حداقل برداشت: ${faNum(threshold)} تومان',
          style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900,
              color: ready ? const Color(0xFF4ADE80) : const Color(0xFFFFD166)),
        ),
      ),
      Gaps.vXs,
      Text('$percent٪ هر خرید دوست مستقیم، اتمیک و قابل رهگیری وارد کیف پول می‌شود. کمیسیون سطح دوم نداریم.',
          style: const TextStyle(fontSize: 9.5, height: 1.45, color: Colors.white60)),
    ]),
  );
}

/// جدولِ معرف‌ها — دو تبِ «معرف‌های برتر تا کنون» و «لیگ معرف‌ها».
///
/// ── چرا داخلِ خودِ این صفحه و نه صفحهٔ جدا ────────────────────────────────
///
/// خواستهٔ مالک «یک تبِ تازه در قسمتِ دعوت از دوستان» بود، نه یک صفحهٔ
/// تازهٔ جدا؛ کاربر باید کدِ دعوت و جدول را پشتِ سرِ هم ببیند. نام‌ها از
/// متنِ زندهٔ سرور می‌آید (`inviteLeague.*`) تا بدونِ آپدیتِ اپ عوض شوند —
/// همان قاعدهٔ «کلاینت کلمه نمی‌سازد».
class _InviteBoard extends StatefulWidget {
  const _InviteBoard({required this.board});

  final Map<String, dynamic> board;

  @override
  State<_InviteBoard> createState() => _InviteBoardState();
}

class _InviteBoardState extends State<_InviteBoard> {
  int _tab = 0;

  List<Map<String, dynamic>> _rows(Object? raw) => (raw as List? ?? [])
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();

  Map<String, dynamic>? _map(Object? raw) =>
      raw is Map ? Map<String, dynamic>.from(raw) : null;

  int _int(Object? v) =>
      v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);

  /// «۲ روز و ۳ ساعت مانده» — سرشماریِ معکوسِ لیگ.
  String _remaining(Object? endsAt) {
    final t = DateTime.tryParse('${endsAt ?? ''}');
    if (t == null) return '';
    final minutes = t.difference(DateTime.now()).inMinutes;
    if (minutes <= 0) return 'پایان یافته';
    final days = minutes ~/ 1440;
    final hours = (minutes % 1440) ~/ 60;
    final mins = minutes % 60;
    if (days > 0) return '${faNum(days)} روز و ${faNum(hours)} ساعت مانده';
    if (hours > 0) return '${faNum(hours)} ساعت و ${faNum(mins)} دقیقه مانده';
    return '${faNum(mins)} دقیقه مانده';
  }

  /// «۵۰۰٬۰۰۰ تومان + ۲٬۰۰۰ امتیاز» — همان ترتیبی که پنل ادمین نشان می‌دهد.
  String _prize(Map<String, dynamic> p) {
    final parts = <String>[];
    if (_int(p['cash']) > 0) parts.add('${faNum(p['cash'])} تومان');
    if (_int(p['points']) > 0) parts.add('${faNum(p['points'])} امتیاز');
    if (_int(p['coins']) > 0) parts.add('${faNum(p['coins'])} سکه');
    if (_int(p['spins']) > 0) parts.add('${faNum(p['spins'])} چرخش');
    return parts.isEmpty ? '—' : parts.join(' + ');
  }

  @override
  Widget build(BuildContext context) {
    final allTime = _map(widget.board['allTime']) ?? const <String, dynamic>{};
    final league = _map(widget.board['league']);
    final history = _rows(widget.board['history']);
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── نوارِ دو تب ──
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Row(
              children: [
                _BoardTab(
                  label: liveText('inviteLeague.allTimeTitle', 'معرف‌های برتر تا کنون'),
                  icon: Icons.emoji_events_rounded,
                  on: _tab == 0,
                  onTap: () => setState(() => _tab = 0),
                ),
                Gaps.hXs,
                _BoardTab(
                  label: liveText('inviteLeague.leagueTitle', 'لیگ معرف‌ها'),
                  icon: Icons.sports_esports_rounded,
                  on: _tab == 1,
                  alert: league != null,
                  onTap: () => setState(() => _tab = 1),
                ),
              ],
            ),
          ),
          Gaps.vSm,

          if (_tab == 0) ..._allTimePanel(allTime, theme),
          if (_tab == 1) ..._leaguePanel(league, history, theme),
        ],
      ),
    );
  }

  // ── تبِ ۱: تاپِ همهٔ زمان‌ها ─────────────────────────────────────────────
  List<Widget> _allTimePanel(Map<String, dynamic> allTime, ThemeData theme) {
    final rows = _rows(allTime['rows']);
    final me = _map(allTime['me']);
    final meInTop = allTime['meInTop'] == true;
    return [
      _boardHeader(
        liveText('inviteLeague.allTimeTitle', 'معرف‌های برتر تا کنون'),
        'رکورددارانِ معرفی از ابتدا تا امروز',
        theme,
      ),
      if (rows.isEmpty)
        _emptyBox('هنوز کسی کسی را دعوت نکرده. تو اولین نفر باش!', theme)
      else ...[
        ...rows.map((r) => _boardRow(r, me: me != null && me['userId'] == r['userId'])),
        // «رنک هر فرد رو هم نشون بده حتی اگه تو تاپ ۱۰ نباشه» — ردیفِ خودِ
        // کاربر با سه‌نقطه از تاپ جدا می‌شود تا معلوم باشد جای واقعی‌اش
        // کجاست، نه نفرِ یازدهم.
        if (me != null && !meInTop) ...[
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Text('• • •', style: TextStyle(color: Colors.white38, letterSpacing: 3)),
            ),
          ),
          _boardRow(me, me: true),
        ],
      ],
      Gaps.vXs,
      Text(
        liveText('inviteLeague.rulesNote',
            'فقط دعوتِ معتبر شمرده می‌شود (کاربری که با کد شما ثبت‌نام کرده و فعال است). اگر دو نفر تعدادشان برابر شود، آن‌که زودتر به آن عدد رسیده بالاتر می‌ایستد.'),
        style: const TextStyle(fontSize: 10, color: Colors.white54, height: 1.7),
      ),
    ];
  }

  // ── تبِ ۲: لیگِ معرف‌ها ──────────────────────────────────────────────────
  List<Widget> _leaguePanel(
    Map<String, dynamic>? league,
    List<Map<String, dynamic>> history,
    ThemeData theme,
  ) {
    if (league == null) {
      return [
        // تصمیمِ مالک: «اگه ادمین لیگ معرف راه ننداخت باید فعلاً لیگ ای برای
        // معرف ها ساخته ننشده» — پس تب پنهان نمی‌شود، پیامِ روشن می‌دهد.
        _emptyBox(
          liveText('inviteLeague.emptyNote',
              'هنوز لیگی برای معرف‌ها ساخته نشده است. هر وقت مدیر یک لیگ بسازد، همین‌جا برگزار می‌شود.'),
          theme,
        ),
        if (history.isNotEmpty) ..._historyPanel(history),
      ];
    }
    final rows = _rows(league['rows']);
    final me = _map(league['me']);
    final meInTop = league['meInTop'] == true;
    final prizes = _rows(league['prizes']);
    final minInvites = _int(league['minInvites']);
    return [
      _boardHeader(
        (league['title'] ?? '').toString(),
        _remaining(league['endsAt']),
        theme,
      ),
      ...prizes.map((p) => Container(
            margin: const EdgeInsets.only(bottom: 5),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    (p['label'] ?? 'رتبهٔ ${faNum(p['rank'])}').toString(),
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  _prize(p),
                  style: const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.w900, color: Color(0xFFFFD166)),
                ),
              ],
            ),
          )),
      if (minInvites > 1)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(
            'برای ورود به جدولِ این لیگ حداقل ${faNum(minInvites)} دعوتِ معتبر لازم است.',
            style: const TextStyle(fontSize: 10, color: Colors.white54),
          ),
        ),
      if (rows.isEmpty)
        _emptyBox('هنوز کسی به حداقلِ دعوتِ این لیگ نرسیده — جای اول خالیه!', theme)
      else ...[
        ...rows.map((r) => _boardRow(r, me: me != null && me['userId'] == r['userId'])),
        if (me != null && !meInTop) ...[
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Text('• • •', style: TextStyle(color: Colors.white38, letterSpacing: 3)),
            ),
          ),
          _boardRow(me, me: true),
        ],
      ],
      Gaps.vXs,
      Text(
        liveText('inviteLeague.payoutNote',
            'جایزه پس از پایانِ لیگ، بعد از تأییدِ مدیر به حسابت واریز می‌شود.'),
        style: const TextStyle(fontSize: 10, color: Colors.white54, height: 1.7),
      ),
      ..._historyPanel(history),
    ];
  }

  /// آرشیوِ لیگ‌های تمام‌شده — برندگان از اسنپ‌شاتِ پرداخت می‌آید.
  List<Widget> _historyPanel(List<Map<String, dynamic>> history) {
    return [
      Gaps.vSm,
      const Divider(height: 1, color: Colors.white12),
      Gaps.vXs,
      const Text('لیگ‌های تمام‌شده:',
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
      ...history.map((h) {
        final top = _rows(h['top']);
        return Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Row(
            children: [
              Expanded(
                child: Text((h['title'] ?? '').toString(),
                    style: const TextStyle(fontSize: 11, color: Colors.white70)),
              ),
              Text(
                top.isEmpty
                    ? 'بدون برنده'
                    : top.map((t) => '${t['nickname']} (${faNum(t['invites'])})').join(' · '),
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        );
      }),
    ];
  }

  Widget _boardHeader(String title, String sub, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(title.isEmpty ? 'لیگ معرف‌ها' : title,
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
          ),
          if (sub.isNotEmpty)
            Text(sub, style: const TextStyle(fontSize: 10.5, color: Colors.white60)),
        ],
      ),
    );
  }

  Widget _emptyBox(String text, ThemeData theme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: theme.textTheme.bodySmall?.copyWith(color: Colors.white60, height: 1.8),
      ),
    );
  }

  /// یک ردیفِ جدول: رتبه، آواتار، نام، تعدادِ دعوت.
  Widget _boardRow(Map<String, dynamic> row, {bool me = false}) {
    final rank = _int(row['rank']);
    final top = rank <= 3;
    final medal = switch (rank) {
      1 => const [Color(0xFFFFD166), Color(0xFFB88700)],
      2 => const [Color(0xFFE2E8F0), Color(0xFF8A97A8)],
      3 => const [Color(0xFFE39A5B), Color(0xFF8A5423)],
      _ => const [Color(0x1FFFFFFF), Color(0x0FFFFFFF)],
    };
    final avatar = (row['avatarUrl'] ?? '').toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(11),
        color: me
            ? const Color(0xFF22E7A6).withValues(alpha: 0.12)
            : top
                ? const Color(0xFFFFD166).withValues(alpha: 0.09)
                : Colors.white.withValues(alpha: 0.03),
        border: Border.all(
          color: me
              ? const Color(0xFF22E7A6).withValues(alpha: 0.34)
              : top
                  ? const Color(0xFFFFD166).withValues(alpha: 0.26)
                  : Colors.white.withValues(alpha: 0.07),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(9),
              gradient: LinearGradient(colors: medal),
            ),
            child: Text(
              faNum(rank),
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w900,
                color: top ? const Color(0xFF241A00) : Colors.white,
              ),
            ),
          ),
          Gaps.hXs,
          _BoardAvatar(url: avatar, name: (row['nickname'] ?? '?').toString()),
          Gaps.hXs,
          Expanded(
            child: Text(
              (row['nickname'] ?? 'کاربر').toString(),
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
            ),
          ),
          Text(
            '${faNum(row['invites'])} دعوت',
            style: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.w900, color: Color(0xFF22E7A6)),
          ),
        ],
      ),
    );
  }
}

/// دکمهٔ یک تب — قرینهٔ `.refTabs` در وب.
class _BoardTab extends StatelessWidget {
  const _BoardTab({
    required this.label,
    required this.icon,
    required this.on,
    required this.onTap,
    this.alert = false,
  });

  final String label;
  final IconData icon;
  final bool on;
  final VoidCallback onTap;

  /// نقطهٔ سبزِ «لیگی در جریان است» — تا کاربر بفهمد آفرِ فعالی هست.
  final bool alert;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            gradient: on
                ? const LinearGradient(
                    colors: [Color(0x3838BDF8), Color(0x3822E7A6)],
                  )
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: on ? Colors.white : Colors.white54),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                    color: on ? Colors.white : Colors.white54,
                  ),
                ),
              ),
              if (alert) ...[
                const SizedBox(width: 5),
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: Color(0xFF22E7A6),
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// آواتارِ کوچکِ ردیفِ جدول — بدونِ وابستگیِ تازه به ویجت‌های دیگر.
class _BoardAvatar extends StatelessWidget {
  const _BoardAvatar({required this.url, required this.name});

  final String url;
  final String name;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) return _initial();
    return ClipOval(
      child: Image.network(
        url,
        width: 26,
        height: 26,
        fit: BoxFit.cover,
        // عکسِ حذف‌شده نباید ردیف را خراب کند؛ به همان حرفِ اول برمی‌گردیم.
        errorBuilder: (_, __, ___) => _initial(),
      ),
    );
  }

  Widget _initial() => Container(
        width: 26,
        height: 26,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: 0.08),
        ),
        child: Text(
          // بدونِ وابستگی به پکیجِ characters: اولین حرفِ نام؛ برای حروفِ
          // فارسی که در BMP هستند دقیقاً همان نتیجه را می‌دهد.
          name.isEmpty ? '؟' : String.fromCharCode(name.runes.first),
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Column(
          children: [
            Text(faNum(value),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
            const SizedBox(height: 2),
            Text(label,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 9.5, color: Colors.white60, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _CompactRules extends StatelessWidget {
  const _CompactRules({
    required this.percent,
    required this.purchasePercent,
    required this.threshold,
    required this.spins,
    required this.perDaily,
    required this.maxDaily,
  });

  final int percent;
  final int purchasePercent;
  final int threshold;
  final int spins;
  final int perDaily;
  final int maxDaily;

  /// ضریبِ «هر آستانه = چند چرخش» — از `live_rules`، با فول‌بکِ ۱ که
  /// همان مقدارِ امروزِ محصول است (`RULE_DEFS.spinsPerDailyThreshold`).
  /// صفحهٔ وب هم همین عدد را از `referral.spinsPerDailyThreshold` می‌گیرد؛
  /// خواندن از `rules` یعنی اگر سرورِ قدیمی آن فیلد را در `referral`
  /// نمی‌فرستاد، باز هم دو کلاینت یک عدد می‌دیدند.
  int get spinThreshold => liveRule('spinsPerDailyThreshold', 1);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified_user_rounded, color: Color(0xFFA3E635), size: 16),
              SizedBox(width: 6),
              Text('مزایای سیستم دعوت:', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 6),
          _bullet('${faNum(spins)} شانس رایگان گردونه برای هر دو نفر بلافاصله پس از ثبت کد.'),
          _bullet('${faNum(purchasePercent)}٪ درآمد نقدی از خریدهای دوست مستقیم؛ برداشت از ${faNum(threshold)} تومان.'),
          _bullet('${faNum(percent)}٪ کمیسیون امتیازی از امتیازات کارت و بازی ضربه‌زن دوست شما.'),
          // همان کلیدِ وب (`referral.dailySpinRule`) با همان
          // جای‌نگهدارها. «۱» قبلاً داخلِ این رشته سفت شده بود در حالی که
          // ضریبِ واقعی در `live_rules.spinsPerDailyThreshold` است — یعنی
          // ادمین می‌توانست «هر آستانه = ۲ چرخش» بکند و اندروید همچنان
          // «۱ چرخش» را نشان دهد.
          _bullet(liveText(
              'referral.dailySpinRule',
              'هر ${faNum(perDaily)} دعوت = ${faNum(spinThreshold)} چرخش روزانه دائمی به گردونه شانس (تا سقف ${faNum(maxDaily)} نفر).',
              vars: {
                'invitesPerDailySpin': perDaily,
                'spinsPerDailyThreshold': spinThreshold,
                'maxInvitesForDaily': maxDaily,
              })),
        ],
      ),
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('• ', style: TextStyle(color: Color(0xFFA3E635), fontWeight: FontWeight.w900)),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 11, color: Colors.white70, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _ShareChip extends StatelessWidget {
  const _ShareChip({required this.target, required this.onTap});
  final ShareTarget target;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = Color(target.color);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: brand.withValues(alpha: 0.14),
            border: Border.all(color: brand.withValues(alpha: 0.50)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              MessengerIcon(app: target.app, size: 18),
              const SizedBox(width: 6),
              Text(
                target.label,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
