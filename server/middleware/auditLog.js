/**
 * Audit Logging Middleware
 * Logs every API request with user, action, IP, and user agent
 *
 * IMPORTANT: This uses in-memory storage for development/demo purposes.
 * In production, replace this with persistent logging to a database, SIEM,
 * or centralized logging service (e.g., ELK Stack, Splunk, DataDog, etc.)
 */

// In-memory log storage with rotation
const MAX_LOGS = 10000;
let auditLogs = [];

/**
 * Middleware: logs every request
 */
function auditLogMiddleware(req, res, next) {
  // Capture original send to log response
  const originalSend = res.send;
  let statusCode = res.statusCode;

  res.send = function(data) {
    statusCode = res.statusCode;

    // Create audit log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: req.user?.id || 'anonymous',
      userRole: req.user?.role || 'unauthenticated',
      action: `${req.method} ${req.path}`,
      method: req.method,
      path: req.path,
      statusCode,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'] || 'unknown',
      organizationId: req.user?.organizationId || null
    };

    auditLogs.push(logEntry);

    // Rotate old logs if we exceed max
    if (auditLogs.length > MAX_LOGS) {
      auditLogs = auditLogs.slice(-MAX_LOGS);
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Retrieve all audit logs
 * @returns {Array} Array of audit log entries
 */
function getLogs() {
  return auditLogs;
}

/**
 * Retrieve logs for a specific user
 * @param {string} userId - User ID to filter by
 * @returns {Array} Filtered audit log entries
 */
function getLogsByUser(userId) {
  return auditLogs.filter(log => log.userId === userId);
}

/**
 * Retrieve paginated logs
 * @param {number} limit - Number of logs to return
 * @param {number} offset - Number of logs to skip
 * @returns {Object} Paginated results with total count
 */
function getPaginatedLogs(limit = 100, offset = 0) {
  const total = auditLogs.length;
  const paginated = auditLogs.slice(offset, offset + limit);

  return {
    total,
    limit,
    offset,
    logs: paginated
  };
}

/**
 * Get audit log statistics
 * @returns {Object} Summary statistics
 */
function getStats() {
  const stats = {
    totalActions: auditLogs.length,
    actionsByType: {},
    actionsByUser: {},
    actionsByStatus: {}
  };

  auditLogs.forEach(log => {
    // Count by action type
    stats.actionsByType[log.method] = (stats.actionsByType[log.method] || 0) + 1;

    // Count by user
    const userKey = log.userId;
    if (!stats.actionsByUser[userKey]) {
      stats.actionsByUser[userKey] = {
        userId: userKey,
        role: log.userRole,
        count: 0
      };
    }
    stats.actionsByUser[userKey].count += 1;

    // Count by status code
    const statusKey = `${log.statusCode}`;
    stats.actionsByStatus[statusKey] = (stats.actionsByStatus[statusKey] || 0) + 1;
  });

  // Convert to arrays for easier consumption
  stats.topUsers = Object.values(stats.actionsByUser)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return stats;
}

/**
 * Clear all logs (useful for testing)
 */
function clearLogs() {
  auditLogs = [];
}

module.exports = {
  auditLogMiddleware,
  getLogs,
  getLogsByUser,
  getPaginatedLogs,
  getStats,
  clearLogs
};
