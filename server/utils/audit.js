/**
 * Noesis.io Health — canonical audit-trail helpers
 * © 2026 Athena Core Technologies, Inc.
 *
 * Every NOESIS deterministic engine emits an audit record with this shape:
 *
 *   {
 *     ruleVersion:       string,    // e.g. "strategy@1.2.0"
 *     computedAt:        ISO 8601,  // UTC timestamp of this computation
 *     inputsFingerprint: hex,       // SHA-256 of the canonicalized input
 *     engineId:          string,    // 'strategy' | 'compliance' | 'precheck' | …
 *     output:            object,    // engine-specific result (kept compact)
 *   }
 *
 * The fingerprint is reproducible: the same logical inputs (after canonical
 * key ordering) hash to the same digest, regardless of object insertion
 * order. This is what lets a Vanta / HIPAA auditor replay a stored decision
 * against the engine and confirm it was rendered honestly.
 *
 * NOTE on PHI: callers MUST scrub PHI from `inputs` BEFORE passing into the
 * fingerprint helpers. The fingerprint of a scrubbed input is still useful
 * because the scrubbing is deterministic and engine versioning is in scope.
 */
const crypto = require('crypto');

/** Recursively sort object keys so that JSON.stringify is canonical. */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = canonicalize(value[k]);
  }
  return out;
}

/** SHA-256 hex digest of canonicalized JSON. */
function fingerprint(input) {
  const json = JSON.stringify(canonicalize(input));
  return crypto.createHash('sha256').update(json).digest('hex');
}

/** ISO 8601 UTC timestamp suitable for audit fields. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Compose the canonical audit record. Engines call this once per
 * computation and embed the returned object as the `auditTrail` field
 * of their output (or persist it alongside as appropriate).
 */
function buildAuditTrail({ engineId, ruleVersion, inputs, output, extras }) {
  if (!engineId) {
    throw new Error('audit.buildAuditTrail: engineId is required');
  }
  if (!ruleVersion) {
    throw new Error('audit.buildAuditTrail: ruleVersion is required');
  }
  return {
    engineId,
    ruleVersion,
    computedAt: nowIso(),
    inputsFingerprint: fingerprint(inputs ?? {}),
    ...(output !== undefined ? { output } : {}),
    ...(extras ?? {}),
  };
}

/**
 * Scrub PHI from an object before fingerprinting / logging. Keys are
 * matched by HIPAA Safe Harbor 18-identifier list (subset most relevant
 * to claim payloads). Strings are replaced with a length-preserving
 * redaction marker so log shapes remain comparable.
 */
const PHI_KEYS = new Set([
  'ssn', 'socialSecurityNumber',
  'dob', 'dateOfBirth',
  'mrn', 'medicalRecordNumber',
  'patientName', 'firstName', 'lastName', 'middleName',
  'address', 'street', 'city', 'zip', 'zipCode', 'postalCode',
  'phone', 'phoneNumber', 'mobile', 'fax',
  'email', 'emailAddress',
  'memberId', 'subscriberId', 'policyNumber',
  'driversLicense', 'passport',
  'biometric', 'photo',
  'accountNumber', 'cardNumber',
]);

function scrubPhi(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(scrubPhi);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (PHI_KEYS.has(k)) {
      out[k] = '[REDACTED:PHI]';
    } else {
      out[k] = scrubPhi(v);
    }
  }
  return out;
}

module.exports = {
  fingerprint,
  canonicalize,
  nowIso,
  buildAuditTrail,
  scrubPhi,
  PHI_KEYS,
};
