# denai — Rollback Playbook

> Wave 6C.4 operational discipline document.
> Use this when a production deployment has caused a failure.
> Each incident is classified by severity with a defined recovery workflow.
> When in doubt about severity, treat it as CRITICAL and roll back first.

---

## Rollback Mechanism

denai is deployed on Netlify. Every deploy is an **immutable, named snapshot**.
The primary rollback path is the Netlify UI — no git operations required.

### Standard Netlify rollback procedure

```
1. Open Netlify dashboard → Your site → Deploys tab
2. Find the last known-good deploy (look for the deploy before the current one)
3. Click the deploy row → "Publish deploy"
4. Netlify confirms: "This deploy is now live" (~10 seconds)
5. Verify the production URL is serving the old version
```

Recovery time: **under 30 seconds**.

The rolled-back state is identical to the prior deploy — no data loss, no state corruption, no cache invalidation needed (the prior `?v=` strings return to being the live URLs).

### Git-level rollback (if Netlify dashboard is inaccessible)

```bash
# Identify the last-known-good commit
git log --oneline

# Revert the bad commit
git revert <bad-commit-hash>

# Push to main — Netlify auto-deploys
git push origin main
```

This creates a new commit that undoes the bad one. It is always preferred over `git reset --hard` because it preserves history.

---

## Severity Classification

### CRITICAL — Roll back immediately, no investigation first

The application is non-functional for all users. Every minute of downtime risks patient data workflows.

### HIGH — Roll back within 5 minutes, investigate in parallel

Core functionality is broken for a subset of users or in a specific browser/scenario.

### MEDIUM — Investigate first, roll back if no quick fix

A non-critical feature is broken or degraded. The primary clinical workflow still functions.

### LOW — Log and fix in next release

A visual or cosmetic issue. No functional impact.

---

## Incident Playbooks

---

### INC-001: Page Renders Blank / No JavaScript Executes

**Severity: CRITICAL**

**Symptoms:**
- Production URL shows raw HTML or a blank white page
- DevTools Console shows: `Refused to execute inline script because it violates the following Content Security Policy directive`
- No `[denai EB]` messages — the error boundary never even fires
- All `src/` JS files load successfully (200) but nothing runs

**Root cause:** A `Content-Security-Policy` response header was injected by the host, and it omits `'unsafe-inline'`. The meta CSP and the response header CSP are both active; browsers apply the most restrictive of all policies. The inline `<script>` block containing the entire orchestration kernel is blocked.

**Recovery:**
1. **Roll back immediately** via Netlify Deploys tab
2. After rollback, confirm the page renders correctly
3. Investigate: Netlify → Site configuration → Headers — was a CSP header added?
4. If yes: remove it, re-deploy, and re-run the deployment-validation.md CSP check (step 3)
5. Do not re-deploy until step 3 of deployment-validation.md passes

**Do not attempt to fix by modifying the CSP meta tag.** The problem is a host-injected header, not the meta tag. Modifying the meta tag will not help if a response header is present.

---

### INC-002: Stale JavaScript / Runtime Errors After Deploy

**Severity: HIGH**

**Symptoms:**
- `TypeError: X is not a function` or `ReferenceError: X is not defined` in console
- Render pipeline partially works — some panels render, others throw `[denai EB]`
- Behavior changed without any user action between sessions
- Specifically: errors reference functions that exist in the latest code but the old code is executing

**Root cause:** Browser has cached a `src/` asset from a prior deploy. Possible causes:
- `?v=` string was not bumped in `index.html` for this release (asset URL unchanged, old cached version served)
- `index.html` itself was cached (`Cache-Control` header missing or wrong on HTML)
- A CDN edge node is serving a stale response

**Recovery:**
1. First attempt: hard-reload in affected browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) — clears cached assets
2. If hard-reload fixes it: the issue is user-side caching from before versioning was applied. No rollback needed. Monitor for recurrence.
3. If hard-reload does not fix it: **roll back via Netlify Deploys tab**
4. After rollback: identify which `?v=` string was not bumped — check `git diff HEAD~1 index.html`
5. Fix the missing version bump, run CI, and re-deploy

