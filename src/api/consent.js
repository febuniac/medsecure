const router = require('express').Router();
const ConsentService = require('../services/consentService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/patient/:patientId', async (req, res) => {
  try {
    const consents = await ConsentService.getByPatient(req.params.patientId);
    res.json(consents);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/', async (req, res) => {
  try {
    const consent = await ConsentService.create(req.body, req.user);
    res.status(201).json(consent);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.put('/:id/revoke', async (req, res) => {
  try {
    const consent = await ConsentService.revoke(req.params.id, req.user);
    res.json(consent);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
module.exports = router;
