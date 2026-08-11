import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../theme/colors.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/safe_image.dart';
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
  String? _error;
  Map<String, dynamic>? _data;
  final List<String> _selected = [];

  List<Map<String, dynamic>> get _ownedCards =>
      ((_data?['playableCards'] as List?) ?? const [])
          .whereType<Map>()
          .map((card) => Map<String, dynamic>.from(card))
          .toList(growable: false);

  bool get _practiceFallback => widget.vsBot && _ownedCards.length < 3;

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
      final prepared = widget.vsBot && owned.length < 3
          ? (map['practiceCards'] as List? ?? const [])
          : ((map['activeDeck'] as Map?)?['cards'] as List? ?? const []);
      final activeCards = prepared
          .whereType<Map>()
          .map((card) => '${card['cardTypeId'] ?? card['id'] ?? ''}')
          .where((id) => id.isNotEmpty)
          .take(3)
          .toList();
      setState(() {
        _data = map;
        if (refreshSelection && !_started) {
          _selected
            ..clear()
            ..addAll(activeCards ?? const []);
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
    if (_selected.length != 3 || _busy) return;
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
      } else if (_selected.length < 3) {
        _selected.add(id);
      } else {
        _snack('ترکیب فقط سه کارت دارد؛ اول یکی را بردار');
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
    if (widget.vsBot) {
      _session.playWithBotImmediately();
    } else if (widget.stake > 0) {
      _session.join(stake: widget.stake, vsBot: false);
    } else {
      widget.onBack();
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
          onPressed: _busy || _selected.length != 3 ? null : _saveAndStart,
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
                Text('این کارت‌ها فقط مقابل ربات فعال‌اند؛ برای آنلاین باید سه کارت واقعی جمع کنی.',
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
        if (_cards.length < 3)
          const AppCard(
            child: Text('برای ورود به آرنا حداقل سه کارت فعال در کلکسیون لازم داری.'),
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
              return _HoloCard(
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
        return _LiveBattle(session: _session, color: _modeColor);
      case GamePhase.over:
        return Column(
          children: [
            _LiveBattle(session: _session, color: _modeColor),
            Gaps.vMd,
            _Finale(
              session: _session,
              color: _modeColor,
              onAgain: _playAgain,
              onEdit: _editLineup,
              privateLobby: _session.matchMode == 'lobby',
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
