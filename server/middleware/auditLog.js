/**
 * Noesis.io Health — Audit Logging Middleware
 * © 2026 Athena Core Technologies
 *
 * HIPAA §164.312(b) requirement: audit controls must record and examine
 * activity in systems that contain or use ePHI.
 *
 * Strategy:
 *   1. Always write to in-memory buffer (fast, synchronous path)
 *   2. Asynchronously persist to PostgreSQL when DB is connected
 *   3. In-memory buffer rotates at MAX_LOGS to prevent unbounded growth
 */

const db = require('../db');

const MAX_LOGS = 10000;
let auditLogs = [];

/**
 * Persist a single log entry to the database (async, non-blocking).
 */
async function persistToDB(entry) {
  if (!db.isConnected()) return;
  try {
    await db.query(
      `INSERT INTO audit_logs
         (timestamp, user_id, user_role, action, method, path, status_code, ip_address, user_agent, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entry.timestamp,
        entry.userId,
        entry.userRole,
        entry.action,
        entry.method,
        entry.path,
        entry.statusCode,
        entry.ipAddress,
        entry.userAgent,
        entry.organizationId,
      ]
    );
  } catch (err) {
    // Log to stderr but never let audit persistence crash the request
    process.stderr.write(`[audit] DB write failed: ${err.message}\n`);
  }
}

/**
 * Middleware: logs every API request with user, action, IP, and response status.
 */
function auditLogMiddleware(req, res, next) {
  const originalSend = res.send.bind(res);

  res.send = function (data) {
    const entry = {
      timestamp: new Date().toISOString(),
      userId: req.user?.id || 'anonymous',
      userRole: req.user?.role || 'unauthenticated',
      action: `${req.method} ${req.path}`,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      organizationId: req.user?.organizationId || null,
    };

    // Write to in-memory buffer
    auditLogs.push(entry);
    if (auditLogs.length > MAX_LOGS) {
      auditLogs = auditLogs.slice(-MAX_LOGS);
    }

    // Async DB persistence — fire and forget
    persistToDB(entry);

    return originalSend(data);
  };

  next();
}

/**
 * Retrieve all in-memory logs (latest first).
 */
function getLogs() {
  return [...auditLogs].reverse();
}

/**
 * Retrieve logs from DB (with pagination) when available.
 * Falls back to in-memory.
 */
async function getLogsFromDB(limit = 100, offset = 0, userId = null) {
  if (!db.isConnected()) {
    const filtered = userId ? auditLogs.filter((l) => l.userId === userId) : auditLogs;
    const reversed = [...filtered].reverse();
    return {
      total: reversed.length,
      limit,
      offset,
      logs: reversed.slice(offset, offset + limit),
    };
  }

  const params = [];
  let where = 'WHERE 1=1';
  if (userId) {
    params.push(userId);
    where += ` AND user_id = $${params.length}`;
  }

  const countRes = await db.query(`SELECT COUNT(*) FROM audit_logs ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const dataRes = await db.query(
    `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { total, limit, offset, logs: dataRes.rows };
}

function getLogsByUser(userId) {
  return auditLogs.filter((log) => log.userId === userId);
}

function getPaginatedLogs(limit = 100, offset = 0) {
  const total = auditLogs.length;
  return { total, limit, offset, logs: auditLogs.slice(offset, offset + limit) };
}

function getStats() {
  const stats = { totalActions: auditLogs.length, actionsByType: {}, actionsByUser: {}, actionsByStatus: {} };

  for (const log of auditLogs) {
    stats.actionsByType[log.method] = (stats.actionsByType[log.method] || 0) + 1;
    if (!stats.actionsByUser[log.userId]) {
      stats.actionsByUser[log.userId] = { userId: log.userId, role: log.userRole, count: 0 };
    }
    stats.actionsByUser[log.userId].count += 1;
    const sk = String(log.statusCode);
    stats.actionsByStatus[sk] = (stats.actionsByStatus[sk] || 0) + 1;
  }

  stats.topUsers = Object.values(stats.actionsByUser)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return stats;
}

function clearLogs() {
  auditLogs = [];
}

module.exports = {
  auditLogMiddleware,
  getLogs,
  getLogsFromDB,
  getLogsByUser,
  getPaginatedLogs,
  getStats,
  clearLogs,
};
