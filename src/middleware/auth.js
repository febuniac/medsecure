const jwt = require('jsonwebtoken');
const { ErrorCodes, formatError } = require('../utils/errorCodes');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json(formatError(ErrorCodes.AUTHENTICATION_REQUIRED, 'Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.role) {
      return res.status(401).json(formatError(ErrorCodes.INVALID_TOKEN, 'Token missing required role claim'));
    }
    req.user = decoded;
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
    { expiresIn: '8h' }
  );
}

module.exports = authenticate;
module.exports.generateToken = generateToken;
