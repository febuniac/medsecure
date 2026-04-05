const router = require('express').Router();
const AppointmentService = require('../services/appointmentService');

router.get('/', async (req, res) => {
  const appointments = await AppointmentService.list(req.query, req.user);
  res.json(appointments);
});
router.post('/', async (req, res) => {
  const apt = await AppointmentService.create(req.body, req.user);
  res.status(201).json(apt);
});
router.put('/:id/cancel', async (req, res) => {
  const apt = await AppointmentService.cancel(req.params.id, req.user);
  res.json(apt);
});
module.exports = router;
