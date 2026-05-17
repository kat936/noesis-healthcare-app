'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  PROFILES,
  VENDOR_IDS,
  listVendors,
  resolveVendorProfile,
  DEFAULT_FHIR_SCOPES,
  SYSTEM_FHIR_SCOPES,
} = require('../services/healthEhr/vendorProfiles');

test('VENDOR_IDS contains the four target EHRs', () => {
  assert.deepEqual([...VENDOR_IDS].sort(), ['athena', 'cerner', 'epic', 'veradigm']);
});

test('listVendors returns one entry per supported vendor with FHIR R4', () => {
  const list = listVendors();
  assert.equal(list.length, 4);
  for (const v of list) {
    assert.equal(v.fhirVersion, 'R4');
    assert.equal(typeof v.name, 'string');
    assert.equal(typeof v.sandboxBaseUrl, 'string');
    assert.match(v.sandboxBaseUrl, /^https:\/\//);
    assert.ok(v.maturity === 'production' || v.maturity === 'scaffold');
  }
});

test('Veradigm profile is exposed as a scaffold-tier vendor', () => {
  const veradigm = listVendors().find((v) => v.id === 'veradigm');
  assert.ok(veradigm, 'veradigm should appear in the vendor catalog');
  assert.equal(veradigm.maturity, 'scaffold');
});

test('PROFILES are frozen (mutation must throw or no-op)', () => {
  assert.throws(() => { PROFILES.epic.name = 'mutated'; }, /read|frozen|Cannot/);
});

test('DEFAULT_FHIR_SCOPES include offline_access for refresh token grant', () => {
  assert.ok(DEFAULT_FHIR_SCOPES.includes('offline_access'),
    'offline_access required to obtain refresh tokens');
});

test('SYSTEM_FHIR_SCOPES include Claim.write for backend services flow', () => {
  assert.ok(SYSTEM_FHIR_SCOPES.includes('system/Claim.write'));
});

test('resolveVendorProfile applies overrides for tenant FHIR base URL', () => {
  const profile = resolveVendorProfile('epic', {
    fhirBaseUrl: 'https://my.tenant.example.com/fhir/r4',
    tenantId:    'TENANT-42',
  });
  assert.equal(profile.id, 'epic');
  assert.equal(profile.fhirBaseUrl, 'https://my.tenant.example.com/fhir/r4');
  assert.equal(profile.tenantId, 'TENANT-42');
  assert.match(profile.authorizeUrl, /^https:\/\/my\.tenant\.example\.com/);
  assert.match(profile.tokenUrl, /^https:\/\/my\.tenant\.example\.com/);
});

test('resolveVendorProfile defaults to vendor sandbox when no override', () => {
  const profile = resolveVendorProfile('athena');
  assert.equal(profile.fhirBaseUrl, PROFILES.athena.sandboxBaseUrl.replace(/\/$/, ''));
});

test('resolveVendorProfile throws on unknown vendor with helpful message', () => {
  assert.throws(
    () => resolveVendorProfile('nextgen'),
    /Unknown EHR vendor.*Supported.*epic.*athena.*cerner.*veradigm/
  );
});

test('resolveVendorProfile is case-insensitive', () => {
  const a = resolveVendorProfile('EPIC');
  const b = resolveVendorProfile('Epic');
  assert.equal(a.id, 'epic');
  assert.equal(b.id, 'epic');
});

test('Each vendor profile requires PKCE (SMART App Launch v2)', () => {
  for (const id of VENDOR_IDS) {
    assert.equal(PROFILES[id].requiresPkce, true,
      `vendor ${id} should require PKCE per SMART v2`);
    assert.equal(PROFILES[id].smartLaunchVersion, 'v2');
  }
});

test('Cerner profile points at the published Code Console SMART v1 endpoints', () => {
  const cerner = resolveVendorProfile('cerner');
  assert.match(cerner.authorizeUrl, /smart-v1.*authorize/);
  assert.match(cerner.tokenUrl, /smart-v1.*token/);
});
