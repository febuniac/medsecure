const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req, res, next, options) => {
    logger.warn({
      type: 'RATE_LIMIT_EXCEEDED',
      ip: req.ip,
      path: req.originalUrl,
      method: req.method
    });
    res.status(options.statusCode).json(options.message);
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Stricter limit for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req, res, next, options) => {
    logger.warn({
      type: 'AUTH_RATE_LIMIT_EXCEEDED',
      ip: req.ip,
      path: req.originalUrl,
      method: req.method
    });
    res.status(options.statusCode).json(options.message);
  }
});

module.exports = { apiLimiter, authLimiter };
