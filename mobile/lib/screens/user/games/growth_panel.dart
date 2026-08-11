import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import '../../../theme/tokens.dart';

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
      final response = await widget.api.get('/api/growth/overview', fresh: true);
      if (mounted && response is Map) setState(() => _data = Map<String, dynamic>.from(response));
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
        if (mounted) setState(() {
          _busy = null;
          _notice = answer['ok'] == true
              ? 'دعوت برای ${friend['nickname']} ارسال شد؛ همین‌جا منتظر بمان'
              : '${answer['error'] ?? 'ارسال دعوت ناموفق بود'}';
        });
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
    final missions = ((_data?['missions'] as List?) ?? const []).whereType<Map>().toList();
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
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('ماموریت و دوستان', style: TextStyle(fontWeight: FontWeight.w900)),
            Text('یک کار کوتاه، یک حریف واقعی، یک دلیل برای برگشتن', style: TextStyle(fontSize: 9.5, color: Colors.white54)),
          ])),
          Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(color: const Color(0xFF22E7A6).withValues(alpha: .13), borderRadius: Corners.rPill),
            child: Text('${friends.where((f) => f['online'] == true).length} آنلاین', style: const TextStyle(color: Color(0xFF22E7A6), fontSize: 9.5, fontWeight: FontWeight.w900))),
        ]),
        Gaps.vSm,
        SizedBox(height: 132, child: ListView.separated(scrollDirection: Axis.horizontal,
          itemCount: missions.length, separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, index) {
            final m = missions[index];
            final complete = m['complete'] == true; final claimed = m['claimed'] == true;
            final progress = (m['progress'] as num?)?.toDouble() ?? 0; final goal = (m['goal'] as num?)?.toDouble() ?? 1;
            return Container(width: 190, padding: const EdgeInsets.all(10), decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .045), borderRadius: Corners.rMd,
              border: Border.all(color: complete ? const Color(0xFFFFD166) : Colors.white12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m['period'] == 'daily' ? 'روزانه' : 'هفتگی', style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 8.5)),
                Text('${m['title']}', maxLines: 1, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
                Text('${m['description']}', maxLines: 1, style: const TextStyle(fontSize: 8.5, color: Colors.white54)),
                const Spacer(), LinearProgressIndicator(value: (progress / goal).clamp(0.0, 1.0), minHeight: 5),
                const SizedBox(height: 5), Row(children: [
                  Expanded(child: Text('${m['progress']}/${m['goal']} · ${m['reward']} امتیاز', style: const TextStyle(fontSize: 8.5))),
                  SizedBox(height: 27, child: FilledButton(onPressed: !complete || claimed ? null : () => _run('${m['key']}', () => widget.api.post('/api/missions/${m['key']}/claim', {})),
                    child: Text(claimed ? 'گرفته شد' : complete ? 'دریافت' : 'ادامه', style: const TextStyle(fontSize: 8.5)))),
                ]),
              ]),
            );
          })),
        Gaps.vSm,
        for (final friend in incoming) _friendRow(friend, incoming: true),
        for (final friend in friends.take(5)) _friendRow(friend),
        if (friends.isEmpty && incoming.isEmpty) const Text('هنوز دوستی اضافه نکرده‌ای؛ با نام قلقلی جستجو کن.', style: TextStyle(fontSize: 9.5, color: Colors.white54)),
        Gaps.vXs,
        Row(children: [
          Expanded(child: TextField(controller: _search, textInputAction: TextInputAction.search, onSubmitted: (_) => _find(), decoration: const InputDecoration(isDense: true, hintText: 'جستجوی نام دوست…'))),
          Gaps.hXs, IconButton.filled(onPressed: _find, icon: const Icon(Icons.person_search_rounded)),
        ]),
        for (final user in _results.take(5)) _searchRow(user),
        if (_notice != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_notice!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFFD166), fontSize: 9.5))),
      ]),
    );
  }

  Widget _friendRow(Map friend, {bool incoming = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Row(children: [
      Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: friend['online'] == true ? const Color(0xFF22E7A6) : Colors.blueGrey)),
      Gaps.hXs, Expanded(child: Text('${friend['nickname'] ?? 'کاربر'}', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800))),
      if (incoming) SizedBox(height: 29, child: FilledButton(onPressed: () => _run('${friend['friendshipId']}', () => widget.api.post('/api/friends/requests/${friend['friendshipId']}/accept', {})), child: const Text('قبول', style: TextStyle(fontSize: 9))))
      else SizedBox(height: 29, child: OutlinedButton(onPressed: friend['online'] == true ? () => _challenge(friend) : null, child: const Text('چالش', style: TextStyle(fontSize: 9)))),
    ]),
  );

  Widget _searchRow(Map user) => Padding(padding: const EdgeInsets.only(top: 5), child: Row(children: [
    Expanded(child: Text('${user['nickname'] ?? 'کاربر'}', style: const TextStyle(fontSize: 10))),
    SizedBox(height: 28, child: OutlinedButton(onPressed: user['relation'] == 'none' ? () => _run('${user['id']}', () => widget.api.post('/api/friends/${user['id']}/request', {})) : null,
      child: Text(user['relation'] == 'none' ? 'افزودن' : 'در انتظار', style: const TextStyle(fontSize: 8.5)))),
  ]));
}
