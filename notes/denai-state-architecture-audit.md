S1 — Global Mutable State Object (S)
Purpose: Single source of truth for all patient/clinical data, UI transient flags, and treatment selection. Every render function reads from S directly.
Dependencies: DEFAULT_STATE, loadState(), StateValidator, calcAI(), ClinicalEngine.process(), saveState()
Triggers: setState(), direct Object.assign(S, ...) mutations (at least 14 call sites bypass setState()), switchPatient(), confirmReset(), saveEdit(), applyPreset(), whatIfApply.click
Outputs: All render functions consume S directly. saveState() persists to localStorage. tempState is derived from S at multiple points.
Synchronization Risks:
	•	S is mutated directly via Object.assign in at least: switchPatient, confirmReset, saveEdit, confirmNewPatient, whatIfApply.click, toggleMultiSite, selectTx, applyAIRec, render
	•	setState() validates and diffs but is NOT the exclusive write path — callers bypass it freely
	•	S.editing, S.whyOpen, S.historyOpen are transient UI flags serialized into persistence via saveState() (the editing flag is stripped via destructuring but the strip pattern is fragile: const { editing, whyOpen, historyOpen, ...serializable } = S)
	•	tempState is a shallow copy of S — modifications to tempState that contain object references would alias; currently safe only because all values are primitives
	•	S.id can be undefined in early initialization paths; multiple guards exist but not uniformly
Extraction Risk: CRITICAL — Any module boundary around S requires a complete audit of all 14+ direct mutation sites. Extracting S into its own module without converting all mutations to validated setState() calls will break synchronization deterministically.

S2 — tempState (What-If Preview State)
Purpose: Shadow copy of S used by the What-If Simulator to preview clinical outcomes without committing to S. Prevents simulator changes from persisting until explicit “Apply” action.
Dependencies: S (source at copy time), ClinicalEngine.process(), all render functions
Triggers: applyPreset(), slider input events (debounced via debouncedUpdatePreview()), whatIfApply.click (promotes to S), whatIfReset.click (restores from S), switchPatient() (resets via tempState = { ...S })
Outputs: updatePreview() calls render pipeline with tempState as the state argument — but critically calls renderComparison(tempState, ai), renderCost(tempState, ai), renderComparisonTable(tempState, ai) — these write to shared DOM
Synchronization Risks:
	•	tempState.age is explicitly overwritten to S.age on every updatePreview() call — age is intentionally locked but the lock is implemented via imperative mutation rather than read-only contract
	•	_isPreviewMode flag is set but never read by any render path — it exists only as state for the preview banner visibility. The flag does not gate any behavior
	•	When whatIfApply fires, Object.assign(S, { ... }) selectively copies fields from tempState — the copy is not exhaustive (e.g. tooth, condition, name, tx are NOT copied). If tempState diverges on those fields (impossible currently but fragile), silent drift occurs
	•	_lastSimAI accumulates the previous simulation result for delta display — it is reset to null only on preset application, not on patient switch. If a patient switch occurs mid-simulation, stale delta comparison is possible (mitigated by tempState = { ...S } reset in switchPatient)
	•	The preview banner (previewModeBanner) is shown by updatePreview() and hidden by whatIfApply and whatIfReset — but not by switchPatient(), saveEdit(), or confirmReset(). Banner can persist across state transitions
Extraction Risk: HIGH — tempState interleaves with S writes at whatIfApply. The selective field promotion logic (Object.assign(S, { bone, hygiene, occlusion, smoking, ... })) is a hidden contract: only simulator-controlled fields are promoted. Modularizing either S or tempState without encoding this contract explicitly will cause silent state corruption.

S3 — saveState() / Persistence Layer
Purpose: Serializes S to localStorage within a per-patient record, debounced at 200ms. Also triggers renderPatientList() as a side effect.
Dependencies: S, loadAllPatients(), safeStorageSet(), renderPatientList()
Triggers: setState(), direct S mutations that call saveState() explicitly, clinicalNotes textarea debounce (800ms), whatIfApply
Outputs: localStorage write, renderPatientList() call, showSaveIndicator('saved')
Synchronization Risks:
	•	saveState() calls renderPatientList() — this means any persistence event re-renders the sidebar patient list. If saveState() is called during an in-progress render cycle (e.g., inside render(S) via setState()), a re-entrant sidebar render occurs
	•	The 200ms debounce timer (_saveStateTimer) uses clearTimeout + setTimeout — if saveState() is called more than once within 200ms (common during saveEdit() which calls setState() then saveState() again directly), only the last call persists. This is correct behavior but the double-call pattern in saveEdit() is a hidden timing assumption
	•	The strip pattern const { editing, whyOpen, historyOpen, ...serializable } = S will silently include any new transient flags added to S in the future
	•	_saveStateTimer is module-scoped — no cleanup registration in CleanupRegistry. On pagehide, pending save timers may be abandoned (data loss window of up to 200ms)
Extraction Risk: MEDIUM-HIGH — The renderPatientList() side effect embedded in persistence creates a hidden render trigger. Extracting persistence to its own module requires explicitly modeling this side effect as a callback or event.

