/**
 * Noesis.io Health - Claim Pre-Check / Denial Prevention Engine
 * © 2026 Athena Core Technologies, Inc.
 *
 * POST /api/v1/precheck         - Run pre-submission denial risk analysis
 * GET  /api/v1/precheck/:id     - Retrieve a saved precheck result
 * GET  /api/v1/precheck/history - List recent prechecks for this org
 *
 * ALL logic is deterministic (rules-based). No probabilistic or AI-generated
 * dollar amounts. Every score deduction maps to a specific CMS/NCCI rule.
 *
 * Risk score: 0-100 (higher = lower risk of denial)
 *   85-100  High Confidence   - Submit
 *   65-84   Medium Risk       - Review recommended before submitting
 *   0-64    High Risk         - Fix issues before submitting
 *
 * HIPAA: No PHI written to precheck_results. Patient name/DOB are NOT stored.
 * Only codes, scores, and flags are persisted.
 */

const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { authenticate } = require('../middleware/auth');

// ── In-memory fallback store (dev / no-DB mode) ────────────────────────────
const memStore = new Map();
let memIdSeq = 1;

// ── CMS 2024 National Fee Schedule (Professional, non-facility) ────────────
// Source: CMS Physician Fee Schedule Lookup Tool
// Rates are approximate national averages - must be updated annually.
// These are deterministic inputs, not AI-generated values.
const FEE_SCHEDULE = {
  '99213': { allowed: 115.00, desc: 'Office Visit - Established, Low Complexity' },
  '99214': { allowed: 166.00, desc: 'Office Visit - Established, Moderate Complexity' },
  '99215': { allowed: 219.00, desc: 'Office Visit - Established, High Complexity' },
  '99203': { allowed: 141.00, desc: 'Office Visit - New Patient, Low Complexity' },
  '99204': { allowed: 207.00, desc: 'Office Visit - New Patient, Moderate Complexity' },
  '99205': { allowed: 256.00, desc: 'Office Visit - New Patient, High Complexity' },
  '99211': { allowed: 25.00,  desc: 'Office Visit - Minimal Complexity' },
  '99202': { allowed: 93.00,  desc: 'Office Visit - New Patient, Straightforward' },
  '99212': { allowed: 78.00,  desc: 'Office Visit - Established, Straightforward' },
  '27447': { allowed: 1584.00, desc: 'Total Knee Arthroplasty' },
  '27130': { allowed: 1558.00, desc: 'Total Hip Arthroplasty' },
  '43239': { allowed: 832.00,  desc: 'Upper GI Endoscopy with Biopsy' },
  '43235': { allowed: 498.00,  desc: 'Upper GI Endoscopy, Diagnostic' },
  '45378': { allowed: 337.00,  desc: 'Colonoscopy, Diagnostic' },
  '45380': { allowed: 437.00,  desc: 'Colonoscopy with Biopsy' },
  '70553': { allowed: 405.00,  desc: 'MRI Brain with/without Contrast' },
  '70551': { allowed: 288.00,  desc: 'MRI Brain, without Contrast' },
  '70450': { allowed: 213.00,  desc: 'CT Head, without Contrast' },
  '71046': { allowed: 43.00,   desc: 'Chest X-Ray, 2 Views' },
  '71045': { allowed: 32.00,   desc: 'Chest X-Ray, 1 View' },
  '78816': { allowed: 1180.00, desc: 'PET Scan, Skull to Thigh' },
  '78814': { allowed: 980.00,  desc: 'PET Scan, Limited Area' },
  '93000': { allowed: 19.00,   desc: 'Electrocardiogram, 12-Lead' },
  '93306': { allowed: 355.00,  desc: 'Echocardiography with Doppler' },
  '93880': { allowed: 198.00,  desc: 'Carotid Ultrasound, Bilateral' },
  '20610': { allowed: 78.00,   desc: 'Arthrocentesis, Major Joint' },
  '20600': { allowed: 54.00,   desc: 'Arthrocentesis, Small Joint' },
  '85025': { allowed: 13.00,   desc: 'Complete Blood Count with Differential' },
  '80053': { allowed: 22.00,   desc: 'Comprehensive Metabolic Panel' },
  '80048': { allowed: 14.00,   desc: 'Basic Metabolic Panel' },
  '82947': { allowed: 8.00,    desc: 'Glucose, Blood' },
  '83036': { allowed: 16.00,   desc: 'Hemoglobin A1C' },
  '36415': { allowed: 3.00,    desc: 'Routine Venipuncture' },
  '90837': { allowed: 188.00,  desc: 'Psychotherapy, 60 min' },
  '90834': { allowed: 130.00,  desc: 'Psychotherapy, 45 min' },
  '90832': { allowed: 86.00,   desc: 'Psychotherapy, 30 min' },
  '97110': { allowed: 46.00,   desc: 'Therapeutic Exercise, 15 min' },
  '97012': { allowed: 28.00,   desc: 'Traction, Mechanical' },
  '97140': { allowed: 46.00,   desc: 'Manual Therapy Techniques' },
  '97530': { allowed: 52.00,   desc: 'Therapeutic Activities' },
  '59400': { allowed: 2328.00, desc: 'Routine Obstetric Care (Global)' },
  '76805': { allowed: 118.00,  desc: 'Ultrasound, Pregnant Uterus' },
  '33533': { allowed: 1806.00, desc: 'Coronary Artery Bypass Graft, Arterial' },
  '63030': { allowed: 1146.00, desc: 'Laminotomy, 1 Level' },
  '22551': { allowed: 1894.00, desc: 'Anterior Cervical Discectomy and Fusion' },
  '29827': { allowed: 742.00,  desc: 'Arthroscopy, Shoulder, Rotator Cuff Repair' },
  '29881': { allowed: 642.00,  desc: 'Arthroscopy, Knee, with Meniscectomy' },
  '11042': { allowed: 118.00,  desc: 'Debridement, Subcutaneous Tissue' },
  '17000': { allowed: 82.00,   desc: 'Destruction of Premalignant Lesion' },
  '11100': { allowed: 104.00,  desc: 'Biopsy of Skin Lesion' },
  '96372': { allowed: 25.00,   desc: 'Therapeutic Injection, Subcutaneous/IM' },
  '96360': { allowed: 32.00,   desc: 'IV Infusion, Initial' },
};

