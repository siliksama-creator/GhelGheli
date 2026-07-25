import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';

class GamesHubPage extends StatefulWidget {
  final ApiClient api;
  const GamesHubPage({super.key, required this.api});

  @override
  State<GamesHubPage> createState() => _GamesHubPageState();
}

class _GamesHubPageState extends State<GamesHubPage> {
  String? _activeGame;

  @override
  Widget build(BuildContext context) {
    if (_activeGame == 'tictactoe') {
      return TicTacToeGame(
        api: widget.api,
        onBack: () => setState(() => _activeGame = null),
      );
    }

    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(Gaps.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('بخش بازی‌ها 🎮', style: theme.textTheme.headlineSmall),
          Gaps.vXs,
          Text('بازی مورد نظر خود را انتخاب کنید تا با دیگر بازیکنان رقابت کنید!', style: theme.textTheme.bodyMedium),
          Gaps.vLg,
          Expanded(
            child: GridView.count(
              crossAxisCount: 2,
              mainAxisSpacing: Gaps.md,
              crossAxisSpacing: Gaps.md,
              children: [
                _GameCard(
                  title: 'دوز آنلاین',
                  subtitle: 'رقابت دو نفره',
                  icon: '❌⭕',
                  onTap: () => setState(() => _activeGame = 'tictactoe'),
                ),
                const _GameCard(
                  title: 'منچ آنلاین',
                  subtitle: 'به‌زودی...',
                  icon: '🎲',
                  opacity: 0.5,
                ),
                const _GameCard(
                  title: 'نقطه‌بازی',
                  subtitle: 'به‌زودی...',
                  icon: '🎯',
                  opacity: 0.5,
                ),
              ],
            ),
          )
        ],
      ),
    );
  }
}