S4 — Patient CRUD System
Purpose: Manages the list of patients in localStorage, provides create/read/switch/delete operations, and keeps S synchronized with the active patient.
Dependencies: loadAllPatients(), saveAllPatients(), getActivePatientId(), setActivePatientId(), DEFAULT_STATE, History
Triggers: switchPatient(), confirmNewPatient(), confirmDeletePatient(), initPatients()
Outputs: localStorage writes, S mutation (via Object.assign), renderPatientList(), History.render()
Synchronization Risks:
	•	switchPatient() performs a large Object.assign(S, { ...DEFAULT_STATE, ...target, ... }) — this resets ALL of S including UI flags. The order matters: DEFAULT_STATE baseline, then target overlay, then explicit overrides (editing: false, whyOpen: false, historyOpen: false). If target contains a stale editing: true from a prior session, the explicit override corrects it — but only because the explicit overrides come last
	•	switchPatient() calls showSkeleton('aiCardBody') then defers render(S) via setTimeout(..., 300) — this 300ms gap is a timing assumption that the skeleton will display before the render. If the system is under load and render(S) executes faster than 300ms of DOM settling, the skeleton flash may be skipped
	•	genCaseNum() generates case numbers by counting existing patients — this produces correct sequential numbers only if patients are never deleted and re-added. After a delete + add cycle, case numbers can collide with deleted patient numbers
	•	initPatients() handles migration from a single-patient legacy state — this migration path runs on every cold start, not just first run, but is effectively a no-op when PATIENTS_KEY exists
Extraction Risk: HIGH — switchPatient() is deeply entangled: it mutates S, resets UI elements, calls buildEditForm(), updateSliderPositions(), initClinicalNotes(), History.render(), renderPatientList(), and defers render(S). Extracting any one of these creates an ordering dependency that must be explicitly sequenced.

S5 — History System
Purpose: Per-patient append-only change log, stored in localStorage with a per-patient key. Provides add(), load(), save(), render() operations.
Dependencies: safeStorageSet(), S.id (for scoping), DOM element historyList
Triggers: Every user action that modifies clinical data calls History.add(). History.render() is called from switchPatient() and History.add()
Outputs: localStorage write, DOM update of #historyList
Synchronization Risks:
	•	History.load() and History.save() use S?.id at call time — if called during a patient switch before S.id is updated, entries may be written to the wrong patient’s key
	•	History.render() reads S?.id directly — same race condition applies
	•	The ?.id optional chaining masks the case where S.id is undefined — it falls back to the legacy non-scoped key HISTORY_KEY, silently mixing entries
Extraction Risk: LOW-MEDIUM — Self-contained with a clear API, but has a hidden dependency on S.id being current at call time. Safe to extract if S.id is passed explicitly rather than read from closure.

S6 — StateValidator
Purpose: Runtime validation of S field mutations. Called by setState() before applying patches. Provides schema-based type/range/enum checking.
Dependencies: None (pure)
Triggers: setState() only
Outputs: Validation result objects, showToast() on error (called by setState())
Synchronization Risks:
	•	Validator is bypassed by all direct Object.assign(S, ...) mutations — it is not a true enforcement boundary
	•	setState() partially applies validated fields and silently drops invalid ones — callers receive no structured error return, only a toast side effect
Extraction Risk: LOW — Pure object, no DOM access, no shared state. Safe to extract as-is.

S7 — Multi-Mode State Flags
Purpose: Three mutually exclusive rendering modes controlled by flags in S: single-tooth (default), adjacent multi-tooth (S.multiTooth + S.tooth2), and compound multi-site (S.multiSite + S.site2Tooth). These flags gate which clinical engine path and which render path executes.
Dependencies: S.multiTooth, S.multiSite, S.tooth2, S.site2Tooth, S.activeSite, S.condition, ClinicalEngine.process(), ClinicalEngine.processCompound()
Triggers: toggleMultiSite(), multiToothToggle.click, siteTab1/2.click, switchPatient() (resets both), saveEdit() (resets multiTooth if condition changes)
Outputs: Determines which branch of render() executes, which clinical engine is called, which DOM elements are shown/hidden
Synchronization Risks:
	•	Mutual exclusivity of multiTooth and multiSite is enforced in toggleMultiSite() and multiToothToggle.click but NOT in setState() or loadState() — a persisted state with both true would pass validation
	•	S.activeSite (1 or 2) is only meaningful when S.multiSite is true — it is never reset when multiSite becomes false, leaving stale value. This is currently harmless because render() checks S.multiSite first, but the stale value persists in localStorage
	•	The render() function’s compound branch derives effectiveState by overriding fields from S — this derived state is passed to renderMainPanels() but the SVG highlight calls at the end of render() use the original S.tooth and S.site2Tooth to restore both highlights after renderMainPanels overwrites them. This is a deliberate two-pass pattern and the ordering is load-bearing
	•	tooth2Wrap and abutmentWrap visibility is managed by three separate code paths: multiToothToggle.click, switchPatient(), confirmReset(), saveEdit() — no single canonical function manages this UI state
Extraction Risk: CRITICAL — The mode flags are read by render(), generateReport(), applyAIRec(), selectTx(), renderComparison(), renderCost(), renderComparisonTable(), renderTxCards(). Any extraction that moves mode resolution out of the call site will break the branching logic in all downstream consumers simultaneously.​​​​​​​​​​​​​​​​