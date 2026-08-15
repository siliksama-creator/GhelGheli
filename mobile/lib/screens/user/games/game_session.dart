// Shared socket session for every board game.
//
// All games speak the same protocol (join / waiting / start / update / over),
// so the connection handling lives here once and each board file only draws
// its own grid. Keeps every game screen small.
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../api_client.dart';
import 'game_audio.dart';

enum GamePhase { idle, waiting, playing, over }

class GameSession extends ChangeNotifier {
  int stake = 0;
  int totalPot = 0;
  int netPot = 0;
  int commission = 0;
  GameSession({
    required this.api,
    required this.gameId,
    io.Socket? existingSocket,
    Map<String, dynamic>? initialStart,
  })  : _existingSocket = existingSocket,
        _initialStart = initialStart;

  final ApiClient api;
  final String gameId;
  final io.Socket? _existingSocket;
  final Map<String, dynamic>? _initialStart;

  io.Socket? _socket;
  GamePhase phase = GamePhase.idle;
  Map<String, dynamic> state = const {};
  Map? players;
  String? mySymbol;
  String? turn;
  String? winner;
  String? finishReason;
  String? error;
  bool vsBot = false;
  String? matchMode;
  String? _roomId;
  String? matchId;
  String settlementStatus = 'settled';

  /// واریز authoritative مسابقهٔ امتیازی؛ فقط پس از تأیید transaction
  /// سرور مقدار می‌گیرد تا UI هیچ پاداشی را حدس نزند.
  int stakePayoutAmount = 0;
  String? stakePayoutWinner;
  int? stakeWinnerBalanceAfter;
  int stakePayoutSequence = 0;
  String? _announcedPayoutMatchId;

  /// سکهٔ لیگ که در این مسابقه اعطا شد و نمادِ (X/O) برنده‌ای که گرفتش.
  ///
  /// سرور `coins` را در `game:settlement` برای **هر دو** بازیکن می‌فرستد،
  /// پس بازنده هم می‌بیند حریفش چه بُرد — همان چیزی که وب نشان می‌دهد.
  /// وقتی صفر است هیچ چیزی رسم نمی‌شود: «۰ سکه» به کاربر می‌گوید چیزی
  /// خراب است، در حالی که فقط سهمیه تمام شده یا لیگی فعال نبوده.
  int coinsAwarded = 0;
  String? coinsWinner;

  bool rematchAvailable = false;
  bool rematchWaiting = false;
  String? connectionNotice;
  int? lastMove;

  /// Countdown for the player currently on move. Driven by the server's
  /// `deadline` so both clients agree even if one lags.
  int secondsLeft = 0;

  /// تا وقتی اعلانِ راند روی صفحه است، ساعت نمی‌رود.
  /// UI از این پرچم برای نشان دادنِ «آماده…» به‌جای عدد استفاده می‌کند.
  bool introHolding = false;
  bool resultHolding = false;
  int _introHoldMs = 0;
  int _resultHoldMs = 0;
  int turnSeconds = 15;

  /// ═════════════════════════════════════════════════════════════════════
  /// چرا ساعت یک Listenable جدا دارد
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// شمارش معکوس هر ثانیه یک بار عوض می‌شود و تنها چیزی که روی صفحه
  /// تغییر می‌کند، یک عددِ دورقمی و یک حلقهٔ پیشرفت است.
  ///
  /// ولی تا پیش از این، ساعت روی **همان** `notifyListeners` سوار بود
  /// که تغییرِ وضعیتِ بازی را اعلام می‌کند. یعنی `GameScaffold` — و از
  /// طریق آن کل تخته — هر ثانیه یک بار کاملاً بازساخته می‌شد:
  ///
  ///   • اتللو: ۶۴ خانه با decoration و border،
  ///   • جفت‌یاب: ۱۶ کارت با تصویر،
  ///   • پنالتی: تابلوی امتیاز، شبکهٔ ۹ ناحیه و نقاشِ زمین.
  ///
  /// همهٔ اینها فقط برای اینکه «۱۲» به «۱۱» تبدیل شود. روی گوشیِ
  /// کم‌توان همین باعثِ لرزشِ محسوس در بازی بود — دقیقاً همان «کند
  /// شدن» که مالک گزارش کرد.
  ///
  /// حالا تیکِ ساعت فقط `clock` را اعلان می‌دهد. هر ویجتی که واقعاً
  /// عدد را نشان می‌دهد (نوار حریف) به `clock` گوش می‌دهد و بقیهٔ
  /// درخت دست‌نخورده می‌ماند.
  ///
  /// نکتهٔ مهم: `clock` علاوه بر تیک، در **شروع و پایانِ** هر نوبت هم
  /// اعلان می‌دهد، وگرنه حلقهٔ شمارش روی مقدار نوبتِ قبلی یخ می‌زد.
  final ChangeNotifier clock = ChangeNotifier();

