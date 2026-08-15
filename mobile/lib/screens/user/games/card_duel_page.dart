import 'dart:async';
import 'dart:io';
// برای لرزشِ میرای لحظهٔ برخورد در _ClashStage (سینوسِ میراشونده).
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../core/cosmetics.dart';
import '../../../core/share_invite.dart';
import '../../../services/image_disk_cache.dart';
import '../../../theme/colors.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/avatar_image.dart';
import '../../../widgets/player_card.dart';
import 'coin_award.dart';
import 'game_session.dart';

part 'card_duel/card_duel_widgets.dart';

const _gold = Color(0xFFFFD166);
const _cyan = Color(0xFF38BDF8);
const _emerald = Color(0xFF22E7A6);
const _purple = Color(0xFFA855F7);
const _rose = Color(0xFFFB7185);

/// Live five-card arena: bot practice, 100/1000 online, and private lobby.
/// Card choices are simultaneous and hidden until both players lock a card.
class CardDuelPage extends StatefulWidget {
  const CardDuelPage({
    super.key,
    required this.api,
    required this.onBack,
    this.stake = 0,
    this.vsBot = false,
    this.roomCode,
    this.existingSocket,
    this.initialStart,
  });

  final ApiClient api;
  final VoidCallback onBack;
  final int stake;
  final bool vsBot;
  final String? roomCode;
  final io.Socket? existingSocket;
  final Map<String, dynamic>? initialStart;

  @override
  State<CardDuelPage> createState() => _CardDuelPageState();
}

class _CardDuelPageState extends State<CardDuelPage> {
  late final GameSession _session = GameSession(
    api: widget.api,
    gameId: 'card_duel',
    existingSocket: widget.existingSocket,
    initialStart: widget.initialStart,
  )..connect();

  bool _loading = true;
  bool _busy = false;
  bool _started = false;
  bool _sharing = false;
  String? _error;
  Map<String, dynamic>? _data;
  final List<String> _selected = [];
  int _prewarmedRoundCount = -1;
  bool _didReloadFinishedBattle = false;

  List<Map<String, dynamic>> get _ownedCards =>
      ((_data?['playableCards'] as List?) ?? const [])
          .whereType<Map>()
          .map((card) => Map<String, dynamic>.from(card))
          .toList(growable: false);

  bool get _practiceFallback => widget.vsBot && _ownedCards.length < 5;

  List<Map<String, dynamic>> get _cards {
    final source = _practiceFallback
        ? ((_data?['practiceCards'] as List?) ?? const [])
        : _ownedCards;
    return source
        .whereType<Map>()
        .map((card) => Map<String, dynamic>.from(card))
        .toList(growable: false);
  }

  Color get _modeColor => widget.vsBot
      ? _emerald
      : widget.roomCode != null || widget.initialStart?['matchMode'] == 'lobby'
          ? _purple
          : widget.stake == 1000
              ? _gold
              : _cyan;

  String get _modeTitle => widget.vsBot
      ? 'تمرین با ربات'
      : widget.roomCode != null || widget.initialStart?['matchMode'] == 'lobby'
          ? 'لابی خصوصی'
          : 'نبرد آنلاین ${faNum(widget.stake)}';

  @override
  void initState() {
    super.initState();
    _started = widget.initialStart != null;
    _session.addListener(_onSession);
    // اول کهنه را رسم کن (صفر انتظار)، بعد در پس‌زمینه تازه کن.
    _paintCached();
    unawaited(_load());
  }

  void _onSession() {
    if (!mounted) return;
    final roundCount = (_session.state['history'] as List? ?? const []).length;
    // GameSession برای تیکِ ساعت هم notify می‌کند. prewarm فقط وقتی deck
    // برای اولین بار رسید یا راند تازه resolve شد اجرا می‌شود؛ نه بیست بار
    // در ثانیه. این باعث می‌شود تصویرِ کارتِ صحنه قبل/هم‌زمان با اولین فریم
    // آماده باشد و انیمیشن منتظر network نماند.
    if (roundCount != _prewarmedRoundCount) {
      _prewarmedRoundCount = roundCount;
      unawaited(ImageDiskCache.instance.prewarmPayload(_session.state));
    }
    if (_session.phase == GamePhase.over && !_didReloadFinishedBattle) {
      _didReloadFinishedBattle = true;
      unawaited(_load(refreshSelection: false));
    } else if (_session.phase != GamePhase.over) {
      _didReloadFinishedBattle = false;
    }
    setState(() {});
  }

