import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import '../../../core/share_invite.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/ui_icon.dart';

class GrowthPanel extends StatefulWidget {
  const GrowthPanel({super.key, required this.api, required this.onJoinGame});
  final ApiClient api;
  final void Function(io.Socket socket, Map<String, dynamic> start) onJoinGame;

  @override
  State<GrowthPanel> createState() => _GrowthPanelState();
}

class _GrowthPanelState extends State<GrowthPanel> {
  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _results = [];
  final _search = TextEditingController();
  io.Socket? _socket;
  bool _socketTransferred = false;
  bool _searchOpen = false;
  String? _busy;
  String? _notice;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _connect();
  }

  void _connect() {
    final s = io.io(widget.api.baseUrl, io.OptionBuilder()
        .setTransports(['websocket', 'polling'])
        .setAuth({'token': widget.api.token})
        .enableForceNew().enableReconnection().build());
    _socket = s;
    s.on('friends:presence', (_) => unawaited(_load()));
    s.on('friend:challenge', (dynamic raw) async {
      if (!mounted || raw is! Map) return;
      final invite = Map<String, dynamic>.from(raw);
      final accept = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
        title: const Text('دعوت به دوئل کارت‌ها'),
        content: Text('${invite['from'] is Map ? invite['from']['nickname'] : 'دوستت'} تو را به یک نبرد مستقیم دعوت کرده است.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('فعلاً نه')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('ورود به آرنا')),
        ],
      ));
      if (accept == true) {
        s.emit('game:join_room', {'roomCode': invite['roomCode']});
        if (mounted) setState(() => _notice = 'در حال ورود به چالش…');
      }
    });
    s.on('game:start', (dynamic raw) {
      if (!mounted || raw is! Map) return;
      _socketTransferred = true;
      for (final event in const ['friends:presence', 'friend:challenge', 'game:start', 'game:error']) {
        s.off(event);
      }
      widget.onJoinGame(s, Map<String, dynamic>.from(raw));
    });
    s.on('game:error', (dynamic raw) {
      if (!mounted) return;
      setState(() => _notice = raw is Map ? '${raw['message'] ?? 'عملیات ناموفق بود'}' : 'عملیات ناموفق بود');
    });
  }

  Future<void> _load() async {
    try {
      final responses = await Future.wait([
        widget.api.get('/api/growth/overview', fresh: true),
        widget.api.get('/api/referrals', fresh: true),
      ]);
      final response = responses[0];
      if (mounted && response is Map) {
        final merged = Map<String, dynamic>.from(response);
        if (responses[1] is Map) merged['referral'] = Map<String, dynamic>.from(responses[1] as Map);
        setState(() => _data = merged);
      }
    } catch (error) {
      if (mounted) setState(() => _notice = apiError(error));
    }
  }

  Future<void> _run(String key, Future<dynamic> Function() action) async {
    if (_busy != null) return;
    setState(() { _busy = key; _notice = null; });
    try {
      final response = await action();
      if (mounted) setState(() => _notice = response is Map ? '${response['message'] ?? 'انجام شد'}' : 'انجام شد');
      await _load();
    } catch (error) {
      if (mounted) setState(() => _notice = apiError(error));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _find() async {
    final q = _search.text.trim();
    if (q.length < 2) return;
    try {
      final response = await widget.api.get('/api/friends/search?q=${Uri.encodeQueryComponent(q)}', fresh: true);
      if (mounted && response is List) setState(() => _results = response.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
    } catch (error) {
      if (mounted) setState(() => _notice = apiError(error));
    }
  }

  Future<void> _inviteFriend() async {
    final referral = _data?['referral'];
    final code = referral is Map ? '${referral['code'] ?? ''}' : '';
    if (code.isEmpty) return;
    final target = await showModalBottomSheet<ShareTarget>(
      context: context,
      backgroundColor: const Color(0xFF0B1725),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('دعوت از یک دوست', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
            const Text('هر دو ۳ چرخش هدیه می‌گیرید و خرید مستقیم دوستت برایت ۵٪ درآمد معرفی می‌سازد.',
                style: TextStyle(fontSize: 10.5, color: Colors.white60, height: 1.5)),
            Gaps.vSm,
            for (final item in shareTargets)
              ListTile(
                leading: MessengerIcon(app: item.app, size: 28),
                title: Text(item.label),
                trailing: const Icon(Icons.chevron_left_rounded),
                onTap: () => Navigator.pop(ctx, item),
              ),
          ]),
        ),
      ),
    );
    if (target == null) return;
    final result = await shareInvite(target, code);
    if (mounted) setState(() => _notice = result == ShareOutcome.copiedOnly ? 'متن دعوت کپی شد' : 'دعوت آماده ارسال شد');
  }

  void _challenge(Map friend) {
    final s = _socket;
    if (s == null || s.connected != true || _busy != null) return;
    setState(() { _busy = 'challenge-${friend['id']}'; _notice = 'در حال ساخت اتاق مستقیم…'; });
    s.emitWithAck('game:create_room', {'gameId': 'card_duel'}, ack: (dynamic roomRaw) {
      final room = roomRaw is Map ? Map<String, dynamic>.from(roomRaw) : <String, dynamic>{};
      if (room['ok'] != true) {
        if (mounted) setState(() { _busy = null; _notice = '${room['error'] ?? 'ساخت اتاق ناموفق بود'}'; });
        return;
      }
      s.emitWithAck('friend:challenge', {
        'targetUserId': friend['id'], 'roomCode': room['roomCode'],
        'gameId': 'card_duel', 'platform': 'android',
      }, ack: (dynamic answerRaw) {
        final answer = answerRaw is Map ? answerRaw : const {};
        if (mounted) {
          setState(() {
            _busy = null;
            _notice = answer['ok'] == true
                ? 'دعوت برای ${friend['nickname']} ارسال شد'
                : '${answer['error'] ?? 'ارسال دعوت ناموفق بود'}';
          });
        }
      });
    });
  }

  @override
  void dispose() {
    if (!_socketTransferred) _socket?.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final daily = ((_data?['daily'] as List?) ?? const []).whereType<Map>().toList()
      ..sort((a, b) => (a['claimed'] == true ? 1 : 0).compareTo(b['claimed'] == true ? 1 : 0));
    final weekly = ((_data?['weekly'] as List?) ?? const []).whereType<Map>().toList();
    final bonus = _data?['dailyBonus'] is Map ? _data!['dailyBonus'] as Map : const {};
    final friends = ((_data?['friends'] as List?) ?? const []).whereType<Map>().toList();
    final incoming = ((_data?['incoming'] as List?) ?? const []).whereType<Map>().toList();
    return Container(
      padding: const EdgeInsets.all(Gaps.md),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: const LinearGradient(colors: [Color(0xFF0C2135), Color(0xFF120B28)]),
        border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: .28)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Image.asset(
            'assets/games/social_mission_badge.png',
            width: 54,
            height: 54,
            cacheWidth: 162,
            filterQuality: FilterQuality.medium,
          ),
          Gaps.hXs,
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('ماموریت و دوستان', style: TextStyle(fontWeight: FontWeight.w900)),
            Text('پاداش بگیر؛ حریف آنلاین پیدا کن', style: TextStyle(fontSize: 12.5, color: Color(0xFFADC0D3))),
          ])),
          Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(color: const Color(0xFF22E7A6).withValues(alpha: .13), borderRadius: Corners.rPill),
            child: Text('${friends.where((f) => f['online'] == true).length} آنلاین', style: const TextStyle(color: Color(0xFF22E7A6), fontSize: 9.5, fontWeight: FontWeight.w900))),
        ]),
        Gaps.vSm,
        _DailyMissionSummary(
          completed: (bonus['completed'] as num?)?.toInt() ?? 0,
          poolSize: ((_data?['rotation'] as Map?)?['dailyPoolSize'] as num?)?.toInt() ?? 120,
          onInvite: _inviteFriend,
        ),
        Gaps.vXs,
        _DailyBonusCard(
          bonus: bonus,
          busy: _busy == 'daily-bonus',
          onClaim: () => _run('daily-bonus', () => widget.api.post('/api/missions/daily-bonus/claim', {})),
        ),
        Gaps.vSm,
        const Text('ماموریت‌های امروز', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, letterSpacing: -0.2)),
        Gaps.vXs,
        SizedBox(height: 176, child: ListView.separated(scrollDirection: Axis.horizontal,
          itemCount: daily.length, separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, index) {
            final m = daily[index];
            final complete = m['complete'] == true; final claimed = m['claimed'] == true;
            final progress = (m['progress'] as num?)?.toDouble() ?? 0; final goal = (m['goal'] as num?)?.toDouble() ?? 1;
            return Container(width: 226, padding: const EdgeInsets.all(12), decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .045), borderRadius: Corners.rMd,
              border: Border.all(color: complete ? const Color(0xFFFFD166) : Colors.white12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(m['period'] == 'daily' ? 'روزانه' : 'هفتگی', style: const TextStyle(color: Color(0xFF7DD8FF), fontSize: 11.5, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  Text('+${faNum(m['reward'])}', style: const TextStyle(color: Color(0xFFFFD166), fontSize: 14.5, fontWeight: FontWeight.w900)),
                ]),
                Text('${m['title']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, height: 1.35)),
                Text('${m['description']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFFB6C6D8), height: 1.5)),
                const Spacer(), ClipRRect(borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(value: (progress / goal).clamp(0.0, 1.0), minHeight: 9)),
                const SizedBox(height: 7), Row(children: [
                  Expanded(child: Text('${m['progress']}/${m['goal']}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800))),
                  SizedBox(height: 34, child: FilledButton(
                    style: _compactClaimStyle(),
                    onPressed: !complete || claimed ? null : () => _run('${m['key']}', () => widget.api.post('/api/missions/${m['key']}/claim', {})),
                    child: Text(claimed ? 'گرفته شد' : complete ? 'دریافت' : 'ادامه', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)))),
                ]),
              ]),
            );
          })),
        Gaps.vSm,
        _WeeklyMissions(
          missions: weekly,
          busy: _busy,
          onClaim: (mission) => _run('${mission['key']}', () => widget.api.post('/api/missions/${mission['key']}/claim', {})),
        ),
        Gaps.vSm,
        const Text('دوستان و چالش مستقیم', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, letterSpacing: -0.2)),
        Gaps.vXs,
        for (final friend in incoming) _friendRow(friend, incoming: true),
        for (final friend in friends) _friendRow(friend),
        Row(children: [
          Expanded(child: SizedBox(
            height: 38,
            child: FilledButton.icon(
              onPressed: _inviteFriend,
              icon: const Icon(Icons.ios_share_rounded, size: 17),
              label: const Text('دعوت از یک دوست', style: TextStyle(fontSize: 9.5)),
            ),
          )),
          Gaps.hXs,
          Expanded(child: SizedBox(
            height: 38,
            child: OutlinedButton.icon(
              onPressed: () => setState(() => _searchOpen = !_searchOpen),
              icon: Icon(_searchOpen ? Icons.close_rounded : Icons.person_add_alt_1_rounded, size: 17),
              label: Text(_searchOpen ? 'بستن جستجو' : 'پیدا کردن دوست', style: const TextStyle(fontSize: 9.5)),
            ),
          )),
        ]),
        if (_searchOpen) ...[
          Gaps.vXs,
          Row(children: [
            Expanded(child: TextField(controller: _search, textInputAction: TextInputAction.search, onSubmitted: (_) => _find(), decoration: const InputDecoration(isDense: true, hintText: 'نام قلقلی دوست…'))),
            Gaps.hXs,
            IconButton.filled(onPressed: _find, icon: const Icon(Icons.search_rounded)),
          ]),
          for (final user in _results.take(5)) _searchRow(user),
        ],
        if (_notice != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_notice!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFFD166), fontSize: 9.5))),
      ]),
    );
  }

  Widget _friendRow(Map friend, {bool incoming = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Row(children: [
      Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: friend['online'] == true ? const Color(0xFF22E7A6) : Colors.blueGrey)),
      Gaps.hXs, Expanded(child: Text('${friend['nickname'] ?? 'کاربر'}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800))),
      if (incoming) SizedBox(height: 29, child: FilledButton(
        style: _compactClaimStyle(height: 29),
        onPressed: () => _run('${friend['friendshipId']}', () => widget.api.post('/api/friends/requests/${friend['friendshipId']}/accept', {})),
        child: const Text('قبول', style: TextStyle(fontSize: 9.5))))
      else SizedBox(height: 29, child: OutlinedButton(
        style: _compactClaimStyle(height: 29),
        onPressed: friend['online'] == true ? () => _challenge(friend) : null,
        child: const Text('چالش', style: TextStyle(fontSize: 9.5)))),
    ]),
  );

  Widget _searchRow(Map user) => Padding(padding: const EdgeInsets.only(top: 5), child: Row(children: [
    Expanded(child: Text('${user['nickname'] ?? 'کاربر'}', style: const TextStyle(fontSize: 10))),
    SizedBox(height: 28, child: OutlinedButton(
      style: _compactClaimStyle(height: 28),
      onPressed: user['relation'] == 'none' ? () => _run('${user['id']}', () => widget.api.post('/api/friends/${user['id']}/request', {})) : null,
      child: Text(user['relation'] == 'none' ? 'افزودن' : 'در انتظار', style: const TextStyle(fontSize: 9.5)))),
  ]));
}

