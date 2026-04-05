const router = require('express').Router();
const RecordService = require('../services/recordService');

router.get('/patient/:patientId', async (req, res) => {
  const { page, limit } = req.query;
  const records = await RecordService.getByPatient(req.params.patientId, req.user, { page, limit });
  res.json(records);
});
router.post('/', async (req, res) => {
  const record = await RecordService.create(req.body, req.user);
  res.status(201).json(record);
});
router.get('/:id', async (req, res) => {
  const record = await RecordService.getById(req.params.id, req.user);
  res.json(record);
});
module.exports = router;
