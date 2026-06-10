// ================================================================
// globals.d.ts — Window-global module contracts
// Phase 20: Type Governance Foundations
//
// Documents the runtime API surface of all denai* IIFE modules
// and globally-scoped AI engine functions loaded as <script> tags.
// ================================================================

// ── ClinicalEngine (src/ai/clinicalEngine.js) ─────────────────
declare const ClinicalEngine: {
  readonly CT: Readonly<Record<CaseType, CaseType>>;
  process(state: Partial<PatientState>): ProcessResult | null;
  processCompound(state: Partial<PatientState>): CompoundAIResult | null;
  normalize(state: Partial<PatientState>): NormalizedClinical;
  classify(clinical: NormalizedClinical): CaseClass;
};

// ── Raw engine globals (src/ai/calcAI.js) ────────────────────
declare function calcAI(state: Partial<PatientState>): CalcAIResult | null;
declare function calcAIMulti(state: Partial<PatientState>): CalcAIMultiResult | null;
declare function isPosteriorTooth(tooth: string): boolean;
declare function isMaxilla(tooth: string): boolean;
declare function getAdjacentTeeth(tooth: string): string[];

// ── denaiAIPayload (src/ai/aiPayload.js) ──────────────────────
declare const denaiAIPayload: {
  build(state: Partial<PatientState>): Partial<PatientState> | null;
  isSafe(payload: object): boolean;
  readonly AI_SAFE_FIELDS: ReadonlyArray<string>;
  readonly EXCLUDED_FIELDS: ReadonlyArray<string>;
};

// ── denaiExplain (src/ai/explainLayer.js) ─────────────────────
declare const denaiExplain: {
  buildExplanation(ai: ProcessResult): ExplainResult | null;
  readonly TYPE: Readonly<Record<ExplanationBlockType, ExplanationBlockType>>;
};

// ── denaiArabic (src/ai/arabicLayer.js) ───────────────────────
declare const denaiArabic: {
  localizeExpl(expl: ExplainResult): ExplainResult;
  getLang(): string;
  setLang(lang: string): void;
  isArabic(): boolean;
};

// ── denaiEntitlements (src/auth/entitlements.js) ──────────────
declare const denaiEntitlements: {
  init(status: string | null, planId: string | null, clinicId: string | null, trialEndsAt?: string | null): void;
  canUse(featureKey: string): boolean;
  isPro(): boolean;
  getStatus(): SubscriptionStatus;
  getTrialEndsAt(): string | null;
  isCacheFresh(): boolean;
  clear(): void;
};

// ── denaiAccessPolicy (src/auth/accessPolicy.js, Wave B2A) ────
declare const denaiAccessPolicy: {
  getEffectiveSubscriptionStatus(): EffectiveSubscriptionStatus;
  isEntitledClinic(): boolean;
  canCreatePatient(): boolean;
  canCreatePlan(): boolean;
  canAccessHistoricalData(): boolean;
  isFoundingPhase(): boolean;
  deriveEffectiveStatus(status: string | null, trialEndsAt: string | null, nowMs: number): EffectiveSubscriptionStatus;
  deriveEntitled(effectiveStatus: string, foundingPhase: boolean): boolean;
};

// ── denaiSubPresenter (src/auth/subscriptionPresenter.js, Wave B2C) ──
declare const denaiSubPresenter: {
  describe(
    effectiveStatus: string,
    trialEndsAt: string | null,
    nowMs: number,
    foundingPhase: boolean,
  ): { key: string; tone: 'ok' | 'info' | 'warn' | 'restricted'; sidebar: string; title: string; detail: string } | null;
  daysLeft(trialEndsAt: string | null, nowMs: number): number | null;
  current(): { key: string; tone: string; sidebar: string; title: string; detail: string } | null;
  sidebarLine(): string | null;
};

// ── denaiSerializer (src/sync/serializer.js) ──────────────────
declare const denaiSerializer: {
  serializePatient(src: Partial<PatientState>): Partial<PatientState> | null;
};

// ── denaiObserve (src/observe/frictionLog.js) ─────────────────
declare const denaiObserve: {
  record(eventType: string, flags?: Record<string, boolean | number>): void;
  flush(supabaseClient: unknown): Promise<void>;
};

// ── denaiGuidance (src/onboarding/guidanceModule.js) ──────────
declare const denaiGuidance: {
  hasSeen(key: string): boolean;
  markSeen(key: string): void;
};