  /// دادهٔ کهنه را فوراً رسم می‌کند تا صفحه هرگز خالی نماند.
  ///
  /// گزارشِ مالک: «هر بار که از صفحه بازی میرم ... باید منتظر بمونم کارت
  /// ها لود بشن». اندازه‌گیری نشان داد سرور در ۴ms جواب می‌دهد و کلِ
  /// تأخیر رفت‌وبرگشتِ شبکه است (۴۷۰ تا ۱۰۳۰ms). پس تنها راهِ حذفِ
  /// انتظار، نمایشِ فوریِ آخرین دادهٔ شناخته‌شده است.
  void _paintCached() {
    final cached = widget.api.cachedSnapshot('/api/card-duel');
    if (cached is! Map) return;
    _applyDuelData(Map<String, dynamic>.from(cached), refreshSelection: true);
  }

  void _applyDuelData(
    Map<String, dynamic> map, {
    required bool refreshSelection,
  }) {
    final owned = (map['playableCards'] as List?) ?? const [];
    final prepared = widget.vsBot && owned.length < 5
        ? (map['practiceCards'] as List? ?? const [])
        : ((map['activeDeck'] as Map?)?['cards'] as List? ?? const []);
    final activeCards = prepared
        .whereType<Map>()
        .map((card) => '${card['cardTypeId'] ?? card['id'] ?? ''}')
        .where((id) => id.isNotEmpty)
        .take(5)
        .toList();
    setState(() {
      _data = map;
      if (refreshSelection && !_started) {
        _selected
          ..clear()
          ..addAll(activeCards);
      }
      _error = null;
      _loading = false;
    });
  }

  Future<void> _load({bool refreshSelection = true}) async {
    try {
      final response = await widget.api.get('/api/card-duel', fresh: true);
      unawaited(ImageDiskCache.instance.prewarmPayload(response));
      if (!mounted) return;
      final map = response is Map
          ? Map<String, dynamic>.from(response)
          : <String, dynamic>{};
      final owned = (map['playableCards'] as List?) ?? const [];
      final prepared = widget.vsBot && owned.length < 5
          ? (map['practiceCards'] as List? ?? const [])
          : ((map['activeDeck'] as Map?)?['cards'] as List? ?? const []);
      final activeCards = prepared
          .whereType<Map>()
          .map((card) => '${card['cardTypeId'] ?? card['id'] ?? ''}')
          .where((id) => id.isNotEmpty)
          .take(5)
          .toList();
      setState(() {
        _data = map;
        if (refreshSelection && !_started) {
          _selected
            ..clear()
            ..addAll(activeCards);
        }
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = apiError(error);
        _loading = false;
      });
    }
  }

  Future<void> _saveAndStart() async {
    if (_selected.length != 5 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!_practiceFallback) {
        await widget.api.post('/api/card-duel/deck', {
          'cardTypeIds': _selected,
        });
      }
      if (!mounted) return;
      setState(() => _started = true);
      if (widget.vsBot) {
        _session.playWithBotImmediately();
      } else if (widget.roomCode != null && widget.roomCode!.isNotEmpty) {
        _session.joinRoom(widget.roomCode!);
      } else if (widget.stake > 0) {
        _session.join(stake: widget.stake, vsBot: false);
      } else {
        // A zero-stake live match is entered through an existing lobby socket.
        _session.playWithBotImmediately();
      }
    } catch (error) {
      if (mounted) setState(() => _error = apiError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toggle(String id) {
    if (_started) return;
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else if (_selected.length < 5) {
        _selected.add(id);
      } else {
        _snack('ترکیب فقط پنج کارت دارد؛ اول یکی را بردار');
      }
    });
  }

  void _applySuggestedDeck() {
    if (_started) return;
    final raw = (_data?['suggestedDeck'] as Map?)?['cardTypeIds'];
    final ids = (raw as List? ?? const [])
        .map((value) => '$value')
        .where((value) => value.isNotEmpty)
        .take(5)
        .toList(growable: false);
    if (ids.length != 5) {
      _snack('هنوز ترکیب پیشنهادی کامل نیست');
      return;
    }
    setState(() {
      _selected
        ..clear()
        ..addAll(ids);
    });
    _snack('ترکیب پیشنهادی روی میز چیده شد');
  }

