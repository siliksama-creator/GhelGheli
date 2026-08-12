import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../core/cosmetics.dart';
import '../../../core/share_invite.dart';
import '../../../theme/colors.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/avatar_image.dart';
import '../../../widgets/match_effect_visual.dart';
import '../../../widgets/player_card.dart';
import 'game_session.dart';

part 'card_duel/card_duel_widgets.dart';

const _gold = Color(0xFFFFD166);
const _cyan = Color(0xFF38BDF8);
const _emerald = Color(0xFF22E7A6);
const _purple = Color(0xFFA855F7);

/// Live three-card arena: bot practice, 100/1000 online, and private lobby.
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
      : widget.roomCode != null ||
              widget.initialStart?['matchMode'] == 'lobby'
          ? _purple
          : widget.stake == 1000
              ? _gold
              : _cyan;

  String get _modeTitle => widget.vsBot
      ? 'تمرین با ربات'
      : widget.roomCode != null ||
              widget.initialStart?['matchMode'] == 'lobby'
          ? 'لابی خصوصی'
          : 'نبرد آنلاین ${faNum(widget.stake)}';

  @override
  void initState() {
    super.initState();
    _started = widget.initialStart != null;
    _session.addListener(_onSession);
    unawaited(_load());
  }

  void _onSession() {
    if (!mounted) return;
    if (_session.phase == GamePhase.over) unawaited(_load(refreshSelection: false));
    setState(() {});
  }

  Future<void> _load({bool refreshSelection = true}) async {
    try {
      final response = await widget.api.get('/api/card-duel', fresh: true);
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

  Map<String, dynamic> get _myCosmetics {
    final me = _session.mySymbol;
    final player = me == null ? null : _session.players?[me];
    final cosmetics = player is Map ? player['cosmetics'] : null;
    return cosmetics is Map
        ? Map<String, dynamic>.from(cosmetics)
        : <String, dynamic>{};
  }

  Map<String, dynamic>? _resultMvp() {
    final history = (_session.state['history'] as List?) ?? const [];
    final cards = <Map<String, dynamic>>[];
    for (final raw in history.whereType<Map>()) {
      for (final key in const ['cardX', 'cardO']) {
        if (raw[key] is Map) cards.add(Map<String, dynamic>.from(raw[key] as Map));
      }
    }
    cards.sort((a, b) => NumberParser.toInt(b['power']).compareTo(NumberParser.toInt(a['power'])));
    return cards.isEmpty ? null : cards.first;
  }

  Future<XFile> _renderResultCard({required String title, required String score, required Map<String, dynamic>? mvp, required String url}) async {
    const size = Size(1080, 1080);
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final template = _myCosmetics['resultTemplate'] as String?;
    final palette = resultTemplateColors[template] ?? const [Color(0xFF071522), Color(0xFF35105D)];
    var drewArtwork = false;
    if (template != null) {
      try {
        final data = await rootBundle.load('assets/shop/cosmetics/$template.webp');
        final codec = await ui.instantiateImageCodec(
          data.buffer.asUint8List(), targetWidth: 1080, targetHeight: 1080);
        final frame = await codec.getNextFrame();
        canvas.drawImageRect(frame.image,
            Rect.fromLTWH(0, 0, frame.image.width.toDouble(), frame.image.height.toDouble()),
            Offset.zero & size, Paint());
        canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0x99020617));
        frame.image.dispose();
        codec.dispose();
        drewArtwork = true;
      } catch (_) {
        // Fall through to the deterministic palette if an old bundle lacks art.
      }
    }
    if (!drewArtwork) {
      final paint = Paint()..shader = LinearGradient(
        begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [palette.first, const Color(0xFF17304C), palette.last],
      ).createShader(Offset.zero & size);
      canvas.drawRect(Offset.zero & size, paint);
    }
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(34, 34, 1012, 1012), const Radius.circular(38)),
        Paint()..style = PaintingStyle.stroke..strokeWidth = 10..color = _gold);
    void text(String value, double y, double fontSize, Color color, {FontWeight weight = FontWeight.w700}) {
      final painter = TextPainter(
        text: TextSpan(text: value, style: TextStyle(fontSize: fontSize, color: color, fontWeight: weight)),
        textDirection: TextDirection.rtl, textAlign: TextAlign.center, maxLines: 2,
      )..layout(maxWidth: 900);
      painter.paint(canvas, Offset((1080 - painter.width) / 2, y));
    }
    text('GHELGHELI CARD ARENA', 120, 34, _cyan, weight: FontWeight.w900);
    text(title, 240, 76, Colors.white, weight: FontWeight.w900);
    text(score, 380, 120, _gold, weight: FontWeight.w900);
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(135, 590, 810, 200), const Radius.circular(28)),
        Paint()..color = _gold.withValues(alpha: .12));
    text('MVP مسابقه', 625, 32, _gold, weight: FontWeight.w900);
    text('${mvp?['name'] ?? 'ستاره آرنا'} · قدرت ${faNum(mvp?['power'])}', 690, 46, Colors.white, weight: FontWeight.w900);
    text('جرأت داری؟ مستقیم به چالشم بیا', 850, 34, _emerald, weight: FontWeight.w900);
    text(url, 925, 23, const Color(0xFFCBD5E1));
    final image = await recorder.endRecording().toImage(1080, 1080);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final directory = await getTemporaryDirectory();
    final file = File('${directory.path}/ghelgheli-result-${DateTime.now().millisecondsSinceEpoch}.png');
    await file.writeAsBytes(bytes!.buffer.asUint8List(), flush: true);
    return XFile(file.path, mimeType: 'image/png');
  }

  Future<void> _shareResult() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final invite = await _session.createChallenge();
      final score = _session.state['score'] is Map ? _session.state['score'] as Map : const {};
      final me = _session.mySymbol ?? 'X';
      final other = me == 'X' ? 'O' : 'X';
      final mvp = _resultMvp();
      final title = _session.winner == 'DRAW'
          ? 'نبرد برابر!'
          : _session.iWon ? 'من آرنا را بردم!' : 'این بار حریف برد!';
      final message = '$title\n'
          'نتیجه ${faNum(score[me])} - ${faNum(score[other])}\n'
          'MVP: ${mvp?['name'] ?? 'ستاره آرنا'} (قدرت ${faNum(mvp?['power'])})\n'
          'جرأت داری؟ مستقیم به چالشم بیا:\n${invite['shareUrl']}';
      final card = await _renderResultCard(
        title: title,
        score: '${faNum(score[me])} - ${faNum(score[other])}',
        mvp: mvp,
        url: '${invite['shareUrl']}',
      );
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        backgroundColor: const Color(0xFF071522),
        isScrollControlled: true,
        builder: (ctx) => SafeArea(child: Padding(
          padding: const EdgeInsets.all(Gaps.md),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.lg),
              decoration: BoxDecoration(
                borderRadius: Corners.rXl,
                gradient: LinearGradient(colors: resultTemplateColors[_myCosmetics['resultTemplate']]
                    ?? const [Color(0xFF17304C), Color(0xFF35105D)]),
                image: _myCosmetics['resultTemplate'] == null
                    ? null
                    : DecorationImage(
                        image: AssetImage('assets/shop/cosmetics/${_myCosmetics['resultTemplate']}.webp'),
                        fit: BoxFit.cover,
                        opacity: .26,
                      ),
                border: Border.all(color: _gold, width: 1.5),
              ),
              child: Column(children: [
                const Text('GHELGHELI CARD ARENA', style: TextStyle(color: _cyan, fontSize: 10, fontWeight: FontWeight.w900)),
                Gaps.vSm,
                Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                Text('${faNum(score[me])} - ${faNum(score[other])}', style: const TextStyle(color: _gold, fontSize: 40, fontWeight: FontWeight.w900)),
                Gaps.vSm,
                Text('MVP · ${mvp?['name'] ?? 'ستاره آرنا'}', style: const TextStyle(fontWeight: FontWeight.w900)),
                Text('قدرت ${faNum(mvp?['power'])}', style: const TextStyle(color: Colors.white60, fontSize: 11)),
                Gaps.vSm,
                const Text('از لینک چالش مستقیم وارد آرنا شو', style: TextStyle(color: _emerald, fontSize: 11, fontWeight: FontWeight.w800)),
              ]),
            ),
            Gaps.vMd,
            FilledButton.icon(
              onPressed: () async {
                await Share.shareXFiles([card], text: message, subject: 'نتیجه دوئل قلقلی');
                unawaited(widget.api.post('/api/analytics/events', {
                  'event': 'share', 'platform': 'android', 'gameId': 'card_duel',
                  'matchId': _session.matchId, 'target': 'system_share_image',
                }).catchError((_) => <String, dynamic>{}));
              },
              icon: const Icon(Icons.image_rounded),
              label: const Text('اشتراک کارت تصویری نتیجه'),
            ),
            Gaps.vSm,
            Row(children: [for (final target in shareTargets) Expanded(child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: InkWell(
                onTap: () async {
                  await shareText(target, message);
                  if (ctx.mounted) Navigator.pop(ctx);
                  unawaited(widget.api.post('/api/analytics/events', {
                    'event': 'share', 'platform': 'android', 'gameId': 'card_duel',
                    'matchId': _session.matchId, 'target': target.id,
                  }).catchError((_) => <String, dynamic>{}));
                },
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  MessengerIcon(app: target.app, size: 34),
                  const SizedBox(height: 4),
                  Text(target.label, style: const TextStyle(fontSize: 9.5)),
                ]),
              ),
            ))],),
            Gaps.vSm,
            OutlinedButton.icon(
              onPressed: () async {
                await copyText(message);
                if (ctx.mounted) Navigator.pop(ctx);
                unawaited(widget.api.post('/api/analytics/events', {
                  'event': 'share', 'platform': 'android', 'gameId': 'card_duel',
                  'matchId': _session.matchId, 'target': 'clipboard',
                }).catchError((_) => <String, dynamic>{}));
              },
              icon: const Icon(Icons.copy_rounded),
              label: const Text('کپی کارت نتیجه و لینک'),
            ),
          ]),
        )),
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
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
          children: [
            _ArenaHero(
              onBack: () {
                _session.leave();
                widget.onBack();
              },
              modeColor: _modeColor,
              modeTitle: _modeTitle,
              subtitle: widget.vsBot
                  ? 'رایگان و بدون جابه‌جایی امتیاز'
                  : widget.stake > 0
                      ? 'باخت یعنی کسر ${faNum(widget.stake)} امتیاز'
                      : 'مسابقه دوستانه خصوصی',
            ),
            Gaps.vMd,
            if (!_started) _buildSetup(context) else _buildSession(context),
          ],
        ),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _RuleStrip(),
        Gaps.vSm,
        _LineupPanel(
          selected: _selected,
          cards: _cards,
          teamPower: teamPower,
          onRemove: _toggle,
        ),
        Gaps.vSm,
        FilledButton(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(62),
            backgroundColor: _modeColor,
            foregroundColor: const Color(0xFF04101A),
            shape: RoundedRectangleBorder(borderRadius: Corners.rLg),
          ),
          onPressed: _busy || _selected.length != 5 ? null : _saveAndStart,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_busy ? 'در حال قفل ترکیب…' : 'ورود به $_modeTitle',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
              Text(widget.vsBot
                  ? 'بدون ریسک امتیاز'
                  : widget.stake > 0
                      ? 'ورودی ${faNum(widget.stake)} امتیاز'
                      : 'مسابقه خصوصی',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        if (_error != null) ...[
          Gaps.vXs,
          Text(_error!, textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        Gaps.vLg,
        if (_practiceFallback) ...[
          Container(
            padding: const EdgeInsets.all(Gaps.sm),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              color: _emerald.withValues(alpha: 0.10),
              border: Border.all(color: _emerald.withValues(alpha: 0.42)),
            ),
            child: const Row(children: [
              Text('🎁', style: TextStyle(fontSize: 24)),
              SizedBox(width: Gaps.sm),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('دستهٔ تمرینی رایگان برای شروع سریع',
                    style: TextStyle(color: _emerald, fontWeight: FontWeight.w900)),
                Text('این کارت‌ها فقط مقابل ربات فعال‌اند؛ برای آنلاین باید پنج کارت واقعی جمع کنی.',
                    style: TextStyle(fontSize: 9.5, color: Colors.white60)),
              ])),
            ]),
          ),
          Gaps.vSm,
        ],
        Text(_practiceFallback ? 'کارت‌های قرضی تمرین' : 'کلکسیون آماده نبرد',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                )),
        Gaps.vXs,
        if (_cards.length < 5)
          const AppCard(
            child: Text('برای ورود به آرنا حداقل پنج کارت فعال در کلکسیون لازم داری.'),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _cards.length,
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 210,
              mainAxisSpacing: Gaps.sm,
              crossAxisSpacing: Gaps.sm,
              childAspectRatio: 0.67,
            ),
            itemBuilder: (_, index) {
              final card = _cards[index];
              final id = '${card['cardTypeId'] ?? card['id']}';
              return PlayerCard(
                card: card,
                selected: _selected.contains(id),
                onTap: () => _toggle(id),
              );
            },
          ),
        Gaps.vLg,
        _History(battles: (_data?['recentBattles'] as List?) ?? const []),
      ],
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
        return Stack(children: [
          Column(children: [
            if (_session.connectionNotice != null || !_session.connected) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(Gaps.sm),
                margin: const EdgeInsets.only(bottom: Gaps.sm),
                decoration: BoxDecoration(color: const Color(0xFFF59E0B).withValues(alpha: .16), borderRadius: Corners.rMd),
                child: Text(_session.connectionNotice ?? 'در حال بازیابی اتصال مسابقه…', textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.w900)),
              ),
            ],
            _LiveBattle(session: _session, color: _modeColor),
          ]),
          if (_myCosmetics['matchEffect'] != null
              && matchEffectSupports('${_myCosmetics['matchEffect']}', 'entry'))
            Positioned.fill(child: IgnorePointer(child: _DuelCosmeticEffect(slug: '${_myCosmetics['matchEffect']}'))),
        ]);
      case GamePhase.over:
        return Stack(children: [
          Column(
            children: [
              _LiveBattle(session: _session, color: _modeColor),
              Gaps.vMd,
              _Finale(
                session: _session,
                color: _modeColor,
                resultColors: resultTemplateColors[_myCosmetics['resultTemplate']],
                resultTemplate: _myCosmetics['resultTemplate'] as String?,
                onAgain: _playAgain,
                onEdit: _editLineup,
                onShare: _shareResult,
                sharing: _sharing,
                mvp: _resultMvp(),
                privateLobby: _session.matchMode == 'lobby',
              ),
            ],
          ),
          if (_session.iWon && _myCosmetics['matchEffect'] != null
              && matchEffectSupports('${_myCosmetics['matchEffect']}', 'finish'))
            Positioned.fill(child: IgnorePointer(child: _DuelCosmeticEffect(slug: '${_myCosmetics['matchEffect']}', repeat: true))),
        ]);
      case GamePhase.idle:
        return _ErrorPanel(
          message: _session.error ?? _error ?? 'بازی آماده شروع نیست',
          onBack: _editLineup,
        );
    }
  }
}

class _DuelCosmeticEffect extends StatefulWidget {
  const _DuelCosmeticEffect({required this.slug, this.repeat = false});
  final String slug;
  final bool repeat;

  @override
  State<_DuelCosmeticEffect> createState() => _DuelCosmeticEffectState();
}

class _DuelCosmeticEffectState extends State<_DuelCosmeticEffect>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void initState() {
    super.initState();
    widget.repeat ? _controller.repeat(reverse: true) : _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        final t = Curves.easeOut.transform(_controller.value);
        return Center(
          child: Opacity(
            opacity: (widget.repeat ? .22 + t * .55 : 1 - t).clamp(0.0, 1.0).toDouble(),
            child: Transform.scale(
              scale: .45 + t * 1.45,
              child: SizedBox(
                width: 300,
                child: MatchEffectVisual(slug: widget.slug, progress: t),
              ),
            ),
          ),
        );
      },
    );
  }
}