// ── Prior Authorization Requirements by Payer (representative set) ─────────
// Source: CMS Prior Auth Transparency Data + payer clinical policy bulletins
const PRIOR_AUTH_REQUIRED = {
  unitedhealth:    new Set(['27447', '27130', '43239', '70553', '78816', '78814', '22551', '63030', '29827', '33533']),
  anthem:          new Set(['27447', '27130', '43239', '70553', '78816', '78814', '22551', '63030', '59400', '33533']),
  aetna:           new Set(['27447', '27130', '43239', '70553', '78816', '22551', '33533', '29827']),
  cigna:           new Set(['27447', '27130', '43239', '70553', '78816', '78814', '22551', '29827']),
  humana:          new Set(['27447', '27130', '43239', '70553', '78816', '22551', '63030']),
  bluecross:       new Set(['27447', '27130', '43239', '70553', '78816', '22551', '63030', '33533']),
  medicare:        new Set(['27447', '27130', '78816', '78814']),
  medicaid:        new Set(['27447', '27130', '43239', '70553', '78816', '22551', '63030']),
  default:         new Set(['27447', '27130', '43239', '70553', '78816']),
};

// ── NCCI Mutually Exclusive Code Pairs (simplified representative set) ─────
// Source: CMS NCCI Policy Manual Chapter 1
// These code pairs cannot be billed together without a valid modifier
const MUTUALLY_EXCLUSIVE_PAIRS = [
  { codes: ['27447', '27130'], reason: 'Total knee and total hip replacement cannot be billed on same claim line without separate operative notes and distinct locations' },
  { codes: ['45378', '45380'], reason: 'Diagnostic colonoscopy (45378) is bundled into colonoscopy with biopsy (45380) - bill 45380 only' },
  { codes: ['43235', '43239'], reason: 'Diagnostic upper endoscopy (43235) is bundled into endoscopy with biopsy (43239) - bill 43239 only' },
  { codes: ['99213', '99214'], reason: 'Cannot bill two levels of E&M on same date for same patient' },
  { codes: ['99214', '99215'], reason: 'Cannot bill two levels of E&M on same date for same patient' },
  { codes: ['70551', '70553'], reason: 'Cannot bill MRI brain with and without contrast separately - use 70553 for combined' },
  { codes: ['71045', '71046'], reason: 'Cannot bill single-view and 2-view chest X-ray for same encounter - bill higher complexity only' },
  { codes: ['93000', '93306'], reason: 'Routine ECG (93000) is included in comprehensive echo (93306) when performed by same provider' },
];

