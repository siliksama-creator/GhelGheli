// جفت‌یاب — two ways to play, ONE board.
//
//   • حریف واقعی  : online, point-scoring, no bot ever. If nobody is around
//                   you stay in the queue instead of being quietly handed a
//                   computer opponent.
//   • تنها (رکوردی): time-attack against your own best. Zero points on
//                    purpose — a single player has no referee, so scoring it
//                    would just be a farm. The record IS the reward.
//
// Card artwork lives in memory_cards.dart, the solo machinery in
// solo_session.dart / solo_panels.dart, so this file stays a thin composer.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../api_client.dart';
import '../../../core/app_config.dart';
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
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  late final GameSession _versus = GameSession(
    api: widget.api,
    gameId: 'memory',
    existingSocket: widget.existingSocket,
    initialStart: widget.initialStart,
  )..connect();
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
    if (widget.initialStart != null) {
      return;
    }
    if (widget.vsBot) {
      _versus.playWithBotImmediately();
    } else if (widget.roomCode != null && widget.roomCode!.isNotEmpty) {
      _versus.joinRoom(widget.roomCode!);
    } else if (widget.stake > 0) {
      _versus.join(stake: widget.stake, vsBot: false);
    }
  }

  void _onSolo() {
    // A finished run changes the standings, so refresh them once.
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
      // A missing leaderboard must never block play — the board simply
      // renders its empty state.
    } finally {
      _loadingBoard = false;
    }
  }

  void _switchTo(_Mode m) {
    if (widget.stake == 100 || widget.stake == 1000) return;
    if (_mode == m) return;
    // Leaving one mode must actually release it server-side, otherwise the
    // player sits in the matchmaking queue while playing solo (and a real
    // opponent gets matched against a board nobody is watching).
    if (m == _Mode.solo) {
      _versus.leave();
    } else {
      _solo.leave();
    }
    setState(() => _mode = m);
  }

  @override
  void dispose() {
    _solo.removeListener(_onSolo);
    _solo.dispose();
    _versus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if ((widget.stake == 100 || widget.stake == 1000) && _mode == _Mode.solo) _mode = _Mode.versus;
    if (_mode == _Mode.solo) {
      return _SoloView(
        session: _solo,
        board: _board,
        bestMs: _bestMs,
        myRank: _myRank,
        onBack: widget.onBack,
        onVersus: () => _switchTo(_Mode.versus),
      );
    }

    return GameScaffold(
      session: _versus,
      api: widget.api,
      title: 'جفت‌یاب',
      accent: memoryAccent,
      symbols: const {'X': 'assets/games/memory/ball.webp', 'O': 'assets/games/memory/boot.webp'},
      onBack: widget.onBack,
      scoreboard: _Scoreboard(session: _versus),
      boardBuilder: (_) => _VersusBoard(session: _versus),
      // Shown on the lobby AND while hunting for an opponent: the escape
      // hatch that replaced the old silent bot fallback.
      soloOffer: (widget.stake == 100 || widget.stake == 1000) ? null : _SoloOffer(bestMs: _bestMs, onPlaySolo: () => _switchTo(_Mode.solo)),
    );
  }
}

