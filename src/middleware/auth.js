const jwt = require('jsonwebtoken');
const { ErrorCodes, formatError } = require('../utils/errorCodes');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json(formatError(ErrorCodes.AUTHENTICATION_REQUIRED, 'Authentication required'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json(formatError(ErrorCodes.INVALID_TOKEN, 'Invalid token'));
  }
};