**Prevention:** The release checklist step 3 (asset version bump verification) prevents this. If it was skipped, add a mandatory version bump gate to the team workflow.

---

### INC-003: One or More src/ Files Return 404

**Severity: HIGH**

**Symptoms:**
- DevTools Console: `[denai EB] renderX threw: X is not a function` for panels that depend on the missing script
- DevTools Network: one or more `src/` files return `404 Not Found`
- Other panels that depend on earlier scripts may still render correctly (load order stops at the 404)
- `smoke.spec.js` would have caught this if run post-deploy (script 404s cause EB fires)

**Root cause options:**
- A file was renamed or moved but `index.html` still references the old path
- A `src/` file was accidentally deleted before commit
- A deployment configuration changed the publish directory and files are no longer at expected paths

**Recovery:**
1. **Roll back immediately** — a missing script breaks every panel that depends on it
2. Identify the missing file from the Network 404 URL
3. Verify the file exists in the repository: `git show HEAD:src/path/to/file.js`
4. If the file exists: the deployment path is wrong — check `netlify.toml` `publish = "."`
5. If the file is missing from the repository: restore it, verify CI passes, re-deploy

---

### INC-004: localStorage Persistence Failure

**Severity: HIGH**

**Symptoms:**
- Patients disappear on page reload
- DevTools Console: `QuotaExceededError` — localStorage is full
- DevTools Console: `SecurityError` — localStorage access blocked (private mode or restrictive browser setting)
- State reverts to default on every load

**Root cause options:**
- User is in private/incognito mode (expected — localStorage is session-only in incognito)
- Browser storage quota exceeded (rare for a clinical tool with < 50 patients)
- Domain changed between deploys — prior localStorage namespace is orphaned
- Browser settings: "Clear cookies and site data when you quit" enabled

**Recovery (QuotaExceededError):**
1. Not a deployment failure — this is a runtime data limit issue
2. The `safeStorageSet` function in the app handles this silently
3. No rollback needed; investigate the data volume and implement export/import in a future wave

**Recovery (domain change — data loss):**
1. This is NOT recoverable — localStorage data from the old origin is inaccessible from the new origin
2. No rollback will restore the data if the domain itself changed
3. For future: finalize the production domain before any real clinical use begins
4. Implement a backup/export mechanism before domain migrations

**Recovery (private mode — expected behavior):**
1. Not a deployment failure — inform the user to use a standard (non-private) window
2. No action needed

---

### INC-005: Render Pipeline Partial Failure (`[denai EB]` fires)

**Severity: MEDIUM to HIGH depending on which panel fails**

**Symptoms:**
- `[denai EB] renderX threw: ...` in DevTools Console
- One or more panels show an error state or empty content
- Other panels render correctly

**Root cause:** A render function threw an uncaught exception. The `withErrorBoundary()` wrapper caught it and logged it instead of crashing the full page.

**Triage by panel:**

| Panel | Severity | Notes |
|---|---|---|
| `renderRisk` | HIGH | Core clinical output |
| `renderRecommendation` | HIGH | Core clinical output |
| `renderGraph` (cost graph) | MEDIUM | Secondary output |
| `renderMaterial` | MEDIUM | Secondary output |
| `renderComparison` | LOW | Tertiary output |

**Recovery:**
1. Check the EB error message — it identifies which function threw and the error type
2. If the error is `TypeError: X is not a function`: likely a stale-asset mismatch (see INC-002)
3. If the error is a data-shape error (unexpected `null`, `undefined`): a new edge case not covered by the smoke runner
4. For HIGH severity panels: **roll back** while investigating
5. For MEDIUM/LOW severity: can defer rollback while investigating if the core clinical path still works

---

### INC-006: Report Generation Failure

**Severity: MEDIUM**

**Symptoms:**
- Click Print Report → nothing happens, or console error fires
- `URL.createObjectURL` or `window.open` throws
- Toast shows "Popup blocked" but download fallback also fails

