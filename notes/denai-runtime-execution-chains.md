
Chain 1 — Recommendation Generation Flow
Trigger source: Any call to render(S) — which is itself triggered by treatment selection, edit save, preset apply, patient switch, mode toggle, or simulator apply.
Full execution sequence:
render(state)
  │
  ├─ [BRANCH: S.multiSite && S.site2Tooth]
  │     ClinicalEngine.processCompound(state)
  │       ├─ ClinicalEngine.process(site1State)   ← full 7-stage pipeline
  │       └─ ClinicalEngine.process(site2State)   ← full 7-stage pipeline
  │     renderCompoundSummary(compound, state)     ← DOM write: #compoundSummaryBody
  │     derive effectiveState (site-specific override of S)
  │     renderMainPanels(effectiveState, ai)
  │
  ├─ [BRANCH: default]
  │     ClinicalEngine.process(state)
  │       ├─ [MISSING_SINGLE] → calcAI(state)
  │       ├─ [MISSING_MULTI]  → calcAIMulti(state)
  │       └─ [RESTORATIVE]    → normalize → classify → generateTreatments
  │                             → scoreRestorative → recommend → explain
  │                             → buildRestorativeResult → wraps calcAI result
  │     renderMainPanels(state, ai)
  │
  └─ renderMainPanels(state, ai)
        │
        ├─ withErrorBoundary(renderPatientDisplay, 'infoDisplay')
        │     └─ writes innerHTML of #infoDisplay
        │
        ├─ withErrorBoundary(() => {
        │     renderTxCards(ai)          ← DOM writes to all 3 opt-cards
        │     buildAICardStructure()     ← conditional innerHTML replace of #aiCardBody
        │     updateAICard(ai) OR updateAICardMulti(ai)
        │       ├─ typewriterEffect(recText, recStr, 30)
        │       │     └─ clearInterval(_typewriterTimer)
        │       │        new setInterval → appends chars every 30ms
        │       │        [TIMER: ongoing, not awaited]
        │       ├─ sets ring SVG attributes (stroke-dashoffset)
        │       ├─ animateNumber('successVal', ...)
        │       ├─ toggles #caseClassBadge visibility + content
        │       └─ sets/hides #recTopReason
        │     renderRisk(ai)             ← DOM writes to risk rows
        │     renderReasons(ai.reasons)  ← innerHTML of #reasonsList
        │  }, 'aiCardBody')
        │
        ├─ withErrorBoundary(renderComparison(state, ai), 'compInlineTable')
        │     └─ DOM writes to cImplant/cBridge/cCrown cells
        │
        ├─ withErrorBoundary(renderMaterial(state), 'matPrimary')
        │     └─ clears _matFadeTimer
        │        sets new setTimeout(..., 160) [TIMER: 160ms]
        │        on fire: writes innerHTML of #matPrimary + #matAlt
        │
        ├─ withErrorBoundary(() => { renderCost(state, ai); renderGraph(ai); }, 'costContainer')
        │     ├─ renderCost: writes innerHTML of #costContainer
        │     └─ renderGraph: creates or mutates SVG elements in #graphContainer
        │
        ├─ withErrorBoundary(lazyRenderComparisonTable(state, ai), 'comparisonTableBody')
        │     ├─ [BRANCH: element already visible]
        │     │     renderComparisonTable(state, ai) ← synchronous
        │     │       └─ writes innerHTML of #comparisonTableBody
        │     └─ [BRANCH: element offscreen]
        │           _compTableObserver.disconnect() on prior observer
        │           new IntersectionObserver → renderComparisonTable on visibility
        │           [TIMER: async, fires when element scrolls into view]
        │
        └─ SVG highlight pass
              updateToothHighlight(state.tooth)
              updateToothHighlight2(secondTooth or null)

State mutations: None during recommendation generation. ClinicalEngine.process() and calcAI() are pure — they read from state argument, not from S directly.
Persistence calls: None during render itself.
Timing-sensitive operations:
	•	typewriterEffect uses _typewriterTimer (setInterval, 30ms ticks). It is a module-scoped singleton. Any subsequent call to typewriterEffect before the previous completes cancels the in-progress animation and starts fresh. If render(S) is called twice in rapid succession (e.g., treatment select triggers render, then notes autosave debounce also triggers render 800ms later), the typewriter restarts from empty on the second call. The first render’s typed-in-progress text is destroyed.
	•	_matFadeTimer (160ms) inside renderMaterial(). The FIX#6 guard cancels the prior timer on re-entry. However, if two renderMaterial() calls occur with less than 160ms between them (possible during preview vs apply sequence), only the second timer fires. The first material DOM state is wiped by the second. This is the intended behavior but creates a 160ms window where material DOM shows the previous patient’s/state’s material until the timer fires.
	•	lazyRenderComparisonTable with IntersectionObserver: the observer is stored in _compTableObserver. It is disconnected on every new render call. This means if the user scrolls the comparison section into view, an observer fires renderComparisonTable() — but if a subsequent render(S) fires before the observer callback executes, the new observer is set up and the old one is disconnected. The comparison table may render with stale state/ai arguments from the observer closure. The observer captures state and ai at creation time via closure — these are the values at the time lazyRenderComparisonTable was called, not at the time the observer fires. If S mutates between observer creation and observer fire, the fired render uses the older state/ai snapshot while all other panels show the newer state.
