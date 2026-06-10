# denai — Deployment Validation Playbook

> Wave 6C.4 operational discipline document.
> Run this after every production deployment to confirm the live app is healthy.
> Each check lists the exact expected result. Any deviation from the expected result
> is an incident — consult rollback-playbook.md immediately.

---

## Setup

Open the production URL in Chrome (latest). Open DevTools with `F12`.

All checks below refer to the live production URL (`https://your-production-domain`),
not localhost.

---

## 1. Initial Page Load Check

**Action:** Load the production URL cold (no prior cache for this origin).

**DevTools → Console tab:**

| Expected | Fail condition |
|---|---|
| Zero `[Error]` entries | Any red error |
| Zero `[denai EB]` messages | Render pipeline fault |
| Zero CSP violation messages | Host-injected conflicting CSP |
| `DandyTests:` summary may appear (localhost-gated, will NOT fire on production) | N/A |

**DevTools → Network tab (filter: All):**

| Resource | Expected status | Fail condition |
|---|---|---|
| `index.html` (or `/`) | `200` | `404`, `500`, redirect loop |
| `src/ai/calcAI.js?v=2.0.0` | `200` | `404` — file missing or wrong path |
| `src/ai/clinicalEngine.js?v=2.0.0` | `200` | `404` |
| `src/utils/formatting.js?v=2.0.0` | `200` | `404` |
| `src/utils/costEngine.js?v=2.0.0` | `200` | `404` |
| `src/reports/reportTemplates.js?v=2.0.0` | `200` | `404` |
| `src/render/costGraphPanel.js?v=2.0.0` | `200` | `404` |
| `src/render/materialPanel.js?v=2.0.0` | `200` | `404` |
| `src/render/comparisonPanel.js?v=2.0.0` | `200` | `404` |
| `src/render/patientPanel.js?v=2.0.0` | `200` | `404` |
| `src/render/riskPanel.js?v=2.0.0` | `200` | `404` |
| `src/auth/authModule.js?v=2.0.2` | `200` | `404` — note: bumped to v2.0.2 in bug-146 final remediation (2026-06-10) |
| `src/sync/serializer.js?v=2.0.0` | `200` | `404` |
| `src/sync/syncQueue.js?v=2.0.0` | `200` | `404` |
| `src/sync/cloudSync.js?v=2.0.0` | `200` | `404` |
| `src/sync/prefsSync.js?v=2.0.0` | `200` | `404` |
| `src/utils/notesEncryption.js?v=2.0.0` | `200` | `404` |
| All 19 `src/styles/**/*.css?v=2.0.0` | `200` | `404` |
| `fonts.googleapis.com/css2?…` | `200` | CDN outage (non-critical, app degrades visually) |
| `cdnjs.cloudflare.com/…/all.min.css` | `200` | CDN outage (non-critical, icons degrade) |

**Total first-party requests expected:** 1 HTML + 16 JS + 19 CSS = 36 requests, all `200`.
*(Wave 7B added `src/auth/authModule.js`. Wave 7D added `src/sync/serializer.js` and `src/sync/syncQueue.js`. Wave 7E added `src/sync/cloudSync.js`. Wave 7F added `src/sync/prefsSync.js`. Wave 7G added `src/utils/notesEncryption.js`. The Supabase CDN script is a third-party request, not counted here.)*

---

## 2. Cache-Control Verification

**Action:** In the Network tab, click the `index.html` response row → Headers tab.

**Expected response headers for `index.html`:**

```
Cache-Control: no-cache, no-store, must-revalidate
```

**Fail conditions:**
- `Cache-Control: max-age=3600` or any `max-age > 0` → Netlify cache config not applied
- `Cache-Control` header absent → default CDN caching may apply; verify `netlify.toml` is in repo root
- Any `Expires:` header with a future date alongside `max-age` → overriding the no-cache intent

**Expected response headers for any `src/` asset (e.g., `clinicalEngine.js?v=2.0.0`):**

```
Cache-Control: public, max-age=31536000, immutable
```

**Fail conditions:**
- `max-age=0` or `no-cache` on assets → versioning scheme is broken; assets will be re-fetched on every load
- Absent `immutable` → minor, not a functional failure, but conditional GETs will fire needlessly

---

## 3. CSP Verification

**Action:** In the Network tab, click the `index.html` response row → Headers tab.

**Expected:** `Content-Security-Policy` response header is **absent**.

> The app's CSP is delivered exclusively via the `<meta http-equiv="Content-Security-Policy">`
> tag in `index.html`. A response-level header would intersect with the meta CSP,
> and browsers apply the most restrictive of all active policies simultaneously.
> A host-injected policy that omits `'unsafe-inline'` will silently kill the
> entire orchestration kernel.

**Fail condition:** `Content-Security-Policy` appears in response headers.

**Recovery:** Go to Netlify → Site configuration → Headers → remove any injected CSP.
Then re-verify. Do not use the site until resolved.

**Action (optional but recommended):** In the Console tab, check for any CSP violation messages. These look like:

```
Refused to execute inline script because it violates the following Content Security Policy directive: ...
```

**Expected:** Zero such messages.

---

## 4. Asset Version Verification

**Action:** In the Network tab, filter by JS.

**Expected:** All `src/` JS files show the current version string in their URL:

