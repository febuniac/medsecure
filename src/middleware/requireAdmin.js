const { ErrorCodes, formatError } = require('../utils/errorCodes');

/**
 * Middleware that restricts access to admin users only.
 * Must be used after the auth middleware so that req.user is populated.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json(formatError(ErrorCodes.ADMIN_ONLY, 'Forbidden'));
  }
  next();
};

module.exports = requireAdmin;