Hidden render side effects:
	•	buildAICardStructure() checks body.dataset.built === '1' and skips rebuild. This means the AI card DOM structure is built once and patched on subsequent renders. If a prior render left a partial DOM state (e.g., from a withErrorBoundary recovery that replaced innerHTML with the error fallback), subsequent renders will try to patch elements that no longer exist. The $() calls inside updateAICard() will return null silently and the render will be a no-op, leaving the error fallback visible indefinitely.
	•	withErrorBoundary on failure replaces containerId‘s innerHTML with an error card. Subsequent render calls will attempt to update child elements of that container by ID — those elements no longer exist inside the card (they’re in the error fallback). $() lookups return null, writes are silently skipped. The error fallback persists until a full buildAICardStructure(true) force-rebuild.
Re-entrant render risks:
	•	renderMainPanels calls are synchronous but typewriterEffect and _matFadeTimer continue asynchronously after renderMainPanels returns. A second render(S) call from a debounce (e.g., 200ms saveState() → renderPatientList(), or 800ms notes autosave → saveState() → deferred renderPatientList()) does NOT re-invoke renderMainPanels — renderPatientList() only updates sidebar DOM. However, if that second render(S) IS triggered (e.g., by a setState() inside a debounce callback), the typewriter and material timers from the first render are cancelled and restarted.
Load-bearing ordering assumptions:
	1.	buildAICardStructure() must execute before updateAICard() in the same withErrorBoundary block. They share the same closure — if buildAICardStructure() throws and is caught by withErrorBoundary, updateAICard() never runs.
	2.	renderTxCards(ai) must execute before updateCrownCardState(ai, isCrn) (called inside the default renderTxCards path) because updateCrownCardState reads .classList state set by renderTxCards.
	3.	The SVG highlight pass at the end of renderMainPanels runs AFTER all panel renders. In compound mode, render() calls renderMainPanels(effectiveState, ai) which calls updateToothHighlight(effectiveState.tooth) — then render() calls updateToothHighlight(primaryTooth) and updateToothHighlight2(secondaryTooth) directly. This second pass overwrites the SVG state set inside renderMainPanels. This is the deliberate two-pass pattern for compound mode. If renderMainPanels is ever extracted independently, this post-call override must be preserved.

Chain 2 — Treatment Selection Flow
Sub-chain 2A — Card Click
Trigger: .opt-card click → selectTx(option)
selectTx(option)
  │
  ├─ [BRANCH: S.multiTooth]
  │     S.tx = option          ← direct mutation, bypasses setState()
  │     saveState()            ← 200ms debounced persist
  │     render(S)              ← synchronous full render
  │     return                 ← [early exit, no History.add, no toast here]
  │     ← MISSING: no History.add, no toast in this branch
  │
  ├─ [BRANCH: option === 'crown']
  │     ai = calcAI(S)         ← full AI recomputation (not cached)
  │     if (!ai || !ai.crownViable):
  │       showToast(ai?.crownWarning || '...', 'error')
  │       return               ← [early exit, no state change]
  │
  ├─ setState({ tx: option })
  │     StateValidator.validate('tx', option)
  │     S.tx = option          ← mutation inside setState
  │     saveState()            ← 200ms debounced → schedules renderPatientList in 200ms
  │     [StateDiffs.push diff] ← side effect inside setState
  │
  ├─ render(S)                 ← synchronous full render
  │     [all panels updated]
  │
  ├─ History.add('Treatment selected', labels[option])
  │     History.load(S.id)
  │     list.push(entry)
  │     History.save(list, S.id)  ← safeStorageSet, synchronous
  │     History.render()          ← DOM write to #historyList
  │
  └─ showToast(...)

Timing-sensitive operation: The saveState() inside setState() schedules a 200ms debounced renderPatientList() + persistence write. Then render(S) executes synchronously. Then History.render() executes synchronously. Approximately 200ms later, renderPatientList() fires as a hidden sidebar re-render. This sidebar re-render is the second DOM mutation in this chain and occurs completely detached from the user action.
State mutations: S.tx via setState(). StateDiffs appended.
Stale DOM risk: Crown viability check in the 'crown' branch calls calcAI(S) — a full recomputation. This result is thrown away after the guard check. The crown viability at render time (inside render(S)) is recomputed by ClinicalEngine.process(S). Both computations should produce the same result given identical S, but they are separate executions. If S were mutated between the guard call and the render(S) call, the guard result could differ from the render result. Currently S is not mutated between these two calls in this branch.
Mutation-before-render assumption: setState({ tx: option }) mutates S.tx BEFORE render(S) is called. render(S) reads S.tx to determine which treatment card is active. If this ordering were reversed, render(S) would show the previous selection.
Hidden render side effect: renderComparison(state, ai) inside render(S) calls renderComparisonTable(state, ai) via lazyRenderComparisonTable. The comparison table highlights the active treatment column. This column highlight depends on state.tx — which was just mutated. The lazyRenderComparisonTable observer captured at prior render time carries a stale state.tx in its closure. When the comparison table re-renders (via observer), it will use the new state argument passed to lazyRenderComparisonTable in this render call. This is correct because _compTableObserver.disconnect() is called first, dropping the old closure.
Sub-chain 2B — AI Banner Apply
Trigger: #recBanner.click → applyAIRec()

