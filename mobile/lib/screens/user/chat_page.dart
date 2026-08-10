import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';
import '../../widgets/lifecycle_poller.dart';
import '../shared/public_profile_sheet.dart';
import 'games/pinned_banner.dart';

/// Group chat room: lightning-fast bootstrap + background polling.
class ChatPage extends StatefulWidget {
  final ApiClient api;
  const ChatPage({super.key, required this.api});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> with LifecyclePoller {
  final _text = TextEditingController();
  List _messages = [];
  List _stickers = [];
  List _cannedMessages = [];
  Map? _reply;
  String? _error;
  Map<String, dynamic>? _pinned;
  final _scroll = ScrollController();
  int _lastCount = 0;
  int _cooldownSeconds = 0;
  int _cooldownLeft = 0;
  Timer? _cooldownTimer;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    startPolling(const Duration(seconds: 4), _refreshMessages);
  }

  @override
  void dispose() {
    stopPolling();
    _cooldownTimer?.cancel();
    _scroll.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _refreshMessages() async {
    try {
      final m = await widget.api.get('/api/chat/messages');
      if (!mounted) return;
      final count = (m is List) ? m.length : 0;
      final grew = count > _lastCount;
      _lastCount = count;
      setState(() {
        _messages = m;
        if (_error != null) _error = null;
      });
      if (grew) _scrollToBottom();
    } catch (_) {}
  }

  void _scrollToBottom({bool force = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final pos = _scroll.position;
      final nearBottom = pos.maxScrollExtent - pos.pixels < 260;
      if (!force && !nearBottom) return;
      pos.animateTo(
        pos.maxScrollExtent,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _startCooldown() {
    if (_cooldownSeconds <= 0) return;
    _cooldownTimer?.cancel();
    setState(() => _cooldownLeft = _cooldownSeconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _cooldownLeft--);
      if (_cooldownLeft <= 0) t.cancel();
    });
  }

  Future<void> _load() async {
    try {
      // 1-shot ultra-fast bootstrap endpoint
      final res = await widget.api.get('/api/chat/bootstrap');
      if (!mounted) return;

      if (res is Map) {
        final cfg = res['config'] is Map ? res['config'] as Map : const {};
        final m = (res['messages'] is List) ? res['messages'] as List : const [];
        final st = (res['stickers'] is List) ? res['stickers'] as List : const [];
        final cm = (res['cannedMessages'] is List) ? res['cannedMessages'] as List : const [];

        final pin = cfg['pinned'];
        if (pin is Map) _pinned = Map<String, dynamic>.from(pin);
        final cd = (cfg['messageCooldownSeconds'] as num?)?.toInt();
        if (cd != null) _cooldownSeconds = cd;

        if (cfg['eligible'] == false) {
          setState(() {
            _error =
                'برای چت باید حداقل ${faNum(cfg['minLifetimePoints'])} امتیاز تاریخی داشته باشید.';
            _loading = false;
          });
          return;
        }

        setState(() {
          _messages = m;
          _stickers = st;
          _cannedMessages = cm;
          _lastCount = m.length;
          _error = null;
          _loading = false;
        });
        _scrollToBottom(force: true);
      } else {
        // Fallback
        await _fallbackLoad();
      }
    } catch (e) {
      await _fallbackLoad();
    }
  }

  Future<void> _fallbackLoad() async {
    try {
      final batch = await Future.wait([
        widget.api.get('/api/chat/config'),
        widget.api.get('/api/chat/messages'),
        widget.api.get('/api/chat/stickers'),
        widget.api.get('/api/chat/canned-messages'),
      ]);
      if (!mounted) return;
      final cfg = batch[0] is Map ? batch[0] as Map : const {};
      final m = (batch[1] is List) ? batch[1] as List : const [];
      final st = (batch[2] is List) ? batch[2] as List : const [];
      final cm = (batch[3] is List) ? batch[3] as List : const [];

      final pin = cfg['pinned'];
      if (pin is Map) _pinned = Map<String, dynamic>.from(pin);
      final cd = (cfg['messageCooldownSeconds'] as num?)?.toInt();
      if (cd != null) _cooldownSeconds = cd;

      if (cfg['eligible'] == false) {
        setState(() {
          _error =
              'برای چت باید حداقل ${faNum(cfg['minLifetimePoints'])} امتیاز تاریخی داشته باشید.';
          _loading = false;
        });
        return;
      }

      setState(() {
        _messages = m;
        _stickers = st;
        _cannedMessages = cm;
        _lastCount = m.length;
        _error = null;
        _loading = false;
      });
      _scrollToBottom(force: true);
    } catch (e) {
      if (mounted) {
        final msg = apiError(e);
        setState(() {
          if (msg.isNotEmpty) _error = msg;
          _loading = false;
        });
      }
    }
  }

  Future<void> _send({String? text, String? stickerId}) async {
    final t = (text ?? _text.text).trim();
    if (t.isEmpty && stickerId == null) return;
    if (_cooldownLeft > 0) return;

    try {
      final payload = <String, dynamic>{};
      if (t.isNotEmpty) payload['message'] = t;
      if (stickerId != null) payload['stickerId'] = stickerId;
      if (_reply != null) payload['replyTo'] = _reply!['id'];

      final sent = await widget.api.post('/api/chat/messages', payload);
      if (!mounted) return;
      _text.clear();
      setState(() => _reply = null);
      _startCooldown();
      if (sent is Map) {
        setState(() => _messages.add(sent));
        _scrollToBottom(force: true);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    }
  }

  Future<void> _toggleLike(Map m) async {
    final id = m['id'];
    if (id == null) return;
    final liked = m['liked_by_me'] == true;
    setState(() {
      m['liked_by_me'] = !liked;
      m['like_count'] = ((m['like_count'] as num?)?.toInt() ?? 0) + (liked ? -1 : 1);
    });
    try {
      await widget.api.post('/api/chat/messages/$id/like', {});
    } catch (_) {
      if (!mounted) return;
      setState(() {
        m['liked_by_me'] = liked;
        m['like_count'] = ((m['like_count'] as num?)?.toInt() ?? 0) + (liked ? 1 : -1);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null && _messages.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(Gaps.md),
        child: ErrorBanner(message: _error!, onRetry: _load),
      );
    }

    final theme = Theme.of(context);
    return Column(
      children: [
        if (_pinned != null)
          PinnedBanner(
            pinned: _pinned!,
          ),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.sm),
            itemCount: _messages.length,
            itemBuilder: (context, i) {
              final m = _messages[i] as Map;
              final isMe = m['is_mine'] == true;
              return _MessageBubble(
                message: m,
                isMe: isMe,
                onReply: () => setState(() => _reply = m),
                onLike: () => _toggleLike(m),
                onOpenProfile: () {
                  final uid = m['user_id'];
                  if (uid != null) {
                    showPublicProfile(context, widget.api, uid);
                  }
                },
              );
            },
          ),
        ),
        if (_reply != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            color: theme.colorScheme.surfaceContainerHigh,
            child: Row(
              children: [
                const Icon(Icons.reply_rounded, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'پاسخ به ${_reply!['nickname'] ?? 'کاربر'}: ${_reply!['message_text'] ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, size: 16),
                  onPressed: () => setState(() => _reply = null),
                ),
              ],
            ),
          ),
        _InputBar(
          controller: _text,
          cooldownLeft: _cooldownLeft,
          stickers: _stickers,
          cannedMessages: _cannedMessages,
          onSend: _send,
        ),
      ],
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.isMe,
    required this.onReply,
    required this.onLike,
    required this.onOpenProfile,
  });

  final Map message;
  final bool isMe;
  final VoidCallback onReply;
  final VoidCallback onLike;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = message['message_text'] as String? ?? '';
    final sticker = message['sticker_url'] as String?;
    final liked = message['liked_by_me'] == true;
    final likes = (message['like_count'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onOpenProfile,
            borderRadius: BorderRadius.circular(16),
            child: AvatarImage(
              keyName: message['profile_avatar_key'],
              imageUrl: message['profile_image_url'],
              radius: 16,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    InkWell(
                      onTap: onOpenProfile,
                      child: DisplayName(
                        name: message['nickname'] ?? 'کاربر',
                        cosmetics: message['cosmetics'] is Map ? message['cosmetics'] as Map : null,
                        level: (message['level'] as num?)?.toInt(),
                        style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.reply_rounded, size: 14),
                      visualDensity: VisualDensity.compact,
                      onPressed: onReply,
                    ),
                  ],
                ),
                if (message['reply_text'] != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(6),
                      border: const Border(right: BorderSide(color: BrandColors.emerald, width: 2)),
                    ),
                    child: Text(
                      '${message['reply_nickname'] ?? ''}: ${message['reply_text']}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: Colors.white70),
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isMe ? BrandColors.blue.withValues(alpha: 0.20) : theme.colorScheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isMe ? BrandColors.blue.withValues(alpha: 0.35) : Colors.transparent,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (sticker != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: SafeImage(
                            url: sticker,
                            height: 72,
                            fit: BoxFit.contain,
                          ),
                        ),
                      if (text.isNotEmpty)
                        Text(text, style: const TextStyle(fontSize: 13, height: 1.35)),
                    ],
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    InkWell(
                      onTap: onLike,
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        child: Row(
                          children: [
                            Icon(
                              liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                              size: 13,
                              color: liked ? const Color(0xFFEF4444) : Colors.white54,
                            ),
                            if (likes > 0) ...[
                              const SizedBox(width: 3),
                              Text(
                                '$likes',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: liked ? const Color(0xFFEF4444) : Colors.white54,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InputBar extends StatefulWidget {
  const _InputBar({
    required this.controller,
    required this.cooldownLeft,
    required this.stickers,
    required this.cannedMessages,
    required this.onSend,
  });

  final TextEditingController controller;
  final int cooldownLeft;
  final List stickers;
  final List cannedMessages;
  final void Function({String? text, String? stickerId}) onSend;

  @override
  State<_InputBar> createState() => _InputBarState();
}

class _InputBarState extends State<_InputBar> {
  bool _showPanel = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (_showPanel)
          Container(
            height: 180,
            color: Theme.of(context).colorScheme.surfaceContainerHigh,
            child: DefaultTabController(
              length: 2,
              child: Column(
                children: [
                  const TabBar(
                    tabs: [
                      Tab(text: 'پیام‌های سریع'),
                      Tab(text: 'استیکرها'),
                    ],
                  ),
                  Expanded(
                    child: TabBarView(
                      children: [
                        ListView.builder(
                          padding: const EdgeInsets.all(8),
                          itemCount: widget.cannedMessages.length,
                          itemBuilder: (ctx, i) {
                            final msg = widget.cannedMessages[i].toString();
                            return ListTile(
                              dense: true,
                              title: Text(msg, style: const TextStyle(fontSize: 12)),
                              onTap: () {
                                setState(() => _showPanel = false);
                                widget.onSend(text: msg);
                              },
                            );
                          },
                        ),
                        GridView.builder(
                          padding: const EdgeInsets.all(8),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 4,
                            mainAxisSpacing: 8,
                            crossAxisSpacing: 8,
                          ),
                          itemCount: widget.stickers.length,
                          itemBuilder: (ctx, i) {
                            final st = widget.stickers[i] as Map;
                            return InkWell(
                              onTap: () {
                                setState(() => _showPanel = false);
                                widget.onSend(stickerId: st['id']);
                              },
                              child: SafeImage(url: st['image_url'], fit: BoxFit.contain),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        Container(
          padding: const EdgeInsets.all(8),
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            children: [
              IconButton(
                icon: Icon(_showPanel ? Icons.keyboard_rounded : Icons.emoji_emotions_outlined),
                onPressed: () => setState(() => _showPanel = !_showPanel),
              ),
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  decoration: InputDecoration(
                    hintText: widget.cooldownLeft > 0
                        ? 'صبر کنید (${faNum(widget.cooldownLeft)} ثانیه)...'
                        : 'پیام خود را بنویسید...',
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  onSubmitted: (_) => widget.onSend(),
                ),
              ),
              const SizedBox(width: 6),
              FilledButton(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(48, 44),
                  padding: EdgeInsets.zero,
                ),
                onPressed: widget.cooldownLeft > 0 ? null : () => widget.onSend(),
                child: const Icon(Icons.send_rounded, size: 18),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