**Root cause:** This is a known deferred gap. `blob:` URLs for `window.open()` are not covered by the current CSP `default-src 'self'`. Most browsers allow same-origin blob: URL popup in practice, but strict CSP enforcement in some browser versions or extensions may block it.

**Not a deployment regression** — this limitation existed pre-deploy. The download fallback is the recovery path.

**Recovery for affected users:**
1. Disable popup blockers for this site, or
2. Use the download fallback (file saves as `.html` to Downloads)
3. Do not roll back — this is a known deferred gap, not a new regression

**Future fix:** Add `blob:` to `default-src` in the CSP meta tag (Wave 6C recon item I-4).

---

### INC-007: CSS Rendering / Theme Failure

**Severity: MEDIUM to LOW**

**Symptoms:**
- App renders but looks unstyled (raw HTML appearance)
- Token CSS files not loading (brand colors absent, wrong font)
- Dark mode toggle broken

**Root cause options:**
- A CSS file returned 404 (see INC-003 recovery — same process)
- Font Awesome CDN outage (icons become blank squares — LOW severity)
- Google Fonts CDN outage (fonts fall back to system fonts — LOW severity)
- A `src/styles/` file was accidentally modified and contains a syntax error

**Recovery (CDN outage — LOW):**
1. No rollback needed — the app is functional, only visual
2. CDN will recover; no action required

**Recovery (CSS file 404 or syntax error — MEDIUM):**
1. If core layout is broken (panels invisible or overlapping): roll back
2. If only token colors are wrong: can defer rollback and fix in next commit

---

### INC-008: Service Worker Stale Cache Trap

**Severity: LOW currently / CRITICAL if triggered**

**Current status:** The Service Worker (`dandy-v1` cache) silently fails to register because `blob:` URLs are not in `worker-src`. This incident cannot currently occur.

**Future risk:** If `blob:` is ever added to `worker-src` or `script-src` in the CSP, the SW will register and cache the app shell under `dandy-v1`. Future deploys will be served from this stale cache indefinitely for users who have the SW active.

**Symptoms (if triggered in a future wave):**
- After a production update, some users still see the old version
- Hard reload fixes it; soft reload does not
- `Application → Service Workers` in DevTools shows `dandy-v1` active

**Recovery:**
1. Update the SW cache name in `index.html` from `dandy-v1` to `denai-v2.x` (or the current version)
2. The old SW will activate the new cache on next fetch, delete `dandy-v1`, and serve fresh content
3. This requires a code deploy — not addressable via Netlify rollback alone

**Prevention:** Before enabling SW, update `const CACHE = 'dandy-v1'` to a version-stamped name. See cerebrum.md Key Learnings.

---

## Post-Rollback Validation

After any rollback, run the full deployment-validation.md checklist on the production URL to confirm the rollback is clean and the prior version is healthy.

Specifically verify:
- [ ] Core render path works (implant scenario → recommendation)
- [ ] DevTools Console: zero errors
- [ ] Network: all `src/` files return 200 with the prior `?v=` string
- [ ] localStorage persistence still works

---

## Escalation Decision Tree

```
Production failure detected
│
├─ Blank page or no JavaScript executes
│   → CRITICAL: Roll back NOW (INC-001)
│
├─ All src/ files load but runtime errors in console
│   ├─ TypeError "is not a function"
│   │   → HIGH: Roll back + check stale asset (INC-002)
│   └─ [denai EB] on core panel
│       → HIGH: Roll back (INC-005)
│
├─ One or more src/ files return 404
│   → HIGH: Roll back NOW (INC-003)
│
├─ Patients disappear on reload
│   ├─ Private mode?  → expected, no action
│   └─ Standard mode? → HIGH: investigate (INC-004)
│
├─ Report button does nothing
│   → MEDIUM: no rollback, use download fallback (INC-006)
│
└─ Visual/CSS issues only
    ├─ CDN font/icon only → LOW: no action
    └─ Layout broken     → MEDIUM: may roll back (INC-007)
```
