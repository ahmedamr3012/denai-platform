// ================================================================
// ai.d.ts — AI scoring engine result contracts
// Phase 20: Type Governance Foundations
//
// Documents the output shapes of calcAI() and calcAIMulti().
// These are the raw AI result structures produced by the pure
// scoring engines before the ClinicalEngine pipeline wraps them.
// ================================================================

interface AIFactor {
  label: string;
  type: 'pos' | 'neg' | 'warn' | 'neu';
  delta: number;
}

interface CrownRisks {
  secondaryCaries: RiskLevel;
  crownFracture: RiskLevel;
  rootFracture: RiskLevel;
  endodonticFailure: RiskLevel;
  parafunctionDamage: RiskLevel | 'Critical';
}

// ── calcAI() output — single-tooth scoring ─────────────────────
interface CalcAIResult {
  implant: number;
  bridge: number;
  crown: number;
  conf: number;
  confLevel: ConfidenceLevel;
  rec: TxSlot;
  // Risk dimension assessments
  peri: RiskLevel;
  boneR: RiskLevel;
  occR: RiskLevel;
  smokingR: RiskLevel;
  diabetesR: RiskLevel;
  // Crown viability
  crownViable: boolean;
  crownWarning: string | null;
  crownRisks: CrownRisks | null;
  // Clinical explanation data
  reasons: string[];
  factors: AIFactor[];
  caseCount: string;
  bridgeWarning?: string | null;
}

// ── calcAIMulti() output — two adjacent missing teeth ──────────
interface CalcAIMultiResult {
  isMultiTooth: true;
  tooth1: string;
  tooth2: string;
  anterior: boolean;
  posterior: boolean;
  implant2: number;
  bridge4: number;
  cantilever: number;
  rec: 'implant2' | 'bridge4' | 'cantilever';
  ideal: 'implant2' | 'bridge4' | 'cantilever';
  conf: number;
  confLevel: ConfidenceLevel;
  costs: { implant2: number; bridge4: number; cantilever: number };
  abutmentCompromised: boolean;
  reasons: string[];
  factors: AIFactor[];
  caseCount: string;
}
