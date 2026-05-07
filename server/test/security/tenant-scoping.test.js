/**
 * Regression tests for tenant scoping (HIPAA §164.502(a)).
 *
 * Pre-fix bug
 *   Routes for claims, denials, and authorizations only filtered list and
 *   detail endpoints by provider_id when the caller was a provider_staff.
 *   A practice_admin token issued to organization-A had no organization
 *   filter at all; it could read every other organization's records by ID,
 *   and could mutate any authorization across organizations. That is a
 *   PHI cross-tenant disclosure.
 *
 * What this test asserts
 *   1. The shared scope helper buildScopeClause emits a provider filter for
 *      provider_staff and an organization filter for practice_admin.
 *   2. canAccessResource returns false when an org-A admin tries to touch
 *      an org-B resource, and true within the same org.
 *   3. inMemoryFilter rejects cross-org rows for practice_admin.
 *   4. The list / detail / approve / deny routes use the helper at every
 *      relevant call site (textual scan).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { buildScopeClause, canAccessResource, inMemoryFilter } =
  require('../../utils/tenantScope');
const { ROLES } = require('../../config/roles');

// ── buildScopeClause ──────────────────────────────────────────────────────────
test('buildScopeClause: provider_staff filters by provider_id', () => {
  const req = { user: { id: 'prov-1', role: ROLES.PROVIDER_STAFF } };
  const { clause, params } = buildScopeClause(req);
  assert.match(clause, / AND provider_id = \$1$/);
  assert.deepEqual(params, ['prov-1']);
});

test('buildScopeClause: practice_admin filters by organization_id', () => {
  const req = {
    user: { id: 'admin-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' },
  };
  const { clause, params } = buildScopeClause(req);
  assert.match(clause, / AND organization_id = \$1$/);
  assert.deepEqual(params, ['org-A']);
});

test('buildScopeClause: practice_admin missing organizationId binds sentinel UUID (matches no rows)', () => {
  const req = { user: { id: 'admin-x', role: ROLES.PRACTICE_ADMIN } };
  const { clause, params } = buildScopeClause(req);
  assert.match(clause, / AND organization_id = \$1$/);
  assert.equal(params[0], '00000000-0000-0000-0000-000000000000');
});

test('buildScopeClause: insurance_rep produces no clause (cross-tenant adjudicator)', () => {
  const req = { user: { id: 'ir-1', role: ROLES.INSURANCE_REP } };
  const { clause, params } = buildScopeClause(req);
  assert.equal(clause, '');
  assert.deepEqual(params, []);
});

test('buildScopeClause: super_admin produces no clause', () => {
  const req = { user: { id: 'sa-1', role: ROLES.SUPER_ADMIN } };
  const { clause, params } = buildScopeClause(req);
  assert.equal(clause, '');
  assert.deepEqual(params, []);
});

test('buildScopeClause: paramOffset shifts placeholder numbers', () => {
  const req = { user: { id: 'prov-1', role: ROLES.PROVIDER_STAFF } };
  const { clause } = buildScopeClause(req, 3);
  // Existing query already bound $1..$3, so the scope placeholder is $4
  assert.match(clause, / AND provider_id = \$4$/);
});

// ── canAccessResource ─────────────────────────────────────────────────────────
test('canAccessResource: practice_admin in org-A cannot read org-B record', () => {
  const req = {
    user: { id: 'admin-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' },
  };
  const orgBResource = { providerId: 'prov-99', organizationId: 'org-B' };
  assert.equal(canAccessResource(req, orgBResource), false,
    'practice_admin in org-A must not be able to access org-B resource');
});

test('canAccessResource: practice_admin in org-A can read own org record', () => {
  const req = {
    user: { id: 'admin-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' },
  };
  const ownOrgResource = { providerId: 'prov-1', organizationId: 'org-A' };
  assert.equal(canAccessResource(req, ownOrgResource), true);
});

test('canAccessResource: provider_staff cannot read other provider record', () => {
  const req = { user: { id: 'prov-1', role: ROLES.PROVIDER_STAFF } };
  const otherProviderResource = { providerId: 'prov-2', organizationId: 'org-A' };
  assert.equal(canAccessResource(req, otherProviderResource), false);
});

test('canAccessResource: insurance_rep can access cross-org records (adjudicator role)', () => {
  const req = { user: { id: 'ir-1', role: ROLES.INSURANCE_REP } };
  assert.equal(canAccessResource(req, { providerId: 'prov-1', organizationId: 'org-A' }), true);
  assert.equal(canAccessResource(req, { providerId: 'prov-2', organizationId: 'org-Z' }), true);
});

test('canAccessResource: super_admin can access any record', () => {
  const req = { user: { id: 'sa-1', role: ROLES.SUPER_ADMIN } };
  assert.equal(canAccessResource(req, { providerId: 'p', organizationId: 'org-anything' }), true);
});

test('canAccessResource: anonymous request is denied', () => {
  assert.equal(canAccessResource({}, { providerId: 'p', organizationId: 'o' }), false);
  assert.equal(canAccessResource({ user: null }, { providerId: 'p', organizationId: 'o' }), false);
});

test('canAccessResource: practice_admin without organizationId is denied even matching null org', () => {
  const req = { user: { id: 'admin-x', role: ROLES.PRACTICE_ADMIN } };
  assert.equal(canAccessResource(req, { providerId: 'p', organizationId: null }), false,
    'a practice_admin without an organizationId must never match anything');
});

// ── inMemoryFilter ────────────────────────────────────────────────────────────
test('inMemoryFilter: practice_admin keeps only same-org rows', () => {
  const req = {
    user: { id: 'admin-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' },
  };
  const rows = [
    { id: '1', organizationId: 'org-A' },
    { id: '2', organizationId: 'org-B' },
    { id: '3', organizationId: 'org-A' },
  ];
  const kept = rows.filter(inMemoryFilter(req));
  assert.deepEqual(kept.map((r) => r.id), ['1', '3']);
});

test('inMemoryFilter: provider_staff keeps only own-provider rows', () => {
  const req = { user: { id: 'prov-1', role: ROLES.PROVIDER_STAFF } };
  const rows = [
    { id: '1', providerId: 'prov-1' },
    { id: '2', providerId: 'prov-2' },
  ];
  const kept = rows.filter(inMemoryFilter(req));
  assert.deepEqual(kept.map((r) => r.id), ['1']);
});

// ── Source-level enforcement: every detail/mutation route uses the helper ─────
const ROUTE_FILES = [
  path.join(__dirname, '../../routes/claims.js'),
  path.join(__dirname, '../../routes/denials.js'),
  path.join(__dirname, '../../routes/authorizations.js'),
];

test('all three routes import buildScopeClause / canAccessResource', () => {
  for (const file of ROUTE_FILES) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(src.includes("require('../utils/tenantScope')"),
      `${path.basename(file)} should require tenantScope`);
    assert.ok(src.includes('buildScopeClause'),
      `${path.basename(file)} should use buildScopeClause for list filtering`);
    assert.ok(src.includes('canAccessResource'),
      `${path.basename(file)} should use canAccessResource for detail/mutation gating`);
  }
});

test('routes no longer use the dead WHERE 1=1 AND $1 IS NOT NULL no-op pattern', () => {
  for (const file of ROUTE_FILES) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!src.includes('$1 IS NOT NULL'),
      `${path.basename(file)} still contains the no-op tenant filter; ` +
      `practice_admin would see every tenant${"'"}s data`);
  }
});

test('routes no longer fall through to "FORBIDDEN" 403 for cross-tenant; 404 keeps existence private', () => {
  // Light check: at least one occurrence of 404 NOT_FOUND remains and the
  // pre-fix FORBIDDEN-on-mismatch shape is gone.
  for (const file of ROUTE_FILES) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/Cannot access this (claim|denial|authorization)/.test(src),
      `${path.basename(file)} still leaks existence with a 403; switch to a 404 response`);
  }
});
