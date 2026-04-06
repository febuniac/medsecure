const router = require('express').Router();
const AppointmentService = require('../services/appointmentService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/', async (req, res) => {
  try {
    const appointments = await AppointmentService.list(req.query, req.user);
    res.json(appointments);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.post('/', async (req, res) => {
  try {
    const apt = await AppointmentService.create(req.body, req.user);
    res.status(201).json(apt);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.put('/:id/cancel', async (req, res) => {
  try {
    const apt = await AppointmentService.cancel(req.params.id, req.user);
    res.json(apt);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

module.exports = router;
