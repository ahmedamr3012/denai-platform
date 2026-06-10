// tests/entitlements/accessPolicy.test.js
// Wave B2A — Entitlement Decision Engine unit tests.
//
// Plain Node, zero dependencies:  node tests/entitlements/accessPolicy.test.js
// (or: npm run test:policy)
//
// The module is a browser IIFE attaching to window — simulate that, then load.
// denaiEntitlements is deliberately NOT defined at load: the live-wrapper
// group asserts fail-open behavior first, then installs stubs.

'use strict';

global.window = global;
require('../../src/auth/accessPolicy.js');
var P = global.denaiAccessPolicy;

var failures = [];
var count = 0;
function assert(cond, msg) {
  count++;
  if (!cond) { failures.push(msg); console.error('  FAIL: ' + msg); }
}

var NOW    = Date.parse('2026-06-10T12:00:00Z');
var PAST   = '2026-06-01T00:00:00Z';   // before NOW
var FUTURE = '2026-07-01T00:00:00Z';   // after NOW

// ═══ Group 1 — deriveEffectiveStatus (pure) ═══════════════════════════════
console.log('Group 1 — deriveEffectiveStatus');

assert(P.deriveEffectiveStatus('trialing', FUTURE, NOW) === 'trialing',
  'trialing with future end stays trialing');
assert(P.deriveEffectiveStatus('trialing', PAST, NOW) === 'expired',
  'trialing with past end derives to expired');
assert(P.deriveEffectiveStatus('trialing', null, NOW) === 'trialing',
  'trialing with null end cannot be confirmed expired — stays trialing');
assert(P.deriveEffectiveStatus('trialing', 'not-a-date', NOW) === 'trialing',
  'trialing with unparseable end stays trialing (fail-open)');
assert(P.deriveEffectiveStatus('trialing', PAST, Date.parse(PAST)) === 'trialing',
  'trial ending exactly now is not yet expired (strict <)');
assert(P.deriveEffectiveStatus('active', PAST, NOW) === 'active',
  'past trial end never affects non-trialing status (active)');
assert(P.deriveEffectiveStatus('canceled', PAST, NOW) === 'canceled',
  'canceled passes through unchanged');
assert(P.deriveEffectiveStatus('none', null, NOW) === 'none',
  'none passes through unchanged');
assert(P.deriveEffectiveStatus(null, null, NOW) === 'unknown',
  'null status resolves to unknown');
assert(P.deriveEffectiveStatus('', null, NOW) === 'unknown',
  'empty-string status resolves to unknown');

// ═══ Group 2 — deriveEntitled (pure) ══════════════════════════════════════
console.log('Group 2 — deriveEntitled');

assert(P.deriveEntitled('active', true)   === true,  'active entitled (founding on)');
assert(P.deriveEntitled('active', false)  === true,  'active entitled (founding off)');
assert(P.deriveEntitled('trialing', false) === true, 'trialing entitled regardless of founding');
assert(P.deriveEntitled('past_due', false) === true, 'past_due entitled — Stripe dunning grace');
assert(P.deriveEntitled('unknown', false)  === true, 'unknown entitled — fail-open');
assert(P.deriveEntitled('none', true)   === true,  'none entitled while founding phase on');
assert(P.deriveEntitled('none', false)  === false, 'none blocked once founding phase ends');
assert(P.deriveEntitled('expired', true)  === false, 'expired blocked even during founding phase');
assert(P.deriveEntitled('canceled', true) === false, 'canceled blocked even during founding phase');
assert(P.deriveEntitled('incomplete', true) === false, 'incomplete blocked');
assert(P.deriveEntitled('unpaid', true) === false, 'unrecognized Stripe status (unpaid) blocked');
assert(P.deriveEntitled('paused', true) === false, 'unrecognized Stripe status (paused) blocked');
assert(P.deriveEntitled('incomplete_expired', true) === false, 'incomplete_expired blocked');

// ═══ Group 3 — live wrappers without denaiEntitlements (fail-open) ════════
console.log('Group 3 — live wrappers, entitlements absent');

assert(typeof global.denaiEntitlements === 'undefined',
  'precondition: denaiEntitlements not defined');
assert(P.getEffectiveSubscriptionStatus() === 'unknown',
  'no entitlements module → effective status unknown');
assert(P.isEntitledClinic() === true,  'no entitlements module → entitled (fail-open)');
assert(P.canCreatePatient()  === true, 'no entitlements module → canCreatePatient true');
assert(P.canCreatePlan()     === true, 'no entitlements module → canCreatePlan true');
assert(P.canAccessHistoricalData() === true, 'historical access always true');

// ═══ Group 4 — live wrappers with stubbed denaiEntitlements ═══════════════
console.log('Group 4 — live wrappers, stubbed entitlements');

function stub(status, trialEndsAt) {
  global.denaiEntitlements = {
    getStatus:      function () { return status; },
    getTrialEndsAt: function () { return trialEndsAt; },
  };
}

stub('trialing', PAST);
assert(P.getEffectiveSubscriptionStatus() === 'expired',
  'stub trialing+past → effective expired (client-side expiry, no pg_cron)');
assert(P.isEntitledClinic() === false, 'expired trial → not entitled');
assert(P.canCreatePatient()  === false, 'expired trial → canCreatePatient false');
assert(P.canCreatePlan()     === false, 'expired trial → canCreatePlan false');
assert(P.canAccessHistoricalData() === true, 'expired trial → historical access STILL true');

stub('trialing', FUTURE);
assert(P.isEntitledClinic() === true, 'live trial → entitled');

stub('none', null);
assert(P.isEntitledClinic() === P.isFoundingPhase(),
  'none entitlement tracks the founding-phase flag exactly');

stub('past_due', null);
assert(P.isEntitledClinic() === true, 'past_due → entitled (dunning grace)');

stub('canceled', null);
assert(P.isEntitledClinic() === false, 'canceled → not entitled');
assert(P.canAccessHistoricalData() === true, 'canceled → historical access STILL true');

global.denaiEntitlements = {
  getStatus:      function () { throw new Error('boom'); },
  getTrialEndsAt: function () { throw new Error('boom'); },
};
assert(P.getEffectiveSubscriptionStatus() === 'unknown',
  'throwing entitlements → unknown (exception-safe)');
assert(P.isEntitledClinic() === true, 'throwing entitlements → entitled (fail-open)');

// ═══ Group 5 — API surface ════════════════════════════════════════════════
console.log('Group 5 — API surface');

assert(Object.isFrozen(P), 'public API object is frozen');
assert(typeof P.isFoundingPhase() === 'boolean', 'isFoundingPhase returns a boolean');

// ═══ Summary ══════════════════════════════════════════════════════════════
console.log('');
if (failures.length === 0) {
  console.log('PASS — ' + count + ' assertions, 0 failures');
  process.exit(0);
} else {
  console.error('FAIL — ' + count + ' assertions, ' + failures.length + ' failures');
  process.exit(1);
}
