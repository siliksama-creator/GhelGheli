// ضربات پنالتی — صفحهٔ بازی.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../theme/tokens.dart';
import 'game_audio.dart';
import 'game_scaffold.dart';
import 'game_session.dart';
import 'penalty_net.dart';

const _accent = Color(0xFF38BDF8);
const _goalGreen = Color(0xFF84CC16);
const _saveBlue = Color(0xFF38BDF8);
const _missRed = Color(0xFFEF4444);
const _gold = Color(0xFFFFD36B);

class PenaltyScreen extends StatefulWidget {
  const PenaltyScreen({
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
  State<PenaltyScreen> createState() => _PenaltyScreenState();
}

class _PenaltyScreenState extends State<PenaltyScreen> {
  late final GameSession _s =
      GameSession(api: widget.api, gameId: 'penalty')..connect();

  @override
  void initState() {
    super.initState();
    if (widget.vsBot) {
      _s.playWithBotImmediately();
    } else if (widget.roomCode != null && widget.roomCode!.isNotEmpty) {
      _s.joinRoom(widget.roomCode!);
    } else if (widget.stake > 0) {
      _s.join(stake: widget.stake, vsBot: false);
    }
  }

  @override
  void dispose() {
    _s.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GameScaffold(
      session: _s,
      api: widget.api,
      title: 'ضربات پنالتی',
      accent: _accent,
      symbols: const {'X': 'assets/pass/football_icon.webp', 'O': 'assets/pass/glove_icon.webp'},
      onBack: widget.onBack,
      boardBuilder: (_) => _PenaltyBoard(session: _s),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// تخته و دروازهٔ پنالتی
// ═══════════════════════════════════════════════════════════════════════════
class _PenaltyBoard extends StatefulWidget {
  const _PenaltyBoard({required this.session});
  final GameSession session;

  @override
  State<_PenaltyBoard> createState() => _PenaltyBoardState();
}

class _PenaltyBoardState extends State<_PenaltyBoard>
    with SingleTickerProviderStateMixin {
  int? _selectedZone;
  double _power = 0.5;
  bool _holding = false;
  Ticker? _ticker;
  double _dir = 1.0;
  final _netKey = GlobalKey<PenaltyNetState>();

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((elapsed) {
      if (!_holding) return;
      setState(() {
        _power += _dir * 0.025;
        if (_power >= 1.0) {
          _power = 1.0;
          _dir = -1.0;
        } else if (_power <= 0.0) {
          _power = 0.0;
          _dir = 1.0;
        }
      });
    });
  }

  @override
  void dispose() {
    _ticker?.dispose();
    super.dispose();
  }

  void _onZoneTap(int zone) {
    final s = widget.session;
    if (s.phase != GamePhase.playing) return;
    final isShooter = s.mySymbol == 'X';

    if (isShooter) {
      setState(() => _selectedZone = zone);
    } else {
      // Goalie dive
      s.moveObject({'zone': zone, 'power': 0.8});
    }
  }

  void _onShootRelease() {
    if (_selectedZone == null) return;
    widget.session.moveObject({'zone': _selectedZone!, 'power': _power});
    setState(() {
      _holding = false;
      _selectedZone = null;
    });
    _ticker?.stop();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    final isShooter = s.mySymbol == 'X';

    return Column(
      children: [
        // Net animation container
        Expanded(
          flex: 5,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: Gaps.sm),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF0F172A), Color(0xFF020617)],
              ),
              border: Border.all(color: Colors.white12),
            ),
            child: PenaltyNet(key: _netKey),
          ),
        ),
        Gaps.vSm,

        // 9 Target Zones
        Expanded(
          flex: 4,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: Gaps.sm),
            padding: const EdgeInsets.all(Gaps.xs),
            decoration: BoxDecoration(
              borderRadius: Corners.rLg,
              color: Colors.white.withValues(alpha: 0.03),
              border: Border.all(color: Colors.white12),
            ),
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: 1.6,
              ),
              itemCount: 9,
              itemBuilder: (ctx, i) {
                final isSelected = _selectedZone == i;
                return InkWell(
                  borderRadius: Corners.rMd,
                  onTap: () => _onZoneTap(i),
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: Corners.rMd,
                      color: isSelected
                          ? _gold.withValues(alpha: 0.28)
                          : Colors.white.withValues(alpha: 0.06),
                      border: Border.all(
                        color: isSelected ? _gold : Colors.white24,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Center(
                      child: Text(
                        '${i + 1}',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: isSelected ? _gold : Colors.white70,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),

        // Shooter Power Meter
        if (isShooter) ...[
          Gaps.vSm,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Gaps.md),
            child: Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: Corners.rPill,
                    child: LinearProgressIndicator(
                      value: _power,
                      minHeight: 14,
                      backgroundColor: Colors.white12,
                      valueColor: AlwaysStoppedAnimation(
                        _power > 0.85 ? _missRed : (_power > 0.4 ? _goalGreen : _saveBlue),
                      ),
                    ),
                  ),
                ),
                Gaps.hSm,
                GestureDetector(
                  onTapDown: (_) {
                    setState(() => _holding = true);
                    _ticker?.start();
                  },
                  onTapUp: (_) => _onShootRelease(),
                  onTapCancel: () {
                    setState(() => _holding = false);
                    _ticker?.stop();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      borderRadius: Corners.rLg,
                      color: _selectedZone != null ? _goalGreen : Colors.grey,
                    ),
                    child: const Text(
                      'شوت (نگه دار)',
                      style: TextStyle(color: Colors.black, fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        Gaps.vSm,
      ],
    );
  }
}
