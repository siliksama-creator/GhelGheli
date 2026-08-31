// Batched, signed reporting of tap progress to the backend.
//
// THREAT MODEL — what this does and does not buy us.
//
// Taps are never sent one at a time: that is chatty, and every single request
// is trivially replayable. Instead the engine accumulates and this class
// ships a batch every few seconds carrying (taps, elapsedMs, level, nonce)
// plus an HMAC-SHA256 over those fields.
//
// The signing key is derived from the user's own session token, NOT from a
// constant baked into the APK. A shared client secret in a Flutter app is
// extractable in minutes with `strings` on the extracted libapp.so, so it
// would be security theatre. Deriving from the token means:
//   * a forged batch requires a valid session (which the server authenticates
//     anyway),
//   * a batch captured from user A cannot be replayed against user B,
//   * a batch cannot be replayed at all, because the server tracks the nonce
//     and the monotonically increasing sequence number.
//
// The HMAC's real job is INTEGRITY + ANTI-REPLAY, not secrecy. The actual
// plausibility ruling — "are 400 taps in 5 seconds possible?" — is made
// server-side in tapGameService.js, which is the only place that can be
// trusted. This file just makes tampering require real effort rather than a
// proxy and a right-click.
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../../api_client.dart';

@immutable
class TapBatch {
  const TapBatch({
    required this.taps,
    required this.flagged,
    required this.elapsedMs,
    required this.level,
    required this.levelTaps,
    required this.sequence,
  });

  /// Taps accepted by the local guard since the last flush.
  final int taps;

  /// Taps the local guard rejected since the last flush. Reported honestly —
  /// a client that always says 0 while sending impossible rates is itself a
  /// signal the server can act on.
  final int flagged;

  /// Wall time covered by this batch, from a monotonic stopwatch.
  final int elapsedMs;

  /// Level the player is on at flush time.
  final int level;

  /// Taps banked toward the current level at flush time.
  final int levelTaps;

  /// Monotonically increasing per session; lets the server drop replays and
  /// detect dropped batches.
  final int sequence;

  Map<String, dynamic> toPayload() => {
        'taps': taps,
        'flagged': flagged,
        'elapsedMs': elapsedMs,
        'level': level,
        'levelTaps': levelTaps,
        'seq': sequence,
      };
}

class TapSyncResult {
  const TapSyncResult({
    required this.ok,
    this.serverLevel,
    this.serverLevelTaps,
    this.serverTotalTaps,
    this.levelsLeftToday,
    this.levelsPerDay,
    this.rejected = false,
    this.message,
    this.coinsEarned,
    this.coinsTotal,
    this.finished = false,
    this.coinsAwardedTotal,
    this.pointsAwardedTotal,
  });

  final bool ok;

  /// Server's authoritative view. When it disagrees with the client the
  /// engine adopts these values — the server always wins.
  final int? serverLevel;
  final int? serverLevelTaps;
  final int? serverTotalTaps;

  /// The daily level allowance as the SERVER counts it.
  ///
  /// This is the value that matters: two devices share one allowance, and
  /// only the server sees both. Null when the response predates the cap
  /// (an old server, or the offline path), in which case the engine keeps
  /// its local count rather than assuming a fresh allowance.
  final int? levelsLeftToday;
  final int? levelsPerDay;

  /// The batch was refused as implausible. The taps are burned, not retried.
  final bool rejected;

  final String? message;

  /// سکهٔ لول‌های تمام‌شده در همین بسته — سرور همان لحظه واریز کرده و
  /// این عدد را می‌فرستد تا کلاینت «+۵ سکه» را جلوی چشمِ کاربر نشان دهد.
  final int? coinsEarned;

  /// جمعِ کلِ سکهٔ کاربر بعد از این بسته.
  final int? coinsTotal;

  /// ── «بازی تمام شد» (دورِ ۳۳) ──
  ///
  /// سرور تا وقتی ادمین ریست نکند بازیکنِ تمام‌کرده را با 409 و
  /// finished=true برمی‌گرداند؛ موتور باید ورودی را قفل کند و صفحهٔ
  /// جمعِ امتیاز/سکه را نشان دهد.
  final bool finished;

  /// جمعِ سکهٔ کسب‌شدهٔ این کاربر از ضربه‌زن — برای صفحهٔ پایان.
  final int? coinsAwardedTotal;

  /// جمعِ امتیازِ کسب‌شدهٔ این کاربر از ضربه‌زن — برای صفحهٔ پایان.
  final int? pointsAwardedTotal;
}

class TapSync {
  TapSync({required this.api, this.endpoint = '/api/games/tap/progress'});

  final ApiClient api;
  final String endpoint;

  int _sequence = 0;
  final Random _random = Random.secure();

  /// Session-scoped signing key derived from the auth token.
  ///
  /// SHA-256 of the token means the raw token never travels inside the
  /// signature material, and rotating the session automatically rotates the
  /// key. The server derives the identical key from the token it just
  /// authenticated, so nothing needs to be transmitted or stored.
  List<int>? _signingKey() {
    final token = api.token;
    if (token == null || token.isEmpty) return null;
    return sha256.convert(utf8.encode(token)).bytes;
  }

  String _nonce() {
    final bytes = List<int>.generate(12, (_) => _random.nextInt(256));
    return base64Url.encode(bytes);
  }

