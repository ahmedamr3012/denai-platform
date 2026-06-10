// ================================================================
// state.d.ts — Patient state shape and clinical field types
// Phase 20: Type Governance Foundations
//
// Documents the runtime contract for the S (patient state) object.
// Reference: src/sync/serializer.js ALLOWED_FIELDS
//            src/ai/aiPayload.js AI_SAFE_FIELDS / EXCLUDED_FIELDS
// ================================================================

// ── Clinical field literal types ──────────────────────────────

type ToothCondition =
  | 'Missing tooth'
  | 'Fractured tooth'
  | 'Severe decay'
  | 'Failed restoration';

type BoneQuality      = 'Good' | 'Fair' | 'Poor';
type HygieneLevel     = 'Good' | 'Fair' | 'Poor';
type OcclusionLoad    = 'Normal' | 'High occlusion load' | 'Low';
type SmokingStatus    = 'Non-smoker' | 'Former smoker' | 'Current smoker';
type DiabetesStatus   = 'None' | 'Controlled' | 'Uncontrolled';
type RemainingStructure = 'Good' | 'Fair' | 'Poor';
type EndodonticStatus = 'No RCT needed' | 'Needs RCT' | 'RCT done';
type ParafunctionType = 'None' | 'Clenching' | 'Bruxism' | 'Both';
type AbutmentQuality  = 'Good' | 'Compromised';
type TxSlot           = 'implant' | 'bridge' | 'crown';
type ConfidenceLevel  = 'High' | 'Medium' | 'Low';
type RiskLevel        = 'Low' | 'Medium' | 'High';

// ── Subscription status (entitlements.js / Stripe lifecycle) ──
type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'none'
  | 'unknown';

// ── Effective status (accessPolicy.js, Wave B2A) ──────────────
// 'expired' is derived on the client (trialing past trial_ends_at);
// it is never stored in the DB or the entitlements cache.
type EffectiveSubscriptionStatus = SubscriptionStatus | 'expired';

// ── Full patient state — the runtime S object ─────────────────
// Persisted to localStorage; subset synced to Supabase via serializer.
// PHI fields (id, name, gender, notes) are excluded from AI calls.
interface PatientState {
  // Identity — excluded from AI (aiPayload EXCLUDED_FIELDS)
  id: string;
  caseNum: string;
  name: string;
  age: number;
  gender: string;
  // Primary clinical inputs
  tooth: string;
  condition: ToothCondition;
  bone: BoneQuality;
  hygiene: HygieneLevel;
  occlusion: OcclusionLoad;
  tx: TxSlot;
  // Restorative-path inputs
  remainingStructure?: RemainingStructure;
  endodonticStatus?: EndodonticStatus;
  parafunction?: ParafunctionType;
  // Systemic risk factors
  smoking?: SmokingStatus;
  diabetes?: DiabetesStatus;
  // Multi-tooth case
  multiTooth?: boolean;
  tooth2?: string;
  abutmentQuality?: AbutmentQuality;
  // Multi-site compound case
  multiSite?: boolean;
  activeSite?: number;
  site2Tooth?: string;
  site2Condition?: ToothCondition;
  site2Structure?: RemainingStructure;
  site2EndoStatus?: EndodonticStatus;
  // Pricing — patient/clinic override; falls back to getClinicPrice()
  costImplant?: number;
  costBridge?: number;
  costCrown?: number;
  costBoneGraft?: number;
  costRCT?: number;
  costPostCore?: number;
  costBridge4?: number | null;   // R2.2: 4-unit bridge; null = use clinic preference
  costOverlay?: number | null;   // R2.2: onlay/overlay; null = use clinic preference
  // Material — clinician decision metadata; separate from treatment authority
  selectedMaterial?: string | null;  // R3.2: 'primary' | 'alt' | null; resolved to name at render time; does not affect scoring
  // Workflow state — synced to cloud
  planApproved?: boolean;
  labStatus?: string;
  caseDelivered?: boolean;
  serviceDate?: string;    // ISO date YYYY-MM-DD
  // Device-local — excluded from serializer ALLOWED_FIELDS
  lastAccessed?: string;
  notes?: string;
  labNotes?: string;
  reportHistory?: unknown[];
  wfHistory?: unknown[];
  lastView?: string;
  clinicId?: string | null;
}
