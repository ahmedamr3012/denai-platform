// src/auth/clinicSession.js
// Phase 3.4 — Lightweight Membership Model
// Phase 13 — Subscription state loading for entitlement checks
// Phase 14 — Trial infrastructure: trial_ends_at propagation (P1.1 Wave A)
//
// Clinic session context. Loaded once after auth settle via authModule.js.
// Exposes the current user's clinic context (id, role, name, member roster).
// Phase 13: also loads subscription status and calls denaiEntitlements.init().
//
// LOCAL-FIRST INVARIANT: all methods degrade gracefully when client or auth
// is unavailable. No clinic context = no error; user operates in personal
// workspace. This module never blocks startup or clinical workflows.
// Subscription load failure is non-fatal — entitlements.js falls back to cache.
//
// ── Session lifecycle ────────────────────────────────────────────────────────
// init(client)   — async. Called from authModule on sign-in / session restore.
//                  Idempotent: no-op if already initialized for this session.
// clear()        — called from authModule on sign-out. Resets all state so the
//                  next sign-in triggers a clean re-init.
//
// ── Membership model ─────────────────────────────────────────────────────────
// owner  — created the clinic. Can see full roster (Phase 3.4 policy).
//          Can create new patients auto-assigned to the clinic.
// member — belongs to the clinic. Sees clinic patients via RLS.
//          Cannot modify membership roster in Phase 3.4.
//
// ── What is NOT in Phase 3.4 ─────────────────────────────────────────────────
// Email-based invitations, member write access to other members' patients,
// cross-member collaborative edits, updated_at / clinic rename flow.
// All deferred to Phase 3.5+.

