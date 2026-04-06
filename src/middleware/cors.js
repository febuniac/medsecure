const { logger } = require('../utils/logger');

const DEFAULT_ALLOWED_ORIGINS = [
  'https://portal.medsecure.com'
];

function getAllowedOrigins() {
  if (process.env.CORS_ALLOWED_ORIGINS) {
    return process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.includes(origin)) {
      logger.warn({ type: 'CORS_REJECTED', origin: origin || 'none' });
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return res.status(204).end();
  }

  next();
}

module.exports = corsMiddleware;
module.exports.getAllowedOrigins = getAllowedOrigins;
module.exports.DEFAULT_ALLOWED_ORIGINS = DEFAULT_ALLOWED_ORIGINS;
