const helmet = require('helmet');
const { logger } = require('../utils/logger');

const HSTS_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    hsts: {
      maxAge: HSTS_MAX_AGE,
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  });
}

function additionalSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE}; includeSubDomains; preload`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

  logger.info({
    type: 'SECURITY_HEADERS',
    event: 'headers_applied',
    path: req.path,
    method: req.method
  });

  next();
}

function securityHeaders() {
  const helmetMiddleware = configureHelmet();

  return function securityHeadersMiddleware(req, res, next) {
    helmetMiddleware(req, res, (err) => {
      if (err) return next(err);
      additionalSecurityHeaders(req, res, next);
    });
  };
}

module.exports = securityHeaders;
module.exports.configureHelmet = configureHelmet;
module.exports.additionalSecurityHeaders = additionalSecurityHeaders;
module.exports.HSTS_MAX_AGE = HSTS_MAX_AGE;
