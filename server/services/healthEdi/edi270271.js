/**
 * Noesis.io Health - X12N 270 / 271 Eligibility Inquiry & Response
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * ⚠ SCAFFOLD ONLY - Production parser deferred.
 *
 * Target standard: ASC X12N 005010X279A1.
 *
 *   270 - Information Receiver (provider) -> Information Source (payer):
 *         "is this subscriber eligible for these service types?"
 *
 *   271 - Information Source (payer) -> Information Receiver (provider):
 *         eligibility response, including EB segments (Eligibility/Benefit)
 *         and III/HSD service-type qualifiers.
 *
 * Spec reference (loops per the 270/271 TR3, for future implementers):
 *   270 Builder loops:
 *     2000A Information Source (payer):    HL*1**20
 *       2100A NM1*PR (Payer)
 *     2000B Information Receiver:           HL*2*1*21
 *       2100B NM1*1P (Provider) + REF*EI
 *     2000C Subscriber:                     HL*3*2*22
 *       2100C NM1*IL + DMG + INS
 *       2110C EQ (Service Type)
 *
 *   271 Parser shape (planned):
 *     EB*1*FAM*30*HM           -> active coverage, service type 30 (Health
 *                                 Benefit Plan Coverage)
 *     EB*6*FAM*98*HM*1*22.5*A  -> copay $22.50 per visit (98 = Professional
 *                                 Visit - Office)
 *     EB*A*FAM*30              -> co-insurance percent
 *     EB*C*FAM*30              -> deductible
 *
 * Why this is a stub:
 *   The Noesis.io Health real-time eligibility path currently runs through
 *   payerEligibility.js (REST 270/271 against partner clearinghouse APIs).
 *   A native X12 270/271 builder/parser is on the roadmap to unblock direct
 *   payer EDI connections (Medicare, state Medicaid) that don't expose a
 *   REST eligibility endpoint. See docs/health/edi-roadmap.md.
 *
 * Until production wiring lands, build270/parse271 throw NOT_IMPLEMENTED so
 * callers fail fast rather than receiving plausible-but-wrong output.
 */

'use strict';

const VERSION_ID = '005010X279A1';

const MATURITY = 'scaffold';

function _notImplemented(method) {
  const err = new Error(
    method + ': X12 270/271 builder/parser is scaffold-only. ' +
    'Use the REST eligibility path (services/payerEligibility.js) for now. ' +
    'Production wiring tracked in docs/health/edi-roadmap.md.'
  );
  err.code = 'EDI_270271_NOT_IMPLEMENTED';
  err.status = 501;
  return err;
}

/**
 * Build a 270 Eligibility Inquiry envelope.
 *
 * Planned signature (do not rely on - throws today):
 *   build270({
 *     submitter:  { id, name },
 *     receiver:   { id, name },
 *     payer:      { name, payerId },
 *     provider:   { name, npi, taxId },
 *     subscriber: { lastName, firstName, memberId, dateOfBirth },
 *     serviceTypes: ['30', '98', 'AL', 'MH'],  // EB qualifiers to request
 *     envelope: { senderId, receiverId, usageIndicator, ... },
 *   }) -> { edi, controlNumbers, segmentCount, versionId }
 *
 * @returns {never}
 */
function build270(/* input */) {
  throw _notImplemented('build270');
}

/**
 * Parse a 271 Eligibility Response into normalized eligibility info.
 *
 * Planned return shape (do not rely on - throws today):
 *   {
 *     subscriber:   { memberId, name, dateOfBirth },
 *     coverage:     { active, planName, groupId, effectiveDate, terminationDate },
 *     benefits:     [{ serviceType, level, amount, percent, network }],
 *     controlNumbers, segmentCount,
 *   }
 *
 * @returns {never}
 */
function parse271(/* edi */) {
  throw _notImplemented('parse271');
}

module.exports = {
  VERSION_ID,
  MATURITY,
  build270,
  parse271,
};
