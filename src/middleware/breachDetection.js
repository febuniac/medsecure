const { logger } = require('../utils/logger');

/**
 * Breach Detection Middleware
 *
 * Monitors API requests for patterns that may indicate a data breach:
 * - Bulk PHI access (excessive record retrieval)
 * - Access outside normal hours
 * - Unauthorized access attempts (repeated 401/403)
 * - Unusual data export patterns
 *
 * Triggers are logged as BREACH_TRIGGER events for review and
 * can be configured to auto-create breach incidents.
 */

// In-memory tracking stores (in production, use Redis)
const accessTracker = new Map();
const failedAuthTracker = new Map();

// Configuration thresholds
const CONFIG = {
  bulkAccessThreshold: 100,       // Max PHI records accessed per window
  bulkAccessWindowMs: 300000,     // 5-minute window
  failedAuthThreshold: 10,        // Max failed auth attempts per window
  failedAuthWindowMs: 600000,     // 10-minute window
  afterHoursStart: 22,            // 10 PM
  afterHoursEnd: 6,               // 6 AM
  sensitiveEndpoints: [
    '/api/v1/patients',
    '/api/v1/records',
    '/api/v1/prescriptions'
  ]
};

/**
 * Check if current time is outside normal business hours.
 */
function isAfterHours() {
  const hour = new Date().getUTCHours();
  return hour >= CONFIG.afterHoursStart || hour < CONFIG.afterHoursEnd;
}

/**
 * Track and detect bulk PHI access patterns.
 */
function trackBulkAccess(userId, path) {
  const key = `${userId}:${path}`;
  const now = Date.now();

  if (!accessTracker.has(key)) {
    accessTracker.set(key, []);
  }

  const accesses = accessTracker.get(key);
  // Remove old entries outside the window
  const filtered = accesses.filter(ts => now - ts < CONFIG.bulkAccessWindowMs);
  filtered.push(now);
  accessTracker.set(key, filtered);

  return filtered.length >= CONFIG.bulkAccessThreshold;
}

/**
 * Track failed authentication attempts.
 */
function trackFailedAuth(identifier) {
  const now = Date.now();

  if (!failedAuthTracker.has(identifier)) {
    failedAuthTracker.set(identifier, []);
  }

  const attempts = failedAuthTracker.get(identifier);
  const filtered = attempts.filter(ts => now - ts < CONFIG.failedAuthWindowMs);
  filtered.push(now);
  failedAuthTracker.set(identifier, filtered);

  return filtered.length >= CONFIG.failedAuthThreshold;
}

/**
 * Check if the request targets a sensitive PHI endpoint.
 */
function isSensitiveEndpoint(path) {
  return CONFIG.sensitiveEndpoints.some(ep => path.startsWith(ep));
}

/**
 * Main breach detection middleware.
 * Attaches to the response finish event to analyze completed requests.
 */
function breachDetectionMiddleware(req, res, next) {
  res.on('finish', () => {
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip;
    const path = req.path;
    const triggers = [];

    // Trigger 1: Bulk PHI access detection
    if (isSensitiveEndpoint(path) && req.method === 'GET' && res.statusCode === 200) {
      if (trackBulkAccess(userId, path)) {
        triggers.push({
          trigger_type: 'bulk_phi_access',
          description: `User ${userId} exceeded bulk PHI access threshold on ${path}`,
          risk_level: 'high'
        });
      }
    }

    // Trigger 2: After-hours PHI access
    if (isSensitiveEndpoint(path) && res.statusCode === 200 && isAfterHours()) {
      triggers.push({
        trigger_type: 'after_hours_access',
        description: `After-hours PHI access by user ${userId} on ${path}`,
        risk_level: 'medium'
      });
    }

    // Trigger 3: Repeated failed authentication
    if (res.statusCode === 401 || res.statusCode === 403) {
      const identifier = ip || userId;
      if (trackFailedAuth(identifier)) {
        triggers.push({
          trigger_type: 'repeated_auth_failure',
          description: `Excessive failed auth attempts from ${identifier}`,
          risk_level: 'high'
        });
      }
    }

    // Trigger 4: Unauthorized PHI access attempt
    if (isSensitiveEndpoint(path) && res.statusCode === 403) {
      triggers.push({
        trigger_type: 'unauthorized_phi_access',
        description: `Unauthorized PHI access attempt by user ${userId} on ${path}`,
        risk_level: 'critical'
      });
    }

    // Log all triggered breach detections
    for (const trigger of triggers) {
      logger.warn({
        type: 'BREACH_TRIGGER',
        ...trigger,
        userId,
        ip,
        path,
        method: req.method,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
}

/**
 * Reset tracking stores (for testing).
 */
function resetTrackers() {
  accessTracker.clear();
  failedAuthTracker.clear();
}

/**
 * Get current tracker state (for testing/monitoring).
 */
function getTrackerState() {
  return {
    accessTrackerSize: accessTracker.size,
    failedAuthTrackerSize: failedAuthTracker.size
  };
}

module.exports = breachDetectionMiddleware;
module.exports.resetTrackers = resetTrackers;
module.exports.getTrackerState = getTrackerState;
module.exports.trackBulkAccess = trackBulkAccess;
module.exports.trackFailedAuth = trackFailedAuth;
module.exports.isAfterHours = isAfterHours;
module.exports.isSensitiveEndpoint = isSensitiveEndpoint;
module.exports.CONFIG = CONFIG;
