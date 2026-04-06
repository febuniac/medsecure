const { logger } = require('../utils/logger');

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn({
      type: 'AUTHORIZATION',
      action: 'admin_access_denied',
      userId: req.user ? req.user.id : 'anonymous',
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

module.exports = requireAdmin;
