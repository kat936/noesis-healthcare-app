/**
 * Noesis.io Health  - X12N 835 Health Care Claim Payment / Advice (ERA)
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Parser for ASC X12N 005010X221A1 - the Electronic Remittance Advice.
 * The payer issues an 835 to communicate adjudication results: paid amount,
 * patient responsibility, contractual adjustments, denial reasons, and the
 * EFT or check details.
 *
 * Spec reference (loops per the 835 TR3):
 *   Header:                       BPR (financial info) + TRN (reassociation trace)
 *   1000A Payer:                  N1*PR + N3 + N4 + REF*2U/EV + PER*BL/IC
 *   1000B Payee (provider):       N1*PE + N3 + N4 + REF*TJ/PQ
 *   2000 Header Number:           LX
 *   2100 Claim Payment:           CLP + CAS (claim adjustments) + NM1
 *   2110 Service Payment:         SVC + CAS (service-line adjustments) +
 *                                 DTM (service date) + REF*6R (line ref) +
 *                                 AMT*B6 (allowed amount)
 *   Footer:                       PLB (provider-level adjustments)
 *
 * Edge cases handled:
 *   - Zero-payment claims: BPR02=0.00 with non-empty CLP entries (denials,
 *     full-write-off contractual adjustments)
 *   - Multi-claim ERAs (typical); we close out CLP into the payments array
 *     on each new CLP / footer
 *   - Patient responsibility split across CAS group codes PR (patient),
 *     CO (contractual), OA (other adjustment), PI (payer-initiated)
 *   - PLB provider-level adjustments captured separately from claim CAS
 */

'use strict';

const env = require('./x12Envelope');

const VERSION_ID = '005010X221A1';

// CARC: Claim Adjustment Reason Codes (subset)
const CARC_DESCRIPTIONS = Object.freeze({
  '1':   'Deductible amount',
  '2':   'Coinsurance amount',
  '3':   'Co-payment amount',
  '4':   'Procedure code inconsistent with modifier',
  '18':  'Exact duplicate claim/service',
  '22':  'Coverage not in effect at time of service',
  '24':  'Charges covered under capitation agreement',
  '29':  'Time limit for filing has expired',
  '45':  'Charge exceeds fee schedule / max allowable',
  '50':  'Non-covered services (not deemed medical necessity)',
  '96':  'Non-covered charges',
  '97':  'Service included in payment for another service',
  '109': 'Claim/service not covered by this payer/contractor',
  '197': 'Pre-certification / authorization absent',
  '204': 'Service not covered under patient current benefit plan',
});

// CAS group codes - HIPAA standard
const GROUP_DESCRIPTIONS = Object.freeze({
  'CO': 'Contractual obligation',
  'PR': 'Patient responsibility',
  'OA': 'Other adjustment',
  'PI': 'Payer-initiated reduction',
  'CR': 'Correction or reversal',
});

// CLP02 claim status code -> normalized
const CLAIM_STATUS = Object.freeze({
  '1':  'paid',
  '2':  'paid_secondary',
  '3':  'paid_tertiary',
  '4':  'denied',
  '5':  'pended',
  '19': 'forwarded_secondary',
  '20': 'forwarded_tertiary',
  '22': 'reversal_of_previous_payment',
  '23': 'not_our_claim',
  '25': 'predetermination',
});

/**
 * Parse a complete 835 ERA into normalized JS objects.
 *
 * @param {string} edi
 * @returns {object}
 */
