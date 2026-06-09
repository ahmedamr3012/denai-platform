// src/auth/entitlements.js
// Phase 13 — Feature Gating
// Phase 14 — Trial infrastructure: trial_ends_at propagation (P1.1 Wave A)
//
// Lightweight entitlement helper. Exposes canUse(featureKey) for plan-aware
// feature access checks. Backed by subscription state loaded by clinicSession.
//
// SAFETY INVARIANT: canUse() returns true (allow) when subscription state is
// unavailable (offline, unloaded, or stale). Hard-blocking on unknown
// entitlement state violates clinical continuity — clinicians must never hit a
// workflow wall due to a billing query that hasn't resolved yet.
//
// CACHE: Subscription state is written to localStorage after each successful DB
// load. Offline and sign-out scenarios fall back to the cache, enabling graceful
// degradation without a live DB connection.
//
// GATING TARGETS: Future premium capabilities only. Core clinical workflow,
// patient access, and exports are never in FEATURE_TIERS — canUse() returns
// true for them unconditionally.
//
// ADDING A NEW GATED FEATURE: add the featureKey → 'pro' entry to FEATURE_TIERS.
// The canUse() call site in the UI should show/hide the feature; it must never
// block saving, exporting, or accessing existing patient records.

window.denaiEntitlements = (function () {

  var CACHE_KEY    = 'denaiSubscription_v1';
  var CACHE_TTL_MS = 10 * 60 * 1000;  // 10 min — used to decide when to refresh

  // Tier map: featureKey → required plan tier.
  // Absent from this map = universally available (do NOT add core workflow here).
  var FEATURE_TIERS = {
    'ai.enhanced':     'pro',  // future: enhanced AI analysis capabilities
    'export.advanced': 'pro',  // future: advanced export formats
    'collab.advanced': 'pro',  // future: advanced multi-clinician workflows
  };

  var _status      = null;  // null = not yet initialized; 'none' = confirmed no subscription
  var _planId      = null;
  var _clinicId    = null;
  var _trialEndsAt = null;  // Phase 14: ISO 8601 timestamp when trial ends, or null

  // ── init: called by clinicSession after subscription DB query ────────────
  //
  // status: Stripe status string ('active', 'trialing', 'past_due', 'canceled',
  //         'incomplete') OR 'none' (confirmed no subscription row).
  //         Pass null only when the DB query FAILED — module falls back to cache.
  //
  // planId: Stripe price ID of the active plan, or null.
  // clinicId: The clinic UUID — stored in cache for invalidation awareness.
  /**
   * @param {string|null} status
   * @param {string|null} planId
   * @param {string|null} clinicId
   * @param {string|null} trialEndsAt  ISO 8601 timestamp when trial ends, or null
   */
  function init(status, planId, clinicId, trialEndsAt) {
    _status      = (typeof status      === 'string') ? status      : 'none';
    _planId      = (typeof planId      === 'string') ? planId      : null;
    _clinicId    = (typeof clinicId    === 'string') ? clinicId    : null;
    _trialEndsAt = (typeof trialEndsAt === 'string') ? trialEndsAt : null;
    _saveCache();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // Returns true when the clinic has an active or trialing subscription.
  function isPro() {
    var s = _resolveStatus();
    return s === 'active' || s === 'trialing';
  }

  // Returns the resolved subscription status.
  // Possible values: 'active' | 'trialing' | 'past_due' | 'canceled' |
  //                  'incomplete' | 'none' | 'unknown'
  // 'none'    = confirmed: no subscription row exists
  // 'unknown' = no confirmed state (offline or not yet loaded)
  /** @returns {SubscriptionStatus} */
  function getStatus() {
    return _resolveStatus();
  }

  // Returns the trial end timestamp as an ISO 8601 string, or null.
  // Populated for 'trialing' subscriptions. Null for active/canceled/none.
  // Falls back to localStorage cache when live state is not yet loaded.
  /** @returns {string|null} */
  function getTrialEndsAt() {
    if (_trialEndsAt !== null) return _trialEndsAt;
    var c = _readCache();
    return (c && typeof c.trialEndsAt === 'string') ? c.trialEndsAt : null;
  }

  // Returns true if the feature is available under the current plan.
  // Safe default: returns true for any feature not in FEATURE_TIERS.
  // Safe default: returns true when entitlement state is 'unknown'.
  /**
   * @param {string} featureKey
   * @returns {boolean}
   */
  function canUse(featureKey) {
    var tier = FEATURE_TIERS[featureKey];
    if (!tier) return true;
    var s = _resolveStatus();
    if (s === 'unknown') return true;  // no confirmed state — do not hard-block
    if (tier === 'pro') return isPro();
    return true;
  }

  // Returns true when the localStorage cache was written within CACHE_TTL_MS.
  // clinicSession uses this to skip a DB re-query when the cache is still fresh.
  function isCacheFresh() {
    var c = _readCache();
    if (!c || !c.cachedAt) return false;
    return (Date.now() - new Date(c.cachedAt).getTime()) < CACHE_TTL_MS;
  }

  // ── clear: called on sign-out ─────────────────────────────────────────────
  // Resets live state only. The localStorage cache is intentionally preserved —
  // if the user signs back in on the same device while offline, the last-known
  // subscription state remains readable for the grace period.

  function clear() {
    _status      = null;
    _planId      = null;
    _clinicId    = null;
    _trialEndsAt = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  function _resolveStatus() {
    if (_status !== null) return _status;
    var c = _readCache();
    if (c && typeof c.status === 'string') return c.status;
    return 'unknown';
  }

  function _saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        status:      _status,
        planId:      _planId,
        clinicId:    _clinicId,
        trialEndsAt: _trialEndsAt,
        cachedAt:    new Date().toISOString(),
      }));
    } catch (e) {}
  }

  function _readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  return Object.freeze({
    init:           init,
    canUse:         canUse,
    isPro:          isPro,
    getStatus:      getStatus,
    getTrialEndsAt: getTrialEndsAt,
    isCacheFresh:   isCacheFresh,
    clear:          clear,
  });

})();
