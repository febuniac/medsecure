const router = require('express').Router();
const ImageAttachmentService = require('../services/imageAttachmentService');
const { formatErrorResponse } = require('../utils/errorCodes');
const { StorageError } = require('../services/storageService');

const service = new ImageAttachmentService();

router.post('/record/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { file_data, mime_type, filename } = req.body;

    if (!file_data || !mime_type) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'file_data (base64) and mime_type are required',
        },
      });
    }

    const fileBuffer = Buffer.from(file_data, 'base64');
    const attachment = await service.upload(recordId, fileBuffer, mime_type, filename, req.user);
    res.status(201).json(attachment);
  } catch (err) {
    if (err instanceof StorageError) {
      return res.status(err.status).json({
        error: { code: err.code, message: err.message },
      });
    }
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get('/record/:recordId', async (req, res) => {
  try {
    const attachments = await service.getByRecord(req.params.recordId, req.user);
    res.json(attachments);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get('/:id/url', async (req, res) => {
  try {
    const result = await service.getPresignedUrl(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await service.delete(req.params.id, req.user);
    res.status(204).send();
  } catch (err) {
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

module.exports = router;
