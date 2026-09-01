import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../api_client.dart';
import '../../core/cosmetics.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/state_views.dart';
import '../../widgets/lifecycle_poller.dart';
import '../shared/public_profile_sheet.dart';
import 'games/pinned_banner.dart';
import '../../widgets/ui_icon.dart';

/// افستِ ثابتِ تهران. ایران از ۱۴۰۱ ساعتِ تابستانی ندارد، پس یک عددِ ثابت
/// دقیق است و نیازی به دیتابیسِ منطقهٔ زمانی نیست. سمتِ وب هم همین را با
/// `timeZone: 'Asia/Tehran'` می‌گیرد، پس دو کلاینت یک ساعت نشان می‌دهند.
const Duration _tehranOffset = Duration(hours: 3, minutes: 30);

/// ساعتِ پیام — آینهٔ `msgTime` در وب. سرور `sent_at` را همیشه می‌فرستاد ولی
/// هیچ‌کدام از دو کلاینت نشانش نمی‌دادند. برای پیامِ امروز فقط ساعت و دقیقه،
/// وگرنه روز هم می‌آید تا «۱۴:۳۲» گمراه‌کننده نباشد. ورودیِ نامعتبر رشتهٔ
/// خالی می‌دهد تا هرگز متنِ خراب روی صفحه نیفتد.
String chatTime(Object? raw) {
  if (raw == null) return '';
  final parsed = DateTime.tryParse('$raw');
  if (parsed == null) return '';
  final t = parsed.toUtc().add(_tehranOffset);
  final now = DateTime.now().toUtc().add(_tehranOffset);
  final hm = '${faNum(t.hour.toString().padLeft(2, '0'))}:'
      '${faNum(t.minute.toString().padLeft(2, '0'))}';
  final sameDay = t.year == now.year && t.month == now.month && t.day == now.day;
  if (sameDay) return hm;
  return '${faNum(t.month)}/${faNum(t.day)} · $hm';
}

/// پیامی که فقط ایموجی است حباب نمی‌خواهد. سقفِ سه ایموجی گذاشته شده تا
/// یک پیامِ متنیِ کوتاه اشتباه گرفته نشود.
final RegExp _emojiOnly = RegExp(
  r'^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]'
  r'[\u{FE0F}\u{200D}]?){1,3}$',
  unicode: true,
);

bool isOnlyEmoji(String text) => _emojiOnly.hasMatch(text.trim());

