// ================================================================
// explainLayer.js — Structured clinical explanation formatter
// Phase 14: AI Explanation Layer
// Derives typed explanation blocks from existing ai result.
// Pure computation — no DOM access, no clinical logic changes.
// ================================================================
window.denaiExplain = (function () {
  'use strict';

  var TYPE = Object.freeze({
    CLASSIFICATION:  'classification',
    RATIONALE:       'rationale',
    CONTRAINDICATION:'contraindication',
    ESCALATION:      'escalation',
    TRADEOFF:        'tradeoff',
  });

  // ── Main entry point ──────────────────────────────────────────
  // Takes the existing ai result and produces display-ready structures.
  // Never changes clinical logic — derives entirely from what the engine returned.
  function buildExplanation(ai) {
    if (!ai) return null;
    return {
      blocks:             _buildBlocks(ai),
      confidenceRationale: _buildConfidenceRationale(ai),
      referralSignals:    _buildReferralSignals(ai),
    };
  }

  // ── Typed reasoning blocks ────────────────────────────────────
  // Source of truth: ai.explanation.reasons (restorative path) or ai.reasons (missing/multi path).
  // ⚠ prefix = contraindication. "Case classified:" prefix = classification. Everything else = rationale.
  function _buildBlocks(ai) {
    var blocks = [];
    var reasons = (ai.explanation && Array.isArray(ai.explanation.reasons))
      ? ai.explanation.reasons
      : (Array.isArray(ai.reasons) ? ai.reasons : []);

    for (var i = 0; i < Math.min(reasons.length, 5); i++) {
      var text = reasons[i];
      if (!text) continue;
      var type;
      if (text.indexOf('⚠') === 0) {
        type = TYPE.CONTRAINDICATION;
      } else if (text.indexOf('Case classified:') === 0) {
        type = TYPE.CLASSIFICATION;
      } else {
        type = TYPE.RATIONALE;
      }
      blocks.push({ type: type, text: text });
    }

    // Escalation block: supplement for HOPELESS cases with extraction rec
    if (ai.caseClass && ai.caseClass.type === 'RESTORATIVE_HOPELESS') {
      blocks.push({
        type: TYPE.ESCALATION,
        text: 'Escalation path: extraction is indicated for a non-restorable tooth. Implant timing can be deferred to align with systemic readiness.',
      });
    }

    // Tradeoff block: surface the close preserve-vs-extract decision explicitly
    if (Array.isArray(ai.scored)) {
      var extractOpt = null;
      var bestPreserve = null;
      for (var j = 0; j < ai.scored.length; j++) {
        var t = ai.scored[j];
        if (t.id === 'extract_impl') {
          extractOpt = t;
        } else if (!bestPreserve || t.score > bestPreserve.score) {
          bestPreserve = t;
        }
      }
      if (extractOpt && bestPreserve) {
        var gap = bestPreserve.score - extractOpt.score;
        if (gap < 0 && gap > -3.5) {
          // Extract scored higher but preservation was recommended via bias
          blocks.push({
            type: TYPE.TRADEOFF,
            text: 'Close decision: extraction scored higher (' + extractOpt.score.toFixed(1) + '% vs ' + bestPreserve.score.toFixed(1) + '%) but preservation is recommended as first-line approach. Reassess if condition deteriorates.',
          });
        } else if (gap >= 0 && gap <= 3.0) {
          // Preservation ahead but closely scored
          blocks.push({
            type: TYPE.TRADEOFF,
            text: bestPreserve.label + ' (' + bestPreserve.score.toFixed(1) + '%) vs Extract+Implant (' + extractOpt.score.toFixed(1) + '%) — closely scored. Both pathways are clinically defensible.',
          });
        }
      }
    }

    return blocks.slice(0, 7);
  }

  // ── Confidence rationale (Medium / Low only) ──────────────────
  // Surfaces the specific clinical factors that drove confidence down.
  // Returns null for High confidence — no annotation needed there.
  function _buildConfidenceRationale(ai) {
    var level = ai.confLevel;
    if (level === 'High' || !level) return null;

    var parts = [];
    var cl = ai.clinical;
    if (cl) {
      var p   = cl.periodontal  || {};
      var o   = cl.occlusal     || {};
      var sys = cl.systemic     || {};
      var r   = cl.restorative  || {};
      if (p.poorBone)         parts.push('poor bone quality');
      if (p.poorHygiene)      parts.push('poor hygiene');
      if (o.bruxism)          parts.push('bruxism');
      if (sys.currentSmoker)  parts.push('active smoking');
      if (sys.uncontrolledDM) parts.push('uncontrolled diabetes');
      if (r.needsRCT)         parts.push('RCT required before restoration');
    }

    // Preservation-tension: extraction is more competitive than the recommendation score suggests
    if (Array.isArray(ai.scored)) {
      var xOpt = null;
      var bPres = null;
      for (var i = 0; i < ai.scored.length; i++) {
        var t = ai.scored[i];
        if (t.id === 'extract_impl') { xOpt = t; }
        else if (!bPres || t.score > bPres.score) { bPres = t; }
      }
      if (xOpt && bPres && xOpt.score > bPres.score) {
        parts.push('extraction is a competitive option');
      }
    }

    if (!parts.length) {
      return level === 'Medium'
        ? 'Moderate confidence — competing clinical signals present.'
        : 'Lower confidence — stacked risk factors reduce recommendation certainty.';
    }
    var prefix = level === 'Medium' ? 'Moderate confidence — ' : 'Lower confidence — ';
    return prefix + parts.slice(0, 3).join(', ') + '.';
  }

  // ── Specialist referral signals ───────────────────────────────
  // Only surfaces when a specific referral is clinically warranted.
  // Returns empty array when no referral is indicated.
  function _buildReferralSignals(ai) {
    var signals = [];
    if (!ai || !ai.clinical) return signals;

    var p   = ai.clinical.periodontal  || {};
    var o   = ai.clinical.occlusal     || {};
    var sys = ai.clinical.systemic     || {};
    var ct  = ai.caseClass && ai.caseClass.type;

    if (p.poorBone && (ai.rec === 'implant' || ct === 'RESTORATIVE_HOPELESS')) {
      signals.push('Bone grafting consult recommended — D3/D4 bone requires augmentation assessment before implant placement.');
    }
    if (sys.uncontrolledDM) {
      signals.push('Glycemic optimization recommended before any surgical intervention — HbA1c ≥7.5% elevates procedural risk.');
    }
    if (o.bruxism && (ai.rec === 'implant' || ct === 'RESTORATIVE_HOPELESS')) {
      signals.push('Occlusal assessment before final restoration — active bruxism management is a prerequisite.');
    }
    if (ct === 'RESTORATIVE_COMPROMISED' && p.poorBone) {
      signals.push('Periodontal or oral surgery assessment may alter the recommended treatment sequence.');
    }

    return signals;
  }

  return Object.freeze({ buildExplanation: buildExplanation, TYPE: TYPE });
})();
