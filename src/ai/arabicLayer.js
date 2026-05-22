// ================================================================
// arabicLayer.js — Arabic bilingual explanation layer
// Phase 16: Arabic AI clinical explanations
//
// Deterministic phrase-map translation for clinician-facing
// AI explanation blocks, confidence rationale, and referral signals.
// No machine translation. No runtime AI calls. Fully offline.
//
// Architecture: takes expl output of explainLayer.js and returns a
// structurally identical object with Arabic text substituted.
// Never modifies clinical logic — pure display transformation.
//
// Pure computation — no DOM access, no clinical logic changes.
// ================================================================
window.denaiArabic = (function () {
  'use strict';

  var LANG_KEY = 'denaiLang_v1';

  // ── Language state ────────────────────────────────────────────
  function getLang() {
    try { return localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { return 'en'; }
  }
  function setLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang === 'ar' ? 'ar' : 'en'); } catch (e) {}
  }
  function isArabic() { return getLang() === 'ar'; }

  // ── Static phrase map ─────────────────────────────────────────
  // Keys: exact English strings from clinicalEngine.js / explainLayer.js.
  // Values: clinically reviewed Arabic equivalents.
  // Bounded set — all strings are deterministic engine output, never free-text.
  var PHRASES = {

    // Classification blocks (clinicalEngine.js explain Stage 6)
    'Case classified: Single Missing Tooth':
      'تصنيف الحالة: سن مفقود منفرد',
    'Case classified: Two Adjacent Missing Teeth':
      'تصنيف الحالة: سنان متجاوران مفقودان',
    'Case classified: Tooth with Poor Prognosis — Extraction and replacement strongly recommended':
      'تصنيف الحالة: سن بتشخيص ضعيف — يُوصى بشدة بالخلع والتعويض',
    'Case classified: Structurally Compromised Tooth — Guarded prognosis — restorative possible with risk awareness':
      'تصنيف الحالة: سن بنيوياً متأثر — تشخيص محتاط، الترميم ممكن مع إدراك المخاطر',
    'Case classified: Restorable Tooth — Excellent prognosis':
      'تصنيف الحالة: سن صالح للترميم — تشخيص ممتاز',
    'Case classified: Restorable Tooth — Good prognosis with appropriate treatment':
      'تصنيف الحالة: سن صالح للترميم — تشخيص جيد مع العلاج المناسب',

    // Onlay rationale
    'Excellent residual structure — onlay preparation maximally preserves natural tooth':
      'بنية متبقية ممتازة — تحضير الـ Onlay يحافظ على السن الطبيعي بشكل أمثل',
    'Low occlusal load favors minimal preparation approach':
      'الحمل الإطباقي المنخفض يدعم نهج الحد الأدنى من التحضير',
    'Posterior position ideal for onlay biomechanical distribution':
      'الموضع الخلفي مثالي للتوزيع الميكانيكي الحيوي للـ Onlay',
    'Vital pulp: no endodontic risk — highest preservation prognosis':
      'لب حيوي: لا خطر لبّي — أفضل تشخيص حفاظ',
    'Good periodontal support ensures stable long-term margin integrity':
      'الدعم اللثوي الجيد يضمن سلامة الحواف على المدى البعيد',
    '⚠ Bruxism: onlay margins at high fracture risk — full coverage crown preferred':
      '⚠ صرير أسنان: حواف الـ Onlay في خطر كسر عالٍ — يُفضَّل التاج الكامل',
    'High occlusal load risks marginal fracture at onlay preparation boundary':
      'الحمل الإطباقي العالي يرفع خطر كسر حواف تحضير الـ Onlay',
    'Smoking increases secondary caries risk at resin margins':
      'التدخين يرفع خطر التسوس الثانوي عند حواف الراتنج',
    'Poor hygiene: resin bond degrades under bacterial acid — crown preferred for margin integrity':
      'نظافة سيئة: الربط الراتنجي يتدهور في البيئة الحمضية — يُفضَّل التاج للحفاظ على الحواف',
    'Active decay compromises bond quality — full coverage preferred':
      'التسوس النشط يضعف جودة الربط — يُفضَّل التغطية الكاملة',

    // Crown / Crown+Core rationale
    'Post & core build-up required — adds structural risk but restores functional crown':
      'يتطلب بناء Post & Core — يضيف خطراً بنيوياً لكنه يعيد التاج الوظيفي',
    'Standard crown preparation with adequate ferrule support':
      'تحضير تاج معياري مع دعامة كافية',
    'Good ferrule (≥2mm): optimal fracture resistance predicted':
      'دعامة جيدة (≥2mm): مقاومة كسر مثلى متوقعة',
    'RCT completed: endodontic stability confirmed before crown':
      'RCT مكتمل: الاستقرار اللبّي مؤكد قبل التتويج',
    '⚠ Bruxism: monolithic zirconia required — occlusal night guard essential':
      '⚠ صرير أسنان: زركونيا صلبة مطلوبة — واقٍ إطباقي ليلي ضروري',
    'Poor hygiene: secondary caries at crown margins — strict maintenance protocol required':
      'نظافة سيئة: تسوس ثانوي محتمل عند حواف التاج — بروتوكول صيانة صارم مطلوب',

    // Splinted crowns rationale
    'High occlusal load: splinting distributes lateral forces — reduces individual crown fracture risk ~40%':
      'حمل إطباقي عالٍ: التجبيس يوزع القوى الجانبية — يقلل خطر كسر التاج الفردي بـ ~40%',
    'Bruxism: splinted crowns reduce lateral force concentration via shared occlusal surface':
      'صرير أسنان: التيجان المجبَّسة تقلل تركيز القوى الجانبية عبر سطح إطباقي مشترك',
    'Compromised ferrule: mutual support via splinting improves retention and load resistance':
      'دعامة متأثرة: الدعم المتبادل بالتجبيس يحسّن الاحتجاز ومقاومة الحمل',
    'Poor hygiene: splinted crowns create plaque-retentive embrasures — periodontitis risk elevated':
      'نظافة سيئة: التيجان المجبَّسة تُنشئ مناطق احتجاز البلاك — خطر التهاب اللثة مرتفع',
    'No clinical indication for splinting — separate crowns preferred for hygiene access and retrievability':
      'لا مؤشر سريري للتجبيس — تيجان منفصلة مفضَّلة لسهولة النظافة وإمكانية الاسترداد',

    // Endocrown rationale
    'RCT completed: endocrown is evidence-based first choice for posterior endodontically treated teeth (96% retention at 5 yrs)':
      'RCT مكتمل: Endocrown هو الخيار الأول المبني على الدليل للأسنان الخلفية المعالجة لبّياً (احتجاز 96% بعد 5 سنوات)',
    'Posterior position: pulp chamber macroretention distributes masticatory forces optimally':
      'الموضع الخلفي: الاحتجاز الكبير لغرفة اللب يوزع قوى المضغ بشكل أمثل',
    'No bruxism: endocrown fracture risk within normal range (92–94% survival at 5 years)':
      'لا صرير أسنان: خطر كسر Endocrown ضمن النطاق الطبيعي (92–94% نجاة بعد 5 سنوات)',
    '⚠ Bruxism: endocrown fracture risk elevated — monolithic zirconia or additional coverage recommended':
      '⚠ صرير أسنان: خطر كسر Endocrown مرتفع — يُوصى بزركونيا صلبة أو تغطية إضافية',
    'High occlusal load: monitor carefully — ensure adequate occlusal coverage thickness ≥2mm':
      'حمل إطباقي عالٍ: متابعة دقيقة مطلوبة — تأكد من سماكة التغطية الإطباقية ≥2mm',
    'Compromised ferrule: endocrown avoids post stress — macroretention superior to conventional post':
      'دعامة متأثرة: Endocrown يتجنب إجهاد Post — الاحتجاز الكبير أفضل من Post التقليدي',
    'Poor hygiene: marginal integrity monitoring essential to prevent secondary failure':
      'نظافة سيئة: مراقبة سلامة الحواف ضرورية لمنع الفشل الثانوي',
    'Maxillary position: less predictable chamber depth — endocrown retention 5–10% lower than mandibular molars (literature consensus)':
      'الموضع الفكي العلوي: عمق غرفة اللب أقل تنبؤاً — احتجاز Endocrown أقل بـ 5–10% مقارنة بالأرحاء السفلية (إجماع الأدبيات)',

    // Extract + Implant rationale
    'Tooth prognosis is guarded — extraction eliminates ongoing infection or fracture propagation risk':
      'تشخيص السن محاط بالمخاطر — الخلع يزيل خطر العدوى المستمرة أو تمدد الكسر',
    'Implant placement after healing: predictable outcome vs attempting to preserve compromised tooth':
      'زرع الإمبلانت بعد الشفاء: نتيجة أكثر قابلية للتنبؤ مقارنة بمحاولة الحفاظ على سن متأثر',
    'Poor bone: bone grafting required — extends treatment timeline 4–6 months':
      'عظم ضعيف: تطعيم عظمي مطلوب — يطيل مسار العلاج 4–6 أشهر',
    'Active smoker: extraction site healing and osseointegration significantly compromised':
      'مدخن نشط: شفاء موضع الخلع والاندماج العظمي متأثران بشكل ملحوظ',
    'Uncontrolled diabetes: impaired healing increases extraction and implant failure risk':
      'سكري غير متوازن: ضعف الشفاء يرفع خطر فشل الخلع والإمبلانت',
    'Hopeless tooth: extraction remains clinically preferred despite elevated systemic risk — defer implant timing if needed':
      'سن عديم الأمل: الخلع لا يزال الخيار السريري المفضل رغم الخطر الجهازي المرتفع — يمكن تأجيل توقيت الإمبلانت عند الحاجة',
    '⚠ Hopeless prognosis: tooth classified non-restorable — preservation attempts carry high failure risk regardless of individual treatment factors':
      '⚠ تشخيص عديم الأمل: السن مصنَّف غير قابل للترميم — محاولات الحفاظ تحمل خطر فشل مرتفعاً بغض النظر عن عوامل العلاج الفردية',

    // Escalation block (explainLayer.js)
    'Escalation path: extraction is indicated for a non-restorable tooth. Implant timing can be deferred to align with systemic readiness.':
      'مسار التصعيد: الخلع موضَّح لسن غير قابل للترميم. يمكن تأجيل توقيت الإمبلانت بما يتناسب مع الاستعداد الجهازي.',

    // Referral signals (explainLayer.js)
    'Bone grafting consult recommended — D3/D4 bone requires augmentation assessment before implant placement.':
      'يُوصى باستشارة تطعيم عظمي — العظم من درجة D3/D4 يتطلب تقييم تعزيز قبل زرع الإمبلانت.',
    'Glycemic optimization recommended before any surgical intervention — HbA1c ≥7.5% elevates procedural risk.':
      'تحسين ضبط السكر الدموي موصى به قبل أي تدخل جراحي — HbA1c ≥7.5% يرفع الخطر الإجرائي.',
    'Occlusal assessment before final restoration — active bruxism management is a prerequisite.':
      'تقييم الإطباق قبل التعويض النهائي — إدارة صرير الأسنان النشط شرط مسبق.',
    'Periodontal or oral surgery assessment may alter the recommended treatment sequence.':
      'قد يُغير تقييم اللثة أو جراحة الفم التسلسل العلاجي الموصى به.',

    // Confidence rationale — static variants (explainLayer.js)
    'Moderate confidence — competing clinical signals present.':
      'ثقة متوسطة — إشارات سريرية متنافسة.',
    'Lower confidence — stacked risk factors reduce recommendation certainty.':
      'ثقة منخفضة — عوامل خطر متراكمة تقلل يقين التوصية.',
  };

  // ── Factor pill label map ─────────────────────────────────────
  var FACTORS = {
    'Good ferrule ≥2mm':              'دعامة جيدة ≥2mm',
    'Poor ferrule <1mm':              'دعامة ضعيفة <1mm',
    'Bruxism — fracture risk':        'صرير أسنان — خطر كسر',
    'High occlusal load':             'حمل إطباقي مرتفع',
    'Poor bone quality':              'جودة عظم ضعيفة',
    'RCT done — stable':              'RCT مكتمل — مستقر',
    'RCT needed':                     'يحتاج RCT',
    'Poor hygiene — caries risk':     'نظافة سيئة — خطر تسوس',
    'Active smoker — healing risk':   'مدخن نشط — خطر تأخر الشفاء',
    'Uncontrolled DM — healing risk': 'سكري غير متوازن — خطر تأخر الشفاء',
    'Clenching — load risk':          'ضغط أسنان — خطر حمل',
  };

  // ── Treatment label map (for dynamic tradeoff / alt-scored strings) ──
  var TX_LABELS = {
    'Onlay / Overlay':   'Onlay / Overlay',
    'Endocrown':         'Endocrown',
    'Crown + Core':      'تاج + Core',
    'Crown':             'تاج',
    'Splinted Crowns':   'تيجان مجبَّسة',
    'Extract + Implant': 'خلع + إمبلانت',
  };

  // ── Confidence rationale parts map ────────────────────────────
  var CONF_PARTS = {
    'poor bone quality':                  'جودة عظم ضعيفة',
    'poor hygiene':                       'نظافة فموية سيئة',
    'bruxism':                            'صرير أسنان',
    'active smoking':                     'تدخين نشط',
    'uncontrolled diabetes':              'سكري غير متوازن',
    'RCT required before restoration':    'يتطلب RCT قبل الترميم',
    'extraction is a competitive option': 'الخلع خيار تنافسي',
  };

  // ── Translate comma-separated confidence parts ────────────────
  // "poor bone quality, bruxism." → "جودة عظم ضعيفة، صرير أسنان."
  function _trConfParts(partsStr) {
    var str = partsStr;
    var trailing = '';
    if (str.charAt(str.length - 1) === '.') {
      trailing = '.';
      str = str.slice(0, -1);
    }
    var parts = str.split(', ');
    var arParts = parts.map(function (p) { return CONF_PARTS[p] || p; });
    return arParts.join('، ') + trailing;
  }

  // ── Dynamic pattern matchers for score-embedded strings ───────
  // Handles tradeoff blocks and alt-scored-lower blocks that contain
  // numeric scores or treatment labels assembled at runtime.
  function _trDynamic(text) {

    // Tradeoff: extract scored higher
    // "Close decision: extraction scored higher (X% vs Y%) but preservation..."
    if (text.indexOf('Close decision: extraction scored higher (') === 0) {
      var mClose = text.match(/Close decision: extraction scored higher \((\d+\.?\d*)% vs (\d+\.?\d*)%\)/);
      if (mClose) {
        return 'قرار متقارب: الخلع أعلى نقاطاً (' + mClose[1] + '% مقابل ' + mClose[2] +
               '%) لكن الحفاظ على السن موصى به كخيار أول. أعد التقييم إذا ساءت الحالة.';
      }
    }

    // Tradeoff: preservation ahead — closely scored
    // "{label} (X%) vs Extract+Implant (Y%) — closely scored. Both pathways..."
    if (text.indexOf('% vs Extract+Implant (') !== -1) {
      var mClose2 = text.match(/^(.+?) \((\d+\.?\d*)%\) vs Extract\+Implant \((\d+\.?\d*)%\)/);
      if (mClose2) {
        var arLbl = TX_LABELS[mClose2[1]] || mClose2[1];
        return arLbl + ' (' + mClose2[2] + '%) مقابل خلع + إمبلانت (' + mClose2[3] +
               '%) — نقاط متقاربة. كلا المسارين مقبولان سريرياً.';
      }
    }

    // Alt scored lower: "{label} scored lower (Δ{X}%): {rationale_text}"
    var lowerIdx = text.indexOf(' scored lower (');
    if (lowerIdx !== -1) {
      var txLabel = text.slice(0, lowerIdx);
      var arTxLbl = TX_LABELS[txLabel] || txLabel;
      var rest = text.slice(lowerIdx + ' scored lower ('.length);
      var colonIdx = rest.indexOf('): ');
      if (colonIdx !== -1) {
        var delta = rest.slice(0, colonIdx);          // "Δ3.2%"
        var rationale = rest.slice(colonIdx + 3);     // rationale text
        var arRationale = PHRASES[rationale] || rationale;
        return arTxLbl + ' أقل نقاطاً (' + delta + '): ' + arRationale;
      }
    }

    // Confidence rationale — template form (parts assembled at runtime)
    // "Moderate confidence — part1, part2."
    if (text.indexOf('Moderate confidence — ') === 0) {
      return 'ثقة متوسطة — ' + _trConfParts(text.slice('Moderate confidence — '.length));
    }
    if (text.indexOf('Lower confidence — ') === 0) {
      return 'ثقة منخفضة — ' + _trConfParts(text.slice('Lower confidence — '.length));
    }

    return text; // unmapped — preserve original English
  }

  // ── Single-string translation ─────────────────────────────────
  function _tr(text) {
    if (!text) return text;
    return PHRASES[text] || _trDynamic(text);
  }

  // ── Main entry: localize a complete expl object ───────────────
  // Takes the output of denaiExplain.buildExplanation(ai).
  // Returns a structurally identical object with Arabic text.
  // Original expl is never modified.
  function localizeExpl(expl) {
    if (!expl) return expl;
    return {
      blocks: (expl.blocks || []).map(function (b) {
        return { type: b.type, text: _tr(b.text) };
      }),
      confidenceRationale: expl.confidenceRationale
        ? (_tr(expl.confidenceRationale) || expl.confidenceRationale)
        : expl.confidenceRationale,
      referralSignals: (expl.referralSignals || []).map(function (s) {
        return PHRASES[s] || s;
      }),
      factors: (expl.factors || []).map(function (f) {
        return { label: FACTORS[f.label] || f.label, type: f.type, delta: f.delta };
      }),
    };
  }

  return Object.freeze({
    getLang:      getLang,
    setLang:      setLang,
    isArabic:     isArabic,
    localizeExpl: localizeExpl,
  });
})();
