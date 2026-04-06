const jwt = require('jsonwebtoken');
const { ErrorCodes, formatError } = require('../utils/errorCodes');

const SESSION_EXPIRY = '15m'; // HIPAA-compliant session timeout

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json(formatError(ErrorCodes.AUTHENTICATION_REQUIRED, 'Authentication required'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json(formatError(ErrorCodes.INVALID_TOKEN, 'Invalid token'));
  }
};

function generateToken(user) {
  const secret = process.env.JWT_SECRET;
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: SESSION_EXPIRY }
  );
}

module.exports = authenticate;
module.exports.generateToken = generateToken;
module.exports.SESSION_EXPIRY = SESSION_EXPIRY;