// ── CPT Codes Requiring Specific Modifiers ────────────────────────────────
// Source: CMS Claims Processing Manual, Chapter 12
const MODIFIER_REQUIREMENTS = {
  '76805': { required: ['26', 'TC'], reason: 'Ultrasound requires professional component (26) or technical component (TC) modifier when applicable' },
  '70553': { required: ['26', 'TC'], reason: 'MRI requires professional component (26) or technical component (TC) modifier when applicable' },
  '70551': { required: ['26', 'TC'], reason: 'MRI requires professional component (26) or technical component (TC) modifier when applicable' },
  '70450': { required: ['26', 'TC'], reason: 'CT scan requires professional component (26) or technical component (TC) modifier when applicable' },
  '78816': { required: ['26', 'TC'], reason: 'PET scan requires professional component (26) or technical component (TC) modifier when applicable' },
  '85025': { required: ['90'], reason: 'Lab work sent to reference lab requires modifier 90' },
  '80053': { required: ['90'], reason: 'Lab work sent to reference lab requires modifier 90' },
};

// ── ICD-10 Medical Necessity Rules (Representative) ───────────────────────
// Maps CPT codes to valid ICD-10 prefix groups that support medical necessity
// Source: CMS Local Coverage Determinations (LCDs)
const MEDICAL_NECESSITY_RULES = {
  '27447': { validPrefixes: ['M17', 'M00', 'M01', 'M05', 'M06', 'S82', 'S72', 'M91', 'M92'], desc: 'Total knee replacement requires primary knee diagnosis (osteoarthritis M17, fracture S82, etc.)' },
  '27130': { validPrefixes: ['M16', 'M00', 'M01', 'M05', 'M06', 'S72', 'M91', 'M92'], desc: 'Total hip replacement requires primary hip diagnosis (osteoarthritis M16, fracture S72, etc.)' },
  '43239': { validPrefixes: ['K21', 'K25', 'K26', 'K27', 'K28', 'K29', 'K31', 'K92', 'D13', 'Z12'], desc: 'Upper GI endoscopy requires GI diagnosis (GERD K21, ulcer K25-K28, etc.)' },
  '45380': { validPrefixes: ['K63', 'K57', 'K56', 'K92', 'D12', 'Z12', 'C18', 'K51', 'K50'], desc: 'Colonoscopy with biopsy requires colorectal diagnosis or screening' },
  '70553': { validPrefixes: ['G35', 'G36', 'G37', 'I61', 'I62', 'I63', 'C71', 'G89', 'R51', 'G40', 'G43', 'G89'], desc: 'Brain MRI requires neurological indication (MS G35, stroke I63, tumor C71, etc.)' },
  '78816': { validPrefixes: ['C', 'D37', 'D38', 'D39', 'D40', 'D41', 'D42', 'D43', 'D44', 'D45', 'D46', 'D47', 'D48', 'D49'], desc: 'PET scan requires oncological indication (cancer staging or restaging)' },
  '33533': { validPrefixes: ['I25', 'I21', 'I22', 'I24', 'I20'], desc: 'Coronary bypass requires coronary artery disease diagnosis' },
  '90837': { validPrefixes: ['F', 'Z'], desc: 'Psychotherapy requires mental health diagnosis (F series)' },
  '90834': { validPrefixes: ['F', 'Z'], desc: 'Psychotherapy requires mental health diagnosis (F series)' },
  '97110': { validPrefixes: ['M', 'S', 'G'], desc: 'Therapeutic exercise requires musculoskeletal, injury, or neurological diagnosis' },
  '29827': { validPrefixes: ['M75', 'S46', 'M77', 'S40'], desc: 'Shoulder arthroscopy requires shoulder pathology diagnosis' },
  '29881': { validPrefixes: ['M23', 'S83', 'M22', 'M17'], desc: 'Knee arthroscopy requires knee pathology diagnosis' },
};

