// Haptic feedback, mirroring Android.
//
// PARITY CONTRACT: Android calls Flutter's `HapticFeedback` at 19 points
// across the games, the wheel and the card widgets. The web build had
// `navigator.vibrate` at exactly three of them (inside Card Duel) and nothing
// anywhere else, so the same goal in Penalty, the same tap in Memory and the
// same wheel win felt inert on the web while they thumped on Android. That
// was the single largest *felt* difference between the two clients.
//
// Flutter's four impact levels are platform-tuned patterns, not durations.
// These are the closest equivalents using the one primitive the web gives us
// (`navigator.vibrate`), chosen so the RANK ORDER a player feels is the same:
// a selection click is a blip, a heavy impact is unmistakable.
//
//   selectionClick →  12 ms   a discrete choice registered (tile, card, tap)
//   lightImpact    →  18 ms   something small started (the kick leaves)
//   mediumImpact   →  28 ms   a real but non-final event (save, level up)
//   heavyImpact    →  45 ms   a decisive outcome (goal, win, payout)
//
// Every call is wrapped and best-effort. Vibration is unsupported on iOS
// Safari and on desktop, and is silently ignored when the page lacks a user
// gesture or the user has disabled it — none of which may ever interrupt
// gameplay, exactly as the Android side treats it ("haptics is cosmetic").

const buzz = (pattern) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* cosmetic: never let feedback break the game */
  }
};

/** A discrete choice registered — Android `HapticFeedback.selectionClick()`. */
export const selectionClick = () => buzz(12);

/** Something small began — Android `HapticFeedback.lightImpact()`. */
export const lightImpact = () => buzz(18);

/** A real but non-final event — Android `HapticFeedback.mediumImpact()`. */
export const mediumImpact = () => buzz(28);

/** A decisive outcome — Android `HapticFeedback.heavyImpact()`. */
export const heavyImpact = () => buzz(45);

/// The four-pulse victory celebration from `game_scaffold.dart`, where
/// Android fires `heavyImpact` at 0/150/300/450 ms. A single vibrate pattern
/// expresses the same rhythm without four timers, and unlike the Android
/// version it cannot keep firing after the widget is gone.
export const victoryFanfare = () => buzz([45, 105, 45, 105, 45, 105, 45]);

export default {
  selectionClick, lightImpact, mediumImpact, heavyImpact, victoryFanfare,
};
