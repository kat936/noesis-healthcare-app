/**
 * Noesis.io Health — Database Connection
 * © 2026 Athena Core Technologies
 *
 * PostgreSQL connection pool via node-postgres (pg).
 * Gracefully falls back to in-memory mode when DATABASE_URL is not set,
 * so the server starts in development/demo without a live DB.
 */

const { Pool } = require('pg');

let pool = null;
let connected = false;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('connect', () => {
    connected = true;
    console.log('✓ PostgreSQL connected');
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
    connected = false;
  });

  // Test connection on startup
  pool.query('SELECT NOW()').then(() => {
    connected = true;
    console.log('✓ PostgreSQL connection verified');
  }).catch((err) => {
    console.warn('⚠ PostgreSQL unavailable — running in in-memory mode:', err.message);
    connected = false;
  });
} else {
  console.warn('⚠ DATABASE_URL not set — running in in-memory mode (not for production)');
}

/**
 * Execute a parameterized query.
 * Throws if DB is not configured.
 */
async function query(text, params = []) {
  if (!pool) throw new Error('Database not configured. Set DATABASE_URL env variable.');
  return pool.query(text, params);
}

/**
 * Get a client from the pool for transactions.
 */
async function getClient() {
  if (!pool) throw new Error('Database not configured. Set DATABASE_URL env variable.');
  return pool.connect();
}

/**
 * Run multiple queries in a transaction.
 * @param {Function} fn - async function that receives client
 */
async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns true if a live DB connection is available.
 */
function isConnected() {
  return connected && pool !== null;
}

/**
 * Initialize the database schema (idempotent).
 * Run once on server startup if DB is connected.
 */
async function initSchema() {
  if (!isConnected()) return;

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'provider_staff',
      organization_id UUID,
      organization_name TEXT,
      npi TEXT,
      plan TEXT NOT NULL DEFAULT 'solo',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add missing columns to existing users table (safe, idempotent)
  const userCols = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_name TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS npi TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`,
  ];
  for (const col of userCols) {
    await query(col).catch(() => {}); // ignore if already exists
  }

  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      npi TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID NOT NULL,
      organization_id UUID,
      patient_name TEXT NOT NULL,
      patient_dob TEXT,
      cpt_code TEXT NOT NULL,
      icd10_code TEXT NOT NULL,
      service_date DATE NOT NULL,
      amount NUMERIC(10, 2) NOT NULL,
      payer TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      modifiers TEXT[],
      urgency TEXT DEFAULT 'standard',
      strategic_score JSONB,
      adjudication_notes TEXT,
      appeals JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      user_id TEXT NOT NULL,
      user_role TEXT,
      action TEXT NOT NULL,
      method TEXT,
      path TEXT,
      status_code INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      organization_id TEXT,
      correlation_id UUID DEFAULT gen_random_uuid()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID,
      sender_id UUID NOT NULL,
      recipient_id UUID,
      organization_id UUID,
      subject TEXT NOT NULL DEFAULT 'Direct message',
      body TEXT NOT NULL,
      is_phi BOOLEAN DEFAULT TRUE,
      attachments JSONB DEFAULT '[]',
      read_by TEXT[] DEFAULT '{}',
      read_at TIMESTAMPTZ,
      status TEXT DEFAULT 'sent',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS authorizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id TEXT NOT NULL,
      organization_id UUID,
      patient_name TEXT NOT NULL,
      patient_dob TEXT,
      member_id TEXT,
      payer_id TEXT NOT NULL,
      payer_name TEXT,
      service_type TEXT NOT NULL,
      cpt_codes TEXT[],
      icd10_codes TEXT[],
      requested_date DATE DEFAULT CURRENT_DATE,
      service_start_date DATE,
      service_end_date DATE,
      urgency TEXT DEFAULT 'routine',
      clinical_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      auth_number TEXT,
      approved_units INTEGER,
      denial_reason TEXT,
      submitted_by TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS eligibility_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id TEXT NOT NULL,
      organization_id UUID,
      member_id TEXT,
      patient_name TEXT,
      payer_id TEXT NOT NULL,
      payer_name TEXT,
      service_type TEXT,
      is_eligible BOOLEAN,
      plan_name TEXT,
      result JSONB,
      source TEXT DEFAULT 'demo',
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS denials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      claim_id UUID,
      provider_id TEXT NOT NULL,
      payer_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      service_date DATE,
      denied_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      claim_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      denial_reason TEXT NOT NULL,
      denial_reason_text TEXT,
      denial_date DATE,
      appeal_deadline DATE,
      status TEXT NOT NULL DEFAULT 'pending_review',
      cpt_code TEXT,
      place_of_service TEXT,
      appeals JSONB DEFAULT '[]',
      status_history JSONB DEFAULT '[]',
      organization_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      participants TEXT[] NOT NULL,
      created_by TEXT NOT NULL,
      encrypted BOOLEAN DEFAULT TRUE,
      organization_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_claims_provider ON claims(provider_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_denials_provider ON denials(provider_id);
    CREATE INDEX IF NOT EXISTS idx_denials_status ON denials(status);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  `).catch(() => {}); // indexes may already exist — safe to ignore

  console.log('✓ Database schema initialized');
}

module.exports = { query, getClient, withTransaction, isConnected, initSchema };
