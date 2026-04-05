const router = require('express').Router();
const PrescriptionService = require('../services/prescriptionService');

router.get('/patient/:patientId', async (req, res) => {
  const rxs = await PrescriptionService.getByPatient(req.params.patientId, req.user);
  res.json(rxs);
});
router.post('/', async (req, res) => {
  const rx = await PrescriptionService.create(req.body, req.user);
  res.status(201).json(rx);
});
router.post('/:id/refill', async (req, res) => {
  const rx = await PrescriptionService.refill(req.params.id, req.user);
  res.json(rx);
});
module.exports = router;
