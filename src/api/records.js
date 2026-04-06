const express = require('express');
const router = express.Router();
const RecordService = require('../services/recordService');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/patient/:patientId', async (req, res) => {
  try {
    const records = await RecordService.getByPatient(req.params.patientId, req.user);
    res.json(records);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/', async (req, res) => {
  try {
    const record = await RecordService.create(req.body, req.user);
    res.status(201).json(record);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/:id', async (req, res) => {
  try {
    const record = await RecordService.getById(req.params.id, req.user);
    res.json(record);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.post('/:id/image', express.raw({ type: ['image/*', 'application/dicom', 'application/pdf'], limit: '20mb' }), async (req, res) => {
  try {
    const fileName = req.headers['x-file-name'] || 'upload';
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const updated = await RecordService.attachImage(req.params.id, req.user, req.body, fileName, contentType);
    res.status(200).json(updated);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
router.get('/:id/image', async (req, res) => {
  try {
    const result = await RecordService.getImageUrl(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});
module.exports = router;
