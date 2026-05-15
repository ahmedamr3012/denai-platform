# denai — Release Checklist

> Wave 6C.4 operational discipline document.
> Run this checklist in order for every release to production.
> A failed gate is a hard stop — do not continue until resolved.

---

## PRE-RELEASE GATES

### 1. Repository state

- [ ] `git status` is clean — no untracked or modified files
- [ ] Current branch is `main` (or a release branch targeting `main`)
- [ ] All wave work has been merged via PR — no direct commits to `main` mid-wave
- [ ] `git log --oneline -5` confirms the expected commits are present

### 2. CI gate

```
npm run test:ci
```

- [ ] Exit code: `0`
- [ ] `engine.spec.js` — PASS (all 9 ClinicalEngine scenarios)
- [ ] `smoke.spec.js` — PASS (zero EB fires, zero page errors, all 3 DOM scenarios)
- [ ] Total: `2 passed` — any other result is a hard stop

> If either spec fails, do not proceed. Fix the regression, re-run CI, and restart
> this checklist from step 1.

### 3. Asset version bump verification

- [ ] Open `index.html` lines 22–50
- [ ] Confirm all `<link rel="stylesheet" href="src/...">` tags have `?v=X.Y.Z`
- [ ] Confirm all `<script src="src/...">` tags have `?v=X.Y.Z`
- [ ] Confirm the version string matches the intended release version
- [ ] Confirm no CDN URLs (`fonts.googleapis.com`, `cdnjs.cloudflare.com`) were versioned — they must not be

**Count check:** 19 CSS links + 16 JS scripts = 35 versioned references total.
*(Wave 7B added `src/auth/authModule.js?v=2.0.0`. Wave 7D added `src/sync/serializer.js?v=2.0.0` and `src/sync/syncQueue.js?v=2.0.0`. Wave 7E added `src/sync/cloudSync.js?v=2.0.0`. Wave 7F added `src/sync/prefsSync.js?v=2.0.0`. Wave 7G added `src/utils/notesEncryption.js?v=2.0.0`.)*

```
# Quick grep to confirm version string is present on all 35 first-party refs:
grep -c "?v=" index.html
# Expected: 35
```

### 4. Manual browser validation — Chrome (latest)

Open `http://127.0.0.1:3000` via `node tests/ci/serve.js` (or the live production URL after deploy):

- [ ] Page renders — no blank screen, no raw HTML
- [ ] DevTools Console: **zero errors** on initial load
- [ ] DevTools Console: **zero** `[denai EB]` messages
- [ ] DevTools Network: all 10 `src/*.js` requests return HTTP 200
- [ ] DevTools Network: all 19 `src/styles/**/*.css` requests return HTTP 200
- [ ] Select an implant scenario → recommendation panel renders
- [ ] What-if panel renders
- [ ] Cost graph SVG renders (no NaN in coordinates)
- [ ] Risk section visible and populated

### 5. Manual browser validation — Firefox (latest)

- [ ] Page renders identically to Chrome
- [ ] DevTools Console: **zero errors**
- [ ] DevTools Console: **zero** CSP violation messages
  > Firefox reports CSP violations more verbosely than Chrome — check carefully
- [ ] Core render path works (implant scenario → recommendation)

### 6. Mobile viewport validation

Using DevTools device emulation (Chrome → Toggle device toolbar):

- [ ] iPhone 12 (390×844): no horizontal scroll, no overflow
- [ ] Touch targets adequately sized (buttons, selectors)
- [ ] Sidebar collapses/adapts on narrow viewport
- [ ] Recommendation banner readable without truncation

### 7. localStorage persistence validation

- [ ] Add a new patient (name, condition, tooth)
- [ ] Close the tab (do not clear storage)
- [ ] Reopen `http://127.0.0.1:3000`
- [ ] Patient appears in the patient list
- [ ] Load the patient — state restores correctly
- [ ] Modify a field → verify autosave (no manual save required)

> **Critical:** If localStorage fails, all patient data is lost on refresh.
> This must pass before any deployment used for real clinical data.

### 8. Report generation validation