class _DailyMissionSummary extends StatelessWidget {
  const _DailyMissionSummary({required this.completed, required this.poolSize, required this.onInvite});
  final int completed;
  final int poolSize;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(11),
    decoration: BoxDecoration(
      borderRadius: Corners.rLg,
      gradient: const LinearGradient(colors: [Color(0x2238BDF8), Color(0x22A855F7)]),
      border: Border.all(color: Colors.white12),
    ),
    child: Row(children: [
      SizedBox.square(
        dimension: 58,
        child: Stack(alignment: Alignment.center, children: [
          CircularProgressIndicator(
            value: (completed / 5).clamp(0.0, 1.0).toDouble(),
            strokeWidth: 5,
            color: const Color(0xFF22E7A6),
            backgroundColor: Colors.white12,
          ),
          Text('${faNum(completed)}/۵', style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
        ]),
      ),
      Gaps.hSm,
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('هر روز ۵ ماموریت تازه', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
        Text('از میان بیش از ${faNum(poolSize)} ماموریت؛ هر پنج‌تا را کامل کن.',
            style: const TextStyle(fontSize: 12, color: Color(0xFFADC0D3), height: 1.6)),
      ])),
      IconButton.filledTonal(
        tooltip: 'دعوت از یک دوست',
        onPressed: onInvite,
        icon: const Icon(Icons.person_add_alt_1_rounded, size: 19),
      ),
    ]),
  );
}