window.denaiClinicSession = (function () {

  var _clinicId            = null;
  var _clinicName          = null;
  var _role                = null;
  var _members             = [];     // owner-only roster cache: [{user_id, role, created_at}]
  var _initialized         = false;  // prevents redundant re-queries on token refresh
  var _subscriptionStatus  = null;   // Phase 13: loaded from clinic_subscriptions
  var _planId              = null;   // Phase 13: Stripe price ID of active plan
  var _trialEndsAt         = null;   // Phase 14: ISO 8601 trial end timestamp, or null

  // ── Public accessors ──────────────────────────────────────────────────────

  function getClinicId()            { return _clinicId; }
  function getClinicName()          { return _clinicName; }
  function getRole()                { return _role; }
  function isOwner()                { return _role === 'owner'; }
  function getMembers()             { return _members.slice(); }  // defensive copy
  function getSubscriptionStatus()  { return _subscriptionStatus; }
  function getPlanId()              { return _planId; }
  function getTrialEndsAt()         { return _trialEndsAt; }  // Phase 14: ISO 8601 or null

  // ── Init: load clinic membership after auth settle ───────────────────────

  async function init(client) {
    if (_initialized) return;  // idempotent — skip on token refresh events
    try {
      var loaded = await _load(client);
      // Only lock out retries when load succeeded or confirmed no-clinic.
      // A false return (DB/network error) leaves _initialized = false so the
      // next token-refresh auth event can retry — important for transient errors.
      if (loaded) _initialized = true;
    } catch (e) {
      console.warn('[denaiClinicSession] init failed:', e.message);
    }
  }

  // Returns true = loaded (or confirmed no-clinic), false = DB error (retry allowed).
  async function _load(client) {
    // RLS (clinic_members_select_self) automatically filters to current user.
    // Embedded join clinics(id, name) works via FK: clinic_members.clinic_id → clinics.id.
    // clinics_select_member has a direct owner_user_id branch — no circular dependency.
    var res = await client
      .from('clinic_members')
      .select('clinic_id, role, clinics(id, name)')
      .limit(1);  // one clinic per user for Phase 3.4

    if (res.error) {
      console.warn('[denaiClinicSession] load error:', res.error.message);
      return false;  // signal transient error — allow retry on next auth event
    }

    var row = res.data && res.data[0];
    if (!row) return true;  // no clinic — user operates in personal workspace (confirmed state)

    _clinicId   = row.clinic_id;
    _role       = row.role;
    _clinicName = (row.clinics && row.clinics.name) || null;

    // Owner: load full member roster for account panel display
    if (_role === 'owner') {
      await _loadRoster(client);
    }

    // Phase 13: load subscription status for entitlement checks.
    // Non-fatal — a query failure leaves denaiEntitlements to fall back to cache.
    await _loadSubscription(client);

    return true;
  }

  async function _loadRoster(client) {
    // clinic_members_select_owner_roster (Phase 3.4) allows owner to see all
    // member rows for clinics they own. Non-owners receive an empty set.
    if (!_clinicId) return;
    var res = await client
      .from('clinic_members')
      .select('user_id, role, created_at')
      .eq('clinic_id', _clinicId)
      .order('created_at', { ascending: true });

    if (res.error) {
      console.warn('[denaiClinicSession] roster load error:', res.error.message);
      return;
    }
    _members = res.data || [];
  }

  // ── Phase 13: Subscription load ───────────────────────────────────────────
  // Queries clinic_subscriptions for the current clinic.
  // RLS: clinic_subscriptions_select_owner (owner) or
  //      clinic_subscriptions_select_member (Phase 13 policy, all members).
  // On success: calls denaiEntitlements.init() and caches the state.
  // On error:   logs a warning; denaiEntitlements falls back to localStorage cache.

  async function _loadSubscription(client) {
    if (!_clinicId) return;
    try {
      var res = await client
        .from('clinic_subscriptions')
        .select('status, plan_id, trial_ends_at')
        .eq('clinic_id', _clinicId)
        .maybeSingle();

      if (res.error) {
        console.warn('[denaiClinicSession] subscription load error:', res.error.message);
        return;  // entitlements.js will fall back to localStorage cache
      }

      _subscriptionStatus = res.data ? res.data.status        : 'none';
      _planId             = res.data ? res.data.plan_id        : null;
      _trialEndsAt        = res.data ? res.data.trial_ends_at  : null;

      if (typeof denaiEntitlements !== 'undefined') {
        denaiEntitlements.init(_subscriptionStatus, _planId, _clinicId, _trialEndsAt);
      }
    } catch (e) {
      console.warn('[denaiClinicSession] subscription load exception:', e.message);
    }
  }

  // ── Clinic creation ───────────────────────────────────────────────────────
  // Owner flow: creates a clinic row + inserts the owner's membership row.
  // Two sequential writes are safe: clinic is invisible to others (RLS) until
  // members are added, and the membership row is only useful after clinic exists.

  async function createClinic(name) {
    if (_clinicId) return { error: 'Already associated with a clinic' };

    var client = _getClient();
    if (!client) return { error: 'Not signed in' };
    if (!name || !name.trim()) return { error: 'Clinic name required' };

    var cleanName = name.trim().slice(0, 100);

    // Resolve caller's uid — required to satisfy clinics_insert_owner policy.
    var userRes = await client.auth.getUser();
    if (!userRes.data || !userRes.data.user) return { error: 'Auth error' };
    var uid = userRes.data.user.id;

    // Step 1: Create clinic (clinics_insert_owner: auth.uid() = owner_user_id)
    var clinicRes = await client
      .from('clinics')
      .insert({ name: cleanName, owner_user_id: uid })
      .select('id')
      .single();

    if (clinicRes.error) return { error: clinicRes.error.message };
    var newClinicId = clinicRes.data.id;

    // Step 2: Insert owner membership row
    // (clinic_members_insert_owner: clinic must be readable → direct owner check passes)
    var memRes = await client
      .from('clinic_members')
      .insert({ clinic_id: newClinicId, user_id: uid, role: 'owner' });

    if (memRes.error) return { error: memRes.error.message };

    // Update session state directly — avoids an extra round-trip to the DB.
    _clinicId    = newClinicId;
    _clinicName  = cleanName;
    _role        = 'owner';
    _members     = [{ user_id: uid, role: 'owner', created_at: new Date().toISOString() }];
    _initialized = true;

    return { ok: true, clinicId: newClinicId };
  }

  // ── Clear on sign-out ─────────────────────────────────────────────────────

  function clear() {
    _clinicId           = null;
    _clinicName         = null;
    _role               = null;
    _members            = [];
    _initialized        = false;  // allows clean re-init on next sign-in
    _subscriptionStatus = null;
    _planId             = null;
    _trialEndsAt        = null;
    // Phase 13: reset live entitlement state (cache preserved for offline grace).
    try { if (typeof denaiEntitlements !== 'undefined') denaiEntitlements.clear(); } catch (e) {}
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _getClient() {
    return (typeof denaiAuth !== 'undefined' && denaiAuth.isSignedIn())
      ? denaiAuth.getClient()
      : null;
  }

  return Object.freeze({
    init:                  init,
    getClinicId:           getClinicId,
    getClinicName:         getClinicName,
    getRole:               getRole,
    isOwner:               isOwner,
    getMembers:            getMembers,
    getSubscriptionStatus: getSubscriptionStatus,
    getPlanId:             getPlanId,
    getTrialEndsAt:        getTrialEndsAt,
    createClinic:          createClinic,
    clear:                 clear,
  });

})();