  /// آیا این نشست آزاد شده است.
  ///
  /// ═════════════════════════════════════════════════════════════════════
  /// چرا این پرچم لازم شد — باگی که خودِ افزودنِ `clock` ساخت
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// این یک نمونهٔ خوب از «فیکس، باگ تازه می‌سازد» است و در پاسِ دومِ
  /// بازبینی پیدا شد، نه در پاس اول.
  ///
  /// `ChangeNotifier.notifyListeners()` بعد از `dispose()` **پرتاب
  /// می‌کند**. توالیِ واقعیِ خطرناک:
  ///
  ///   ۱. کاربر وسطِ بازی دکمهٔ back را می‌زند → صفحه dispose می‌شود،
  ///   ۲. یک بستهٔ socket که همان لحظه در راه بود می‌رسد،
  ///   ۳. گرداننده `_stopClock()` را صدا می‌زند،
  ///   ۴. `_stopClock` روی `clock`ِ آزادشده اعلان می‌دهد → کرش در دستِ
  ///      کاربر.
  ///
  /// این به زمان‌بندیِ شبکه بستگی دارد، پس در تستِ دستی تقریباً هرگز
  /// دیده نمی‌شود و فقط روی گوشیِ کاربر با شبکهٔ کند رخ می‌دهد.
  ///
  /// نکته: نمی‌شود به `hasListeners` تکیه کرد، چون آن هم بعد از
  /// dispose پرتاب می‌کند.
  bool _disposed = false;

  /// اعلانِ امنِ ساعت — بعد از dispose بی‌صدا نادیده گرفته می‌شود.
  void _tickClock() {
    if (_disposed) return;
    clock.notifyListeners();
  }

  /// فقط برای تست: همان مسیرِ اعلانِ ساعت را صدا می‌زند.
  @visibleForTesting
  void clockTickForTest() => _tickClock();

  /// Countdown while hunting for a real opponent (before the bot steps in).
  int searchSecondsLeft = 0;
  int searchSeconds = 15;

  /// Whether the server will hand us a bot when the hunt window closes.
  /// جفت‌یاب says NO: the player stays queued and is offered solo instead,
  /// so the UI must not promise a bot that will never arrive.
  bool botFallback = true;
  bool soloAvailable = false;

  /// True once the first search window elapsed with no opponent found and
  /// there is no bot to fall back on — we keep looking.
  bool stillSearching = false;
  String? timedOutSymbol;

  /// False while the socket is down, so the UI can show a reconnect notice
  /// instead of a silently frozen board.
  bool connected = true;
  Timer? _ticker;
  Timer? _searchTicker;
  Timer? _payoutTimer;
  int _lastTickPlayed = -1;

  bool get myTurn =>
      phase == GamePhase.playing && turn != null && turn == mySymbol;

  /// Opponent's user id, for opening their public profile.
  Object? get opponentId {
    if (mySymbol == null) return null;
    final other = players?[mySymbol == 'X' ? 'O' : 'X'];
    if (other is Map && other['isBot'] != true) return other['id'];
    return null;
  }

  Map? playerInfo(String symbol) {
    final p = players?[symbol];
    return p is Map ? p : null;
  }