  void _editLineup() {
    _session.leave();
    setState(() {
      _started = false;
      _error = null;
    });
  }

  void _playAgain() {
    if (_session.rematchAvailable) {
      _session.rematch();
    } else if (widget.vsBot) {
      _session.playWithBotImmediately();
    } else if (widget.stake > 0) {
      _session.join(stake: widget.stake, vsBot: false);
    } else {
      widget.onBack();
    }
  }

  Map<String, dynamic>? _resultMvp() {
    final history = (_session.state['history'] as List?) ?? const [];
    final performances = <Map<String, dynamic>>[];
    for (final raw in history.whereType<Map>()) {
      final winner = '${raw['winner'] ?? ''}';
      if (winner != 'X' && winner != 'O') continue;
      final card = raw['card$winner'];
      if (card is! Map) continue;
      performances.add({
        ...Map<String, dynamic>.from(card),
        'mvpRound': NumberParser.toInt(raw['round']),
        'mvpRoundPower': NumberParser.toInt(raw['power$winner']),
        'mvpMargin': NumberParser.toInt(raw['powerGap']),
      });
    }
    performances.sort((a, b) {
      final margin = NumberParser.toInt(b['mvpMargin'])
          .compareTo(NumberParser.toInt(a['mvpMargin']));
      return margin != 0
          ? margin
          : NumberParser.toInt(b['mvpRoundPower'])
              .compareTo(NumberParser.toInt(a['mvpRoundPower']));
    });
    return performances.isEmpty ? null : performances.first;
  }