applyAIRec()
  │
  ├─ [BRANCH: S.multiTooth && S.tooth2 && S.condition === 'Missing tooth']
  │     ai = calcAIMulti(S)     ← NOT via ClinicalEngine.process()
  │     ← note: uses calcAIMulti directly, bypassing ClinicalEngine routing
  │
  ├─ [BRANCH: S.multiSite && S.site2Tooth]
  │     compound = ClinicalEngine.processCompound(S)
  │     ai = compound[activeSite === 2 ? 'site2' : 'site1']
  │
  ├─ [BRANCH: default]
  │     ai = ClinicalEngine.process(S)
  │
  ├─ MULTI_TO_SINGLE map: { implant2→'implant', bridge4→'bridge', cantilever→'crown' }
  │     recTx = MULTI_TO_SINGLE[ai.rec] || ai.rec
  │
  ├─ [GUARD: !ai || recTx === S.tx] → return (no-op, no feedback)
  │
  ├─ [GUARD: !ai.isMultiTooth && recTx === 'crown' && !ai.crownViable]
  │     showToast(..., 'error'); return
  │
  ├─ S.tx = recTx              ← direct mutation, bypasses setState()
  ├─ saveState()               ← 200ms debounced
  ├─ render(S)                 ← synchronous full render
  ├─ History.add(...)
  └─ showToast(...)

Hidden coupling risk: In the multi-tooth branch, applyAIRec() calls calcAIMulti(S) directly, bypassing ClinicalEngine.process(). The MULTI_TO_SINGLE mapping then converts the multi-tooth rec key. If ClinicalEngine.process() were updated to change the multi-tooth recommendation API without updating applyAIRec(), this branch would silently use stale logic.
Mutation-before-render assumption: S.tx = recTx is a direct mutation (bypasses setState()). This means the StateValidator, StateDiffs tracking, and showSaveIndicator('saving') are all bypassed. The saveState() call is direct (not via setState()), so showSaveIndicator inside saveState() is called. However StateDiffs never records this change.

Chain 3 — Patient Switching Flow
Trigger: switchPatient(id) from sidebar patient list click

switchPatient(id)
  │
  ├─ [GUARD: id === S.id] → closeSidebar (mobile); return
  │
  ├─ list = loadAllPatients()       ← localStorage read
  ├─ target = list.find(id)
  ├─ [GUARD: !target] → return
  │
  ├─ [GUARD: S.editing] → cancelEdit()
  │     exitEdit()
  │       S.editing = false         ← mutation [immediately overwritten at step below]
  │       DOM: editBtn text reset, editFields hidden, infoDisplay shown
  │       window.removeEventListener('beforeunload', ...)
  │
  ├─ Object.assign(S, {             ← FULL S REPLACEMENT
  │     ...DEFAULT_STATE,           ← baseline defaults
  │     ...target,                  ← patient data overlay
  │     editing: false,             ← explicit transient reset
  │     whyOpen: false,
  │     historyOpen: false
  │   })
  │   ← S.editing set to false TWICE if editing was true (cancelEdit + this)
  │   ← ALL previously queued saveState() debounces still pending for OLD S.id
  │
  ├─ [Normalize multi-site/tooth flags in S]
  │     if (S.multiSite && S.condition !== 'Missing tooth'): S.multiSite = false
  │     if (S.multiTooth && S.condition !== 'Missing tooth'): S.multiTooth = false; S.tooth2 = null
  │
  ├─ DOM resets (synchronous):
  │     multiToothToggle.classList.remove('active')
  │     multiToothToggle.setAttribute('aria-pressed','false')
  │     tooth2Wrap.style.display = 'none'
  │     abutmentWrap.style.display = 'none'
  │     multiSiteToggle.classList.remove('active') / setAttribute
  │     site2Wrap.style.display = 'none'
  │     siteTabsWrap.style.display = 'none'
  │     compoundBanner.style.display = 'none'
  │   ← These DOM resets are NOT conditional on prior state of S.multiSite / S.multiTooth
  │   ← They always execute, even if neither mode was active
  │
  ├─ tempState = { ...S }           ← shadow copy from new patient state
  │
  ├─ setActivePatientId(id)         ← localStorage.setItem (synchronous)
  │
  ├─ showSkeleton('aiCardBody')     ← innerHTML replace of #aiCardBody with skeleton
  │     el.setAttribute('aria-busy','true')
  │     ← dataset.built is NOT set → buildAICardStructure() will rebuild on next render
  │
  ├─ buildEditForm()                ← innerHTML replace of #editFields
  │     ← reads from new S values
  │
  ├─ updateSliderPositions()        ← writes to all slider DOM values/labels
  │     ← reads from tempState (which equals new S at this point)
  │
  ├─ initClinicalNotes()
  │     textarea.value = S.notes    ← DOM write
  │     ← input event listener bound only once (_notesInputBound guard)
  │     ← listener closure over _notePatient will use S.id at event time, not bind time
  │
  ├─ History.render()               ← DOM write to #historyList
  │     History.load(S.id)          ← reads new S.id, correct patient history
  │
  ├─ setTimeout(() => {             ← [DEFERRED 300ms]
  │     render(S)                   ← full render with new patient state
  │       buildAICardStructure()    ← rebuilds (dataset.built not set by skeleton)
  │       all panel renders...
  │     showToast(`Switched to ${S.name}`, 'info')
  │   }, 300)
  │
  ├─ renderPatientList()            ← synchronous sidebar update
  │     ← highlights new active patient
  │     ← executes BEFORE deferred render
  │     ← calls _quickScore(p) per patient (lightweight, reads from list not S)
  │
  ├─ (mobile) closeSidebar()
  │
  └─ DOM: .case-num textContent = S.caseNum


