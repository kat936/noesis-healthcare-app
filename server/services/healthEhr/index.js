/**
 * Noesis.io Health  - EHR connector orchestration
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Public facade for the EHR/FHIR feature. Routes import only this module:
 *
 *   - listVendors()                 - vendor catalog
 *   - getVendorEnvConfig(vendorId)  - per-vendor OAuth env config
 *   - startConnect()                - kick off OAuth (returns authorize URL)
 *   - completeConnect()             - exchange callback code for tokens
 *   - getConnectionStatus()         - per-org per-vendor status
 *   - listOrgConnections()          - all connections for an org
 *   - disconnect()                  - revoke locally
 *   - withFhirClient(...)           - run a callback with a refreshed FHIR client
 *   - syncPatient()                 - read Patient + Coverage + Encounters
 *   - submitClaim()                 - POST a Claim to the EHR's FHIR base
 *
 * The orchestrator owns the cross-cutting concerns:
 *   - reads per-vendor OAuth credentials from env (never persisted)
 *   - persists tokens via connectionStore (encrypted)
 *   - transparently refreshes expired access tokens before FHIR calls
 *   - emits domain audit events (via connectionStore)
 *   - returns demo data when no connection exists AND no DB is configured
 *     (preserves the existing "demo when not configured" UX)
 */

'use strict';

const {
  PROFILES,
  VENDOR_IDS,
  listVendors,
} = require('./vendorProfiles');

const smartAuth = require('./smartAuth');
const connectionStore = require('./connectionStore');
const { FhirClient } = require('./fhirClient');
const fhirResources = require('./fhirResources');

// ── Per-vendor env config ────────────────────────────────────────────────────

/**
 * Read OAuth credentials for a given vendor from process.env. Each vendor
 * has its own env namespace so credentials never collide:
 *
 *   EHR_<VENDOR>_CLIENT_ID
 *   EHR_<VENDOR>_CLIENT_SECRET   (optional for public clients)
 *   EHR_<VENDOR>_REDIRECT_URI
 *   EHR_<VENDOR>_FHIR_BASE_URL   (per-tenant override of vendor sandbox)
 *   EHR_<VENDOR>_TENANT_ID       (vendor-specific tenant identifier)
 *
 * @param {string} vendorId
 * @returns {object}
 */
function getVendorEnvConfig(vendorId) {
  const upper = String(vendorId || '').toUpperCase();
  const cfg = {
    vendorId:     vendorId.toLowerCase(),
    clientId:     process.env[`EHR_${upper}_CLIENT_ID`]     || null,
    clientSecret: process.env[`EHR_${upper}_CLIENT_SECRET`] || null,
    redirectUri:  process.env[`EHR_${upper}_REDIRECT_URI`]  || null,
    fhirBaseUrl:  process.env[`EHR_${upper}_FHIR_BASE_URL`] || null,
    tenantId:     process.env[`EHR_${upper}_TENANT_ID`]     || null,
  };
  cfg.configured = !!(cfg.clientId && cfg.redirectUri);
  return cfg;
}

// ── Connect flow ─────────────────────────────────────────────────────────────

/**
 * Begin a SMART OAuth connection. The caller (route) is responsible for
 * redirecting the browser to the returned `authorizeUrl` and storing
 * `state` in the user session for CSRF protection.
 *
 * @param {object} input
 * @param {string} input.orgId
 * @param {string} input.vendorId
 * @param {string[]} [input.scopes]
 * @param {string} [input.launchToken]
 * @returns {Promise<{authorizeUrl:string, state:string, vendor:object}>}
 */