  Future<XFile> _renderResultCard({
    required String title,
    required String score,
    required Map<String, dynamic>? mvp,
    required String url,
  }) async {
    const size = Size(1080, 1080);
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final paint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF071522), Color(0xFF17304C), Color(0xFF35105D)],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, paint);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(34, 34, 1012, 1012),
        const Radius.circular(38),
      ),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..color = _gold,
    );
    void text(
      String value,
      double y,
      double fontSize,
      Color color, {
      FontWeight weight = FontWeight.w700,
    }) {
      final painter = TextPainter(
        text: TextSpan(
          text: value,
          style: TextStyle(
            fontSize: fontSize,
            color: color,
            fontWeight: weight,
          ),
        ),
        textDirection: TextDirection.rtl,
        textAlign: TextAlign.center,
        maxLines: 2,
      )..layout(maxWidth: 900);
      painter.paint(canvas, Offset((1080 - painter.width) / 2, y));
    }

    text('GHELGHELI CARD ARENA', 120, 34, _cyan, weight: FontWeight.w900);
    text(title, 240, 76, Colors.white, weight: FontWeight.w900);
    text(score, 380, 82, _gold, weight: FontWeight.w900);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(135, 590, 810, 200),
        const Radius.circular(28),
      ),
      Paint()..color = _gold.withValues(alpha: .12),
    );
    text('MVP مسابقه', 625, 32, _gold, weight: FontWeight.w900);
    text(
      '${mvp?['name'] ?? 'ستاره آرنا'} · عدد راند ${faNum(mvp?['mvpRoundPower'])}',
      690,
      46,
      Colors.white,
      weight: FontWeight.w900,
    );
    text(
      'جرأت داری؟ مستقیم به چالشم بیا',
      850,
      34,
      _emerald,
      weight: FontWeight.w900,
    );
    text(url, 925, 23, const Color(0xFFCBD5E1));
    final image = await recorder.endRecording().toImage(1080, 1080);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}/ghelgheli-result-${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(bytes!.buffer.asUint8List(), flush: true);
    return XFile(file.path, mimeType: 'image/png');
  }

  Future<void> _shareResult() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final invite = await _session.createChallenge();
      final score = _session.state['score'] is Map
          ? _session.state['score'] as Map
          : const {};
      final me = _session.mySymbol ?? 'X';
      final other = me == 'X' ? 'O' : 'X';
      final mvp = _resultMvp();
      final title = _session.winner == 'DRAW'
          ? 'نبرد برابر!'
          : _session.iWon
              ? 'من آرنا را بردم!'
              : 'این بار حریف برد!';
      final opponentRole = _session.vsBot ? 'ربات' : 'حریف';
      final scoreLabel =
          'تو ${faNum(score[me])} — $opponentRole ${faNum(score[other])}';
      final message = '$title\n'
          'نتیجه: $scoreLabel\n'
          'MVP: ${mvp?['name'] ?? 'ستاره آرنا'} (عدد راند ${faNum(mvp?['mvpRoundPower'])})\n'
          'جرأت داری؟ مستقیم به چالشم بیا:\n${invite['shareUrl']}';
      final card = await _renderResultCard(
        title: title,
        score: scoreLabel,
        mvp: mvp,
        url: '${invite['shareUrl']}',
      );
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        backgroundColor: const Color(0xFF071522),
        isScrollControlled: true,
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(Gaps.md),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(Gaps.lg),
                  decoration: BoxDecoration(
                    borderRadius: Corners.rXl,
                    gradient: const LinearGradient(
                      colors: [Color(0xFF17304C), Color(0xFF35105D)],
                    ),
                    border: Border.all(color: _gold, width: 1.5),
                  ),
                  child: Column(
                    children: [
                      const Text(
                        'GHELGHELI CARD ARENA',
                        style: TextStyle(
                          color: _cyan,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Gaps.vSm,
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        scoreLabel,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: _gold,
                          fontSize: 40,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Gaps.vSm,
                      Text(
                        'MVP · ${mvp?['name'] ?? 'ستاره آرنا'}',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        'عدد راند ${faNum(mvp?['mvpRoundPower'])}',
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 11,
                        ),
                      ),
                      Gaps.vSm,
                      const Text(
                        'از لینک چالش مستقیم وارد آرنا شو',
                        style: TextStyle(
                          color: _emerald,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                Gaps.vMd,
                FilledButton.icon(
                  onPressed: () async {
                    // share_plus ۱۳: `Share.*` منسوخ شده و جایش
                    // `SharePlus.instance.share(ShareParams(...))` است.
                    // ارتقا لازم بود چون نسخهٔ ۱۰ هنوز Kotlin Gradle Plugin
                    // را خودش اعمال می‌کرد و بیلد هشدارِ KGP می‌داد؛
                    // نسخه‌های آینده فلاتر آن را خطا می‌کنند.
                    await SharePlus.instance.share(
                      ShareParams(
                        files: [card],
                        text: message,
                        subject: 'نتیجه دوئل قلقلی',
                      ),
                    );
                    unawaited(
                      widget.api.post('/api/analytics/events', {
                        'event': 'share',
                        'platform': 'android',
                        'gameId': 'card_duel',
                        'matchId': _session.matchId,
                        'target': 'system_share_image',
                      }).catchError((_) => <String, dynamic>{}),
                    );
                  },
                  icon: const Icon(Icons.image_rounded),
                  label: const Text('اشتراک کارت تصویری نتیجه'),
                ),
                Gaps.vSm,
                Row(
                  children: [
                    for (final target in shareTargets)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: InkWell(
                            onTap: () async {
                              await shareText(target, message);
                              if (ctx.mounted) Navigator.pop(ctx);
                              unawaited(
                                widget.api.post('/api/analytics/events', {
                                  'event': 'share',
                                  'platform': 'android',
                                  'gameId': 'card_duel',
                                  'matchId': _session.matchId,
                                  'target': target.id,
                                }).catchError((_) => <String, dynamic>{}),
                              );
                            },
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                MessengerIcon(app: target.app, size: 34),
                                const SizedBox(height: 4),
                                Text(
                                  target.label,
                                  style: const TextStyle(fontSize: 11.5),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                Gaps.vSm,
                OutlinedButton.icon(
                  onPressed: () async {
                    await copyText(message);
                    if (ctx.mounted) Navigator.pop(ctx);
                    unawaited(
                      widget.api.post('/api/analytics/events', {
                        'event': 'share',
                        'platform': 'android',
                        'gameId': 'card_duel',
                        'matchId': _session.matchId,
                        'target': 'clipboard',
                      }).catchError((_) => <String, dynamic>{}),
                    );
                  },
                  icon: const Icon(Icons.copy_rounded),
                  label: const Text('کپی کارت نتیجه و لینک'),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (error) {
      _snack(apiError(error));
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  void _snack(String message) {
    if (!mounted || message.trim().isEmpty) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    _session.removeListener(_onSession);
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && widget.initialStart == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF071522), Color(0xFF03070D)],
        ),
      ),
      // ═══════════════════════════════════════════════════════════════
      // چیدمان: دکمهٔ شروع همیشه روی صفحه، بدونِ اسکرول
      // ═══════════════════════════════════════════════════════════════
      //
      // ── گزارشِ مالک ──
      //
      //   «همون اولش بازی با ربات یه اسکرول طولانی باید بزنی. یکاری کن
      //    که بازی کمترین نیاز به اسکرول کردن داشته باشه»
      //
      // ── چه چیزی باعثش می‌شد ──
      //
      // همه‌چیز در یک ListView پشتِ سر هم بود: نوارِ قوانین، ترکیب،
      // پنلِ تحلیل، دکمهٔ شروع، کلکسیونِ کامل، تاریخچه. دکمهٔ «ورود به
      // آرنا» جایی وسطِ این ستون دفن شده بود.
      //
      // ── راه‌حل ──
      //
      // دکمه از جریانِ اسکرول بیرون کشیده و به نوارِ پایینِ ثابت منتقل
      // شد. حالا کاربر از لحظهٔ ورود می‌بیندش و برای شروعِ بازی هیچ
      // اسکرولی لازم نیست. اسکرول فقط برای کارهای اختیاری می‌ماند
      // (دیدنِ کلِ کلکسیون یا تاریخچه).
      child: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  Gaps.md,
                  Gaps.sm,
                  Gaps.md,
                  _started ? Gaps.xxl : Gaps.sm,
                ),
                children: [
                  // ── چرا سربرگِ بزرگ حین بازی جمع می‌شود ──
                  //
                  // گزارشِ مالک: «بازی هنوز هم نیاز داره اسکرول شه».
                  //
                  // اندازه‌گیریِ ارتفاع‌ها روی گوشیِ ۶۴۰dp نشان داد صفحهٔ
                  // نبرد ~۷۴۰dp می‌شود؛ یعنی ~۱۰۰dp سرریز. `_ArenaHero`
                  // به‌تنهایی ۹۶dp است و حین نبرد هیچ کارِ ضروری‌ای
                  // نمی‌کند: عنوانِ حالت و توضیحِ شرط را نشان می‌دهد که
                  // کاربر قبلِ شروع خوانده. تنها چیزِ لازمش دکمهٔ برگشت
                  // است که به نوارِ باریکِ جایگزین منتقل شد.
                  if (!_started)
                    _ArenaHero(
                      onBack: () {
                        _session.leave();
                        widget.onBack();
                      },
                      modeColor: _modeColor,
                      modeTitle: _modeTitle,
                    )
                  else
                    _CompactMatchBar(
                      onBack: () {
                        _session.leave();
                        widget.onBack();
                      },
                      modeColor: _modeColor,
                      modeTitle: _modeTitle,
                    ),
                  Gaps.vSm,
                  if (!_started)
                    _buildSetup(context)
                  else
                    _buildSession(context),
                ],
              ),
            ),
          ),
          if (!_started) _buildStartBar(context),
        ],
      ),
    );
  }

  Widget _buildSetup(BuildContext context) {
    final byId = {
      for (final card in _cards) '${card['cardTypeId'] ?? card['id']}': card,
    };
    final teamPower = _selected.fold<int>(
      0,
      (sum, id) => sum + NumberParser.toInt(byId[id]?['power']),
    );
    final activeInsights = _data?['deckInsights'] is Map
        ? Map<String, dynamic>.from(_data!['deckInsights'] as Map)
        : null;
    final suggestedDeck = _data?['suggestedDeck'] is Map
        ? Map<String, dynamic>.from(_data!['suggestedDeck'] as Map)
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ترکیب اول می‌آید: مهم‌ترین چیزِ این صفحه و تنها چیزی که برای
        // شروع لازم است.
        _LineupPanel(
          selected: _selected,
          cards: _cards,
          teamPower: teamPower,
          onRemove: _toggle,
        ),
        Gaps.vXs,
        // قوانین اختیاری جمع می‌شوند؛ تحلیل دیگر بازشدنی/اسکرولی نیست و
        // همیشه در یک کارت ثابتِ دوخطی خلاصه می‌شود.
        const _CollapsibleSection(
          icon: Icons.menu_book_rounded,
          title: 'قوانین نبرد',
          subtitle: 'پنج کارت، انتخاب مخفی، پنج راند',
          child: _RuleStrip(),
        ),
        Gaps.vXs,
        _DeckIntelPanel(
          activeInsights: activeInsights,
          suggestedDeck: suggestedDeck,
          onApplySuggested: _applySuggestedDeck,
        ),
        Gaps.vSm,
        if (_practiceFallback) ...[
          Container(
            padding: const EdgeInsets.all(Gaps.sm),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              color: _emerald.withValues(alpha: 0.10),
              border: Border.all(color: _emerald.withValues(alpha: 0.42)),
            ),
            child: const Row(
              children: [
                Text('🎁', style: TextStyle(fontSize: 24)),
                SizedBox(width: Gaps.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'دستهٔ تمرینی رایگان برای شروع سریع',
                        style: TextStyle(
                          color: _emerald,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        'این کارت‌ها فقط مقابل ربات فعال‌اند؛ برای آنلاین باید پنج کارت واقعی جمع کنی.',
                        style: TextStyle(fontSize: 11.5, color: Colors.white60),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Gaps.vSm,
        ],
        Text(
          _practiceFallback ? 'کارت‌های قرضی تمرین' : 'کلکسیون آماده نبرد',
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(color: Colors.white, fontWeight: FontWeight.w900),
        ),
        Gaps.vXs,
        if (_cards.length < 5)
          const AppCard(
            child: Text(
              'برای ورود به آرنا حداقل پنج کارت فعال در کلکسیون لازم داری.',
            ),
          )
        else
          // گریدِ عمودی برای ۳۰–۵۰ کارت صفحه را چند هزار پیکسل بلند
          // می‌کرد و بخش «قوانین/تحلیل» را مقصر نشان می‌داد. قفسهٔ افقی
          // یک ارتفاع ثابت دارد؛ دکمهٔ شروع هم پایین ثابت است، پس پیش از
          // بازی دیگر اسکرول عمودیِ طولانی نداریم.
          SizedBox(
            height: 238,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 2),
              itemCount: _cards.length,
              separatorBuilder: (_, __) => const SizedBox(width: Gaps.sm),
              itemBuilder: (_, index) {
                final card = _cards[index];
                final id = '${card['cardTypeId'] ?? card['id']}';
                return SizedBox(
                  width: 158,
                  child: RepaintBoundary(
                    child: PlayerCard(
                      card: card,
                      selected: _selected.contains(id),
                      onTap: () => _toggle(id),
                    ),
                  ),
                );
              },
            ),
          ),
        Gaps.vSm,
        _History(battles: (_data?['recentBattles'] as List?) ?? const []),
        Gaps.vSm,
      ],
    );
  }

  /// نوارِ ثابتِ پایین با دکمهٔ شروع.
  ///
  /// بیرون از ListView است، پس هرچقدر هم کاربر اسکرول کند سرِ جایش
  /// می‌ماند. وضعیتِ ترکیب («۳ از ۵») هم اینجاست تا کاربر بدونِ اسکرول
  /// بفهمد چرا دکمه غیرفعال است — قبلاً دکمهٔ خاکستری بدونِ توضیح بود.
  Widget _buildStartBar(BuildContext context) {
    final ready = _selected.length == 5;
    return Container(
      padding: EdgeInsets.fromLTRB(
        Gaps.md,
        Gaps.sm,
        Gaps.md,
        Gaps.sm + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF050D16),
        border: Border(
          top: BorderSide(color: _modeColor.withValues(alpha: 0.28)),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 18,
            offset: Offset(0, -6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_error != null) ...[
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            Gaps.vXs,
          ],
          Row(
            children: [
              // شمارندهٔ ترکیب: پنج نقطه که با انتخاب پر می‌شوند.
              for (var i = 0; i < 5; i++)
                Padding(
                  padding: const EdgeInsets.only(left: 5),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    width: i < _selected.length ? 13 : 9,
                    height: i < _selected.length ? 13 : 9,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < _selected.length ? _modeColor : Colors.white24,
                      boxShadow: i < _selected.length
                          ? [
                              BoxShadow(
                                color: _modeColor.withValues(alpha: 0.55),
                                blurRadius: 9,
                              ),
                            ]
                          : const [],
                    ),
                  ),
                ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  ready
                      ? 'ترکیب کامل است'
                      : 'ترکیب: ${faNum(_selected.length)} از ${faNum(5)} کارت',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: ready ? _emerald : Colors.white70,
                  ),
                ),
              ),
            ],
          ),
          Gaps.vXs,
          FilledButton(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
              backgroundColor: _modeColor,
              foregroundColor: const Color(0xFF04101A),
              shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
            ),
            onPressed: _busy || !ready ? null : _saveAndStart,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _busy ? 'در حال قفل ترکیب…' : 'ورود به $_modeTitle',
                  style: const TextStyle(
                    fontSize: 16.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  widget.vsBot
                      ? 'بدون ریسک امتیاز'
                      : widget.stake > 0
                          ? 'ورودی ${faNum(widget.stake)} امتیاز'
                          : 'مسابقه خصوصی',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSession(BuildContext context) {
    switch (_session.phase) {
      case GamePhase.waiting:
        return _Matchmaking(
          color: _modeColor,
          vsBot: widget.vsBot,
          onCancel: _editLineup,
        );
      case GamePhase.playing:
        final st = _session.state;
        final totalR = NumberParser.toInt(st['totalRounds']) == 0
            ? 5
            : NumberParser.toInt(st['totalRounds']);
        return Stack(
          children: [
            Column(
              children: [
                if (_session.connectionNotice != null ||
                    !_session.connected) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(Gaps.sm),
                    margin: const EdgeInsets.only(bottom: Gaps.sm),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF59E0B).withValues(alpha: .16),
                      borderRadius: Corners.rMd,
                    ),
                    child: Text(
                      _session.connectionNotice ??
                          'در حال بازیابی اتصال مسابقه…',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFF59E0B),
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
                _LiveBattle(session: _session, color: _modeColor),
              ],
            ),
            // اعلانِ سینماییِ «این راند سرِ چیست» — آخرین لایه تا روی همه‌چیز
            // بیاید. چون Positioned.fill است، ارتفاعی از چیدمان نمی‌گیرد.
            if (_session.introHolding && !_session.resultHolding)
              Positioned.fill(
                child: _RoundIntroOverlay(
                  focus: st['roundFocus'] is Map
                      ? Map<String, dynamic>.from(st['roundFocus'] as Map)
                      : null,
                  roundNumber: (NumberParser.toInt(st['roundIndex']) + 1).clamp(
                    1,
                    totalR,
                  ),
                  totalRounds: totalR,
                ),
              ),
          ],
        );
      case GamePhase.over:
        return Stack(
          children: [
            Column(
              children: [
                // پایان فقط یک صحنه دارد؛ HUD زنده بالای VICTORY تکرار
                // نمی‌شود. امتیاز و پنج راند داخل خود Finale هستند.
                _Finale(
                  session: _session,
                  color: _modeColor,
                  onAgain: _playAgain,
                  onEdit: _editLineup,
                  onShare: _shareResult,
                  sharing: _sharing,
                  mvp: _resultMvp(),
                  privateLobby: _session.matchMode == 'lobby',
                ),
              ],
            ),
          ],
        );
      case GamePhase.idle:
        return _ErrorPanel(
          message: _session.error ?? _error ?? 'بازی آماده شروع نیست',
          onBack: _editLineup,
        );
    }
  }
}

/// ═══════════════════════════════════════════════════════════════════════
/// درگاهِ تست برای صحنهٔ برخورد
/// ═══════════════════════════════════════════════════════════════════════
///
/// `_ClashStage` عمداً خصوصی است — بخشی از پیاده‌سازیِ داخلیِ صفحهٔ دوئل
/// است و نباید از جای دیگری ساخته شود. ولی انیمیشنِ فازبندی‌شده‌اش دقیقاً
/// همان چیزی است که بی‌صدا برمی‌گردد و باید نگهبان داشته باشد.
///
/// این پوشش، به‌جای عمومی کردنِ خودِ کلاس، فقط یک درِ باریک برای تست باز
/// می‌کند: نه سازندهٔ دیگری اضافه می‌شود، نه فیلدی عمومی می‌شود.
@visibleForTesting
class CardDuelClashStageForTest extends StatelessWidget {
  const CardDuelClashStageForTest({
    super.key,
    required this.round,
    required this.mine,
    required this.color,
  });

  final Map<String, dynamic>? round;
  final String mine;
  final Color color;

  @override
  Widget build(BuildContext context) =>
      _ClashStage(round: round, mine: mine, color: color);
}
