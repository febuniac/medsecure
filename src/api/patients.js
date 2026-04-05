const router = require('express').Router();
const PatientService = require('../services/patientService');

router.get('/', async (req, res) => {
  try {
    const patients = await PatientService.list(req.query, req.user);
    res.json(patients);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const patient = await PatientService.getById(req.params.id, req.user);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json(patient);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const patient = await PatientService.create(req.body, req.user);
    res.status(201).json(patient);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const patient = await PatientService.update(req.params.id, req.body, req.user);
    res.json(patient);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
