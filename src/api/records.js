const router = require('express').Router();
const RecordService = require('../services/recordService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/patient/:patientId', async (req, res) => {
  try {
    const records = await RecordService.getByPatient(req.params.patientId, req.user);
    res.json(records);
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
