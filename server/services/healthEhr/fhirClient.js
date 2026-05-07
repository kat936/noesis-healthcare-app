/**
 * Noesis.io Health  - FHIR R4 client
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Thin authenticated FHIR R4 client. Designed for the SMART OAuth flow in
 * `./smartAuth.js`: callers pass a token holder with an `accessToken` and an
 * optional `refresh()` callback. The client transparently retries once on
 * 401 if a refresh callback is provided.
 *
 * Bundle pagination is followed automatically (Bundle.link[rel=next]) up to
 * a caller-supplied page cap; the default cap of 5 pages keeps PHI fan-out
 * bounded without crossing into pathological territory.
 *
 * No third-party HTTP library; we use Node `https` for SBOM minimalism.
 */

'use strict';

const https = require('https');
const { URL } = require('url');

const DEFAULT_PAGE_CAP = 5;
const DEFAULT_TIMEOUT_MS = 30000;

class FhirClient {
  /**
   * @param {object} input
   * @param {string} input.fhirBaseUrl   - tenant FHIR base, e.g. https://fhir.epic.com/.../R4
   * @param {object} input.tokenHolder   - { accessToken, refresh?(): Promise<{accessToken, ...}> }
   * @param {object} [input.headers]     - extra static headers (e.g. Epic client id)
   * @param {number} [input.timeoutMs]
   */
  constructor(input) {
    if (!input || !input.fhirBaseUrl || !input.tokenHolder) {
      throw new Error('FhirClient: fhirBaseUrl and tokenHolder are required');
    }
    this.fhirBaseUrl = input.fhirBaseUrl.replace(/\/$/, '');
    this.tokenHolder = input.tokenHolder;
    this.staticHeaders = Object.assign({}, input.headers || {});
    this.timeoutMs = Number.isFinite(input.timeoutMs) ? input.timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  _buildHeaders(method) {
    const headers = Object.assign({}, this.staticHeaders, {
      'Authorization': 'Bearer ' + this.tokenHolder.accessToken,
      'Accept':        'application/fhir+json',
    });
    if (method !== 'GET' && method !== 'DELETE') {
      headers['Content-Type'] = 'application/fhir+json';
    }
    return headers;
  }

  _request(method, fullUrl, payload) {
    return new Promise((resolve, reject) => {
      const u = new URL(fullUrl);
      if (u.protocol !== 'https:') {
        reject(new Error('FhirClient: HTTPS required (refusing ' + u.protocol + ')'));
        return;
      }
      const headers = this._buildHeaders(method);
      let body = null;
      if (payload !== null && payload !== undefined) {
        body = JSON.stringify(payload);
        headers['Content-Length'] = Buffer.byteLength(body);
      }
      const reqOpts = {
        method,
        hostname: u.hostname,
        port:     u.port || 443,
        path:     u.pathname + (u.search || ''),
        headers,
      };
      const req = https.request(reqOpts, (res) => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { chunks += c; });
        res.on('end', () => {
          let parsed = chunks;
          const ct = res.headers['content-type'] || '';
          if ((ct.includes('json') || ct.includes('fhir')) && chunks) {
            try { parsed = JSON.parse(chunks); } catch { /* leave raw */ }
          }
          resolve({ status: res.statusCode, body: parsed, raw: chunks, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error('FHIR request timeout (' + this.timeoutMs + 'ms)'));
      });
      if (body) { req.write(body); }
      req.end();
    });
  }

  async _requestWithRefresh(method, url, payload) {
    let res = await this._request(method, url, payload);
    if (res.status === 401 && typeof this.tokenHolder.refresh === 'function') {
      const fresh = await this.tokenHolder.refresh();
      if (!fresh || !fresh.accessToken) {
        throw new Error('FhirClient: token refresh callback returned no accessToken');
      }
      this.tokenHolder.accessToken = fresh.accessToken;
      res = await this._request(method, url, payload);
    }
    return res;
  }

  _absUrl(resourcePath) {
    if (/^https?:\/\//i.test(resourcePath)) { return resourcePath; }
    return this.fhirBaseUrl + '/' + resourcePath.replace(/^\//, '');
  }

  /**
   * Read a single resource (e.g. 'Patient/123').
   *
   * @param {string} resourcePath
   * @returns {Promise<{status:number, resource:object}>}
   */
  async read(resourcePath) {
    const res = await this._requestWithRefresh('GET', this._absUrl(resourcePath));
    return { status: res.status, resource: res.body };
  }

  /**
   * Search a resource. Returns the union of entries across paginated
   * Bundles, capped at `pageCap`.
   *
   * @param {string} resourceType
   * @param {Record<string,string>|URLSearchParams} params
   * @param {object} [opts]
   * @param {number} [opts.pageCap]
   * @returns {Promise<{status:number, total:number, entries:object[]}>}
   */
  async search(resourceType, params, opts = {}) {
    const pageCap = Number.isFinite(opts.pageCap) ? opts.pageCap : DEFAULT_PAGE_CAP;
    const sp = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
    let url = this._absUrl(resourceType + (sp.toString() ? ('?' + sp.toString()) : ''));
    const entries = [];
    let total = 0;
    let pages = 0;
    let lastStatus = 0;

    while (url && pages < pageCap) {
      const res = await this._requestWithRefresh('GET', url);
      lastStatus = res.status;
      if (res.status >= 400 || !res.body || res.body.resourceType !== 'Bundle') {
        break;
      }
      if (typeof res.body.total === 'number') { total = res.body.total; }
      if (Array.isArray(res.body.entry)) {
        for (const e of res.body.entry) {
          if (e && e.resource) { entries.push(e.resource); }
        }
      }
      pages += 1;
      const next = (res.body.link || []).find((l) => l && l.relation === 'next');
      url = next && next.url ? next.url : null;
    }

    return { status: lastStatus, total: total || entries.length, entries };
  }

  /**
   * Create a resource (POST).
   *
   * @param {string} resourceType
   * @param {object} resource
   * @returns {Promise<{status:number, resource:object, locationId:?string}>}
   */
  async create(resourceType, resource) {
    if (!resource || resource.resourceType !== resourceType) {
      throw new Error('FhirClient.create: resource.resourceType must match "' + resourceType + '"');
    }
    const res = await this._requestWithRefresh('POST', this._absUrl(resourceType), resource);
    let locationId = null;
    const loc = res.headers && (res.headers.location || res.headers.Location);
    if (loc) {
      const m = String(loc).match(/\/([^/]+)\/_history\/[^/]+$/) || String(loc).match(/\/([^/]+)$/);
      if (m) { locationId = m[1]; }
    }
    return { status: res.status, resource: res.body, locationId };
  }

  /**
   * Update a resource (PUT). Sends If-Match when `versionId` is supplied so
   * the FHIR server can enforce optimistic concurrency control.
   *
   * @param {string} resourceType
   * @param {string} id
   * @param {object} resource
   * @param {object} [opts]
   * @param {string} [opts.versionId]
   */
  async update(resourceType, id, resource, opts = {}) {
    if (!id) { throw new Error('FhirClient.update: id required'); }
    const headers = {};
    if (opts.versionId) {
      // Save previous static headers, layer the conditional in
      headers['If-Match'] = `W/"${opts.versionId}"`;
    }
    const previousStatic = this.staticHeaders;
    this.staticHeaders = Object.assign({}, this.staticHeaders, headers);
    try {
      const res = await this._requestWithRefresh('PUT', this._absUrl(resourceType + '/' + id), resource);
      return { status: res.status, resource: res.body };
    } finally {
      this.staticHeaders = previousStatic;
    }
  }

  /**
   * Fetch the FHIR `metadata` (CapabilityStatement). Useful for connection
   * health checks and feature gating.
   */
  async capabilityStatement() {
    const res = await this._requestWithRefresh('GET', this._absUrl('metadata'));
    return { status: res.status, capability: res.body };
  }
}

module.exports = { FhirClient, DEFAULT_PAGE_CAP, DEFAULT_TIMEOUT_MS };