/// Group chat room: Canned messages only (no custom typing, no stickers).
class ChatPage extends StatefulWidget {
  final ApiClient api;
  const ChatPage({super.key, required this.api});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> with LifecyclePoller {
  List _messages = [];
  List _emotePacks = [];
  List _stickers = [];
  Map? _reply;
  String? _error;
  Map<String, dynamic>? _pinned;
  final _scroll = ScrollController();
  int _lastCount = 0;
  int _cooldownSeconds = 0;
  int _cooldownLeft = 0;
  Timer? _cooldownTimer;
  bool _loading = true;
  io.Socket? _socket;

  @override
  void initState() {
    super.initState();
    _load();
    _connectSocket();
    // polling حالا فقط تورِ ایمنیِ قطعیِ سوکت است، نه مسیرِ اصلیِ رسیدنِ
    // پیام؛ پس فاصله از ۴ به ۱۵ ثانیه رفت (کمتر از ⅓ ترافیک و مصرفِ باتری).
    startPolling(const Duration(seconds: 15), _refreshMessages);
  }

  /// سرور از همان اول `chat:new` را emit می‌کرد ولی هیچ کلاینتی گوش نمی‌داد،
  /// پس چت عملاً هر چند ثانیه یک‌بار «زنده» می‌شد. آینهٔ همین کار در وب.
  void _connectSocket() {
    try {
      final s = io.io(
        widget.api.baseUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': widget.api.token})
            .enableForceNew()
            .enableReconnection()
            .setReconnectionDelay(800)
            .setReconnectionDelayMax(5000)
            .build(),
      );
      _socket = s;
      s.on('chat:new', (data) {
        if (!mounted || data is! Map) return;
        final id = data['id'];
        if (id == null) return;
        // سرور پیام را به فرستنده هم برمی‌گرداند و مسیرِ ارسال خودش آن را
        // اضافه می‌کند؛ بدون این نگهبان پیامِ خودت دو بار می‌نشست.
        final exists = _messages.any((m) => m is Map && '${m['id']}' == '$id');
        if (exists) return;
        setState(() {
          _messages = [..._messages, Map<String, dynamic>.from(data)];
          _lastCount = _messages.length;
        });
        _scrollToBottom();
      });
    } catch (_) {
      // سوکت اختیاری است؛ polling کار را ادامه می‌دهد.
    }
  }

  @override
  void dispose() {
    stopPolling();
    try {
      _socket?.off('chat:new');
      _socket?.dispose();
    } catch (_) {}
    _socket = null;
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
          _emotePacks = cfg['emotePacks'] is List ? cfg['emotePacks'] as List : const [];
          _stickers = res['stickers'] is List ? res['stickers'] as List : const [];
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

  /// آدرسِ کاملِ استیکر: مسیرِ نسبیِ سرور + baseUrl کلاینت. فایلِ SVG از
  /// شبکه می‌آید تا استیکرِ جدیدِ دیتابیس بدون آپدیتِ اپ دیده شود.
  String _stickerUrl(Object? rel) {
    final s = '$rel';
    if (s.isEmpty) return '';
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    return widget.api.baseUrl.replaceAll(RegExp(r'/\$'), '') + s;
  }

  Future<void> _sendSticker(String stickerId) async {
    if (_cooldownLeft > 0) return;
    try {
      final payload = <String, dynamic>{'stickerId': stickerId};
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
      if (mounted) {
        final msg = apiError(e);
        if (msg.isNotEmpty) {
          setState(() => _error = msg);
        }
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

    return Column(
      children: [
        if (_pinned != null)
          PinnedBanner(
            pinned: _pinned!,
          ),
        Expanded(
          child: _messages.isEmpty
              // بدونِ این، چتِ خالی یک صفحهٔ سیاهِ خام بود و کاربر فکر
              // می‌کرد بارگذاری نشده. آینهٔ `.chatEmpty` در وب.
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 18),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        UiIcon('chat', size: 38, color: const Color(0xFF38BDF8).withValues(alpha: 0.65)),
                        const SizedBox(height: 9),
                        const Text('هنوز پیامی نیست',
                            style: TextStyle(
                                fontSize: 14.5, fontWeight: FontWeight.w800, color: Color(0xFFCBD5E1))),
                        const SizedBox(height: 5),
                        const Text(
                          'اولین نفری باش که سلام می‌کند — از دکمه‌های پایین انتخاب کن.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 12.5, height: 1.6, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.symmetric(horizontal: Gaps.md, vertical: Gaps.sm),
            itemCount: _messages.length,
            itemBuilder: (context, i) {
              final m = _messages[i] as Map;
              final isMe = m['is_mine'] == true;
              return _MessageBubble(
                message: m,
                isMe: isMe,
                stickerUrl: _stickerUrl,
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
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: const BoxDecoration(
              color: Color(0xFF0B1220),
              border: Border(top: BorderSide(color: Colors.white12)),
            ),
            child: Row(
              children: [
                const Icon(Icons.reply_rounded, size: 17, color: BrandColors.emerald),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'پاسخ به ${_reply!['nickname'] ?? 'کاربر'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w800, color: BrandColors.emerald),
                      ),
                      Text(
                        '${_reply!['message_text'] ?? ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, size: 17, color: Color(0xFFEF4444)),
                  visualDensity: VisualDensity.compact,
                  tooltip: 'لغو پاسخ',
                  onPressed: () => setState(() => _reply = null),
                ),
              ],
            ),
          ),

        // ── پنل زیبا و مدرن پیام‌های آماده ──
        // `cannedMessages` سرور اینجا مصرف نمی‌شود و عمداً هم گرفته
        // نمی‌شود: آن فهرست تخت است و فقط برای اعتبارسنجیِ سمتِ سرور
        // به کار می‌رود. دسته‌بندیِ نمایشی وظیفهٔ کلاینت است و باید با
        // وب یکی بماند — گاردِ `chat-parity.mjs` همان را می‌بندد.
        // (پیش‌تر گرفته و پاس داده می‌شد و هرگز خوانده نمی‌شد.)
        _CannedMessagesPanel(
          emotePacks: _emotePacks,
          stickers: _stickers,
          stickerUrl: _stickerUrl,
          cooldownLeft: _cooldownLeft,
          onSend: _sendCannedMessage,
          onSendSticker: _sendSticker,
        ),
      ],
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.isMe,
    required this.stickerUrl,
    required this.onReply,
    required this.onLike,
    required this.onOpenProfile,
  });

  final Map message;
  final bool isMe;
  final String Function(Object? rel) stickerUrl;
  final VoidCallback onReply;
  final VoidCallback onLike;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = message['message_text'] as String? ?? '';
    final liked = message['liked_by_me'] == true;
    final likes = (message['like_count'] as num?)?.toInt() ?? 0;
    final cosmetics = message['cosmetics'] is Map ? message['cosmetics'] as Map : const {};
    final time = chatTime(message['sent_at']);
    final onlyEmoji = isOnlyEmoji(text);

    final avatar = InkWell(
      onTap: onOpenProfile,
      borderRadius: BorderRadius.circular(16),
      child: CosmeticAvatarFrame(
        frame: cosmetics['frame'] as String?,
        padding: 2,
        child: AvatarImage(
          keyName: message['profile_avatar_key'],
          imageUrl: message['profile_image_url'],
          radius: 16,
        ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        // پیامِ خودم از سمتِ مقابل می‌آید — بدون این، در یک چتِ شلوغ
        // پیدا کردنِ حرفِ خودت فقط از روی رنگِ حباب ممکن بود.
        textDirection: isMe ? TextDirection.ltr : TextDirection.rtl,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          avatar,
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Row(
                  textDirection: TextDirection.rtl,
                  mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!isMe)
                      Flexible(
                        child: InkWell(
                          onTap: onOpenProfile,
                          child: DisplayName(
                            name: message['nickname'] ?? 'کاربر',
                            cosmetics: cosmetics,
                            level: (message['level'] as num?)?.toInt(),
                            style: theme.textTheme.bodySmall?.copyWith(
                                fontSize: 12, fontWeight: FontWeight.w800),
                          ),
                        ),
                      )
                    else
                      const Text('شما',
                          style: TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w800, color: BrandColors.blue)),
                    if (time.isNotEmpty) ...[
                      const SizedBox(width: 7),
                      // کفِ خوانایی ۱۱.۵px — آینهٔ `.chatTime` در وب.
                      Text(time,
                          style: const TextStyle(
                              fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                if (message['reply_text'] != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(8),
                      border: const BorderDirectional(
                          start: BorderSide(color: BrandColors.emerald, width: 2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${message['reply_nickname'] ?? ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            // آینهٔ `.chatQuote b` در وب.
                            style: const TextStyle(
                                fontSize: 11.5, fontWeight: FontWeight.w800, color: BrandColors.emerald)),
                        Text('${message['reply_text']}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11.5, color: Color(0xFF94A3B8))),
                      ],
                    ),
                  ),
                if (message['message_type'] == 'sticker' &&
                    message['sticker_url'] != null)
                  // استیکر حبابِ متنی نمی‌خواهد؛ SVG خودش را با یک
                  // ضربانِ ملایمِ مقیاس نشان می‌دهد (انیمیشن سمتِ فلاتر،
                  // چون flutter_svg از SMIL پشتیبانی نمی‌کند).
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: AnimatedSticker(
                      url: stickerUrl(message['sticker_url']),
                      title: message['sticker_title'] as String?,
                    ),
                  )
                else if (onlyEmoji)
                  // ایموجیِ تنها حباب نمی‌خواهد؛ بزرگ و بدون کادر.
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    child: Text(text, style: const TextStyle(fontSize: 36, height: 1.15)),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isMe
                          ? BrandColors.blue.withValues(alpha: 0.20)
                          : theme.colorScheme.surfaceContainerHigh,
                      borderRadius: BorderRadiusDirectional.only(
                        topStart: Radius.circular(isMe ? 14 : 4),
                        topEnd: Radius.circular(isMe ? 4 : 14),
                        bottomStart: const Radius.circular(14),
                        bottomEnd: const Radius.circular(14),
                      ),
                      border: Border.all(
                        color: isMe
                            ? BrandColors.blue.withValues(alpha: 0.35)
                            : Colors.white.withValues(alpha: 0.08),
                      ),
                    ),
                    child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.55)),
                  ),
                const SizedBox(height: 2),
                Row(
                  textDirection: TextDirection.rtl,
                  mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    InkWell(
                      onTap: onLike,
                      borderRadius: BorderRadius.circular(10),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                              size: 14,
                              color: liked ? const Color(0xFFEF4444) : Colors.white54,
                            ),
                            if (likes > 0) ...[
                              const SizedBox(width: 3),
                              Text(
                                faNum(likes),
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: liked ? const Color(0xFFEF4444) : Colors.white54,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    InkWell(
                      onTap: onReply,
                      borderRadius: BorderRadius.circular(10),
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.reply_rounded, size: 14, color: Color(0xFF94A3B8)),
                            SizedBox(width: 3),
                            Text('پاسخ',
                                style: TextStyle(
                                    fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8))),
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

/// پنل مدرن، دسته‌بندی‌شده و زیبای پیام‌های آماده و ایموجی‌ها
class _CannedMessagesPanel extends StatefulWidget {
  const _CannedMessagesPanel({
    required this.emotePacks,
    required this.stickers,
    required this.stickerUrl,
    required this.cooldownLeft,
    required this.onSend,
    required this.onSendSticker,
  });

  final List emotePacks;
  final List stickers;
  final String Function(Object? rel) stickerUrl;
  final int cooldownLeft;
  final void Function(String text) onSend;
  final void Function(String stickerId) onSendSticker;

  @override
  State<_CannedMessagesPanel> createState() => _CannedMessagesPanelState();
}

class _CannedMessagesPanelState extends State<_CannedMessagesPanel> {
  int _tab = 0;

  final _emojis = const [
    '🔥', '⚽', '🏆', '😎', '😂', '👏', '🤝', '💪',
    '🎯', '⭐', '❤️', '🚀', '👑', '🥳', '🥇', '💯',
    '🧤', '⚡', '🤩', '👍', '🎮', '🍿', '🎩', '💎',
  ];

  /// (نامِ آیکون، عنوان، پیام‌ها) — آینهٔ `BASE_CATEGORIES` در Chat.jsx.
  ///
  /// ⚠️ منبعِ حقیقتِ *مجازبودن* یک پیام، `CANNED_MESSAGES` در
  /// `backend/src/server.js` است؛ سرور هر متنِ خارج از آن را رد می‌کند.
  /// اینجا فقط دسته‌بندیِ نمایشی است. گاردِ `chat-parity.mjs` برابریِ این
  /// فهرست با فهرستِ سرور و با وب را در CI می‌بندد.
  ///
  /// دورِ ۲۳: عنوان‌ها ایموجیِ چسبیده داشتند («💬 گفتگو»). خودِ ایموجیِ
  /// قابلِ ارسال می‌ماند — آن محتواست — ولی برچسبِ تب عنصرِ رابط است و
  /// حالا آیکونِ وکتور دارد.
  List<(String, String, List<String>)> get _categories {
    final premium = widget.emotePacks.whereType<Map>().map((raw) {
      final messages = (raw['messages'] as List? ?? const []).map((e) => '$e').toList();
      return ('sparkle', '${raw['name'] ?? 'پک ویژه'}', messages);
    });
    return [
      ('chat', 'گفتگو', const ['سلام بچه‌ها!', 'من اومدم!', 'چه خبر بچه‌ها؟', 'خداحافظ تا بعد!', 'مواظب خودتون باشید!', 'خوشبختم دوستان!', 'کجا زندگی می‌کنید؟', 'امروز چیکار کردید؟', 'ممنون از شما!', 'میشه کمکم کنید؟', 'تبریک میگم!', 'وای چقدر خنده‌دار بود!', 'ایول به همگی!', 'کسی کد جدید داره؟']),
      ('football', 'بازی', const ['کی پایه بازیه؟', 'بریم برای برد!', 'من عاشق این بازی‌ام!', 'منم می‌خوام بازی کنم!', 'دوباره امتحان می‌کنم!', 'بازی خیلی باحال بود!', 'عالی بود!', 'موفق باشی!', 'شگفت‌انگیز بود!']),
      ('game', 'رقابت', const ['بزن بریم بازی!', 'آماده‌ای برای مسابقه؟', 'این دست من می‌برم!', 'بازی عالی بود!', 'دوباره بازی کنیم؟', 'کارت خفن گرفتم!', 'حریف قوی می‌خوام!', 'پنالتی رو دریبل کردم!', 'خیلی خفن بود!', 'شما تو کدوم لیگ هستید؟', 'چقدر امتیازم بالا رفت!', 'کارت جدید پیدا کردم!', 'امروز روز منه!']),
      ...premium,
      ('heart', 'ایموجی', const <String>[]),
      ('party', 'استیکر', const <String>[]),
    ];
  }

  /// گریدِ افقیِ استیکرها — فایل SVG از شبکه (بدون آپدیت برای استیکرِ
  /// جدید). آینهٔ تبِ «استیکر» در Chat.jsx وب.
  Widget _stickerGrid(bool disabled) {
    final stickers = widget.stickers.whereType<Map>().toList();
    if (stickers.isEmpty) {
      return const Center(
        child: Text(
          'استیکری در دسترس نیست.',
          style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
        ),
      );
    }
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: stickers.length,
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (ctx, i) {
        final st = stickers[i];
        final url = widget.stickerUrl(st['url']);
        return InkWell(
          onTap: disabled ? null : () => widget.onSendSticker('${st['id'] ?? ''}'),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            width: 78,
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: disabled
                  ? Colors.white.withValues(alpha: 0.02)
                  : Colors.white.withValues(alpha: 0.05),
              border: Border.all(color: Colors.white12),
            ),
            child: Tooltip(
              message: '${st['title'] ?? 'استیکر'}',
              child: url.isEmpty
                  ? const Icon(Icons.image_not_supported_outlined,
                      size: 28, color: Colors.white30)
                  : SvgPicture.network(
                      url,
                      width: 62,
                      height: 62,
                      fit: BoxFit.contain,
                      placeholderBuilder: (_) => const Icon(Icons.image_outlined,
                          size: 28, color: Colors.white30),
                    ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final disabled = widget.cooldownLeft > 0;
    final categories = _categories;
    if (_tab >= categories.length) _tab = 0;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        border: const Border(top: BorderSide(color: Colors.white12)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.40),
            blurRadius: 12,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // تب‌های دسته‌بندی
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (int i = 0; i < categories.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => setState(() => _tab = i),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              color: _tab == i ? const Color(0xFF38BDF8).withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.04),
                              border: Border.all(color: _tab == i ? const Color(0xFF38BDF8) : Colors.white12),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                UiIcon(categories[i].$1, size: 13,
                                  color: _tab == i ? const Color(0xFF38BDF8) : Colors.white70),
                                const SizedBox(width: 5),
                                Text(categories[i].$2,
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800,
                                    color: _tab == i ? const Color(0xFF38BDF8) : Colors.white70)),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ]),
                ),
              ),
              if (disabled)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                    border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    'صبر کنید (${faNum(widget.cooldownLeft)})',
                    style: const TextStyle(color: Color(0xFFEF4444), fontSize: 11.5, fontWeight: FontWeight.w800),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),

          // لیست پیام‌ها یا ایموجی‌ها یا استیکرها
          SizedBox(
            height: 96,
            child: _tab == categories.length - 1
                ? _stickerGrid(disabled)
                : _tab == categories.length - 2
                    ? GridView.builder(
                    scrollDirection: Axis.horizontal,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 6,
                      crossAxisSpacing: 6,
                    ),
                    itemCount: _emojis.length,
                    itemBuilder: (ctx, i) {
                      final em = _emojis[i];
                      return InkWell(
                        onTap: disabled ? null : () => widget.onSend(em),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            color: disabled ? Colors.white.withValues(alpha: 0.02) : const Color(0xFF1E293B),
                            border: Border.all(color: Colors.white10),
                          ),
                          child: Text(em, style: const TextStyle(fontSize: 22)),
                        ),
                      );
                    },
                  )
                    : GridView.builder(
                    scrollDirection: Axis.horizontal,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 0.30,
                    ),
                    itemCount: categories[_tab].$3.length,
                    itemBuilder: (ctx, i) {
                      final text = categories[_tab].$3[i];
                      return InkWell(
                        onTap: disabled ? null : () => widget.onSend(text),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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

/// استیکرِ چت: SVG شبکه + ضربانِ مقیاسِ ملایم.
///
/// flutter_svg از انیمیشنِ داخلِ فایل (SMIL) پشتیبانی نمی‌کند، پس حسِ
/// «زنده بودن» با یک مقیاسِ رفت‌وبرگشتیِ خودِ فلاتر ساخته می‌شود — بدون
/// هیچ وابستگیِ اضافه. اگر شبکه در دسترس نبود، آیکونِ جایگزین می‌آید تا
/// جای خالی دیده نشود.
class AnimatedSticker extends StatefulWidget {
  const AnimatedSticker({super.key, required this.url, this.title});

  final String url;
  final String? title;

  @override
  State<AnimatedSticker> createState() => _AnimatedStickerState();
}

class _AnimatedStickerState extends State<AnimatedSticker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  late final Animation<double> _scale = Tween<double>(begin: 0.94, end: 1.06)
      .animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.title ?? 'استیکر',
      child: ScaleTransition(
        scale: _scale,
        child: widget.url.isEmpty
            ? const Icon(Icons.image_not_supported_outlined,
                size: 56, color: Colors.white30)
            : SvgPicture.network(
                widget.url,
                width: 96,
                height: 96,
                fit: BoxFit.contain,
                placeholderBuilder: (_) => const Icon(Icons.image_outlined,
                    size: 56, color: Colors.white30),
              ),
      ),
    );
  }
}
