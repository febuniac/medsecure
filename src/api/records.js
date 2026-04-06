const router = require('express').Router();
const RecordService = require('../services/recordService');
const { formatErrorResponse } = require('../utils/errorCodes');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

router.get('/patient/:patientId', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

    const result = await RecordService.getByPatient(req.params.patientId, req.user, { page, limit });
    res.json(result);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/', async (req, res) => {
  try {
    const record = await RecordService.create(req.body, req.user);
    res.status(201).json(record);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/:id', async (req, res) => {
  try {
    const record = await RecordService.getById(req.params.id, req.user);
    res.json(record);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
module.exports = router;
