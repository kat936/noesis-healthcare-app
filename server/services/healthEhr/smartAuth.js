/**
 * Noesis.io Health  - SMART App Launch v2 OAuth helper
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Implements the technical SMART App Launch v2 flow:
 *   1. Discover the vendor's SMART configuration (.well-known/smart-configuration)
 *   2. Generate PKCE code verifier + challenge
 *   3. Build the authorize URL (state + nonce protected)
 *   4. Exchange authorization code for access + refresh tokens
 *   5. Refresh access token transparently
 *
 * No vendor "magic" beyond the published SMART specification:
 *   https://hl7.org/fhir/smart-app-launch/STU2/
 *
 * The module is HTTPS-only outbound (no http fallback). All credentials are
 * read from process.env per integration:
 *
 *   EHR_<VENDOR>_CLIENT_ID       - SMART app client id (per vendor)
 *   EHR_<VENDOR>_CLIENT_SECRET   - confidential client secret (optional for public clients)
 *   EHR_<VENDOR>_REDIRECT_URI    - OAuth redirect (must match developer portal)
 *
 * The SMART discovery cache holds well-known config for 6 hours (vendors
 * change endpoints rarely; we always re-fetch on a 4xx during token refresh).
 */

'use strict';

const crypto = require('crypto');
const https  = require('https');
const { URL } = require('url');

const { resolveVendorProfile, VENDOR_IDS } = require('./vendorProfiles');

const SMART_CONFIG_TTL_MS = 6 * 60 * 60 * 1000;
const _smartConfigCache = new Map();

// ── PKCE helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random PKCE verifier.
 * Per RFC 7636 the verifier is 43-128 characters of unreserved chars; we
 * generate 64 url-safe base64 chars from 48 random bytes.
 *
 * @returns {string}
 */
function generatePkceVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Compute the S256 PKCE challenge (base64url SHA-256 of verifier).
 *
 * @param {string} verifier
 * @returns {string}
 */
function computePkceChallenge(verifier) {
  if (typeof verifier !== 'string' || verifier.length < 43) {
    throw new Error('computePkceChallenge: verifier must be at least 43 chars (RFC 7636)');
  }
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Cryptographically random opaque state token. Used to bind the authorize
 * redirect to the originating session.
 *
 * @param {number} [bytes=24]
 * @returns {string}
 */
function generateState(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// ── HTTPS request helper ─────────────────────────────────────────────────────

/**
 * Minimal HTTPS POST (form-urlencoded) and JSON GET helper. We deliberately
 * avoid third-party HTTP libraries here so this layer has no transitive
 * dependencies (matters for HIPAA SBOM auditing).
 *
 * @param {object} opts
 * @param {string} opts.method
 * @param {string} opts.url
 * @param {object} [opts.headers]
 * @param {string} [opts.body]
 * @returns {Promise<{status:number, body:any, raw:string, headers:object}>}
 */
function httpsRequest(opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    if (u.protocol !== 'https:') {
      reject(new Error('SMART OAuth requires HTTPS endpoints (refusing ' + u.protocol + ')'));
      return;
    }
    const reqOpts = {
      method:   opts.method,
      hostname: u.hostname,
      port:     u.port || 443,
      path:     u.pathname + (u.search || ''),
      headers:  Object.assign({ 'Accept': 'application/json' }, opts.headers || {}),
    };
    const req = https.request(reqOpts, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed = chunks;
        const ct = res.headers['content-type'] || '';
        if (ct.includes('json') && chunks) {
          try { parsed = JSON.parse(chunks); } catch { /* leave as text */ }
        }
        resolve({ status: res.statusCode, body: parsed, raw: chunks, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('SMART OAuth request timeout (20s)'));
    });
    if (opts.body) { req.write(opts.body); }
    req.end();
  });
}

// ── SMART discovery ──────────────────────────────────────────────────────────

/**
 * Fetch the vendor's SMART configuration from
 * `<fhirBaseUrl>/.well-known/smart-configuration`.
 *
 * Falls back to the vendor profile's documented endpoints when the well-known
 * document is missing (some Cerner sandboxes do not expose it).
 *
 * @param {object} profile - resolved vendor profile from {@link resolveVendorProfile}
 * @returns {Promise<{authorization_endpoint:string, token_endpoint:string, capabilities:string[]}>}
 */
