const router = require('express').Router();
const PatientService = require('../services/patientService');
const PatientExportService = require('../services/patientExportService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/', async (req, res) => {
  try {
    const patients = await PatientService.list(req.query, req.user);
    res.json(patients);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/:id/export', async (req, res) => {
  try {
    const bundle = await PatientExportService.exportPatientData(req.params.id, req.user);
    res.set('Content-Type', 'application/fhir+json');
    res.json(bundle);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/:id', async (req, res) => {
  try {
    const patient = await PatientService.getById(req.params.id, req.user);
    res.json(patient);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/', async (req, res) => {
  try {
    const patient = await PatientService.create(req.body, req.user);
    res.status(201).json(patient);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.put('/:id', async (req, res) => {
  try {
    const patient = await PatientService.update(req.params.id, req.body, req.user);
    res.json(patient);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
module.exports = router;
