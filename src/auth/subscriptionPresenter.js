// src/auth/subscriptionPresenter.js
// Wave B2C — Subscription Visibility & Trust Layer
//
// Pure presentation: maps an EFFECTIVE subscription status to user-facing
// copy. No policy decisions are made here — status comes exclusively from
// denaiAccessPolicy.getEffectiveSubscriptionStatus(), and gating remains the
// job of the B2B guards. This module only answers "what should the user read".
//
// COPY PRINCIPLES (Denai trust layer):
//   - Operational and clinical in tone. No sales language, no urgency
//     tactics, no countdown anxiety (days only — never hours/minutes).
//   - Restricted states always affirm what REMAINS available: existing
//     patients, plans, reports, and records are never locked.
//   - Unresolved state ('unknown') presents NOTHING — never alarm a user
//     over a billing query that hasn't settled.
//   - 'none' during the founding phase presents NOTHING — founding clinics
//     are fully entitled and should not see subscription chrome.
//
// SHAPE: describe() returns null (present nothing) or:
//   { key, tone, sidebar, title, detail }
//   tone: 'ok' | 'info' | 'warn' | 'restricted'  (drives the status dot only)

window.denaiSubPresenter = (function () {

  var DAY_MS = 86400000;

  // Shared restricted-state reassurance — the core Denai principle, verbatim
  // in every restricted presentation.
  var HISTORICAL_NOTE = 'All existing patients, plans, reports, and records remain fully available, including export.';

  // ── Pure helpers ──────────────────────────────────────────────────────────

  // Whole days remaining, rounding up (a trial with 4 hours left is "1 day").
  // Returns null when the timestamp is missing or unparseable.
  function daysLeft(trialEndsAt, nowMs) {
    if (typeof trialEndsAt !== 'string') return null;
    var ends = Date.parse(trialEndsAt);
    if (isNaN(ends)) return null;
    var d = Math.ceil((ends - nowMs) / DAY_MS);
    return d < 0 ? 0 : d;
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return null; }
  }

  // ── Pure presentation matrix ──────────────────────────────────────────────
  /**
   * @param {string} effectiveStatus  from denaiAccessPolicy.getEffectiveSubscriptionStatus()
   * @param {string|null} trialEndsAt ISO 8601, only meaningful for 'trialing'
   * @param {number} nowMs            epoch ms
   * @param {boolean} foundingPhase   from denaiAccessPolicy.isFoundingPhase()
   * @returns {{key:string,tone:string,sidebar:string,title:string,detail:string}|null}
   */
  function describe(effectiveStatus, trialEndsAt, nowMs, foundingPhase) {
    switch (effectiveStatus) {

      case 'trialing': {
        var d    = daysLeft(trialEndsAt, nowMs);
        var date = fmtDate(trialEndsAt);
        if (d === null || date === null) {
          // Trial confirmed but end date unreadable — present calmly, no math.
          return { key: 'trialing', tone: 'info', sidebar: 'Trial active',
                   title: 'Trial period', detail: 'All features are available.' };
        }
        var left = (d === 1) ? '1 day left' : d + ' days left';
        return {
          key: 'trialing', tone: 'info',
          sidebar: 'Trial — ' + left,
          title:   'Trial period',
          detail:  'Your trial ends ' + date + '. All features are available until then.',
        };
      }

      case 'active':
        return { key: 'active', tone: 'ok', sidebar: 'Active subscription',
                 title: 'Active subscription', detail: '' };

      case 'past_due':
        // Inform, never threaten: service continues, payment needs a look.
        return {
          key: 'past_due', tone: 'warn',
          sidebar: 'Active — payment needs attention',
          title:   'Payment needs attention',
          detail:  'Your service remains fully active. The most recent payment could not be completed — please review your payment method when convenient.',
        };

      case 'expired':
        return {
          key: 'expired', tone: 'restricted',
          sidebar: 'Trial ended — viewing mode',
          title:   'Trial ended',
          detail:  'Creating new patients and plans is paused. ' + HISTORICAL_NOTE,
        };

      case 'canceled':
        return {
          key: 'canceled', tone: 'restricted',
          sidebar: 'Subscription ended — viewing mode',
          title:   'Subscription ended',
          detail:  'Creating new patients and plans is paused. ' + HISTORICAL_NOTE,
        };

      case 'none':
        if (foundingPhase) return null;  // founding clinics see no subscription chrome
        return {
          key: 'none', tone: 'restricted',
          sidebar: 'No subscription — viewing mode',
          title:   'No active subscription',
          detail:  'Creating new patients and plans is paused. ' + HISTORICAL_NOTE,
        };

      case 'unknown':
        return null;  // unresolved — present nothing, never alarm

      default:
        // Unrecognized confirmed statuses ('incomplete', 'unpaid', 'paused', …)
        // are restricted by policy; present the generic restricted card.
        return {
          key: 'restricted', tone: 'restricted',
          sidebar: 'No active subscription — viewing mode',
          title:   'No active subscription',
          detail:  'Creating new patients and plans is paused. ' + HISTORICAL_NOTE,
        };
    }
  }

  // ── Live wrappers (call-time, exception-safe, fail-quiet) ────────────────

  function current() {
    try {
      if (typeof denaiAccessPolicy === 'undefined') return null;
      var status   = denaiAccessPolicy.getEffectiveSubscriptionStatus();
      var founding = denaiAccessPolicy.isFoundingPhase();
      var ends     = null;
      if (typeof denaiEntitlements !== 'undefined') ends = denaiEntitlements.getTrialEndsAt();
      return describe(status, ends, Date.now(), founding);
    } catch (e) { return null; }
  }

  // Short line for the sidebar user footer; null = keep the default line.
  function sidebarLine() {
    var d = current();
    return d ? d.sidebar : null;
  }

  return Object.freeze({
    describe:    describe,   // pure — exported for deterministic tests
    daysLeft:    daysLeft,   // pure — exported for deterministic tests
    current:     current,
    sidebarLine: sidebarLine,
  });

})();
