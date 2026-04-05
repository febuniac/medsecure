const router = require('express').Router();
const RecordService = require('../services/recordService');

router.get('/patient/:patientId', async (req, res) => {
  try {
    const records = await RecordService.getByPatient(req.params.patientId, req.user);
    res.json(records);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const record = await RecordService.create(req.body, req.user);
    res.status(201).json(record);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await RecordService.getById(req.params.id, req.user);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