class _DailyBonusCard extends StatelessWidget {
  const _DailyBonusCard({required this.bonus, required this.busy, required this.onClaim});
  final Map bonus;
  final bool busy;
  final VoidCallback onClaim;

  @override
  Widget build(BuildContext context) {
    final ready = bonus['ready'] == true;
    final claimed = bonus['claimed'] == true;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        borderRadius: Corners.rLg,
        gradient: ready
            ? const LinearGradient(colors: [Color(0x33FFD166), Color(0x22A855F7)])
            : const LinearGradient(colors: [Color(0x0FFFFFFF), Color(0x08FFFFFF)]),
        border: Border.all(color: ready ? const Color(0xAAFFD166) : Colors.white12),
        boxShadow: ready ? const [BoxShadow(color: Color(0x33FFD166), blurRadius: 20)] : null,
      ),
      child: Row(children: [
        const UiIcon('gift', size: 28, color: Color(0xFFFFD166)),
        Gaps.hXs,
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('جایزه تکمیل هر ۵ ماموریت', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
          Text('+${faNum(bonus['reward'] ?? 100)} امتیاز اضافه امروز',
              style: const TextStyle(fontSize: 8.5, color: Color(0xFFFFD166))),
        ])),
        SizedBox(width: 82, height: 30, child: FilledButton(
          style: _compactClaimStyle(height: 30),
          onPressed: ready && !claimed && !busy ? onClaim : null,
          child: Text(claimed ? 'گرفته شد' : ready ? 'دریافت' : '${faNum(bonus['completed'] ?? 0)}/۵',
              style: const TextStyle(fontSize: 8.5)),
        )),
      ]),
    );
  }
}