// ── Payer-Specific Timely Filing Limits (days from DOS) ───────────────────
const TIMELY_FILING_LIMITS = {
  medicare:     365,
  medicaid:     365,
  unitedhealth: 180,
  anthem:       180,
  aetna:        180,
  cigna:        180,
  humana:       180,
  bluecross:    180,
  default:      90,
};

// ── Scoring Engine ─────────────────────────────────────────────────────────

/**
 * Run the deterministic risk analysis on a claim pre-submission.
 *
 * @param {Object} params
 * @param {string[]} params.cptCodes         - Procedure codes to check
 * @param {string[]} params.icd10Codes       - Diagnosis codes
 * @param {string[]} params.modifiers        - Modifiers attached to CPT codes (optional)
 * @param {string}   params.payerName        - Payer name (normalized to lowercase key)
 * @param {string}   params.authorizationNumber - Pre-auth number if obtained (optional)
 * @param {boolean}  params.eligibilityVerified  - Whether eligibility was verified
 * @param {string}   params.dateOfService    - ISO date string
 * @param {string}   params.providerSpecialty - Provider specialty (optional)
 * @returns {Object} precheck result
 */
function runPrecheckEngine(params) {
  const {
    cptCodes = [],
    icd10Codes = [],
    modifiers = [],
    payerName = '',
    authorizationNumber = '',
    eligibilityVerified = false,
    dateOfService,
    providerSpecialty = '',
  } = params;

  let score = 100;
  const flags = [];
  const recommendations = [];

  const payerKey = normalizePayerName(payerName);
  const authRequired = PRIOR_AUTH_REQUIRED[payerKey] || PRIOR_AUTH_REQUIRED.default;

  // ── Rule 1: Prior Authorization Required ─────────────────────────────────
  const codesNeedingAuth = cptCodes.filter(c => authRequired.has(c));
  if (codesNeedingAuth.length > 0 && !authorizationNumber) {
    score -= 35;
    flags.push({
      severity: 'critical',
      code:     'PA-001',
      rule:     'Prior Authorization Required',
      detail:   `CPT code(s) ${codesNeedingAuth.join(', ')} require prior authorization from ${payerName || 'this payer'} before service can be rendered or claim submitted.`,
      fix:      'Obtain prior authorization via the Authorization module before submitting this claim. Keep the authorization number for the claim submission.',
    });
    recommendations.push('Obtain prior authorization before submitting');
  } else if (codesNeedingAuth.length > 0 && authorizationNumber) {
    flags.push({
      severity: 'info',
      code:     'PA-OK',
      rule:     'Prior Authorization Verified',
      detail:   `Authorization number ${authorizationNumber} on file for ${codesNeedingAuth.join(', ')}.`,
      fix:      null,
    });
  }

  // ── Rule 2: Mutually Exclusive Code Pairs (NCCI Bundling) ────────────────
  for (const pair of MUTUALLY_EXCLUSIVE_PAIRS) {
    const matched = pair.codes.filter(c => cptCodes.includes(c));
    if (matched.length >= 2) {
      // Check if modifier 59 is present (allows unbundling in some cases)
      const has59 = modifiers.includes('59') || modifiers.includes('XS') || modifiers.includes('XU');
      if (!has59) {
        score -= 25;
        flags.push({
          severity: 'critical',
          code:     'NCCI-001',
          rule:     'NCCI Bundling Conflict',
          detail:   `Codes ${matched.join(' + ')} cannot be billed together: ${pair.reason}`,
          fix:      'Remove the lower-valued code, or add modifier 59 if services were distinct and separately documented in the clinical note.',
        });
        recommendations.push(`Resolve NCCI conflict: ${matched.join(' + ')}`);
      } else {
        flags.push({
          severity: 'warning',
          code:     'NCCI-MOD59',
          rule:     'NCCI Bundling - Modifier 59 Applied',
          detail:   `Modifier 59 is attached to unbundle ${matched.join(' + ')}. Ensure clinical documentation clearly supports distinct services at separate sites or sessions.`,
          fix:      'Verify operative notes, session notes, or clinical records document distinctly separate services to support the modifier 59 unbundling.',
        });
        score -= 5; // Minor risk - documentation must be airtight
      }
    }
  }

  // ── Rule 3: Medical Necessity (ICD-10 / CPT Pairing) ────────────────────
  for (const cpt of cptCodes) {
    const rule = MEDICAL_NECESSITY_RULES[cpt];
    if (rule && icd10Codes.length > 0) {
      const hasValidDx = icd10Codes.some(icd =>
        rule.validPrefixes.some(prefix => icd.startsWith(prefix))
      );
      if (!hasValidDx) {
        score -= 22;
        flags.push({
          severity: 'critical',
          code:     'MN-001',
          rule:     'Medical Necessity - Diagnosis Mismatch',
          detail:   `CPT ${cpt} (${FEE_SCHEDULE[cpt]?.desc || cpt}) does not appear to be supported by the submitted diagnosis code(s) ${icd10Codes.join(', ')}. ${rule.desc}`,
          fix:      'Review and correct the ICD-10 diagnosis code to accurately reflect the clinical indication for this procedure. The diagnosis must support medical necessity per payer LCD/NCD policies.',
        });
        recommendations.push(`Verify ICD-10 codes support medical necessity for ${cpt}`);
      }
    }
  }

  // ── Rule 4: Modifier Requirements for Imaging / Lab ──────────────────────
  for (const cpt of cptCodes) {
    const modReq = MODIFIER_REQUIREMENTS[cpt];
    if (modReq) {
      const hasRequiredMod = modReq.required.some(m => modifiers.includes(m));
      if (!hasRequiredMod) {
        score -= 12;
        flags.push({
          severity: 'warning',
          code:     'MOD-001',
          rule:     'Modifier May Be Required',
          detail:   `CPT ${cpt} may require modifier ${modReq.required.join(' or ')} depending on billing arrangement. ${modReq.reason}`,
          fix:      'Confirm with your billing team whether a component modifier (26/TC) or reference lab modifier (90) applies to this service.',
        });
      }
    }
  }

  // ── Rule 5: Eligibility Not Verified ─────────────────────────────────────
  if (!eligibilityVerified) {
    score -= 15;
    flags.push({
      severity: 'warning',
      code:     'ELG-001',
      rule:     'Eligibility Not Verified',
      detail:   'Patient insurance eligibility has not been verified for this date of service. Submitting without eligibility verification increases denial risk for coverage-related reasons (CO-27, CO-31).',
      fix:      'Use the Eligibility module to verify patient coverage before submitting this claim.',
    });
    recommendations.push('Verify patient eligibility before submitting');
  }

  // ── Rule 6: Unknown CPT Codes (not in fee schedule) ─────────────────────
  const unknownCpts = cptCodes.filter(c => !FEE_SCHEDULE[c]);
  if (unknownCpts.length > 0) {
    score -= 8 * unknownCpts.length;
    flags.push({
      severity: 'warning',
      code:     'CPT-001',
      rule:     'CPT Code Not in Standard Fee Schedule',
      detail:   `Code(s) ${unknownCpts.join(', ')} are not in the standard fee schedule reference. This may indicate unlisted procedure codes, new codes, or data entry errors.`,
      fix:      'Verify these are correct CPT codes. Unlisted procedure codes (ending in 99) require a special report attachment and have high denial rates.',
    });
  }

  // ── Rule 7: No CPT Codes Submitted ───────────────────────────────────────
  if (cptCodes.length === 0) {
    score -= 40;
    flags.push({
      severity: 'critical',
      code:     'CPT-000',
      rule:     'No Procedure Codes',
      detail:   'Claim has no procedure codes. A claim cannot be submitted without at least one CPT/HCPCS procedure code.',
      fix:      'Add the appropriate CPT procedure code(s) for the service rendered.',
    });
  }

  // ── Rule 8: No Diagnosis Codes ───────────────────────────────────────────
  if (icd10Codes.length === 0) {
    score -= 30;
    flags.push({
      severity: 'critical',
      code:     'DX-000',
      rule:     'No Diagnosis Codes',
      detail:   'Claim has no ICD-10 diagnosis codes. Every claim requires at least one primary diagnosis.',
      fix:      'Add the ICD-10-CM diagnosis code(s) that support the medical necessity for each procedure billed.',
    });
  }

  // ── Rule 9: Timely Filing Check ──────────────────────────────────────────
  if (dateOfService) {
    const dos = new Date(dateOfService);
    const today = new Date();
    const daysSince = Math.floor((today - dos) / (1000 * 60 * 60 * 24));
    const limit = TIMELY_FILING_LIMITS[payerKey] || TIMELY_FILING_LIMITS.default;
    const warningThreshold = Math.floor(limit * 0.75);

    if (daysSince > limit) {
      score -= 50;
      flags.push({
        severity: 'critical',
        code:     'TF-001',
        rule:     'Timely Filing Limit Exceeded',
        detail:   `The date of service (${dateOfService}) is ${daysSince} days ago. ${payerName || 'This payer'} has a ${limit}-day timely filing limit. This claim will be denied as untimely (CO-29).`,
        fix:      'Claims past timely filing limits cannot be recovered unless you have documentation of a prior timely submission attempt. Consult your billing team.',
      });
    } else if (daysSince > warningThreshold) {
      score -= 10;
      flags.push({
        severity: 'warning',
        code:     'TF-002',
        rule:     'Approaching Timely Filing Limit',
        detail:   `Date of service is ${daysSince} days ago. ${payerName || 'This payer'} has a ${limit}-day limit. You have approximately ${limit - daysSince} days remaining. Submit promptly.`,
        fix:      'Submit this claim today to avoid timely filing denial.',
      });
      recommendations.push('Submit urgently - approaching timely filing limit');
    }
  }

  // ── Clamp score to [0, 100] ───────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  // ── Estimate reimbursement (deterministic) ───────────────────────────────
  const estimatedReimbursement = computeEstimatedReimbursement(cptCodes, payerKey);

  // ── Build result ──────────────────────────────────────────────────────────
  const riskLevel = score >= 85 ? 'low' : score >= 65 ? 'medium' : 'high';
  const recommendation = riskLevel === 'low'
    ? 'Claim appears ready for submission. No critical issues detected.'
    : riskLevel === 'medium'
      ? 'Review flagged items before submitting. Medium risk of denial without corrections.'
      : 'Do not submit until critical issues are resolved. High probability of denial.';

  return {
    score,
    riskLevel,
    recommendation,
    flags,
    recommendations: recommendations.length > 0 ? recommendations : ['No action required - claim appears clean'],
    estimatedReimbursement,
    cptSummary: cptCodes.map(c => ({
      code: c,
      description: FEE_SCHEDULE[c]?.desc || 'Unknown procedure',
      allowedAmount: FEE_SCHEDULE[c]?.allowed || null,
    })),
    payerResolved: payerKey,
    priorAuthRequired: codesNeedingAuth,
    rulesApplied: [
      'CMS NCCI Bundling Rules',
      'Prior Authorization Requirements',
      'ICD-10 Medical Necessity (LCD/NCD)',
      'Modifier Requirements',
      'Eligibility Verification Status',
      'Timely Filing Limits',
    ],
    disclaimer: 'This pre-check is based on standard CMS rules and representative payer policies. Actual adjudication decisions may vary. Always verify against current payer Clinical Policy Bulletins.',
  };
}

