// src/auth/accessPolicy.js
// Wave B2A — Entitlement Decision Engine
//
// The single authoritative place where subscription state becomes an access
// decision. Future enforcement (B2B) and UI (B2C) consume these predicates;
// no workflow may implement entitlement logic directly.
//
// THIS MODULE DECIDES — IT DOES NOT ENFORCE. Nothing here touches the DOM,
// blocks a workflow, or changes product behavior. B2B wires the predicates
// into the creation funnels.
//
// INPUTS: denaiEntitlements.getStatus() and .getTrialEndsAt() — both already
// resolve live state → localStorage cache → 'unknown', so every decision here
// works identically online, offline, and from cache. This module holds no
// state of its own and performs no I/O.
//
// SAFETY INVARIANTS (mirror entitlements.js philosophy):
//   - 'unknown' (state not yet resolved, offline with no cache) → ENTITLED.
//     Clinicians never hit a wall because a billing query hasn't settled.
//   - Historical data access is ALWAYS allowed — viewing, exporting,
//     delivery/reopen workflows, and clinical editing are never gated.
//     canAccessHistoricalData() exists so future code asks the policy layer
//     instead of assuming.
//   - Only NEW WORK CREATION (new patient, new plan commitment) is ever
//     restricted, and only on a CONFIRMED non-entitled status.
//
// CLIENT-SIDE TRIAL EXPIRY: a 'trialing' status whose trial_ends_at is in the
// past derives to 'expired' here, on the device. Server-side expiry (pg_cron →
// 'canceled') remains authoritative when it runs, but the client no longer
// depends on it. Works offline because trialEndsAt is cached.
//
// UNRECOGNIZED STATUSES: the Stripe webhook writes subscription status strings
// verbatim, so values outside our vocabulary ('unpaid', 'paused',
// 'incomplete_expired', …) can appear. These are CONFIRMED terminal billing
// states — not missing data — and are treated as not entitled. Fail-open
// applies only to 'unknown' (no confirmed state at all).

window.denaiAccessPolicy = (function () {

  // ── FOUNDING PHASE POLICY FLAG ────────────────────────────────────────────
  // While true, clinics with NO subscription row (status 'none') are fully
  // entitled. Every clinic existing before trial provisioning is 'none' —
  // this flag is what keeps them working. Ending the founding phase is this
  // one-line change; no other code anywhere encodes the special case.
  var FOUNDING_PHASE_ENABLED = true;

  // ── Pure derivation core ──────────────────────────────────────────────────
  // No state, no clock, no globals — deterministic and directly testable.

  // Derives the effective status from a raw status + trial end timestamp.
  // The only derivation rule: an overdue trial is 'expired' regardless of
  // what the DB row still says.
  /**
   * @param {string|null} status       raw status from entitlements resolution
   * @param {string|null} trialEndsAt  ISO 8601 trial end, or null
   * @param {number} nowMs             current time in epoch ms
   * @returns {EffectiveSubscriptionStatus}
   */
  function deriveEffectiveStatus(status, trialEndsAt, nowMs) {
    if (typeof status !== 'string' || status === '') return 'unknown';
    if (status === 'trialing' && typeof trialEndsAt === 'string') {
      var ends = Date.parse(trialEndsAt);
      // Unparseable timestamp → cannot confirm expiry → trial stands (fail-open).
      if (!isNaN(ends) && ends < nowMs) return 'expired';
    }
    return status;
  }

  // Maps an effective status to the entitlement decision.
  /**
   * @param {string} effectiveStatus
   * @param {boolean} foundingPhase
   * @returns {boolean}
   */
  function deriveEntitled(effectiveStatus, foundingPhase) {
    switch (effectiveStatus) {
      case 'active':
      case 'trialing':
        return true;
      case 'past_due':
        // Denai policy: Stripe dunning grace. A failed card must not interrupt
        // a clinic mid-day. Classified as active-with-warning; warning UI is
        // B2C/B2D scope — the decision here is allow.
        return true;
      case 'unknown':
        return true;   // fail-open — never block on unresolved state
      case 'none':
        return !!foundingPhase;
      default:
        // 'expired', 'canceled', 'incomplete', and any unrecognized Stripe
        // terminal state — confirmed non-entitled.
        return false;
    }
  }

  // ── Live-state readers (call-time, exception-safe) ───────────────────────

  function _rawStatus() {
    try {
      if (typeof denaiEntitlements !== 'undefined') return denaiEntitlements.getStatus();
    } catch (e) {}
    return 'unknown';
  }

  function _trialEndsAt() {
    try {
      if (typeof denaiEntitlements !== 'undefined') return denaiEntitlements.getTrialEndsAt();
    } catch (e) {}
    return null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // Resolved status with client-side trial expiry applied.
  // Adds one value to the entitlements vocabulary: 'expired'
  // (trialing whose trial_ends_at has passed — derived, never stored).
  /** @returns {EffectiveSubscriptionStatus} */
  function getEffectiveSubscriptionStatus() {
    return deriveEffectiveStatus(_rawStatus(), _trialEndsAt(), Date.now());
  }

  // True when the clinic may create new work (new patients, new plans).
  /** @returns {boolean} */
  function isEntitledClinic() {
    return deriveEntitled(getEffectiveSubscriptionStatus(), FOUNDING_PHASE_ENABLED);
  }

  // B2B gate for the new-patient funnel (confirmNewPatient and its entry points).
  /** @returns {boolean} */
  function canCreatePatient() { return isEntitledClinic(); }

  // B2B gate for plan-commitment moments (approvePlan, sendToLab).
  // Completion/reversal transitions (markLabReceived, markDelivered, reopen*)
  // are historical-work continuations and must consult canAccessHistoricalData.
  /** @returns {boolean} */
  function canCreatePlan() { return isEntitledClinic(); }

  // Always true, by policy — historical clinical access is never gated.
  // Exists so the invariant lives in code, not in assumptions: any future
  // surface touching existing patients/plans/reports/exports asks this.
  /** @returns {boolean} */
  function canAccessHistoricalData() { return true; }

  // Exposed for future operational/UI awareness (e.g. founding-clinic copy).
  /** @returns {boolean} */
  function isFoundingPhase() { return FOUNDING_PHASE_ENABLED; }

  return Object.freeze({
    getEffectiveSubscriptionStatus: getEffectiveSubscriptionStatus,
    isEntitledClinic:               isEntitledClinic,
    canCreatePatient:               canCreatePatient,
    canCreatePlan:                  canCreatePlan,
    canAccessHistoricalData:        canAccessHistoricalData,
    isFoundingPhase:                isFoundingPhase,
    // Pure core — exported for deterministic tests (no state, no clock).
    deriveEffectiveStatus:          deriveEffectiveStatus,
    deriveEntitled:                 deriveEntitled,
  });

})();