/// استایلِ دکمه‌های ریزِ داخلِ کارت‌های ماموریت.
///
/// ═══════════════════════════════════════════════════════════════════
/// چرا این استایل لازم شد — باگِ «دکمهٔ دریافت دیده نمی‌شود»
/// ═══════════════════════════════════════════════════════════════════
///
/// گزارشِ مالک: دکمهٔ دریافتِ امتیازِ ماموریت‌ها در اندروید دیده نمی‌شد.
/// دکمه در کد بود، endpoint هم بود، دادهٔ سرور هم درست بود.
///
/// علت در تم بود:
///
///     minimumSize: const Size.fromHeight(TouchTarget.comfortable)
///
/// ‏`Size.fromHeight(52)` معادلِ `Size(double.infinity, 52)` است — یعنی
/// **کمینه‌عرضِ بی‌نهایت**. این دکمه‌ها در یک `Row` داخلِ کارتِ ۱۹۰
/// پیکسلی می‌نشینند و قیدِ عرضِ بی‌نهایت آنجا معتبر نیست. نتیجه، در
/// آزمونِ واقعیِ ویجت اندازه‌گیری شد:
///
///     BoxConstraints forces an infinite width.
///     The offending constraints were: BoxConstraints(w=Infinity, h=27.0)
///
/// یعنی دکمه اصلاً **چیدمان نمی‌شد** و رندر نمی‌شد؛ دقیقاً همان
/// «دیده نمی‌شود». در build نهاییِ release این خطاها بی‌صدا رد می‌شوند
/// و فقط جای خالی می‌ماند — برای همین کسی خطایی نمی‌دید.
///
/// تعارضِ دوم: کمینه‌ارتفاعِ ۵۲ در برابرِ `SizedBox(height: 27)`.
///
/// چرا تم را سراسری عوض نکردیم: اندازه‌گیری شد که تغییرِ
/// `Size.fromHeight(52)` به `Size(0, 52)` دکمه‌های تمام‌عرضِ برنامه را
/// از ۸۰۰ به ۱۲۴ پیکسل جمع می‌کند (الگوهای `Center` و `Column` بدونِ
/// stretch). آن یک رگرسیونِ بصریِ سراسری بود برای رفعِ یک باگِ محلی.
/// پس فقط همین دکمه‌های ریز استایلِ صریح می‌گیرند.
ButtonStyle _compactClaimStyle({double height = 27}) => ButtonStyle(
      // کمینه‌عرضِ صفر: مهم‌ترین خط. دکمه اندازهٔ محتوایش را می‌گیرد.
      minimumSize: WidgetStatePropertyAll(Size(0, height)),
      // بدونِ سقفِ ارتفاع، دکمه دوباره به ۵۲ کش می‌آید.
      maximumSize: WidgetStatePropertyAll(Size(double.infinity, height)),
      padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 10)),
      // ناحیهٔ لمسِ ۴۸ پیکسلیِ متریال، جعبهٔ ۲۷ پیکسلی را از داخل
      // بزرگ می‌کند و باعثِ سرریز می‌شود.
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );

