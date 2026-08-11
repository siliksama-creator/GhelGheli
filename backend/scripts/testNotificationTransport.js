#!/usr/bin/env node
// Regression test for an important delivery boundary: notification rows are
// durable before FCM is attempted, so a Firebase/network outage must be
// returned as delivery statistics rather than reject the whole campaign.
const assert = require('assert/strict');
const { _testing } = require('../src/services/notificationService');

(async () => {
  let calls = 0;
  _testing.setFirebaseForTests({
    messaging: () => ({
      sendEachForMulticast: async message => {
        calls += 1;
        assert(message.tokens.length <= 500, 'FCM batch is capped at 500');
        throw new Error('simulated Firebase transport outage');
      },
    }),
  });

  const tokens = Array.from({ length: 501 }, (_, i) => `token-${i}`);
  const result = await _testing.sendTokens(tokens, 'title', 'body', { n: 7 });
  assert.equal(calls, 2, '501 tokens use two multicast batches');
  assert.deepEqual(result, {
    sent: 0,
    failed: 501,
    configured: true,
    transportErrors: 2,
  });
  console.log('✓ FCM transport failure is non-fatal and all recipients are reported failed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
