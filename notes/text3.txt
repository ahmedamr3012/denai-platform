Architecture Risk Consolidation
This document consolidates the synchronization and orchestration risks identified within the denai clinical platform. It is designed strictly for deterministic preservation, modularization safety planning, and extraction-risk governance.
1. Critical Synchronization Risks
Save-After-Switch Data Corruption
• Description: A saveState() 200ms debounce timer from an old patient's session can fire immediately after a switchPatient() operation completes. The timer callback reads the newly updated S.id but writes the pending payload.
• Why it is dangerous: It actively cross-contaminates patient records, writing the previous patient's state data into the newly loaded patient's persistence entry.
• What can silently break: Patient case files overwrite one another without UI indication, leading to permanent data loss.
• Type of regression: Cross-Record Data Corruption.
• Extraction severity: EXTREME
Preset Apply vs. Slider Debounce Race Condition
• Description: Applying a preset triggers a synchronous updatePreview(). Moving a slider triggers a debounced updatePreview() (120ms). Rapid interaction fires both within the same window.
• Why it is dangerous: The async slider update can overwrite the synchronous preset application, executing a render pass with a stale tempState configuration.
• What can silently break: The simulator UI will display a preset selection but render slider-modified outcomes, disconnecting the visual controls from the active calculations.
• Type of regression: UI State Desynchronization.
• Extraction severity: HIGH
Treatment Card Click Reverted by Preview Timer
• Description: Selecting a treatment card triggers a synchronous render(S). If a slider was moved just prior, a 120ms debounced updatePreview() timer will fire immediately afterward.
• Why it is dangerous: The pending preview timer executes and overwrites all primary DOM panels with tempState data, visually undoing the user's explicit synchronous treatment selection.
• What can silently break: The user's applied state is recorded internally, but the UI reverts to the "What-If" preview state, creating an immediate split-brain state.
• Type of regression: Visual State Overwrite.
• Extraction severity: HIGH
2. Load-Bearing Ordering Contracts
buildAICardStructure Before updateAICard
• Description: Both functions share the same withErrorBoundary closure. The structure builder must execute first to ensure DOM nodes exist for the updater to patch.
• Why it is dangerous: If buildAICardStructure fails and is caught by the boundary, updateAICard correctly never runs. Breaking this grouping exposes the updater to null references.
• What can silently break: The UI will attempt to patch fallback error elements, failing silently due to missing IDs.
• Type of regression: Unhandled Null Reference / Render Halt.
• Extraction severity: CRITICAL
renderTxCards Before updateCrownCardState
• Description: The crown card updater reads specific .classList DOM states that are established directly by the preceding renderTxCards execution.
• Why it is dangerous: The logic depends on DOM reads of previously written UI state within the same render cycle rather than reading from a unified state tree.
• What can silently break: The crown viability warning and selection states will calculate incorrectly based on stale DOM classes.
• Type of regression: DOM-Coupled Logic Failure.
• Extraction severity: HIGH
Two-Pass SVG Compound Highlighting
• Description: During compound mode processing, renderMainPanels executes an SVG highlight pass that is intentionally and load-bearingly overwritten by a second SVG highlight pass executed directly inside render().
• Why it is dangerous: The core sequencing assumes the first pass is disposable for multi-site mode. Extracting renderMainPanels without replicating this post-call overwrite will destroy multi-site visualization.
• What can silently break: The primary and secondary tooth highlights will fail to render simultaneously.
• Type of regression: Visual Orchestration Failure.
• Extraction severity: CRITICAL
3. Hidden Render Side Effects
Persistence-Triggered Sidebar Rendering
• Description: Every successful saveState() debounce (200ms) triggers renderPatientList(), causing a hidden DOM write to the sidebar.
• Why it is dangerous: The render is entirely detached from user interaction. It can fire concurrently with unconnected user tasks, potentially interrupting layout or focus states.
• What can silently break: UI flow is disrupted by spontaneous DOM updates happening as a side-effect of background autosaves.
• Type of regression: Unintended DOM Mutation.
• Extraction severity: MEDIUM
toggleMultiSite Comparison Table Pre-Wipe
• Description: Switching site modes executes a direct _tbody.innerHTML = '' pre-wipe before invoking render(S) and its lazy comparison table observer.
• Why it is dangerous: It relies on the exact timing of the lazy observer to synchronously re-populate visible tables. If deferred, it creates an empty UI flash.
• What can silently break: The table flashes empty sub-millisecond if visible, or remains entirely blank if offscreen until an intersection event fires.
• Type of regression: Rendering Flash / Layout Shift.
• Extraction severity: LOW
Stale Multi-Site Tab Labels
• Description: Enabling multi-site mode renders compound content but skips calling updateSiteTabUI(), leaving the UI tabs with static HTML labels.
• Why it is dangerous: The system relies on the user's first actual tab click to invoke switchSite(), which is the only place the labels are properly normalized.
• What can silently break: Tabs display incorrect or generic labels (e.g., "Site 1" instead of the assigned tooth number) upon multi-site initialization.
• Type of regression: Stale View Generation.
• Extraction severity: LOW
4. Shared Async Ownership Risks
Typewriter Singleton Timer Collisions
• Description: The AI recommendation text animation uses a module-scoped setInterval that is unconditionally cleared and restarted upon any render call.
• Why it is dangerous: Rapid, unconnected render cycles (e.g., triggered by background saves) will continuously abort the typewriter, restarting it from an empty string.
• What can silently break: The AI reasoning text never finishes animating and appears constantly broken or frozen to the user.
• Type of regression: Asynchronous Execution Stutter.
• Extraction severity: MEDIUM
Material Fade Window Erasure
• Description: renderMaterial uses a 160ms setTimeout. Rapid render entries cancel the prior timer, enforcing only the last scheduled execution.
• Why it is dangerous: Canceling the prior timer means the DOM retains the older material string for an up to 160ms window until the final timer resolves.
• What can silently break: The user sees a split-brain UI where the primary treatment reflects the new state, but the material indicates the previous patient's requirement.
• Type of regression: Temporary Visual Desync.
• Extraction severity: MEDIUM
Orphaned Report Restore Timer
• Description: The 800ms button restoration timer in generateReport is instantiated via a plain setTimeout rather than the managed CleanupRegistry.
• Why it is dangerous: On pagehide or rapid navigation, the registry clears managed timers, but this orphaned timer fires against a destroyed DOM context.
• What can silently break: Memory leaks and null reference exceptions occur in the background if the user navigates away after clicking the report button.
• Type of regression: Memory Leak / Unhandled Exception.
• Extraction severity: LOW
5. Re-Entrant Render Risks
Debounced Render Error Propagation
• Description: The renderPatientList() call inside the 200ms save debounce lacks an error boundary.
• Why it is dangerous: If DOM lookup fails (e.g., the sidebar was hidden or unmounted), the exception is swallowed silently by the browser's macro-task queue.
• What can silently break: All subsequent sidebar updates halt without logging or error UI fallback.
• Type of regression: Silent Sub-system Failure.
• Extraction severity: MEDIUM
Unintended Timer Restarts on Debounced Render
• Description: Non-UI interactions (like the notes 800ms autosave triggering saveState()) cause a full render(S) sequence if a state variable was manipulated.
• Why it is dangerous: This background update inadvertently restarts all async visual systems (typewriter, material fade) without any visual trigger from the user.
• What can silently break: Reading experiences are interrupted, and visually completed components revert to loading/animating states.
• Type of regression: Unwarranted Animation Loop.
• Extraction severity: MEDIUM
6. Persistence Timing Hazards
Implicit Read-After-Write State Invariant
• Description: The saveState timer captures the reference to S at the time of firing (200ms later), not at the time of scheduling.
• Why it is dangerous: Any subsequent state mutations happening within that 200ms window are automatically bundled into the persistence payload, breaking explicit save checkpoints.
• What can silently break: "Undesired" transient state changes that occur just before a timer fires are written to the database unexpectedly.
• Type of regression: State Payload Corruption.
• Extraction severity: HIGH
Synchronous Storage vs. Deferred Render
• Description: switchPatient() updates localStorage instantly but defers the DOM render(S) update by 300ms.
• Why it is dangerous: If the application process ends during the 300ms gap, the user's active patient is successfully switched, but the application state dies midway.
• What can silently break: The persistence layer is completely safe, but the runtime lifecycle orchestrator leaves execution suspended.
• Type of regression: Execution Desync.
• Extraction severity: LOW
URL Revoke vs. Blocked Download Race
• Description: The report generator revokes the Blob URL 1200ms after creation, assuming programmatic fallback downloads complete instantly.
• Why it is dangerous: Browser security prompts or slow local file system allocations take longer than 1200ms, resulting in the download querying a revoked memory address.
• What can silently break: The user clicks download, the browser initiates the file save, but the file fails to download with a "Network Error".
• Type of regression: Silent Export Failure.
• Extraction severity: MEDIUM
7. Mixed DOM State Windows
300ms Patient Switch Identity Gap
• Description: During the 300ms deferred render window in switchPatient(), the UI shows a skeleton AI card, new notes, new sliders, and new history, but retains the old patient's cost, info, and comparison graphs.
• Why it is dangerous: It presents clinical data spanning two entirely different patients on the same screen simultaneously.
• What can silently break: A clinician viewing the screen during this window sees an invalid composite patient, potentially leading to incorrect clinical assumptions.
• Type of regression: Clinical Misrepresentation.
• Extraction severity: CRITICAL
Multi-Site Banner Empty Flash
• Description: The compoundBanner display style is mutated to flex immediately on toggle, but content is generated synchronously later by renderCompoundSummary().
• Why it is dangerous: It assumes JavaScript's single-threaded nature will prevent paint between the operations, which is historically brittle.
• What can silently break: Minor sub-millisecond layout shifting occurs as the banner bounds snap into place.
• Type of regression: Layout Shift.
• Extraction severity: LOW
Stale Preview Banner Retention
• Description: switchPatient() does not reset the #previewModeBanner visibility state.
• Why it is dangerous: If the simulator banner is active on Patient A, switching to Patient B retains the banner with Patient A's text.
• What can silently break: The application asserts the current system is in What-If preview mode for Patient B, despite no simulation values being applied.
• Type of regression: Stale UI State / Context Bleed.
• Extraction severity: HIGH
8. Stale Closure / Observer Risks
Lazy Comparison Table Observer Closure Trap
• Description: The lazyRenderComparisonTable intersection observer captures state and ai variables via closure at creation time.
• Why it is dangerous: If the user modifies state but doesn't trigger a new render that updates the observer, scrolling the table into view fires a render using the outdated captured state.
• What can silently break: The comparison table renders completely accurate data for a historical application state, disagreeing with the primary recommendation UI.
• Type of regression: Out-of-Sync DOM Component.
• Extraction severity: HIGH
History ID Scope Race Condition
• Description: History.load reads S.id at call time within closures, rather than capturing the relevant ID upon function initialization.
• Why it is dangerous: If called during a cross-patient transition before the new ID is strictly applied, it logs the interaction to the incorrect patient's ledger.
• What can silently break: Clinical history logs bleed into the wrong patient profile, creating a compliance and audit trail issue.
• Type of regression: Cross-Record Data Leakage.
• Extraction severity: CRITICAL
Clinical Notes Input Listener Binding
• Description: The notes textarea bound listener evaluates S.id at event time. If a patient swap occurred while typing, it triggers a silent abort.
• Why it is dangerous: The user continues typing into the UI, but the background validation drops the keystrokes because the captured patient ID no longer matches the active instance.
• What can silently break: The UI reflects the typed text, but the autosave fails silently, destroying the clinical note upon refresh.
• Type of regression: Silent Data Loss.
• Extraction severity: HIGH
9. Silent Data Corruption Risks
Direct Object.assign Mutation Bypasses
• Description: S is mutated directly via Object.assign in over 14 distinct locations, bypassing setState(), StateValidator, and state diffing completely.
• Why it is dangerous: The application claims deterministic state validation, but the majority of state transitions bypass the enforcement perimeter entirely.
• What can silently break: Invalid clinical values (e.g., negative ages, invalid tooth numbers) can be committed to the state machine directly.
• Type of regression: State Schema Violation.
• Extraction severity: EXTREME
Transient UI Flag Serialization
• Description: The const { editing, ...serializable } = S destructing pattern explicitly targets known transient UI flags for removal before persistence.
• Why it is dangerous: It functions as a blocklist rather than an allowlist. Any new transient UI state added to S is automatically and silently written to localStorage.
• What can silently break: Application state inflates indefinitely with session-specific DOM state, leading to broken initializations on reload (e.g., historyOpen: true).
• Type of regression: State Bloat / Broken Initialization.
• Extraction severity: HIGH
tempState Selective Promotion Contract
• Description: whatIfApply explicitly maps specific fields (bone, hygiene, etc.) from tempState to S, ignoring base data (tooth, age, name).
• Why it is dangerous: This is an undocumented hard-mapping. If tempState logic evolves to alter fields not included in this static mapping, the modifications are silently lost on application.
• What can silently break: A new simulator feature visually computes correctly but silently fails to persist when the user clicks Apply.
• Type of regression: Feature Data Loss.
• Extraction severity: HIGH
Case Number Duplication Collisions
• Description: genCaseNum determines the next patient case number by evaluating the total array length of the patient list.
• Why it is dangerous: If a user deletes Patient #5 and creates a new patient, the new patient receives the colliding Case #5 designation.
• What can silently break: Case IDs lose uniqueness, destroying the ability to uniquely map clinical data logically by ID outside the system.
• Type of regression: Primary Key Collision.
• Extraction severity: MEDIUM
10. Dangerous Extraction Zones
StateValidator Bypass Paths (S1)
• Description: Attempting to extract the global mutable S without fully standardizing the 14+ rogue mutation paths.
• Why it is dangerous: It will break orchestration determinism immediately; external modules depend on the precise order of these raw mutations prior to calling asynchronous render updates.
• What can silently break: UI synchronization halts entirely.
• Type of regression: Core Orchestration Failure.
• Extraction severity: EXTREME
tempState Promotion Mapping (S2)
• Description: Moving the simulator logic without strictly porting the selective field promotion logic embedded directly inside the whatIfApply click handler.
• Why it is dangerous: It severs the unstated relationship between what the simulator manages and what the base state allows it to override.
• What can silently break: Core patient metadata (name, case ID) gets overwritten by the simulator proxy state.
• Type of regression: State Overwrite.
• Extraction severity: HIGH
Multi-Site DOM Resets (S7)
• Description: Disentangling toggleMultiSite without addressing the scattered DOM manipulation targets (tooth2Wrap, abutmentWrap) managed across four different modules.
• Why it is dangerous: The UI branching rules for Multi-Tooth vs Multi-Site are interdependent but physically separated in the codebase.
• What can silently break: Users are allowed to toggle both multi-tooth and multi-site simultaneously, breaking clinical calculation logic.
• Type of regression: Logical Mode Conflict.
• Extraction severity: CRITICAL
11. Systems That Must NOT Be Modularized Early
Global Mutable State Object (S)
• Description: The absolute core of the data model. Contains deep implicit dependencies, unvalidated write paths, and interleaved UI/Data storage parameters.
• Why it is dangerous: Extracting it early forces every component to adopt a generic interface that cannot currently handle the synchronous/asynchronous nuances of the current bypass patterns.
• What can silently break: Race conditions multiply instantly across persistence, rendering, and calculation chains.
• Type of regression: Complete System Destabilization.
• Extraction severity: EXTREME
Multi-Mode State Flags (S7)
• Description: The orchestrator of single-tooth, adjacent multi-tooth, and compound multi-site logic.
• Why it is dangerous: The routing behavior embedded here is load-bearing for render(), generateReport(), and calcAI(). It represents fundamental business logic tightly coupled to view generation.
• What can silently break: The AI calculation pipeline receives invalid state schemas because the mode normalization failed to route correctly.
• Type of regression: Fatal Calculation Error.
• Extraction severity: CRITICAL
Patient CRUD Subsystem (S4)
• Description: The switchPatient() method handles deeply interleaved DOM resets, deferred timer executions, asynchronous memory invalidation, and strict-order overrides.
• Why it is dangerous: It manually clears out exact visual subsystems before orchestrating the state transfer. Disconnecting this tears down the safety buffers preventing cross-patient state bleeding.
• What can silently break: The application attempts to calculate AI on a merged state containing elements of multiple patients.
• Type of regression: Irrecoverable Corrupted State.
• Extraction severity: HIGH
12. Systems Requiring Explicit Sequencing During Extraction
AI Card Error Boundary Updates
• Description: buildAICardStructure() conditionally patches the DOM structure and MUST successfully execute before updateAICard() fires.
• Why it is dangerous: If separated into asynchronous modules, the UI patch cycle will attempt DOM manipulations using innerHTML overwrites simultaneously with deep nested selector operations.
• What can silently break: The AI recommendation renders empty data nodes silently.
• Type of regression: Visual Void Generation.
• Extraction severity: HIGH
Persistence Side-Effects Sequence
• Description: saveState() mandates a hidden DOM update trigger to renderPatientList() upon completion.
• Why it is dangerous: It relies on side-effect orchestration to maintain UI fidelity.
• What can silently break: The patient sidebar list stops updating entirely when treatments are saved.
• Type of regression: Desynchronized Visual List.
• Extraction severity: MEDIUM
Two-Pass SVG Highlight Architecture
• Description: renderMainPanels calculates compound highlights, which are immediately and purposely overwritten by the parent render loop.
• Why it is dangerous: The deliberate redundancy is the backbone of the visual component architecture in compound mode.
• What can silently break: Compound multi-tooth visualizations collapse to a single site representation.
• Type of regression: Broken Graphical Render.
• Extraction severity: CRITICAL