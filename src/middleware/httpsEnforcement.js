const { logger } = require('../utils/logger');

const PHI_ROUTE_PATTERNS = [
  '/api/v1/patients',
  '/api/v1/records'
];

function isPhiEndpoint(path) {
  return PHI_ROUTE_PATTERNS.some(pattern => path.startsWith(pattern));
}

function isSecure(req) {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.protocol === 'https'
  );
}

function httpsEnforcement(req, res, next) {
  if (isPhiEndpoint(req.path) && !isSecure(req)) {
    logger.warn({
      type: 'HIPAA_SECURITY',
      event: 'insecure_phi_access_blocked',
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      const host = req.headers.host || req.hostname;
      const redirectUrl = `https://${host}${req.originalUrl}`;
      return res.redirect(301, redirectUrl);
    }

    return res.status(403).json({
      error: 'HTTPS required',
      message: 'PHI endpoints require a secure HTTPS connection per HIPAA Security Rule'
    });
  }

  next();
}

module.exports = httpsEnforcement;
module.exports.isPhiEndpoint = isPhiEndpoint;
module.exports.isSecure = isSecure;
module.exports.PHI_ROUTE_PATTERNS = PHI_ROUTE_PATTERNS;
