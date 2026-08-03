// Which calendar day it is in Tehran, without a timezone database.
//
// WHY THIS FILE EXISTS AT ALL
//
// The tap game's daily cap resets at Tehran midnight. The server decides
// that authoritatively (Intl with a real tz database), but the client needs
// the same answer for two reasons:
//
//   * offline play — the cap has to hold with no network, or a player learns
//     that airplane mode removes it;
//   * the countdown — showing "come back tomorrow" without saying when is
//     worse than showing nothing.
//
// WHY NOT `package:timezone`
//
// It is 900 KB of IANA data in the bundle to answer one question about one
// zone that has had a FIXED offset since 2022, when Iran abolished DST. The
// only way this file is wrong is if Iran reinstates DST — at which point the
// client would be one hour off for the few days until an update ships, and
// the server (which does have the database) would still be right, so nothing
// breaks permanently. That trade is worth 900 KB on a phone.
//
// WHY NOT `DateTime.now()` IN LOCAL TIME
//
// The device's zone is user-controlled. Reading it would mean a fresh
// allowance is one Settings screen away. Everything below starts from UTC,
// which the user cannot usefully lie about without the server noticing.
library;

/// Iran Standard Time: UTC+03:30, fixed. Iran abolished DST in 2022.
const Duration tehranOffset = Duration(hours: 3, minutes: 30);

/// Today in Tehran as `YYYY-MM-DD`.
///
/// Matches `tehranDay()` in backend/src/services/tapGameService.js exactly,
/// which matters because the two values are compared: a client that computed
/// a different day would reset its local counter at the wrong moment and
/// show an allowance the server then refuses.
String tehranDay([DateTime? now]) {
  final t = (now ?? DateTime.now()).toUtc().add(tehranOffset);
  final m = t.month.toString().padLeft(2, '0');
  final d = t.day.toString().padLeft(2, '0');
  return '${t.year}-$m-$d';
}

/// Time remaining until the Tehran day rolls over.
///
/// Never returns zero or a negative duration: a countdown that reads
/// "۰ ساعت" for a whole second looks broken, and a negative one would make
/// any formatting arithmetic downstream produce nonsense.
Duration untilTehranMidnight([DateTime? now]) {
  final t = (now ?? DateTime.now()).toUtc().add(tehranOffset);
  final elapsed = Duration(
    hours: t.hour,
    minutes: t.minute,
    seconds: t.second,
    milliseconds: t.millisecond,
  );
  final left = const Duration(days: 1) - elapsed;
  return left <= Duration.zero ? const Duration(days: 1) : left;
}

/// A short Persian phrasing of [d] for the "unlocks in" line.
///
/// Rounds UP to the next whole unit rather than truncating: with 90 minutes
/// left, "۲ ساعت" is a promise the game keeps, while "۱ ساعت" is one it
/// breaks. Under a minute becomes "کمتر از یک دقیقه" instead of "۰ دقیقه".
String formatCountdown(Duration d) {
  if (d.inSeconds < 60) return 'کمتر از یک دقیقه';
  if (d.inMinutes < 60) return '${_fa(d.inMinutes)} دقیقه';
  final hours = (d.inMinutes / 60).ceil();
  return '${_fa(hours)} ساعت';
}

const _digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

String _fa(int n) =>
    n.toString().split('').map((c) {
      final i = int.tryParse(c);
      return i == null ? c : _digits[i];
    }).join();
