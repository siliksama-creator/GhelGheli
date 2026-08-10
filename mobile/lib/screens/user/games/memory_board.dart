// جفت‌یاب — two ways to play, ONE board.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import 'game_scaffold.dart';
import 'game_session.dart';
import 'memory_cards.dart';
import 'solo_panels.dart';
import 'solo_session.dart';

enum _Mode { versus, solo }

class MemoryScreen extends StatefulWidget {
  const MemoryScreen({
    super.key,
    required this.api,
    required this.onBack,
    this.stake = 0,
    this.vsBot = false,
    this.roomCode,
  });

  final ApiClient api;
  final VoidCallback onBack;
  final int stake;
  final bool vsBot;
  final String? roomCode;

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  late final GameSession _versus =
      GameSession(api: widget.api, gameId: 'memory')..connect();
  late final SoloSession _solo = SoloSession(api: widget.api, gameId: 'memory');

  _Mode _mode = _Mode.versus;
  List _board = const [];
  int? _bestMs;
  int? _myRank;
  bool _loadingBoard = false;

  @override
  void initState() {
    super.initState();
    _solo.addListener(_onSolo);
    _loadRecords();

    if (widget.vsBot) {
      _versus.playWithBotImmediately();
    } else if (widget.roomCode != null && widget.roomCode!.isNotEmpty) {
      _versus.joinRoom(widget.roomCode!);
    } else if (widget.stake > 0) {
      _versus.join(stake: widget.stake, vsBot: false);
    }
  }

  void _onSolo() {
    if (_solo.phase == SoloPhase.over && !_loadingBoard) _loadRecords();
    if (mounted) setState(() {});
  }

  Future<void> _loadRecords() async {
    if (_loadingBoard) return;
    _loadingBoard = true;
    try {
      final d = await widget.api.get('/api/games/memory/solo');
      if (!mounted) return;
      setState(() {
        _board = (d is Map ? d['leaderboard'] as List? : null) ?? const [];
        final best = d is Map ? d['best'] : null;
        _bestMs = best is Map ? (best['durationMs'] as num?)?.toInt() : null;
        _myRank = d is Map ? (d['rank'] as num?)?.toInt() : null;
      });
    } catch (_) {
    } finally {
      _loadingBoard = false;
    }
  }

  void _switchTo(_Mode m) {
    if (_mode == m) return;
    if (_mode == _Mode.versus) _versus.leave();
    if (_mode == _Mode.solo) _solo.leave();
    setState(() => _mode = m);
  }

  @override
  void dispose() {
    _solo.removeListener(_onSolo);
    _versus.dispose();
    _solo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_mode == _Mode.solo) {
      return SoloBoard(
        session: _solo,
        title: 'جفت‌یاب رکوردی',
        accent: const Color(0xFFA855F7),
        cardBackAsset: 'assets/games/memory/medal.webp',
        cardFaceAsset: memoryCardAsset,
        onBack: widget.onBack,
        leaderboard: _board,
        bestDurationMs: _bestMs,
        myRank: _myRank,
        onSwitchToVersus: () => _switchTo(_Mode.versus),
      );
    }

    return GameScaffold(
      session: _versus,
      api: widget.api,
      title: 'جفت‌یاب',
      accent: const Color(0xFFA855F7),
      symbols: const {'X': 'assets/pass/football_icon.webp', 'O': 'assets/games/memory/medal.webp'},
      onBack: widget.onBack,
      scoreboard: _VersusScore(session: _versus),
      boardBuilder: (_) => _VersusGrid(session: _versus),
      soloOffer: SoloOfferCard(
        title: 'حریف پیدا نشد؟ تنها رکورد بزن!',
        subtitle: 'بدون حریف، سرعت دست و حافظه‌ات را در چالش رکوردی بسنج.',
        onStart: () {
          _switchTo(_Mode.solo);
          _solo.start();
        },
      ),
    );
  }
}

class _VersusScore extends StatelessWidget {
  const _VersusScore({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final s = session.state;
    final scores = s['scores'] as Map?;
    final x = (scores?['X'] as num?)?.toInt() ?? 0;
    final o = (scores?['O'] as num?)?.toInt() ?? 0;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('جفت‌های شما: ${session.mySymbol == 'X' ? x : o}',
            style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFFA855F7))),
        const SizedBox(width: 24),
        Text('جفت‌های حریف: ${session.mySymbol == 'X' ? o : x}',
            style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.white70)),
      ],
    );
  }
}

class _VersusGrid extends StatelessWidget {
  const _VersusGrid({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final s = session.state;
    final board = (s['board'] as List?) ?? List.generate(16, (i) => {'index': i, 'claimed': false, 'face': null});

    return AspectRatio(
      aspectRatio: 1,
      child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
        ),
        itemCount: 16,
        itemBuilder: (ctx, i) {
          final cell = board[i] is Map ? board[i] as Map : const {};
          final claimed = cell['claimed'] == true;
          final face = cell['face'] as String?;

          return InkWell(
            onTap: (!claimed && session.myTurn) ? () => session.move(i) : null,
            borderRadius: Corners.rMd,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              decoration: BoxDecoration(
                borderRadius: Corners.rMd,
                color: claimed
                    ? Colors.white.withValues(alpha: 0.05)
                    : (face != null ? const Color(0xFFA855F7).withValues(alpha: 0.25) : const Color(0xFF1E1B4B)),
                border: Border.all(
                  color: claimed ? Colors.transparent : (face != null ? const Color(0xFFA855F7) : Colors.white24),
                ),
              ),
              child: Center(
                child: claimed
                    ? null
                    : (face != null
                        ? Image.asset(memoryCardAsset(face), width: 36, height: 36)
                        : Image.asset('assets/games/memory/medal.webp', width: 24, height: 24)),
              ),
            ),
          );
        },
      ),
    );
  }
}
