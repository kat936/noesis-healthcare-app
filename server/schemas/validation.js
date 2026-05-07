const { z } = require('zod');

/**
 * HTML/Script Injection Sanitization
 * Removes HTML tags and dangerous characters.
 *
 * `safeString` is a complete string schema with the sanitizing transform
 * applied. It can be chained with `.optional()` and `.default()` because
 * those methods exist on ZodEffects.
 *
 * `boundedSafeString(min, max)` returns a fresh schema that applies
 * length constraints BEFORE the transform. This is required because
 * `.min()` and `.max()` are methods on ZodString, not on ZodEffects, so
 * they cannot be chained after `.transform()`. Use this helper anywhere
 * a length-bounded sanitized string is needed.
 */
const sanitize = (s) => s.replace(/<[^>]*>/g, '').replace(/[<>'"`;]/g, '');
const safeString = z.string().transform(sanitize);
const boundedSafeString = (min, max) => {
  let s = z.string();
  if (min !== undefined) {
    s = s.min(min);
  }
  if (max !== undefined) {
    s = s.max(max);
  }
  return s.transform(sanitize);
};

/**
 * Login Schema
 * email: valid email format
 * password: minimum 8 characters
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

/**
 * Claim Schema
 * Full claim submission with medical coding validation
 */
const claimSchema = z.object({
  patientName: boundedSafeString(2, 100),
  providerId: z.string().uuid('Invalid provider ID'),
  payerId: z.string().min(1),
  cptCode: z.string().regex(/^\d{5}$/, 'CPT code must be 5 digits'),
  icd10Code: z.string().regex(/^[A-Z]\d{2}(\.\d{1,4})?$/, 'Invalid ICD-10 format'),
  amount: z.number().positive('Amount must be positive').max(1000000),
  serviceDate: z.string().datetime(),
  modifiers: z.array(z.string().max(2)).optional().default([]),
  placeOfService: z.string().optional(),
  urgency: z.enum(['routine', 'urgent', 'emergency']).optional().default('routine')
});

/**
 * Authorization Schema
 * Prior authorization request
 */
const authorizationSchema = z.object({
  patientName: boundedSafeString(2, 100),
  procedureCode: z.string().regex(/^\d{5}$/, 'Invalid procedure code'),
  payerId: z.string().min(1),
  urgency: z.enum(['routine', 'urgent', 'emergency']),
  clinicalNotes: boundedSafeString(undefined, 5000),
  diagnosisCode: z.string().regex(/^[A-Z]\d{2}(\.\d{1,4})?$/).optional()
});

/**
 * Secure Messaging Schema
 * Encrypted messaging between providers and insurers
 */
const messageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  recipientId: z.string().uuid('Invalid recipient ID'),
  body: boundedSafeString(1, 10000),
  attachments: z.array(z.string().uuid()).max(5).optional().default([])
});

/**
 * Eligibility Verification Schema
 * Patient eligibility lookup parameters
 */
const eligibilitySchema = z.object({
  patientName: safeString.optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  memberId: z.string().optional(),
  payerId: z.string().min(1),
  serviceType: z.string().optional()
});

/**
 * NPI Lookup Schema
 * National Provider Index search parameters
 * At least one search field required
 */
const npiLookupSchema = z.object({
  npiNumber: z.string().regex(/^\d{10}$/, 'NPI must be 10 digits').optional(),
  firstName: safeString.optional(),
  lastName: safeString.optional(),
  state: z.string().length(2).optional(),
  taxonomyDescription: safeString.optional()
}).refine(
  (data) => data.npiNumber || data.lastName,
  { message: 'Either NPI number or last name required' }
);

/**
 * Search Schema
 * Global search across claims, authorizations, patients
 */
const searchSchema = z.object({
  query: boundedSafeString(1, 200),
  type: z.enum(['claims', 'authorizations', 'patients', 'all']).optional().default('all'),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0)
});

/**
 * Contract Schema
 * Payer contract submission and management
 */
const contractSchema = z.object({
  payerId: z.string().min(1),
  providerNetworkId: z.string().optional(),
  effectiveDate: z.string().datetime(),
  terminationDate: z.string().datetime().optional(),
  termsAndConditions: boundedSafeString(undefined, 10000),
  copay: z.number().optional(),
  coinsurancePercentage: z.number().min(0).max(100).optional()
});

/**
 * Drug/Device Search Schema
 * OpenFDA integration search
 */
const drugSearchSchema = z.object({
  brandName: safeString.optional(),
  genericName: safeString.optional(),
  manufacturer: safeString.optional(),
  limit: z.number().min(1).max(20).optional().default(5)
});

/**
 * Authorization Update Schema
 * For PUT endpoint - updating authorization status and details
 */
const authorizationUpdateSchema = z.object({
  status: z.enum(['submitted', 'approved', 'denied', 'expired']),
  approvalNotes: boundedSafeString(undefined, 5000).optional(),
  conditions: boundedSafeString(undefined, 5000).optional()
});

/**
 * FDA Device Search Schema
 * OpenFDA device search parameters
 */
const fdaDeviceSearchSchema = z.object({
  deviceName: safeString.optional(),
  deviceClass: safeString.optional(),
  limit: z.number().min(1).max(20).optional().default(5)
});

module.exports = {
  loginSchema,
  claimSchema,
  authorizationSchema,
  messageSchema,
  eligibilitySchema,
  npiLookupSchema,
  searchSchema,
  contractSchema,
  drugSearchSchema,
  authorizationUpdateSchema,
  fdaDeviceSearchSchema,
  safeString,
  boundedSafeString
};
