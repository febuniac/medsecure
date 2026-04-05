const router = require('express').Router();
const ImageAttachmentService = require('../services/imageAttachmentService');

/**
 * POST /api/v1/image-attachments
 * Upload an image attachment for a medical record.
 * Expects JSON body with base64-encoded image data.
 */
router.post('/', async (req, res) => {
  try {
    const { record_id, patient_id, file_data, content_type, original_name } = req.body;

    if (!record_id || !patient_id || !file_data || !content_type) {
      return res.status(400).json({
        error: 'Missing required fields: record_id, patient_id, file_data, content_type'
      });
    }

    const fileBuffer = Buffer.from(file_data, 'base64');

    const attachment = await ImageAttachmentService.upload({
      recordId: record_id,
      patientId: patient_id,
      fileBuffer,
      contentType: content_type,
      originalName: original_name || 'unnamed',
      userId: req.user.id
    });

    res.status(201).json({
      id: attachment.id,
      record_id: attachment.record_id,
      patient_id: attachment.patient_id,
      storage_url: attachment.storage_url,
      content_type: attachment.content_type,
      file_size: attachment.file_size,
      original_name: attachment.original_name,
      created_at: attachment.created_at
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/image-attachments/record/:recordId
 * List all image attachments for a medical record.
 */
router.get('/record/:recordId', async (req, res) => {
  try {
    const attachments = await ImageAttachmentService.listByRecord(req.params.recordId);
    res.json(attachments);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/image-attachments/:id/download
 * Get a presigned URL to download an image attachment.
 */
router.get('/:id/download', async (req, res) => {
  try {
    const result = await ImageAttachmentService.getDownloadUrl(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/image-attachments/:id
 * Delete an image attachment.
 */
router.delete('/:id', async (req, res) => {
  try {
    await ImageAttachmentService.delete(req.params.id, req.user);
    res.status(204).send();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
