# bug-169 — Sync Status Indicator Mismatch

> Investigation document only. No fix proposed. No code modified.

---

## Observed Behavior

- Account modal sync status row reports **"Synced"**.
- Clinic hydration succeeds (`_load()` in `src/auth/clinicSession.js`
  resolves clinic, role, and name without error).
- The clinic survives a full page reload.
- The dashboard footer sync indicator reports **"Local-only · Data stays on
  this device"**.

The two indicators disagree at the same point in time, immediately following
a confirmed-successful cloud sign-in, clinic creation, and hydration. This
was observed during functional validation of the bug-167 fix and is unrelated
to the schema/grants/RLS resolution documented there — no database error,
no `42501`, no `42P17` was involved in producing this symptom.

---

## Known Facts

1. There are **two independently-implemented** sync status indicators in
   `index.html`, each with its own DOM element, its own update function, and
   its own data source:

   | Indicator | DOM element | Update function | Data source |
   |---|---|---|---|
   | Account modal | `authSyncLabel` / `authSyncDot` ([index.html:1451](index.html#L1451)) | `openAuthModal()` ([index.html:5678-5707](index.html#L5678-L5707)) | `denaiSyncQueue.getQueueLength()`, `denaiSyncQueue.getStatus()` |
   | Dashboard footer | `dashSyncLabel` / `dashSyncDot` ([index.html:1962](index.html#L1962)) | `renderDashboardView()` ([index.html:3110-3121](index.html#L3110-L3121)) | `denaiAuth.isSignedIn()` |

2. The two functions read **different state entirely**:
   - The modal's label is derived from the **upload/sync queue state**
     (`denaiSyncQueue`): empty queue + no error → `"Synced"`; pending items →
     `"N pending"`; error → `"Sync error"`.
   - The footer's label is derived from **auth session state**
     (`denaiAuth.isSignedIn()`) at the moment `renderDashboardView()` last
     ran: signed in → `"Synced — signed in as {email}"`; not signed in →
     `"Local-only · Data stays on this device"`.

3. `renderDashboardView()` (and therefore the footer label) is only
   re-invoked from two call sites in the entire codebase:
   - [index.html:2580](index.html#L2580) — inside the view router, only when
     navigating **to** the dashboard view (`if (view === 'dashboard')
     renderDashboardView();`).
   - [index.html:5826](index.html#L5826) — inside `closeSettingsModal()`,
     only when the Settings modal closes while the dashboard view is active.

4. Neither call site is tied to an authentication state-change event, a
   sign-in completion callback, or a cloud-hydration completion callback.
   There is no `denaiAuth.onStateChange` (or equivalent) listener found that
   re-invokes `renderDashboardView()`.

5. `openAuthModal()`, by contrast, recomputes its label fresh every time the
   modal is opened, directly from live queue state — which is why it shows
   the correct, current `"Synced"` value.

---

## Potential Causes

These are stated as possibilities for investigation, not conclusions:

1. **Stale render, not stale state.** The footer label may simply reflect
   whatever `denaiAuth.isSignedIn()` evaluated to the last time
   `renderDashboardView()` executed — which could have been *before*
   sign-in completed, if the user was already on the dashboard view when
   sign-in/hydration finished and never re-triggered a dashboard render
   afterward.

2. **Two label sources measuring two different things.** Even if both
   functions ran at the same instant, they are not guaranteed to agree: the
   modal reports *sync queue health* (have local writes been pushed?) while
   the footer reports *auth session presence* (is the user signed in at
   all?). A signed-in user with an empty, healthy queue and a signed-in user
   who is simply not yet rendered post-sign-in are different states that
   could both legitimately want to say "Synced" but are computed from
   unrelated signals.

3. **Missing re-render hook on auth/hydration completion.** If `denaiAuth`
   or `denaiCloudSync` does not broadcast a completion event that the
   dashboard subscribes to, any view that was already mounted before
   sign-in/hydration completed has no mechanism to refresh its sync-status
   row without a user-initiated re-navigation.

---

## Investigation Plan

1. Confirm the exact sequence of events in the session where the mismatch
   was observed: was the dashboard view already open before sign-in, or was
   it navigated to afterward? (Determines whether cause #1 applies.)
2. Trace `denaiAuth`'s sign-in completion path (`src/auth/authModule.js`) to
   determine whether it exposes any callback, event, or state-change hook
   that other modules can subscribe to.
3. Trace `denaiCloudSync`'s hydration completion path
   (`src/sync/cloudSync.js`) for the same — does it signal completion
   anywhere observable outside its own module?
4. Search for all call sites of `renderDashboardView()` once more after
   reviewing `auth/authModule.js` and `sync/cloudSync.js` in full, in case a
   hydration/sign-in-triggered call exists outside the obvious patterns
   already searched (e.g. inside a `.then()` chain or callback closure not
   matched by a direct function-name grep).
5. Determine whether `denaiAuth.isSignedIn()` itself could transiently
   return `false` immediately after a successful sign-in (e.g., a session
   object that is set asynchronously after the resolved promise), which
   would explain a stale-on-arrival footer label even on a fresh render.
6. Reproduce manually: sign in while already on the dashboard view, observe
   both indicators without navigating away, and note whether the footer ever
   self-corrects (e.g., on a later unrelated re-render) or remains wrong
   indefinitely until the view is left and re-entered.

---

## Files/Components Likely Involved

| File | Relevance |
|---|---|
| `index.html` | Both indicator DOM elements and both update functions live here (`renderDashboardView()` ~line 3010, `openAuthModal()` ~line 5678) |
| `src/auth/authModule.js` | Source of `denaiAuth.isSignedIn()` and `denaiAuth.getSession()` — the footer's data source |
| `src/sync/syncQueue.js` | Source of `denaiSyncQueue.getQueueLength()` / `getStatus()` / `getLastSyncedAt()` — the modal's data source |
| `src/sync/cloudSync.js` | Source of `denaiCloudSync.getLastHydratedAt()` — referenced by the modal's "most recent" timestamp logic, may be relevant to hydration-completion timing |
| `src/auth/clinicSession.js` | Confirmed working correctly (`_load()` hydration succeeded) — included for completeness since it's adjacent to the auth/sync surface, not because it's implicated |

---

## Open Questions

1. Should the two indicators be reading from the same underlying state, or
   are "auth session present" and "sync queue healthy" genuinely different
   facts that both deserve independent surfacing — just not under labels
   that collide on the word "Synced" / "Local-only"?
2. Is there an existing event/callback mechanism in `denaiAuth` or
   `denaiCloudSync` that `renderDashboardView()` could subscribe to, or would
   one need to be introduced?
3. Was the dashboard view already mounted at the time of sign-in in the
   observed case, or was this footer label stale from a render that
   happened before this session's sign-in at all (e.g., carried over from a
   previous local-only state)?
4. Does this same mismatch reproduce on a fresh sign-in from a fully signed-
   out state, or only on the specific sequence exercised during bug-167
   functional validation (sign-in → create clinic → reload)?
5. Is the footer's "Local-only · Data stays on this device" hardcoded as the
   initial DOM content ([index.html:1962](index.html#L1962)) and only ever
   overwritten by `renderDashboardView()` — meaning any path that skips a
   dashboard render after sign-in would leave the original hardcoded string
   visible indefinitely?

No fix is proposed. No code has been modified as part of this investigation.
