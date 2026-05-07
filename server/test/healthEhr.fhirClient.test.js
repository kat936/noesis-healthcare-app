'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');

const { FhirClient } = require('../services/healthEhr/fhirClient');

// ── Helper: mock https.request to return a queued response ──────────────────

function _mockHttps(responses) {
  // responses: array of { status, body, headers? }; consumed in order.
  const calls = [];
  let i = 0;
  const restore = mock.method(https, 'request', (opts, cb) => {
    calls.push({
      method:  opts.method,
      url:     `https://${opts.hostname}${opts.path}`,
      headers: { ...opts.headers },
    });
    const next = responses[i++];
    if (!next) { throw new Error('mock https.request: no more queued responses'); }

    const res = new EventEmitter();
    res.headers = next.headers || { 'content-type': 'application/fhir+json' };
    res.statusCode = next.status;
    res.setEncoding = () => {};

    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {
      // Defer to mimic async I/O
      setImmediate(() => {
        cb(res);
        const payload = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
        res.emit('data', payload);
        res.emit('end');
      });
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    return req;
  });
  return { calls, restore };
}

test('FhirClient constructor validates required input', () => {
  assert.throws(() => new FhirClient({}), /fhirBaseUrl and tokenHolder/);
});

test('search aggregates across paginated Bundles up to pageCap', async () => {
  const { calls, restore } = _mockHttps([
    { status: 200, body: {
      resourceType: 'Bundle', type: 'searchset', total: 3,
      entry: [
        { resource: { resourceType: 'Patient', id: 'a' } },
        { resource: { resourceType: 'Patient', id: 'b' } },
      ],
      link: [{ relation: 'next', url: 'https://fhir.example/Patient?page=2' }],
    } },
    { status: 200, body: {
      resourceType: 'Bundle', type: 'searchset',
      entry: [{ resource: { resourceType: 'Patient', id: 'c' } }],
    } },
  ]);
  try {
    const c = new FhirClient({
      fhirBaseUrl: 'https://fhir.example',
      tokenHolder: { accessToken: 'tok' },
    });
    const r = await c.search('Patient', { name: 'x' }, { pageCap: 5 });
    assert.equal(r.entries.length, 3);
    assert.equal(r.total, 3);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/Patient\?name=x$/);
    assert.match(calls[1].url, /\/Patient\?page=2$/);
  } finally { restore.mock.restore(); }
});

test('read returns the resource body and request includes Bearer token', async () => {
  const { calls, restore } = _mockHttps([
    { status: 200, body: { resourceType: 'Patient', id: 'p1' } },
  ]);
  try {
    const c = new FhirClient({
      fhirBaseUrl: 'https://fhir.example/',
      tokenHolder: { accessToken: 'access-1' },
    });
    const r = await c.read('Patient/p1');
    assert.equal(r.status, 200);
    assert.equal(r.resource.id, 'p1');
    assert.equal(calls[0].headers.Authorization, 'Bearer access-1');
    assert.equal(calls[0].headers.Accept, 'application/fhir+json');
  } finally { restore.mock.restore(); }
});

test('refresh callback fires on 401 and request is retried with new token', async () => {
  const { calls, restore } = _mockHttps([
    { status: 401, body: { error: 'expired' } },
    { status: 200, body: { resourceType: 'Patient', id: 'p1' } },
  ]);
  try {
    let refreshCalls = 0;
    const c = new FhirClient({
      fhirBaseUrl: 'https://fhir.example',
      tokenHolder: {
        accessToken: 'old',
        refresh: async () => { refreshCalls += 1; return { accessToken: 'new' }; },
      },
    });
    const r = await c.read('Patient/p1');
    assert.equal(r.status, 200);
    assert.equal(refreshCalls, 1);
    assert.equal(calls[0].headers.Authorization, 'Bearer old');
    assert.equal(calls[1].headers.Authorization, 'Bearer new');
  } finally { restore.mock.restore(); }
});

test('create posts the resource and parses Location header for new id', async () => {
  const { calls, restore } = _mockHttps([
    {
      status: 201,
      body: { resourceType: 'Claim', id: 'created-1' },
      headers: {
        'content-type': 'application/fhir+json',
        location: 'https://fhir.example/Claim/created-1/_history/1',
      },
    },
  ]);
  try {
    const c = new FhirClient({
      fhirBaseUrl: 'https://fhir.example',
      tokenHolder: { accessToken: 'tok' },
    });
    const r = await c.create('Claim', { resourceType: 'Claim', status: 'active' });
    assert.equal(r.status, 201);
    assert.equal(r.locationId, 'created-1');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers['Content-Type'], 'application/fhir+json');
  } finally { restore.mock.restore(); }
});

test('search stops at pageCap and does not run past it', async () => {
  const queued = [];
  for (let i = 0; i < 10; i++) {
    queued.push({
      status: 200,
      body: {
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Patient', id: 'p' + i } }],
        link: [{ relation: 'next', url: 'https://fhir.example/Patient?page=' + (i + 2) }],
      },
    });
  }
  const { calls, restore } = _mockHttps(queued);
  try {
    const c = new FhirClient({
      fhirBaseUrl: 'https://fhir.example',
      tokenHolder: { accessToken: 'tok' },
    });
    const r = await c.search('Patient', {}, { pageCap: 3 });
    assert.equal(calls.length, 3, 'should hit exactly pageCap pages');
    assert.equal(r.entries.length, 3);
  } finally { restore.mock.restore(); }
});

test('refuses non-https endpoints (HIPAA: no plaintext token transmission)', async () => {
  const c = new FhirClient({
    fhirBaseUrl: 'http://insecure.example',
    tokenHolder: { accessToken: 'tok' },
  });
  await assert.rejects(c.read('Patient/p1'), /HTTPS required/);
});