/// Call-to-action that replaces the bot. Appears in the lobby and in the
/// "still looking" state.
class _SoloOffer extends StatelessWidget {
  const _SoloOffer({required this.onPlaySolo, this.bestMs});
  final VoidCallback onPlaySolo;
  final int? bestMs;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(Gaps.md),
      color: memoryAccent.withValues(alpha: 0.08),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.timer_rounded, color: memoryAccent, size: 20),
              Gaps.hXs,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('بازی تنها (رکوردی)',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    Text(
                      bestMs != null
                          ? 'رکورد فعلی تو: ${formatRunTime(bestMs)}'
                          : 'با ساعت مسابقه بده و رکورد بزن',
                      style: theme.textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          Gaps.vXs,
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onPlaySolo,
              style: OutlinedButton.styleFrom(
                foregroundColor: memoryAccent,
                side: const BorderSide(color: memoryAccent),
              ),
              icon: const Icon(Icons.speed_rounded, size: 18),
              label: const Text('شروع بازی تنها'),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Solo screen ───────────────────────────────────────────────────────────
class _SoloView extends StatelessWidget {
  const _SoloView({
    required this.session,
    required this.board,
    required this.bestMs,
    required this.myRank,
    required this.onBack,
    required this.onVersus,
  });

  final SoloSession session;
  final List board;
  final int? bestMs;
  final int? myRank;
  final VoidCallback onBack;
  final VoidCallback onVersus;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.md, Gaps.md, Gaps.xs),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () {
                  session.leave();
                  onBack();
                },
                icon: const Icon(Icons.arrow_back_rounded),
                tooltip: 'بازگشت',
              ),
              Expanded(
                child: Text('جفت‌یاب · تنها',
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
              ),
              TextButton.icon(
                onPressed: session.running ? null : onVersus,
                icon: const Icon(Icons.people_alt_rounded, size: 17),
                label: const Text('حریف واقعی'),
              ),
            ],
          ),
          Gaps.vXs,
          Expanded(child: _body(context, theme)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, ThemeData theme) {
    if (session.error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off_rounded, size: 48, color: theme.colorScheme.outline),
            Gaps.vSm,
            Text(session.error!, textAlign: TextAlign.center),
            Gaps.vMd,
            FilledButton.icon(
              onPressed: session.start,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تلاش دوباره'),
            ),
          ],
        ),
      );
    }

    if (session.phase == SoloPhase.idle) {
      return ListView(
        padding: EdgeInsets.zero,
        children: [
          AppCard(
            child: Column(
              children: [
                const Icon(Icons.timer_rounded, size: 38),
                Gaps.vXs,
                Text('مسابقه با ساعت',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
                Gaps.vXxs,
                Text(
                  // عددِ جفت‌ها از `live_rules.memoryPairs` (آینهٔ وب): تخته
                  // ۴×۴ است و اگر ادمین چرخشِ تخته را کم کند، جمله‌ای که
                  // «۸ جفت» می‌گوید دروغ می‌شود.
                  '${liveText('games.memoryRule', 'همه‌ی ۸ جفت را در کمترین زمان و کمترین برگرداندن پیدا کن.', vars: {'memoryPairs': liveRule('memoryPairs', 8)})}\n'
                  'این حالت امتیاز ندارد؛ فقط رکوردت ثبت می‌شود.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall,
                ),
                if (bestMs != null) ...[
                  Gaps.vXs,
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: Gaps.sm, vertical: 6),
                    decoration: BoxDecoration(
                      color: memoryAccent.withValues(alpha: 0.15),
                      borderRadius: Corners.rPill,
                    ),
                    child: Text('بهترین رکورد تو: ${formatRunTime(bestMs)}',
                        style: theme.textTheme.labelMedium?.copyWith(
                            color: memoryAccent, fontWeight: FontWeight.w800)),
                  ),
                ],
                Gaps.vMd,
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: session.start,
                    style: FilledButton.styleFrom(
                      backgroundColor: memoryAccent,
                      minimumSize: const Size(0, 50),
                    ),
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: const Text('شروع'),
                  ),
                ),
              ],
            ),
          ),
          Gaps.vSm,
          SoloLeaderboard(rows: board, myRank: myRank),
          Gaps.vMd,
        ],
      );
    }

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        SoloHud(session: session, bestMs: bestMs),
        Gaps.vSm,
        _MemoryGrid(
          cards: (session.state['cards'] as List?) ?? const [],
          playable: (session.state['playable'] as List?)?.cast<int>() ?? const [],
          cols: (session.state['cols'] as num?)?.toInt() ?? 4,
          lastResult: '${session.state['lastResult'] ?? ''}',
          enabled: session.phase == SoloPhase.playing,
          mySymbol: 'X',
          soloMode: true,
          onTap: session.move,
        ),
        Gaps.vMd,
        if (session.phase == SoloPhase.over) ...[
          SoloResult(
            session: session,
            onRetry: session.start,
            onExit: session.leave,
          ),
          Gaps.vSm,
          SoloLeaderboard(rows: board, myRank: myRank),
        ] else
          Center(
            child: OutlinedButton.icon(
              onPressed: session.leave,
              icon: const Icon(Icons.close_rounded),
              label: const Text('پایان زودهنگام'),
            ),
          ),
        Gaps.vMd,
      ],
    );
  }
}