- [ ] With a patient loaded and a scenario selected, click Print Report
- [ ] Report popup opens (or download fallback triggers if popup blocked)
- [ ] Report HTML renders correctly with patient data
- [ ] No console errors during report generation
- [ ] Close the report window — no memory leak errors

### 9. Dark mode validation

- [ ] Toggle dark mode — theme switches correctly
- [ ] No unstyled elements (white-on-white or black-on-black text)
- [ ] Recommendation banner visible in dark mode
- [ ] Risk indicators visible in dark mode

### 10. Console-error final verification

- [ ] Open DevTools Console → filter by "Errors"
- [ ] Confirm zero errors after completing the full manual workflow above
- [ ] Specifically check: no `[denai EB]`, no `TypeError`, no `ReferenceError`

---

## RELEASE EXECUTION

### 11. Git tag

```bash
git tag v2.0.0
git push origin v2.0.0
```

- [ ] Tag applied to the correct commit (`git log --oneline -1`)
- [ ] Tag pushed to remote
- [ ] GitHub shows the tag under Releases

**Versioning convention:**
- `v2.MINOR.0` for wave-level releases (new feature/hardening wave complete)
- `v2.MINOR.PATCH` for hotfixes within a wave
- The `?v=` string in `index.html` asset references must match the git tag version

### 12. Branch verification

- [ ] Deploying from `main`, not a feature branch
- [ ] `git log origin/main..HEAD` is empty (local is not ahead of remote)

### 13. Netlify deploy

**Option A — Netlify UI (recommended for first deploy):**
1. Log in to Netlify → New site → Import an existing project → GitHub
2. Select `denai` repository
3. Build settings:
   - Base directory: *(leave empty)*
   - Build command: *(leave empty — `netlify.toml` sets `command = ""`)*
   - Publish directory: *(leave empty — `netlify.toml` sets `publish = "."`)*
4. Click Deploy

**Option B — Netlify CLI (for subsequent deploys):**
```bash
npx netlify deploy --prod
```

- [ ] Deploy completes without error
- [ ] Netlify dashboard shows deploy status: **Published**
- [ ] Production URL is live and accessible

### 14. Production URL verification (immediate)

- [ ] Production URL opens — page renders
- [ ] URL is HTTPS (not HTTP)
- [ ] No browser SSL warning

---

## POST-RELEASE VERIFICATION

### 15. Cache header verification

Open DevTools → Network → click `index.html` response:

- [ ] `Cache-Control: no-cache, no-store, must-revalidate` is present
- [ ] No `max-age` on `index.html`

Click any `src/` asset response (e.g., `clinicalEngine.js?v=2.0.0`):

- [ ] `Cache-Control: public, max-age=31536000, immutable` is present

> If `index.html` shows `max-age > 0`, the Netlify config is not applied.
> Verify `netlify.toml` is in the repository root and re-deploy.

### 16. CSP header verification

In DevTools → Network → `index.html` response headers:

- [ ] `Content-Security-Policy` response header is **NOT present**
  > If it appears, the hosting platform injected it. Check Netlify site settings
  > under Security → Headers and remove any injected CSP before the app is used.

### 17. Asset URL verification

In DevTools → Network → filter by JS:

- [ ] All `src/` JS files show `?v=2.0.0` (or the current release version) in their URLs
- [ ] All return HTTP 200 (not 304 — first load after deploy should be 200)

### 18. `.wolf` blocking verification

Navigate to `https://your-production-url/.wolf/cerebrum.md`:

- [ ] Returns HTTP 404 (not 200)
- [ ] Netlify's default 404 page is shown

### 19. Post-deploy smoke

Repeat steps 4 (Chrome) and 7 (localStorage) on the live production URL.

- [ ] Full render path works on production
- [ ] localStorage persists across tab close/reopen on production origin

### 20. Rollback readiness confirmation

- [ ] Netlify dashboard → Deploys tab shows current deploy is listed
- [ ] Previous deploy (if exists) is available for 1-click rollback
- [ ] You know the URL of the Netlify Deploys tab for this site

---

## RELEASE COMPLETE

All 20 gates passed → release is live and operationally validated.

Record in commit message or release notes:
- Wave completed
- Version deployed
- Any known deferred issues (e.g., SW blob URL, `blob:` CSP gap)
