const router = require('express').Router();
const PrescriptionService = require('../services/prescriptionService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/patient/:patientId', async (req, res) => {
  try {
    const rxs = await PrescriptionService.getByPatient(req.params.patientId, req.user);
    res.json(rxs);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/', async (req, res) => {
  try {
    const rx = await PrescriptionService.create(req.body, req.user);
    res.status(201).json(rx);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/:id/refill', async (req, res) => {
  try {
    const rx = await PrescriptionService.refill(req.params.id, req.user);
    res.json(rx);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
module.exports = router;
