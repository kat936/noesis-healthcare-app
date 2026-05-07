/**
 * Noesis.io Health  - SMART-on-FHIR vendor profiles
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Per-vendor configuration for SMART App Launch + FHIR R4 access.
 * Each profile encodes the OAuth/SMART quirks for the major US EHRs:
 *
 *   Epic         - App Orchard / "Build Apps for Epic"   (PKCE; aud = FHIR base)
 *   Athenahealth - More Disruption Please / Marketplace  (PKCE; tenant in path)
 *   Cerner Oracle Health - Code Console                  (PKCE; tenant in path)
 *
 * Production note: each vendor requires a separate developer-portal app
 * registration. This module ships the technical OAuth/FHIR plumbing only.
 * Vendor certification (App Orchard, Marketplace, Code Console) is a
 * parallel partnership track that this codebase cannot fabricate.
 *
 * SMART App Launch v2 reference:
 *   https://hl7.org/fhir/smart-app-launch/STU2/
 *
 * Per-vendor scope conventions:
 *   Epic        - prefers system/* and patient/*.read with explicit resources
 *   Athena      - mirrors Epic; supports user/* for clinician launch
 *   Cerner      - same family as Epic; allows wildcard at vendor discretion
 */

'use strict';

const DEFAULT_FHIR_SCOPES = [
  'openid',
  'fhirUser',
  'launch/patient',
  'patient/Patient.read',
  'patient/Encounter.read',
  'patient/Coverage.read',
  'patient/Condition.read',
  'patient/Observation.read',
  'patient/Procedure.read',
  'offline_access',
];

const SYSTEM_FHIR_SCOPES = [
  'system/Patient.read',
  'system/Encounter.read',
  'system/Coverage.read',
  'system/Claim.write',
  'system/ClaimResponse.read',
  'system/ExplanationOfBenefit.read',
  'system/Observation.read',
];

/**
 * Vendor profiles. Each profile is a pure-data descriptor; resolution of
 * tenant-specific URLs (Epic Hyperspace org, Athena practice, Cerner tenant)
 * happens in {@link resolveVendorProfile}.
 *
 * @typedef {object} VendorProfile
 * @property {string}   id              - canonical short id (epic | athena | cerner)
 * @property {string}   name            - human readable
 * @property {string}   fhirVersion     - FHIR spec version
 * @property {string}   sandboxBaseUrl  - vendor-published sandbox FHIR base
 * @property {string}   smartLaunchVersion - 'v1' | 'v2'
 * @property {string[]} defaultScopes
 * @property {string[]} systemScopes
 * @property {boolean}  requiresPkce
 * @property {string}   audClaim        - which value to send as 'aud' on auth request
 * @property {string}   appRegistry     - human readable certification track name
 * @property {object}   tokenEndpointHints - vendor specifics for token URL discovery
 */