  /// Canonical string that both sides sign. Field ORDER is part of the
  /// contract — never reorder without changing the server in the same commit.
  static String canonical(Map<String, dynamic> payload, String nonce) {
    return [
      payload['taps'],
      payload['flagged'],
      payload['elapsedMs'],
      payload['level'],
      payload['levelTaps'],
      payload['seq'],
      nonce,
    ].join('|');
  }

  int nextSequence() => ++_sequence;

  /// Reads the server's view without sending anything.
  ///
  /// BUG THIS FIXES. The engine's `init()` called `_flush(force: true)` and
  /// its comment claimed that reconciled with the server. It did not: `_flush`
  /// returns immediately when the batch is empty — `force` only bypasses the
  /// *first* of the two empty-batch guards — and on entry the batch is always
  /// empty. So the app NEVER adopted server state on open; it only ever
  /// learned about it as a side effect of the first batch it happened to
  /// send, minutes later. The web client has always done a real GET here,
  /// which is why the two disagreed after playing on both.
  ///
  /// It matters more now: the daily level allowance is shared across devices,
  /// so a player who spent it in the browser would otherwise gain levels in
  /// the app and watch them be taken back on the first sync.
  Future<TapSyncResult?> fetch() async {
    if (api.token == null || api.token!.isEmpty) return null;
    try {
      final res = await api.get(endpoint);
      if (res is! Map) return null;
      final map = Map<String, dynamic>.from(res);
      return TapSyncResult(
        ok: true,
        serverLevel: _asInt(map['level']),
        serverLevelTaps: _asInt(map['levelTaps']),
        serverTotalTaps: _asInt(map['totalTaps']),
        levelsLeftToday: _asInt(map['levelsLeftToday']),
        levelsPerDay: _asInt(map['levelsPerDay']),
        finished: map['finished'] == true,
        coinsAwardedTotal: _asInt(map['coinsAwarded']),
        pointsAwardedTotal: _asInt(map['pointsAwarded']),
      );
    } catch (e) {
      // Offline: play on with local state. Never throws.
      debugPrint('tap fetch failed: $e');
      return null;
    }
  }

  /// Sends one batch. Returns null when there is nothing to do or the user is
  /// not authenticated; never throws.
  Future<TapSyncResult?> flush(TapBatch batch) async {
    if (batch.taps <= 0 && batch.flagged <= 0) return null;

    final key = _signingKey();
    if (key == null) {
      // Not logged in: progress stays local. The engine keeps the taps in
      // `pendingTaps` so a later login can still bank them.
      return const TapSyncResult(ok: false, message: 'unauthenticated');
    }

    final payload = batch.toPayload();
    final nonce = _nonce();
    final signature =
        Hmac(sha256, key).convert(utf8.encode(canonical(payload, nonce)));

    try {
      final res = await api.post(endpoint, {
        ...payload,
        'nonce': nonce,
        'sig': signature.toString(),
      });

      if (res is! Map) return const TapSyncResult(ok: true);
      final map = Map<String, dynamic>.from(res);
      return TapSyncResult(
        ok: map['ok'] != false,
        serverLevel: _asInt(map['level']),
        serverLevelTaps: _asInt(map['levelTaps']),
        serverTotalTaps: _asInt(map['totalTaps']),
        levelsLeftToday: _asInt(map['levelsLeftToday']),
        levelsPerDay: _asInt(map['levelsPerDay']),
        rejected: map['rejected'] == true,
        message: map['message']?.toString(),
        coinsEarned: _asInt(map['coinsEarned']),
        coinsTotal: _asInt(map['coinsTotal']),
        finished: map['finished'] == true,
        coinsAwardedTotal: _asInt(map['coinsAwarded']),
        pointsAwardedTotal: _asInt(map['pointsAwarded']),
      );
    } catch (e) {
      // ── بازیِ تمام‌شده (دورِ ۳۳) ──
      // سرور بازیکنِ تمام‌کرده را با 409 و پرچمِ finished در بدنهٔ خطا
      // برمی‌گرداند. این «خطا» نیست — وضعیتِ منبع است؛ باید مثل یک
      // پاسخِ موفقِ «بازی تمام شد» تفسیر شود، وگرنه موتور بسته را برای
      // همیشه retry می‌کند.
      final status = _statusOf(e);
      if (status == 409) {
        final body = _bodyOf(e);
        if (body is Map && body['finished'] == true) {
          return TapSyncResult(
            ok: false,
            finished: true,
            message: body['message']?.toString(),
            coinsAwardedTotal: _asInt(body['coinsAwardedTotal']),
          );
        }
      }
      // Offline or server hiccup: the engine retains the taps and retries on
      // the next flush. Losing a batch must never lose the player's progress.
      debugPrint('tap sync failed: $e');
      return const TapSyncResult(ok: false, message: 'network');
    }
  }

  static int? _asInt(Object? v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  /// کدِ وضعیتِ HTTP از دلِ خطای Dio.
  static int? _statusOf(Object e) => e is DioException ? e.response?.statusCode : null;

  /// بدنهٔ JSON پاسخِ خطا (مثلاً {finished:true, message:...}).
  static Object? _bodyOf(Object e) => e is DioException ? e.response?.data : null;
}