async function startConnect(input) {
  if (!input || !input.orgId || !input.vendorId) {
    throw new Error('startConnect: orgId and vendorId required');
  }
  const env = getVendorEnvConfig(input.vendorId);
  if (!env.configured) {
    const err = new Error(
      `EHR vendor "${input.vendorId}" is not configured. Required env: ` +
      `EHR_${input.vendorId.toUpperCase()}_CLIENT_ID, ` +
      `EHR_${input.vendorId.toUpperCase()}_REDIRECT_URI`
    );
    err.code = 'EHR_VENDOR_NOT_CONFIGURED';
    throw err;
  }

  await connectionStore.ensureSchema();

  const overrides = {
    fhirBaseUrl: env.fhirBaseUrl || undefined,
    tenantId:    env.tenantId    || undefined,
  };

  const built = await smartAuth.buildAuthorizeUrl({
    vendorId:    input.vendorId,
    overrides,
    clientId:    env.clientId,
    redirectUri: env.redirectUri,
    scopes:      input.scopes,
    launchToken: input.launchToken,
  });

  await connectionStore.saveOAuthState({
    state:        built.state,
    orgId:        input.orgId,
    vendor:       input.vendorId.toLowerCase(),
    codeVerifier: built.codeVerifier,
    tenantId:     env.tenantId,
    fhirBaseUrl:  built.profile.fhirBaseUrl,
    redirectUri:  env.redirectUri,
  });

  return {
    authorizeUrl: built.authorizeUrl,
    state:        built.state,
    vendor:       {
      id:           built.profile.id,
      name:         built.profile.name,
      fhirBaseUrl:  built.profile.fhirBaseUrl,
      appRegistry:  built.profile.appRegistry,
      requiresPkce: true,
    },
  };
}

/**
 * Complete the OAuth flow on the redirect callback. Validates state, then
 * exchanges the authorization code for tokens and persists them encrypted.
 *
 * @param {object} input
 * @param {string} input.code
 * @param {string} input.state
 * @returns {Promise<object>} the persisted connection summary
 */
async function completeConnect(input) {
  if (!input || !input.code || !input.state) {
    throw new Error('completeConnect: code and state required');
  }
  const saved = await connectionStore.consumeOAuthState(input.state);
  if (!saved) {
    const err = new Error('Invalid or expired OAuth state');
    err.code = 'EHR_INVALID_STATE';
    throw err;
  }

  const env = getVendorEnvConfig(saved.vendor);
  if (!env.configured) {
    throw new Error(`EHR vendor "${saved.vendor}" no longer configured`);
  }

  const result = await smartAuth.exchangeAuthorizationCode({
    vendorId:     saved.vendor,
    overrides:    { fhirBaseUrl: saved.fhirBaseUrl, tenantId: saved.tenantId },
    clientId:     env.clientId,
    clientSecret: env.clientSecret || undefined,
    code:         input.code,
    redirectUri:  saved.redirectUri,
    codeVerifier: saved.codeVerifier,
  });

  const conn = await connectionStore.upsertConnection({
    orgId:       saved.orgId,
    vendor:      saved.vendor,
    tenantId:    saved.tenantId,
    fhirBaseUrl: result.profile.fhirBaseUrl,
    clientId:    env.clientId,
    tokens:      result.tokens,
  });

  return {
    id:             conn.id,
    vendor:         conn.vendor,
    fhirBaseUrl:    conn.fhirBaseUrl,
    tokenExpiresAt: conn.tokenExpiresAt,
    scope:          conn.scope,
    status:         conn.status,
    patientFhirId:  result.tokens.patientFhirId,
  };
}

// ── Connection management ────────────────────────────────────────────────────

async function getConnectionStatus(orgId, vendorId) {
  const c = await connectionStore.getConnection(orgId, vendorId);
  if (!c) {
    return {
      vendor:      vendorId.toLowerCase(),
      configured:  getVendorEnvConfig(vendorId).configured,
      connected:   false,
      status:      'not_connected',
      vendorMeta:  PROFILES[vendorId.toLowerCase()] ? {
        name:        PROFILES[vendorId.toLowerCase()].name,
        appRegistry: PROFILES[vendorId.toLowerCase()].appRegistry,
        fhirVersion: PROFILES[vendorId.toLowerCase()].fhirVersion,
      } : null,
    };
  }
  return {
    vendor:         c.vendor,
    fhirBaseUrl:    c.fhirBaseUrl,
    tenantId:       c.tenantId,
    scope:          c.scope,
    status:         c.status,
    tokenExpiresAt: c.tokenExpiresAt,
    lastSyncedAt:   c.lastSyncedAt,
    lastError:      c.lastError,
    connected:      c.status === 'connected',
  };
}

