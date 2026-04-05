const ProviderPatientService = require('../services/providerPatientService');
const { logger } = require('../utils/logger');

/**
 * Middleware factory that enforces provider-patient assignment checks.
 * Extracts patientId from the specified request parameter.
 *
 * @param {string} paramName - The request parameter name containing the patient ID (default: 'patientId')
 * @param {object} options - Additional options
 * @param {boolean} options.allowAdmin - Whether admin users bypass the check (default: true)
 */
function requirePatientAccess(paramName = 'patientId', options = {}) {
  const { allowAdmin = true } = options;

  return async (req, res, next) => {
    try {
      const patientId = req.params[paramName] || req.body.patient_id;

      if (!patientId) {
        return res.status(400).json({ error: 'Patient ID is required' });
      }

      const user = req.user;

      if (allowAdmin && user.role === 'admin') {
        return next();
      }

      const hasAccess = await ProviderPatientService.isAssigned(user.provider_id, patientId);

      if (!hasAccess) {
        logger.warn({
          type: 'ACCESS_DENIED',
          action: 'patient_record_access',
          userId: user.id,
          providerId: user.provider_id,
          patientId,
          reason: 'Provider not assigned to patient',
        });
        return res.status(403).json({
          error: 'Access denied: you are not assigned to this patient',
        });
      }

      next();
    } catch (err) {
      logger.error({
        type: 'ACCESS_CHECK_ERROR',
        error: err.message,
        userId: req.user?.id,
      });
      res.status(500).json({ error: 'Internal server error during access check' });
    }
  };
}

/**
 * Middleware that restricts access to admin users only.
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    logger.warn({
      type: 'ACCESS_DENIED',
      action: 'admin_only_endpoint',
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requirePatientAccess, requireAdmin };