/**
 * Compute deterministic estimated reimbursement.
 * Uses CMS national rates as a floor; commercial payers typically reimburse at
 * 115-140% of Medicare depending on contract tier.
 * Returns the sum of allowed amounts for all recognized CPT codes.
 * Returns null if no recognized codes are in the claim.
 */
function computeEstimatedReimbursement(cptCodes, payerKey) {
  const knownCodes = cptCodes.filter(c => FEE_SCHEDULE[c]);
  if (knownCodes.length === 0) return null;

  const medicareTotal = knownCodes.reduce((sum, c) => sum + FEE_SCHEDULE[c].allowed, 0);

  // Commercial payer multipliers (representative - actual rates per contract)
  const multipliers = {
    medicare:     1.00,
    medicaid:     0.80,
    unitedhealth: 1.20,
    anthem:       1.18,
    aetna:        1.22,
    cigna:        1.19,
    humana:       1.15,
    bluecross:    1.21,
    default:      1.15,
  };

  const multiplier = multipliers[payerKey] || multipliers.default;
  const estimated = Math.round(medicareTotal * multiplier * 100) / 100;

  return {
    medicare_floor:    Math.round(medicareTotal * 100) / 100,
    estimated_allowed: estimated,
    multiplier_applied: multiplier,
    currency: 'USD',
    note: 'Estimated based on CMS national rates and representative commercial payer multipliers. Actual reimbursement is determined by your specific contracted rates.',
  };
}