```
src/ai/clinicalEngine.js?v=2.0.0
src/render/costGraphPanel.js?v=2.0.0
...
```

**Fail condition:** Any `src/` file URL appears without `?v=` → `index.html` was deployed without
the Wave 6C.2 versioning patch. Assets will be served stale on the next deploy.

**Action:** On second load (reload the page), verify `src/` assets return `304 Not Modified`:

```
src/ai/clinicalEngine.js?v=2.0.0  →  304
```

This confirms the `immutable` cache header is being respected. If the second load returns
`200` for all assets, the `Cache-Control: immutable` header is not being applied.

---

## 5. `.wolf` Access Blocking Verification

**Action:** Navigate to:

```
https://your-production-domain/.wolf/cerebrum.md
https://your-production-domain/.wolf/buglog.json
```

**Expected:** HTTP 404 — Netlify's default 404 page.

**Fail condition:** HTTP 200 — file content is returned. This exposes development metadata.

**Recovery:** Verify `netlify.toml` contains the `/.wolf*` redirect rule with `force = true`,
and that `netlify.toml` is in the repository root that Netlify is deploying.

---

## 6. localStorage Persistence Verification

**Action:**

1. Add a new patient: name = "Test Patient", tooth = 36, condition = Caries
2. Close the tab completely
3. Re-open the production URL
4. Verify "Test Patient" appears in the patient list
5. Load the patient — confirm state restored (tooth, condition, treatment)
6. Delete the test patient after validation

**Expected:** Full persistence across tab close/reopen.

**Fail condition:** Patient disappears on reload — localStorage is not working.

**Possible cause on production:** Domain changed between deploys (different origin = different localStorage namespace). Or the browser is in private/incognito mode (localStorage disabled by some browser configs).

> Note: Incognito/private mode may disable persistent localStorage in some browsers.
> Always validate in a standard (non-private) window.

---

## 7. Core Render Path Validation

**Action:** With any patient loaded:

1. Select tooth, set condition to "Implant needed"
2. Verify recommendation banner renders with a treatment recommendation
3. Verify the confidence score ring renders (filled arc, not empty)
4. Verify the cost graph SVG renders (bars visible, no NaN or zero-height)
5. Verify the risk section populates
6. Verify the comparison table populates

**Expected:** All panels render with data. No "—" or empty placeholder where content is expected.

**Fail condition — `[denai EB]` in console:** A render function threw. Check the error message for which panel failed.

---

## 8. Dark Mode Verification

**Action:** Toggle dark mode.

**Expected:**
- Background switches from light to dark
- Text remains readable (no white-on-white or dark-on-dark)
- Brand color elements (recommendation banner, confidence ring) remain visible
- All card borders visible against dark background
- Sidebar background switches to `#0d1114` (dark override)

**Fail condition:** Any panel becomes illegible or invisible.

---

## 9. Firefox-Specific Verification

**Action:** Repeat steps 1–7 in Firefox (latest).

**Additional Firefox checks:**

- [ ] DevTools → Console: zero CSP violation messages
  > Firefox has a stricter CSP reporter than Chrome. It will surface violations
  > that Chrome silently ignores.

- [ ] DevTools → Network: check for any CORS errors on font requests
  > Firefox enforces CORS on font-src more strictly. Confirm Google Fonts and
  > Font Awesome load without `CORS error` messages.

- [ ] Report generation: confirm popup opens (Firefox popup blocker behavior differs)

**Expected:** Identical behavior to Chrome. Any Firefox-only failure is a compatibility issue, not a deployment issue — log and investigate before wide release.

---

## 10. Mobile Validation (DevTools Emulation)

**Action:** Chrome DevTools → Toggle device toolbar → iPhone 12 Pro (390×844).

- [ ] No horizontal scrollbar
- [ ] Sidebar visible or collapses gracefully at narrow viewport
- [ ] Recommendation banner readable (no truncation)
- [ ] Buttons are touch-target sized (minimum 44px)
- [ ] Modals fit within viewport

**Physical device check (recommended for first production release):**

Open on an actual iOS device (Safari) or Android device (Chrome).

- [ ] Page loads without errors
- [ ] Touch interactions responsive
- [ ] localStorage persistence works on mobile

---

## 11. Report Generation Validation

**Action:** With a complete patient record loaded:

1. Click the Print Report button
2. Wait for popup to open (or download to trigger)

**Expected A (popup not blocked):**
- New window opens with the rendered clinical report
- Patient data visible (name, tooth, condition, treatment recommendation)
- No console errors during report generation
- `URL.createObjectURL` succeeds (blob URL in the popup window title/address)

**Expected B (popup blocked by browser):**
- Toast notification: "Popup blocked — downloading report instead"
- File download triggers automatically
- File is a valid `.html` file

**Fail condition:** No popup and no download — report generation threw before reaching either path. Check console for error.

> Known limitation: The report popup uses `URL.createObjectURL()` which requires
> `blob:` in the CSP `default-src` directive. This is a known deferred gap (Wave 6C
> recon). In practice, Chrome and Firefox allow same-origin blob: URLs for
> `window.open()` even without explicit CSP coverage. If the popup fails in a
> specific browser, the download fallback is the recovery path.

---

## Validation Complete

All 11 checks passed → deployment is verified healthy.

Record the validation outcome in the release commit message or deployment notes.
