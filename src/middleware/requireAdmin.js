const { ErrorCodes, formatError } = require('../utils/errorCodes');

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json(formatError(ErrorCodes.ADMIN_ONLY, 'Forbidden'));
  }
  next();
};

module.exports = requireAdmin;