/**
 * Normalize payer name to internal key.
 */
function normalizePayerName(name) {
  if (!name) return 'default';
  const n = name.toLowerCase().replace(/[^a-z]/g, '');
  if (n.includes('united') || n.includes('uhc') || n.includes('optum')) return 'unitedhealth';
  if (n.includes('anthem') || n.includes('elevance') || n.includes('wellpoint')) return 'anthem';
  if (n.includes('aetna') || n.includes('cvs')) return 'aetna';
  if (n.includes('cigna') || n.includes('evernorth')) return 'cigna';
  if (n.includes('humana')) return 'humana';
  if (n.includes('blue') || n.includes('bcbs') || n.includes('carefirst')) return 'bluecross';
  if (n.includes('medicare') || n.includes('cms')) return 'medicare';
  if (n.includes('medicaid') || n.includes('ahcccs') || n.includes('medi-cal')) return 'medicaid';
  return 'default';
}

// ── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/precheck
 * Run denial prevention pre-check on a claim before submission.
 *
 * Request body:
 * {
 *   cptCodes:             string[]   - Required. Procedure codes.
 *   icd10Codes:           string[]   - Required. Diagnosis codes.
 *   modifiers:            string[]   - Optional. Modifiers applied.
 *   payerName:            string     - Required. Payer name.
 *   authorizationNumber:  string     - Optional. PA number if obtained.
 *   eligibilityVerified:  boolean    - Optional. Whether eligibility was verified.
 *   dateOfService:        string     - Optional. ISO date (YYYY-MM-DD).
 *   providerSpecialty:    string     - Optional. Provider specialty.
 *   claimId:              string     - Optional. Associate result with existing claim.
 * }
 */
