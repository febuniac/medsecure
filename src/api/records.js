const router = require('express').Router();
const RecordService = require('../services/recordService');
const { formatErrorResponse } = require('../utils/errorCodes');
const { logger } = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

/**
 * Create a HIPAA-compliant audit log entry for record operations.
 */
function auditLog(action, { patientId, recordId, userId }) {
  logger.info({
    type: 'HIPAA_AUDIT',
    action,
    patientId,
    recordId,
    userId,
    timestamp: new Date().toISOString()
  });
}

router.get('/patient/:patientId', authMiddleware, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page, limit } = req.query;
    const records = await RecordService.getByPatient(patientId, req.user, { page, limit });
    auditLog('record_access', { patientId, userId: req.user?.id });
    res.json(records);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/', authMiddleware, async (req, res) => {
  try {
    const record = await RecordService.create(req.body, req.user);
    auditLog('record_create', { patientId: req.body.patient_id, recordId: record.id, userId: req.user?.id });
    res.status(201).json(record);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/patient/:patientId/lab-results', authMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const results = await RecordService.getLabResults(req.params.patientId, req.user, { page, limit });
    res.json(results);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await RecordService.getById(req.params.id, req.user);
    auditLog('record_access', { patientId: record.patient_id, recordId: record.id, userId: req.user?.id });
    res.json(record);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
module.exports = router;
module.exports.auditLog = auditLog;
