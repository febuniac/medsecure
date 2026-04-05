const router = require('express').Router();
const AppointmentService = require('../services/appointmentService');

router.get('/', async (req, res) => {
  try {
    const appointments = await AppointmentService.list(req.query, req.user);
    res.json(appointments);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const apt = await AppointmentService.create(req.body, req.user);
    res.status(201).json(apt);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/:id/cancel', async (req, res) => {
  try {
    const apt = await AppointmentService.cancel(req.params.id, req.user);
    res.json(apt);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