Critical timing gap (300ms window):
Between showSkeleton() and the deferred render(S), the following DOM state exists simultaneously:
	•	#aiCardBody shows skeleton (correct — new patient loading)
	•	#infoDisplay shows OLD patient data (not yet updated — renderPatientDisplay() hasn’t run)
	•	#costContainer, #graphContainer, #compInlineTable show OLD patient data
	•	#historyList shows NEW patient history (updated at step History.render())
	•	#patientList shows NEW active patient highlighted (updated at step renderPatientList())
	•	Sliders show NEW patient values (updated at step updateSliderPositions())
	•	Clinical notes textarea shows NEW patient notes
This is a mixed DOM state: some panels old, some new. The 300ms gap is the window during which this inconsistency exists and is visible to the user.
Re-entrant render risk: Any debounced timer from the previous patient’s operations that fires within this 300ms window will reference the OLD patient’s state. The saveState() debounce from the previous patient’s last edit (200ms) may still be pending. When it fires, it reads S — which now contains the NEW patient’s data — and writes it to the NEW patient’s record. This is data corruption: the previous patient’s last unsaved change is lost, and the new patient’s record gets updated unnecessarily.
Persistence-before-render assumption: setActivePatientId(id) (localStorage write) occurs synchronously BEFORE the deferred render(S). This means if the page is closed during the 300ms window, the active patient is already switched in storage, but the deferred render never completes. On reload, the new patient is loaded correctly. This is safe.
Preview banner stale DOM risk: The #previewModeBanner is not reset in switchPatient(). If the user had the simulator in preview mode (banner visible) on patient A, then switches to patient B, the preview banner persists on patient B’s view. The banner text refers to patient A’s preview state. This is a stale DOM element that persists across patient switches.
Hidden ordering contract: buildEditForm() must execute BEFORE updateSliderPositions(). buildEditForm() rebuilds #editFields innerHTML including the slider elements (#whatIfBone, #whatIfHygiene, etc.). However sliders are in #whatIfContainer which is in Card 3, not in #editFields. updateSliderPositions() writes to slider elements that are always present in the DOM (not rebuilt by buildEditForm()). The ordering constraint is actually between Object.assign(S, ...) (step 4) and updateSliderPositions() (step 12) — sliders must read from the new S values. This constraint is satisfied but implicit.


Chain 4 — What-If Simulator Flow
Sub-chain 4A — Slider Preview (Debounced)
Trigger: Slider input event

slider.input event
  │
  └─ debouncedUpdatePreview()
       CleanupRegistry.timer(updatePreview, 120)
         ← cancels prior pending timer
         ← schedules new 120ms timer
         ← if >100 pending timers: evicts oldest (may cancel unrelated timers)
         ← [TIMER: 120ms]

updatePreview() [fires after 120ms idle]
  │
  ├─ tempState.age = S.age           ← direct mutation of tempState (age lock)
  │
  ├─ ai = ClinicalEngine.process(tempState)
  │     ← pure computation on tempState
  │     ← does NOT read from S
  │
  ├─ [Delta computation]
  │     newScore = ai.treatmentMode === 'restorative'
  │       ? ai.scored.find(slot='bridge').score   ← hardcoded to 'bridge' slot for delta
  │       : ai.implant
  │     if _lastSimAI:
  │       delta = newScore - _lastSimAI._previewScore
  │       if |delta| >= 0.5: showToast(...)
  │     ai._previewScore = newScore   ← mutates ai object (returned from process())
  │     _lastSimAI = ai
  │
  ├─ _isPreviewMode = true            ← set, never read by render logic
  │
  ├─ buildAICardStructure()           ← checks dataset.built === '1' → NO-OP (already built)
  │
  ├─ if (ai.isMultiTooth): updateAICardMulti(ai)
  │   else: updateAICard(ai)
  │     ├─ typewriterEffect(recText, recStr, 30)
  │     │     clearInterval(_typewriterTimer)
  │     │     new setInterval → ongoing async text animation
  │     └─ all metric/ring/badge DOM writes
  │
  ├─ renderRisk(ai)                   ← DOM write
  ├─ renderReasons(ai.reasons, ...)   ← DOM write: innerHTML of #reasonsList
  ├─ renderComparison(tempState, ai)  ← DOM write: comparison cells
  ├─ renderMaterial(tempState)
  │     clearTimeout(_matFadeTimer)   ← cancels prior material fade timer
  │     new setTimeout(..., 160)      ← [TIMER: 160ms]
  │       on fire: innerHTML of #matPrimary, #matAlt
  │
  ├─ renderCost(tempState, ai)        ← DOM write: innerHTML of #costContainer
  ├─ renderGraph(ai)                  ← SVG attribute mutations
  ├─ renderComparisonTable(tempState, ai)  ← synchronous (NOT lazy) ← [NOTE]
  │     ← bypasses lazyRenderComparisonTable
  │     ← always writes #comparisonTableBody directly
  │     ← uses tempState.tx for column highlighting
  │
  └─ previewModeBanner.style.display = 'flex'