function parse835(edi) {
  if (!edi || typeof edi !== 'string') {
    throw new Error('parse835: edi must be a non-empty string');
  }
  const { segments } = env.parseSegments(edi);

  const out = {
    versionId:       null,
    interchangeDate: null,
    paymentMethod:   null,
    paymentAmount:   null,
    paymentDate:     null,
    creditDebitFlag: null,
    payerIdentifier: null,
    payeeIdentifier: null,
    traceNumber:     null,
    payer:           null,
    payee:           null,
    payments:        [],
    providerLevelAdjustments: [],
    summary: {
      claimCount:           0,
      totalCharged:         0,
      totalPaid:            0,
      totalPatientLiability: 0,
      totalContractual:     0,
    },
  };

  let currentClaim = null;
  let currentService = null;
  let entityCtx = null;

  function _closeClaim() {
    if (!currentClaim) { return; }
    if (currentService) { currentClaim.serviceLines.push(currentService); currentService = null; }
    out.payments.push(currentClaim);
    out.summary.claimCount         += 1;
    out.summary.totalCharged       += currentClaim.claimAmount   || 0;
    out.summary.totalPaid          += currentClaim.paidAmount    || 0;
    out.summary.totalPatientLiability += currentClaim.patientResponsibility || 0;
    out.summary.totalContractual   += currentClaim.contractualAdjustment    || 0;
    currentClaim = null;
  }

  for (const seg of segments) {
    const id = seg[0];
    switch (id) {
      case 'GS':
        out.versionId       = seg[8];
        out.interchangeDate = seg[4];
        break;

      case 'BPR':
        out.creditDebitFlag = seg[3]; // C credit, D debit
        out.paymentMethod   = seg[4]; // ACH, CHK, FWT, NON, BOP
        out.paymentAmount   = Number(seg[2]) || 0;
        out.paymentDate     = seg[16] || null;
        break;

      case 'TRN':
        out.traceNumber      = seg[2];
        out.payerIdentifier  = seg[3];
        out.payeeIdentifier  = seg[4];
        break;

      case 'N1': {
        const ent = seg[1];
        if (ent === 'PR') { out.payer = { name: seg[2], idQualifier: seg[3], id: seg[4] }; entityCtx = 'payer'; }
        else if (ent === 'PE') { out.payee = { name: seg[2], idQualifier: seg[3], id: seg[4] }; entityCtx = 'payee'; }
        break;
      }
      case 'N3':
        if (entityCtx === 'payer' && out.payer) { out.payer.address = seg[1]; }
        else if (entityCtx === 'payee' && out.payee) { out.payee.address = seg[1]; }
        break;
      case 'N4':
        if (entityCtx === 'payer' && out.payer) {
          out.payer.city = seg[1]; out.payer.state = seg[2]; out.payer.zip = seg[3];
        } else if (entityCtx === 'payee' && out.payee) {
          out.payee.city = seg[1]; out.payee.state = seg[2]; out.payee.zip = seg[3];
        }
        break;
      case 'REF':
        if (entityCtx === 'payee' && out.payee && (seg[1] === 'TJ' || seg[1] === 'EI')) {
          out.payee.taxId = seg[2];
        } else if (entityCtx === 'payee' && out.payee && seg[1] === 'PQ') {
          out.payee.payeeIdentifier = seg[2];
        }
        break;

      case 'CLP': {
        _closeClaim();
        const statusCode = seg[2];
        currentClaim = {
          claimId:           seg[1],
          statusCode,
          status:            CLAIM_STATUS[statusCode] || 'other',
          claimAmount:       Number(seg[3]) || 0,
          paidAmount:        Number(seg[4]) || 0,
          patientResponsibility: Number(seg[5]) || 0,
          contractualAdjustment: 0,
          claimFilingIndicator:  seg[6] || null,
          payerClaimControlNumber: seg[7] || null,
          facilityType:      seg[8] || null,
          claimFrequencyCode: seg[9] || null,
          adjustments:       [], // claim-level CAS
          serviceLines:      [],
          patient:           null,
          subscriber:        null,
          renderingProvider: null,
        };
        currentService = null;
        break;
      }
      case 'CAS': {
        const adj = _parseCasSegment(seg);
        if (currentService) {
          currentService.adjustments.push(adj);
        } else if (currentClaim) {
          currentClaim.adjustments.push(adj);
          if (adj.groupCode === 'CO') {
            currentClaim.contractualAdjustment += adj.totalAmount;
          }
        }
        break;
      }
      case 'NM1': {
        if (!currentClaim) { break; }
        const ent = seg[1];
        if (ent === 'QC')      { currentClaim.patient    = { lastName: seg[3], firstName: seg[4], memberId: seg[9] }; }
        else if (ent === 'IL') { currentClaim.subscriber = { lastName: seg[3], firstName: seg[4], memberId: seg[9] }; }
        else if (ent === '82') { currentClaim.renderingProvider = { lastName: seg[3], firstName: seg[4], npi: seg[9] }; }
        break;
      }
      case 'SVC': {
        if (!currentClaim) { break; }
        if (currentService) { currentClaim.serviceLines.push(currentService); }
        const composite = String(seg[1] || '').split(':');
        currentService = {
          procedureQualifier: composite[0] || null,
          cptCode:           composite[1] || null,
          modifiers:         composite.slice(2),
          chargedAmount:     Number(seg[2]) || 0,
          paidAmount:        Number(seg[3]) || 0,
          revenueCode:       seg[4] || null,
          unitsOfService:    Number(seg[5]) || null,
          adjustments:       [],
          serviceDate:       null,
          referenceLineNumber: null,
        };
        break;
      }
      case 'DTM':
        if (currentService && seg[1] === '472') { currentService.serviceDate = seg[2]; }
        if (currentClaim && !currentService && seg[1] === '232') { currentClaim.serviceFromDate = seg[2]; }
        if (currentClaim && !currentService && seg[1] === '233') { currentClaim.serviceToDate   = seg[2]; }
        break;
      case 'AMT':
        if (currentService && seg[1] === 'B6') { currentService.allowedAmount = Number(seg[2]); }
        if (currentClaim && !currentService && seg[1] === 'AU') { currentClaim.coverageAmount = Number(seg[2]); }
        break;
      case 'PLB': {
        // Provider-Level Balance Information (footer)
        // PLB02 = fiscal period end (CCYYMMDD)
        // PLB03..PLB14 = pairs of (reasonCode:reference, amount)
        const plb = {
          providerId:     seg[1],
          fiscalPeriodEnd: seg[2],
          adjustments:    [],
        };
        for (let i = 3; i < seg.length - 1; i += 2) {
          const composite = String(seg[i] || '').split(':');
          const amt = Number(seg[i + 1]);
          if (composite[0] && Number.isFinite(amt)) {
            plb.adjustments.push({
              reasonCode: composite[0],
              reference:  composite[1] || null,
              amount:     amt,
            });
          }
        }
        out.providerLevelAdjustments.push(plb);
        break;
      }
      default:
        break;
    }
  }
  _closeClaim();

  // Round summary totals to two decimals to avoid float wobble
  out.summary.totalCharged          = _round2(out.summary.totalCharged);
  out.summary.totalPaid             = _round2(out.summary.totalPaid);
  out.summary.totalPatientLiability = _round2(out.summary.totalPatientLiability);
  out.summary.totalContractual      = _round2(out.summary.totalContractual);

  return out;
}

function _parseCasSegment(seg) {
  // CAS segment layout: CAS*<group>*<reason>*<amount>*<qty>*<reason2>*<amount2>*<qty2>*...
  // Triplets after the first three are optional.
  const groupCode = seg[1];
  const lines = [];
  let totalAmount = 0;
  let i = 2;
  while (i < seg.length) {
    const reasonCode = seg[i];
    const amount     = Number(seg[i + 1]);
    const quantity   = seg[i + 2] !== undefined ? Number(seg[i + 2]) : null;
    if (!reasonCode || !Number.isFinite(amount)) { break; }
    lines.push({
      reasonCode,
      amount,
      quantity:    Number.isFinite(quantity) ? quantity : null,
      description: CARC_DESCRIPTIONS[reasonCode] || null,
    });
    totalAmount += amount;
    i += 3;
  }
  return {
    groupCode,
    groupDescription: GROUP_DESCRIPTIONS[groupCode] || null,
    lines,
    totalAmount: _round2(totalAmount),
  };
}

function _round2(v) {
  return Math.round(v * 100) / 100;
}

module.exports = {
  VERSION_ID,
  CARC_DESCRIPTIONS,
  GROUP_DESCRIPTIONS,
  CLAIM_STATUS,
  parse835,
};
