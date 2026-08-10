import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/state_views.dart';
import '../../widgets/lifecycle_poller.dart';
import '../shared/public_profile_sheet.dart';
import 'games/pinned_banner.dart';

/// Group chat room: Canned messages only (no custom typing, no stickers).
class ChatPage extends StatefulWidget {
  final ApiClient api;
  const ChatPage({super.key, required this.api});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> with LifecyclePoller {
  List _messages = [];
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
      final res = await widget.api.get('/api/chat/bootstrap');
      if (!mounted) return;

      if (res is Map) {
        final cfg = res['config'] is Map ? res['config'] as Map : const {};
        final m = (res['messages'] is List) ? res['messages'] as List : const [];
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
          _cannedMessages = cm;
          _lastCount = m.length;
          _error = null;
          _loading = false;
        });
        _scrollToBottom(force: true);
      }
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

  Future<void> _sendCannedMessage(String text) async {
    if (_cooldownLeft > 0) return;

    try {
      final payload = <String, dynamic>{
        'message': text,
      };
      if (_reply != null) payload['replyTo'] = _reply!['id'];

      final sent = await widget.api.post('/api/chat/messages', payload);
      if (!mounted) return;
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

        // ── پنل زیبا و مدرن پیام‌های آماده ──
        _CannedMessagesPanel(
          cannedMessages: _cannedMessages,
          cooldownLeft: _cooldownLeft,
          onSend: _sendCannedMessage,
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
                  child: Text(text, style: const TextStyle(fontSize: 13, height: 1.35)),
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

/// پنل مدرن، زیبا و بدون تایپ پیام‌های آماده
class _CannedMessagesPanel extends StatelessWidget {
  const _CannedMessagesPanel({
    required this.cannedMessages,
    required this.cooldownLeft,
    required this.onSend,
  });

  final List cannedMessages;
  final int cooldownLeft;
  final void Function(String text) onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        border: const Border(top: BorderSide(color: Colors.white12)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(Icons.forum_outlined, size: 16, color: Color(0xFF38BDF8)),
              const SizedBox(width: 6),
              const Text(
                'ارسال پیام آماده:',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFFCBD5E1)),
              ),
              const Spacer(),
              if (cooldownLeft > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                    border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    'صبر کنید (${faNum(cooldownLeft)} ثانیه)',
                    style: const TextStyle(color: Color(0xFFEF4444), fontSize: 10, fontWeight: FontWeight.w800),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 96,
            child: GridView.builder(
              scrollDirection: Axis.horizontal,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 0.32,
              ),
              itemCount: cannedMessages.length,
              itemBuilder: (ctx, i) {
                final text = cannedMessages[i].toString();
                final disabled = cooldownLeft > 0;
                return InkWell(
                  onTap: disabled ? null : () => onSend(text),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: disabled ? Colors.white.withValues(alpha: 0.03) : const Color(0xFF1E293B),
                      border: Border.all(
                        color: disabled ? Colors.white10 : const Color(0xFF38BDF8).withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: disabled ? Colors.white38 : Colors.white,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