Stale DOM risk from treatment card click during preview: If the user moves a slider (schedules 120ms debounce) and then immediately clicks a treatment card (triggers selectTx() → render(S) synchronously), render(S) completes and the DOM shows S data. Then 120ms later, updatePreview() fires and overwrites ALL panels with tempState data. The DOM reverts to preview state after a synchronous treatment selection. The user sees their treatment click undone visually.
Delta computation hardcoded slot: The delta base score uses ai.scored.find(t=>t.slot==='bridge')?.score for restorative mode — hardcoded to the ‘bridge’ slot regardless of which slot is selected or recommended. This means the delta shown in the toast may not correspond to the recommended option’s score change.
renderComparisonTable bypass of lazy loading: Inside updatePreview(), renderComparisonTable(tempState, ai) is called directly (not via lazyRenderComparisonTable). This means during preview, the comparison table always renders synchronously regardless of visibility. This is a different behavior than the normal render(S) path which uses the lazy observer. The inconsistency means the comparison table is always up-to-date during preview but may show the lazy observer’s last snapshot during normal renders.
Sub-chain 4B — Preset Apply
Trigger: #presetBest, #presetAvg, #presetRisk, or #presetCrown click

applyPreset(key)
  │
  ├─ p = PRESETS[key]
  ├─ Object.assign(tempState, {         ← direct tempState mutation
  │     bone: p.bone,
  │     hygiene: p.hygiene,
  │     occlusion: p.occlusion,
  │     smoking: p.smoking,
  │     diabetes: p.diabetes || tempState.diabetes || 'None',
  │     remainingStructure: p.remainingStructure || tempState.remainingStructure || 'Good',
  │     endodonticStatus: p.endodonticStatus || tempState.endodonticStatus || 'No RCT needed',
  │     parafunction: p.parafunction || 'None'
  │   })
  │   ← NOTE: p.remainingStructure uses || not conditional assignment
  │   ← if preset key has no remainingStructure (all 4 do), tempState value preserved
  ├─ tempState.age = S.age             ← age lock re-applied
  ├─ _lastSimAI = null                 ← delta reset
  ├─ updateSliderPositions()           ← DOM writes to all sliders
  └─ updatePreview()                   ← synchronous call, NOT debounced
        ← full preview render pass (see Sub-chain 4A above, same execution)
        ← does NOT go through 120ms debounce

Synchronization risk: applyPreset() calls updatePreview() directly (not via debouncedUpdatePreview()). If a slider input event fires at the same time (rapid interaction), both the debounced updatePreview() (from slider) and the synchronous updatePreview() (from preset) may execute within 120ms of each other. The debounced one fires 120ms after the slider event, potentially overwriting the preset’s preview render with a slider-modified tempState.
Sub-chain 4C — Apply to Case
Trigger: #whatIfApply.click

whatIfApply.click
  │
  ├─ prevAI = calcAI(S)               ← reads CURRENT S (before mutation)
  │     ← NOT via ClinicalEngine.process — uses calcAI directly
  │     ← restorative mode: prevAI uses calcAI not the 7-stage pipeline
  │
  ├─ Object.assign(S, {               ← SELECTIVE promotion from tempState to S
  │     bone:               tempState.bone,
  │     diabetes:           tempState.diabetes || S.diabetes || 'None',
  │     hygiene:            tempState.hygiene,
  │     occlusion:          tempState.occlusion,
  │     smoking:            tempState.smoking || S.smoking || 'Non-smoker',
  │     remainingStructure: tempState.remainingStructure || S.remainingStructure || 'Good',
  │     endodonticStatus:   tempState.endodonticStatus || S.endodonticStatus || 'No RCT needed',
  │     parafunction:       tempState.parafunction || S.parafunction || 'None'
  │   })
  │   ← S.tooth, S.name, S.age, S.condition, S.tx, S.gender are NOT promoted
  │   ← bypasses setState() — no validation, no StateDiffs, no showSaveIndicator('saving')
  │
  ├─ saveState()                      ← 200ms debounced persist
  │     showSaveIndicator('saving') called immediately inside saveState()
  │
  ├─ tempState = { ...S }             ← resync: tempState now mirrors S
  │
  ├─ _isPreviewMode = false
  ├─ previewModeBanner.style.display = 'none'
  │
  ├─ render(S)                        ← synchronous full render
  │     ← S now has promoted values
  │     ← all panels updated to reflect S
  │
  ├─ updateSliderPositions()          ← sliders synced from tempState (now = S)
  │
  ├─ History.add('Applied What-If', ...)
  │
  ├─ newAI = calcAI(S)               ← reads NEW S (after mutation)
  │     ← again bypasses ClinicalEngine.process
  │
  └─ delta comparison and showToast(...)

