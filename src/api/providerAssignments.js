const router = require('express').Router();
const ProviderPatientService = require('../services/providerPatientService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.post('/', async (req, res) => {
  try {
    const assignment = await ProviderPatientService.assign(req.body, req.user);
    res.status(201).json(assignment);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.delete('/', async (req, res) => {
  try {
    const result = await ProviderPatientService.revoke(req.body, req.user);
    res.json(result);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get('/provider/:providerId', async (req, res) => {
  try {
    const assignments = await ProviderPatientService.listByProvider(req.params.providerId);
    res.json(assignments);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get('/patient/:patientId', async (req, res) => {
  try {
    const assignments = await ProviderPatientService.listByPatient(req.params.patientId);
    res.json(assignments);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

module.exports = router;