class _WeeklyMissions extends StatelessWidget {
  const _WeeklyMissions({required this.missions, required this.busy, required this.onClaim});
  final List<Map> missions;
  final String? busy;
  final ValueChanged<Map> onClaim;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .035),
      borderRadius: Corners.rLg,
      border: Border.all(color: Colors.white10),
    ),
    child: Material(
      color: Colors.transparent,
      borderRadius: Corners.rLg,
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 11),
      childrenPadding: const EdgeInsets.fromLTRB(9, 0, 9, 8),
      leading: const Icon(Icons.calendar_month_rounded, color: Color(0xFFC084FC)),
      title: const Text('ماموریت‌های این هفته', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900)),
      subtitle: Text('${faNum(missions.length)} ماموریت جداگانه', style: const TextStyle(fontSize: 11.5, color: Color(0xFFA3B4C6), fontWeight: FontWeight.w800)),
      children: [
        for (final mission in missions)
          Container(
            margin: const EdgeInsets.only(top: 5),
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: .035), borderRadius: Corners.rMd),
            child: Row(children: [
              UiIcon((mission['icon'] ?? 'calendar').toString(), size: 22, color: const Color(0xFFFFD166)),
              Gaps.hXs,
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${mission['title']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
                Text('${mission['progress']}/${mission['goal']} · +${mission['reward']} امتیاز',
                    style: const TextStyle(fontSize: 11.5, color: Color(0xFFB6C6D8), fontWeight: FontWeight.w700)),
              ])),
              SizedBox(width: 92, height: 34, child: OutlinedButton(
                style: _compactClaimStyle(height: 34),
                onPressed: mission['complete'] == true && mission['claimed'] != true && busy != '${mission['key']}'
                    ? () => onClaim(mission) : null,
                child: Text(mission['claimed'] == true ? 'گرفته شد' : 'دریافت', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900)),
              )),
            ]),
          ),
      ],
      ),
    ),
  );
}
