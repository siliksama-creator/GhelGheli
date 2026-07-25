import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/state_views.dart';
import '../shared/public_profile_sheet.dart';
import 'games/pinned_banner.dart';

/// Group chat room: same endpoints & polling cadence (3s) as the legacy
/// `ChatPage` — messages, stickers, replies, likes, reporting, emoji picker.
class ChatPage extends StatefulWidget {
  final ApiClient api;
  const ChatPage({super.key, required this.api});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _text = TextEditingController();
  List _messages = [];
  List _stickers = [];
  List _cannedMessages = [];
  Map? _reply;
  String? _error;
  Map<String, dynamic>? _pinned;
  Timer? _timer;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _text.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final cfg = await widget.api.get('/api/chat/config');
      final pin = cfg['pinned'];
      if (mounted && pin is Map) {
        setState(() => _pinned = Map<String, dynamic>.from(pin));
      }
      if (cfg['eligible'] != true) {
        if (mounted) {
          setState(() {
            _error =
                'برای چت باید حداقل ${faNum(cfg['minLifetimePoints'])} امتیاز تاریخی داشته باشید.';
            _loading = false;
          });
        }
        return;
      }
      final m = await widget.api.get('/api/chat/messages');
      final st = await widget.api.get('/api/chat/stickers');
      final cm = await widget.api.get('/api/chat/canned-messages');
      if (mounted) {
        setState(() {
          _messages = m;
          _stickers = st;
          _cannedMessages = cm;
          _error = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = apiError(e);
          _loading = false;
        });
      }
    }
  }

  Future<void> _send({String? stickerId}) async {
    try {
      if (stickerId == null && _text.text.trim().isEmpty) return;
      await widget.api.post('/api/chat/messages', {
        'message': _text.text,
        'stickerId': stickerId,
        'replyTo': _reply?['id'],
      });
      _text.clear();
      setState(() => _reply = null);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    }
  }

  Future<void> _like(String id) async {
    await widget.api.post('/api/chat/messages/$id/like', {});
    await _load();
  }

  
  Future<void> _pickCanned() async {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    // Invert colors for high contrast
    final bgColor = isDark ? Colors.white : Colors.black87;
    final textColor = isDark ? Colors.black : Colors.white;

    final e = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: bgColor,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: FractionallySizedBox(
          heightFactor: 0.6,
          child: Padding(
            padding: const EdgeInsets.all(Gaps.lg),
            child: ListView.separated(
              itemCount: _cannedMessages.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final msg = _cannedMessages[i];
                return InkWell(
                  onTap: () => Navigator.pop(context, msg),
                  borderRadius: Corners.rMd,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: textColor.withValues(alpha: 0.2)),
                      borderRadius: Corners.rMd,
                    ),
                    child: Text(
                      msg,
                      style: TextStyle(fontSize: 16, color: textColor, fontWeight: FontWeight.bold),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
    if (e != null) {
      _text.text = e;
      _send(); // Auto send
    }
  }


  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Padding(
          padding:
              const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.sm),
          child: AppCard(
            padding: const EdgeInsets.all(Gaps.md),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: Corners.rMd,
                  child: Image.asset('assets/brand/chat_banner.webp',
                      width: 64, height: 56, fit: BoxFit.cover),
                ),
                Gaps.hMd,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('چت روم قلقلی', style: theme.textTheme.titleSmall),
                      const SizedBox(height: 2),
                      // The old "avoid profanity" line was removed: users can
                      // only send predefined messages now, so it warned about
                      // something that is no longer possible. The slot below
                      // is an admin-pinned announcement instead.
                      Text('با هواداران دیگر گفتگو کن ⚽',
                          style: theme.textTheme.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        PinnedBanner(pinned: _pinned),
        if (_loading)
          const Expanded(child: LoadingView())
        else if (_error != null)
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(Gaps.xl),
                child:
                    EmptyState(icon: Icons.lock_clock_rounded, title: _error!),
              ),
            ),
          )
        else
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: Gaps.md),
              children: [
                if (_stickers.isNotEmpty)
                  SizedBox(
                    height: 74,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _stickers.length,
                      separatorBuilder: (_, __) => Gaps.hXs,
                      itemBuilder: (_, i) {
                        final st = _stickers[i];
                        return InkWell(
                          borderRadius: Corners.rLg,
                          onTap: () => _send(stickerId: st['id']),
                          child: Container(
                            width: 66,
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                                color: theme.colorScheme.surfaceContainerHigh,
                                borderRadius: Corners.rLg),
                            child: Image.network(fullAssetUrl(st['image_url']),
                                fit: BoxFit.contain),
                          ),
                        );
                      },
                    ),
                  ),
                Gaps.vXs,
                ..._messages.map((m) => _ChatBubble(
                      message: m,
                      onTapAvatar: () =>
                          showPublicProfile(context, widget.api, m['user_id']),
                      onReply: () => setState(() => _reply = Map.from(m)),
                      onLike: () => _like(m['id']),
                      onReport: () => widget.api
                          .post('/api/chat/messages/${m['id']}/report', {}),
                    )),
                Gaps.vMd,
              ],
            ),
          ),
        if (_reply != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
                horizontal: Gaps.lg, vertical: Gaps.xs),
            color: theme.colorScheme.primary.withValues(alpha: 0.12),
            child: Row(
              children: [
                Icon(Icons.reply_rounded,
                    size: 16, color: theme.colorScheme.primary),
                Gaps.hXs,
                Expanded(
                  child: Text(
                    'در پاسخ به: ${_reply?['message_text'] ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                IconButton(
                    onPressed: () => setState(() => _reply = null),
                    icon: const Icon(Icons.close_rounded, size: 18)),
              ],
            ),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(Gaps.md),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.all(16),
                      shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
                    ),
                    onPressed: _error != null ? null : _pickCanned,
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('انتخاب پیام آماده...'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ChatBubble extends StatelessWidget {
  final Map message;
  final VoidCallback onTapAvatar;
  final VoidCallback onReply;
  final VoidCallback onLike;
  final VoidCallback onReport;

  const _ChatBubble({
    required this.message,
    required this.onTapAvatar,
    required this.onReply,
    required this.onLike,
    required this.onReport,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isSticker =
        message['message_type'] == 'sticker' && message['sticker_url'] != null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: AppCard(
        elevated: false,
        padding: const EdgeInsets.all(Gaps.sm + 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GestureDetector(
              onTap: onTapAvatar,
              child: AvatarImage(
                  keyName: message['profile_avatar_key'],
                  imageUrl: message['profile_image_url'],
                  radius: 19),
            ),
            Gaps.hSm,
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          message['nickname'] ??
                              message['first_name'] ??
                              'کاربر',
                          style: theme.textTheme.titleSmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: Icon(Icons.flag_outlined,
                            size: 17,
                            color: theme.colorScheme.onSurfaceVariant),
                        onPressed: onReport,
                      ),
                    ],
                  ),
                  if (message['reply_text'] != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        '↩ ${message['reply_nickname'] ?? 'کاربر'}: ${message['reply_text']}',
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.primary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  isSticker
                      ? Image.network(fullAssetUrl(message['sticker_url']),
                          width: 100, height: 100, fit: BoxFit.contain)
                      : Text(message['message_text'] ?? '',
                          style: theme.textTheme.bodyMedium),
                  Gaps.vXxs,
                  Row(
                    children: [
                      InkWell(
                        borderRadius: Corners.rSm,
                        onTap: onReply,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 3),
                          child: Text('ریپلای',
                              style: theme.textTheme.labelMedium
                                  ?.copyWith(color: theme.colorScheme.primary)),
                        ),
                      ),
                      Gaps.hXs,
                      InkWell(
                        borderRadius: Corners.rSm,
                        onTap: onLike,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 3),
                          child: Text('❤ ${faNum(message['like_count'] ?? 0)}',
                              style: theme.textTheme.labelMedium),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
