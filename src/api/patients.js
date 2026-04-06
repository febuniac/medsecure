const router = require('express').Router();
const PatientService = require('../services/patientService');
const PatientExportService = require('../services/patientExportService');
const { sanitizePatientError } = require('../utils/errorCodes');

router.get('/', async (req, res) => {
  try {
    const patients = await PatientService.list(req.query, req.user);
    res.json(patients);
  } catch (err) {
    const { status, body } = sanitizePatientError(err);
    res.status(status).json(body);
  }
});
router.get('/:id/export', async (req, res) => {
  try {
    const bundle = await PatientExportService.exportPatientData(req.params.id, req.user);
    res.set('Content-Type', 'application/fhir+json');
    res.json(bundle);
  } catch (err) {
    const { status, body } = sanitizePatientError(err);
    res.status(status).json(body);
  }
});
router.get('/mrn/:mrn', async (req, res) => {
  const { mrn } = req.params;
  if (!mrn || typeof mrn !== 'string' || mrn.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid MRN' });
  }
  try {
    const patient = await PatientService.getByMrn(mrn, req.user);
    res.json(patient);
  } catch (err) {
    const { status, body } = sanitizePatientError(err);
    res.status(status).json(body);
  }
});
router.get('/:id', async (req, res) => {
  const patientId = req.params.id;
  if (!patientId || !/^[0-9]+$/.test(patientId)) {
    return res.status(400).json({ error: 'Invalid patient ID' });
  }
  try {
    const patient = await PatientService.getById(patientId, req.user);
    res.json(patient);
  } catch (err) {
    const { status, body } = sanitizePatientError(err);
    res.status(status).json(body);
  }
});
router.post('/', async (req, res) => {
  try {
    const patient = await PatientService.create(req.body, req.user);
    res.status(201).json(patient);
  } catch (err) {
    const { status, body } = sanitizePatientError(err);
    res.status(status).json(body);
  }
});
router.put('/:id', async (req, res) => {
  const patientId = req.params.id;
  if (!patientId || !/^[0-9]+$/.test(patientId)) {
    return res.status(400).json({ error: 'Invalid patient ID' });
  }
  try {
    const patient = await PatientService.update(patientId, req.body, req.user);
    res.json(patient);
  } catch (err) {
    const { status, body } = sanitizePatientError(err);
    res.status(status).json(body);
  }
});
module.exports = router;
