// src/constants/clinicPrefs.js
// Wave C1: Clinic preferences foundation — pure constants, no side effects.
//
// Provides the static lookup maps, currency configuration, treatment pricing
// catalog, and default values consumed by formatters.js and prefsSync.js.
//
// LOAD ORDER: Must precede formatters.js (uses FDI_MAP, CURRENCY_CONFIG,
// TREATMENT_PRICING_CATALOG). Placed before costEngine.js so future waves
// can call getClinicPrice() inside computeCosts().

// ── Default preference values ─────────────────────────────────────────────────
const CLINIC_PREF_DEFAULTS = Object.freeze({
  toothSystem: 'universal',   // 'universal' | 'fdi'
  currency:    'USD',         // 'USD' | 'EUR' | 'CAD' | 'EGP'
  pricing:     null,          // null = use TREATMENT_PRICING_CATALOG defaults
});

// ── Universal → FDI tooth numbering map ──────────────────────────────────────
// Maps internal Universal (#1–#32) to FDI 2-digit notation.
// Quadrants: upper-right 11–18, upper-left 21–28, lower-left 31–38, lower-right 41–48.
// KEY INVARIANT: Internal runtime always stores Universal (#N). This map is
// DISPLAY-ONLY — never used in calcAI.js, adjacency logic, or validators.
const FDI_MAP = Object.freeze({
  '#1': '18',  '#2': '17',  '#3': '16',  '#4': '15',
  '#5': '14',  '#6': '13',  '#7': '12',  '#8': '11',
  '#9': '21',  '#10': '22', '#11': '23', '#12': '24',
  '#13': '25', '#14': '26', '#15': '27', '#16': '28',
  '#17': '38', '#18': '37', '#19': '36', '#20': '35',
  '#21': '34', '#22': '33', '#23': '32', '#24': '31',
  '#25': '41', '#26': '42', '#27': '43', '#28': '44',
  '#29': '45', '#30': '46', '#31': '47', '#32': '48',
});

// ── Currency configuration ────────────────────────────────────────────────────
// DISPLAY-ONLY: symbol prefix for monetary amounts. No exchange-rate logic.
// Extend by adding an entry here — the settings modal auto-reflects new currencies.
const CURRENCY_CONFIG = Object.freeze({
  USD: Object.freeze({ symbol: '$',   code: 'USD', name: 'US Dollar'       }),
  EUR: Object.freeze({ symbol: '€',   code: 'EUR', name: 'Euro'            }),
  CAD: Object.freeze({ symbol: 'CA$', code: 'CAD', name: 'Canadian Dollar' }),
  EGP: Object.freeze({ symbol: 'E£',  code: 'EGP', name: 'Egyptian Pound'  }),
});

// ── Treatment pricing catalog ─────────────────────────────────────────────────
// Single source of truth for all configurable treatment costs.
//
// id:        unique key — matches denaiPrefs.pricing object keys
// label:     human-readable name shown in the settings UI
// stateKey:  per-patient override field in DEFAULT_STATE (null = clinic-level only)
// default:   fallback when no clinic pricing is configured
// category:  groups entries for UI display
//
// COVERAGE — all treatment paths that produce dollar amounts:
//   Single-tooth:  implant + optional boneGraft / bridge / crown + optional rct + postCore
//   Multi-tooth:   bridge4 (4-unit, standalone configurable), implant×2 (+ boneGraft×2), implant×1.5 (cantilever)
//   Restorative:   crown (base), overlay (onlay — standalone configurable), crown_core (crown + postCore),
//                  endocrown (crown×0.90 — derived), extract_impl (implant — Wave C3 fix),
//                  splinted (crown — derived), crown_adv (crown — derived)
//   Adjunctive:    annualCheckup (×2/yr used in 10-year totals)
//
// Derived costs (multi-unit ratios, restorative variants not listed above) are COMPUTED
// in render/engine logic from these base prices — they are not separate catalog entries.
// R2.1: bridge4 and overlay promoted from derived → standalone configurable entries.
const TREATMENT_PRICING_CATALOG = Object.freeze([
  // ── Surgical / Prosthetic ───────────────────────────────────────────────────
  { id: 'implant',       label: 'Implant placement',      stateKey: 'costImplant',   default: 4500, category: 'surgical'    },
  { id: 'bridge',        label: 'Bridge (3-unit base)',    stateKey: 'costBridge',    default: 3500, category: 'surgical'    },
  { id: 'bridge4',       label: '4-Unit Bridge (multi)',   stateKey: 'costBridge4',   default: 4550, category: 'surgical'    },
  { id: 'boneGraft',     label: 'Bone graft',              stateKey: 'costBoneGraft', default: 1500, category: 'surgical'    },
  // ── Restorative ─────────────────────────────────────────────────────────────
  { id: 'crown',         label: 'Crown',                   stateKey: 'costCrown',     default: 1200, category: 'restorative' },
  { id: 'overlay',       label: 'Onlay / Overlay',         stateKey: 'costOverlay',   default:  780, category: 'restorative' },
  { id: 'rct',           label: 'Root canal (RCT)',         stateKey: 'costRCT',       default: 1000, category: 'restorative' },
  { id: 'postCore',      label: 'Post & core',             stateKey: 'costPostCore',  default:  400, category: 'restorative' },
  // ── Adjunctive ──────────────────────────────────────────────────────────────
  { id: 'annualCheckup', label: 'Checkup (per visit)',     stateKey: null,            default:  150, category: 'adjunctive'  },
  // ── Material add-ons ────────────────────────────────────────────────────────
  // Flat absolute dollar upcharges added to base treatment price when a material
  // is selected. Defaults calibrated to match R3.3 percentage behavior at catalog
  // base prices (15% × $3500 bridge = $525; 8% × $4500 implant = $360).
  { id: 'matZirconia',        label: 'Zirconia add-on (bridge)',        stateKey: null, default: 525, category: 'material' },
  { id: 'matEmax',            label: 'e.max add-on (bridge)',           stateKey: null, default:   0, category: 'material' },
  { id: 'matAllZirconia',     label: 'All-Zirconia add-on (implant)',   stateKey: null, default: 360, category: 'material' },
  // R3.5: treatment-scoped crown add-ons (bridge zirconia ≠ crown zirconia — different lab workflow)
  // matCrownZirconia: Layered Zirconia over Monolithic/e.max. Default $96 = 8% × $1200 crown base.
  // matCrownEmax: e.max Crown alt (case 3 — may be negative if e.max is cheaper; default $0 = no delta).
  { id: 'matCrownZirconia',   label: 'Zirconia add-on (crown)',         stateKey: null, default:  96, category: 'material' },
  { id: 'matCrownEmax',       label: 'e.max add-on (crown)',            stateKey: null, default:   0, category: 'material' },
  // R3.5: overlay material add-ons — ceramic vs composite fabrication cost delta
  { id: 'matOverlayCeramic',  label: 'Ceramic add-on (overlay)',        stateKey: null, default:   0, category: 'material' },
  { id: 'matOverlayComposite',label: 'Composite add-on (overlay)',      stateKey: null, default:   0, category: 'material' },
]);
