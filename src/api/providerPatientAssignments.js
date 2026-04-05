const router = require('express').Router();
const ProviderPatientService = require('../services/providerPatientService');
const { requireAdmin } = require('../middleware/providerPatientAuth');

// Assign a provider to a patient (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { provider_id, patient_id } = req.body;
    if (!provider_id || !patient_id) {
      return res.status(400).json({ error: 'provider_id and patient_id are required' });
    }
    const assignment = await ProviderPatientService.assign(req.body, req.user);
    res.status(201).json(assignment);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Revoke a provider-patient assignment (admin only)
router.delete('/:providerId/:patientId', requireAdmin, async (req, res) => {
  try {
    const result = await ProviderPatientService.revoke(
      req.params.providerId,
      req.params.patientId,
      req.user
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// List assignments for a provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    // Non-admin users can only view their own assignments
    if (req.user.role !== 'admin' && req.user.provider_id !== req.params.providerId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignments = await ProviderPatientService.listByProvider(req.params.providerId);
    res.json(assignments);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// List assignments for a patient (admin only)
router.get('/patient/:patientId', requireAdmin, async (req, res) => {
  try {
    const assignments = await ProviderPatientService.listByPatient(req.params.patientId);
    res.json(assignments);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
