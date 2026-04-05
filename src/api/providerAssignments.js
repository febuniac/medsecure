const router = require('express').Router();
const ProviderPatientService = require('../services/providerPatientService');

router.post('/', async (req, res) => {
  try {
    const assignment = await ProviderPatientService.assign(req.body, req.user);
    res.status(201).json(assignment);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const result = await ProviderPatientService.revoke(req.body, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/provider/:providerId', async (req, res) => {
  try {
    const assignments = await ProviderPatientService.listByProvider(req.params.providerId);
    res.json(assignments);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/patient/:patientId', async (req, res) => {
  try {
    const assignments = await ProviderPatientService.listByPatient(req.params.patientId);
    res.json(assignments);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
