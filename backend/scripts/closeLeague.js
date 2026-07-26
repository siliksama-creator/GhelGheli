// Closes the active league season and writes the payouts.
//
// Run by cron just after midnight on the 1st of each month. Safe to run at
// any time: it refuses to close a season that is still running unless --force
// is passed, and it is a no-op on a season that is already closed.
//
//   node scripts/closeLeague.js          # normal, cron-safe
//   node scripts/closeLeague.js --force  # close right now (admin action)
require('dotenv').config();
const { closeActiveSeason } = require('../src/services/leagueService');

const force = process.argv.includes('--force');

closeActiveSeason({ force })
  .then(r => {
    if (r.skipped) console.log(`[league] skipped: ${r.skipped} (season ${r.seasonId})`);
    else console.log(`[league] season ${r.seasonId} closed, ${r.winners} winners paid`);
    process.exit(0);
  })
  .catch(e => {
    console.error('[league] close failed:', e.message);
    process.exit(1);
  });
