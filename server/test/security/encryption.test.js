/**
 * Regression test for April 2026 audit Critical #8: No encryption at rest.
 *
 * Original vulnerability (audit ref: throughout codebase):
 *   PHI was stored unencrypted; at-rest encryption was not implemented.
 *   In the in-memory prototype this still meant a database dump or
 *   Postgres backup contained patient names, DOBs, SSNs, MRNs, etc. in
 *   plaintext. HIPAA Safe Harbor (45 CFR 164.514(b)(2)) requires every
 *   one of those identifiers to be removed or encrypted before any
 *   disclosure.
 *
 * Attack path:
 *   1. Adversary obtains a database backup (insider, misconfigured
 *      Postgres permissions, breached cloud storage).
 *   2. Without field-level encryption, every patient name, DOB, SSN,
 *      and member id is readable in the dump.
 *   3. The breach is now a HIPAA breach-notification event (NOT just
 *      an exposure of "secured PHI" under the safe harbor).
 *
 * Fix: server/utils/encryption.js implements AES-256-GCM with a
 * 32-byte key supplied via PHI_ENCRYPTION_KEY env var. Production
 * startup throws if the key is missing. The claims route applies
 * encryptFields(...) before INSERT and decryptFields(...) after SELECT.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Production-spawn test fails because module load did not throw
 *     on missing key in pre-fix code.
 *   - Round-trip test fails if encryption is not applied (or if
 *     ciphertext equals plaintext).
 *   - Field-coverage test fails if fewer than the HIPAA-relevant
 *     identifiers are listed in CLAIM_PHI_FIELDS.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MODULE_PATH = path.resolve(__dirname, '..', '..', 'utils', 'encryption.js');

// Common test key: 32 hex bytes = 64 hex chars. Marked as a placeholder.
// gitleaks:allow - obvious test placeholder, not a real secret
const TEST_KEY = 'aabbccdd' + 'aabbccdd' + 'aabbccdd' + 'aabbccdd'
  + 'aabbccdd' + 'aabbccdd' + 'aabbccdd' + 'aabbccdd';

function loadModuleWithEnv(env) {
  // Force a fresh module load so the keyHex env var is consulted again.
  delete require.cache[require.resolve(MODULE_PATH)];
  for (const k of Object.keys(env)) {
    if (env[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = env[k];
    }
  }
  return require(MODULE_PATH);
}

test('Production startup throws when PHI_ENCRYPTION_KEY is unset', () => {
  // Spawn a fresh node process so the module-load IIFE is exercised
  // without state from this test process.
  const probe = `
    process.env.NODE_ENV = 'production';
    delete process.env.PHI_ENCRYPTION_KEY;
    try {
      const { encryptPHI } = require(${JSON.stringify(MODULE_PATH)});
      // The throw is deferred until the first encrypt/decrypt call.
      encryptPHI('test');
      console.log('NO_THROW');
    } catch (e) {
      console.log('THREW:' + e.message);
    }
  `;
  const env = { ...process.env };
  delete env.PHI_ENCRYPTION_KEY;
  env.NODE_ENV = 'production';

  const result = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' });

  assert.ok(
    result.stdout.includes('THREW:CRITICAL: PHI_ENCRYPTION_KEY'),
    'Production startup must refuse to encrypt without PHI_ENCRYPTION_KEY. '
      + `Got stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}.`
  );
});

test('Production accepts a properly-sized hex key', () => {
  const probe = `
    process.env.NODE_ENV = 'production';
    process.env.PHI_ENCRYPTION_KEY = ${JSON.stringify(TEST_KEY)};
    try {
      const { encryptPHI, decryptPHI } = require(${JSON.stringify(MODULE_PATH)});
      const enc = encryptPHI('Jane Doe');
      const dec = decryptPHI(enc);
      console.log('OK:' + (dec === 'Jane Doe'));
    } catch (e) {
      console.log('THREW:' + e.message);
    }
  `;
  const env = { ...process.env };
  env.NODE_ENV = 'production';
  env.PHI_ENCRYPTION_KEY = TEST_KEY;

  const result = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' });
  assert.ok(
    result.stdout.includes('OK:true'),
    `Round-trip must succeed with a valid key. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}.`
  );
});

test('Production rejects a wrong-length key', () => {
  const probe = `
    process.env.NODE_ENV = 'production';
    process.env.PHI_ENCRYPTION_KEY = 'too-short';
    try {
      const { encryptPHI } = require(${JSON.stringify(MODULE_PATH)});
      encryptPHI('test');
      console.log('NO_THROW');
    } catch (e) {
      console.log('THREW:' + e.message);
    }
  `;
  const env = { ...process.env };
  env.NODE_ENV = 'production';
  env.PHI_ENCRYPTION_KEY = 'too-short';

  const result = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' });
  assert.ok(
    result.stdout.includes('THREW:'),
    `Wrong-length key must throw. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}.`
  );
});

test('Round-trip: encryptPHI / decryptPHI preserves the original value', () => {
  const { encryptPHI, decryptPHI } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const plaintext = 'Jane Doe, DOB 1980-04-12, MRN 123456';
  const ciphertext = encryptPHI(plaintext);

  assert.notStrictEqual(ciphertext, plaintext, 'ciphertext must differ from plaintext');
  assert.notStrictEqual(ciphertext, undefined);
  assert.notStrictEqual(ciphertext, null);

  const recovered = decryptPHI(ciphertext);
  assert.strictEqual(recovered, plaintext, 'round-trip must preserve original value');
});

test('Same plaintext encrypts to different ciphertexts (random IV per call)', () => {
  const { encryptPHI } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const a = encryptPHI('Jane Doe');
  const b = encryptPHI('Jane Doe');
  assert.notStrictEqual(a, b,
    'AES-GCM must use a fresh random IV per encryption; identical ciphertexts indicate IV reuse.');
});

test('Tampered ciphertext fails authentication tag check', () => {
  const { encryptPHI, decryptPHI } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const ciphertext = encryptPHI('Jane Doe');
  // Flip a character in the middle of the base64 ciphertext payload.
  const parts = ciphertext.split(':');
  parts[1] = parts[1].slice(0, -2) + (parts[1].slice(-2, -1) === 'A' ? 'BB' : 'AA');
  const tampered = parts.join(':');
  assert.throws(
    () => decryptPHI(tampered),
    /unsupported state|bad decrypt|auth/i,
    'Decryption must fail when ciphertext is tampered (GCM auth-tag check).'
  );
});

test('encryptFields / decryptFields cover only the listed PHI fields and round-trip cleanly', () => {
  const { encryptFields, decryptFields, CLAIM_PHI_FIELDS } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const row = {
    id: 'claim-001',
    patient_name: 'Jane Doe',
    patient_dob: '1980-04-12',
    cpt_code: '99213',
    amount: 250.00,
  };
  const enc = encryptFields(row, CLAIM_PHI_FIELDS);
  // Non-PHI fields are unchanged.
  assert.strictEqual(enc.id, row.id);
  assert.strictEqual(enc.cpt_code, row.cpt_code);
  assert.strictEqual(enc.amount, row.amount);
  // PHI fields are now ciphertext.
  assert.notStrictEqual(enc.patient_name, row.patient_name);
  assert.notStrictEqual(enc.patient_dob, row.patient_dob);

  const dec = decryptFields(enc, CLAIM_PHI_FIELDS);
  assert.strictEqual(dec.patient_name, row.patient_name);
  assert.strictEqual(dec.patient_dob, row.patient_dob);
});

test('CLAIM_PHI_FIELDS covers HIPAA Safe-Harbor identifiers present in the claims schema', () => {
  const { CLAIM_PHI_FIELDS } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const required = [
    'patient_name',
    'patient_dob',
    'patient_ssn',
    'patient_mrn',
  ];
  for (const f of required) {
    assert.ok(
      CLAIM_PHI_FIELDS.includes(f),
      `CLAIM_PHI_FIELDS missing HIPAA Safe-Harbor identifier: ${f}`
    );
  }
});

test('getKeyFingerprint returns a deterministic short hex value (rotation tracking)', () => {
  const { getKeyFingerprint } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const fp1 = getKeyFingerprint();
  const fp2 = getKeyFingerprint();
  assert.strictEqual(fp1, fp2, 'key fingerprint must be deterministic for the same key');
  assert.match(fp1, /^[0-9a-f]+$/, 'fingerprint must be lowercase hex');
  assert.ok(fp1.length >= 8 && fp1.length <= 64, `fingerprint length must be reasonable, got ${fp1.length}`);
});

test('generateKey returns 32 bytes (64 hex chars) suitable for PHI_ENCRYPTION_KEY', () => {
  const { generateKey } = loadModuleWithEnv({ PHI_ENCRYPTION_KEY: TEST_KEY, NODE_ENV: 'test' });
  const k = generateKey();
  assert.strictEqual(typeof k, 'string');
  assert.strictEqual(k.length, 64, 'generated key must be 64 hex chars (32 bytes)');
  assert.match(k, /^[0-9a-f]+$/, 'generated key must be lowercase hex');
});

test('routes/claims.js applies encryptFields before INSERT', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'routes', 'claims.js'), 'utf8');
  // The encryptFields call must appear before the INSERT statement
  // so plaintext PHI never lands in Postgres.
  const encIdx = src.indexOf('encryptFields(');
  const insertIdx = src.search(/INSERT\s+INTO\s+claims/i);
  assert.ok(encIdx > 0, 'routes/claims.js must call encryptFields(...)');
  assert.ok(insertIdx > 0, 'routes/claims.js must contain INSERT INTO claims');
  assert.ok(
    encIdx < insertIdx,
    'encryptFields must run BEFORE the INSERT statement; otherwise plaintext PHI is written to disk.'
  );
});