  void connect() {
    if (_socket != null) return;
    final s = _existingSocket ??
        io.io(
          api.baseUrl,
          io.OptionBuilder()
              // Allow the polling fallback: some mobile carriers and captive
              // proxies block raw websockets, and a websocket-only client simply
              // never connects on those networks.
              .setTransports(['websocket', 'polling'])
              .setAuth({'token': api.token})
              .enableForceNew()
              .enableReconnection()
              .setReconnectionAttempts(20)
              .setReconnectionDelay(800)
              .setReconnectionDelayMax(5000)
              .setTimeout(10000)
              .build(),
        );
    _socket = s;

    s.onConnectError((e) {
      // Only surface a hard failure before we ever connected; once a game is
      // running a blip is handled by the reconnect logic below.
      if (phase == GamePhase.idle || phase == GamePhase.waiting) {
        _fail('اتصال به سرور بازی برقرار نشد');
      } else {
        _setConnected(false);
      }
    });
    s.onError((e) => debugPrint('game socket error: $e'));

    // CONNECTION RESILIENCE. Previously there was no disconnect handling at
    // all: if the phone changed cell tower or dropped Wi-Fi mid-match the
    // board simply froze with no explanation and no recovery.
    s.onDisconnect((_) {
      _setConnected(false);
      if (phase == GamePhase.playing) {
        connectionNotice = 'شبکه قطع شد؛ ۲۵ ثانیه برای بازگشت فرصت داری…';
      }
      _stopClock();
    });
    s.onConnect((_) {
      _setConnected(true);
      // The server reclaims the suspended seat by authenticated user id and
      // answers with game:resume. Never emit a fresh join here: that would
      // forfeit the preserved match and enter an unrelated queue.
    });
    s.on('reconnect', (_) => _setConnected(true));

    s.on('game:error', (d) => _fail(_msg(d) ?? 'خطا در بازی'));

    s.on('game:waiting', (d) {
      final m = _asMap(d);
      phase = GamePhase.waiting;
      error = null;
      botFallback = m['botFallback'] != false;
      soloAvailable = m['soloAvailable'] == true;
      stillSearching = false;
      _startSearchClock(m['deadline'], m['waitMs'], m['remainingMs']);
      notifyListeners();
    });

    // Sent only by games with no bot: the first window closed and we are
    // still queued, waiting for a real human.
    s.on('game:still-waiting', (d) {
      final m = _asMap(d);
      soloAvailable = m['soloAvailable'] == true;
      botFallback = false;
      stillSearching = true;
      searchSecondsLeft = 0;
      _stopSearchClock();
      notifyListeners();
    });

    void handleStart(dynamic d) {
      final m = _asMap(d);
      _roomId = m['roomId'] as String?;
      matchId = _roomId;
      players = m['players'] as Map?;
      mySymbol = m['yourSymbol'] as String?;
      vsBot = m['vsBot'] == true;
      matchMode = m['matchMode'] as String?;
      turn = m['turn'] as String?;
      state = _asMap(m['state']);
      stake = (m['stake'] as num?)?.toInt() ?? stake;
      totalPot = stake * 2;
      netPot = (m['netPot'] as num?)?.toInt() ?? 0;
      commission = (m['commission'] as num?)?.toInt() ?? 0;
      winner = null;
      finishReason = null;
      timedOutSymbol = null;
      stillSearching = false;
      settlementStatus = 'settled';
      _payoutTimer?.cancel();
      stakePayoutAmount = 0;
      stakePayoutWinner = null;
      stakeWinnerBalanceAfter = null;
      stakePayoutSequence = 0;
      _announcedPayoutMatchId = null;
      coinsAwarded = 0;
      coinsWinner = null;
      rematchAvailable = false;
      rematchWaiting = false;
      connectionNotice = null;
      connected = true;
      phase = GamePhase.playing;
      error = null;
      if (gameId == 'card_duel') {
        GameAudio.instance
          ..startDuelMusic()
          ..play(Sfx.duelIntro, volume: 0.82);
      } else {
        GameAudio.instance.play(Sfx.matchFound);
      }
      _stopSearchClock();
      _startClock(m['deadline'], m['turnMs'], m['remainingMs'], m['introMs'],
          m['resultHoldMs']);
      notifyListeners();
    }

    s.on('game:start', handleStart);
    s.on('game:resume', handleStart);

    s.on('game:update', (d) {
      final m = _asMap(d);
      final wasMyTurn = myTurn;
      final previousRound = (state['roundIndex'] as num?)?.toInt() ?? 0;
      state = _asMap(m['state']);
      turn = m['turn'] as String?;

      // برخوردهای ۱ تا ۴ بازخوردِ فوریِ متفاوت دارند. راند پنجم را
      // game:over با صدای نتیجهٔ نهایی پوشش می‌دهد تا دو صدا روی هم نیفتند.
      final currentRound = (state['roundIndex'] as num?)?.toInt() ?? 0;
      final totalRounds = (state['totalRounds'] as num?)?.toInt() ?? 0;
      if (gameId == 'card_duel' &&
          currentRound > previousRound &&
          currentRound < totalRounds) {
        final last =
            state['lastRound'] is Map ? state['lastRound'] as Map : const {};
        final roundWinner = '${last['winner'] ?? ''}';
        final mine = mySymbol;
        final sfx = roundWinner == 'DRAW'
            ? Sfx.duelRoundDraw
            : roundWinner == mine
                ? Sfx.duelRoundWin
                : Sfx.duelRoundLose;
        GameAudio.instance.play(sfx, volume: 0.86);
        try {
          if (roundWinner == mine) {
            HapticFeedback.heavyImpact();
          } else {
            HapticFeedback.mediumImpact();
          }
        } catch (_) {/* haptics is cosmetic */}
      }
      lastMove = (m['lastMove'] as num?)?.toInt();
      timedOutSymbol = m['timedOut'] as String?;

      if (timedOutSymbol != null) {
        GameAudio.instance.play(Sfx.timeout);
      } else if (gameId != 'card_duel' && !wasMyTurn) {
        // The move we just received came from the opponent.
        GameAudio.instance.play(moveSound, volume: 0.9);
      }
      if (gameId != 'card_duel' && !wasMyTurn && myTurn) {
        GameAudio.instance.play(Sfx.yourTurn);
      }

      _startClock(m['deadline'], m['turnMs'], m['remainingMs'], m['introMs'],
          m['resultHoldMs']);
      notifyListeners();
    });

    s.on('game:over', (d) {
      final m = _asMap(d);
      if (m['state'] != null) state = _asMap(m['state']);
      final rawWinner = m['winner'] as String?;
      finishReason = rawWinner == 'DISCONNECT' ? 'disconnect' : null;
      // در پایان با قطع اتصال، `winner` برای سازگاری قدیمی DISCONNECT است
      // ولی `resolvedWinner` صاحب واقعی برد و تسویه را می‌گوید.
      winner = (m['resolvedWinner'] ?? rawWinner) as String?;
      matchId = '${m['matchId'] ?? _roomId ?? ''}';
      settlementStatus =
          '${m['settlementStatus'] ?? (stake > 0 ? 'pending' : 'settled')}';
      rematchAvailable = m['rematchAvailable'] != false;
      rematchWaiting = false;
      connectionNotice = null;
      phase = GamePhase.over;
      _stopClock();
      if (gameId == 'card_duel') {
        unawaited(GameAudio.instance.stopDuelMusic());
        GameAudio.instance.play(
          winner == 'DRAW'
              ? Sfx.duelFinalDraw
              : (iWon ? Sfx.duelVictory : Sfx.duelDefeat),
        );
      } else {
        GameAudio.instance.play(
          winner == 'DRAW' ? Sfx.draw : (iWon ? Sfx.win : Sfx.lose),
        );
      }
      notifyListeners();
    });

    s.on('game:settlement', (d) {
      final m = _asMap(d);
      if (m['matchId'] != null &&
          matchId != null &&
          '${m['matchId']}' != matchId) {
        return;
      }
      settlementStatus = '${m['status'] ?? settlementStatus}';
      netPot = (m['netPot'] as num?)?.toInt() ?? netPot;
      // فقط وقتی سکه‌ای واقعاً داده شده state را دست می‌زنیم؛ رویدادِ
      // بدونِ سکه نباید نشانِ قبلی را پاک کند یا نشانِ صفر بسازد.
      final coins = (m['coins'] as num?)?.toInt() ?? 0;
      if (coins > 0) {
        coinsAwarded = coins;
        coinsWinner = '${m['winner'] ?? ''}';
      }
      notifyListeners();

      final payoutMatchId = '${m['matchId'] ?? matchId ?? ''}';
      final payoutWinner = '${m['winner'] ?? ''}';
      final payout = (m['netPot'] as num?)?.toInt() ?? netPot;
      final balanceAfter = (m['balanceAfter'] as num?)?.toInt();
      final shouldAnimate = gameId == 'card_duel' &&
          m['payout'] == true &&
          settlementStatus == 'settled' &&
          stake > 0 &&
          payout > 0 &&
          (payoutWinner == 'X' || payoutWinner == 'O') &&
          payoutMatchId.isNotEmpty &&
          _announcedPayoutMatchId != payoutMatchId;
      if (!shouldAnimate) return;

      _announcedPayoutMatchId = payoutMatchId;
      _payoutTimer?.cancel();
      _payoutTimer = Timer(const Duration(milliseconds: 900), () {
        if (_disposed || phase != GamePhase.over || matchId != payoutMatchId) {
          return;
        }
        stakePayoutAmount = payout;
        stakePayoutWinner = payoutWinner;
        stakeWinnerBalanceAfter = balanceAfter;
        stakePayoutSequence += 1;
        GameAudio.instance.play(Sfx.duelPoints, volume: 0.92);
        try {
          HapticFeedback.heavyImpact();
        } catch (_) {/* haptics is cosmetic */}
        notifyListeners();
      });
    });
    s.on('game:opponent_reconnecting', (d) {
      connectionNotice = _msg(d) ?? 'منتظر بازگشت حریف…';
      _stopClock();
      notifyListeners();
    });
    s.on('game:opponent_reconnected', (d) {
      connectionNotice = _msg(d) ?? 'حریف برگشت؛ مسابقه ادامه دارد.';
      notifyListeners();
      Future<void>.delayed(const Duration(seconds: 2), () {
        if (_disposed) return;
        connectionNotice = null;
        notifyListeners();
      });
    });
    s.on('game:rematch_status', (d) {
      rematchWaiting = _asMap(d)['waitingForOpponent'] == true;
      notifyListeners();
    });
    s.on('game:rematch_unavailable', (d) {
      rematchWaiting = false;
      rematchAvailable = false;
      error = _msg(d) ?? 'حریف از صفحه مسابقه خارج شد';
      notifyListeners();
    });

    // The lobby socket may have received game:start before the board widget
    // was mounted. Replaying that captured payload initializes this session
    // without creating a second socket or joining an unrelated public queue.
    if (_initialStart != null) handleStart(_initialStart);
  }