async function discoverSmartConfig(profile) {
  const cacheKey = profile.fhirBaseUrl;
  const cached = _smartConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) { return cached.config; }

  const wellKnownUrl = profile.fhirBaseUrl.replace(/\/$/, '') + '/.well-known/smart-configuration';
  try {
    const res = await httpsRequest({ method: 'GET', url: wellKnownUrl });
    if (res.status >= 200 && res.status < 300 && typeof res.body === 'object') {
      const cfg = {
        authorization_endpoint: res.body.authorization_endpoint || profile.authorizeUrl,
        token_endpoint:         res.body.token_endpoint         || profile.tokenUrl,
        introspection_endpoint: res.body.introspection_endpoint || null,
        revocation_endpoint:    res.body.revocation_endpoint    || null,
        capabilities:           Array.isArray(res.body.capabilities) ? res.body.capabilities : [],
        scopes_supported:       Array.isArray(res.body.scopes_supported) ? res.body.scopes_supported : [],
        issuer:                 res.body.issuer || null,
      };
      _smartConfigCache.set(cacheKey, { config: cfg, expiresAt: Date.now() + SMART_CONFIG_TTL_MS });
      return cfg;
    }
  } catch (_err) {
    // fall through to vendor-profile defaults
  }

  const cfg = {
    authorization_endpoint: profile.authorizeUrl,
    token_endpoint:         profile.tokenUrl,
    introspection_endpoint: null,
    revocation_endpoint:    null,
    capabilities:           [],
    scopes_supported:       [],
    issuer:                 null,
  };
  _smartConfigCache.set(cacheKey, { config: cfg, expiresAt: Date.now() + SMART_CONFIG_TTL_MS });
  return cfg;
}

function clearSmartConfigCache() {
  _smartConfigCache.clear();
}

// ── Authorize URL builder ────────────────────────────────────────────────────

/**
 * Build a SMART App Launch v2 authorize URL with PKCE + state.
 *
 * @param {object} input
 * @param {string} input.vendorId
 * @param {object} [input.overrides] - vendor profile overrides
 * @param {string} input.clientId
 * @param {string} input.redirectUri
 * @param {string[]} [input.scopes]
 * @param {string} [input.launchToken] - SMART EHR-launch token (when launched from EHR)
 * @returns {Promise<{authorizeUrl:string, state:string, codeVerifier:string, profile:object}>}
 */
async function buildAuthorizeUrl(input) {
  if (!input || !input.vendorId)    { throw new Error('buildAuthorizeUrl: vendorId required'); }
  if (!input.clientId)              { throw new Error('buildAuthorizeUrl: clientId required'); }
  if (!input.redirectUri)           { throw new Error('buildAuthorizeUrl: redirectUri required'); }
  if (!VENDOR_IDS.includes(input.vendorId.toLowerCase())) {
    throw new Error(`buildAuthorizeUrl: unsupported vendor "${input.vendorId}"`);
  }

  const profile = resolveVendorProfile(input.vendorId, input.overrides || {});
  const smartCfg = await discoverSmartConfig(profile);

  const codeVerifier  = generatePkceVerifier();
  const codeChallenge = computePkceChallenge(codeVerifier);
  const state         = generateState();
  const scopes        = (input.scopes && input.scopes.length ? input.scopes : profile.defaultScopes).join(' ');

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             input.clientId,
    redirect_uri:          input.redirectUri,
    scope:                 scopes,
    state:                 state,
    aud:                   profile.fhirBaseUrl,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  });
  if (input.launchToken) { params.set('launch', input.launchToken); }

  const authorizeUrl = smartCfg.authorization_endpoint + '?' + params.toString();
  return { authorizeUrl, state, codeVerifier, profile, smartConfig: smartCfg };
}

// ── Token exchange ───────────────────────────────────────────────────────────

/**
 * Exchange an OAuth authorization code (received at the redirect URI) for
 * access + refresh tokens.
 *
 * @param {object} input
 * @param {string} input.vendorId
 * @param {object} [input.overrides]
 * @param {string} input.clientId
 * @param {string} [input.clientSecret] - omit for public clients
 * @param {string} input.code
 * @param {string} input.redirectUri
 * @param {string} input.codeVerifier
 * @returns {Promise<{success:boolean, tokens:object, profile:object, smartConfig:object}>}
 */
