const crypto = require('crypto');
const { logger } = require('../utils/logger');

const HEADER_NAME = 'x-correlation-id';

/**
 * Generate a unique correlation ID.
 */
function generateCorrelationId() {
  return crypto.randomUUID();
}

/**
 * Middleware that generates and propagates X-Correlation-Id headers
 * for request tracing across services.
 *
 * - If the incoming request already has an X-Correlation-Id header, it is reused.
 * - Otherwise, a new UUID is generated.
 * - The correlation ID is attached to `req.correlationId` and set on the response header.
 * - A log entry is emitted for traceability.
 */
function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers[HEADER_NAME] || generateCorrelationId();

  req.correlationId = correlationId;
  res.setHeader(HEADER_NAME, correlationId);

  logger.info({
    type: 'CORRELATION_ID',
    correlationId,
    method: req.method,
    path: req.path
  });

  next();
}

module.exports = correlationIdMiddleware;
module.exports.generateCorrelationId = generateCorrelationId;
module.exports.HEADER_NAME = HEADER_NAME;
