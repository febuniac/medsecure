const crypto = require('crypto');
const { logger } = require('../utils/logger');

module.exports = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      type: 'HIPAA_AUDIT',
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: req.user?.id,
      statusCode: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });
  next();
};