Render-before-persistence assumption: render(S) executes before saveState() persists (200ms debounce). The DOM shows the new state immediately. Persistence lags by up to 200ms.
Delta computation inconsistency: prevAI = calcAI(S) and newAI = calcAI(S) both use calcAI directly, not ClinicalEngine.process. For restorative conditions, calcAI returns a different recommendation than ClinicalEngine.process (which runs the 7-stage pipeline). The delta toast compares newAI.implant - prevAI.implant — but the rendered recommendation (from ClinicalEngine.process inside render(S)) may have a different score. The delta shown in the toast may not correspond to what the user sees in the AI card.

Chain 5 — Autosave Flow
Sub-chain 5A — State Autosave
Trigger: Any setState() call, or direct saveState() call

saveState()
  │
  ├─ showSaveIndicator('saving')      ← immediate DOM write (#saveIndicator)
  │
  ├─ clearTimeout(_saveStateTimer)    ← cancel pending debounce
  ├─ _saveStateTimer = setTimeout(() => {   ← [TIMER: 200ms]
  │
  │   [fires 200ms after last saveState() call]
  │   │
  │   ├─ const { editing, whyOpen, historyOpen, ...serializable } = S
  │   │     ← strip transient flags
  │   │     ← any NEW transient flags added to S will silently persist
  │   │
  │   ├─ list = loadAllPatients()      ← localStorage read (synchronous)
  │   ├─ idx = list.findIndex(S.id)
  │   ├─ updated = { ...serializable, id: S.id, caseNum: S.caseNum }
  │   ├─ list[idx] = updated OR list.push(updated)
  │   ├─ saveAllPatients(list)         ← localStorage write (may throw QuotaExceededError)
  │   ├─ setActivePatientId(S.id)      ← localStorage write
  │   ├─ showSaveIndicator('saved')    ← DOM write
  │   │     ← schedules setTimeout(..., 2000) to hide indicator
  │   ├─ renderPatientList()           ← HIDDEN SIDEBAR RE-RENDER
  │   │     ← reads from localStorage (loadAllPatients) NOT from S
  │   │     ← runs 200ms after triggering action, detached from user interaction
  │   │     ← can interrupt visual state during unrelated user actions
  │   └─ _saveStateTimer = null
  │
  }, 200)

Re-entrant render risk: renderPatientList() fires 200ms after every state change. It is not inside any withErrorBoundary. If renderPatientList() throws (e.g., #patientList element doesn’t exist), the error propagates uncaught to the timer callback and is silently swallowed by the browser’s setTimeout error handling.
Implicit read-after-write contract: The timer callback reads S at fire time, not at schedule time. If S is mutated between schedule and fire (within the 200ms window), the persisted data reflects the LATER state, not the state at saveState() call time. This is intentional debounce behavior but creates a subtle invariant: saveState() does not guarantee persistence of the state at the time it was called.
Save-after-switch corruption window: If switchPatient() changes S to a new patient and the OLD patient’s pending saveState() fires within 200ms, the timer callback reads the NEW S.id and writes the old patient’s field values to the new patient’s record. The updated = { ...serializable, id: S.id, caseNum: S.caseNum } line uses S.id at timer-fire time. This is the data corruption scenario identified in Section 1 — it is real and load-bearing to patient switch timing.
Sub-chain 5B — Notes Autosave
Trigger: Textarea input event on ￼

textarea.input event → _handleNotesInput()
  │
  ├─ notesStatus.textContent = 'Typing…'   ← DOM write
  ├─ showSaveIndicator('saving')            ← DOM write
  ├─ clearTimeout(_notesDebounce)
  ├─ _notePatient = S.id                   ← capture patient ID at EVENT TIME
  └─ _notesDebounce = setTimeout(() => {   ← [TIMER: 800ms]
       │
       ├─ [GUARD: S.id !== _notePatient] → return (patient switched during typing)
       │     ← silent abort, no recovery, note content lost
       │
       ├─ S.notes = DOMPurify.sanitize(textarea.value)   ← mutation of S.notes
       │     ← S.notes lags textarea.value by up to 800ms
       │
       ├─ saveState()                       ← schedules 200ms persist debounce
       │     ← triggers: showSaveIndicator, 200ms later renderPatientList
       │
       ├─ notesStatus.textContent = 'Auto-saved'
       └─ notesCount.textContent = `${S.notes.length} chars`
     }, 800)

Ordering risk between notes and edit save: If the user types in notes (800ms debounce pending) and then clicks “Save Changes” in the edit form within 800ms, saveEdit() executes. saveEdit() calls setState() with non-notes fields, then saveState(). The notes 800ms timer is still pending. When it fires, S.notes is mutated and saveState() is called again. Both saveState() calls coalesce in the 200ms debounce. The final persisted state will include the updated notes from the textarea. However, the saveEdit() call to saveState() (at ~0ms) and the notes timer saveState() (at ~800ms) may result in renderPatientList() being called TWICE: once at ~200ms (from saveEdit’s saveState) and once at ~1000ms (from notes saveState).

Chain 6 — Report Generation Flow
Trigger: #reportBtn.click → generateReport()

generateReport()
  │
  ├─ btn.classList.add('btn-loading')      ← immediate DOM mutation
  ├─ btn.innerHTML = '<i ...> Generating…' ← immediate DOM mutation
  │
  ├─ [BRANCH: S.multiSite && S.site2Tooth]
  │     ClinicalEngine.processCompound(S)  ← full AI recomputation (NOT cached)
  │     if !compound: restore btn, showToast, return
  │     build HTML string (pure operations)
  │     ← report reflects S, NOT tempState (preview mode ignored)
  │
  ├─ [BRANCH: S.multiTooth && S.tooth2 && S.condition === 'Missing tooth']
  │     ClinicalEngine.process(S)          ← full AI recomputation
  │     if !ai || !ai.isMultiTooth: restore btn, showToast, return
  │     build HTML string
  │
  ├─ [BRANCH: default single-site]
  │     ClinicalEngine.process(S)          ← full AI recomputation
  │     computeCosts(S, ai)
  │     getCrownMaterial(S)
  │     build HTML string via rptShell() + body HTML
  │
  ├─ new Blob([html], { type: 'text/html' })
  ├─ URL.createObjectURL(blob)             ← browser URL allocation
  ├─ window.open(url, '_blank', ...)
  │     [BRANCH: popup blocked]
  │       a = document.createElement('a')
  │       a.href = url
  │       a.download = `${BRAND.reportPrefix}-...`
  │       a.click()                        ← programmatic download
  │       showToast('Popup blocked...', 'error')
  │     [BRANCH: not blocked]
  │       showToast('Report ready...', 'success')
  │
  ├─ CleanupRegistry.timer(() => URL.revokeObjectURL(url), 1200)
  │     ← [TIMER: 1200ms] URL revoked regardless of whether download started
  │
  └─ setTimeout(() => {                    ← [TIMER: 800ms]
         btn.classList.remove('btn-loading')
         btn.innerHTML = '<i ...> Report'
       }, 800)
       ← NOT registered in CleanupRegistry
       ← fires even if page was unloaded between report open and 800ms

Preview mode not reflected in report: The entire report generation reads from S, not tempState. If _isPreviewMode === true (sliders moved, not applied), the report shows the committed S state. There is no warning to the user that the report does not reflect the current preview. The preview banner (#previewModeBanner) is visible, but no conditional report path accounts for it.
Race condition: URL revoke before download: URL.revokeObjectURL(url) fires at 1200ms. The programmatic a.click() for download fallback initiates a browser download — if the browser has not begun downloading the blob within 1200ms (possible on slow connections or with browser download prompts), the URL is revoked and the download fails silently. The report window opened via window.open captures the URL synchronously and is unaffected by revocation.
Button restore timer not in CleanupRegistry: The 800ms button restore timer is created via a plain setTimeout, not CleanupRegistry.timer(). On pagehide, CleanupRegistry.cleanup() clears all registered timers but NOT this one. If the user navigates away within 800ms of report generation, the orphaned timer fires against a destroyed DOM.
No History.add() for multi-tooth: The single-site path calls History.add('Report generated', ...). The multi-tooth path also calls History.add('Multi-tooth report generated', ...). The compound path calls History.add('Compound report generated', ...). All three paths log correctly. No omission here.
Shared DOM ownership during report generation: The button mutation (loading state → restore) is a direct DOM write with no guard. If generateReport() is called twice before the 800ms restore fires (user double-click), btn.innerHTML is set to ‘Generating…’ twice, but the 800ms timer from the first call will fire and restore the button — then the second call’s 800ms timer fires and restores again. No corruption, but two overlapping timers both mutate the same DOM element.

Chain 7 — Multi-Site Mode Switching Flow
Trigger: #multiSiteToggle.click → toggleMultiSite(!S.multiSite)

toggleMultiSite(enabled)
  │
  ├─ S.multiSite = enabled              ← direct mutation, bypasses setState()
  │
  ├─ [BRANCH: enabling && S.multiTooth]
  │     S.multiTooth = false            ← direct mutation
  │     S.tooth2 = null                 ← direct mutation
  │     multiToothToggle.classList.remove('active')
  │     multiToothToggle.setAttribute('aria-pressed','false')
  │     tooth2Wrap.style.display = 'none'
  │     abutmentWrap.style.display = 'none'
  │
  ├─ [Comparison table pre-wipe]
  │     _tbody = $('comparisonTableBody')
  │     if (_tbody) _tbody.innerHTML = ''    ← IMMEDIATE DOM WIPE before render
  │
  ├─ DOM: multiSiteToggle class/aria update
  │
  ├─ DOM: site2Wrap.display = enabled ? 'grid' : 'none'
  ├─ DOM: siteTabsWrap.display = enabled ? 'flex' : 'none'
  ├─ DOM: compoundBanner.display = enabled ? 'flex' : 'none'
  │     ← Banner shown immediately but compoundSummaryBody is empty
  │     ← Content is populated only inside render() → renderCompoundSummary()
  │     ← Window: banner visible with empty content until render() completes
  │
  ├─ [BRANCH: disabling]
  │     S.activeSite = 1
  │     updateSiteTabUI()               ← updates tab button labels/classes
  │
  │   ← [BRANCH: enabling]
  │     updateSiteTabUI() NOT called    ← tabs show stale labels until switchSite()
  │     ← siteTabsWrap is now visible with static 'Site 1' / 'Site 2' labels
  │     ← no tooth numbers shown in tab labels until user clicks a tab
  │
  ├─ saveState()                        ← 200ms debounced
  │     ← S.multiSite already mutated, will persist correctly after 200ms
  │
  └─ render(S)                          ← synchronous full render
        │
        ├─ [COMPOUND BRANCH fires: S.multiSite && S.site2Tooth]
        │     ClinicalEngine.processCompound(S)
        │     renderCompoundSummary(compound, S)   ← writes #compoundSummaryBody
        │     derive effectiveState for activeSite
        │     renderMainPanels(effectiveState, ai)
        │       ← updateToothHighlight(effectiveState.tooth)
        │       ← updateToothHighlight2(otherTooth)
        │     then: render() calls updateToothHighlight(primaryTooth) [SECOND PASS]
        │            render() calls updateToothHighlight2(secondaryTooth) [SECOND PASS]
        │     ← Two SVG highlight passes: first inside renderMainPanels, second in render()
        │     ← Second pass overwrites first — this is the load-bearing compound SVG pattern
        │
        └─ [if S.site2Tooth is not yet set: S.multiSite=true but no site2Tooth]
              render() takes compound branch but site2Tooth is falsy
              ClinicalEngine.processCompound(S) builds site2State with tooth: S.site2Tooth || '#11'
              ← Default '#11' used as site2 tooth if user hasn't selected one yet

DOM state inconsistency window (enabling path):
	1.	compoundBanner.style.display = 'flex' — banner visible
	2.	#compoundSummaryBody is empty — no content rendered yet
	3.	render(S) fires synchronously → renderCompoundSummary() fills banner content
The window between step 1 and step 3 is synchronous (no timer between them) but the banner IS visible with empty content during JavaScript execution between those lines. In practice this gap is sub-millisecond and not user-visible. However it is a DOM state that exists.
updateSiteTabUI() omission on enable: When toggleMultiSite(true) is called, tab labels are NOT updated. updateSiteTabUI() is called only on disable (to reset to S.activeSite = 1). When enabling, render(S) calls renderCompoundSummary() which updates #compoundSummaryBody but NOT the tab button inner HTML. Tab buttons retain their prior text (Site 1 / Site 2 from HTML static content, or whatever prior updateSiteTabUI() set). updateSiteTabUI() is only called next when switchSite() is invoked. This is a stale tab label issue from enable until first tab click.
site2ToothSelect population: populateSite2ToothOptions() is defined but its call site is not in toggleMultiSite(). It must be called during initialization. If it hasn’t been called before multi-site mode is enabled, #site2ToothSelect is an empty dropdown. ClinicalEngine.processCompound() defaults to S.site2Tooth || '#11' — the computation is correct regardless. But the user sees an empty or stale dropdown.
Comparison table pre-wipe ordering: _tbody.innerHTML = '' fires BEFORE render(S). lazyRenderComparisonTable inside render(S) checks visibility and either renders synchronously or sets an IntersectionObserver. If the table is visible, it re-populates synchronously immediately. The pre-wipe therefore creates a sub-millisecond flash of empty table content before synchronous re-population. If the table is offscreen, the pre-wipe persists until the observer fires. In both cases the pre-wipe is a safety measure against stale column headers from the previous mode being visible if the render path branches to a different column schema.
S.activeSite stale value: On disable, S.activeSite = 1 and updateSiteTabUI() run. On re-enable, S.activeSite is still 1 from the prior disable. If the user had been on Site 2 before disabling, then re-enables, S.activeSite correctly starts at 1. However if S.activeSite was never explicitly reset (e.g., after loading from persisted state with activeSite: 2), the compound render would start at Site 2 view. The loadState() path passes activeSite through from persisted state without normalization (normalization occurs in S initialization: if (loaded.activeSite !== 1 && loaded.activeSite !== 2) loaded.activeSite = 1 — this catches invalid values but not the stale-from-prior-session case).​​​​​​​​​​​​​​​​

