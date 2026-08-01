// Housekeeping for lapsed Plus subscriptions.
//
// IMPORTANT: nothing depends on this running. The rule "a lapsed subscriber
// keeps what they bought plus their newest club" is enforced by the SQL view
// effective_club_memberships, which is evaluated on every read. If this
// script never ran, users would still see exactly the right clubs.
//
// What it does instead:
//   * deletes the dead rows, so user_clubs does not grow a tail of
//     memberships that are permanently invisible, and
//   * clears an equipped badge or club profile picture the user has lost, so
//     their own settings match what everyone else sees. Without that, a
//     lapsed subscriber keeps a stale selection stored against their row —
//     harmless, but it re-applies the moment they resubscribe, which is
//     surprising.
//
// Safe to run at any time, any number of times.
require('dotenv').config();
const clubs = require('../src/services/clubService');
const { pool } = require('../src/config/db');

(async () => {
  try {
    const removed = await clubs.reconcileLapsed();
    const cleared = await clubs.clearOrphanedCosmetics();
    console.log(`[clubs] ${removed} عضویت منقضی حذف شد، `
      + `${cleared} انتخاب ظاهری بی‌اعتبار پاک شد`);
    process.exit(0);
  } catch (e) {
    console.error('[clubs] reconcile failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
