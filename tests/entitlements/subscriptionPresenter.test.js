// tests/entitlements/subscriptionPresenter.test.js
// Wave B2C — Subscription Visibility presenter unit tests.
//
// Plain Node, zero dependencies:  node tests/entitlements/subscriptionPresenter.test.js
// (or: npm run test:presenter)
//
// Verifies the pure presentation matrix: every effective status maps to the
// approved copy (or to null = present nothing), days math is days-only, and
// every restricted state carries the historical-access reassurance.

'use strict';

global.window = global;
require('../../src/auth/subscriptionPresenter.js');
var SP = global.denaiSubPresenter;

var failures = [];
var count = 0;
function assert(cond, msg) {
  count++;
  if (!cond) { failures.push(msg); console.error('  FAIL: ' + msg); }
}

var NOW      = Date.parse('2026-06-10T12:00:00Z');
var IN_12D   = '2026-06-22T12:00:00Z';
var IN_4H    = '2026-06-10T16:00:00Z';
var PAST     = '2026-06-01T00:00:00Z';

// ═══ Group 1 — daysLeft (pure) ════════════════════════════════════════════
console.log('Group 1 — daysLeft');

assert(SP.daysLeft(IN_12D, NOW) === 12, '12 days out → 12');
assert(SP.daysLeft(IN_4H, NOW) === 1,   '4 hours out rounds up to 1 day');
assert(SP.daysLeft(PAST, NOW) === 0,    'past date clamps to 0');
assert(SP.daysLeft(null, NOW) === null, 'null timestamp → null');
assert(SP.daysLeft('garbage', NOW) === null, 'unparseable timestamp → null');

// ═══ Group 2 — trialing presentation ══════════════════════════════════════
console.log('Group 2 — trialing');

var t = SP.describe('trialing', IN_12D, NOW, true);
assert(t !== null && t.tone === 'info', 'trialing → info tone');
assert(t.sidebar === 'Trial — 12 days left', 'trialing sidebar shows whole days');
assert(t.title === 'Trial period', 'trialing title');
assert(t.detail.indexOf('Your trial ends ') === 0, 'trialing detail starts with end date sentence');
assert(t.detail.indexOf('available until then') !== -1, 'trialing detail affirms availability');

var t1 = SP.describe('trialing', IN_4H, NOW, true);
assert(t1.sidebar === 'Trial — 1 day left', 'singular form for 1 day');

var tBad = SP.describe('trialing', 'garbage', NOW, true);
assert(tBad.sidebar === 'Trial active' && tBad.detail === 'All features are available.',
  'unreadable trial end → calm fallback, no date math');

// ═══ Group 3 — non-trial statuses ═════════════════════════════════════════
console.log('Group 3 — status matrix');

var a = SP.describe('active', null, NOW, false);
assert(a.sidebar === 'Active subscription' && a.title === 'Active subscription' && a.detail === '',
  'active → "Active subscription", nothing more');
assert(a.tone === 'ok', 'active → ok tone');

var pd = SP.describe('past_due', null, NOW, false);
assert(pd.tone === 'warn', 'past_due → warn tone');
assert(pd.detail.indexOf('remains fully active') !== -1, 'past_due affirms service continues');
assert(pd.sidebar === 'Active — payment needs attention', 'past_due sidebar informs without alarm');

var ex = SP.describe('expired', null, NOW, true);
assert(ex.tone === 'restricted' && ex.title === 'Trial ended', 'expired → "Trial ended"');
assert(ex.detail.indexOf('remain fully available') !== -1, 'expired carries historical-access note');
assert(ex.detail.indexOf('paused') !== -1, 'expired explains creation pause');

var ca = SP.describe('canceled', null, NOW, true);
assert(ca.title === 'Subscription ended', 'canceled → "Subscription ended"');
assert(ca.detail.indexOf('remain fully available') !== -1, 'canceled carries historical-access note');

assert(SP.describe('none', null, NOW, true) === null,
  'none during founding phase → present NOTHING');
var no = SP.describe('none', null, NOW, false);
assert(no !== null && no.title === 'No active subscription',
  'none after founding phase → restricted card');

assert(SP.describe('unknown', null, NOW, false) === null,
  'unknown → present NOTHING (never alarm on unresolved state)');

var up = SP.describe('unpaid', null, NOW, true);
assert(up !== null && up.tone === 'restricted' && up.detail.indexOf('remain fully available') !== -1,
  'unrecognized confirmed status → generic restricted card with historical note');

// ═══ Group 4 — copy principles (all statuses) ═════════════════════════════
console.log('Group 4 — copy principles');

var statuses = ['trialing', 'active', 'past_due', 'expired', 'canceled', 'none', 'unknown', 'unpaid'];
statuses.forEach(function (s) {
  var d = SP.describe(s, IN_12D, NOW, false);
  if (!d) return;
  var all = (d.sidebar + ' ' + d.title + ' ' + d.detail).toLowerCase();
  assert(all.indexOf('hour') === -1 && all.indexOf('minute') === -1,
    s + ': days only — no hours/minutes');
  assert(all.indexOf('stripe') === -1 && all.indexOf('billing provider') === -1,
    s + ': no billing-provider terminology');
  assert(all.indexOf('upgrade now') === -1 && all.indexOf('act now') === -1 && all.indexOf('!') === -1,
    s + ': no urgency tactics');
});

// Every restricted presentation must carry the historical-access reassurance.
['expired', 'canceled', 'unpaid'].forEach(function (s) {
  var d = SP.describe(s, null, NOW, true);
  assert(d.detail.indexOf('patients, plans, reports, and records remain fully available') !== -1,
    s + ': historical-access principle stated verbatim');
});

// ═══ Group 5 — live wrappers ══════════════════════════════════════════════
console.log('Group 5 — live wrappers');

assert(typeof global.denaiAccessPolicy === 'undefined', 'precondition: no accessPolicy');
assert(SP.current() === null, 'no accessPolicy → current() null (fail-quiet)');
assert(SP.sidebarLine() === null, 'no accessPolicy → sidebarLine() null');

global.denaiAccessPolicy = {
  getEffectiveSubscriptionStatus: function () { return 'trialing'; },
  isFoundingPhase: function () { return true; },
};
global.denaiEntitlements = {
  getTrialEndsAt: function () { return IN_12D; },
};
var live = SP.current();
assert(live !== null && live.key === 'trialing' && /days left/.test(live.sidebar),
  'stubbed trialing → live trial presentation');

global.denaiAccessPolicy.getEffectiveSubscriptionStatus = function () { throw new Error('boom'); };
assert(SP.current() === null, 'throwing accessPolicy → null (exception-safe)');

assert(Object.isFrozen(SP), 'public API object is frozen');

// ═══ Summary ══════════════════════════════════════════════════════════════
console.log('');
if (failures.length === 0) {
  console.log('PASS — ' + count + ' assertions, 0 failures');
  process.exit(0);
} else {
  console.error('FAIL — ' + count + ' assertions, ' + failures.length + ' failures');
  process.exit(1);
}