// ── Shared grid ───────────────────────────────────────────────────────────
class _MemoryGrid extends StatelessWidget {
  const _MemoryGrid({
    required this.cards,
    required this.playable,
    required this.cols,
    required this.lastResult,
    required this.enabled,
    required this.mySymbol,
    required this.onTap,
    this.soloMode = false,
  });

  final List cards;
  final List<int> playable;
  final int cols;
  final String lastResult;
  final bool enabled;
  final String? mySymbol;
  final bool soloMode;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Reserve the row so the whole grid doesn't jump up and down each
        // time the hit/miss line appears.
        SizedBox(
          height: 16,
          child: AnimatedOpacity(
            duration: Motion.fast,
            opacity: (lastResult == 'match' || lastResult == 'miss') ? 1 : 0,
            child: Text(
              lastResult == 'match'
                  ? (soloMode ? ' جفت شد!' : ' جفت شد! دوباره بزن')
                  : ' جفت نشد',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: lastResult == 'match'
                        ? const Color(0xFF34D399)
                        : const Color(0xFFF87171),
                  ),
            ),
          ),
        ),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 340),
            child: GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: cols,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: 1.0,
              ),
              itemCount: cards.length,
              itemBuilder: (context, i) {
                final c = cards[i];
                final map = c is Map ? c : const {};
                return MemoryCard(
                  face: map['face'] as String?,
                  matchedBy: map['matched'] as String?,
                  isUp: map['up'] == true,
                  mySymbol: mySymbol,
                  soloMode: soloMode,
                  enabled: enabled && playable.contains(i),
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onTap(i);
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _VersusBoard extends StatelessWidget {
  const _VersusBoard({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    return _MemoryGrid(
      cards: (session.state['cards'] as List?) ?? const [],
      playable: (session.state['playable'] as List?)?.cast<int>() ?? const [],
      cols: (session.state['cols'] as num?)?.toInt() ?? 4,
      lastResult: '${session.state['lastResult'] ?? ''}',
      enabled: session.myTurn,
      mySymbol: session.mySymbol,
      onTap: session.move,
    );
  }
}

/// Pair counts for both players, with the leader highlighted.
class _Scoreboard extends StatelessWidget {
  const _Scoreboard({required this.session});
  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final scores = session.state['scores'];
    if (scores is! Map) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final x = (scores['X'] as num?)?.toInt() ?? 0;
    final o = (scores['O'] as num?)?.toInt() ?? 0;

    Widget side(String sym, int value, bool leading) => Expanded(
          child: AnimatedContainer(
            duration: Motion.fast,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              borderRadius: Corners.rMd,
              color:
                  leading ? memoryAccent.withValues(alpha: 0.16) : Colors.transparent,
            ),
            child: Column(
              children: [
                Text(session.mySymbol == sym ? 'شما' : 'حریف',
                    style: theme.textTheme.labelSmall),
                Text('${faNum(value)} جفت',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        );

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: Gaps.sm, vertical: 4),
      child: Row(
        children: [
          side('X', x, x > o),
          const Text('•', style: TextStyle(color: Colors.white24)),
          side('O', o, o > x),
        ],
      ),
    );
  }
}
