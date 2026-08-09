import 'dart:async';

import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';
import '../../widgets/lifecycle_poller.dart';
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

class _ChatPageState extends State<ChatPage> with LifecyclePoller {
  final _text = TextEditingController();
  List _messages = [];
  List _stickers = [];
  List _cannedMessages = [];
  Map? _reply;
  String? _error;
  Map<String, dynamic>? _pinned;
  // Auto-scroll: without a controller the list stayed pinned at the top and
  // new messages appeared off-screen until the user scrolled manually.
  final _scroll = ScrollController();
  int _lastCount = 0;
  // Server-enforced send cooldown, surfaced so the button explains itself
  // instead of silently rejecting.
  int _cooldownSeconds = 0;
  int _cooldownLeft = 0;
  Timer? _cooldownTimer;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // PERFORMANCE: this used to re-fetch messages + stickers + canned list
    // every 3 seconds forever. Now only the messages are polled, at a calmer
    // cadence, and the poll PAUSES while the app is backgrounded instead of
    // draining battery and data for updates nobody can see.
    startPolling(const Duration(seconds: 10), _refreshMessages);
  }

  @override
  void dispose() {
    stopPolling();
    _cooldownTimer?.cancel();
    _scroll.dispose();
    _text.dispose();
    super.dispose();
  }

  /// Lightweight poll: messages only. The heavy parts of [_load] (config,
  /// stickers, canned list, pinned banner) are fetched once on open.
  Future<void> _refreshMessages() async {
    // ═══════════════════════════════════════════════════════════════════
    // چرا شرطِ `if (_error != null) return` برداشته شد
    // ═══════════════════════════════════════════════════════════════════
    //
    // گزارش مالک: «خطای ارتباط با سرور زیاد شده مخصوصا قسمت چت».
    //
    // نسخهٔ قبلی به محضِ ست شدنِ `_error` **برای همیشه** از تازه‌سازی
    // دست می‌کشید. یعنی یک بلیپِ یک‌ثانیه‌ایِ شبکه هنگام باز کردنِ
    // صفحه، چت را تا بستن و باز کردنِ دوبارهٔ آن مرده می‌کرد: پیام‌ها
    // دیگر نمی‌آمدند و کاربر فقط پیامِ خطا را می‌دید.
    //
    // این رفتار «خطای زیاد» را دو برابر بد می‌کرد: هم خطا دیده می‌شد،
    // هم خودش را درمان نمی‌کرد.
    //
    // حالا برعکس: تازه‌سازی همیشه تلاش می‌کند و اگر **موفق** شد، حالتِ
    // خطا را پاک می‌کند. یعنی چت خودش را از یک قطعیِ گذرا بازیابی
    // می‌کند بدون اینکه کاربر کاری بکند.
    try {
      final m = await widget.api.get('/api/chat/messages');
      if (!mounted) return;
      final count = (m is List) ? m.length : 0;
      final grew = count > _lastCount;
      _lastCount = count;
      setState(() {
        _messages = m;
        // بازیابیِ خودکار: شبکه برگشته، پس پیامِ خطا باید برود.
        if (_error != null) _error = null;
      });
      if (grew) _scrollToBottom();
    } catch (_) {
      // یک بلیپِ گذرا نباید گفتگوی روی صفحه را پاک کند و نباید
      // پیامِ خطا هم بسازد — تیکِ بعدی خودش دوباره تلاش می‌کند.
      // (ApiClient خودش یک بار retry کرده، پس رسیدن به اینجا یعنی
      // قطعیِ واقعی‌تر.)
    }
  }

  /// Scrolls the conversation to the newest message.
  ///
  /// Only auto-scrolls when the user is already near the bottom — yanking the
  /// view down while somebody is reading older messages would be hostile.
  void _scrollToBottom({bool force = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final pos = _scroll.position;
      final nearBottom = pos.maxScrollExtent - pos.pixels < 260;
      if (!force && !nearBottom) return;
      pos.animateTo(
        pos.maxScrollExtent,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    });
  }

  /// Starts the visible countdown after a successful send.
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
      // 4 concurrent requests in 1 single round-trip burst for ultra-fast chat load
      final batch = await Future.wait([
        widget.api.get('/api/chat/config'),
        widget.api.get('/api/chat/messages'),
        widget.api.get('/api/chat/stickers'),
        widget.api.get('/api/chat/canned-messages'),
      ]);
      final cfg = batch[0] is Map ? batch[0] as Map : const {};
      final m = (batch[1] is List) ? batch[1] as List : const [];
      final st = (batch[2] is List) ? batch[2] as List : const [];
      final cm = (batch[3] is List) ? batch[3] as List : const [];

      final pin = cfg['pinned'];
      if (mounted && pin is Map) {
        _pinned = Map<String, dynamic>.from(pin);
      }
      final cd = (cfg['messageCooldownSeconds'] as num?)?.toInt();
      if (mounted && cd != null) _cooldownSeconds = cd;

      if (cfg['eligible'] == false) {
        if (mounted) {
          setState(() {
            _error =
                'برای چت باید حداقل ${faNum(cfg['minLifetimePoints'])} امتیاز تاریخی داشته باشید.';
            _loading = false;
          });
        }
        return;
      }
      if (mounted) {
        setState(() {
          _messages = m;
          _stickers = st;
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

  Future<void> _send({String? stickerId}) async {
    try {
      if (stickerId == null && _text.text.trim().isEmpty) return;
      await widget.api.post('/api/chat/messages', {
        'message': _text.text,
        'stickerId': stickerId,
        'replyTo': _reply?['id'],
      });
      _text.clear();
      if (!mounted) return;
      setState(() => _reply = null);
      _startCooldown();
      await _load();
      // Always jump to our own message, even if we were reading history.
      _scrollToBottom(force: true);
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
          heightFactor: 0.5,
          child: Padding(
            padding: const EdgeInsets.all(Gaps.md),
            child: SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final msg in _cannedMessages)
                    InkWell(
                      onTap: () => Navigator.pop(context, msg),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          border: Border.all(color: textColor.withValues(alpha: 0.25)),
                          borderRadius: BorderRadius.circular(20),
                          color: textColor.withValues(alpha: 0.05),
                        ),
                        child: Text(
                          msg,
                          style: TextStyle(
                            fontSize: 14,
                            color: textColor,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (e != null) {
      _text.text = e;
      // ارسالِ خودکارِ ایموجیِ انتخاب‌شده.
      //
      // خودِ `_send` هر خطایی را داخل خودش می‌گیرد و به کاربر اسنک‌بار
      // نشان می‌دهد، پس اینجا چیزی برای مدیریت نمانده. ولی رها کردنِ
      // بی‌نشانِ Future یعنی اگر روزی `_send` بازنویسی شود و دیگر خطا
      // را نگیرد، شکستش بی‌صدا گم می‌شود. `unawaited` این وابستگی را
      // صریح می‌کند.
      //
      // چرا await نمی‌کنیم: این تابع از یک `onTap` صدا زده می‌شود و
      // نگه داشتنش تا پایانِ رفت‌وبرگشتِ شبکه، شیتِ ایموجی را باز
      // نگه می‌داشت.
      unawaited(_send());
    }
  }


  Future<void> _openStickersSheet() async {
    if (_stickers.isEmpty) return;
    await showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0E1826),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.stars_rounded, size: 24, color: Color(0xFFFFD166)),
                const SizedBox(width: 8),
                const Text('ایموجی‌ها و استیکرهای بزرگ قلقلی',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white70),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 280,
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.88,
                ),
                itemCount: _stickers.length,
                itemBuilder: (ctx, i) {
                  final st = _stickers[i];
                  return InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () {
                      Navigator.pop(ctx);
                      _send(stickerId: st['id']);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        color: Colors.white.withValues(alpha: 0.05),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Expanded(
                            child: SafeImage(
                              url: st['image_url'],
                              fit: BoxFit.contain,
                              fallbackEmoji: '⚽',
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            st['title'] ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFE2E8F0)),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
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
                Container(
                  width: 56,
                  height: 52,
                  decoration: BoxDecoration(
                    borderRadius: Corners.rLg,
                    gradient: LinearGradient(
                      colors: [
                        BrandColors.emerald.withValues(alpha: 0.16),
                        BrandColors.blue.withValues(alpha: 0.10),
                      ],
                    ),
                    border: Border.all(color: BrandColors.emerald.withValues(alpha: 0.22)),
                  ),
                  child: Image.asset('assets/brand/chat_glow.png', cacheWidth: 150),
                ),
                Gaps.hSm,
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
                      Text('پیام آماده، استیکر، ریپلای و لایک',
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
            // ListView.builder, NOT ListView(children: [...]).
            //
            // The old form spread all 100 messages into the children list, so
            // every bubble — and every avatar inside it — was constructed and
            // laid out on each build, including the ones scrolled far out of
            // view. The screen rebuilds on every 10-second poll and on every
            // send, so that was ~100 widget subtrees rebuilt for a change
            // that usually affects one row.
            //
            // The header (stickers, spacing) is item 0 and the messages
            // follow, which keeps a single scroll view while letting Flutter
            // build only what is visible.
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.symmetric(horizontal: Gaps.md),
              // +1 header, +1 trailing gap
              itemCount: _messages.length + 2,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
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
                              borderRadius: Corners.rLg,
                              gradient: LinearGradient(
                                begin: Alignment.topRight,
                                end: Alignment.bottomLeft,
                                colors: [
                                  theme.colorScheme.surfaceContainerHigh,
                                  BrandColors.emerald.withValues(alpha: 0.10),
                                ],
                              ),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                              boxShadow: [
                                BoxShadow(
                                  color: BrandColors.emerald.withValues(alpha: 0.07),
                                  blurRadius: 12,
                                  offset: const Offset(0, 6),
                                ),
                              ],
                            ),
                            child: SafeImage(
                                url: st['image_url'],
                                fit: BoxFit.contain,
                                fallbackEmoji: '🙂'),
                          ),
                        );
                      },
                    ),
                  ),
                      Gaps.vXs,
                    ],
                  );
                }
                if (index == _messages.length + 1) return Gaps.vMd;

                final m = _messages[index - 1];
                return _ChatBubble(
                  message: m,
                  onTapAvatar: () =>
                      showPublicProfile(context, widget.api, m['user_id']),
                  onReply: () => setState(() => _reply = Map.from(m)),
                  onLike: () => _like(m['id']),
                  onReport: () => widget.api
                      .post('/api/chat/messages/${m['id']}/report', {}),
                );
              },
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
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
                      backgroundColor: BrandColors.emerald,
                      foregroundColor: const Color(0xFF00281D),
                    ),
                    onPressed: (_error != null || _cooldownLeft > 0)
                        ? null
                        : _pickCanned,
                    icon: Icon(_cooldownLeft > 0
                        ? Icons.hourglass_bottom_rounded
                        : Icons.chat_bubble_outline),
                    label: Text(_cooldownLeft > 0
                        ? 'کمی صبر کن... ${faNum(_cooldownLeft)} ثانیه'
                        : 'انتخاب پیام آماده...'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  style: IconButton.styleFrom(
                    backgroundColor: const Color(0xFF1E293B),
                    foregroundColor: const Color(0xFFFFD166),
                    minimumSize: const Size(50, 50),
                    shape: RoundedRectangleBorder(
                      borderRadius: Corners.rLg,
                      side: BorderSide(color: const Color(0xFFFFD166).withValues(alpha: 0.35)),
                    ),
                  ),
                  tooltip: 'ایموجی و استیکرهای بزرگ',
                  icon: const Icon(Icons.emoji_emotions_rounded, size: 24),
                  onPressed: _openStickersSheet,
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
                        // PARITY FIX: the web chat drew the club badge, the
                        // name colour and the Plus star; the app drew a plain
                        // name, so cosmetics people had paid for were
                        // invisible on the main client.
                        child: DisplayName(
                          name: message['nickname'] ??
                              message['first_name'] ??
                              'کاربر',
                          cosmetics: message['cosmetics'] as Map?,
                          // لولِ فرستنده — سرور آن را کنارِ cosmetics
                          // در همان کوئریِ دسته‌ای می‌فرستد.
                          level: (message['level'] as num?)?.toInt(),
                          // Suppress the inline crest when the avatar beside
                          // it is already that same crest.
                          avatarKey: message['profile_image_url'] == null
                              ? message['profile_avatar_key']
                              : null,
                          style: theme.textTheme.titleSmall,
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
                      ? SafeImage(
                          url: message['sticker_url'],
                          width: 100, height: 100,
                          fit: BoxFit.contain, fallbackEmoji: '🙂')
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
