/**
 * Noesis.io Health  - PHI Encryption Utility
 * © 2026 Athena Core Technologies
 *
 * AES-256-GCM symmetric encryption for Protected Health Information (PHI).
 * Used when storing sensitive fields (patient name, DOB, SSN, diagnosis) in the DB.
 *
 * Key must be a 32-byte hex string set in PHI_ENCRYPTION_KEY env variable.
 * Never log, expose, or commit actual key values.
 *
 * HIPAA requirement: PHI must be encrypted at rest (§164.312(a)(2)(iv)).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;    // 128-bit IV for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag
const KEY_LENGTH = 32;   // 256-bit key

let encryptionKey = null;

function getKey() {
  if (encryptionKey) return encryptionKey;

  const keyHex = process.env.PHI_ENCRYPTION_KEY;
  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL: PHI_ENCRYPTION_KEY not set. PHI encryption is required in production.');
    }
    console.warn('⚠ PHI_ENCRYPTION_KEY not set  - using dev key (NOT for production)');
    encryptionKey = crypto.scryptSync('dev-phi-key-change-in-production', 'salt', KEY_LENGTH);
    return encryptionKey;
  }

  // HIPAA §164.312(a)(2)(iv) key custody: in production, the PHI encryption
  // key MUST be sourced from AWS Secrets Manager (or an equivalent secrets
  // store), never from a committed .env file. We surface a non-fatal warning
  // when the deploy environment is missing the fingerprint hint that
  // indicates the value came from Secrets Manager.
  if (process.env.NODE_ENV === 'production' && !process.env.AWS_SECRETS_MANAGER_KEY_ARN) {
    console.warn('⚠ PHI_ENCRYPTION_KEY appears to be set without AWS_SECRETS_MANAGER_KEY_ARN. ' +
      'In production this key MUST be sourced from AWS Secrets Manager. ' +
      'See HIPAA-COMPLIANCE.md §164.312(a)(2)(iv).');
  }

  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`PHI_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes). Got ${keyBuffer.length} bytes.`);
  }

  encryptionKey = keyBuffer;
  return encryptionKey;
}

/**
 * Encrypt a PHI string value.
 * Returns a base64-encoded string: iv:ciphertext:tag
 *
 * @param {string} plaintext - The PHI value to encrypt
 * @returns {string} Encrypted value as "iv:ciphertext:authTag" (all base64)
 */
function encryptPHI(plaintext) {
  if (!plaintext) return plaintext;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

/**
 * Decrypt an encrypted PHI string.
 *
 * @param {string} encryptedValue - The "iv:ciphertext:authTag" string from encryptPHI()
 * @returns {string} Decrypted plaintext
 */
function decryptPHI(encryptedValue) {
  if (!encryptedValue) return encryptedValue;

  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    // Not encrypted (legacy / plain text)  - return as-is
    return encryptedValue;
  }

  const key = getKey();
  const iv = Buffer.from(parts[0], 'base64');
  const ciphertext = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * Encrypt a set of PHI fields from an object.
 * Only encrypts fields listed in the fields array.
 *
 * @param {Object} obj - Source object
 * @param {string[]} fields - Field names to encrypt
 * @returns {Object} New object with specified fields encrypted
 */
function encryptFields(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== null && result[field] !== undefined) {
      result[field] = encryptPHI(String(result[field]));
    }
  }
  return result;
}

/**
 * Decrypt a set of PHI fields from an object.
 *
 * @param {Object} obj - Source object with encrypted fields
 * @param {string[]} fields - Field names to decrypt
 * @returns {Object} New object with specified fields decrypted
 */
function decryptFields(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] !== null && result[field] !== undefined) {
      try {
        result[field] = decryptPHI(result[field]);
      } catch {
        // If decryption fails, return as-is (may be unencrypted legacy data)
      }
    }
  }
  return result;
}

/**
 * PHI fields that must be encrypted in the claims table.
 *
 * Expansion follows HIPAA Safe Harbor 18-identifier list — any field that
 * could individually or in combination identify a patient is encrypted at
 * rest. The bcrypt-hashed fields (e.g. password hashes) are out of scope
 * because they are already one-way and not PHI.
 */
const CLAIM_PHI_FIELDS = [
  'patient_name',
  'patient_dob',
  'patient_ssn',
  'patient_mrn',
  'patient_address',
  'patient_phone',
  'patient_email',
  'patient_zip',
  'subscriber_id',
  'member_id',
  'policy_number',
];

/**
 * PHI fields that must be encrypted in the users (provider) table.
 * The user's login email is not PHI on its own (it identifies the
 * workforce member, not a patient) and remains plaintext for indexing.
 */
const USER_PHI_FIELDS = ['phone', 'mobile'];

/**
 * Audit-log support: emit a key fingerprint alongside encrypted values so
 * that during key rotation we know which key version produced a given
 * ciphertext. The fingerprint is the first 8 hex chars of SHA-256(key) —
 * deterministic but not key-recovering.
 */
function getKeyFingerprint() {
  const key = getKey();
  const digest = crypto.createHash('sha256').update(key).digest('hex');
  return digest.slice(0, 8);
}

/**
 * Generate a new 256-bit hex key suitable for PHI_ENCRYPTION_KEY.
 * Operators run this offline to provision / rotate keys.
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

module.exports = {
  encryptPHI,
  decryptPHI,
  encryptFields,
  decryptFields,
  getKeyFingerprint,
  generateKey,
  CLAIM_PHI_FIELDS,
  USER_PHI_FIELDS,
};
