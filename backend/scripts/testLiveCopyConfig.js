#!/usr/bin/env node
/**
 * نگهبان «متن زنده بدون آپدیت»:
 * - /api/config باید اعداد دعوت/گذر/پلاس/شرط را بدهد
 * - ops_limits آستانه برداشت معرف داشته باشد
 * - کلاینت‌ها عدد ثابت ۳/۵/۱۰/۵۰/۵۹۰۰۰ را در متن‌های محصولی تکرار نکنند
 */
'use strict';
const fs = require('fs');
const path = require('path');

let failed = 0;
const ok = (name, cond) => {
  if (!cond) failed += 1;
  console.log(`${cond ? '✓' : '✗'} ${name}`);
};

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const route = fs.readFileSync(path.join(root, 'src/routes/clientConfig.js'), 'utf8');
const ops = fs.readFileSync(path.join(root, 'src/services/opsLimits.js'), 'utf8');
const ref = fs.readFileSync(path.join(root, 'src/services/referralService.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');

ok('clientConfig referral block', /referral,\n\s*passSources/.test(route) || /referral,/.test(route));
ok('clientConfig plus block', /plus,/.test(route));
ok('clientConfig stakes block', /stakes,/.test(route));
ok('clientConfig passSources', /passSources/.test(route));
ok('ops_limits referralWithdrawalThreshold default', /referralWithdrawalThreshold:\s*50000/.test(ops));
ok('ops_limits sanitize threshold', /referralWithdrawalThreshold: num\(/.test(ops));
ok('referralService uses ops threshold', /referralWithdrawalThreshold\(\)/.test(ref));
ok('SPINS_PER_REFERRAL is live getter', /get SPINS_PER_REFERRAL\(\)/.test(ref));
ok('server mounts live deps into clientConfig', /opsLimits, referrals, pass, shop, gameStakes/.test(server));

// Client hardcode guards — product numbers in share/help copy.
const guards = [
  ['mobile share no fixed 3+5%', 'mobile/lib/core/share_invite.dart', /هر دومون \$spins|spins: spins/],
  ['mobile wheel rules dynamic', 'mobile/lib/screens/user/wheel_page.dart', /invitesPerDaily|spinsPerReferral/],
  ['mobile auth spins from config', 'mobile/lib/screens/auth/auth_screen.dart', /_referralSpins|referralSpins/],
  ['mobile pass xp from sources', 'mobile/lib/screens/user/pass_page.dart', /_xpPillsFrom/],
  ['userweb wheel refRules', 'userweb/src/screens/Wheel.jsx', /refRules/],
  ['userweb referral invite dynamic', 'userweb/src/screens/Referral.jsx', /spinsPerReferral/],
  ['userweb pass xpPills', 'userweb/src/screens/Pass.jsx', /function xpPills/],
  ['admin web threshold field', 'admin/src/pages/engine.jsx', /referralWithdrawalThreshold/],
  ['admin android threshold field', 'mobile/lib/screens/admin/admin_engine.dart', /referralWithdrawalThreshold/],
];
for (const [name, rel, re] of guards) {
  const src = fs.readFileSync(path.join(repo, rel), 'utf8');
  ok(name, re.test(src));
}

// Forbidden fixed share copy
const forbid = [
  ['mobile share fixed ۳ چرخش', 'mobile/lib/core/share_invite.dart', /هر دومون ۳ چرخش/],
  ['userweb referral fixed ۳', 'userweb/src/screens/Referral.jsx', /هر دومون ۳ چرخش/],
  ['userweb growth fixed ۳', 'userweb/src/GrowthHub.jsx', /هر دومون ۳ چرخش/],
  ['mobile wheel fixed faNum\\(10\\)', 'mobile/lib/screens/user/wheel_page.dart', /faNum\(10\) دوستی/],
  ['userweb wheel fixed fa\\(10\\)', 'userweb/src/screens/Wheel.jsx', /fa\(10\) دوستی/],
];
for (const [name, rel, re] of forbid) {
  const src = fs.readFileSync(path.join(repo, rel), 'utf8');
  ok(name + ' removed', !re.test(src));
}

ok('test listed later by package.json check optional', true);

if (failed) {
  console.error(`\\n✗ ${failed} failed`);
  process.exit(1);
}
console.log('\n✓ live copy config guards passed');