class _GameCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String icon;
  final VoidCallback? onTap;
  final double opacity;

  const _GameCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.onTap,
    this.opacity = 1.0,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Opacity(
      opacity: opacity,
      child: AppCard(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(icon, style: const TextStyle(fontSize: 48)),
            Gaps.vSm,
            Text(title, style: theme.textTheme.titleMedium),
            Text(subtitle, style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class TicTacToeGame extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onBack;
  const TicTacToeGame({super.key, required this.api, required this.onBack});

  @override
  State<TicTacToeGame> createState() => _TicTacToeGameState();
}

class _TicTacToeGameState extends State<TicTacToeGame> {
  io.Socket? _socket;
  String _status = 'idle'; // idle, waiting, playing, over
  Map? _gameData;
  String? _mySymbol;

  @override
  void initState() {
    super.initState();
    _initSocket();
  }

  void _initSocket() {
    _socket = io.io(widget.api.baseUrl, io.OptionBuilder()
      .setTransports(['websocket'])
      .setAuth({'token': widget.api.token})
      .build());

    _socket?.onConnect((_) => debugPrint('Connected to game socket'));

    _socket?.on('game:waiting', (_) {
      if(mounted) setState(() => _status = 'waiting');
    });

    _socket?.on('game:start', (data) {
      if(mounted) {
        setState(() {
        _gameData = data;
        _mySymbol = data['yourSymbol'];
        _status = 'playing';
      });
      }
    });

    _socket?.on('game:update', (data) {
      if(mounted) {
        setState(() {
        _gameData!['board'] = data['board'];
        if(data['turn'] != null) _gameData!['turn'] = data['turn'];
      });
      }
    });

    _socket?.on('game:over', (data) {
      if(mounted) {
        setState(() {
        _status = 'over';
        _gameData!['winner'] = data['winner'];
      });
      }
    });
  }

  @override
  void dispose() {
    _socket?.disconnect();
    super.dispose();
  }

  void _joinGame() => _socket?.emit('game:join');
  void _leaveQueue() {
    _socket?.emit('game:leave');
    setState(() => _status = 'idle');
  }

  void _play(int index) {
    if (_status != 'playing' || _gameData == null) return;
    // Only allow a move on our own turn and on a still-empty cell, so the
    // UI doesn't fire pointless events the server will just reject.
    if (_mySymbol == null || _gameData!['turn'] != _mySymbol) return;
    final board = _gameData!['board'];
    if (board is List && board[index] != null) return;
    _socket?.emit('game:move', {'roomId': _gameData!['roomId'], 'index': index});
  }

  /// Human readable end-of-game line. Previously this was a string with an
  /// escaped `\$`, so the app literally printed the Dart expression instead
  /// of the winner.
  String _resultText(Object? winner) {
    if (winner == 'DRAW') return 'مساوی!';
    if (winner == 'DISCONNECT') return 'حریف خارج شد!';
    if (winner == null) return 'پایان بازی';
    if (_mySymbol != null) {
      return winner == _mySymbol ? 'شما بردید! 🎉' : 'شما باختید';
    }
    return winner == 'X' ? 'برنده: ❌' : 'برنده: ⭕';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final board = _gameData?['board'] ?? List.filled(9, null);
    final turn = _gameData?['turn'];
    final winner = _gameData?['winner'];

    return Padding(
      padding: const EdgeInsets.all(Gaps.lg),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(icon: const Icon(Icons.arrow_back), onPressed: widget.onBack),
              Text('بازی دوز آنلاین', style: theme.textTheme.titleLarge),
            ],
          ),
          Gaps.vLg,
          if (_status == 'idle')
            ElevatedButton(
              onPressed: _joinGame,
              style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
              child: const Text('شروع جستجوی حریف', style: TextStyle(fontSize: 18)),
            )
          else if (_status == 'waiting')
            Column(
              children: [
                const CircularProgressIndicator(),
                Gaps.vMd,
                Text('در حال جستجوی حریف...', style: theme.textTheme.bodyLarge),
                Gaps.vMd,
                ElevatedButton(
                  onPressed: _leaveQueue,
                  style: ElevatedButton.styleFrom(backgroundColor: theme.colorScheme.error),
                  child: const Text('لغو جستجو', style: TextStyle(color: Colors.white)),
                ),
              ],
            )
          else if (_status == 'playing' || _status == 'over')
            Expanded(
              child: Column(
                children: [
                  AppCard(
                    child: Padding(
                      padding: const EdgeInsets.all(Gaps.md),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            children: [
                              const Text('❌', style: TextStyle(fontSize: 24)),
                              Text(_gameData?['players']['X']['nickname'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                            ],
                          ),
                          Column(
                            children: [
                              Text('نوبت', style: theme.textTheme.labelMedium),
                              Text(turn == 'X' ? '❌' : '⭕', style: const TextStyle(fontSize: 24)),
                            ],
                          ),
                          Column(
                            children: [
                              const Text('⭕', style: TextStyle(fontSize: 24)),
                              Text(_gameData?['players']['O']['nickname'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  Gaps.vLg,
                  // The board grid with explicit thick lines
                  Container(
                    constraints: const BoxConstraints(maxWidth: 320, maxHeight: 320),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.onSurface, // The grid lines color (opposite of surface)
                      borderRadius: Corners.rLg,
                      border: Border.all(color: theme.colorScheme.onSurface, width: 6),
                    ),
                    child: GridView.builder(
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 6, // Thick line
                        crossAxisSpacing: 6, // Thick line
                      ),
                      itemCount: 9,
                      itemBuilder: (context, i) {
                        return GestureDetector(
                          onTap: () => _play(i),
                          child: Container(
                            color: theme.colorScheme.surface, // Cell background
                            child: Center(
                              child: Text(
                                board[i] == 'X' ? '❌' : (board[i] == 'O' ? '⭕' : ''),
                                style: const TextStyle(fontSize: 50),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  Gaps.vLg,
                  if (_status == 'over') ...[
                    Text(
                      _resultText(winner),
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(color: theme.colorScheme.primary),
                    ),
                    Gaps.vMd,
                    ElevatedButton(
                      onPressed: () => setState(() { _status = 'idle'; _gameData = null; }),
                      child: const Text('بازی دوباره'),
                    ),
                  ] else
                    ElevatedButton(
                      onPressed: _leaveQueue,
                      style: ElevatedButton.styleFrom(backgroundColor: theme.colorScheme.error),
                      child: const Text('خروج از بازی', style: TextStyle(color: Colors.white)),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