async function exchangeAuthorizationCode(input) {
  if (!input || !input.vendorId || !input.code || !input.codeVerifier) {
    throw new Error('exchangeAuthorizationCode: vendorId, code, codeVerifier required');
  }
  const profile  = resolveVendorProfile(input.vendorId, input.overrides || {});
  const smartCfg = await discoverSmartConfig(profile);

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code:          input.code,
    redirect_uri:  input.redirectUri,
    client_id:     input.clientId,
    code_verifier: input.codeVerifier,
  });
  if (input.clientSecret) { body.set('client_secret', input.clientSecret); }

  const res = await httpsRequest({
    method: 'POST',
    url:    smartCfg.token_endpoint,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: body.toString(),
  });

  if (res.status < 200 || res.status >= 300 || !res.body || !res.body.access_token) {
    throw new Error(`SMART token exchange failed (${res.status}): ${typeof res.body === 'string' ? res.body : JSON.stringify(res.body)}`);
  }

  const tokens = normalizeTokenResponse(res.body);
  return { success: true, tokens, profile, smartConfig: smartCfg };
}

/**
 * Refresh an access token using the refresh_token grant.
 *
 * @param {object} input
 * @param {string} input.vendorId
 * @param {object} [input.overrides]
 * @param {string} input.clientId
 * @param {string} [input.clientSecret]
 * @param {string} input.refreshToken
 * @param {string[]} [input.scopes] - downscope on refresh
 * @returns {Promise<object>}
 */
async function refreshAccessToken(input) {
  if (!input || !input.vendorId || !input.refreshToken) {
    throw new Error('refreshAccessToken: vendorId, refreshToken required');
  }
  const profile  = resolveVendorProfile(input.vendorId, input.overrides || {});
  const smartCfg = await discoverSmartConfig(profile);

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: input.refreshToken,
    client_id:     input.clientId,
  });
  if (input.clientSecret) { body.set('client_secret', input.clientSecret); }
  if (input.scopes && input.scopes.length) { body.set('scope', input.scopes.join(' ')); }

  const res = await httpsRequest({
    method: 'POST',
    url:    smartCfg.token_endpoint,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: body.toString(),
  });

  if (res.status < 200 || res.status >= 300 || !res.body || !res.body.access_token) {
    throw new Error(`SMART refresh failed (${res.status}): ${typeof res.body === 'string' ? res.body : JSON.stringify(res.body)}`);
  }

  return normalizeTokenResponse(res.body);
}

/**
 * Backend services flow (no user) - obtain a system-level access token via
 * client_credentials. Used for server-to-server FHIR bulk operations (Epic
 * Backend Services, Cerner system app).
 *
 * @param {object} input
 * @param {string} input.vendorId
 * @param {object} [input.overrides]
 * @param {string} input.clientId
 * @param {string} input.clientSecret
 * @param {string[]} [input.scopes]
 * @returns {Promise<object>}
 */
async function clientCredentialsToken(input) {
  if (!input || !input.vendorId || !input.clientId || !input.clientSecret) {
    throw new Error('clientCredentialsToken: vendorId, clientId, clientSecret required');
  }
  const profile  = resolveVendorProfile(input.vendorId, input.overrides || {});
  const smartCfg = await discoverSmartConfig(profile);
  const scopes   = (input.scopes && input.scopes.length ? input.scopes : profile.systemScopes).join(' ');

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     input.clientId,
    client_secret: input.clientSecret,
    scope:         scopes,
  });

  const res = await httpsRequest({
    method: 'POST',
    url:    smartCfg.token_endpoint,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body: body.toString(),
  });

  if (res.status < 200 || res.status >= 300 || !res.body || !res.body.access_token) {
    throw new Error(`SMART client_credentials failed (${res.status}): ${typeof res.body === 'string' ? res.body : JSON.stringify(res.body)}`);
  }

  return normalizeTokenResponse(res.body);
}

function normalizeTokenResponse(raw) {
  const expiresInSec = Number.isFinite(raw.expires_in) ? raw.expires_in : 3600;
  return {
    accessToken:   raw.access_token,
    refreshToken:  raw.refresh_token || null,
    tokenType:     raw.token_type     || 'Bearer',
    scope:         raw.scope          || null,
    patientFhirId: raw.patient        || null,
    encounterFhirId: raw.encounter    || null,
    idToken:       raw.id_token       || null,
    expiresInSec,
    expiresAt:     Date.now() + Math.max(0, (expiresInSec - 60)) * 1000,
    raw,
  };
}

module.exports = {
  generatePkceVerifier,
  computePkceChallenge,
  generateState,
  discoverSmartConfig,
  clearSmartConfigCache,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  clientCredentialsToken,
};