async function listOrgConnections(orgId) {
  return connectionStore.listConnections(orgId);
}

async function disconnect(orgId, vendorId) {
  await connectionStore.disconnect(orgId, vendorId);
  return { success: true, vendor: vendorId.toLowerCase(), status: 'disconnected' };
}

// ── Authenticated FHIR usage ─────────────────────────────────────────────────

/**
 * Build a FhirClient bound to the saved connection, with a refresh callback
 * that updates the persisted tokens on 401. Throws if the connection does
 * not exist or has been disconnected.
 *
 * @param {string} orgId
 * @param {string} vendorId
 * @returns {Promise<FhirClient>}
 */
async function _buildClient(orgId, vendorId) {
  const conn = await connectionStore.getConnection(orgId, vendorId);
  if (!conn || conn.status === 'disconnected' || !conn.accessToken) {
    const err = new Error('No active EHR connection for vendor "' + vendorId + '"');
    err.code = 'EHR_NOT_CONNECTED';
    throw err;
  }

  const env = getVendorEnvConfig(vendorId);
  const tokenHolder = {
    accessToken: conn.accessToken,
    refresh: async () => {
      if (!conn.refreshToken) {
        await connectionStore.markFailed(orgId, vendorId, 'no refresh token');
        throw new Error('No refresh token available for vendor "' + vendorId + '"');
      }
      try {
        const fresh = await smartAuth.refreshAccessToken({
          vendorId,
          overrides:    { fhirBaseUrl: conn.fhirBaseUrl, tenantId: conn.tenantId },
          clientId:     env.clientId,
          clientSecret: env.clientSecret || undefined,
          refreshToken: conn.refreshToken,
        });
        await connectionStore.updateTokens({
          orgId,
          vendor:        vendorId,
          accessToken:   fresh.accessToken,
          refreshToken:  fresh.refreshToken,
          expiresInSec:  fresh.expiresInSec,
          scope:         fresh.scope,
          tokenType:     fresh.tokenType,
        });
        return { accessToken: fresh.accessToken };
      } catch (err) {
        await connectionStore.markFailed(orgId, vendorId, err.message);
        throw err;
      }
    },
  };

  return new FhirClient({
    fhirBaseUrl: conn.fhirBaseUrl,
    tokenHolder,
  });
}

/**
 * Run a callback with an authenticated FhirClient. Used by routes for
 * arbitrary read paths (search, read, capability statement).
 *
 * @template T
 * @param {string} orgId
 * @param {string} vendorId
 * @param {(client: FhirClient) => Promise<T>} cb
 * @returns {Promise<T>}
 */
async function withFhirClient(orgId, vendorId, cb) {
  const client = await _buildClient(orgId, vendorId);
  return cb(client);
}

// ── High-level read paths ────────────────────────────────────────────────────

/**
 * Sync a patient: read Patient + active Coverage + recent Encounters in one
 * call. Returns normalized Noesis objects (no raw FHIR JSON in response).
 *
 * @param {object} input
 * @param {string} input.orgId
 * @param {string} input.vendorId
 * @param {string} input.patientFhirId
 * @param {object} [input.options] - { encounterLimit }
 * @returns {Promise<object>}
 */
async function syncPatient(input) {
  if (!input || !input.orgId || !input.vendorId || !input.patientFhirId) {
    throw new Error('syncPatient: orgId, vendorId, patientFhirId required');
  }
  const encounterLimit = (input.options && input.options.encounterLimit) || 10;
  const result = await withFhirClient(input.orgId, input.vendorId, async (client) => {
    const [p, cov, enc] = await Promise.all([
      client.read('Patient/' + input.patientFhirId),
      client.search('Coverage', { patient: input.patientFhirId, status: 'active' }),
      client.search('Encounter', { patient: input.patientFhirId, _sort: '-date', _count: String(encounterLimit) }),
    ]);
    return {
      patient:    p.resource && p.resource.resourceType === 'Patient'
                    ? fhirResources.normalizePatient(p.resource)
                    : null,
      coverages:  cov.entries.filter((r) => r.resourceType === 'Coverage').map(fhirResources.normalizeCoverage),
      encounters: enc.entries.filter((r) => r.resourceType === 'Encounter').map(fhirResources.normalizeEncounter),
    };
  });
  await connectionStore.markSynced(input.orgId, input.vendorId);
  return result;
}