const PROFILES = Object.freeze({
  epic: Object.freeze({
    id:                 'epic',
    name:               'Epic Systems',
    fhirVersion:        'R4',
    sandboxBaseUrl:     'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
    smartLaunchVersion: 'v2',
    defaultScopes:      Object.freeze([...DEFAULT_FHIR_SCOPES]),
    systemScopes:       Object.freeze([...SYSTEM_FHIR_SCOPES]),
    requiresPkce:       true,
    audClaim:           'fhir-base',
    appRegistry:        'Epic App Orchard / Build Apps for Epic',
    tokenEndpointHints: Object.freeze({
      authorizePath: '/oauth2/authorize',
      tokenPath:     '/oauth2/token',
      preferDiscovery: true,
    }),
    quirks: Object.freeze({
      stateLengthMin:   16,
      requiresAudParam: true,
      patientContextHeader: 'Epic-Client-ID',
      bundleEntryLimit: 100,
    }),
  }),

  athena: Object.freeze({
    id:                 'athena',
    name:               'athenahealth',
    fhirVersion:        'R4',
    sandboxBaseUrl:     'https://api.preview.platform.athenahealth.com/fhir/r4',
    smartLaunchVersion: 'v2',
    defaultScopes:      Object.freeze([...DEFAULT_FHIR_SCOPES, 'user/Practitioner.read']),
    systemScopes:       Object.freeze([...SYSTEM_FHIR_SCOPES]),
    requiresPkce:       true,
    audClaim:           'fhir-base',
    appRegistry:        'athenahealth Marketplace / More Disruption Please',
    tokenEndpointHints: Object.freeze({
      authorizePath: '/oauth2/v1/authorize',
      tokenPath:     '/oauth2/v1/token',
      preferDiscovery: true,
    }),
    quirks: Object.freeze({
      tenantPathSegment: 'practiceid',
      practiceHeader:    'X-Athena-Practice-Id',
      bundleEntryLimit:  100,
    }),
  }),

  cerner: Object.freeze({
    id:                 'cerner',
    name:               'Oracle Health (Cerner)',
    fhirVersion:        'R4',
    sandboxBaseUrl:     'https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
    smartLaunchVersion: 'v2',
    defaultScopes:      Object.freeze([...DEFAULT_FHIR_SCOPES]),
    systemScopes:       Object.freeze([...SYSTEM_FHIR_SCOPES]),
    requiresPkce:       true,
    audClaim:           'fhir-base',
    appRegistry:        'Oracle Health (Cerner) Code Console',
    tokenEndpointHints: Object.freeze({
      authorizePath: '/protocols/oauth2/profiles/smart-v1/personas/provider/authorize',
      tokenPath:     '/protocols/oauth2/profiles/smart-v1/token',
      preferDiscovery: true,
    }),
    quirks: Object.freeze({
      tenantPathSegment: 'tenant',
      bundleEntryLimit:  100,
    }),
  }),
});

const VENDOR_IDS = Object.freeze(Object.keys(PROFILES));

function listVendors() {
  return VENDOR_IDS.map((id) => ({
    id,
    name:           PROFILES[id].name,
    fhirVersion:    PROFILES[id].fhirVersion,
    sandboxBaseUrl: PROFILES[id].sandboxBaseUrl,
    appRegistry:    PROFILES[id].appRegistry,
    smartLaunchVersion: PROFILES[id].smartLaunchVersion,
  }));
}

/**
 * Resolve a vendor profile, optionally overriding the FHIR base URL and
 * tenant identifier (Epic Hyperspace community, Athena practice id, etc.).
 *
 * @param {string} vendorId
 * @param {object} [overrides]
 * @param {string} [overrides.fhirBaseUrl] - tenant FHIR base URL
 * @param {string} [overrides.tenantId]    - tenant id (for path interpolation)
 * @returns {object}
 */
function resolveVendorProfile(vendorId, overrides = {}) {
  if (!vendorId || typeof vendorId !== 'string') {
    throw new Error('resolveVendorProfile: vendorId is required');
  }
  const lower = vendorId.toLowerCase();
  const base = PROFILES[lower];
  if (!base) {
    throw new Error(
      `Unknown EHR vendor "${vendorId}". Supported: ${VENDOR_IDS.join(', ')}`
    );
  }

  const fhirBaseUrl = (overrides.fhirBaseUrl || base.sandboxBaseUrl).replace(/\/$/, '');
  return {
    ...base,
    fhirBaseUrl,
    tenantId: overrides.tenantId || null,
    // Materialize the conventional authorize/token endpoints. SMART discovery
    // (.well-known/smart-configuration) takes precedence at request time, but
    // these fall back if the well-known endpoint is unreachable.
    authorizeUrl: fhirBaseUrl + base.tokenEndpointHints.authorizePath,
    tokenUrl:     fhirBaseUrl + base.tokenEndpointHints.tokenPath,
  };
}

module.exports = {
  PROFILES,
  VENDOR_IDS,
  DEFAULT_FHIR_SCOPES,
  SYSTEM_FHIR_SCOPES,
  listVendors,
  resolveVendorProfile,
};
