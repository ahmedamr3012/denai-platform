// ================================================================
// explain.d.ts — Explanation layer output contracts
// Phase 20: Type Governance Foundations
//
// Documents the output shape of denaiExplain.buildExplanation()
// and the typed block structure produced by explainLayer.js.
// ================================================================

type ExplanationBlockType =
  | 'classification'
  | 'rationale'
  | 'contraindication'
  | 'escalation'
  | 'tradeoff';

interface ExplanationBlock {
  type: ExplanationBlockType;
  text: string;
}

// ── denaiExplain.buildExplanation() return shape ──────────────
// Derived from the clinical engine result — never changes clinical logic.
interface ExplainResult {
  blocks: ExplanationBlock[];          // max 7 typed reasoning blocks
  confidenceRationale: string | null;  // null for High confidence cases
  referralSignals: string[];           // empty when no referral is indicated
  /** Added by denaiArabic.localizeExpl() when Arabic mode is active */
  factors?: AIFactor[];
}