/**
 * Search patients by demographics.
 *
 * @param {object} input - { orgId, vendorId, lastName, firstName, dateOfBirth, mrn }
 * @returns {Promise<object>}
 */
async function searchPatients(input) {
  if (!input || !input.orgId || !input.vendorId) {
    throw new Error('searchPatients: orgId and vendorId required');
  }
  return withFhirClient(input.orgId, input.vendorId, async (client) => {
    const params = {};
    if (input.lastName)    { params.family    = input.lastName; }
    if (input.firstName)   { params.given     = input.firstName; }
    if (input.dateOfBirth) { params.birthdate = input.dateOfBirth; }
    if (input.mrn)         { params.identifier = input.mrn; }
    const r = await client.search('Patient', params);
    return {
      total:    r.total,
      patients: r.entries.filter((p) => p.resourceType === 'Patient').map(fhirResources.normalizePatient),
    };
  });
}

/**
 * Submit a FHIR R4 Claim resource to the connected EHR/FHIR server.
 *
 * @param {object} input - { orgId, vendorId, claim, provider, patient, coverage }
 * @returns {Promise<object>}
 */
async function submitClaim(input) {
  if (!input || !input.orgId || !input.vendorId) {
    throw new Error('submitClaim: orgId and vendorId required');
  }
  const fhirClaim = fhirResources.buildFhirClaim({
    patient:  input.patient,
    coverage: input.coverage,
    provider: input.provider,
    claim:    input.claim,
  });
  return withFhirClient(input.orgId, input.vendorId, async (client) => {
    const r = await client.create('Claim', fhirClaim);
    return {
      success:    r.status >= 200 && r.status < 300,
      status:     r.status,
      claimId:    (r.resource && r.resource.id) || r.locationId || null,
      fhirClaim,
      response:   r.resource,
    };
  });
}

// ── Status / catalog (public, unauthenticated-safe) ──────────────────────────

function getStatus() {
  return {
    fhirVersion:  'R4',
    smartLaunchVersion: 'v2',
    vendors:      listVendors().map((v) => ({
      ...v,
      configured: getVendorEnvConfig(v.id).configured,
    })),
    encryptionKeyConfigured: !!process.env.PHI_ENCRYPTION_KEY,
    transactionTypes: ['Patient.read', 'Coverage.read', 'Encounter.read', 'Observation.read', 'Claim.write'],
    standardsReferenced: [
      'HL7 FHIR R4 (https://hl7.org/fhir/R4/)',
      'US Core 5.0 (https://hl7.org/fhir/us/core/)',
      'SMART App Launch v2 (https://hl7.org/fhir/smart-app-launch/STU2/)',
      'RFC 7636 PKCE',
    ],
    disclaimer:
      'Connector for educational and development use. Production use requires ' +
      'a Business Associate Agreement (BAA) executed with each EHR vendor and ' +
      'completion of the vendor certification track (Epic App Orchard, ' +
      'athenahealth Marketplace, Oracle Health / Cerner Code Console). ' +
      'Confirm with privacy and compliance teams before connecting to live ' +
      'patient data.',
  };
}

module.exports = {
  // catalog + config
  PROFILES,
  VENDOR_IDS,
  listVendors,
  getVendorEnvConfig,
  getStatus,

  // connect lifecycle
  startConnect,
  completeConnect,
  getConnectionStatus,
  listOrgConnections,
  disconnect,

  // authenticated FHIR usage
  withFhirClient,
  syncPatient,
  searchPatients,
  submitClaim,

  // re-exports for downstream callers
  smartAuth,
  fhirResources,
  connectionStore,
};