  void _startClock(dynamic deadline, dynamic turnMs, dynamic remainingMs,
      [dynamic introMs, dynamic resultHoldMs]) {
    _ticker?.cancel();
    final ms = (turnMs as num?)?.toInt();
    if (ms != null && ms > 0) turnSeconds = (ms / 1000).round();
    // ── مهلتِ خواندنِ اعلانِ راند ──
    //
    // خواستهٔ مالک: «انیمیشن مییاد رو چند ثانیه بدون اینکه تایمر بره نگه
    // دار که کاربر بتونه بخونه».
    //
    // سرور این مدت را به `deadline` اضافه کرده، ولی اگر همین‌طور بشمریم
    // کاربر عددی مثل «۲۳ ثانیه» می‌بیند که از `turnMs` بیشتر است و
    // بعد ناگهان می‌پرد. به‌جایش تا پایانِ اعلان، عدد **ثابت** روی
    // مقدارِ کاملِ نوبت می‌ماند و بعد شمارش شروع می‌شود.
    // ── مکثِ نتیجهٔ راند + اعلانِ راند ──
    //
    // گزارشِ مالک: «اون لحظه‌ای که مبارزه تو راندو میگه برای راند ها
    // سریع میاد بدون اینکه لود بشه میره».
    //
    // سرور حالا دو مهرِ زمانی می‌فرستد؛ مجموعشان مدتی است که کاربر
    // نمی‌تواند انتخاب کند و ساعت باید یخ بماند: اول نتیجهٔ راندِ قبل
    // را می‌بیند، بعد اعلانِ راندِ تازه را.
    final intro = (introMs as num?)?.toInt() ?? 0;
    final hold = (resultHoldMs as num?)?.toInt() ?? 0;
    _resultHoldMs = hold > 0 ? hold : 0;
    resultHolding = _resultHoldMs > 0;
    _introHoldMs = (intro > 0 ? intro : 0) + _resultHoldMs;

    // Use the server's REMAINING milliseconds against a local stopwatch
    // rather than `deadline - DateTime.now()`. A device with a wrong clock
    // (extremely common on Android) produced a nonsense difference that
    // clamped to the maximum, so the countdown sat frozen at 15 and never
    // moved. A stopwatch is monotonic and immune to that.
    final remaining = (remainingMs as num?)?.toInt() ??
        ((deadline as num?) != null
            ? (deadline as num).toInt() - DateTime.now().millisecondsSinceEpoch
            : null);
    if (remaining == null) {
      secondsLeft = 0;
      notifyListeners();
      return;
    }

    final total = remaining < 0 ? 0 : remaining;
    final watch = Stopwatch()..start();
    _lastTickPlayed = -1;

    void tick() {
      // در پنجرهٔ اعلان، ساعت روی مقدارِ کامل «یخ» می‌زند.
      final elapsed = watch.elapsedMilliseconds;
      if (resultHolding && elapsed >= _resultHoldMs) {
        resultHolding = false;
        if (gameId == 'card_duel' && intro > 0) {
          GameAudio.instance.play(Sfx.duelIntro, volume: 0.82);
        }
        notifyListeners();
      }
      if (_introHoldMs > 0 && elapsed < _introHoldMs) {
        introHolding = true;
        if (secondsLeft != turnSeconds) {
          secondsLeft = turnSeconds;
          _tickClock();
        }
        return;
      }
      if (introHolding) {
        introHolding = false;
        _tickClock();
        // کارت‌ها در زمان معرفی عمداً غیرفعال‌اند؛ یک rebuild در پایان
        // صحنه لازم است تا بلافاصله قابل انتخاب شوند.
        notifyListeners();
      }
      final leftMs = total - elapsed;
      final left = (leftMs / 1000).ceil();
      final clamped = left < 0 ? 0 : (left > turnSeconds ? turnSeconds : left);
      if (clamped != secondsLeft) {
        secondsLeft = clamped;
        if (myTurn &&
            clamped <= 5 &&
            clamped > 0 &&
            clamped != _lastTickPlayed) {
          _lastTickPlayed = clamped;
          GameAudio.instance
              .play(clamped <= 3 ? Sfx.tickUrgent : Sfx.tick, volume: 0.65);
        }
        // فقط ساعت، نه کل نشست — توضیح کامل بالای فیلد `clock`.
        _tickClock();
      }
      if (leftMs <= 0) _ticker?.cancel();
    }

    tick();
    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) => tick());
  }

  /// Ticks down the "looking for a real opponent" window.
  void _startSearchClock(
      dynamic deadline, dynamic waitMs, dynamic remainingMs) {
    _searchTicker?.cancel();
    final ms = (waitMs as num?)?.toInt();
    if (ms != null && ms > 0) searchSeconds = (ms / 1000).round();

    // Same monotonic approach as the turn clock — this is exactly the timer
    // that was reported stuck on 15.
    final remaining = (remainingMs as num?)?.toInt() ??
        ((deadline as num?) != null
            ? (deadline as num).toInt() - DateTime.now().millisecondsSinceEpoch
            : searchSeconds * 1000);
    final total = remaining < 0 ? 0 : remaining;
    final watch = Stopwatch()..start();

    void tick() {
      // در پنجرهٔ اعلان، ساعت روی مقدارِ کامل «یخ» می‌زند.
      final elapsed = watch.elapsedMilliseconds;
      if (_introHoldMs > 0 && elapsed < _introHoldMs) {
        introHolding = true;
        if (secondsLeft != turnSeconds) {
          secondsLeft = turnSeconds;
          _tickClock();
        }
        return;
      }
      if (introHolding) {
        introHolding = false;
        _tickClock();
      }
      final leftMs = total - elapsed;
      final left = (leftMs / 1000).ceil();
      final clamped =
          left < 0 ? 0 : (left > searchSeconds ? searchSeconds : left);
      if (clamped != searchSecondsLeft) {
        searchSecondsLeft = clamped;
        notifyListeners();
      }
      if (leftMs <= 0) _searchTicker?.cancel();
    }

    tick();
    _searchTicker =
        Timer.periodic(const Duration(milliseconds: 200), (_) => tick());
  }

  void _stopSearchClock() {
    _searchTicker?.cancel();
    _searchTicker = null;
  }

  void _stopClock() {
    _ticker?.cancel();
    _ticker = null;
    secondsLeft = 0;
    introHolding = false;
    resultHolding = false;
    _introHoldMs = 0;
    _resultHoldMs = 0;
    // بدون این، حلقهٔ شمارش روی آخرین عدد یخ می‌زد چون کسی به شنوندگانِ
    // ساعت نمی‌گفت که به صفر رسیده‌ایم.
    _tickClock();
  }

  void join({bool vsBot = false, int stake = 0}) {
    this.stake = stake;
    connect();
    error = null;
    winner = null;
    lastMove = null;
    timedOutSymbol = null;
    stillSearching = false;
    _socket
        ?.emit('game:join', {'gameId': gameId, 'vsBot': vsBot, 'stake': stake});
    phase = GamePhase.waiting;
    notifyListeners();
  }

  void joinRoom(String roomCode) {
    connect();
    error = null;
    winner = null;
    lastMove = null;
    timedOutSymbol = null;
    stillSearching = false;
    _socket?.emit('game:join_room', {'roomCode': roomCode});
    phase = GamePhase.waiting;
    notifyListeners();
  }

  void playWithBotImmediately() {
    connect();
    error = null;
    winner = null;
    lastMove = null;
    timedOutSymbol = null;
    stillSearching = false;
    _socket?.emit('game:play_bot', {'gameId': gameId});
    phase = GamePhase.waiting;
    notifyListeners();
  }

  /// Piece-placement sound, chosen per game so each board feels distinct.
  Sfx get moveSound {
    switch (gameId) {
      case 'memory':
        return Sfx.flip;
      default:
        return Sfx.move;
    }
  }

  void move(int index) {
    if (!myTurn || !connected) return;
    GameAudio.instance.play(moveSound);
    _socket?.emit('game:move', {'roomId': _roomId, 'move': index});
  }

  /// حرکت برای بازی‌های هم‌زمان (پنالتی).
  ///
  /// چرا جدا از move():
  ///
  /// ۱. حرکت اینجا یک **شیء** است (`{zone, power}`) نه یک عدد.
  /// ۲. شرط `myTurn` نباید اعمال شود. در پنالتی هر دو بازیکن در یک لحظه
  ///    انتخاب می‌کنند؛ `turn` فقط زننده را نشان می‌دهد، پس دروازه‌بان
  ///    با آن شرط هرگز نمی‌توانست شیرجه بزند.
  ///
  /// جلوگیری از انتخاب دوباره روی سرور است (isValidMove)، نه اینجا —
  /// کلاینت هیچ‌وقت منبع حقیقت نیست.
  void moveObject(Map<String, dynamic> payload) {
    if (phase != GamePhase.playing || !connected || introHolding) return;
    GameAudio.instance.play(
      gameId == 'card_duel' ? Sfx.duelLock : moveSound,
      volume: gameId == 'card_duel' ? 0.78 : 1.0,
    );
    _socket?.emit('game:move', {'roomId': _roomId, 'move': payload});
  }

  void rematch() {
    if (!rematchAvailable || matchId == null || matchId!.isEmpty) return;
    rematchWaiting = !vsBot;
    error = null;
    notifyListeners();
    _socket?.emitWithAck('game:rematch', {'roomId': matchId},
        ack: (dynamic response) {
      final m = _asMap(response);
      if (m['ok'] == false && !_disposed) {
        rematchWaiting = false;
        error = '${m['error'] ?? 'نبرد دوباره ناموفق بود'}';
        notifyListeners();
      }
    });
  }

  Future<Map<String, dynamic>> createChallenge() {
    final completer = Completer<Map<String, dynamic>>();
    final socket = _socket;
    if (socket == null || socket.connected != true) {
      completer.completeError(Exception('اتصال بازی برقرار نیست'));
      return completer.future;
    }
    final timer = Timer(const Duration(seconds: 8), () {
      if (!completer.isCompleted) {
        completer.completeError(Exception('ساخت لینک چالش طول کشید'));
      }
    });
    socket.emitWithAck('game:create_room', {'gameId': gameId},
        ack: (dynamic response) {
      if (completer.isCompleted) return;
      timer.cancel();
      final m = _asMap(response);
      if (m['ok'] == true) {
        completer.complete(m);
      } else {
        completer.completeError(
            Exception('${m['error'] ?? 'ساخت لینک چالش ناموفق بود'}'));
      }
    });
    return completer.future;
  }

  void leave() {
    // یک رویدادِ دیرهنگامِ socket می‌تواند این را بعد از dispose صدا
    // بزند؛ آن‌وقت `notifyListeners` پایین‌تر پرتاب می‌کرد.
    if (_disposed) return;
    _socket?.emit('game:leave', {'roomId': _roomId});
    phase = GamePhase.idle;
    winner = null;
    finishReason = null;
    state = const {};
    timedOutSymbol = null;
    stillSearching = false;
    rematchAvailable = false;
    rematchWaiting = false;
    connectionNotice = null;
    _stopClock();
    _stopSearchClock();
    _payoutTimer?.cancel();
    if (gameId == 'card_duel') unawaited(GameAudio.instance.stopDuelMusic());
    notifyListeners();
  }

  /// Result line shown when the game ends.
  String get resultText {
    if (finishReason == 'disconnect') {
      return iWon
          ? 'حریف بازی را ترک کرد؛ برد برای تو ثبت شد'
          : 'اتصال قطع شد؛ حریف برنده شد';
    }
    switch (winner) {
      case 'DRAW':
        return 'مساوی شد!';
      case null:
        return 'پایان بازی';
      default:
        if (mySymbol == null) return 'برنده: $winner';
        return winner == mySymbol ? 'شما بردید! ' : 'شما باختید';
    }
  }

  bool get iWon => winner != null && winner == mySymbol;

  String nameOf(String symbol) {
    final p = players?[symbol];
    if (p is Map && p['nickname'] != null) return '${p['nickname']}';
    return 'کاربر';
  }

  void _setConnected(bool v) {
    if (connected == v) return;
    connected = v;
    notifyListeners();
  }

  void _fail(String m) {
    error = m;
    phase = GamePhase.idle;
    _stopClock();
    _stopSearchClock();
    _payoutTimer?.cancel();
    if (gameId == 'card_duel') unawaited(GameAudio.instance.stopDuelMusic());
    notifyListeners();
  }

  static String? _msg(dynamic d) =>
      d is Map && d['message'] != null ? '${d['message']}' : null;

  static Map<String, dynamic> _asMap(dynamic d) =>
      d is Map ? d.map((k, v) => MapEntry('$k', v)) : <String, dynamic>{};

  @override
  void dispose() {
    // پرچم **پیش از** آزادسازی ست می‌شود: هر رویدادِ دیرهنگامی که در
    // همین لحظه برسد، باید ساکت رد شود نه اینکه روی یک شیءِ نیمه‌آزاد
    // اعلان بدهد.
    _disposed = true;
    _ticker?.cancel();
    _searchTicker?.cancel();
    _payoutTimer?.cancel();
    if (gameId == 'card_duel') unawaited(GameAudio.instance.stopDuelMusic());
    clock.dispose();
    _socket?.dispose();
    _socket = null;
    super.dispose();
  }
}
