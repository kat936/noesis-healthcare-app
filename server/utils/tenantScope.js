/**
 * Noesis.io Health  - Tenant Scoping Helpers
 * © 2026 Athena Core Technologies, Inc.
 *
 * HIPAA §164.502(a) limits uses and disclosures of PHI to those permitted
 * by the Privacy Rule. For a multi-tenant claim/denial/authorization
 * surface, that means a practice_admin authenticated for organization-A
 * MUST NOT be able to read or mutate records owned by organization-B.
 *
 * The pre-fix routes filtered list endpoints only when role was
 * provider_staff, and resource-detail / mutation endpoints only checked
 * provider ownership. Practice_admin had no organization filter at all,
 * meaning a practice_admin token from org-A could read or mutate any
 * record by ID across the entire database. This module exists so that
 * exactly one rule is encoded in exactly one place and applied uniformly
 * across claims, denials, and authorizations.
 *
 * Scope rules
 *   provider_staff  - rows where provider_id = req.user.id
 *   practice_admin  - rows where organization_id = req.user.organizationId
 *   insurance_rep   - all rows (adjudicator role spans providers/orgs)
 *   super_admin     - all rows (Athena Core internal)
 *   anonymous       - no rows
 */

const { ROLES } = require('../config/roles');

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Build an SQL WHERE-clause fragment and parameters that scope a query to
 * the requesting user's tenant. Caller appends the fragment to an existing
 * `WHERE 1=1` clause.
 *
 * @param {object} req            Express request with req.user populated
 * @param {number} paramOffset    Number of placeholders already bound
 *                                (so $N numbering is correct)
 * @param {object} [columns]      Override column names if needed
 * @returns {{ clause: string, params: any[] }}
 */
function buildScopeClause(req, paramOffset = 0, columns = {}) {
  const providerCol = columns.provider     || 'provider_id';
  const orgCol      = columns.organization || 'organization_id';
  const role        = req.user && req.user.role;
  const params      = [];
  let clause        = '';

  if (role === ROLES.PROVIDER_STAFF) {
    params.push(req.user.id);
    clause = ` AND ${providerCol} = $${paramOffset + params.length}`;
  } else if (role === ROLES.PRACTICE_ADMIN) {
    // Defensive: if a practice_admin token is missing organizationId,
    // bind a sentinel UUID that will match no rows. This is safer than
    // omitting the filter and accidentally returning every tenant's data.
    params.push(req.user.organizationId || NULL_UUID);
    clause = ` AND ${orgCol} = $${paramOffset + params.length}`;
  }
  // insurance_rep and super_admin have no tenant filter.

  return { clause, params };
}

/**
 * Returns true if req.user is allowed to access (read or mutate) the
 * given resource. Resource shape: { providerId, organizationId }.
 *
 * Use after fetching a row by id to gate detail / update / delete handlers.
 * Returns false for anonymous users and unknown roles.
 */
function canAccessResource(req, resource) {
  if (!req.user || !resource) { return false; }
  const role = req.user.role;

  if (role === ROLES.SUPER_ADMIN || role === ROLES.INSURANCE_REP) {
    return true;
  }
  if (role === ROLES.PROVIDER_STAFF) {
    return resource.providerId === req.user.id;
  }
  if (role === ROLES.PRACTICE_ADMIN) {
    return Boolean(req.user.organizationId) &&
      resource.organizationId === req.user.organizationId;
  }
  return false;
}

/**
 * Predicate for in-memory `Array.filter()` fallback paths (when the DB
 * is offline). Uses the same semantics as buildScopeClause.
 */
function inMemoryFilter(req) {
  if (!req.user) { return () => false; }
  const role = req.user.role;

  if (role === ROLES.PROVIDER_STAFF) {
    return (r) => r && r.providerId === req.user.id;
  }
  if (role === ROLES.PRACTICE_ADMIN) {
    return (r) => r &&
      Boolean(req.user.organizationId) &&
      r.organizationId === req.user.organizationId;
  }
  if (role === ROLES.INSURANCE_REP || role === ROLES.SUPER_ADMIN) {
    return () => true;
  }
  return () => false;
}

/**
 * Express middleware: 404 if the resource fetched into res.locals[key]
 * does not belong to req.user's tenant. Hides the existence of records
 * the caller has no right to see (preferable to 403 for HIPAA, since
 * "no such record" leaks zero PHI either way).
 */
function requireTenantAccess(resourceLocalsKey) {
  return (req, res, next) => {
    const resource = res.locals && res.locals[resourceLocalsKey];
    if (!resource) {
      return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    }
    if (!canAccessResource(req, resource)) {
      return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    }
    return next();
  };
}

module.exports = {
  buildScopeClause,
  canAccessResource,
  inMemoryFilter,
  requireTenantAccess,
  NULL_UUID,
};
