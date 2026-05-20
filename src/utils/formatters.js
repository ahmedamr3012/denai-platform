// src/utils/formatters.js
// Wave C1: Clinic preferences display helpers — pure functions, no side effects.
//
// All functions are DISPLAY-ONLY and fallback-safe:
//   - Safe to call before denaiPrefs is initialized (returns sensible defaults)
//   - Safe to call with null/undefined inputs
//   - No DOM access, no mutations, no external state
//
// Dependencies (all blocking scripts loaded before this file):
//   clinicPrefs.js — FDI_MAP, CURRENCY_CONFIG, TREATMENT_PRICING_CATALOG
//
// Runtime dependency (defer script, accessed lazily inside functions):
//   prefsSync.js — window.denaiPrefs (guarded with typeof check)
//
// TOOTH NUMBERING: formatTooth() is DISPLAY-ONLY.
// Internal runtime stores Universal #N format always. calcAI.js, ClinicalEngine,
// adjacency logic, validators, and serializer are NEVER touched by these helpers.

// ── Tooth display ─────────────────────────────────────────────────────────────

// Formats a tooth ID for display per the active tooth numbering preference.
// Universal mode: '#8'
// FDI mode (default): '11 (#8)' — dual display for clinical safety
// FDI mode (compact=true): '11' — for SVG labels where space is tight
function formatTooth(tooth, compact) {
  if (!tooth) return '—'; // em dash fallback
  var sys = (typeof denaiPrefs !== 'undefined' ? denaiPrefs.get('toothSystem') : null) || 'universal';
  if (sys === 'fdi') {
    var fdi = FDI_MAP[tooth];
    if (!fdi) return tooth; // unmapped: return as-is
    return compact ? fdi : fdi + ' (' + tooth + ')';
  }
  return tooth; // Universal: return '#8', '#14' etc. as stored
}

function getToothSystemLabel() {
  var sys = (typeof denaiPrefs !== 'undefined' ? denaiPrefs.get('toothSystem') : null) || 'universal';
  return sys === 'fdi' ? 'FDI Notation' : 'Universal Numbering System';
}

// ── Currency display ──────────────────────────────────────────────────────────

function getCurrencySymbol() {
  var code = (typeof denaiPrefs !== 'undefined' ? denaiPrefs.get('currency') : null) || 'USD';
  var cfg  = CURRENCY_CONFIG[code] || CURRENCY_CONFIG.USD;
  return cfg.symbol;
}

// Formats a monetary amount with the active clinic currency symbol.
// Returns fallback string (default 'N/A') when amount is not a finite number.
function formatCurrency(amount, fallback) {
  var fb = (fallback !== undefined) ? fallback : 'N/A';
  if (amount == null || !Number.isFinite(+amount)) return fb;
  var code = (typeof denaiPrefs !== 'undefined' ? denaiPrefs.get('currency') : null) || 'USD';
  var cfg  = CURRENCY_CONFIG[code] || CURRENCY_CONFIG.USD;
  return cfg.symbol + Math.round(+amount).toLocaleString();
}

// ── Clinic pricing ────────────────────────────────────────────────────────────

// Returns the effective clinic price for a given treatment catalog id.
// Priority chain: clinic-saved preference → catalog default → 0.
// Wave C3 will add a 3rd tier: per-patient state override (highest priority).
function getClinicPrice(id) {
  var storedPricing = typeof denaiPrefs !== 'undefined' ? denaiPrefs.get('pricing') : null;
  if (storedPricing && typeof storedPricing[id] === 'number') return storedPricing[id];
  for (var i = 0; i < TREATMENT_PRICING_CATALOG.length; i++) {
    if (TREATMENT_PRICING_CATALOG[i].id === id) return TREATMENT_PRICING_CATALOG[i].default;
  }
  return 0;
}