router.post('/', authenticate, async (req, res) => {
  const {
    cptCodes,
    icd10Codes,
    modifiers = [],
    payerName,
    authorizationNumber,
    eligibilityVerified = false,
    dateOfService,
    providerSpecialty,
    claimId,
  } = req.body;

  // Basic input validation
  if (!cptCodes || !Array.isArray(cptCodes)) {
    return res.status(400).json({ error: 'cptCodes must be an array of procedure codes', code: 'VALIDATION_ERROR' });
  }
  if (!icd10Codes || !Array.isArray(icd10Codes)) {
    return res.status(400).json({ error: 'icd10Codes must be an array of diagnosis codes', code: 'VALIDATION_ERROR' });
  }
  if (!payerName || typeof payerName !== 'string') {
    return res.status(400).json({ error: 'payerName is required', code: 'VALIDATION_ERROR' });
  }

  // Sanitize inputs
  const sanitizedCptCodes  = cptCodes.map(c => String(c).replace(/[^0-9A-Za-z]/g, '').toUpperCase()).filter(Boolean);
  const sanitizedIcd10     = icd10Codes.map(c => String(c).replace(/[^0-9A-Za-z.]/g, '').toUpperCase()).filter(Boolean);
  const sanitizedModifiers = modifiers.map(m => String(m).replace(/[^0-9A-Za-z]/g, '').toUpperCase()).filter(Boolean);

  try {
    // Run the rules engine
    const result = runPrecheckEngine({
      cptCodes:           sanitizedCptCodes,
      icd10Codes:         sanitizedIcd10,
      modifiers:          sanitizedModifiers,
      payerName:          String(payerName).trim(),
      authorizationNumber: authorizationNumber ? String(authorizationNumber).trim() : '',
      eligibilityVerified: Boolean(eligibilityVerified),
      dateOfService:      dateOfService || null,
      providerSpecialty:  providerSpecialty || '',
    });

    // Persist result (audit trail - no PHI stored)
    let savedId = null;

    if (db.isConnected()) {
      try {
        const { rows } = await db.query(
          `INSERT INTO claim_prechecks
            (org_id, provider_id, cpt_codes, icd10_codes, payer_name, risk_score, risk_level,
             flags_count, critical_flags, claim_id, auth_number_provided, eligibility_verified, date_of_service)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            req.user.orgId || req.user.id,
            req.user.id,
            JSON.stringify(sanitizedCptCodes),
            JSON.stringify(sanitizedIcd10),
            payerName,
            result.score,
            result.riskLevel,
            result.flags.length,
            result.flags.filter(f => f.severity === 'critical').length,
            claimId || null,
            Boolean(authorizationNumber),
            Boolean(eligibilityVerified),
            dateOfService || null,
          ]
        );
        savedId = rows[0].id;
      } catch (dbErr) {
        // Non-fatal - fall through without saving
        console.warn('precheck: DB save failed (non-fatal):', dbErr.message);
      }
    } else {
      // In-memory fallback
      savedId = `mem-${memIdSeq++}`;
      memStore.set(savedId, {
        ...result,
        id:         savedId,
        created_at: new Date().toISOString(),
        org_id:     req.user.orgId || req.user.id,
        provider_id: req.user.id,
        cpt_codes:  sanitizedCptCodes,
        icd10_codes: sanitizedIcd10,
        payer_name: payerName,
      });
    }

    return res.status(200).json({
      id:         savedId,
      ...result,
      analyzedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('precheck error:', err);
    return res.status(500).json({ error: 'Pre-check analysis failed', code: 'PRECHECK_ERROR' });
  }
});

/**
 * GET /api/v1/precheck/history
 * List recent precheck results for this organization.
 */
router.get('/history', authenticate, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  if (db.isConnected()) {
    try {
      const { rows } = await db.query(
        `SELECT id, cpt_codes, payer_name, risk_score, risk_level, flags_count,
                critical_flags, claim_id, date_of_service, created_at
         FROM claim_prechecks
         WHERE org_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.user.orgId || req.user.id, limit]
      );
      return res.json(rows);
    } catch (err) {
      console.error('precheck history error:', err);
      return res.status(500).json({ error: 'Failed to retrieve precheck history' });
    }
  }

  // In-memory fallback
  const results = Array.from(memStore.values())
    .filter(r => r.org_id === (req.user.orgId || req.user.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);

  return res.json(results);
});

/**
 * GET /api/v1/precheck/:id
 * Retrieve a specific precheck result by ID.
 */
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  if (db.isConnected()) {
    try {
      const { rows } = await db.query(
        `SELECT * FROM claim_prechecks WHERE id = $1 AND org_id = $2`,
        [id, req.user.orgId || req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Precheck result not found' });
      return res.json(rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve precheck' });
    }
  }

  const result = memStore.get(id);
  if (!result || result.org_id !== (req.user.orgId || req.user.id)) {
    return res.status(404).json({ error: 'Precheck result not found' });
  }
  return res.json(result);
});

/**
 * GET /api/v1/precheck/fee-schedule/:cptCode
 * Look up the fee schedule for a specific CPT code (public reference, authenticated).
 */
router.get('/fee-schedule/:cptCode', authenticate, (req, res) => {
  const cpt = req.params.cptCode.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const entry = FEE_SCHEDULE[cpt];
  if (!entry) {
    return res.status(404).json({ error: 'CPT code not in standard fee schedule reference', code: cpt });
  }
  return res.json({
    code: cpt,
    description: entry.desc,
    medicare_allowed: entry.allowed,
    currency: 'USD',
    note: 'CMS 2024 national non-facility rate. Actual contracted rates may differ.',
  });
});

module.exports = router;
