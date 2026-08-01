// Notification bell for the user app bar.
//
// THE BUG THIS FIXES: the admin panel can broadcast announcements
// (POST /api/admin/notifications/broadcast) and the API serves them from
// GET /api/notifications, but no client ever rendered them — every
// announcement an admin sent was written to the database and never seen by
// anyone. The web app got the same treatment in userweb/src/main.jsx.
//
// Polling (not sockets) on purpose: announcements are not time-critical and
// the socket connection is reserved for live gameplay.
import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../theme/tokens.dart';

class NotificationBell extends StatefulWidget {
  const NotificationBell({super.key, required this.api});

  final ApiClient api;

  @override
  State<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<NotificationBell> {
  List<Map<String, dynamic>> _items = const [];
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get('/api/notifications');
      if (!mounted || res is! List) return;
      setState(() => _items = res
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList());
    } catch (_) {
      // An announcement is not worth an error state; try again next tick.
    }
  }

  int get _unread => _items.where((n) => n['is_read'] != true).length;

  Future<void> _markRead(Map<String, dynamic> n) async {
    if (n['is_read'] == true) return;
    setState(() => n['is_read'] = true);
    try {
      await widget.api.patch('/api/notifications/${n['id']}/read', {});
    } catch (_) {/* local state already reflects it */}
  }

  void _open() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (ctx, controller) => StatefulBuilder(
          builder: (ctx, setSheet) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    Gaps.lg, 0, Gaps.lg, Gaps.sm),
                child: Text('اعلان‌ها',
                    style: Theme.of(ctx)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              Expanded(
                child: _items.isEmpty
                    ? const Center(child: Text('📭 اعلانی نداری.'))
                    : ListView.separated(
                        controller: controller,
                        padding: const EdgeInsets.fromLTRB(
                            Gaps.md, 0, Gaps.md, Gaps.xl),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => Gaps.vXs,
                        itemBuilder: (_, i) {
                          final n = _items[i];
                          final unread = n['is_read'] != true;
                          return Material(
                            color: unread
                                ? const Color(0xFF84CC16).withValues(alpha: 0.12)
                                : Theme.of(ctx)
                                    .colorScheme
                                    .onSurface
                                    .withValues(alpha: 0.04),
                            borderRadius: Corners.rMd,
                            child: InkWell(
                              borderRadius: Corners.rMd,
                              onTap: () {
                                _markRead(n);
                                setSheet(() {});
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(Gaps.sm),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text('${n['title'] ?? ''}',
                                        style: Theme.of(ctx)
                                            .textTheme
                                            .titleSmall
                                            ?.copyWith(
                                                fontWeight: FontWeight.w800)),
                                    Gaps.vXxs,
                                    Text('${n['body'] ?? ''}',
                                        style: Theme.of(ctx)
                                            .textTheme
                                            .bodySmall),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          tooltip: 'اعلان‌ها',
          onPressed: _open,
          icon: const Icon(Icons.notifications_none_rounded),
        ),
        if (_unread > 0)
          Positioned(
            top: 6,
            right: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              constraints: const BoxConstraints(minWidth: 17),
              decoration: BoxDecoration(
                color: const Color(0xFFFF5D6C),
                borderRadius: Corners.rPill,
              ),
              child: Text(
                faNum(_unread),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  height: 1.3,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
